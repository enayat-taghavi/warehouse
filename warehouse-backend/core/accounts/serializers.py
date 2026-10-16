from django.apps import apps
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth.models import Group, Permission
from .models import CustomUser, CustomRole


# فاز ۲ §۲.۳ و گام ۳-ب — حل اختیاری اکستنشن انبار برای کاربران.
def _get_user_warehouse_extension():
    """دریافت اکستنشن انبار از نقطه توسعه user_extensions."""
    from platform_core.registry import contributions
    for ext in contributions('user_extensions'):
        if getattr(ext, 'name', '') == 'warehouses' or hasattr(ext, 'get_serializer_field'):
            return ext
    return None

class PermissionSerializer(serializers.ModelSerializer):
    is_sensitive = serializers.SerializerMethodField()

    class Meta:
        model = Permission
        fields = ['id', 'name', 'codename', 'is_sensitive']

    def get_is_sensitive(self, obj):
        from .models import SENSITIVE_PERMISSION_CODENAMES
        return obj.codename in SENSITIVE_PERMISSION_CODENAMES

class CustomRoleSerializer(serializers.ModelSerializer):
    permissions = serializers.PrimaryKeyRelatedField(many=True, queryset=Permission.objects.all(), required=False)
    user_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=CustomUser.objects.all(), source='user_set', required=False
    )
    users_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = CustomRole
        fields = [
            'id', 'name', 'title', 'color', 'parent', 'permissions',
            'user_ids', 'users_count', 'created_at', 'updated_at',
            'created_by', 'modified_by'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by', 'modified_by', 'users_count']

    def get_users_count(self, obj):
        # استفاده از len روی کش prefetch_related به جای count دیتابیسی جهت رفع N+1 Query
        return len(obj.user_set.all())

    def validate_parent(self, parent):
        if parent is None:
            return None
        if self.instance and parent.id == self.instance.id:
            raise serializers.ValidationError("یک نقش سازمانی نمی‌تواند نقش والد خودش باشد.")
        if self.instance:
            curr = parent
            visited = set()
            while curr:
                if curr.id == self.instance.id:
                    raise serializers.ValidationError("انتساب این نقش به عنوان والد موجب بروز وابستگی چرخه‌ای در ساختار درختی نقش‌ها می‌گردد.")
                if curr.id in visited:
                    break
                visited.add(curr.id)
                curr = curr.parent
        return parent

    def validate_permissions(self, permissions):
        try:
            from platform_core.module_catalog import get_disallowed_permission_codenames
            disallowed = get_disallowed_permission_codenames()
            if disallowed:
                invalid_perms = [p for p in permissions if p.codename in disallowed]
                if invalid_perms:
                    invalid_names = ", ".join(p.codename for p in invalid_perms[:3])
                    raise serializers.ValidationError(
                        f"امکان انتساب مجوزهای «{invalid_names}» وجود ندارد؛ ماژول مرتبط با این دسترسی‌ها روی سامانه نصب یا فعال نیست."
                    )
        except serializers.ValidationError:
            raise
        except Exception:
            pass
        return permissions

    def create(self, validated_data):
        users = validated_data.pop('user_set', None)
        permissions = validated_data.pop('permissions', None)
        instance = super().create(validated_data)
        if permissions is not None:
            instance.permissions.set(permissions)
        if users is not None:
            instance.user_set.set(users)
        return instance

    def update(self, instance, validated_data):
        users = validated_data.pop('user_set', None)
        permissions = validated_data.pop('permissions', None)
        instance = super().update(instance, validated_data)
        if permissions is not None:
            instance.permissions.set(permissions)
        if users is not None:
            instance.user_set.set(users)
        return instance

def _sync_user_company_access(user, company_ids=None, default_company_id=None, company_accesses_data=None, actor=None):
    """
    ثبت و همگام‌سازی تراکنشی رکوردهای دسترسی کاربر به شرکت‌ها (UserCompanyAccess).
    actor غیرسوپریوزر فقط دسترسی شرکت‌های مجاز خودش را می‌دهد، تغییر می‌دهد یا حذف می‌کند؛
    دسترسی‌های موجود کاربر در شرکت‌های دیگر دست‌نخورده می‌مانند.
    """
    from companies.access import derived_company_ids
    from companies.models import UserCompanyAccess, Company

    target_accesses = {}
    if company_accesses_data is not None and isinstance(company_accesses_data, list):
        for item in company_accesses_data:
            if isinstance(item, dict) and 'company_id' in item:
                try:
                    cid = int(item['company_id'])
                    target_accesses[cid] = {
                        'access_level': item.get('access_level', 'workspace_full'),
                        'role_in_company': item.get('role_in_company', ''),
                        'is_default': bool(item.get('is_default', False))
                    }
                except (ValueError, TypeError):
                    pass
    elif company_ids is not None:
        for cid in company_ids:
            try:
                cid_int = int(cid)
                target_accesses[cid_int] = {
                    'access_level': 'workspace_full',
                    'role_in_company': '',
                    'is_default': (default_company_id is not None and cid_int == int(default_company_id))
                }
            except (ValueError, TypeError):
                continue

    if company_ids is None and company_accesses_data is None:
        if default_company_id is not None:
            UserCompanyAccess.objects.filter(user=user).update(is_default=False)
            UserCompanyAccess.objects.filter(user=user, company_id=default_company_id).update(is_default=True)
            def_comp = Company.objects.filter(id=default_company_id).first()
            if def_comp and user.company != def_comp.name:
                user.company = def_comp.name
                user.save(update_fields=['company'])
        return

    # محدودهٔ نویسندهٔ غیرسوپریوزر: همان شرکت‌های مجاز خودش (دسترسی صریح workspace_full یا انتساب فعال)
    scope_ids = None
    if actor is not None and getattr(actor, 'is_authenticated', False) and not actor.is_superuser:
        scope_ids = set(UserCompanyAccess.objects.filter(
            user=actor, access_level='workspace_full', company__is_active=True
        ).values_list('company_id', flat=True))
        scope_ids |= set(Company.objects.filter(
            id__in=derived_company_ids(actor), is_active=True
        ).values_list('id', flat=True))
        existing_ids = set(UserCompanyAccess.objects.filter(user=user).values_list('company_id', flat=True))
        outside = [cid for cid in target_accesses if cid not in scope_ids and cid not in existing_ids]
        if outside:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('دسترسی فقط برای شرکت‌های مجاز شما قابل اعطاست.')
        # دسترسی موجودِ بیرون از قلمرو نویسنده تغییر نمی‌کند
        for cid in [cid for cid in target_accesses if cid not in scope_ids]:
            target_accesses.pop(cid)

    if target_accesses:
        has_default = any(info['is_default'] for info in target_accesses.values())
        if not has_default:
            if default_company_id and int(default_company_id) in target_accesses:
                target_accesses[int(default_company_id)]['is_default'] = True
            else:
                first_cid = next(iter(target_accesses))
                target_accesses[first_cid]['is_default'] = True

    # حذف شرکت‌هایی که در لیست جدید نیستند (نویسندهٔ غیرسوپریوزر فقط در قلمرو خودش حذف می‌کند)
    stale = UserCompanyAccess.objects.filter(user=user).exclude(company_id__in=target_accesses.keys())
    if scope_ids is not None:
        stale = stale.filter(company_id__in=scope_ids)
    stale.delete()

    # ایجاد یا به‌روزرسانی رکوردهای مجاز
    valid_companies = {c.id: c for c in Company.objects.filter(id__in=target_accesses.keys())}
    default_comp_name = None
    for cid, info in target_accesses.items():
        if cid in valid_companies:
            UserCompanyAccess.objects.update_or_create(
                user=user,
                company_id=cid,
                defaults={
                    'access_level': info.get('access_level', 'workspace_full'),
                    'role_in_company': info.get('role_in_company', ''),
                    'is_default': info.get('is_default', False)
                }
            )
            if info.get('is_default'):
                default_comp_name = valid_companies[cid].name

    if default_comp_name and user.company != default_comp_name:
        user.company = default_comp_name
        user.save(update_fields=['company'])


class UserDirectorySerializer(serializers.ModelSerializer):
    """فهرست کمینهٔ کاربران برای کشوی انتساب به بخش (راهبر تشکیلات): بدون اطلاعات شخصی و مجوزها"""
    class Meta:
        model = CustomUser
        fields = ['id', 'username', 'first_name', 'last_name', 'is_active']
        read_only_fields = fields


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=False,
        help_text="Password for initial creation or update"
    )
    groups = serializers.PrimaryKeyRelatedField(many=True, queryset=Group.objects.all(), required=False)
    user_permissions = serializers.PrimaryKeyRelatedField(many=True, queryset=Permission.objects.all(), required=False)
    roles = serializers.ListField(
        child=serializers.CharField(),
        write_only=True,
        required=False,
        help_text="List of group names to assign to the user"
    )
    company_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
        help_text="List of company IDs user has access to"
    )
    default_company_id = serializers.IntegerField(
        write_only=True,
        required=False,
        allow_null=True,
        help_text="Primary/default company ID"
    )
    company_accesses = serializers.ListField(
        write_only=True,
        required=False,
        help_text="Detailed company access list with access_level"
    )
    # اعلام صریح فیلد تا در صورت عدم نصب اپ warehouses، خطای فیلد نامعتبر مدل در ساخت سوپر رخ ندهد
    assigned_warehouses = serializers.SerializerMethodField(required=False)

    class Meta:
        model = CustomUser
        fields = [
            'id', 'username', 'first_name', 'last_name', 'email', 'password',
            'national_code', 'phone_number', 'operational_zone',
            'supervisor', 'company', 'address', 'avatar', 'blood_type', 'emergency_contact', 'is_active', 'date_joined', 'last_login',
            'updated_at', 'created_by', 'modified_by',
            'groups', 'user_permissions', 'assigned_warehouses', 'is_superuser',
            'requires_password_change', 'ui_preferences', 'roles',
            'company_ids', 'default_company_id', 'company_accesses'
        ]
        extra_kwargs = {
            'email': {
                'required': False, 'allow_blank': True, 'allow_null': True,
                'error_messages': {'invalid': 'فرمت آدرس ایمیل واردشده نامعتبر است.'}
            },
            'phone_number': {'required': False, 'allow_blank': True, 'allow_null': True},
            'password': {'write_only': True, 'required': False},
        }

    def get_fields(self):
        # فاز ۲ §۲.۳ و گام ۳-ب — فیلد `assigned_warehouses` از طریق اکستنشن انبار
        fields = super().get_fields()
        wh_ext = _get_user_warehouse_extension()
        if wh_ext is not None:
            fields['assigned_warehouses'] = wh_ext.get_serializer_field()
        else:
            fields.pop('assigned_warehouses', None)
        return fields

    def get_assigned_warehouses(self, obj):
        if hasattr(obj, 'assigned_warehouses'):
            return list(obj.assigned_warehouses.values_list('id', flat=True))
        return []

    def validate_email(self, value):
        if not value:
            return ""
        val = str(value).strip()
        if not val:
            return ""
        from django.core.validators import validate_email as django_validate_email
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            django_validate_email(val)
        except DjangoValidationError:
            raise serializers.ValidationError("فرمت آدرس ایمیل نامعتبر است (مانند user@example.com).")
        return val

    def validate_password(self, value):
        if not value:
            return value
        if len(value) < 6:
            raise serializers.ValidationError("کلمه عبور باید حداقل ۶ کاراکتر باشد.")
        return value

    def validate_phone_number(self, value):
        if not value:
            return None
        from .excel_utils import normalize_digits
        import re
        raw = normalize_digits(str(value).strip())
        digits = re.sub(r'[^\d+]', '', raw)
        if digits.startswith('+98'):
            digits = '0' + digits[3:]
        elif digits.startswith('0098'):
            digits = '0' + digits[4:]
        elif digits.startswith('98') and len(digits) == 12:
            digits = '0' + digits[2:]
        elif digits.startswith('9') and len(digits) == 10:
            digits = '0' + digits

        if not re.match(r'^09\d{9}$', digits):
            raise serializers.ValidationError(
                "شماره تلفن همراه نامعتبر است. شماره معتبر باید با 09 شروع شده و ۱۱ رقم باشد (مانند 09123456789)."
            )

        qs = CustomUser.objects.filter(phone_number=digits)
        if self.instance:
            qs = qs.exclude(id=self.instance.id)
        if qs.exists():
            raise serializers.ValidationError("این شماره تلفن همراه قبلاً به حساب کاربری دیگری تخصیص داده شده است.")
        return digits

    def validate_supervisor(self, supervisor):
        if supervisor is None:
            return None
        if self.instance and supervisor.id == self.instance.id:
            raise serializers.ValidationError("یک کاربر نمی‌تواند سرپرست مستقیم خودش باشد.")
        if self.instance:
            curr = supervisor
            visited = set()
            while curr:
                if curr.id == self.instance.id:
                    raise serializers.ValidationError("انتساب این سرپرست موجب بروز وابستگی چرخه‌ای در ساختار سازمانی می‌گردد.")
                if curr.id in visited:
                    break
                visited.add(curr.id)
                curr = curr.supervisor
        return supervisor

    def validate_national_code(self, value):
        if not value:
            return None
        import re
        from common.date_utils import normalize_digits
        # کد ملی کاربر اختیاری است: ورودی بی‌رقم (مثل فاصلهٔ خالی) یعنی «بدون کد ملی»، نه خطا (نگهبان ۴۱).
        # تابع مشترک برای پرسنل روی ورودی خالی همچنان خطا می‌دهد.
        if not re.sub(r'\D', '', normalize_digits(str(value).strip())):
            return None
        from common.validators import validate_iranian_national_code
        try:
            return validate_iranian_national_code(value)
        except ValueError as e:
            raise serializers.ValidationError(str(e))

    def validate(self, attrs):
        if not self.instance:
            phone = attrs.get('phone_number')
            if not phone:
                raise serializers.ValidationError({'phone_number': 'وارد کردن شماره تلفن همراه الزامی است.'})

        # اعتبارسنجی شرکت‌ها و تطابق با انبارها
        from django.apps import apps
        company_ids = attrs.get('company_ids')
        default_company_id = attrs.get('default_company_id')
        company_accesses = attrs.get('company_accesses')

        active_comp_ids = set()
        if company_ids is not None:
            active_comp_ids.update(company_ids)
        elif company_accesses is not None and isinstance(company_accesses, list):
            for item in company_accesses:
                if isinstance(item, dict) and 'company_id' in item:
                    try:
                        active_comp_ids.add(int(item['company_id']))
                    except (ValueError, TypeError):
                        pass
        elif self.instance:
            active_comp_ids.update(self.instance.company_accesses.values_list('company_id', flat=True))

        if default_company_id and active_comp_ids and default_company_id not in active_comp_ids:
            raise serializers.ValidationError({'default_company_id': 'شرکت پیش‌فرض باید یکی از شرکت‌های مجاز کاربر باشد.'})

        # اعتبارسنجی اینکه انبارهای انتسابی متعلق به شرکت‌های کاربر باشند (به جز ادمین کل)
        assigned_warehouses = attrs.get('assigned_warehouses')
        is_su = attrs.get('is_superuser', getattr(self.instance, 'is_superuser', False))
        if not is_su and assigned_warehouses and active_comp_ids:
            for wh in assigned_warehouses:
                wh_cid = getattr(wh, 'company_id', None)
                if wh_cid is not None and wh_cid not in active_comp_ids:
                    raise serializers.ValidationError({
                        'assigned_warehouses': f'انبار «{getattr(wh, "name", str(wh))}» متعلق به شرکت دیگری است و به شرکت‌های مجاز این کاربر تعلق ندارد.'
                    })

        return super().validate(attrs)

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret['avatar'] = instance.avatar.url if instance.avatar else None
        # Build rich role objects from CustomRole
        role_data = []
        for group in instance.groups.all():
            try:
                cr = group.customrole
                role_data.append({
                    'id': cr.id, 'name': cr.name,
                    'title': cr.title, 'color': cr.color,
                })
            except CustomRole.DoesNotExist:
                role_data.append({
                    'id': group.id, 'name': group.name,
                    'title': group.name, 'color': '#94a3b8',
                })
        ret['roles'] = [r['name'] for r in role_data]
        ret['role_objects'] = role_data

        # Multi-company accesses
        try:
            from django.apps import apps
            if apps.is_installed('companies'):
                accesses = list(instance.company_accesses.select_related('company').all())
                comp_access_data = []
                comp_ids = []
                def_cid = None
                for acc in accesses:
                    if acc.company:
                        comp_ids.append(acc.company_id)
                        is_def = bool(acc.is_default)
                        if is_def:
                            def_cid = acc.company_id
                        comp_access_data.append({
                            'company_id': acc.company_id,
                            'company_name': acc.company.name,
                            'company_code': acc.company.code,
                            'access_level': acc.access_level,
                            'role_in_company': acc.role_in_company or '',
                            'is_default': is_def
                        })

                # همچنین شرکت‌های متناظر با منابع دسترسی مشتق ثبت‌شده در هسته (گام ۳)
                existing_comp_ids = set(comp_ids)
                from companies.access import derived_company_access_details
                for acc_item in derived_company_access_details(instance):
                    cid = acc_item.get('company_id')
                    if cid and cid not in existing_comp_ids:
                        existing_comp_ids.add(cid)
                        comp_ids.append(cid)
                        is_first = (def_cid is None)
                        if is_first:
                            def_cid = cid
                        item_copy = dict(acc_item)
                        item_copy['is_default'] = is_first
                        comp_access_data.append(item_copy)


                ret['company_accesses'] = comp_access_data
                ret['company_ids'] = comp_ids
                ret['default_company_id'] = def_cid if def_cid is not None else (comp_ids[0] if comp_ids else None)
                if not ret.get('company') and comp_access_data:
                    def_item = next((c for c in comp_access_data if c.get('is_default')), comp_access_data[0])
                    ret['company'] = def_item.get('company_name')
            else:
                ret['company_accesses'] = []
                ret['company_ids'] = []
                ret['default_company_id'] = None
        except Exception:
            ret['company_accesses'] = []
            ret['company_ids'] = []
            ret['default_company_id'] = None

        # Admin/superuser gets all warehouses (فقط در نصب‌های دارای اکستنشن انبار).
        wh_ext = _get_user_warehouse_extension()
        if instance.is_superuser and wh_ext is not None and 'assigned_warehouses' in ret:
            ret['assigned_warehouses'] = wh_ext.get_all_warehouse_ids()
        return ret

    def create(self, validated_data):
        from django.db import transaction
        with transaction.atomic():
            request = self.context.get('request')
            if request and hasattr(request, 'user'):
                is_req_admin = request.user.is_superuser
                if not is_req_admin and 'is_superuser' in validated_data:
                    validated_data.pop('is_superuser')

            company_ids = validated_data.pop('company_ids', None)
            default_company_id = validated_data.pop('default_company_id', None)
            company_accesses_data = validated_data.pop('company_accesses', None)

            groups = validated_data.pop('groups', None)
            roles = validated_data.pop('roles', None)
            user_permissions = validated_data.pop('user_permissions', [])
            # فاز ۲ §۲.۳ و گام ۳-ب — در نصب بدون اکستنشن انبار این کلید وجود ندارد.
            wh_ext = _get_user_warehouse_extension()
            assigned_warehouses = validated_data.pop('assigned_warehouses', []) if wh_ext is not None else []
            password = validated_data.pop('password', None)

            if not validated_data.get('email'):
                validated_data['email'] = ''

            user = CustomUser(**validated_data)
            if password:
                user.set_password(password)
            else:
                user.set_password('123456')
                user.requires_password_change = True
            user.save()

            if groups is not None:
                user.groups.set(groups)
            elif roles is not None:
                group_objs = Group.objects.filter(name__in=roles)
                user.groups.set(group_objs)

            user.user_permissions.set(user_permissions)
            if assigned_warehouses:
                user.assigned_warehouses.set(assigned_warehouses)

            _sync_user_company_access(
                user, company_ids, default_company_id, company_accesses_data,
                actor=request.user if request is not None else None
            )

            return user

    def update(self, instance, validated_data):
        from django.db.models import Q
        from rest_framework.exceptions import ValidationError
        from django.db import transaction
        
        with transaction.atomic():
            company_ids = validated_data.pop('company_ids', None)
            default_company_id = validated_data.pop('default_company_id', None)
            company_accesses_data = validated_data.pop('company_accesses', None)

            if 'email' in validated_data and not validated_data['email']:
                validated_data['email'] = ''
            
            request = self.context.get('request')
            if request and hasattr(request, 'user'):
                is_req_admin = request.user.is_superuser
                if not is_req_admin and 'is_superuser' in validated_data:
                    validated_data.pop('is_superuser')

            groups = validated_data.pop('groups', None)
            roles = validated_data.pop('roles', None)
            user_permissions = validated_data.pop('user_permissions', None)
            wh_ext = _get_user_warehouse_extension()
            assigned_warehouses = validated_data.pop('assigned_warehouses', None) if wh_ext is not None else None
            password = validated_data.pop('password', None)
            if password:
                instance.set_password(password)
            
            # Check if the user is currently an admin (superuser only)
            was_admin = instance.is_superuser
            
            # Determine new states
            new_is_active = validated_data.get('is_active', instance.is_active)
            new_is_superuser = validated_data.get('is_superuser', instance.is_superuser)
            new_has_admin_role = False  # Admin protection is based on is_superuser now
            if roles is not None:
                new_has_admin_role = False  # Role name no longer determines admin status
                
            will_be_admin = new_is_active and (new_is_superuser or new_has_admin_role)
            
            if was_admin and not will_be_admin:
                # Check if there are other active admins
                active_admins = CustomUser.objects.filter(
                    is_active=True, is_superuser=True
                ).exclude(id=instance.id).count()
                
                if active_admins == 0:
                    raise ValidationError("شما نمی‌توانید آخرین مدیر (Admin) فعال سیستم را تنزل درجه داده یا غیرفعال کنید.")
                    
            if groups is not None:
                instance.groups.set(groups)
            elif roles is not None:
                group_objs = Group.objects.filter(name__in=roles)
                instance.groups.set(group_objs)
                
            if user_permissions is not None:
                instance.user_permissions.set(user_permissions)

            if assigned_warehouses is not None and hasattr(instance, 'assigned_warehouses'):
                instance.assigned_warehouses.set(assigned_warehouses)
            
            user = super().update(instance, validated_data)

            if company_ids is not None or company_accesses_data is not None or default_company_id is not None:
                _sync_user_company_access(
                    user, company_ids, default_company_id, company_accesses_data,
                    actor=request.user if request is not None else None
                )

            return user

from axes.handlers.proxy import AxesProxyHandler
from rest_framework.exceptions import Throttled, AuthenticationFailed
from .middleware import get_client_ip
from .audit_utils import log_login_event
from .models import UserLoginLog, AuditLog

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    device_model = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        from accounts.middleware import get_user_allowed_apps
        from platform_core.registry import build_user_token_scopes, resolve_default_active_app
        allowed_apps = get_user_allowed_apps(user)
        token['allowed_apps'] = allowed_apps
        token['scopes'] = build_user_token_scopes(user)
        token['active_app'] = resolve_default_active_app(allowed_apps)

        return token

    def validate(self, attrs):
        request = self.context.get('request')
        ip_address = get_client_ip(request) if request else None
        user_agent = request.META.get('HTTP_USER_AGENT', '') if request else ''
        
        device_model = attrs.get('device_model')
        if not device_model and hasattr(self, 'initial_data') and isinstance(self.initial_data, dict):
            device_model = self.initial_data.get('device_model')
        if not device_model and request:
            device_model = request.data.get('device_model') if hasattr(request, 'data') else None
            if not device_model:
                device_model = request.headers.get('Sec-Ch-Ua-Model') or request.META.get('HTTP_SEC_CH_UA_MODEL')

        username = attrs.get(self.username_field, '')

        if request and not AxesProxyHandler.is_allowed(request):
            import math
            from django.utils.timezone import now
            from django.conf import settings
            from axes.models import AccessAttempt
            from django.db.models import Q
            
            attempt = AccessAttempt.objects.filter(Q(username=username) | Q(ip_address=ip_address)).order_by('-attempt_time').first()
            minutes_left = 15
            if attempt:
                delta = (attempt.attempt_time + settings.AXES_COOLOFF_TIME) - now()
                minutes_left = int(math.ceil(delta.total_seconds() / 60.0))
                if minutes_left < 1:
                    minutes_left = 1
            
            log_login_event(
                username=username,
                status='FAILED_LOCKED',
                ip_address=ip_address,
                user_agent=user_agent,
                device_model=device_model,
                failure_reason=f'مسدودسازی ضدنفوذ به دلیل تلاش‌های مکرر ({minutes_left} دقیقه)'
            )
            raise Throttled(detail=f'تعداد تلاش‌های ناموفق شما بیش از حد مجاز است. لطفاً {minutes_left} دقیقه دیگر دوباره امتحان کنید.')

        try:
            data = super().validate(attrs)
        except AuthenticationFailed as e:
            # بررسی وجود کاربر برای تعیین علت دقیق
            user_obj = CustomUser.objects.filter(username=username).first()
            if user_obj and not user_obj.is_active:
                log_login_event(
                    username=username,
                    status='FAILED_INACTIVE',
                    user=user_obj,
                    ip_address=ip_address,
                    user_agent=user_agent,
                    device_model=device_model,
                    failure_reason='حساب کاربری غیرفعال است'
                )
            else:
                log_login_event(
                    username=username,
                    status='FAILED_CREDENTIALS',
                    user=user_obj,
                    ip_address=ip_address,
                    user_agent=user_agent,
                    device_model=device_model,
                    failure_reason='کلمه عبور نادرست یا نام کاربری نامعتبر'
                )
            raise e
        except Exception as e:
            log_login_event(
                username=username,
                status='FAILED_CREDENTIALS',
                ip_address=ip_address,
                user_agent=user_agent,
                device_model=device_model,
                failure_reason=str(e)
            )
            raise e

        user = self.user
        
        # ثبت موفقیت ورود
        log_login_event(
            username=user.username,
            status='SUCCESS',
            user=user,
            ip_address=ip_address,
            user_agent=user_agent,
            device_model=device_model
        )
        
        # Calculate permissions (including hierarchical child roles)
        user_perms = set(user.user_permissions.values_list('codename', flat=True))
        all_role_ids = CustomRole.get_all_role_ids_for_user(user)
        if all_role_ids:
            user_perms.update(
                Permission.objects.filter(group__id__in=all_role_ids).values_list('codename', flat=True)
            )
        
        if user.is_superuser:
            user_perms.add('admin_all') # Or all permissions
            
        # Build role info from CustomRole
        role_names = []
        role_titles = []
        for group in user.groups.all():
            role_names.append(group.name)
            try:
                cr = group.customrole
                role_titles.append(cr.title)
            except Exception:
                role_titles.append(group.name)

        from accounts.middleware import get_user_allowed_apps
        from platform_core.registry import build_user_token_scopes, resolve_default_active_app
        allowed_apps = get_user_allowed_apps(user)
        app_scopes = build_user_token_scopes(user)
        default_active_app = resolve_default_active_app(allowed_apps)

        data['user'] = {
            'id': user.id,
            'username': user.username,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'avatar': user.avatar.url if user.avatar else None,
            'avatar_letter': user.first_name[0] if user.first_name else 'U',
            'roles': role_names,
            'role_titles': role_titles,
            'email': user.email,
            'national_code': user.national_code,
            'phone_number': user.phone_number,
            'operational_zone': user.operational_zone,
            'supervisor_id': user.supervisor_id,
            'requires_password_change': user.requires_password_change,
            'ui_preferences': user.ui_preferences,
            'is_superuser': user.is_superuser,
            'permissions': list(user_perms),
            'allowed_apps': allowed_apps,
            'scopes': app_scopes,
            'active_app': default_active_app,
        }
        return {
            'tokens': {
                'access': data['access'],
                'refresh': data['refresh'],
            },
            'user': data['user']
        }


class UserLoginLogSerializer(serializers.ModelSerializer):
    user_display = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = UserLoginLog
        fields = [
            'id', 'user', 'user_display', 'username_attempted',
            'ip_address', 'user_agent', 'device_model', 'status', 'status_display',
            'failure_reason', 'metadata', 'created_at'
        ]
        read_only_fields = fields

    def get_user_display(self, obj):
        if obj.user:
            name = f"{obj.user.first_name} {obj.user.last_name}".strip()
            return name if name else obj.user.username
        return obj.username_attempted


class AuditLogListSerializer(serializers.ModelSerializer):
    user_display = serializers.SerializerMethodField()
    user_role = serializers.SerializerMethodField()
    warehouse = serializers.IntegerField(source='warehouse_id', read_only=True, allow_null=True)
    warehouse_id = serializers.IntegerField(read_only=True, allow_null=True)
    warehouse_name = serializers.SerializerMethodField()
    module_display = serializers.CharField(source='get_module_display', read_only=True)
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    severity_display = serializers.CharField(source='get_severity_display', read_only=True)
    has_diff = serializers.SerializerMethodField()
    company_id = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            'id', 'user', 'actor_username', 'actor_name', 'user_display', 'user_role',
            'warehouse', 'warehouse_id', 'warehouse_name', 'company_id',
            'module', 'module_display', 'action', 'action_display',
            'severity', 'severity_display', 'target_model', 'target_object_id',
            'target_repr', 'has_diff', 'details', 'ip_address', 'created_at'
        ]
        read_only_fields = fields

    def get_company_id(self, obj):
        if obj.details and isinstance(obj.details, dict):
            return obj.details.get('company_id')
        return None

    def get_warehouse_name(self, obj):
        if not obj.warehouse_id:
            return "عمومی / سیستم"
        wh = getattr(obj, 'warehouse', None)
        return wh.name if wh else "عمومی / سیستم"

    def get_has_diff(self, obj):
        return bool(obj.before_state or obj.after_state)

    def get_user_display(self, obj):
        if obj.user:
            name = f"{obj.user.first_name} {obj.user.last_name}".strip()
            return name if name else obj.user.username
        if obj.actor_name:
            return f"{obj.actor_name} (سابق)"
        if obj.actor_username:
            return f"{obj.actor_username} (سابق)"
        return "سیستم"

    def get_user_role(self, obj):
        if obj.user:
            groups = list(obj.user.groups.all())
            if groups:
                first_group = groups[0]
                try:
                    return first_group.customrole.title
                except Exception:
                    return first_group.name
            if obj.user.is_superuser:
                return "مدیر ارشد (Admin)"
            return "کاربر سیستم"
        return "سیستم"


class AuditLogSerializer(AuditLogListSerializer):
    class Meta(AuditLogListSerializer.Meta):
        fields = [
            'id', 'user', 'actor_username', 'actor_name', 'user_display', 'user_role',
            'warehouse', 'warehouse_id', 'warehouse_name',
            'module', 'module_display', 'action', 'action_display',
            'severity', 'severity_display', 'target_model', 'target_object_id',
            'target_repr', 'before_state', 'after_state', 'details',
            'ip_address', 'created_at'
        ]
        read_only_fields = fields



from .models import CustomUser, CustomRole, UserTableViewState

class UserTableViewStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserTableViewState
        fields = ['id', 'table_name', 'view_name', 'columns_state', 'is_last_selected', 'created_at']
        read_only_fields = ['id', 'created_at']
        
    def create(self, validated_data):
        user = self.context['request'].user
        validated_data['user'] = user
        return super().create(validated_data)
