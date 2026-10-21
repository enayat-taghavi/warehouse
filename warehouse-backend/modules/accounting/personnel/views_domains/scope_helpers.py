# -*- coding: utf-8 -*-
"""
Shared scope, permission, and realtime helper functions for personnel views.
"""

import jdatetime
from platform_core.registry import has_permission_alias
from decimal import Decimal
from django.apps import apps
from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError as DRFValidationError
from common.date_utils import format_to_shamsi_str, normalize_digits
from companies.access import (
    get_user_allowed_companies,
    get_request_company_id,
    validate_user_company_access,
    ensure_scoped_write,
)
from companies.realtime import broadcast_org_structure_updated as core_broadcast_org_structure_updated
from ..models import (
    UserCompanyAccess,
    UserSectionAssignment,
    FinancialProject,
    MonthlyWorkPeriod,
    PayrollYearlySettings,
    JobGradeTier,
    WorkshopInsuranceSettings,
    TaxRuleSettings,
    BankExportSettings,
)
from ..permissions import (
    requires_company_scope,
    has_structure_write_permission,
)
from ..payroll_engine import get_effective_payroll_settings

User = get_user_model()

def user_belongs_to_company(user_id, company_id):
    """
    آیا کاربر عضو شرکت است یا بوده است؟ (دسترسی صریح workspace_full، یا هر انتساب فعال یا غیرفعال در بخش‌های همان شرکت)
    انتساب بخش هرگز نباید برای کاربر دسترسی شرکت تازه بسازد، چون عضویت بخش خودش دسترسی شرکت می‌دهد.
    انتساب غیرفعالِ قبلی حساب می‌شود تا فعال‌سازی دوباره یا جابه‌جایی درون همان شرکت رد نشود.
    """
    if not user_id or not company_id:
        return False
    return (
        UserCompanyAccess.objects.filter(user_id=user_id, company_id=company_id, access_level='workspace_full').exists()
        or UserSectionAssignment.objects.filter(user_id=user_id, section__project__company_id=company_id).exists()
    )

def ensure_scoped_assignment(actor, target_user_id, section, final_active=True):
    """
    انتساب بخش: بخش باید در شرکت‌های مجاز نویسنده باشد و کاربر هدف عضو همان شرکت.
    راهبر تشکیلاتی که مجوز قدیمی نوشتن ساختار ندارد، نمی‌تواند خودش را منتسب کند (خط قرمز نقش راهبر).
    غیرفعال‌سازی انتساب این دو شرط عضویت را لازم ندارد.
    """
    company_id = section.project.company_id if section is not None and section.project_id else None
    ensure_scoped_write(actor, company_id, "انتساب فقط در بخش‌های شرکت‌های مجاز شما ممکن است (بخش پروژهٔ سراسری مجاز نیست).")
    if not final_active:
        return
    if target_user_id == actor.id and not has_structure_write_permission(actor):
        raise PermissionDenied("انتساب خودتان به بخش را مدیر ارشد یا مدیر انجام می‌دهد، نه راهبر تشکیلات.")
    if not user_belongs_to_company(target_user_id, company_id):
        raise PermissionDenied("این کاربر عضو شرکتِ این بخش نیست. دسترسی شرکت را مدیر ارشد می‌دهد، نه انتساب بخش.")

def resolve_write_company(request):
    """
    شرکت مقصد درون‌ریزی اکسل برای کاربر غیرسوپریوزر: شرکت فعال درخواست (پارامتر company_id یا هدر X-Company-ID)
    که باید جزو شرکت‌های مجاز او باشد. اگر شرکتی مشخص نشده و کاربر فقط یک شرکت مجاز دارد، همان برگردانده می‌شود.
    """
    allowed_ids = set(get_user_allowed_companies(request.user).values_list('id', flat=True))
    raw = request.data.get('company_id') if hasattr(request.data, 'get') else None
    raw = raw or get_request_company_id(request)
    if raw:
        try:
            cid = int(raw)
        except (ValueError, TypeError):
            raise serializers.ValidationError({'error': 'شناسهٔ شرکت نامعتبر است.'})
        if cid not in allowed_ids:
            raise PermissionDenied("شما به این شرکت دسترسی ندارید.")
        return cid
    if len(allowed_ids) == 1:
        return next(iter(allowed_ids))
    raise serializers.ValidationError({'error': 'شرکت فعال مشخص نیست؛ ابتدا شرکت را در سربرگ انتخاب کنید.'})

def resolve_import_company(request):
    """
    شرکت مقصد درون‌ریزی اکسل: برای غیرسوپریوزر resolve_write_company (اجباری و مجاز).
    برای سوپریوزر شرکت فعال درخواست اگر آمده باشد، وگرنه تهی (رفتار قبلی: تطبیق روی کل جدول).
    """
    if requires_company_scope(request.user):
        return resolve_write_company(request)
    raw = request.data.get('company_id') if hasattr(request.data, 'get') else None
    raw = raw or get_request_company_id(request)
    try:
        return int(raw) if raw else None
    except (ValueError, TypeError):
        return None

def readable_company_ids(user):
    """شرکت‌هایی که خروجی اکسل کاربر غیرسوپریوزر به آن‌ها محدود می‌شود (به‌علاوهٔ رکوردهای سراسری). تهی یعنی همه."""
    if user.is_superuser:
        return None
    return set(get_user_allowed_companies(user).values_list('id', flat=True))

def is_personnel_global_auditor(user):
    """نقش‌های مدیر و حسابدار کل که به بخش‌های منتسب محدود نیستند (ولی همچنان به شرکت‌های مجاز خود محدودند)."""
    return bool(
        user and (
            user.is_superuser
            or user.has_perm('accounts.perm_approve_personnel_manager')
            or has_permission_alias(user, 'manager_approver')
            or user.has_perm('accounts.perm_approve_personnel_finance')
        )
    )

def scope_personnel_queryset(request, qs):
    """
    قلمرو امنیتی پرونده‌های پرسنل (Guardian G1 / BOLA): کاربر عادی فقط بخش‌های منتسب فعال یا پرونده‌های ثبت خودش،
    و هر کاربر غیرسوپریوزر فقط شرکت‌های مجاز خودش؛ چه سربرگ شرکت بیاید چه نیاید.
    پیش‌تر نبودِ سربرگ X-Company-ID قلمرو شرکت را برای مدیر و حسابدار کل برمی‌داشت.
    """
    user = request.user
    if not user or not user.is_authenticated:
        return qs.none()
    cid = validate_user_company_access(user, get_request_company_id(request))
    return scope_personnel_for_user(user, qs, company_id=cid)

def scope_personnel_for_user(user, qs, company_id=None):
    """
    همان قاعدهٔ scope_personnel_queryset بدون request (برای گزارش‌ساز): company_id تهی یعنی همهٔ شرکت‌های مجاز.
    """
    if not user or not user.is_authenticated:
        return qs.none()
    if not is_personnel_global_auditor(user):
        user_section_ids = list(
            UserSectionAssignment.objects.filter(user=user, is_active=True).values_list('section_id', flat=True)
        )
        qs = qs.filter(Q(section_id__in=user_section_ids) | Q(created_by=user))

    cid = company_id
    if cid:
        return qs.filter(Q(company_id=cid) | Q(section__project__company_id=cid))
    if user.is_superuser:
        return qs
    allowed_ids = list(get_user_allowed_companies(user).values_list('id', flat=True))
    return qs.filter(
        Q(company_id__in=allowed_ids)
        | Q(section__project__company_id__in=allowed_ids)
        # پیش‌نویسِ بی‌شرکت و بی‌بخش فقط برای ثبت‌کننده‌اش
        | Q(company__isnull=True, section__isnull=True, created_by=user)
    )

def ensure_record_write_scope(user, company=None, section=None, project=None, label='رکورد'):
    """
    نوشتن رکورد فقط درون شرکت‌های مجاز کاربر (تصمیم کاربر، ۹ مهر ۱۴۰۵؛ requires_company_scope):
    شرکت، بخش و پروژهٔ پرونده نباید به شرکتی بیرون از قلمرو کاربر اشاره کنند. در صورت نقض PermissionDenied.
    """
    if not requires_company_scope(user):
        return
    allowed_ids = set(get_user_allowed_companies(user).values_list('id', flat=True))
    company_ids = set()
    if company is not None:
        company_ids.add(getattr(company, 'pk', company))
    if section is not None:
        section_company_id = section.project.company_id if section.project_id else None
        if section_company_id is None:
            raise PermissionDenied(f"بخش انتخاب‌شده به شرکتی تعلق ندارد و ثبت {label} در آن مجاز نیست.")
        company_ids.add(section_company_id)
    if project is not None:
        company_ids.add(project.company_id)
    if any(cid is None or cid not in allowed_ids for cid in company_ids):
        raise PermissionDenied(f"شرکت، بخش یا پروژهٔ انتخاب‌شده برای {label} در قلمرو شرکت‌های مجاز شما نیست.")
    if len(company_ids) > 1:
        raise PermissionDenied(f"شرکت، بخش و پروژهٔ {label} باید به یک شرکت تعلق داشته باشند.")

def ensure_personnel_write_scope(user, company=None, section=None, project=None):
    return ensure_record_write_scope(user, company=company, section=section, project=project, label='پرسنل')

def is_vehicle_global_auditor(user):
    return bool(
        user and (
            user.is_superuser
            or user.has_perm('accounts.perm_approve_fleet_manager')
            or has_permission_alias(user, 'manager_approver')
            or user.has_perm('accounts.perm_approve_fleet_finance')
        )
    )

def scope_vehicle_queryset(request, qs, prefix=''):
    """
    قلمرو امنیتی پرونده‌های ناوگان و خودروها (ب-۲): کاربر عادی فقط بخش‌های منتسب فعال یا پرونده‌های ثبت خودش،
    و هر کاربر غیرسوپریوزر فقط شرکت‌های مجاز خودش؛ چه سربرگ شرکت بیاید چه نیاید.
    """
    user = request.user
    if not user or not user.is_authenticated:
        return qs.none()

    if not is_vehicle_global_auditor(user):
        user_section_ids = list(
            UserSectionAssignment.objects.filter(user=user, is_active=True).values_list('section_id', flat=True)
        )
        sec_field = f"{prefix}section_id__in"
        creator_field = f"{prefix}created_by" if prefix == '' else "requested_by"
        qs = qs.filter(Q(**{sec_field: user_section_ids}) | Q(**{creator_field: user}))

    cid = validate_user_company_access(user, get_request_company_id(request))
    comp_field = f"{prefix}company_id"
    sec_comp_field = f"{prefix}section__project__company_id"

    if cid:
        return qs.filter(Q(**{comp_field: cid}) | Q(**{sec_comp_field: cid}))
    if user.is_superuser:
        return qs
    allowed_ids = list(get_user_allowed_companies(user).values_list('id', flat=True))
    creator_field = f"{prefix}created_by" if prefix == '' else "requested_by"
    return qs.filter(
        Q(**{f"{comp_field}__in": allowed_ids})
        | Q(**{f"{sec_comp_field}__in": allowed_ids})
        | Q(**{f"{prefix}company__isnull": True, f"{prefix}section__isnull": True, creator_field: user})
    )

def scope_trips_for_user(user, qs, company_id=None):
    """
    قلمرو امنیتی سفرهای ناوگان:
    - کاربر ناشناس: خالی
    - با company_id: سفرهایی که بخش، پروژه، خودرو یا بخشِ خودرو متعلق به آن شرکت باشد
    - بی company_id و سوپریوزر: بدون محدودیت
    - بی company_id و غیرسوپریوزر: یکی از همان چهار مسیر در شرکت‌های مجاز یا قاعدهٔ خودروی یتیم سازنده (بی‌شرکت و بی‌بخش)
    """
    if not user or not user.is_authenticated:
        return qs.none()

    if company_id:
        return qs.filter(
            Q(section__project__company_id=company_id)
            | Q(project__company_id=company_id)
            | Q(vehicle__company_id=company_id)
            | Q(vehicle__section__project__company_id=company_id)
        ).distinct()

    if user.is_superuser:
        return qs

    try:
        from companies.access import get_user_allowed_companies
        allowed_ids = list(get_user_allowed_companies(user).values_list('id', flat=True))
    except Exception:
        allowed_ids = []

    orphan_q = Q(vehicle__company__isnull=True, vehicle__section__isnull=True, vehicle__created_by=user)
    if allowed_ids:
        return qs.filter(
            Q(section__project__company_id__in=allowed_ids)
            | Q(project__company_id__in=allowed_ids)
            | Q(vehicle__company_id__in=allowed_ids)
            | Q(vehicle__section__project__company_id__in=allowed_ids)
            | orphan_q
        ).distinct()

    return qs.filter(orphan_q).distinct()

def broadcast_personnel_update(personnel, action_type='updated', message=None, sender_id=None, client_tab_id=None):
    """
    تسک ۴.۳: ارسال بلادرنگ رویدادهای تغییر وضعیت یا ویرایش پرونده پرسنل به کانال اختصاصی شرکت مربوطه.
    توقف پخش سراسری رویداد پرسنل بی‌شرکت به global_notifications، و غنی‌سازی پی‌لود جهت به‌روزرسانی درجای جدول و شمارنده‌ها.
    """
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if channel_layer is not None:
            full_name = getattr(personnel, 'full_name', '') or f"{getattr(personnel, 'first_name', '')} {getattr(personnel, 'last_name', '')}".strip()
            cid = getattr(personnel, 'company_id', None)
            if not cid and hasattr(personnel, 'section') and personnel.section and personnel.section.project:
                cid = personnel.section.project.company_id

            if not cid:
                # طبق الزامات تسک ۴.۳: رویداد بدون شرکت دیگر نباید سراسری پخش شود تا از نشت دیتا جلوگیری گردد
                import logging
                logging.getLogger(__name__).debug(f"[WebSocket] Skipping global broadcast for personnel without company: {full_name}")
                return

            payload = {
                'type': 'send_notification',
                'type_str': 'personnel_updated',
                'action': action_type,
                'personnel_id': getattr(personnel, 'id', None),
                'company_id': cid,
                'section_id': getattr(personnel, 'section_id', None),
                'project_id': getattr(personnel, 'project_id', None),
                'full_name': full_name,
                # کد ملی در پخش گروهی شرکت فرستاده نمی‌شود (حریم خصوصی؛ آزمون test_websocket_broadcast_isolation_and_privacy)
                'job_title': getattr(personnel, 'job_title', ''),
                'approval_status': getattr(personnel, 'approval_status', ''),
                'is_active': getattr(personnel, 'is_active', True),
                'has_pending_changes': getattr(personnel, 'has_pending_changes', False),
                'valid_until_date': getattr(personnel, 'valid_until_date', '') or '',
                'rejection_reason': getattr(personnel, 'rejection_reason', '') or '',
                'message': message or f'پرونده پرسنل «{full_name}» به‌روزرسانی شد.',
                'sender_id': sender_id,
                'client_tab_id': client_tab_id,
            }
            target_group = f'company_{cid}_notifications'
            async_to_sync(channel_layer.group_send)(
                target_group,
                payload
            )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"[WebSocket] Error broadcasting personnel_updated: {e}")

def broadcast_vehicle_update(vehicle, action_type='updated', message=None, sender_id=None, client_tab_id=None):
    """
    تسک ۴.۳ و ب-۶: ارسال بلادرنگ رویدادهای تغییر وضعیت، ثبت یا ویرایش پرونده ناوگان با پی‌لود غنی اختصاصی کانال شرکت
    """
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if channel_layer is not None:
            plate_number = getattr(vehicle, 'plate_number', '') or ''
            driver_name = getattr(vehicle, 'driver_name', '') or ''
            cid = getattr(vehicle, 'company_id', None)
            if not cid and hasattr(vehicle, 'section') and vehicle.section and vehicle.section.project:
                cid = vehicle.section.project.company_id

            if not cid:
                import logging
                logging.getLogger(__name__).debug(f"[WebSocket] Skipping global broadcast for vehicle without company: {plate_number}")
                return

            proj_id = getattr(vehicle, 'project_id', None)
            if not proj_id and hasattr(vehicle, 'section') and vehicle.section:
                proj_id = getattr(vehicle.section, 'project_id', None)

            payload = {
                'type': 'send_notification',
                'type_str': 'vehicle_updated',
                'action': action_type,
                'vehicle_id': getattr(vehicle, 'id', None),
                'company_id': cid,
                'section_id': getattr(vehicle, 'section_id', None),
                'project_id': proj_id,
                'plate_number': plate_number,
                'driver_name': driver_name,
                # کدهای ملی راننده و مالک جهت رعایت حریم خصوصی در پخش عمومی ارسال نمی‌شوند
                'vehicle_type': getattr(vehicle, 'vehicle_type', ''),
                'ownership_type': getattr(vehicle, 'ownership_type', ''),
                'approval_status': getattr(vehicle, 'approval_status', ''),
                'is_active': getattr(vehicle, 'is_active', True),
                'has_pending_changes': getattr(vehicle, 'has_pending_changes', False),
                'valid_until_date': getattr(vehicle, 'valid_until_date', '') or '',
                'insurance_expiry_date': getattr(vehicle, 'insurance_expiry_date', '') or '',
                'inspection_expiry_date': getattr(vehicle, 'inspection_expiry_date', '') or '',
                'end_date': getattr(vehicle, 'end_date', '') or '',
                'rejection_reason': getattr(vehicle, 'rejection_reason', '') or '',
                'message': message or f'پرونده خودرو «{plate_number}» با راننده «{driver_name}» به‌روزرسانی شد.',
                'sender_id': sender_id,
                'client_tab_id': client_tab_id,
            }
            target_group = f'company_{cid}_notifications'
            async_to_sync(channel_layer.group_send)(
                target_group,
                payload
            )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"[WebSocket] Error broadcasting vehicle_updated: {e}")

def log_vehicle_audit(user, action, target_instance, details=None):
    try:
        AuditLog = apps.get_model('accounts', 'AuditLog')
        AuditLog.objects.create(
            user=user if user and user.is_authenticated else None,
            actor_username=user.username if user and user.is_authenticated else 'system',
            actor_name=f"{user.first_name} {user.last_name}".strip() or user.username if user and user.is_authenticated else 'سیستم',
            module='fleet',
            action=action,
            severity='info' if action not in ['REJECT', 'REJECT_CHANGE_REQ', 'DELETE'] else 'warning',
            target_model=target_instance.__class__.__name__,
            target_object_id=str(target_instance.pk),
            target_repr=str(target_instance),
            details=details or {}
        )
    except Exception:
        pass

def normalize_attendance_date(date_str: str) -> str:
    """
    نرمال‌سازی تاریخ شمسی و پشتیبانی کامل از ورودی‌های پیوسته ۸ رقمی (14050607)
    و تبدیل خودکار به استاندارد YYYY/MM/DD بدون بروز خطا
    """
    if not date_str:
        return ""
    cleaned = normalize_digits(str(date_str)).strip()
    digits_only = ''.join(c for c in cleaned if c.isdigit())
    if len(digits_only) == 8 and ('/' not in cleaned and '-' not in cleaned):
        return f"{digits_only[:4]}/{digits_only[4:6]}/{digits_only[6:8]}"
    shamsi_str = format_to_shamsi_str(cleaned)
    if shamsi_str and len(shamsi_str.split('/')) == 3:
        return shamsi_str
    parts = cleaned.replace('-', '/').split('/')
    if len(parts) == 3:
        try:
            return f"{int(parts[0]):04d}/{int(parts[1]):02d}/{int(parts[2]):02d}"
        except Exception:
            pass
    return date_str

def validate_attendance_date_window(date_shamsi: str, user=None, allow_override: bool = False, warehouse_id=None, project_id=None):
    """
    اعتبارسنجی بازه مجاز ثبت و ویرایش کارکرد بر مبنای تنظیمات سالانه حقوق
    -1 به معنای نامحدود، 0 به معنای فقط امروز، اعداد مثبت به معنای سقف روز مجاز
    پشتیبانی کامل از رشته‌های ۸ رقمی پیوسته (مانند 14050607)
    مدیر ارشد سیستم (Superuser) با فلگ allow_override می‌تواند محدودیت زمانی را دور بزند.
    در صورتی که دوره کارکرد در وضعیت REJECTED باشد، جهت امکان اصلاح مغایرت‌ها توسط سرپرست، سقف روزهای گذشته لغو می‌شود.
    """
    if allow_override and user and (getattr(user, 'is_superuser', False) or getattr(user, 'is_staff', False) or user.has_perm('personnel.can_override_attendance_lock')):
        return True

    import jdatetime
    from rest_framework.exceptions import ValidationError as DRFValidationError
    
    if not date_shamsi:
        raise DRFValidationError("تاریخ شمسی معتبر نیست.")
    
    norm_date = normalize_attendance_date(date_shamsi)
    try:
        parts = [int(p) for p in norm_date.split('/')]
        if len(parts) != 3:
            raise ValueError
        target_date = jdatetime.date(parts[0], parts[1], parts[2])
    except Exception:
        raise DRFValidationError(f"فرمت تاریخ شمسی نامعتبر است: {date_shamsi}")

    today = jdatetime.date.today()
    delta_days = (target_date - today).days

    year_month = f"{parts[0]:04d}/{parts[1]:02d}"
    settings = get_effective_payroll_settings(year_month, project_id)

    past_limit = settings.attendance_edit_past_days if settings else 3
    future_limit = settings.attendance_edit_future_days if settings else 0

    # بررسی روزهای گذشته
    if delta_days < 0:
        rej_period_qs = MonthlyWorkPeriod.objects.filter(year_month=year_month, status='REJECTED')
        if warehouse_id:
            rej_period_qs = rej_period_qs.filter(warehouse_id=warehouse_id)
        if rej_period_qs.exists():
            return True

        past_days = abs(delta_days)
        if past_limit is not None and past_limit != -1:
            if past_days > past_limit:
                if past_limit == 0:
                    raise DRFValidationError(f"طبق تنظیمات سیستم، فقط امکان ثبت کارکرد برای تاریخ امروز ({today.strftime('%Y/%m/%d')}) وجود دارد و ویرایش سوابق گذشته مجاز نیست.")
                raise DRFValidationError(f"ویرایش کارکرد برای {past_days} روز قبل مجاز نیست. حداکثر سقف مجاز طبق تنظیمات مدیر {past_limit} روز است.")

    # بررسی روزهای آینده
    elif delta_days > 0:
        future_days = delta_days
        if future_limit is not None and future_limit != -1:
            if future_days > future_limit:
                if future_limit == 0:
                    raise DRFValidationError(f"ثبت کارکرد برای تاریخ‌های آینده ({norm_date}) مجاز نیست.")
                raise DRFValidationError(f"ثبت کارکرد برای {future_days} روز آینده مجاز نیست. حداکثر سقف مجاز طبق تنظیمات مدیر {future_limit} روز است.")

    return True

def is_date_shamsi_friday(date_shamsi_str):
    """
    بررسی جمعه بودن یک تاریخ شمسی
    """
    try:
        import jdatetime
        cleaned = normalize_digits(str(date_shamsi_str)).strip().replace('-', '/')
        parts = [int(p) for p in cleaned.split('/') if p.strip()]
        if len(parts) >= 3:
            return jdatetime.date(parts[0], parts[1], parts[2]).weekday() == 6
    except Exception:
        pass
    return False

def broadcast_attendance_updated(warehouse_id=None, date_shamsi=None, year_month=None, message=None, sender_id=None, client_tab_id=None, extra_data=None, company_id=None):
    """
    ارسال بلادرنگ رویداد ثبت/ویرایش کارکرد به کانال وب‌سوکت شرکتی
    """
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if channel_layer is not None:
            cid = company_id
            if not cid and extra_data and isinstance(extra_data, dict):
                cid = extra_data.get('company_id')
            if not cid and warehouse_id:
                try:
                    from platform_core.registry import company_of
                    cid = company_of('warehouse', warehouse_id)
                except Exception:
                    pass


            payload = {
                'type': 'send_notification',
                'type_str': 'attendance_updated',
                'message': message or 'کارکرد پرسنل به‌روزرسانی شد.',
                'date_shamsi': date_shamsi,
                'year_month': year_month,
                'company_id': cid,
                'sender_id': sender_id,
                'client_tab_id': client_tab_id,
            }
            if warehouse_id is not None:
                payload['warehouse_id'] = warehouse_id
            if extra_data and isinstance(extra_data, dict):
                payload.update(extra_data)

            target_group = f'company_{cid}_notifications' if cid else 'global_notifications'
            async_to_sync(channel_layer.group_send)(
                target_group,
                payload
            )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"[WebSocket] Error broadcasting attendance_updated: {e}")

# ══════════════════════════════════════════════════════════════════════════════
# ── ۷. ویوست تنظیمات جامع سالانه و ۲۰ گروه شغلی ───────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

def safe_int(val, default=None):
    if val is None:
        return default
    val_str = str(val).strip().lower()
    if val_str in ('', 'null', 'undefined', 'nan', 'none'):
        return default
    try:
        return int(val_str)
    except (ValueError, TypeError):
        return default

def _copy_payroll_submodels(source, target):
    """کپی ایمن و همه‌جانبه مدل‌های تابعه (کارگاه، مالیات، بانک و ۲۰ گروه شغلی)"""
    if not source:
        return
    if hasattr(source, 'workshop_insurance'):
        wi = source.workshop_insurance
        WorkshopInsuranceSettings.objects.update_or_create(
            yearly_settings=target,
            defaults={
                'workshop_code': wi.workshop_code,
                'workshop_name': wi.workshop_name,
                'employer_name': wi.employer_name,
                'workshop_address': wi.workshop_address,
                'list_type': wi.list_type,
                'list_number': wi.list_number,
                'default_dsk_rate': wi.default_dsk_rate,
                'default_mon_pym': wi.default_mon_pym,
            }
        )
    if hasattr(source, 'tax_settings'):
        ts = source.tax_settings
        TaxRuleSettings.objects.update_or_create(
            yearly_settings=target,
            defaults={
                'payment_type': ts.payment_type,
                'service_location': ts.service_location,
                'exceptions': ts.exceptions,
                'currency_type': ts.currency_type,
                'currency_exchange_rate': ts.currency_exchange_rate,
                'housing_benefit_type': ts.housing_benefit_type,
                'vehicle_benefit_type': ts.vehicle_benefit_type,
                'wh_file_prefix': ts.wh_file_prefix,
                'wp_file_prefix': ts.wp_file_prefix,
            }
        )
    if hasattr(source, 'bank_export_settings'):
        bs = source.bank_export_settings
        BankExportSettings.objects.update_or_create(
            yearly_settings=target,
            defaults={
                'bank_name': bs.bank_name,
                'source_account_number': bs.source_account_number,
                'source_sheba_number': getattr(bs, 'source_sheba_number', None),
                'default_deposit_id': bs.default_deposit_id,
                'deposit_description_template': bs.deposit_description_template,
            }
        )
    for tier in source.job_grades.all():
        JobGradeTier.objects.update_or_create(
            yearly_settings=target,
            grade_number=tier.grade_number,
            defaults={
                'daily_base_wage': tier.daily_base_wage,
                'daily_seniority_bonus': tier.daily_seniority_bonus,
            }
        )

# ══════════════════════════════════════════════════════════════════════════════
def broadcast_org_structure_updated(entity_type, action, entity_id=None, name=None, project_id=None, client_tab_id=None, sender_id=None, company_id=None):
    """
    ارسال بلادرنگ رویداد تغییرات ساختار سازمانی به وب‌سوکت شرکتی؛ اگر فقط پروژه داده شده باشد،
    شرکتِ پروژه پیدا می‌شود و ارسال به هستهٔ companies سپرده می‌شود.
    """
    cid = company_id
    if not cid and project_id:
        try:
            cid = FinancialProject.objects.filter(id=project_id).values_list('company_id', flat=True).first()
        except Exception:
            pass
    core_broadcast_org_structure_updated(entity_type, action, entity_id, name, project_id, client_tab_id, sender_id, cid)

__all__ = [
    'user_belongs_to_company',
    'ensure_scoped_assignment',
    'resolve_write_company',
    'resolve_import_company',
    'readable_company_ids',
    'is_personnel_global_auditor',
    'scope_personnel_queryset',
    'scope_personnel_for_user',
    'ensure_record_write_scope',
    'ensure_personnel_write_scope',
    'is_vehicle_global_auditor',
    'scope_vehicle_queryset',
    'scope_trips_for_user',
    'broadcast_personnel_update',
    'broadcast_vehicle_update',
    'log_vehicle_audit',
    'normalize_attendance_date',
    'validate_attendance_date_window',
    'is_date_shamsi_friday',
    'broadcast_attendance_updated',
    'safe_int',
    '_copy_payroll_submodels',
    'broadcast_org_structure_updated',
]
