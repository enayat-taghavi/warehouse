import logging
from django.apps import apps
from django.db import transaction
from django.forms.models import model_to_dict
from django.utils import timezone
from .models import AuditLog
from .audit_utils import log_audit_event, sanitize_sensitive_data, calculate_model_diff, SENSITIVE_KEYS

from decimal import Decimal, InvalidOperation
from datetime import datetime, date
import uuid

logger = logging.getLogger(__name__)

# فیلدهایی که در هنگام بازگردانی نباید مستقیماً رونویسی شوند
EXCLUDED_REVERT_FIELDS = {
    'id', 'pk', 'password', 'created_at', 'updated_at', 'last_login',
    'date_joined', 'created_by', 'modified_by', 'groups', 'user_permissions',
    'is_superuser', 'is_staff'
}

def is_masked_or_sensitive(field_name, val):
    """
    بررسی اینکه آیا مقدار ذخیره‌شده در لاگ ماسک‌شده (مانند ********) یا کلید فوق حساس است
    تا از بازنویسی مقادیر ستاره‌دار روی داده‌های دیتابیس جلوگیری شود.
    """
    if val is None:
        return False
    str_val = str(val).strip()
    if '****' in str_val or str_val == '********':
        return True
    field_lower = str(field_name).lower()
    if any(k in field_lower for k in SENSITIVE_KEYS) and ('*' in str_val or str_val == ''):
        return True
    return False

def normalize_for_comparison(val):
    """
    نرمال‌سازی مقادیر مختلف پایتون جهت مقایسه عادلانه و بدون باگ تداخل
    - حذف صفرهای انتهایی اعشاری بدون تبدیل به نماد علمی
    - یکسان‌سازی فرمت تاریخ و زمان
    - نرمال‌سازی بولین و None
    """
    if val is None or val == '' or val == '—':
        return None
    if isinstance(val, bool):
        return 'true' if val else 'false'
    if str(val).lower() in ('true', 'false'):
        return str(val).lower()
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, (int, float, Decimal)):
        try:
            d = Decimal(str(val))
            if d == d.to_integral():
                return str(int(d))
            return f"{d:f}".rstrip('0').rstrip('.')
        except Exception:
            return str(val).strip()
    s = str(val).strip()
    try:
        d = Decimal(s)
        if d == d.to_integral():
            return str(int(d))
        return f"{d:f}".rstrip('0').rstrip('.')
    except (InvalidOperation, ValueError):
        pass
    return s


def coerce_field_value(model_cls, field_name, val):
    """
    تبدیل و کستینگ ایمن مقدار از دیکشنری لاگ به نوع فیلد هدف مدل جنگو
    """
    if val is None:
        return None

    if not hasattr(model_cls, '_meta'):
        return val

    try:
        field_obj = model_cls._meta.get_field(field_name)
    except Exception:
        return val

    # ۱. فیلدهای کلید خارجی (ForeignKey / OneToOne)
    if field_obj.is_relation and field_obj.many_to_one:
        if isinstance(val, (int, str)):
            target_model = field_obj.related_model
            try:
                pk_val = int(val) if str(val).isdigit() else val
                found = target_model.objects.filter(pk=pk_val).first()
                if found:
                    return found
            except Exception:
                pass
        return val

    # ۲. فیلدهای بولین
    if field_obj.get_internal_type() in ('BooleanField', 'NullBooleanField'):
        if isinstance(val, bool):
            return val
        return str(val).lower() in ('true', '1', 'yes', 't')

    # ۳. فیلدهای عددی و اعشاری
    if field_obj.get_internal_type() in ('IntegerField', 'PositiveIntegerField', 'BigIntegerField', 'SmallIntegerField'):
        if val == '' or val is None:
            return None
        try:
            return int(float(str(val)))
        except (ValueError, TypeError):
            return val

    if field_obj.get_internal_type() in ('DecimalField', 'FloatField'):
        if val == '' or val is None:
            return None
        try:
            return Decimal(str(val)) if field_obj.get_internal_type() == 'DecimalField' else float(str(val))
        except Exception:
            return val

    # ۴. فیلدهای تاریخ و زمان
    if field_obj.get_internal_type() == 'DateTimeField':
        if isinstance(val, datetime):
            return val
        if isinstance(val, str) and val.strip():
            from django.utils.dateparse import parse_datetime
            parsed = parse_datetime(val.strip())
            return parsed if parsed is not None else val

    if field_obj.get_internal_type() == 'DateField':
        if isinstance(val, (date, datetime)):
            return val.date() if isinstance(val, datetime) else val
        if isinstance(val, str) and val.strip():
            from django.utils.dateparse import parse_date
            parsed = parse_date(val.strip().split('T')[0])
            return parsed if parsed is not None else val

    return val


def get_model_class(model_name):
    """
    یافتن کلاس مدل جنگو بر اساس نام مدل
    """
    if not model_name:
        return None
        
    # نگاشت اختصاصی برای مدل‌های متداول پروژه
    # فاز ۲ §۲.۵ — گارد `apps.is_installed` برای مدل‌هایِ ماژولِ انبار: در نصب
    # حسابداری‌تنها این اپ‌ها وجود ندارند و نباید ایمپورت شوند.
    if model_name == 'Item':
        if not apps.is_installed('inventory'):
            return None
        from inventory.models import Item
        return Item
    elif model_name == 'CountTask':
        if not apps.is_installed('inventory'):
            return None
        from inventory.models import CountTask
        return CountTask
    elif model_name in ('CustomUser', 'User'):
        from accounts.models import CustomUser
        return CustomUser
    elif model_name == 'Warehouse':
        if not apps.is_installed('warehouses'):
            return None
        from warehouses.models import Warehouse
        return Warehouse
    elif model_name == 'CustomRole':
        from accounts.models import CustomRole
        return CustomRole

    # جستجوی عمومی در تمامی اپ‌های رجیستر شده جنگو
    for model in apps.get_models():
        if model.__name__.lower() == model_name.lower():
            return model
            
    return None


def get_instance_for_model(model_cls, object_id, for_update=False):
    """
    یافتن رکورد در دیتابیس (با پشتیبانی از رکوردهای حذف نرم و قفل بدبینانه سطری)
    """
    if not model_cls or not object_id:
        return None

    if hasattr(model_cls, 'all_objects'):
        qs = model_cls.all_objects.filter(pk=object_id)
    else:
        qs = model_cls.objects.filter(pk=object_id)

    if for_update and transaction.get_connection().in_atomic_block:
        qs = qs.select_for_update()

    return qs.first()


def get_revert_preview(log_entry):
    """
    تولید پیش‌نمایش تفاوت‌ها و بررسی تداخل وضعیت زنده با مقادیر قبل از تغییر
    """
    if isinstance(log_entry, (int, str)):
        try:
            log_entry = AuditLog.objects.get(id=int(log_entry))
        except (AuditLog.DoesNotExist, ValueError):
            return {
                'can_revert': False,
                'message': 'لاگ ممیزی مورد نظر یافت نشد.',
                'target_model': 'نامشخص',
                'target_object_id': '—',
                'target_repr': '—',
                'changes': []
            }

    if not isinstance(log_entry, AuditLog):
        return {
            'can_revert': False,
            'message': 'لاگ نامعتبر است.',
            'target_model': 'نامشخص',
            'target_object_id': '—',
            'target_repr': '—',
            'changes': []
        }

    base_resp = {
        'action': log_entry.action,
        'action_display': log_entry.get_action_display() if hasattr(log_entry, 'get_action_display') else log_entry.action,
        'target_model': log_entry.target_model or 'عمومی / سیستم',
        'target_object_id': log_entry.target_object_id or '—',
        'target_repr': log_entry.target_repr or log_entry.target_object_id or 'رویداد ممیزی',
        'changes': []
    }

    if log_entry.action not in ('UPDATE', 'DELETE', 'CREATE', 'BULK_UPDATE'):
        return {
            **base_resp,
            'can_revert': False,
            'message': f"عملیات از نوع «{base_resp['action_display']}» قابلیت بازگردانی خودکار ندارد (امکان بازگردانی تنها برای ایجاد، ویرایش و حذف اسناد فعال است)."
        }

    model_cls = get_model_class(log_entry.target_model)
    if not model_cls:
        return {
            **base_resp,
            'can_revert': False,
            'message': f"مدل هدف «{log_entry.target_model or 'نامشخص'}» در سیستم یافت نشد یا این رویداد مربوط به عملیات سیستمی سراسری است."
        }

    instance = get_instance_for_model(model_cls, log_entry.target_object_id)
    before_state = log_entry.before_state or {}
    after_state = log_entry.after_state or {}

    changes = []
    has_conflict = False

    if log_entry.action in ('UPDATE', 'BULK_UPDATE'):
        if not instance:
            return {
                **base_resp,
                'can_revert': False,
                'message': 'رکورد هدف در حال حاضر در پایگاه داده وجود ندارد (احتمالاً پیش از این حذف شده است).'
            }

        if not before_state:
            return {
                **base_resp,
                'can_revert': False,
                'message': 'اطلاعات وضعیت پیشین (before_state) برای این لاگ ثبت نشده است.'
            }

        # بررسی فیلد به فیلد وضعیت فعلی با مقادیر بعد و قبل لاگ
        for field_name, old_val in before_state.items():
            if field_name in EXCLUDED_REVERT_FIELDS or is_masked_or_sensitive(field_name, old_val):
                continue

            current_val = getattr(instance, field_name, None)
            expected_after_val = after_state.get(field_name)

            # تبدیل ForeignKey یا مقادیر خاص
            if hasattr(current_val, 'pk'):
                current_val_repr = str(current_val.pk)
            else:
                current_val_repr = current_val

            # بررسی دقیق تداخل با نرمال‌سازی نوع داده
            norm_current = normalize_for_comparison(current_val_repr)
            norm_expected = normalize_for_comparison(expected_after_val)

            field_conflict = False
            if norm_expected is not None and norm_current is not None and norm_current != norm_expected:
                field_conflict = True
                has_conflict = True

            field_label = field_name
            if hasattr(model_cls, '_meta') and hasattr(model_cls._meta, 'get_field'):
                try:
                    f_obj = model_cls._meta.get_field(field_name)
                    field_label = getattr(f_obj, 'verbose_name', field_name) or field_name
                except Exception:
                    field_label = field_name

            changes.append({
                'field': field_name,
                'label': field_label,
                'current_value': str(current_val) if current_val is not None else '—',
                'target_revert_value': str(old_val) if old_val is not None else '—',
                'has_conflict': field_conflict
            })

        return {
            **base_resp,
            'can_revert': True,
            'has_conflict': has_conflict,
            'changes': changes,
            'summary': f"بازگردانی {len(changes)} فیلد به وضعیت ثبت‌شده در لاگ #{log_entry.id}"
        }

    elif log_entry.action == 'DELETE':
        if instance and getattr(instance, 'is_deleted', False) is False:
            return {
                **base_resp,
                'can_revert': False,
                'message': 'این رکورد در حال حاضر در دیتابیس فعال است و حذف نشده است.'
            }

        for field_name, old_val in before_state.items():
            if field_name in EXCLUDED_REVERT_FIELDS or is_masked_or_sensitive(field_name, old_val):
                continue
            changes.append({
                'field': field_name,
                'label': field_name,
                'current_value': 'حذف شده',
                'target_revert_value': str(old_val) if old_val is not None else '—',
                'has_conflict': False
            })

        return {
            **base_resp,
            'can_revert': True,
            'has_conflict': False,
            'changes': changes,
            'summary': f"احیا و بازیابی کامل رکورد حذف‌شده با {len(changes)} مشخصه پیشین"
        }

    elif log_entry.action == 'CREATE':
        if not instance or getattr(instance, 'is_deleted', False) is True:
            return {
                **base_resp,
                'can_revert': False,
                'message': 'رکورد ایجادشده پیش از این حذف شده است.'
            }

        changes.append({
            'field': 'status',
            'label': 'وضعیت رکورد',
            'current_value': 'موجود و فعال',
            'target_revert_value': 'حذف و خروج از دیتابیس',
            'has_conflict': False
        })

        return {
            **base_resp,
            'can_revert': True,
            'has_conflict': False,
            'changes': changes,
            'summary': f"حذف و پاکسازی رکوردی که در لاگ #{log_entry.id} ایجاد شده بود"
        }

    return {
        **base_resp,
        'can_revert': False,
        'message': 'نوع عملیات پشتیبانی نمی‌شود.'
    }


def revert_log_entry(log_entry, user, reason=None, ip_address=None):
    """
    اجرای بازگردانی تراکنش لاگ در یک تراکنش اتمیک و ثبت لاگ ROLLBACK جدید
    """
    if isinstance(log_entry, (int, str)):
        try:
            log_entry = AuditLog.objects.get(id=int(log_entry))
        except (AuditLog.DoesNotExist, ValueError):
            return {'success': False, 'error': 'لاگ ممیزی مورد نظر یافت نشد.'}

    preview = get_revert_preview(log_entry)
    if not preview.get('can_revert'):
        return {
            'success': False,
            'error': preview.get('message', 'امکان بازگردانی این لاگ وجود ندارد.')
        }

    model_cls = get_model_class(log_entry.target_model)
    before_state = log_entry.before_state or {}

    try:
        with transaction.atomic():
            instance = get_instance_for_model(model_cls, log_entry.target_object_id, for_update=True)
            if not instance and log_entry.action in ('UPDATE', 'BULK_UPDATE'):
                return {'success': False, 'error': 'رکورد هدف در حال حاضر در پایگاه داده وجود ندارد (احتمالاً پیش از این حذف شده است).'}

            rollback_log = None
            
            # ۱. بازگردانی ویرایش (UPDATE)
            if log_entry.action in ('UPDATE', 'BULK_UPDATE'):
                live_before = model_to_dict(instance, exclude=['photo']) if hasattr(instance, '_meta') else {}
                
                for field_name, old_val in before_state.items():
                    if field_name in EXCLUDED_REVERT_FIELDS or is_masked_or_sensitive(field_name, old_val):
                        continue
                    if hasattr(instance, field_name):
                        try:
                            coerced_val = coerce_field_value(model_cls, field_name, old_val)
                            field_obj = model_cls._meta.get_field(field_name) if hasattr(model_cls, '_meta') else None
                            if field_obj and field_obj.is_relation and field_obj.many_to_one:
                                if hasattr(coerced_val, 'pk'):
                                    setattr(instance, field_name, coerced_val)
                                else:
                                    pk_val = int(old_val) if (isinstance(old_val, int) or (isinstance(old_val, str) and old_val.isdigit())) else old_val
                                    setattr(instance, f"{field_name}_id", pk_val)
                            else:
                                setattr(instance, field_name, coerced_val)
                        except Exception as e:
                            logger.warning(f"Field coerce fallback for {field_name}: {e}")
                            setattr(instance, field_name, old_val)

                setattr(instance, '_is_rollback_operation', True)
                instance.save()
                live_after = model_to_dict(instance, exclude=['photo']) if hasattr(instance, '_meta') else {}
                diff_b, diff_a = calculate_model_diff(live_before, live_after)

                rollback_log = log_audit_event(
                    module=log_entry.module,
                    action='ROLLBACK',
                    severity='warning',
                    target_model=log_entry.target_model,
                    target_object_id=instance.id,
                    target_repr=f"بازگردانی: {log_entry.target_repr or str(instance)}",
                    user=user,
                    warehouse=getattr(instance, 'warehouse', None) or log_entry.warehouse,
                    before_state=diff_b or live_before,
                    after_state=diff_a or live_after,
                    details={
                        'reverted_from_log_id': log_entry.id,
                        'original_action': log_entry.action,
                        'reason': reason or 'بازگردانی داده به نسخه پیشین توسط مدیر'
                    },
                    ip_address=ip_address
                )

            # ۲. بازگردانی حذف (DELETE)
            elif log_entry.action == 'DELETE':
                if instance and hasattr(instance, 'is_deleted'):
                    # احیای سافت‌دلیت
                    instance.is_deleted = False
                    for field_name, old_val in before_state.items():
                        if field_name in EXCLUDED_REVERT_FIELDS or is_masked_or_sensitive(field_name, old_val):
                            continue
                        if hasattr(instance, field_name):
                            try:
                                coerced_val = coerce_field_value(model_cls, field_name, old_val)
                                field_obj = model_cls._meta.get_field(field_name) if hasattr(model_cls, '_meta') else None
                                if field_obj and field_obj.is_relation and field_obj.many_to_one:
                                    if hasattr(coerced_val, 'pk'):
                                        setattr(instance, field_name, coerced_val)
                                    else:
                                        pk_val = int(old_val) if (isinstance(old_val, int) or (isinstance(old_val, str) and old_val.isdigit())) else old_val
                                        setattr(instance, f"{field_name}_id", pk_val)
                                else:
                                    setattr(instance, field_name, coerced_val)
                            except Exception as e:
                                logger.warning(f"Field restore fallback for {field_name}: {e}")
                                setattr(instance, field_name, old_val)
                    setattr(instance, '_is_rollback_operation', True)
                    instance.save()
                else:
                    # ایجاد مجدد رکورد در جدول
                    create_kwargs = {}
                    for field_name, old_val in before_state.items():
                        if field_name in ('id', 'pk', 'password', 'photo') or is_masked_or_sensitive(field_name, old_val):
                            continue
                        if hasattr(model_cls, field_name):
                            coerced_val = coerce_field_value(model_cls, field_name, old_val)
                            field_obj = model_cls._meta.get_field(field_name) if hasattr(model_cls, '_meta') else None
                            if field_obj and field_obj.is_relation and field_obj.many_to_one:
                                if hasattr(coerced_val, 'pk'):
                                    create_kwargs[field_name] = coerced_val
                                else:
                                    pk_val = int(old_val) if (isinstance(old_val, int) or (isinstance(old_val, str) and old_val.isdigit())) else old_val
                                    create_kwargs[f"{field_name}_id"] = pk_val
                            else:
                                create_kwargs[field_name] = coerced_val
                    instance = model_cls.objects.create(**create_kwargs)

                rollback_log = log_audit_event(
                    module=log_entry.module,
                    action='ROLLBACK',
                    severity='warning',
                    target_model=log_entry.target_model,
                    target_object_id=instance.id,
                    target_repr=f"احیا و بازگردانی: {log_entry.target_repr or str(instance)}",
                    user=user,
                    warehouse=getattr(instance, 'warehouse', None) or log_entry.warehouse,
                    before_state={'status': 'حذف شده'},
                    after_state=before_state,
                    details={
                        'reverted_from_log_id': log_entry.id,
                        'original_action': log_entry.action,
                        'reason': reason or 'احیای رکورد حذف شده توسط مدیر'
                    },
                    ip_address=ip_address
                )

            # ۳. بازگردانی ایجاد (CREATE)
            elif log_entry.action == 'CREATE':
                if instance:
                    if hasattr(instance, 'is_deleted'):
                        instance.is_deleted = True
                        instance.save()
                    else:
                        instance.delete()

                rollback_log = log_audit_event(
                    module=log_entry.module,
                    action='ROLLBACK',
                    severity='warning',
                    target_model=log_entry.target_model,
                    target_object_id=log_entry.target_object_id,
                    target_repr=f"حذف رکوردی که در لاگ #{log_entry.id} ساخته شده بود",
                    user=user,
                    warehouse=log_entry.warehouse,
                    before_state=log_entry.after_state,
                    after_state={'status': 'حذف شده'},
                    details={
                        'reverted_from_log_id': log_entry.id,
                        'original_action': log_entry.action,
                        'reason': reason or 'لغو رکورد ایجاد شده توسط مدیر'
                    },
                    ip_address=ip_address
                )

            return {
                'success': True,
                'message': f"عملیات لاگ #{log_entry.id} با موفقیت بازگردانی شد.",
                'rollback_log_id': rollback_log.id if rollback_log else None
            }
    except Exception as e:
        logger.error(f"Error reverting audit log #{getattr(log_entry, 'id', 'unknown')}: {e}", exc_info=True)
        return {
            'success': False,
            'error': f"خطا در اجرای بازگردانی داده: {str(e)}"
        }


def preview_point_in_time_rollback(target_datetime, warehouse_id=None, module=None, target_model=None):
    """
    شبیه‌سازی و پیش‌نمایش زنجیره‌ای بازگردانی داده‌ها به یک تاریخ و زمان مشخص
    """
    if not target_datetime:
        return {
            'can_rollback': False,
            'message': 'تاریخ و زمان هدف جهت بازگردانی مشخص نشده است.',
            'total_logs': 0,
            'total_records': 0,
            'items_preview': [],
            'models_breakdown': {}
        }

    # فیلتر لاگ‌ها از تاریخ هدف تا زمان حال
    qs = AuditLog.objects.filter(
        created_at__gte=target_datetime,
        action__in=['UPDATE', 'DELETE', 'CREATE', 'BULK_UPDATE']
    ).order_by('-created_at', '-id')

    if warehouse_id and str(warehouse_id) != 'ALL':
        qs = qs.filter(warehouse_id=warehouse_id)
    if module:
        qs = qs.filter(module=module)
    if target_model:
        qs = qs.filter(target_model=target_model)

    total_logs = qs.count()
    if total_logs == 0:
        return {
            'can_rollback': True,
            'message': 'هیچ رویداد ممیزی مشمول بازگردانی در این بازه زمانی یافت نشد.',
            'total_logs': 0,
            'total_records': 0,
            'items_preview': [],
            'models_breakdown': {},
            'target_datetime': str(target_datetime)
        }

    # دسته‌بندی لاگ‌ها بر اساس رکورد هدف: (target_model, target_object_id)
    from collections import defaultdict
    logs_by_target = defaultdict(list)
    models_count = defaultdict(int)

    for log in qs:
        key = (log.target_model or 'Unknown', str(log.target_object_id or '—'))
        logs_by_target[key].append(log)
        models_count[log.target_model or 'عمومی'] += 1

    items_preview = []
    has_any_conflict = False

    for (model_name, obj_id), target_logs in logs_by_target.items():
        newest_log = target_logs[0]
        oldest_log = target_logs[-1]

        model_cls = get_model_class(model_name)
        instance = get_instance_for_model(model_cls, obj_id) if model_cls and obj_id != '—' else None

        original_before = oldest_log.before_state or {}
        target_repr = newest_log.target_repr or oldest_log.target_repr or f"{model_name} #{obj_id}"
        
        record_changes = []
        for field_name, old_val in original_before.items():
            if field_name in EXCLUDED_REVERT_FIELDS or is_masked_or_sensitive(field_name, old_val):
                continue
            cur_val = getattr(instance, field_name, None) if instance else 'حذف شده'
            
            norm_cur = normalize_for_comparison(cur_val)
            norm_old = normalize_for_comparison(old_val)
            
            field_conflict = False
            if norm_cur is not None and norm_old is not None and norm_cur != norm_old:
                field_conflict = True
                has_any_conflict = True

            field_label = field_name
            if model_cls and hasattr(model_cls, '_meta') and hasattr(model_cls._meta, 'get_field'):
                try:
                    f_obj = model_cls._meta.get_field(field_name)
                    field_label = getattr(f_obj, 'verbose_name', field_name) or field_name
                except Exception:
                    field_label = field_name

            record_changes.append({
                'field': field_name,
                'label': field_label,
                'current_value': str(cur_val) if cur_val is not None else '—',
                'target_revert_value': str(old_val) if old_val is not None else '—',
                'has_conflict': field_conflict
            })

        items_preview.append({
            'target_model': model_name,
            'target_object_id': obj_id,
            'target_repr': target_repr,
            'logs_count': len(target_logs),
            'first_action': oldest_log.get_action_display() if hasattr(oldest_log, 'get_action_display') else oldest_log.action,
            'last_action': newest_log.get_action_display() if hasattr(newest_log, 'get_action_display') else newest_log.action,
            'changes': record_changes[:10]
        })

    return {
        'can_rollback': True,
        'has_conflict': has_any_conflict,
        'total_logs': total_logs,
        'total_records': len(logs_by_target),
        'models_breakdown': dict(models_count),
        'target_datetime': str(target_datetime),
        'items_preview': items_preview,
        'summary': f"بازگردانی زنجیره‌ای {total_logs} رویداد ممیزی روی {len(logs_by_target)} رکورد به وضعیت تاریخ {target_datetime}"
    }


def execute_point_in_time_rollback(target_datetime, user, warehouse_id=None, module=None, target_model=None, reason=None, ip_address=None):
    """
    اجرای زنجیره‌ای و اتمیک بازگردانی کلیه لاگ‌های ثبت‌شده از تاریخ target_datetime به بعد
    """
    if not target_datetime:
        return {'success': False, 'error': 'تاریخ هدف مشخص نشده است.'}

    # لاگ‌ها به ترتیب معکوس زمانی لغو می‌شوند
    qs = AuditLog.objects.filter(
        created_at__gte=target_datetime,
        action__in=['UPDATE', 'DELETE', 'CREATE', 'BULK_UPDATE']
    ).order_by('-created_at', '-id')

    if warehouse_id and str(warehouse_id) != 'ALL':
        qs = qs.filter(warehouse_id=warehouse_id)
    if module:
        qs = qs.filter(module=module)
    if target_model:
        qs = qs.filter(target_model=target_model)

    logs_list = list(qs)
    total_logs = len(logs_list)

    if total_logs == 0:
        return {'success': True, 'reverted_count': 0, 'message': 'هیچ رکوردی برای بازگردانی در این بازه زمانی وجود نداشت.'}

    success_count = 0
    errors = []

    with transaction.atomic():
        for log_entry in logs_list:
            sid = transaction.savepoint()
            try:
                res = revert_log_entry(
                    log_entry,
                    user=user,
                    reason=f"بازگردانی به تاریخ {target_datetime}: {reason or 'عملیات زنجیره‌ای'}",
                    ip_address=ip_address
                )
                if res.get('success'):
                    success_count += 1
                    transaction.savepoint_commit(sid)
                else:
                    transaction.savepoint_rollback(sid)
                    errors.append(f"لاگ #{log_entry.id} ({log_entry.target_repr}): {res.get('error')}")
            except Exception as e:
                transaction.savepoint_rollback(sid)
                errors.append(f"خطای سیستمی در لاگ #{log_entry.id}: {str(e)}")

        if errors and success_count == 0:
            transaction.set_rollback(True)
            return {
                'success': False,
                'error': f"بازگردانی با شکست مواجه شد: {errors[0]}",
                'errors': errors
            }

        # ثبت لاگ کلان سیستمی برای رویداد Point-in-Time Rollback با حروف کوچک 'system'
        log_audit_event(
            module='system',
            action='ROLLBACK',
            severity='critical',
            target_repr=f"بازگردانی جامع سیستم به تاریخ {target_datetime}",
            user=user,
            warehouse=logs_list[0].warehouse if logs_list else None,
            details={
                'operation': 'POINT_IN_TIME_ROLLBACK',
                'target_datetime': str(target_datetime),
                'reverted_logs_count': success_count,
                'failed_logs_count': len(errors),
                'reason': reason or 'بازگردانی جامع نقطه‌ای در زمان توسط مدیر'
            },
            ip_address=ip_address
        )

    return {
        'success': True,
        'reverted_count': success_count,
        'total_attempted': total_logs,
        'errors': errors,
        'message': f"{success_count} رویداد ممیزی با موفقیت به نقطه زمانی {target_datetime} بازگردانی شدند." + (f" ({len(errors)} خطا)" if errors else "")
    }
