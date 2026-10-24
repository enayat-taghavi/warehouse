"""
دادهٔ نمونهٔ سناریوهای گردش فاکتور (طرح ۲.۳، کار ۶) روی شرکت آزمایشی `seed_scenario` (QA-SCN).

اول `seed_scenario` (یک کاربر برای هر نقش در بخش یک) اجرا می‌شود، بعد این‌ها افزوده می‌شوند:
- بخش یک (QA-S1): همان کاربران پایه، پس بخشی با یک حسابدار است؛ مدیر دوم `qa_scn_manager2` در سطح شرکت،
  پس بخش یک دو مدیر دارد و فاکتور مدیر به مدیر دیگر می‌رسد.
- بخش دو (QA-S2): بی‌سرپرست، با `qa_scn_employee2` و دو حسابدار `qa_scn_accountant2` و `qa_scn_accountant3`؛
  مدیر فقط `qa_scn_manager2` است، پس فاکتور او «بدون تأیید دوم» از مرحلهٔ مدیر می‌گذرد.
- جانشین فعال: `qa_scn_accountant2` به جای `qa_scn_accountant` از امروز تا هفت روز بعد.
- سقف نمونه: ۵۰ میلیون ریال برای مرحلهٔ تأیید مدیر در شرکت QA-SCN.

فقط ردیف می‌سازد یا به‌روز می‌کند و فقط با WH_ALLOW_SCENARIO_SEED=1 (فقط `app`؛ هرگز `soft`). رمزهای کاربران
افزوده به انتهای همان فایل رمزهای `seed_scenario` نوشته می‌شوند. `--purge` جانشینی و سقف را پاک می‌کند و
بعد `seed_scenario --purge` را اجرا می‌کند.

    WH_ALLOW_SCENARIO_SEED=1 python manage.py seed_workflow_scenario
    WH_ALLOW_SCENARIO_SEED=1 python manage.py seed_workflow_scenario --purge
"""
import datetime
import os
import secrets
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from companies.management.commands.seed_scenario import COMPANY_CODE, CREDENTIALS_FILE, USER_PREFIX
from companies.models import Company, ProjectSection, SectionAssignment, UserCompanyAccess
from personnel.workflows import INVOICE_WORKFLOW
from workflow.models import WorkflowSubstitute, WorkflowThreshold

THRESHOLD_STEP = 'manager_ok'
THRESHOLD_AMOUNT = Decimal('50000000')
# (نام کاربری بی‌پیشوند، نقش، برچسب، هدف انتساب)
EXTRA_USERS = (
    ('manager2', 'manager', 'مدیر دوم', 'company'),
    ('employee2', 'employee', 'کارمند بخش بی‌سرپرست', 'QA-S2'),
    ('accountant2', 'accountant', 'حسابدار دوم بخش دو', 'QA-S2'),
    ('accountant3', 'accountant', 'حسابدار سوم بخش دو', 'QA-S2'),
)


class Command(BaseCommand):
    help = "دادهٔ نمونهٔ سناریوهای گردش فاکتور روی شرکت آزمایشی سناریو (فقط روی app)"

    def add_arguments(self, parser):
        parser.add_argument('--purge', action='store_true', help="جانشینی، سقف، شرکت و کاربران سناریو را پاک کن")

    def handle(self, *args, **opts):
        if os.environ.get('WH_ALLOW_SCENARIO_SEED') != '1':
            raise CommandError("این دستور فقط روی محیط آزمایش اجرا می‌شود: WH_ALLOW_SCENARIO_SEED=1 را تنظیم کنید.")
        User = get_user_model()
        if opts['purge']:
            company = Company.objects.filter(code=COMPANY_CODE).first()
            with transaction.atomic():
                WorkflowSubstitute.objects.filter(principal__username__startswith=USER_PREFIX).delete()
                if company is not None:
                    WorkflowThreshold.objects.filter(company=company).delete()
            call_command('seed_scenario', purge=True, stdout=self.stdout)
            return

        call_command('seed_scenario', stdout=self.stdout)
        company = Company.objects.get(code=COMPANY_CODE)
        sections = {s.code: s for s in ProjectSection.objects.filter(project__company=company)}
        lines = []
        with transaction.atomic():
            for name, role, label, where in EXTRA_USERS:
                user, _ = User.objects.get_or_create(username=f'{USER_PREFIX}{name}')
                password = secrets.token_urlsafe(12)
                user.first_name = 'سناریو'
                user.last_name = label
                user.is_active = True
                user.requires_password_change = False
                user.set_password(password)
                user.save()
                UserCompanyAccess.objects.get_or_create(user=user, company=company, defaults={'is_default': True})
                SectionAssignment.objects.filter(user=user).delete()
                target = {'company': company} if where == 'company' else {'section': sections[where]}
                SectionAssignment.objects.create(user=user, role=role, **target)
                lines.append(f'{user.username}\t{password}\t{role}\t{where}')

            # بخش دو بی‌سرپرست می‌ماند (seed_scenario نقش‌ها را فقط در بخش یک می‌گذارد)
            if SectionAssignment.objects.filter(section=sections['QA-S2'], role='supervisor', is_active=True).exists():
                raise CommandError("بخش QA-S2 باید بی‌سرپرست باشد.")

            principal = User.objects.get(username=f'{USER_PREFIX}accountant')
            substitute = User.objects.get(username=f'{USER_PREFIX}accountant2')
            today = timezone.localdate()
            for old in WorkflowSubstitute.objects.filter(principal=principal, revoked_at__isnull=True):
                old.revoked_at = timezone.now()
                old.save()
            row = WorkflowSubstitute(principal=principal, substitute=substitute, company=company, start_date=today,
                                     end_date=today + datetime.timedelta(days=7))
            row.save()  # save() تا قلاب محاسبهٔ دوبارهٔ کارهای باز اجرا شود

            WorkflowThreshold.objects.update_or_create(
                workflow_key=INVOICE_WORKFLOW, step_key=THRESHOLD_STEP, company=company, section=None,
                defaults={'amount': THRESHOLD_AMOUNT})

        with CREDENTIALS_FILE.open('a', encoding='utf-8') as fh:
            fh.write('\n'.join(lines) + '\n')
        self.stdout.write(self.style.SUCCESS(
            f"سناریوی گردش فاکتور: {len(lines)} کاربر افزوده، جانشین فعال و سقف {THRESHOLD_AMOUNT} ریال؛ "
            f"رمزها در {CREDENTIALS_FILE}"))
