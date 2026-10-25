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
    declared_toggle_sections,
    get_disabled_sections,
    is_valid_app_version,
    is_valid_download_url,
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

            # ص۱۲ طرح ۲.۶: خاموش و روشن کردن بخش‌ها فقط با مدیر کل (حتی با perm_sys_settings)
            if (
                'disabled_sections' in data
                and not request.user.is_superuser
                and data.get('disabled_sections') != get_setting('disabled_sections')
            ):
                return Response({
                    'error': 'تنها مدیر کل سیستم می‌تواند بخش‌ها را روشن یا خاموش کند.',
                    'invalid_keys': ['disabled_sections'],
                }, status=403)

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

        def safe_version(key):
            try:
                val = get_setting(key)
                return val if is_valid_app_version(val) else ''
            except Exception:
                return ''

        def safe_url(key):
            try:
                val = get_setting(key)
                return val if is_valid_download_url(val) else ''
            except Exception:
                return ''

        payload = {
            'system_version': get_setting('system_version'),
            'system_name': 'سامانه یکپارچه مدیریت شرکت ها',
            'canonical_domain': getattr(settings, 'WH_CANONICAL_DOMAIN', ''),
            'offline_sync_interval_minutes': clamped_minutes('offline_sync_interval_minutes', 1, 1440),
            # صفر = «هیچ‌وقت کهنه نشود» و مقدار معتبری است، پس کف بازه صفر است
            'offline_cache_ttl_minutes': clamped_minutes('offline_cache_ttl_minutes', 0, 10080),
            'chat_enabled': bool(get_setting('chat_enabled')),
            'chat_file_sharing': bool(get_setting('chat_file_sharing')),
            'installed_modules': get_installed_modules(),
            'app_min_version': safe_version('app_min_version'),
            'app_recommended_version': safe_version('app_recommended_version'),
            'app_download_urls': {
                'direct': safe_url('app_download_url_direct'),
                'bazaar': safe_url('app_download_url_bazaar'),
                'myket': safe_url('app_download_url_myket'),
            },
            # ص۱۲ طرح ۲.۶: فرانت منو و مسیر این بخش‌ها را می‌بندد؛ داده‌ای پاک نمی‌شود
            'disabled_sections': get_disabled_sections(),
        }
        user = getattr(request, 'user', None)
        if user is not None and user.is_authenticated and user.is_superuser:
            payload['toggle_sections'] = [
                {'code': code, 'title_fa': title_fa} for code, title_fa in declared_toggle_sections()
            ]
        return Response(payload)
