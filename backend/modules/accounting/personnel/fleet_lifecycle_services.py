import logging
from platform_core.registry import permission_alias
import re
import jdatetime
from decimal import Decimal
from django.db.models import Q
from common.date_utils import normalize_digits
from common.validators import (
    validate_iranian_national_code,
    validate_iranian_mobile,
)
from personnel.sheba_utils import clean_sheba, validate_sheba
from personnel.lifecycle_services import (
    parse_shamsi_date,
    normalize_shamsi_date,
    user_has_any_perm,
    _diff_repr,
    compute_profile_diff,
    _workflow_recipient_ids,
)

logger = logging.getLogger(__name__)


def is_valid_national_plate(plate_str) -> bool:
    """
    تسک ۱۱.۴ و ن-۴: اعتبارسنجی انطباق ساختار پلاک ملی ایران برای خودروهای جاده‌ای (ROAD_VEHICLE_TYPES).
    قالب: ۲ رقم، ۱ حرف فارسی (یا الف)، ۳ رقم، ایران، ۲ رقم (کد شهر/منطقه).
    مثال: 12 ب 345 ایران 67 یا 12-ب-345-67 یا 12الف345ایران67
    """
    if not plate_str:
        return False
    norm = normalize_digits(str(plate_str)).strip()
    match = re.match(r'^(\d{2})[-_\s]*(الف|[\u0600-\u06FF])[-_\s]*(\d{3})[-_\s]*(?:ایران|-)?[-_\s]*(\d{2})$', norm)
    if not match:
        return False
    p1, letter, p3, p4 = match.groups()
    if p1 == '00' or p3 == '000' or p4 == '00':
        return False
    return True


def normalize_plate(plate_str):
    if not plate_str:
        return ''
    norm = normalize_digits(str(plate_str)).strip()
    match = re.match(r'^(\d{2})[-_\s]*(الف|[\u0600-\u06FF])[-_\s]*(\d{3})[-_\s]*(?:ایران|-)?[-_\s]*(\d{2})$', norm)
    if match:
        p1, letter, p3, p4 = match.groups()
        return f"{p1} {letter} {p3} ایران {p4}"
    return re.sub(r'\s+', ' ', norm).strip()

ROAD_VEHICLE_TYPES = ('pickup', 'nissan', 'khavar', 'sedan', 'truck', 'trailer')

# مدیرِ تاییدکنندهٔ ماژول‌های دیگر (مثلاً نقش سازگاری مدیر) از alias اعلام‌شده می‌آید؛ کد مجوز ماژول دیگر اینجا نیست
MANAGER_APPROVER = permission_alias('manager_approver')

FLEET_SUPERVISOR_STAGE_PERMS = (
    'perm_approve_fleet_supervisor', 'perm_approve_fleet_manager', MANAGER_APPROVER,
)
FLEET_FINANCE_STAGE_PERMS = ('perm_approve_fleet_finance',)
FLEET_MANAGER_STAGE_PERMS = ('perm_approve_fleet_manager', MANAGER_APPROVER)
FLEET_DELETE_NOMOVEMENT_PERM = 'perm_delete_vehicle_nomovement'

FLEET_WORKFLOW_STAGE_PERMS = {
    'pending_supervisor': ('perm_approve_fleet_supervisor',),
    'pending_accountant': ('perm_approve_fleet_finance',),
    'pending_manager': ('perm_approve_fleet_manager', MANAGER_APPROVER),
    'change_request_created': ('perm_approve_fleet_supervisor',),
    'change_request_supervisor_approved': ('perm_approve_fleet_finance',),
    'change_request_finance_approved': ('perm_approve_fleet_manager', MANAGER_APPROVER),
}

FLEET_RATE_FIELDS = ('default_service_rate',)

BANK_ACCOUNT_LOCKED_STATUSES = (
    'pending_manager', 'accountant_approved', 'manager_approved',
    'approved', 'ready_to_pay', 'paid'
)

FLEET_FIELD_LABELS = {
    'plate_number': 'شماره پلاک معتبر',
    'vehicle_type': 'نوع خودرو',
    'ownership_type': 'نوع مالکیت',
    'section': 'بخش/دپارتمان پروژه',
    'driver_name': 'نام راننده',
    'driver_phone': 'شماره همراه راننده (09...)',
    'driver_national_code': 'کد ملی معتبر راننده',
    'insurance_expiry_date': 'تاریخ انقضای بیمه‌نامه شخص ثالث',
    'inspection_expiry_date': 'تاریخ انقضای معاینه فنی',
    'license_expiry_date': 'تاریخ انقضای گواهینامه راننده',
    'valid_until_date': 'تاریخ اعتبار پرونده/قرارداد',
    'end_date': 'تاریخ پایان همکاری',
    'owner_name': 'نام مالک خودرو',
    'owner_national_code': 'کد ملی معتبر مالک خودرو',
    'owner_phone': 'شماره همراه مالک خودرو',
    'default_service_rate': 'نرخ پایه سرویس (ریال)',
    'primary_bank_account': 'حساب بانکی اصلی با شبای معتبر (Mod 97)',
}


from rest_framework.exceptions import APIException


class VehicleWorkflowError(APIException):
    """خطای ساختاریافته گردش کار ناوگان برای تبدیل به پاسخ HTTP مناسب در DRF"""
    status_code = 400
    default_detail = 'خطای گردش کار ناوگان'
    default_code = 'workflow_error'

    def __init__(self, message, status_code=400, missing_fields=None, code=None, errors=None):
        super().__init__(detail=message, code=code)
        self.message = message
        self.status_code = status_code
        self.missing_fields = missing_fields or []
        self.code = code
        self.errors = errors
        self.detail = self.to_response_data()

    def to_response_data(self) -> dict:
        data = {'error': self.message}
        if self.missing_fields:
            data['missing_fields'] = self.missing_fields
            data['detail'] = f"فیلدهای ناقص: {', '.join(m['label'] for m in self.missing_fields)}"
        if self.errors:
            data['errors'] = self.errors
        if self.code:
            data['code'] = self.code
        return data


def _clean_shamsi_date_str(val) -> str:
    if not val:
        return ''
    cleaned = normalize_digits(str(val)).strip().replace('-', '/')
    digits = ''.join(c for c in cleaned if c.isdigit())
    if len(digits) == 8 and '/' not in cleaned:
        cleaned = f"{digits[:4]}/{digits[4:6]}/{digits[6:8]}"
    return cleaned


def validate_vehicle_validity(vehicle, date_shamsi: str) -> tuple[bool, str]:
    """
    تسک ۲.۱ و ب-۲۰: اعتبارسنجی کامل امکان ثبت تردد برای خودرو بر مبنای:
    ۱. تایید نهایی مدیر (approved)
    ۲. فعال بودن (is_active)
    ۳. پایان همکاری (end_date: تردد تا همان روز مجاز است)
    ۴. انقضای بیمه‌نامه شخص ثالث (insurance_expiry_date)
    ۵. انقضای معاینه فنی (inspection_expiry_date)
    ۶. انقضای گواهینامه راننده در صورت پر بودن (license_expiry_date - مصوبه ت-۳)
    ۷. انقضای قرارداد/اعتبار پرونده (valid_until_date)
    مقایسه منحصراً با شیء تاریخ (parse_shamsi_date، DEF-20)، نه رشته.
    """
    if not vehicle:
        return False, 'اطلاعات خودرو یافت نشد.'

    # ۱. وضعیت تصویب
    if getattr(vehicle, 'approval_status', '') != 'approved':
        status_display = vehicle.get_approval_status_display() if hasattr(vehicle, 'get_approval_status_display') else vehicle.approval_status
        return False, (
            f"ثبت کارکرد برای خودروی «{vehicle.driver_name}» ({vehicle.plate_number}) مجاز نیست "
            f"زیرا پرونده آن در وضعیت «{status_display}» بوده و هنوز به تصویب نهایی مدیر نرسیده است."
        )

    clean_target = _clean_shamsi_date_str(date_shamsi)
    target_d = parse_shamsi_date(clean_target)
    if target_d is None:
        return False, f"تاریخ تردد «{date_shamsi}» معتبر نمی‌باشد."

    # ۲. پایان همکاری و فعال بودن
    end_date_raw = getattr(vehicle, 'end_date', None)
    if end_date_raw:
        end_d = parse_shamsi_date(_clean_shamsi_date_str(end_date_raw))
        if end_d and target_d > end_d:
            return False, (
                f"همکاری خودرو «{vehicle.plate_number}» در تاریخ {end_date_raw} پایان یافته "
                f"و ثبت تردد برای تاریخ {clean_target} مجاز نمی‌باشد."
            )
    elif not getattr(vehicle, 'is_active', True):
        return False, f"ثبت کارکرد برای خودروی غیرفعال «{vehicle.driver_name}» ({vehicle.plate_number}) مجاز نیست."

    # ۳. انقضای بیمه‌نامه
    ins_raw = getattr(vehicle, 'insurance_expiry_date', None)
    if ins_raw:
        ins_d = parse_shamsi_date(_clean_shamsi_date_str(ins_raw))
        if ins_d and ins_d < target_d:
            return False, (
                f"بیمه‌نامه شخص ثالث خودرو «{vehicle.plate_number}» در تاریخ {ins_raw} منقضی شده "
                f"و ثبت تردد در تاریخ {clean_target} مجاز نمی‌باشد."
            )

    # ۴. انقضای معاینه فنی
    insp_raw = getattr(vehicle, 'inspection_expiry_date', None)
    if insp_raw:
        insp_d = parse_shamsi_date(_clean_shamsi_date_str(insp_raw))
        if insp_d and insp_d < target_d:
            return False, (
                f"معاینه فنی خودرو «{vehicle.plate_number}» در تاریخ {insp_raw} منقضی شده "
                f"و ثبت تردد در تاریخ {clean_target} مجاز نمی‌باشد."
            )

    # ۵. انقضای گواهینامه راننده (فقط در صورت پر بودن)
    lic_raw = getattr(vehicle, 'license_expiry_date', None)
    if lic_raw:
        lic_d = parse_shamsi_date(_clean_shamsi_date_str(lic_raw))
        if lic_d and lic_d < target_d:
            return False, (
                f"گواهینامه راننده خودرو «{vehicle.plate_number}» در تاریخ {lic_raw} منقضی شده "
                f"و ثبت تردد در تاریخ {clean_target} مجاز نمی‌باشد."
            )

    # ۶. انقضای اعتبار پرونده / قرارداد
    val_raw = getattr(vehicle, 'valid_until_date', None)
    if val_raw:
        val_d = parse_shamsi_date(_clean_shamsi_date_str(val_raw))
        if val_d and val_d < target_d:
            return False, (
                f"اعتبار پرونده خودرو «{vehicle.plate_number}» در تاریخ {val_raw} به پایان رسیده "
                f"و ثبت تردد در تاریخ {clean_target} مجاز نمی‌باشد."
            )

    return True, ""


def assert_vehicle_trip_allowed(vehicle, date_shamsi: str):
    """
    اعتبارسنجی قطعی ثبت تردد؛ در صورت عدم جواز، VehicleWorkflowError با کد ۴۰۰ پرتاب می‌کند.
    """
    is_valid, err_msg = validate_vehicle_validity(vehicle, date_shamsi)
    if not is_valid:
        raise VehicleWorkflowError(err_msg, status_code=400, code='trip_not_allowed')


def check_vehicle_history(vehicle) -> dict:
    """
    تسک ۲.۳ و ب-۲۱: استعلام جامع سوابق خودرو پیش از حذف فیزیکی یا Purge:
    ۱. همه رکوردهای VehicleTripLog (اعم از فعال یا حذف‌نرم)
    ۲. رکوردهای تسویه‌شده (is_settled=True)
    ۳. درخواست‌های تغییرات پرونده (VehicleChangeRequest)
    ۴. رویدادهای مالی دفتر کل (AccountingEvent با source_model خودرو یا شناسه‌های تردد آن)
    ۵. حساب کاربری فعال متصل به راننده
    """
    from personnel.models import VehicleTripLog, VehicleChangeRequest, AccountingEvent

    veh_id = vehicle.id
    all_trips = VehicleTripLog.objects.filter(vehicle_id=veh_id)
    total_trips_count = all_trips.count()
    settled_trips_count = all_trips.filter(is_settled=True).count()
    trip_ids = list(all_trips.values_list('id', flat=True))

    change_requests_count = VehicleChangeRequest.objects.filter(vehicle_id=veh_id).count()

    acc_events_q = Q(source_model='VehicleDriverProfile', source_id=str(veh_id))
    if trip_ids:
        acc_events_q |= Q(source_model='VehicleTripLog', source_id__in=[str(tid) for tid in trip_ids])
    accounting_events_count = AccountingEvent.objects.filter(acc_events_q).count()

    has_user_account = bool(vehicle.user_id)

    reasons = []
    if total_trips_count > 0:
        if settled_trips_count > 0:
            reasons.append(f"{total_trips_count} رکورد تردد در سامانه (شامل {settled_trips_count} تردد تسویه‌شده مالی)")
        else:
            reasons.append(f"{total_trips_count} رکورد تردد و کارکرد ثبت‌شده در سامانه")
    if accounting_events_count > 0:
        reasons.append(f"{accounting_events_count} سند یا رویداد مالی ثبت‌شده در دفتر کل")
    if change_requests_count > 0:
        reasons.append(f"{change_requests_count} درخواست تغییرات در گردش کار ناوگان")
    if has_user_account:
        reasons.append("حساب کاربری فعال متصل به راننده در سیستم")

    has_history = len(reasons) > 0
    return {
        'has_history': has_history,
        'can_delete': not has_history,
        'reasons': reasons,
        'details': {
            'total_trips_count': total_trips_count,
            'settled_trips_count': settled_trips_count,
            'accounting_events_count': accounting_events_count,
            'change_requests_count': change_requests_count,
            'has_user_account': has_user_account,
        }
    }


def _snapshot_value(value):
    import datetime
    from django.db.models.fields.files import FieldFile

    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    if isinstance(value, FieldFile):
        return value.name or None
    return str(value)


def build_vehicle_snapshot(vehicle) -> dict:
    """
    تسک ۲.۴: عکسبرداری کامل از پرونده خودرو پیش از حذف یا Purge:
    کلیه فیلدهای جدول خودرو، کلیه حساب‌های بانکی، و فهرست مدارک بارگذاری‌شده (نام و مسیر فایل).
    """
    profile = {f.attname: _snapshot_value(getattr(vehicle, f.attname)) for f in vehicle._meta.concrete_fields}
    bank_accounts = [
        {f.attname: _snapshot_value(getattr(acc, f.attname)) for f in acc._meta.concrete_fields}
        for acc in vehicle.bank_accounts.all().order_by('id')
    ]
    documents = []
    for doc in vehicle.documents.all().select_related('uploaded_by').order_by('id'):
        documents.append({
            'id': doc.id,
            'doc_type': doc.doc_type,
            'file': doc.file.name if doc.file else None,
            'title': doc.title,
            'issue_date': doc.issue_date,
            'expiry_date': doc.expiry_date,
            'uploaded_by_id': doc.uploaded_by_id,
            'uploaded_by_username': doc.uploaded_by.username if doc.uploaded_by else None,
            'created_at': _snapshot_value(doc.created_at),
        })
    return {
        'snapshot_version': 2,
        'id': vehicle.id,
        'plate_number': vehicle.plate_number,
        'driver_name': vehicle.driver_name,
        'section_id': vehicle.section_id,
        'company_id': vehicle.company_id,
        'approval_status': vehicle.approval_status,
        'profile': profile,
        'bank_accounts': bank_accounts,
        'documents': documents,
    }


def get_vehicle_missing_fields(vehicle, stage: str) -> list[dict]:
    """
    تسک ۲.۵ و ب-۱۷ و بخش ۳.۱ سند: گیت سروری تجمعی تکمیل فیلدهای الزامی ناوگان:
    - draft: plate_number (برای ROAD_VEHICLE_TYPES ساختار پلاک ملی)، vehicle_type، ownership_type، section
    - submit: draft + driver_name، driver_phone (موبایل معتبر ۰۹...)
              + driver_national_code (Mod 11) برای contract و personal
              + insurance_expiry_date برای ROAD_VEHICLE_TYPES
              + اگر is_driver_owner=False: owner_name و owner_national_code (Mod 11)
    - accountant: submit + برای contract و personal: default_service_rate > 0
                  و حساب اصلی فعال با شبای معتبر ISO 7064 Mod 97 (الگوی DEF-23)
    """
    missing = []

    def add_missing(field_name, custom_label=None):
        missing.append({
            'field': field_name,
            'label': custom_label or FLEET_FIELD_LABELS.get(field_name, field_name)
        })

    # ۱. حداقل‌های پیش‌نویس (draft)
    plate = getattr(vehicle, 'plate_number', None)
    vtype = getattr(vehicle, 'vehicle_type', None)
    own_type = getattr(vehicle, 'ownership_type', None)
    sec_id = getattr(vehicle, 'section_id', None)

    if not plate or not str(plate).strip():
        add_missing('plate_number', 'شماره پلاک الزامی است')
    else:
        if vtype in ROAD_VEHICLE_TYPES:
            if not is_valid_national_plate(plate):
                add_missing('plate_number', 'ساختار شماره پلاک ملی برای خودروهای جاده‌ای معتبر نیست (الگوی ۲ رقم - حرف - ۳ رقم - ایران - ۲ رقم)')

    if not vtype:
        add_missing('vehicle_type')
    if not own_type:
        add_missing('ownership_type')
    if not sec_id:
        add_missing('section')

    if stage == 'draft':
        return missing

    # ۲. فیلدهای مرحله ارسال کارمند به سرپرست (submit)
    d_name = getattr(vehicle, 'driver_name', None)
    if not d_name or not str(d_name).strip():
        add_missing('driver_name')

    d_phone = getattr(vehicle, 'driver_phone', None)
    if not d_phone or not str(d_phone).strip():
        add_missing('driver_phone', 'شماره همراه راننده الزامی است')
    else:
        try:
            validate_iranian_mobile(d_phone)
        except ValueError as e:
            add_missing('driver_phone', str(e))

    if own_type in ('contract', 'personal'):
        d_nat = getattr(vehicle, 'driver_national_code', None)
        if not d_nat or not str(d_nat).strip():
            add_missing('driver_national_code', 'کد ملی راننده الزامی است')
        else:
            try:
                validate_iranian_national_code(d_nat)
            except ValueError as e:
                add_missing('driver_national_code', str(e))

    if vtype in ROAD_VEHICLE_TYPES:
        ins_exp = getattr(vehicle, 'insurance_expiry_date', None)
        if not ins_exp or not str(ins_exp).strip():
            add_missing('insurance_expiry_date', 'تاریخ انقضای بیمه‌نامه برای خودروهای جاده‌ای الزامی است')
        else:
            if parse_shamsi_date(_clean_shamsi_date_str(ins_exp)) is None:
                add_missing('insurance_expiry_date', 'تاریخ انقضای بیمه‌نامه شمسی معتبر نیست')

    is_owner = getattr(vehicle, 'is_driver_owner', True)
    if is_owner is False:
        o_name = getattr(vehicle, 'owner_name', None)
        if not o_name or not str(o_name).strip():
            add_missing('owner_name', 'نام مالک خودرو الزامی است')
        o_nat = getattr(vehicle, 'owner_national_code', None)
        if not o_nat or not str(o_nat).strip():
            add_missing('owner_national_code', 'کد ملی مالک خودرو الزامی است')
        else:
            try:
                validate_iranian_national_code(o_nat)
            except ValueError as e:
                add_missing('owner_national_code', str(e))

    if stage in ('submit', 'employee', 'pending_supervisor'):
        return missing

    # ۳. فیلدهای مرحله حسابدار به مدیر (accountant / pending_manager)
    if own_type in ('contract', 'personal'):
        rate = getattr(vehicle, 'default_service_rate', 0) or 0
        if float(rate) <= 0:
            add_missing('default_service_rate', 'نرخ پایه سرویس باید بزرگتر از صفر باشد')

        primary_sheba = None
        if getattr(vehicle, 'pk', None) and hasattr(vehicle, 'bank_accounts'):
            primary = next((a for a in vehicle.bank_accounts.all() if a.is_primary and a.is_active), None)
            if primary is not None:
                primary_sheba = primary.sheba_number
        if primary_sheba is None:
            primary_sheba = getattr(vehicle, 'sheba_number', None)

        has_primary_bank = False
        if primary_sheba and str(primary_sheba).strip():
            has_primary_bank = validate_sheba(clean_sheba(primary_sheba))[0]
        if not has_primary_bank:
            add_missing('primary_bank_account', 'حساب بانکی اصلی با شماره شبای معتبر (Mod 97) الزامی است')

    return missing


def check_vehicle_bank_account_edit_allowed(user, vehicle) -> tuple[bool, str]:
    """
    تسک ۲.۸ و DEF-10: بررسی دسترسی و وضعیت مجاز برای تغییر حساب‌های بانکی ناوگان.
    """
    st = vehicle.approval_status
    if st in BANK_ACCOUNT_LOCKED_STATUSES:
        if st == 'pending_manager':
            return False, 'پرونده در انتظار تصویب مدیر است و حساب‌های بانکی آن قفل است؛ در صورت نیاز، مدیر پرونده را به حسابدار عودت دهد.'
        return False, 'ویرایش یا تغییر حساب‌های بانکی برای پرونده مصوب مجاز نیست؛ لطفاً از طریق ثبت درخواست تغییرات اقدام نمایید.'
    if user and user.is_superuser:
        return True, ''
    if st in ('draft', 'revision_required'):
        return True, ''
    if st == 'pending_accountant' and user_has_any_perm(user, FLEET_FINANCE_STAGE_PERMS, vehicle):
        return True, ''
    return False, f'در وضعیت «{vehicle.get_approval_status_display()}» مجاز به تغییر حساب‌های بانکی این خودرو نیستید.'


# ── د۸ طرح ۴.۶: پوشش دادهٔ حساس خودرو (ق۶، ق۱۶) ──
# گردش پرونده و درخواست تغییر روی موتور ۲.۳ است (workflows.VEHICLE_*)؛ approve_vehicle_stage و auto_pass_vehicle
# قدیمی (با دور زدن حسابدار به دست مدیر، خلاف ق۷) حذف شدند.
VEHICLE_SENSITIVE_FIELDS = ('driver_national_code', 'owner_national_code', 'account_number', 'sheba_number')
VEHICLE_BANK_SENSITIVE_FIELDS = ('account_number', 'sheba_number', 'card_number', 'account_owner_national_code')
VEHICLE_ALL_SENSITIVE_FIELDS = tuple(dict.fromkeys(VEHICLE_SENSITIVE_FIELDS + VEHICLE_BANK_SENSITIVE_FIELDS))
FLEET_SENSITIVE_VIEW_PERMS = FLEET_FINANCE_STAGE_PERMS + FLEET_MANAGER_STAGE_PERMS + (
    'view_sys_fleet_settlement', 'perm_treasury_disburse_action',
)


def can_view_vehicle_sensitive(user, vehicle, cache=None) -> bool:
    """
    دید کامل کد ملی راننده و مالک، شماره حساب، کارت و شبای خودرو (د۸ طرح ۴.۶، الگوی can_view_personnel_sensitive):
    مدیر کل، خود راننده، ثبت‌کننده تا وقتی پیش‌نویس یا عودت‌شده است، و دارندهٔ یکی از FLEET_SENSITIVE_VIEW_PERMS در
    بخش همان خودرو (خودروی بی‌بخش: در یکی از بخش‌های شرکتش). بقیه چهار رقم آخر. cache: یک‌بار برای هر بخش یا شرکت.
    """
    if not user or not getattr(user, 'is_authenticated', False) or vehicle is None:
        return False
    if user.is_superuser:
        return True
    if vehicle.user_id and vehicle.user_id == user.id:
        return True
    if (vehicle.created_by_id and vehicle.created_by_id == user.id
            and vehicle.approval_status in ('draft', 'revision_required')):
        return True
    cache = {} if cache is None else cache
    key = ('fleet_section', vehicle.section_id) if vehicle.section_id else ('fleet_company', vehicle.company_id)
    if key not in cache:
        cache[key] = user_has_any_perm(user, FLEET_SENSITIVE_VIEW_PERMS, vehicle)
    return cache[key]


def mask_vehicle_mapping(data, fields=VEHICLE_ALL_SENSITIVE_FIELDS):
    """نسخهٔ پوشیدهٔ یک dict (پرونده، حساب یا diff درخواست تغییر)؛ ورودی دست نمی‌خورد."""
    from personnel.lifecycle_services import mask_sensitive_value
    if not isinstance(data, dict):
        return data
    out = dict(data)
    for f in fields:
        if f in out and out[f] not in (None, ''):
            out[f] = mask_sensitive_value(out[f])
    return out


FLEET_WORKFLOW_NOTIFICATION_TEXTS = {
    'pending_supervisor': ('پرونده خودرو در انتظار تایید سرپرست', 'پرونده جدید خودرو «{plate}» ({driver}) جهت بررسی و تایید سرپرستی ارسال گردید.'),
    'pending_accountant': ('پرونده خودرو در انتظار بررسی حسابدار', 'پرونده خودرو «{plate}» ({driver}) به تایید سرپرست رسید و جهت تکمیل اطلاعات مالی به کارتابل حسابداری ارسال شد.'),
    'pending_manager': ('پرونده خودرو در انتظار تصویب مدیر', 'پرونده خودرو «{plate}» ({driver}) به تایید مالی رسید و جهت تصویب نهایی در کارتابل مدیر قرار گرفت.'),
    'approved': ('تصویب نهایی پرونده خودرو', 'پرونده خودرو «{plate}» ({driver}) با موفقیت به تصویب مدیر رسید و فعال گردید.'),
    'revision_required': ('عودت پرونده خودرو جهت بازنگری', 'پرونده خودرو «{plate}» جهت بازنگری و اصلاح عودت داده شد{reason}.'),
    'rejected': ('رد پرونده خودرو', 'پرونده خودرو «{plate}» رد شد{reason}.'),
    'purged': ('پاک‌سازی پرونده خودرو', 'پرونده خودرو «{plate}» به دلیل رد قطعی و عدم سابقه پاک‌سازی شد.'),
    'end_collaboration': ('قطع همکاری خودرو', 'همکاری خودرو «{plate}» پایان یافت و پرونده غیرفعال شد{reason}.'),
    'reopened': ('بازگشایی پرونده خودرو', 'پرونده خودرو «{plate}» ({driver}) بازگشایی شد و به وضعیت پیش‌نویس بازگشت{reason}.'),
    'change_request_created': ('درخواست تغییرات پرونده خودرو', 'درخواست تغییرات جدید برای خودرو «{plate}» ثبت شد و در انتظار بررسی سرپرست است.'),
    'change_request_supervisor_approved': ('تایید مرحله اول تغییرات خودرو', 'درخواست تغییرات خودرو «{plate}» به تایید سرپرست رسید و در انتظار بررسی مالی است.'),
    'change_request_finance_approved': ('تایید مالی تغییرات خودرو', 'درخواست تغییرات خودرو «{plate}» به تایید مالی رسید و در انتظار تصویب مدیر است.'),
    'change_request_manager_approved': ('تصویب نهایی تغییرات خودرو', 'درخواست تغییرات خودرو «{plate}» توسط مدیر تصویب و در پرونده اعمال شد.'),
    'change_request_rejected': ('رد درخواست تغییرات خودرو', 'درخواست تغییرات خودرو «{plate}» رد شد{reason}.'),
    'change_request_cancelled': ('لغو درخواست تغییرات خودرو', 'درخواست تغییرات خودرو «{plate}» لغو شد{reason}.'),
}
FLEET_RETURN_NOTIFICATION_TEXT = ('عودت پرونده خودرو جهت بازنگری', 'پرونده خودرو «{plate}» جهت بازنگری به کارتابل شما عودت داده شد{reason}.')

FLEET_STAGE_URLS = {
    'pending_supervisor': '/app/finance/supervisor-fleet',
    'pending_accountant': '/app/finance/accountant-fleet',
    'pending_manager': '/app/finance/manager-fleet',
    'approved': '/app/finance/employee-fleet',
    'revision_required': '/app/finance/employee-new-vehicle',
    'rejected': '/app/finance/employee-new-vehicle',
    'reopened': '/app/finance/employee-new-vehicle',
    'end_collaboration': '/app/finance/employee-fleet',
    'purged': '/app/finance/employee-new-vehicle',
    'deleted': '/app/finance/employee-new-vehicle',
    'change_request_created': '/app/finance/supervisor-fleet',
    'change_request_supervisor_approved': '/app/finance/accountant-fleet',
    'change_request_finance_approved': '/app/finance/manager-fleet',
    'change_request_manager_approved': '/app/finance/employee-fleet',
    'change_request_rejected': '/app/finance/employee-fleet',
    'change_request_cancelled': '/app/finance/employee-fleet',
}


def dispatch_vehicle_workflow_notification(vehicle, stage: str, actor=None, reason=None, note=None, is_return=False, recipient_ids=None):
    """
    تسک ۴.۱ و ب-۲۲ و ن-۱۰ (ط-۷): ارسال اعلان‌های هدفمند گردش کار و درخواست تغییرات ناوگان
    با تفکیک قلمرو شرکت و انتشار به کانال کاربر.
    """
    if not vehicle:
        return

    from django.db import transaction

    veh_id = getattr(vehicle, 'id', None)
    cid = getattr(vehicle, 'company_id', None)
    if not cid and getattr(vehicle, 'section_id', None) and vehicle.section and vehicle.section.project:
        cid = vehicle.section.project.company_id
    sec_id = getattr(vehicle, 'section_id', None)
    created_by_id = getattr(vehicle, 'created_by_id', None)
    plate = getattr(vehicle, 'plate_number', '') or 'بدون پلاک'
    driver = getattr(vehicle, 'driver_name', '') or 'بدون راننده'
    approval_status = getattr(vehicle, 'approval_status', '')
    actor_id = getattr(actor, 'id', None)

    def _execute():
        try:
            from notifications.services import notify_users

            if is_return and stage not in ('revision_required',):
                title_tpl, message_tpl = FLEET_RETURN_NOTIFICATION_TEXT
            elif stage in FLEET_WORKFLOW_NOTIFICATION_TEXTS:
                title_tpl, message_tpl = FLEET_WORKFLOW_NOTIFICATION_TEXTS[stage]
            elif stage == 'deleted':
                title_tpl, message_tpl = FLEET_WORKFLOW_NOTIFICATION_TEXTS['purged']
            else:
                return

            reason_txt = f' (دلیل: {reason})' if reason else ''
            title = title_tpl
            message = message_tpl.format(plate=plate, driver=driver, reason=reason_txt)

            if recipient_ids is not None:
                target_user_ids = {int(uid) for uid in recipient_ids if uid}
            else:
                target_user_ids = _workflow_recipient_ids(
                    stage, cid, sec_id, created_by_id,
                    perms_by_stage=FLEET_WORKFLOW_STAGE_PERMS
                )
            if actor_id:
                target_user_ids.discard(actor_id)
            if not target_user_ids:
                return

            # راه عمومی هسته (ص۷ طرح ۲.۴): ردیف‌ها، پیام شخصی وب‌سوکت و FCM
            notify_users(
                target_user_ids,
                title=title,
                message=message,
                notification_type='fleet_change_request' if stage.startswith('change_request_') else 'fleet_workflow',
                target_model='VehicleDriverProfile',
                target_id=str(veh_id) if veh_id is not None else '',
                url=FLEET_STAGE_URLS.get(stage, '/app/finance/employee-fleet'),
                company_id=cid,
                extra={'vehicle_id': veh_id, 'approval_status': approval_status},
            )
        except Exception:
            logger.exception("[Notification] Error dispatching fleet workflow notification (stage=%s, vehicle=%s)", stage, veh_id)

    transaction.on_commit(_execute)


# ── درخواست‌های تغییرات پرونده ناوگان (تسک ۳.۵، ب-۲۳ و DEF-16) ──
VEHICLE_CHANGE_REQUEST_EXCLUDED_FIELDS = {
    'id', 'pk', 'plate_number', 'section', 'company', 'project', 'user',
    'assigned_warehouse_id', 'approval_status', 'rejection_reason',
    'has_pending_changes', 'is_active', 'end_date', 'created_at', 'updated_at',
    'created_by', 'bank_accounts', 'documents',
}

EMPLOYEE_VEHICLE_CHANGE_FIELDS = {
    'vehicle_type', 'ownership_type', 'driver_name', 'driver_national_code',
    'driver_phone', 'is_driver_owner', 'owner_name', 'owner_national_code',
    'owner_phone', 'bank_name', 'account_number', 'sheba_number',
    'insurance_expiry_date', 'inspection_expiry_date', 'license_expiry_date',
    'valid_until_date', 'notes',
}

PENDING_VEHICLE_CHANGE_REQUEST_STATUSES = (
    'draft', 'pending_supervisor', 'pending_accountant', 'pending_manager',
    'supervisor_approved', 'accountant_approved', 'manager_approved', 'revision_required'
)


def vehicle_change_request_fields_allowed_for(user):
    """
    فیلدهای مجاز درخواست تغییرات ناوگان؛ برای نقش مالی یا مدیر None (بدون قفل فیلدهای مالی).
    """
    if user_has_any_perm(user, FLEET_FINANCE_STAGE_PERMS + FLEET_MANAGER_STAGE_PERMS):
        return None
    return EMPLOYEE_VEHICLE_CHANGE_FIELDS


def log_vehicle_change_request_event(cr, actor, action: str, reason: str = '', extra: dict = None):
    """
    تسک ۳.۸ و DEF-19: لاگ رویدادهای درخواست تغییرات روی تایملاین خودرو (content_type='vehicle').
    """
    from personnel.models import WorkflowAuditLog
    vehicle = cr.vehicle
    metadata = {
        'change_request_id': cr.id,
        'change_request_status': cr.status,
        'company_id': vehicle.company_id
    }
    if extra:
        metadata.update(extra)
    WorkflowAuditLog.objects.create(
        content_type='vehicle',
        object_id=vehicle.id,
        actor=actor if getattr(actor, 'is_authenticated', False) else None,
        from_status=vehicle.approval_status,
        to_status=vehicle.approval_status,
        action=action,
        reason=reason or '',
        metadata=metadata,
    )


def refresh_vehicle_has_pending_changes(vehicle, exclude_cr_id=None):
    from personnel.models import VehicleChangeRequest
    pending = VehicleChangeRequest.objects.filter(vehicle=vehicle, status__in=PENDING_VEHICLE_CHANGE_REQUEST_STATUSES)
    if exclude_cr_id:
        pending = pending.exclude(pk=exclude_cr_id)
    has_pending = pending.exists()
    if vehicle.has_pending_changes != has_pending:
        vehicle.has_pending_changes = has_pending
        vehicle.save(update_fields=['has_pending_changes'])


def apply_vehicle_change_request(cr, request=None):
    """
    تسک ۳.۵ و ب-۲۳: اعمال امن درخواست تغییرات روی پرونده خودرو با سریالایزر بدون هیچ setattr خام.
    """
    from personnel.serializers import VehicleDriverProfileSerializer

    vehicle = cr.vehicle
    proposed = dict(cr.proposed_changes or {})
    clean_data = {k: v for k, v in proposed.items() if k not in VEHICLE_CHANGE_REQUEST_EXCLUDED_FIELDS}

    allowed = vehicle_change_request_fields_allowed_for(cr.requested_by) if cr.requested_by_id else None
    if allowed is not None:
        locked = sorted(k for k in clean_data if k not in allowed)
        if locked:
            raise VehicleWorkflowError(
                f"درخواست تغییرات شامل فیلدهای قفل برای نقش درخواست‌دهنده است: {', '.join(locked)}"
            )

    context = {'request': request} if request is not None else {}
    context['apply_change_request'] = True
    serializer = VehicleDriverProfileSerializer(vehicle, data=clean_data, partial=True, context=context)
    if not serializer.is_valid():
        raise VehicleWorkflowError(
            'تغییرات پیشنهادی معتبر نیست و اعمال نشد؛ درخواست معلق ماند.',
            code='invalid_change_request',
            errors=serializer.errors,
        )
    serializer.save()
    return vehicle
