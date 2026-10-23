import logging
from typing import Optional
from django.conf import settings
from django.http import HttpResponse
from django.utils.html import escape
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied

from .models import SystemGoogleDriveConfig, SystemDriveUploadTask
from .google_drive_client import (
    get_gdrive_target_handler,
    verify_and_consume_oauth_state,
    invalidate_other_oauth_states,
)
from .google_drive_service import (
    generate_system_auth_url,
    exchange_system_code_and_store_credentials,
    disconnect_system_google_drive,
)

logger = logging.getLogger(__name__)


def _render_oauth_response(
    status_code_name: str,
    message: str,
    target: str = 'company',
    company_id: Optional[int] = None,
    mode: str = 'popup',
    account_email: str = ''
) -> HttpResponse:
    """
    Render safe HTML response for OAuth callback (Phase 1 & 2 / GD-03).
    - Protects against XSS by strictly escaping all dynamic inputs.
    - Sends message to window.opener if popup mode, with exact targetOrigin.
    - Also broadcasts to BroadcastChannel('gdrive-oauth').
    - If mode is redirect, performs location.replace to server-generated destination.
    """
    target_origin = getattr(settings, 'GOOGLE_OAUTH_REDIRECT_URI', '')
    if target_origin:
        from urllib.parse import urlparse
        parsed = urlparse(target_origin)
        target_origin = f"{parsed.scheme}://{parsed.netloc}"
    if not target_origin:
        target_origin = 'https://app.farsalish.ir'

    safe_status = escape(status_code_name)
    safe_target = escape(target)
    safe_company_id = str(company_id) if company_id else 'null'
    safe_email = escape(account_email or '')
    safe_message = escape(message)
    safe_origin = escape(target_origin)

    if target == 'system':
        redirect_url = f"/app/operations/snapshots?gdrive={safe_status}"
    else:
        redirect_url = f"/app/operations/companies/{company_id}?tab=gdrive&gdrive={safe_status}" if company_id else f"/app/operations/companies?gdrive={safe_status}"

    html = f"""<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>احراز هویت گوگل‌درایو</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Vazirmatn", sans-serif;
            background-color: #f8fafc;
            color: #1e293b;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
        }}
        .card {{
            background: white;
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            border: 1px solid #e2e8f0;
            max-width: 440px;
            width: 100%;
            padding: 32px;
            text-align: center;
        }}
        .status-icon {{
            width: 56px;
            height: 56px;
            border-radius: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 16px;
            font-size: 28px;
        }}
        .status-success {{ background-color: #ecfdf5; color: #059669; }}
        .status-error {{ background-color: #fef2f2; color: #dc2626; }}
        h2 {{ margin: 0 0 12px; font-size: 18px; }}
        p {{ margin: 0 0 20px; font-size: 14px; color: #64748b; line-height: 1.6; }}
        .btn {{
            display: inline-block;
            background-color: #4f46e5;
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            text-decoration: none;
            font-size: 14px;
            font-weight: bold;
        }}
    </style>
</head>
<body>
    <div class="card">
        <div class="status-icon {'status-success' if status_code_name == 'connected' else 'status-error'}">
            {'✓' if status_code_name == 'connected' else '✕'}
        </div>
        <h2>{'اتصال موفقیت‌آمیز بود' if status_code_name == 'connected' else 'خطا در برقراری ارتباط'}</h2>
        <p>{safe_message}</p>
        <a id="return-link" class="btn" href="{redirect_url}">بازگشت به برنامه</a>
    </div>

    <script>
        (function() {{
            var payload = {{
                type: 'gdrive_oauth_callback',
                status: '{safe_status}',
                target: '{safe_target}',
                companyId: {safe_company_id},
                email: '{safe_email}',
                message: '{safe_message}'
            }};
            var targetOrigin = '{safe_origin}';
            var mode = '{mode}';

            // 1. Post to BroadcastChannel (accessible to all same-origin tabs)
            try {{
                if (window.BroadcastChannel) {{
                    var channel = new BroadcastChannel('gdrive-oauth');
                    channel.postMessage(payload);
                }}
            }} catch (e) {{}}

            // 2. Post to opener if popup mode
            if (window.opener && window.opener !== window) {{
                try {{
                    window.opener.postMessage(payload, targetOrigin);
                }} catch (e) {{}}
            }}

            // 3. Handle closing or redirection
            if (mode === 'popup') {{
                setTimeout(function() {{
                    window.close();
                }}, 1500);
            }} else {{
                setTimeout(function() {{
                    window.location.replace('{redirect_url}');
                }}, 1500);
            }}
        }})();
    </script>
</body>
</html>"""
    http_status = 200 if status_code_name == 'connected' else 400
    return HttpResponse(html, content_type="text/html; charset=utf-8", status=http_status)


class GoogleDriveOAuthCallbackView(APIView):
    """
    مرکز کنترل یکپارچه و امن دریافت کال‌بک احراز هویت گوگل‌درایو برای سامانه و شرکت‌ها (فاز ۲ - D1)
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        error = request.GET.get('error')
        code = request.GET.get('code')
        state = request.GET.get('state')

        # 1. State Verification and Atomic Nonce Consumption
        payload = verify_and_consume_oauth_state(state) if state else None
        target = payload.get('t', 'company') if payload else 'company'
        company_id = payload.get('c') if payload else None
        user_id = payload.get('u') if payload else None
        mode = payload.get('m', 'popup') if payload else 'popup'

        if error:
            logger.warning(f"[GDrive Callback] OAuth returned error '{error}' (target={target}, company_id={company_id})")
            error_msg = "اتصال توسط کاربر لغو شد یا دسترسی لازم تایید نگردید."
            return _render_oauth_response('error', error_msg, target=target, company_id=company_id, mode=mode)

        if not payload:
            logger.warning("[GDrive Callback] Missing, expired, or already-used state token.")
            return _render_oauth_response('error', "درخواست اتصال منقضی شده یا نامعتبر است. لطفاً پنجره را بسته و مجدداً تلاش نمایید.", target=target, company_id=company_id, mode=mode)

        if not code:
            return _render_oauth_response('error', "کد احراز هویت از سوی گوگل دریافت نشد.", target=target, company_id=company_id, mode=mode)

        # 2. Target Routing
        try:
            if target == 'system':
                # System Drive: verify requesting user was superuser
                from django.contrib.auth import get_user_model
                User = get_user_model()
                requesting_user = User.objects.filter(id=user_id, is_active=True).first() if user_id else None
                if not requesting_user or not requesting_user.is_superuser:
                    logger.warning(f"[System GDrive Callback] User {user_id} is not authorized for system drive.")
                    return _render_oauth_response('error', "تنها مدیران ارشد سیستم مجاز به اتصال درایو سراسری هستند.", target='system', mode=mode)

                res = exchange_system_code_and_store_credentials(code)
                invalidate_other_oauth_states(payload)
                account_email = res.get('account_email') or ''
                return _render_oauth_response('connected', "اتصال درایو سامانه با موفقیت برقرار شد.", target='system', mode=mode, account_email=account_email)

            elif target == 'company':
                handler_info = get_gdrive_target_handler('company')
                if not handler_info:
                    logger.warning("[GDrive Callback] Company target handler not registered (accounting app may be disabled).")
                    return _render_oauth_response('error', "ماژول مدیریت حسابداری و شرکت‌ها در این سرور فعال نیست.", target='company', company_id=company_id, mode=mode)

                # بررسی دوبارهٔ دسترسی کاربر state طبق D3؛ بدون کاربر یا بررسی‌کننده، اتصال رد می‌شود.
                from django.contrib.auth import get_user_model
                User = get_user_model()
                user = User.objects.filter(id=user_id, is_active=True).first() if user_id else None
                access_checker = handler_info.get('access_checker')
                if not user or not access_checker or not access_checker(user, company_id=company_id):
                    logger.warning(f"[GDrive Callback] User {user_id} has no workspace_full access to company {company_id}.")
                    return _render_oauth_response('error', "شما مجوز دسترسی لازم برای اتصال این شرکت را ندارید.", target='company', company_id=company_id, mode=mode)

                exchange_handler = handler_info['exchange_handler']
                res = exchange_handler(code, company_id=company_id)
                invalidate_other_oauth_states(payload)
                account_email = res.get('account_email') or ''
                return _render_oauth_response('connected', "اتصال به گوگل‌درایو با موفقیت انجام شد.", target='company', company_id=company_id, mode=mode, account_email=account_email)

            else:
                return _render_oauth_response('error', "مقصد اتصال نامعتبر است.", target='company', mode=mode)

        except Exception as exc:
            logger.error(f"[GDrive Callback] Error exchanging code for target '{target}': {exc}", exc_info=True)
            # جزئیات فقط در لاگ؛ پیام عمومی فارسی به کاربر (GD-03)
            return _render_oauth_response('error', "ثبت دسترسی گوگل‌درایو با خطا روبه‌رو شد. لطفاً دوباره تلاش کنید.", target=target, company_id=company_id, mode=mode)


class SystemGoogleDriveConfigView(APIView):
    """
    مشاهده و ویرایش تنظیمات درایو سامانه (فقط سوپریوزر - فاز ۲)
    """
    permission_classes = [permissions.IsAuthenticated]

    def _check_permission(self, request):
        if not request.user.is_superuser:
            raise PermissionDenied("دسترسی به درایو سراسری سامانه منحصراً در اختیار مدیر ارشد سیستم است.")

    def get(self, request):
        self._check_permission(request)
        config = SystemGoogleDriveConfig.get_solo()

        # Check worker alive status (heartbeat within 3 minutes)
        worker_alive = False
        if config.worker_heartbeat_at:
            delta = (timezone.now() - config.worker_heartbeat_at).total_seconds()
            worker_alive = delta < 180

        # Query companies configured for google drive to toggle backup sync
        backup_companies = []
        try:
            from platform_core.registry import contributions
            models = contributions('company_gdrive_config_model')
            if models:
                CompanyGoogleDriveConfig = models[0]
                cfgs = CompanyGoogleDriveConfig.objects.filter(company__is_active=True).select_related('company').order_by('company__id')
                for c in cfgs:
                    backup_companies.append({
                        'company_id': c.company.id,
                        'company_name': c.company.name,
                        'account_email': c.account_email,
                        'is_connected': bool(c.refresh_token),
                        'sync_backups': bool(c.sync_backups),
                    })
        except Exception:
            pass

        root_folder_url = f"https://drive.google.com/drive/folders/{config.root_folder_id}" if config.root_folder_id else None

        data = {
            'is_enabled': config.is_enabled,
            'is_connected': bool(config.refresh_token),
            'account_email': config.account_email,
            'root_folder_id': config.root_folder_id,
            'root_folder_name': config.root_folder_name,
            'root_folder_url': root_folder_url,
            'last_sync_at': config.last_sync_at,
            'last_error': config.last_error,
            'auth_status': config.auth_status,
            'worker_heartbeat_at': config.worker_heartbeat_at,
            'worker_alive': worker_alive,
            'backup_companies': backup_companies,
        }
        return Response(data)

    def patch(self, request):
        self._check_permission(request)
        config = SystemGoogleDriveConfig.get_solo()
        if 'is_enabled' in request.data:
            config.is_enabled = bool(request.data['is_enabled'])
            config.save(update_fields=['is_enabled', 'updated_at'])
        return Response({'success': True, 'is_enabled': config.is_enabled})


class SystemGoogleDriveAuthUrlView(APIView):
    """
    تولید پیوند احراز هویت درایو سراسری سامانه (فقط سوپریوزر - فاز ۲)
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not request.user.is_superuser:
            raise PermissionDenied("تنها مدیر ارشد سیستم مجاز به اتصال درایو سراسری است.")

        mode = request.GET.get('mode', 'popup')
        auth_url, state = generate_system_auth_url(user=request.user, mode=mode)
        return Response({'auth_url': auth_url, 'state': state})


class SystemGoogleDriveDisconnectView(APIView):
    """
    قطع اتصال حساب گوگل‌درایو سراسری سامانه (فقط سوپریوزر - فاز ۲)
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not request.user.is_superuser:
            raise PermissionDenied("تنها مدیر ارشد سیستم مجاز به قطع اتصال درایو سراسری است.")

        disconnect_system_google_drive()
        return Response({'success': True, 'message': "اتصال درایو سراسری سامانه قطع گردید."})


class SystemGoogleDriveTasksView(APIView):
    """
    مشاهده فهرست وظایف صف درایو سامانه (فقط سوپریوزر)
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not request.user.is_superuser:
            raise PermissionDenied("دسترسی محدود به مدیر ارشد سیستم است.")

        try:
            limit = int(request.GET.get('limit', 20))
        except (TypeError, ValueError):
            return Response({'error': "پارامتر limit باید عدد صحیح باشد."}, status=status.HTTP_400_BAD_REQUEST)
        limit = max(1, min(limit, 100))
        tasks = SystemDriveUploadTask.objects.all().order_by('-created_at')[:limit]
        items = []
        for t in tasks:
            items.append({
                'id': t.id,
                'task_type': t.task_type,
                'target_filename': t.target_filename,
                'target_folder_path': t.target_folder_path,
                'status': t.status,
                'priority': t.priority,
                'retry_count': t.retry_count,
                'error_message': t.error_message,
                'created_at': t.created_at,
                'completed_at': t.completed_at,
            })
        return Response({'count': SystemDriveUploadTask.objects.count(), 'results': items})
