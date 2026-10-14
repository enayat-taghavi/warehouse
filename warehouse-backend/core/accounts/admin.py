from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.apps import apps
from .models import CustomUser, CustomRole

# فاز ۲ §۲.۳ — اپ انبار اختیاری است؛ فیلد `assigned_warehouses` فقط در نصبِ
# دارای انبار در ادمین کاربر نمایش داده می‌شود (وگرنه `check` در حسابداری‌تنها
# با FieldError رد می‌شود).
_WH_INSTALLED = apps.is_installed('warehouses')

@admin.register(CustomRole)
class CustomRoleAdmin(admin.ModelAdmin):
    list_display = ('title', 'name', 'parent', 'color')
    list_filter = ('parent',)
    search_fields = ('title', 'name')
    filter_horizontal = ('permissions',)

@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    list_display = ('username', 'first_name', 'last_name', 'national_code', 'phone_number', 'is_active', 'is_staff')
    list_filter = ('is_active', 'is_staff', 'is_superuser')
    search_fields = ('username', 'first_name', 'last_name', 'national_code', 'phone_number')

    def get_filter_horizontal(self, request):
        fh = ['groups', 'user_permissions']
        if _WH_INSTALLED:
            fh.append('assigned_warehouses')
        return fh

    def get_fieldsets(self, request, obj=None):
        fieldsets = super().get_fieldsets(request, obj)
        custom_fields = [
            'national_code',
            'phone_number',
            'operational_zone',
            'supervisor',
        ]
        if _WH_INSTALLED:
            custom_fields.append('assigned_warehouses')
        custom_fields += ['ui_preferences', 'requires_password_change']
        return fieldsets + (
            ('اطلاعات سازمانی و هویتی (سفارشی)', {'fields': tuple(custom_fields)}),
        )
