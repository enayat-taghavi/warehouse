"""
دادهٔ نمایشی فیلم‌های آموزشی (طرح فیلم‌های آموزشی، §۳.۴).

- `--admin`: فقط مدیر نمایشی `demo_admin` (مدیر کل سامانه؛ ساختن شرکت فقط با او ممکن است). فیلم‌های ۰ تا ۲
  شرکت و کاربرها را خودشان از راه صفحه‌ها می‌سازند.
- `--base`: مدیر نمایشی به‌اضافهٔ «شرکت نمایشی» (کد DEMO-VID) با یک پروژه و دو بخش، شش کاربر `demo_*` با
  نقش‌هایشان، دورهٔ مالی، حساب بانکی، گروه و سرفصل هزینه و طرف حساب (فیلم‌های ۳ تا ۱۰).
- `--purge`: فقط شرکت DEMO-VID (با همهٔ اسنادش) و کاربرهای `demo_*` را پاک می‌کند.

رمزها تصادفی‌اند و فقط در `scratch/video_demo_credentials.json` نوشته می‌شوند؛ هرگز چاپ نمی‌شوند.
فقط روی `app`: بدون WH_ALLOW_SCENARIO_SEED=1 اجرا نمی‌شود؛ هرگز روی `soft`.

    WH_ALLOW_SCENARIO_SEED=1 python manage.py seed_video_demo --purge
    WH_ALLOW_SCENARIO_SEED=1 python manage.py seed_video_demo --admin
    WH_ALLOW_SCENARIO_SEED=1 python manage.py seed_video_demo --base
"""
import json
import os
import secrets
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import ProtectedError, RestrictedError

from companies.models import Company, Project, ProjectSection, SectionAssignment, UserCompanyAccess

COMPANY_CODE = 'DEMO-VID'
ADMIN = 'demo_admin'
CREDENTIALS_FILE = Path(settings.BASE_DIR).parent / 'scratch' / 'video_demo_credentials.json'
# نام کاربری، نام، نام خانوادگی، نقش، سطح انتساب (section1، section2، project، company)
BASE_USERS = (
    ('demo_employee', 'مریم', 'کارمند', 'employee', 'section1'),
    ('demo_employee2', 'علی', 'کارمند دوم', 'employee', 'section1'),
    ('demo_supervisor', 'زهرا', 'سرپرست', 'supervisor', 'section1'),
    ('demo_accountant', 'رضا', 'حسابدار', 'accountant', 'project'),
    ('demo_manager', 'سارا', 'مدیر', 'manager', 'project'),
    ('demo_treasury', 'حسین', 'خزانه‌دار', 'treasury', 'company'),
)
DEMO_USERNAMES = (ADMIN, *(row[0] for row in BASE_USERS))
PURGE_ROUNDS = 25
OWNER_DEPTH = 4


def demo_sheba(seed='0170000000123456789012'):
    """شبای ساختگی با رقم کنترل درست (۲۲ رقم پس از IRkk)."""
    digits = ''.join(str(int(c, 36)) for c in f'{seed}IR00')
    return f'IR{98 - int(digits) % 97:02d}{seed}'


class Command(BaseCommand):
    help = "ساخت یا پاک کردن دادهٔ نمایشی فیلم‌های آموزشی (فقط روی app)"

    def add_arguments(self, parser):
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument('--admin', action='store_true', help="فقط مدیر نمایشی demo_admin")
        group.add_argument('--base', action='store_true', help="مدیر، شرکت نمایشی، کاربرها و تنظیمات پایهٔ حسابداری")
        group.add_argument('--purge', action='store_true', help="شرکت DEMO-VID و کاربرهای demo_* را پاک کن")

    def handle(self, *args, **opts):
        if os.environ.get('WH_ALLOW_SCENARIO_SEED') != '1':
            raise CommandError("این دستور فقط روی محیط آزمایش اجرا می‌شود: WH_ALLOW_SCENARIO_SEED=1 را تنظیم کنید.")
        if opts['purge']:
            self._purge()
            return
        credentials = self._read_credentials()
        with transaction.atomic():
            credentials[ADMIN] = self._user(ADMIN, 'مدیر', 'نمایشی', superuser=True)
            if opts['base']:
                credentials.update(self._base())
        self._write_credentials(credentials)
        self.stdout.write(self.style.SUCCESS(
            f"دادهٔ نمایشی ساخته شد ({len(credentials)} کاربر)؛ رمزها در {CREDENTIALS_FILE}"))

    # ─── ساختن ───
    @staticmethod
    def _user(username, first_name, last_name, superuser=False):
        password = secrets.token_urlsafe(12)
        user, _ = get_user_model().objects.get_or_create(username=username)
        user.first_name = first_name
        user.last_name = last_name
        user.is_active = True
        user.is_superuser = superuser
        user.is_staff = superuser
        if hasattr(user, 'requires_password_change'):
            user.requires_password_change = False
        user.set_password(password)
        user.save()
        return password

    def _base(self):
        from personnel.models import CompanyBankAccount, CompanyFiscalPeriod, Counterparty, ExpenseHead

        company, _ = Company.objects.get_or_create(code=COMPANY_CODE, defaults={'name': 'شرکت نمایشی'})
        project, _ = Project.objects.get_or_create(company=company, code='DEMO-P1', defaults={'name': 'دفتر مرکزی'})
        section1, _ = ProjectSection.objects.get_or_create(project=project, code='DEMO-S1', defaults={'name': 'بخش اداری'})
        section2, _ = ProjectSection.objects.get_or_create(project=project, code='DEMO-S2', defaults={'name': 'بخش فنی'})
        targets = {'section1': {'section': section1}, 'section2': {'section': section2},
                   'project': {'project': project}, 'company': {'company': company}}

        credentials = {}
        for username, first_name, last_name, role, level in BASE_USERS:
            credentials[username] = self._user(username, first_name, last_name)
            user = get_user_model().objects.get(username=username)
            UserCompanyAccess.objects.get_or_create(user=user, company=company, defaults={'is_default': True})
            SectionAssignment.objects.filter(user=user).delete()
            SectionAssignment.objects.create(user=user, role=role, **targets[level])

        CompanyFiscalPeriod.objects.get_or_create(
            company=company, fiscal_year='1405',
            defaults={'title': 'سال مالی ۱۴۰۵', 'start_date': '1405/01/01', 'end_date': '1405/12/29'})
        if not CompanyBankAccount.objects.filter(company=company).exists():
            CompanyBankAccount.objects.create(
                company=company, bank_name='بانک ملت', account_number='1234567890', sheba_number=demo_sheba(),
                account_title='حساب جاری اصلی', opening_balance=500_000_000, opening_balance_date='1405/01/01')
        # فهرست پیش‌فرض سرفصل‌ها را سیگنال ساخت شرکت می‌سازد؛ یک گروه نمایشی هم کنارش
        group, _ = ExpenseHead.objects.get_or_create(company=company, code='50', defaults={'title': 'هزینه‌های آموزشی'})
        ExpenseHead.objects.get_or_create(company=company, code='5001',
                                          defaults={'title': 'دوره‌های آموزشی', 'parent': group})
        if not Counterparty.objects.filter(party__company=company).exists():
            Counterparty.objects.create(company=company, name='فروشگاه لوازم اداری نمونه', counterparty_type='other',
                                        phone='02188000000')
        return credentials

    # ─── رمزها ───
    @staticmethod
    def _read_credentials():
        if CREDENTIALS_FILE.exists():
            try:
                return json.loads(CREDENTIALS_FILE.read_text(encoding='utf-8'))
            except (OSError, ValueError) as exc:
                raise CommandError(f"فایل رمزهای نمایشی خوانده نشد؛ آن را بررسی یا پاک کنید: {CREDENTIALS_FILE}") from exc
        return {}

    @staticmethod
    def _write_credentials(credentials):
        CREDENTIALS_FILE.parent.mkdir(parents=True, exist_ok=True)
        temp = CREDENTIALS_FILE.with_name(CREDENTIALS_FILE.name + '.tmp')
        temp.write_text(json.dumps(credentials, ensure_ascii=False, indent=2), encoding='utf-8')
        temp.replace(CREDENTIALS_FILE)

    # ─── پاک کردن ───
    def _purge(self):
        User = get_user_model()
        # فقط نام‌های دقیقی که همین دستور می‌سازد، نه هر کاربری با پیشوند demo_
        users = User.objects.filter(username__in=DEMO_USERNAMES)
        with transaction.atomic():
            company = Company.objects.filter(code=COMPANY_CODE).first()
            if company is not None:
                self._delete_company(company)
            count = users.count()
            try:
                users.delete()
            except (ProtectedError, RestrictedError) as exc:
                blockers = sorted({f'{o._meta.label}#{o.pk}' for o in self._blockers(exc)})[:10]
                raise CommandError(f"کاربرهای demo_* داده‌ای بیرون از شرکت نمایشی دارند؛ پاک نشد: {', '.join(blockers)}")
        if CREDENTIALS_FILE.exists():
            CREDENTIALS_FILE.unlink()
        self.stdout.write(self.style.SUCCESS(f"شرکت {COMPANY_CODE} و {count} کاربر نمایشی پاک شدند."))

    @staticmethod
    def _blockers(exc):
        return getattr(exc, 'protected_objects', None) or getattr(exc, 'restricted_objects', None) or ()

    @staticmethod
    def _owner_companies(obj, depth=OWNER_DEPTH, seen=None):
        """
        شناسهٔ شرکت‌هایی که ردیف با دنبال کردن کلیدهای خارجی‌اش (جز کاربر) به آن‌ها می‌رسد، تا عمق محدود؛
        مثلاً سند → بخش → پروژه → شرکت. کلید خالی نادیده گرفته می‌شود.
        """
        User = get_user_model()
        if isinstance(obj, Company):
            return {obj.pk}
        seen = set() if seen is None else seen
        key = (obj._meta.label, obj.pk)
        if depth <= 0 or key in seen:
            return set()
        seen.add(key)
        found = set()
        for field in obj._meta.concrete_fields:
            if not field.is_relation or field.related_model is None or issubclass(field.related_model, User):
                continue
            if getattr(obj, field.attname, None) is None:
                continue
            if field.related_model is Company:
                found.add(getattr(obj, field.attname))
                continue
            target = getattr(obj, field.name, None)
            if target is not None:
                found |= Command._owner_companies(target, depth - 1, seen)
        return found

    def _delete_blocker(self, obj, demo_id):
        """
        ردیفی که حذف را با PROTECT/RESTRICT بسته فقط وقتی پاک می‌شود که از راه کلیدهایش تنها به شرکت نمایشی
        برسد؛ کاربر، شرکت دیگر یا ردیف بی‌صاحب کل کار را برمی‌گرداند (اتمیک بیرونی).
        """
        if isinstance(obj, (get_user_model(), Company)) or self._owner_companies(obj) != {demo_id}:
            raise CommandError(
                f"حذف شرکت نمایشی به دادهٔ بیرون از آن می‌رسد ({obj._meta.label}#{obj.pk})؛ چیزی پاک نشد.")
        self._delete_tree(obj, demo_id)

    def _delete_tree(self, obj, demo_id):
        for _ in range(PURGE_ROUNDS):
            try:
                with transaction.atomic():
                    obj.delete()
                return
            except (ProtectedError, RestrictedError) as exc:
                blockers = list(self._blockers(exc))
                if not blockers:
                    raise CommandError("حذف شرکت نمایشی بسته ماند؛ چیزی پاک نشد.") from exc
                for blocker in blockers:
                    self._delete_blocker(blocker, demo_id)
        raise CommandError("حذف شرکت نمایشی پس از چند دور تمام نشد؛ چیزی پاک نشد.")

    def _delete_company(self, company):
        """حذف شرکت نمایشی با همهٔ اسنادش؛ بازدارنده‌ها فقط اگر از آن همین شرکت باشند پاک می‌شوند."""
        self._delete_tree(company, company.pk)
