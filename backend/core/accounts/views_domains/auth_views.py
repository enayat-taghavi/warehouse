# -*- coding: utf-8 -*-
"""
Authentication, token obtain, logout, and app scope switching views.
"""
from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView

from .helpers import OptionalPageNumberPagination
from ..models import CustomUser, UserDeviceSession
from ..serializers import CustomTokenObtainPairSerializer
from ..audit_utils import log_login_event

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == status.HTTP_200_OK:
            try:
                username = request.data.get('username')
                if username:
                    from ..models import CustomUser, UserDeviceSession
                    u = CustomUser.objects.filter(username=username).first()
                    if u:
                        # پاکسازی سشن‌های ابطال‌شده قدیمی کاربر با ورود موفقیت‌آمیز جدید
                        UserDeviceSession.objects.filter(user=u, is_revoked=True).delete()
            except Exception:
                pass
        return response

class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        tab_id = request.headers.get('X-Client-Tab-Id') or (request.data and request.data.get('tab_id'))

        from ..models import UserDeviceSession
        if tab_id:
            UserDeviceSession.objects.filter(user=user, tab_id=tab_id).delete()
        else:
            UserDeviceSession.objects.filter(user=user).delete()

        # برودکست بلادرنگ تغییرات ناوگان به وب‌سوکت
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            channel_layer = get_channel_layer()
            if channel_layer:
                async_to_sync(channel_layer.group_send)(
                    'global_notifications',
                    {
                        'type': 'send_notification',
                        'type_str': 'fleet_update',
                        'message': '',
                        'client_tab_id': tab_id,
                        'broadcast_to_sender': False
                    }
                )
        except Exception:
            pass

        log_login_event(
            username=user.username,
            status='LOGOUT',
            user=user
        )
        return Response({'detail': 'خروج با موفقیت ثبت شد.'})

class SwitchAppScopeView(APIView):
    """
    اندپوینت رسمی تغییر قلمرو فعال (App Scope Switcher)
    کاربران دوماژوله می‌توانند قلمرو فعال توکن خود را بدون نیاز به ورود مجدد به سامانه دیگر سوئیچ کنند.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        target_app = (request.data.get('app') or request.data.get('target_app') or '').strip().lower()
        from platform_core.module_catalog import runtime_catalog_codes
        from platform_core.registry import module_allowed_app_code
        allowed_catalog_app_codes = {module_allowed_app_code(code) for code in runtime_catalog_codes()}
        if target_app not in allowed_catalog_app_codes:
            return Response({
                'success': False,
                'error': f"قلمرو نامعتبر است. فقط {', '.join(sorted(allowed_catalog_app_codes))} مجاز است."
            }, status=status.HTTP_400_BAD_REQUEST)

        from ..middleware import get_user_allowed_apps
        user = request.user
        allowed_apps = get_user_allowed_apps(user)

        if not user.is_superuser and target_app not in allowed_apps:
            try:
                from ..models import AuditLog
                AuditLog.objects.create(
                    user=user,
                    actor_username=user.username,
                    actor_name=f"{user.first_name} {user.last_name}".strip() or user.username,
                    module='system',
                    action='REJECT',
                    severity='warning',
                    target_model='AppScope',
                    target_object_id=str(user.id),
                    target_repr=f"تلاش غیرمجاز برای تغییر قلمرو به {target_app}",
                    details={
                        'event': 'CROSS_APP_DENIED',
                        'target_app': target_app,
                        'allowed_apps': allowed_apps
                    },
                    ip_address=request.META.get('REMOTE_ADDR')
                )
            except Exception:
                pass

            return Response({
                'success': False,
                'error': f'کاربر جاری فاقد مجوز دسترسی به سامانه {target_app} است.',
                'allowed_apps': allowed_apps
            }, status=status.HTTP_403_FORBIDDEN)

        # تولید RefreshToken جدید با قلمرو فعال به‌روزرسانی شده
        from rest_framework_simplejwt.tokens import RefreshToken
        from platform_core.registry import build_user_token_scopes
        refresh = RefreshToken.for_user(user)
        refresh['allowed_apps'] = allowed_apps
        refresh['scopes'] = build_user_token_scopes(user)
        refresh['active_app'] = target_app

        access_token = str(refresh.access_token)
        refresh_token = str(refresh)

        # ثبت رویداد ممیزی موفقیت تغییر قلمرو در AuditLog
        try:
            from ..models import AuditLog
            AuditLog.objects.create(
                user=user,
                actor_username=user.username,
                actor_name=f"{user.first_name} {user.last_name}".strip() or user.username,
                module='system',
                action='UPDATE',
                severity='info',
                target_model='AppScope',
                target_object_id=str(user.id),
                target_repr=f"تغییر موفقیت‌آمیز قلمرو فعال به {target_app}",
                details={
                    'event': 'APP_SCOPE_SWITCH',
                    'active_app': target_app,
                    'allowed_apps': allowed_apps
                },
                ip_address=request.META.get('REMOTE_ADDR')
            )
        except Exception:
            pass

        return Response({
            'success': True,
            'active_app': target_app,
            'allowed_apps': allowed_apps,
            'tokens': {
                'access': access_token,
                'refresh': refresh_token
            }
        }, status=status.HTTP_200_OK)

__all__ = [
    'OptionalPageNumberPagination',
    'CustomTokenObtainPairView',
    'LogoutView',
    'SwitchAppScopeView',
]
