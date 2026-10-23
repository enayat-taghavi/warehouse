"""
دادهٔ نمونه برای سناریوهای آزمایش (طرح مادر انتشار نسخهٔ اول، ق۱۴؛ طرح ۲.۱).

یک شرکت آزمایشی با یک پروژه و دو بخش، و برای هر نقشِ انتسابی که ماژول‌های نصب‌شده اعلام کرده‌اند
(section_role_choices) یک کاربر `qa_scn_<نقش>` می‌سازد. هسته نام هیچ نقشی را نمی‌برد؛ سطح انتساب و مجوزهای هر
نقش با گزینه‌ها داده می‌شود. رمزها فقط در `scratch/qa_scenario_credentials.txt` نوشته می‌شوند.

فقط روی `app` و فقط برای سناریو: بدون متغیر محیطی WH_ALLOW_SCENARIO_SEED=1 اجرا نمی‌شود؛ هرگز روی `soft`
و هرگز برای سبز کردن نگهبان‌ها.

    WH_ALLOW_SCENARIO_SEED=1 python manage.py seed_scenario \
        --level treasury=company --level manager=project \
        --perm supervisor=can_act_as_workshop_supervisor,perm_approve_personnel_supervisor
    WH_ALLOW_SCENARIO_SEED=1 python manage.py seed_scenario --purge
"""
import os
import secrets
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from companies.models import Company, Project, ProjectSection, SectionAssignment, UserCompanyAccess, section_role_choices

COMPANY_CODE = 'QA-SCN'
USER_PREFIX = 'qa_scn_'
LEVELS = ('company', 'project', 'section')
CREDENTIALS_FILE = Path(settings.BASE_DIR).parent / 'scratch' / 'qa_scenario_credentials.txt'


def _pairs(values, option):
    result = {}
    for raw in values or []:
        key, sep, val = raw.partition('=')
        if not sep or not key.strip() or not val.strip():
            raise CommandError(f"مقدار --{option} باید به شکل نقش=مقدار باشد: {raw}")
        result[key.strip()] = val.strip()
    return result


class Command(BaseCommand):
    help = "ساخت یا پاک کردن شرکت آزمایشی سناریو با یک کاربر برای هر نقش (فقط روی app)"

    def add_arguments(self, parser):
        parser.add_argument('--purge', action='store_true', help="شرکت و کاربران سناریو را پاک کن")
        parser.add_argument('--level', action='append', metavar='ROLE=LEVEL',
                            help="سطح انتساب نقش: company، project یا section (پیش‌فرض section روی بخش اول)")
        parser.add_argument('--perm', action='append', metavar='ROLE=CODE1,CODE2',
                            help="کدهای مجوز (codename) که به کاربر آن نقش داده می‌شود")

    def handle(self, *args, **opts):
        if os.environ.get('WH_ALLOW_SCENARIO_SEED') != '1':
            raise CommandError("این دستور فقط روی محیط آزمایش اجرا می‌شود: WH_ALLOW_SCENARIO_SEED=1 را تنظیم کنید.")
        if opts['purge']:
            self._purge()
            return

        roles = dict(section_role_choices())
        if not roles:
            raise CommandError("هیچ ماژولی نقش انتسابی اعلام نکرده است.")
        levels = _pairs(opts['level'], 'level')
        perms = {role: [c.strip() for c in codes.split(',') if c.strip()]
                 for role, codes in _pairs(opts['perm'], 'perm').items()}
        unknown = (set(levels) | set(perms)) - set(roles)
        if unknown:
            raise CommandError(f"نقش ناشناخته: {', '.join(sorted(unknown))}. نقش‌ها: {', '.join(roles)}")
        bad_levels = {lv for lv in levels.values() if lv not in LEVELS}
        if bad_levels:
            raise CommandError(f"سطح نامعتبر: {', '.join(bad_levels)}")

        with transaction.atomic():
            company, _ = Company.objects.get_or_create(code=COMPANY_CODE, defaults={'name': 'شرکت آزمایشی سناریو'})
            project, _ = Project.objects.get_or_create(company=company, code='QA-P1', defaults={'name': 'دفتر مرکزی'})
            section, _ = ProjectSection.objects.get_or_create(project=project, code='QA-S1', defaults={'name': 'بخش یک'})
            ProjectSection.objects.get_or_create(project=project, code='QA-S2', defaults={'name': 'بخش دو'})
            targets = {'company': {'company': company}, 'project': {'project': project}, 'section': {'section': section}}

            User = get_user_model()
            lines = []
            for role, label in roles.items():
                username = f'{USER_PREFIX}{role}'
                password = secrets.token_urlsafe(12)
                user, _ = User.objects.get_or_create(username=username)
                user.first_name = 'سناریو'
                user.last_name = label
                user.is_active = True
                user.requires_password_change = False
                user.set_password(password)
                user.save()
                UserCompanyAccess.objects.get_or_create(user=user, company=company, defaults={'is_default': True})
                SectionAssignment.objects.filter(user=user).delete()
                SectionAssignment.objects.create(user=user, role=role, **targets[levels.get(role, 'section')])
                codes = perms.get(role, [])
                if codes:
                    found = list(Permission.objects.filter(codename__in=codes))
                    missing = set(codes) - {p.codename for p in found}
                    if missing:
                        raise CommandError(f"مجوز ناشناخته برای {role}: {', '.join(sorted(missing))}")
                    user.user_permissions.set(found)
                lines.append(f'{username}\t{password}\t{role}\t{levels.get(role, "section")}')

        CREDENTIALS_FILE.parent.mkdir(parents=True, exist_ok=True)
        CREDENTIALS_FILE.write_text('\n'.join(lines) + '\n', encoding='utf-8')
        self.stdout.write(self.style.SUCCESS(
            f"شرکت {COMPANY_CODE} با {len(lines)} کاربر ساخته شد؛ رمزها در {CREDENTIALS_FILE}"))

    def _purge(self):
        User = get_user_model()
        with transaction.atomic():
            users = User.objects.filter(username__startswith=USER_PREFIX)
            count = users.count()
            company = Company.objects.filter(code=COMPANY_CODE).first()
            if company is not None:
                SectionAssignment.objects.filter(user__in=users).delete()
                ProjectSection.objects.filter(project__company=company).delete()
                Project.objects.filter(company=company).delete()
                company.delete()
            users.delete()
        if CREDENTIALS_FILE.exists():
            CREDENTIALS_FILE.unlink()
        self.stdout.write(self.style.SUCCESS(f"شرکت سناریو و {count} کاربر پاک شدند."))
