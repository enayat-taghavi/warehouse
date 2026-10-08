from django.conf import settings
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .services import (
    DEFAULT_SETTINGS,
    get_setting,
    get_all_settings,
    validate_settings_payload,
    compute_settings_etag,
    clear_setting_cache,
    get_installed_modules,
)
from .models import SystemSetting


class SettingsViewSet(viewsets.ViewSet):
    def get_permissions(self):
        from rest_framework.permissions import IsAuthenticated
        return [IsAuthenticated()]

    @action(detail=False, methods=['get', 'post'], url_path='global')
    def global_settings(self, request):
        if request.method == 'GET':
            all_settings = get_all_settings(None)
            etag = compute_settings_etag(all_settings)

            if request.user.is_superuser or request.user.has_perm('accounts.perm_sys_settings') or request.user.has_perm('accounts.view_sys_settings'):
                resp = Response(all_settings)
                resp['ETag'] = etag
                return resp

            projection_keys = [
                'field_permissions_counter',
                'field_permissions_doc',
                'blind_counting',
                'counter_can_view_history',
                'counter_can_view_previous_notes',
                'financial_can_view_history',
                'financial_can_view_previous_notes',
            ]
            projected_settings = {k: v for k, v in all_settings.items() if k in projection_keys or k.startswith('scanner_')}
            resp = Response(projected_settings)
            resp['ETag'] = etag
            return resp

        elif request.method == 'POST':
            if not (request.user.is_superuser or request.user.has_perm('accounts.perm_sys_settings')):
                return Response({'error': 'تنها مدیر ارشد سیستم مجاز به تغییر تنظیمات سراسری است.'}, status=403)

            data = request.data
            if not isinstance(data, dict):
                return Response({'error': 'فرمت داده ارسالی باید دیکشنری (JSON Object) باشد.'}, status=400)

            # ETag / Optimistic Concurrency Control
            if_match = request.headers.get('If-Match') or request.META.get('HTTP_IF_MATCH')
            if if_match and if_match.strip() != '*':
                current_all = get_all_settings(None)
                current_etag = compute_settings_etag(current_all)
                if if_match.strip() != current_etag:
                    return Response({
                        'error': 'تنظیمات همزمان توسط کاربر یا تب دیگری تغییر کرده است. لطفاً صفحه را تازه‌سازی کنید.',
                        'code': 'CONCURRENT_MODIFICATION',
                        'current_etag': current_etag
                    }, status=412)

            invalid_keys = validate_settings_payload(data)
            if invalid_keys:
                return Response({
                    'error': 'کلیدهای ارسالی نامعتبر یا دارای نوع/مقدار اشتباه هستند.',
                    'invalid_keys': invalid_keys
                }, status=400)

            from django.db import transaction

            with transaction.atomic():
                for key, value in data.items():
                    SystemSetting.objects.update_or_create(
                        key=key, warehouse_id=None,
                        defaults={'value': value}
                    )
                    clear_setting_cache(key, None)

            from accounts.audit_utils import log_audit_event
            log_audit_event(
                user=request.user,
                module='settings',
                action='UPDATE',
                severity='warning',
                target_model='SystemSetting',
                target_repr='تغییر تنظیمات سراسری سیستم',
                details={'updated_keys': list(data.keys())},
                ip_address=getattr(request, 'META', {}).get('REMOTE_ADDR')
            )

            updated_all = get_all_settings(None)
            new_etag = compute_settings_etag(updated_all)
            resp = Response({'status': 'success', 'etag': new_etag})
            resp['ETag'] = new_etag
            return resp


class PublicConfigViewSet(viewsets.ViewSet):
    def get_permissions(self):
        from rest_framework.permissions import AllowAny
        return [AllowAny()]

    def list(self, request):
        def clamped_minutes(key, low, high):
            """یک مقدار خرابِ واردشده توسط ادمین نباید این endpoint حساسِ بوت را ۵۰۰ کند."""
            try:
                return max(low, min(high, int(get_setting(key))))
            except (TypeError, ValueError):
                return DEFAULT_SETTINGS[key]

        return Response({
            'system_version': get_setting('system_version'),
            'system_name': 'سامانه یکپارچه مدیریت انبارگردانی فارس عالیش',
            'canonical_domain': getattr(settings, 'WH_CANONICAL_DOMAIN', ''),
            'offline_sync_interval_minutes': clamped_minutes('offline_sync_interval_minutes', 1, 1440),
            # صفر = «هیچ‌وقت کهنه نشود» و مقدار معتبری است، پس کف بازه صفر است
            'offline_cache_ttl_minutes': clamped_minutes('offline_cache_ttl_minutes', 0, 10080),
            'chat_enabled': bool(get_setting('chat_enabled')),
            'chat_file_sharing': bool(get_setting('chat_file_sharing')),
            'installed_modules': get_installed_modules(),
        })
