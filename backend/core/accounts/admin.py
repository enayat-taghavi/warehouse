from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from platform_core.registry import contributions
from .models import CustomUser, CustomRole

@admin.register(CustomRole)
class CustomRoleAdmin(admin.ModelAdmin):
    list_display = ('title', 'name', 'color')
    search_fields = ('title', 'name')
    filter_horizontal = ('permissions',)

@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    list_display = ('username', 'first_name', 'last_name', 'national_code', 'phone_number', 'is_active', 'is_staff')
    list_filter = ('is_active', 'is_staff', 'is_superuser')
    search_fields = ('username', 'first_name', 'last_name', 'national_code', 'phone_number')

    def get_filter_horizontal(self, request):
        fh = ['groups', 'user_permissions']
        for f in contributions('user_admin_fields'):
            fh.append(f)
        return fh

    def get_fieldsets(self, request, obj=None):
        fieldsets = super().get_fieldsets(request, obj)
        custom_fields = [
            'national_code',
            'phone_number',
            'operational_zone',
            'supervisor',
        ]
        for f in contributions('user_admin_fields'):
            custom_fields.append(f)
        custom_fields += ['ui_preferences', 'requires_password_change']
        return fieldsets + (
            ('اطلاعات سازمانی و هویتی (سفارشی)', {'fields': tuple(custom_fields)}),
        )
