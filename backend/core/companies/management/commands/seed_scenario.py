"""
دادهٔ نمونه برای سناریوهای آزمایش (طرح مادر انتشار نسخهٔ اول، ق۱۴؛ طرح ۲.۱).

یک شرکت آزمایشی با یک پروژه و سه بخش (و یک شرکت دوم با یک بخش)، و برای هر نقشِ انتسابی که ماژول‌های
نصب‌شده اعلام کرده‌اند (section_role_choices) یک کاربر `qa_scn_<نقش>` می‌سازد. هسته نام هیچ نقش یا مجوزی را
نمی‌برد؛ سطح انتساب، مجوزها و تفاوت‌ها با گزینه‌ها داده می‌شوند. رمزها فقط در `scratch/qa_scenario_credentials.txt`
نوشته می‌شوند.

طرح ۲.۲ (بخش ۵):
- `--mixed ROLE_A,ROLE_B`: کاربر `qa_scn_mixed` با نقش اول در بخش یک، نقش دوم در بخش دو، و نقش دوم در بخش
  شرکت دوم؛ بخش سه بی‌انتساب می‌ماند (سناریوی ۱ و ۳).
- `--perm ROLE=CODES` و `--remove ROLE=CODES`: مجوز بخشی به‌شکل تفاوت «افزوده»/«برداشته» برای شرکت اول ثبت
  می‌شود (تیک مستقیم مجوز بخشی بی‌اثر است)، و مجوز سامانه‌ای افزوده تیک مستقیم می‌شود. نقش `mixed` هم پذیرفته است.
- `--bundle ROLE=+CODE,-CODE`: تفاوت بستهٔ نقش انتساب. بسته برای کل نصب است؛ `--purge` آن را برنمی‌گرداند
  (از صفحهٔ «نقش‌های انتساب» یا API بازگشت به پیش‌فرض).

فقط روی `app` و فقط برای سناریو: بدون متغیر محیطی WH_ALLOW_SCENARIO_SEED=1 اجرا نمی‌شود؛ هرگز روی `soft`
و هرگز برای سبز کردن نگهبان‌ها.

    WH_ALLOW_SCENARIO_SEED=1 python manage.py seed_scenario \
        --level treasury=company --level manager=project \
        --perm supervisor=can_act_as_workshop_supervisor,perm_approve_personnel_supervisor
    WH_ALLOW_SCENARIO_SEED=1 python manage.py seed_scenario --mixed accountant,employee \
        --level treasury=company --remove mixed=perm_invoice_record --bundle employee=-perm_invoice_record
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
COMPANY2_CODE = 'QA-SCN2'
MIXED = 'mixed'
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
                            help="کدهای مجوز (codename) که به کاربر آن نقش داده می‌شود (بخشی: تفاوت افزوده در شرکت اول)")
        parser.add_argument('--remove', action='append', metavar='ROLE=CODE1,CODE2',
                            help="مجوزهای بخشی که برای کاربر آن نقش در شرکت اول برداشته می‌شوند")
        parser.add_argument('--mixed', metavar='ROLE_A,ROLE_B',
                            help="کاربر qa_scn_mixed: نقش اول در بخش یک، نقش دوم در بخش دو و در بخش شرکت دوم")
        parser.add_argument('--bundle', action='append', metavar='ROLE=+CODE,-CODE',
                            help="تفاوت بستهٔ نقش انتساب (+ افزوده، - برداشته)")

    def handle(self, *args, **opts):
        if os.environ.get('WH_ALLOW_SCENARIO_SEED') != '1':
            raise CommandError("این دستور فقط روی محیط آزمایش اجرا می‌شود: WH_ALLOW_SCENARIO_SEED=1 را تنظیم کنید.")
        if opts['purge']:
            self._purge()
            return

        roles = {item[0]: item[1] for item in section_role_choices()}
        if not roles:
            raise CommandError("هیچ ماژولی نقش انتسابی اعلام نکرده است.")
        levels = _pairs(opts['level'], 'level')

        def code_lists(option):
            return {role: [c.strip() for c in codes.split(',') if c.strip()]
                    for role, codes in _pairs(opts[option], option).items()}

        perms, removes, bundles = code_lists('perm'), code_lists('remove'), code_lists('bundle')
        mixed = [r.strip() for r in (opts['mixed'] or '').split(',') if r.strip()]
        if opts['mixed'] and len(mixed) != 2:
            raise CommandError("--mixed باید دو نقش بگیرد: ROLE_A,ROLE_B")
        unknown = ((set(levels) | set(bundles) | set(mixed)) - set(roles)) | ((set(perms) | set(removes)) - set(roles) - {MIXED})
        if unknown:
            raise CommandError(f"نقش ناشناخته: {', '.join(sorted(unknown))}. نقش‌ها: {', '.join(roles)}")
        bad_levels = {lv for lv in levels.values() if lv not in LEVELS}
        if bad_levels:
            raise CommandError(f"سطح نامعتبر: {', '.join(bad_levels)}")

        with transaction.atomic():
            company, _ = Company.objects.get_or_create(code=COMPANY_CODE, defaults={'name': 'شرکت آزمایشی سناریو'})
            project, _ = Project.objects.get_or_create(company=company, code='QA-P1', defaults={'name': 'دفتر مرکزی'})
            section, _ = ProjectSection.objects.get_or_create(project=project, code='QA-S1', defaults={'name': 'بخش یک'})
            section2, _ = ProjectSection.objects.get_or_create(project=project, code='QA-S2', defaults={'name': 'بخش دو'})
            ProjectSection.objects.get_or_create(project=project, code='QA-S3', defaults={'name': 'بخش سه'})
            company2, _ = Company.objects.get_or_create(code=COMPANY2_CODE, defaults={'name': 'شرکت دوم سناریو'})
            project2, _ = Project.objects.get_or_create(company=company2, code='QA2-P1', defaults={'name': 'پروژهٔ شرکت دوم'})
            section_c2, _ = ProjectSection.objects.get_or_create(project=project2, code='QA2-S1', defaults={'name': 'بخش شرکت دوم'})
            targets = {'company': {'company': company}, 'project': {'project': project}, 'section': {'section': section}}

            for role, codes in bundles.items():
                self._set_bundle(role, codes)

            User = get_user_model()
            lines = []
            people = [(role, label, [(role, targets[levels.get(role, 'section')])], levels.get(role, 'section'))
                      for role, label in roles.items()]
            if mixed:
                people.append((MIXED, 'چندنقشی', [(mixed[0], {'section': section}), (mixed[1], {'section': section2}),
                                                  (mixed[1], {'section': section_c2})],
                               f'{mixed[0]}@QA-S1، {mixed[1]}@QA-S2، {mixed[1]}@QA2-S1'))
            for role, label, assignments, where in people:
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
                for assign_role, target in assignments:
                    SectionAssignment.objects.create(user=user, role=assign_role, **target)
                self._set_overrides(user, company, perms.get(role, []), removes.get(role, []))
                lines.append(f'{username}\t{password}\t{role}\t{where}')

        CREDENTIALS_FILE.parent.mkdir(parents=True, exist_ok=True)
        CREDENTIALS_FILE.write_text('\n'.join(lines) + '\n', encoding='utf-8')
        self.stdout.write(self.style.SUCCESS(
            f"شرکت {COMPANY_CODE} با {len(lines)} کاربر ساخته شد؛ رمزها در {CREDENTIALS_FILE}"))

    @staticmethod
    def _permissions(codes, role):
        found = {p.codename: p for p in Permission.objects.filter(
            content_type__app_label='accounts', codename__in=codes).select_related('content_type')}
        missing = set(codes) - set(found)
        if missing:
            raise CommandError(f"مجوز ناشناخته برای {role}: {', '.join(sorted(missing))}")
        return found

    def _set_overrides(self, user, company, adds, removes):
        """مجوز بخشی: تفاوت افزوده/برداشته برای شرکت اول؛ مجوز سامانه‌ای افزوده: تیک مستقیم (ت۴)."""
        from accounts.models import UserPermissionOverride
        from accounts.scoped_permissions import section_permission_codes
        UserPermissionOverride.objects.filter(user=user).delete()
        section_codes = section_permission_codes()
        found = self._permissions(set(adds) | set(removes), user.username)
        bad = [c for c in removes if c not in section_codes]
        if bad:
            raise CommandError(f"--remove فقط مجوز بخشی می‌پذیرد: {', '.join(bad)}")
        user.user_permissions.set([found[c] for c in adds if c not in section_codes])
        for mode, codes in (('add', [c for c in adds if c in section_codes]), ('remove', removes)):
            for code in codes:
                UserPermissionOverride.objects.create(user=user, permission=found[code], company=company, mode=mode)

    def _set_bundle(self, role, items):
        """تفاوت بستهٔ نقش انتساب: +کد افزوده، -کد برداشته (فقط مجوز بخشی)."""
        from accounts.models import RoleBundleOverride
        from accounts.scoped_permissions import section_permission_codes
        signed = [(item[0], item[1:].strip()) for item in items if item[:1] in '+-' and item[1:].strip()]
        if len(signed) != len(items):
            raise CommandError(f"--bundle {role}: هر کد باید با + یا - آغاز شود.")
        bad = [c for _, c in signed if c not in section_permission_codes()]
        if bad:
            raise CommandError(f"--bundle فقط مجوز بخشی می‌پذیرد: {', '.join(bad)}")
        found = self._permissions({c for _, c in signed}, role)
        for sign, code in signed:
            RoleBundleOverride.objects.update_or_create(
                role_key=role, permission=found[code], defaults={'mode': 'add' if sign == '+' else 'remove'})

    def _purge(self):
        User = get_user_model()
        with transaction.atomic():
            users = User.objects.filter(username__startswith=USER_PREFIX)
            count = users.count()
            SectionAssignment.objects.filter(user__in=users).delete()
            for code in (COMPANY_CODE, COMPANY2_CODE):
                company = Company.objects.filter(code=code).first()
                if company is not None:
                    ProjectSection.objects.filter(project__company=company).delete()
                    Project.objects.filter(company=company).delete()
                    company.delete()
            users.delete()
        if CREDENTIALS_FILE.exists():
            CREDENTIALS_FILE.unlink()
        self.stdout.write(self.style.SUCCESS(f"شرکت سناریو و {count} کاربر پاک شدند."))
