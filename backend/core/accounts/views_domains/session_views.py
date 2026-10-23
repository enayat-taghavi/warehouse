# -*- coding: utf-8 -*-
"""
Device session heartbeat, fleet sessions listing, and session revocation views.
"""
import logging
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .helpers import logger

class DeviceHeartbeatView(APIView):
    """
    دریافت تله‌متری زنده و پالس ضربان قلب کلاینت/تبلت (Device Heartbeat & Presence API)
    در صورت ابطال نشست، خطای ۴۰۳ با کد SESSION_REVOKED ارسال می‌شود.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        data = request.data or {}

        tab_id = str(data.get('tab_id', 'tab_default')).strip()
        device_model = str(data.get('device_model', 'ناشناخته')).strip()
        os_name = str(data.get('os_name', 'Unknown')).strip()
        browser_name = str(data.get('browser_name', 'Unknown')).strip()
        from accounts.middleware import get_current_active_app
        raw_scope = data.get('app_scope')
        if not raw_scope:
            raw_scope = getattr(request, 'active_app', None) or get_current_active_app()
        app_scope = str(raw_scope).strip()
        active_role = str(data.get('active_role', 'counter')).strip()
        pending_queue_count = max(0, int(data.get('pending_queue_count', 0)))
        conflict_count = max(0, int(data.get('conflict_count', 0)))

        # استخراج آی‌پی کاربر
        x_forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded:
            ip_address = x_forwarded.split(',')[0].strip()
        else:
            ip_address = request.META.get('REMOTE_ADDR')

        session_key = f"{user.id}_{tab_id}"

        from ..models import UserDeviceSession

        # پاکسازی سشن‌های ابطال‌شده قدیمی اگر کاربر دیگری با این تب لاگین کرده است
        stale_revoked = UserDeviceSession.objects.filter(tab_id=tab_id, is_revoked=True)
        if stale_revoked.exists():
            for s_rev in stale_revoked:
                if s_rev.user_id != user.id:
                    s_rev.delete()

        session = UserDeviceSession.objects.filter(session_key=session_key).first()

        if session and session.is_revoked:
            return Response(
                {
                    'error': 'SESSION_REVOKED',
                    'detail': 'نشست این دستگاه توسط مدیر سیستم ابطال گردید. دسترسی به سامانه مسدود است.',
                    'session_id': session.id,
                    'tab_id': tab_id
                },
                status=status.HTTP_403_FORBIDDEN
            )

        if not session:
            session = UserDeviceSession(
                user=user,
                session_key=session_key,
                tab_id=tab_id,
                device_model=device_model,
                os_name=os_name,
                browser_name=browser_name,
                ip_address=ip_address,
                app_scope=app_scope,
                active_role=active_role,
                pending_queue_count=pending_queue_count,
                conflict_count=conflict_count,
                is_revoked=False
            )
        else:
            session.user = user
            session.device_model = device_model or session.device_model
            session.os_name = os_name or session.os_name
            session.browser_name = browser_name or session.browser_name
            session.ip_address = ip_address
            session.app_scope = app_scope
            session.active_role = active_role
            session.pending_queue_count = pending_queue_count
            session.conflict_count = conflict_count

        session.save()

        # برودکست بلادرنگ تغییرات تله‌متری ناوگان به وب‌سوکت سیستم
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
                        'sender_tab_id': tab_id,
                        'client_tab_id': tab_id,
                        'session_id': session.id,
                        'broadcast_to_sender': False
                    }
                )
        except Exception as ws_err:
            pass

        return Response({
            'status': 'ok',
            'session_id': session.id,
            'is_revoked': False,
            'server_time': timezone.now().isoformat()
        }, status=status.HTTP_200_OK)

class FleetSessionsListView(APIView):
    """
    واکشی فهرست زنده ناوگان تبلت‌ها و پایانه‌های متصل به سازمان (Connected Fleet Telemetry)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from ..models import UserDeviceSession
        # تبلت‌ها و پایانه‌هایی که در ۲۴ ساعت اخیر حداقل یک پالس ارسال کرده‌اند
        cutoff = timezone.now() - timezone.timedelta(hours=24)
        active_sessions = UserDeviceSession.objects.filter(
            last_heartbeat__gte=cutoff
        ).select_related('user').order_by('-last_heartbeat')[:100]

        now_dt = timezone.now()
        fleet_data = []

        caller_tab_id = request.headers.get('X-Client-Tab-Id') or request.query_params.get('tab_id')

        for s in active_sessions:
            delta_seconds = (now_dt - s.last_heartbeat).total_seconds()
            is_online = (not s.is_revoked) and (delta_seconds <= 90)

            fleet_data.append({
                'id': s.id,
                'user_id': s.user_id,
                'username': s.user.username,
                'user_full_name': s.user.get_full_name() or s.user.username,
                'tab_id': s.tab_id,
                'device_model': s.device_model,
                'os_name': s.os_name,
                'browser_name': s.browser_name,
                'ip_address': s.ip_address or '—',
                'app_scope': s.app_scope,
                'active_role': s.active_role,
                'pending_queue_count': s.pending_queue_count,
                'conflict_count': s.conflict_count,
                'is_revoked': s.is_revoked,
                'is_online': is_online,
                'is_current': (s.tab_id == caller_tab_id) if caller_tab_id else False,
                'last_heartbeat_iso': s.last_heartbeat.isoformat(),
                'last_heartbeat_seconds_ago': int(delta_seconds),
                'created_at_iso': s.created_at.isoformat(),
            })

        return Response({
            'status': 'success',
            'count': len(fleet_data),
            'online_count': sum(1 for d in fleet_data if d['is_online']),
            'fleet': fleet_data
        }, status=status.HTTP_200_OK)

class RevokeDeviceSessionView(APIView):
    """
    ابطال فوری نشست و اخراج اجباری کلاینت/تبلت مشکوک (Revoke Device Session & Force Logout)
    منحصر به مدیر ارشد سیستم (Superuser) با ثبت لاگ ممیزی
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, session_id):
        if not (request.user and (request.user.is_superuser or request.user.is_staff)):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("ابطال و خروج اجباری دستگاه‌های متصل، صرفاً در صلاحیت مدیر ارشد سیستم (Superuser) می‌باشد.")

        from ..models import UserDeviceSession, AuditLog
        session = UserDeviceSession.objects.filter(id=session_id).first()
        if not session:
            return Response({'error': 'نشست مورد نظر یافت نشد.'}, status=status.HTTP_404_NOT_FOUND)

        target_user = session.user
        user_groups = list(target_user.groups.values_list('name', flat=True)) if target_user else []
        active_role = (session.active_role or '').lower()

        is_target_supervisor = (
            target_user.is_superuser or
            target_user.is_staff or
            active_role in ('supervisor', 'manager', 'admin', 'head_supervisor', 'system_admin') or
            any('supervisor' in g.lower() or 'سرپرست' in g or 'مدیر' in g or 'admin' in g.lower() or 'manager' in g.lower() for g in user_groups)
        )
        if is_target_supervisor:
            return Response(
                {'error': 'نشست سرپرستان (Supervisor) و مدیران سیستم مشمول مصونیت نظارتی بوده و قابل ابطال نمی‌باشد.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        session.is_revoked = True
        session.save(update_fields=['is_revoked', 'last_heartbeat'])

        # ثبت رسمی در لاگ ممیزی سیستم
        try:
            action_code = 'ROLLBACK' if 'ROLLBACK' in dict(AuditLog.ACTION_CHOICES) else 'UPDATE'
            AuditLog.objects.create(
                user=request.user,
                actor_username=request.user.username,
                actor_name=request.user.get_full_name() or request.user.username,
                module='system',
                action=action_code,
                severity='warning',
                target_model='UserDeviceSession',
                target_object_id=str(session.id),
                target_repr=f"ابطال نشست دستگاه {session.device_model} متعلق به {session.user.username} (Tab: {session.tab_id})",
                details={
                    'session_id': session.id,
                    'tab_id': session.tab_id,
                    'device_model': session.device_model,
                    'target_user': session.user.username,
                    'revoked_by': request.user.username,
                    'ip': session.ip_address
                },
                ip_address=request.META.get('REMOTE_ADDR')
            )
        except Exception as e:
            logger.warning(f"[RevokeDeviceSessionView] Failed to record audit log: {e}")

        # برودکست فرمان ابطال نشست و اخراج فوری به کلیه کلاینت‌ها و تبلت مورد نظر
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            channel_layer = get_channel_layer()
            if channel_layer:
                async_to_sync(channel_layer.group_send)(
                    'global_notifications',
                    {
                        'type': 'send_notification',
                        'type_str': 'session_revoked',
                        'message': f'نشست دستگاه «{session.device_model}» ابطال شد.',
                        'revoked_tab_id': session.tab_id,
                        'session_id': session.id,
                        'client_tab_id': session.tab_id,
                        'broadcast_to_sender': True
                    }
                )
        except Exception as ws_err:
            pass

        return Response({
            'status': 'success',
            'message': f'نشست دستگاه «{session.device_model}» با موفقیت ابطال شد و فرمان خروج اجباری صادر گردید.',
            'session_id': session.id,
            'is_revoked': True
        }, status=status.HTTP_200_OK)

__all__ = [
    'DeviceHeartbeatView',
    'FleetSessionsListView',
    'RevokeDeviceSessionView',
]
