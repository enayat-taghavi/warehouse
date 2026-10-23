# -*- coding: utf-8 -*-
"""
Database backup, system health check, and concurrency stress testing views.
"""
import os
import time
from django.db.models import Q
from django.http import HttpResponse, FileResponse
from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

class DatabaseBackupViewSet(viewsets.ViewSet):
    """
    مدیریت نسخه‌های پشتیبان و بازیابی پایگاه‌داده (Database Backup & Restore)
    - عملیات مدیریت/ایجاد/دانلود: perm_sys_backup_manage یا perm_sys_backup_restore یا Superuser
    - عملیات بازیابی دیتابیس: انحصاری با perm_sys_backup_restore یا Superuser
    """
    def _check_manage_permission(self, request):
        user = getattr(request, 'user', None)
        if not (user and user.is_authenticated and (
            user.is_superuser or
            user.has_perm('accounts.perm_sys_backup_manage') or
            user.has_perm('accounts.perm_sys_backup_restore')
        )):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("تنها مدیر ارشد سامانه یا کاربران دارای مجوز مدیریت نسخه پشتیبان (perm_sys_backup_manage) به این بخش دسترسی دارند.")

    def _check_restore_permission(self, request):
        user = getattr(request, 'user', None)
        if not (user and user.is_authenticated and (
            user.is_superuser or
            user.has_perm('accounts.perm_sys_backup_restore')
        )):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("تنها مدیر ارشد سامانه یا کاربران دارای مجوز صریح بازیابی پایگاه داده (perm_sys_backup_restore) به این بخش دسترسی دارند.")

    def list(self, request):
        self._check_manage_permission(request)
        from ..backup_service import get_backup_list
        backups = get_backup_list()
        return Response(backups)

    def create(self, request):
        self._check_manage_permission(request)
        from ..backup_service import create_database_backup
        description = request.data.get('description', 'پشتیبان‌گیری دستی توسط کاربر')
        try:
            meta = create_database_backup(user=request.user, description=description)
            return Response({'success': True, 'backup': meta}, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'success': False, 'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    def verify(self, request):
        self._check_manage_permission(request)
        filename = request.data.get('filename')
        if not filename:
            return Response({'is_valid': False, 'error': 'نام فایل پشتیبان الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)
        from ..backup_service import verify_backup_integrity
        result = verify_backup_integrity(filename)
        return Response(result)

    @action(detail=False, methods=['post'])
    def restore(self, request):
        self._check_restore_permission(request)
        filename = request.data.get('filename')
        confirm_text = request.data.get('confirm_text', '')

        # الزامی بودن تاییدیه متنی صریح
        if confirm_text.strip() != 'RESTORE_DATABASE_CONFIRM':
            return Response({
                'success': False,
                'error': 'جهت بازیابی پایگاه داده، عبارت تاییدیه امنیتی RESTORE_DATABASE_CONFIRM باید به طور دقیق وارد شود.'
            }, status=status.HTTP_400_BAD_REQUEST)

        if not filename:
            return Response({'success': False, 'error': 'نام فایل پشتیبان الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)

        from ..backup_service import restore_database_backup
        from ..middleware import get_current_ip
        ip_address = get_current_ip() or getattr(request, 'META', {}).get('REMOTE_ADDR')

        try:
            res = restore_database_backup(filename, user=request.user, ip_address=ip_address)
            return Response(res)
        except Exception as e:
            return Response({'success': False, 'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'])
    def download(self, request):
        self._check_manage_permission(request)
        filename = request.query_params.get('filename')
        if not filename or '/' in filename or '\\' in filename:
            return Response({'error': 'نام فایل نامعتبر است.'}, status=status.HTTP_400_BAD_REQUEST)

        from accounts.backup_service import get_backup_dir
        file_path = os.path.join(get_backup_dir(), filename)
        if not os.path.exists(file_path):
            return Response({'error': 'فایل یافت نشد.'}, status=status.HTTP_404_NOT_FOUND)

        from django.http import FileResponse
        response = FileResponse(open(file_path, 'rb'), as_attachment=True, filename=filename)
        return response

class SystemHealthView(APIView):
    """
    مرکز جامع پایش سلامت زنده و تاب‌آوری سامانه
    (Deep Health Matrix & Service Observability Backend API)
    
    بررسی زنده:
    ۱. اتصال و تاخیر پایگاه‌داده PostgreSQL
    ۲. اتصال، خواندن/نوشتن و تاخیر حافظه موقت Redis
    ۳. لایه کانال‌های وب‌سوکت (Django Channels / Redis Channel Layer)
    ۴. وضعیت محیط اجرایی، قلمرو فعال و زمان سرور
    ۵. محاسبه شاخص سلامت کلی (Health Score 0-100)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from accounts.middleware import get_current_active_app
        t0_total = time.time()
        health_data = {
            'status': 'healthy',
            'health_score': 100,
            'timestamp': timezone.now().isoformat(),
            'server_time': timezone.localtime(timezone.now()).strftime('%Y/%m/%d %H:%M:%S'),
            'app_scope': getattr(request, 'active_app', None) or get_current_active_app(),
            'components': {},
            'diagnostics': {}
        }
        
        score_deductions = 0

        # ۱. تست دیتابیس اصلی PostgreSQL
        db_start = time.time()
        try:
            from django.db import connection
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1;")
                cursor.fetchone()
            db_latency = round((time.time() - db_start) * 1000, 2)
            health_data['components']['database'] = {
                'status': 'healthy',
                'title': 'پایگاه‌داده PostgreSQL',
                'latency_ms': db_latency,
                'engine': connection.settings_dict.get('ENGINE', '').split('.')[-1],
                'name': connection.settings_dict.get('NAME', 'default'),
                'message': 'اتصال پایدار و کوئری با موفقیت پاسخ داده شد.'
            }
        except Exception as e:
            score_deductions += 50
            health_data['components']['database'] = {
                'status': 'unhealthy',
                'title': 'پایگاه‌داده PostgreSQL',
                'latency_ms': None,
                'message': f'خطای اتصال: {str(e)}'
            }

        # ۲. تست کش و صف Redis
        redis_start = time.time()
        try:
            from django.core.cache import cache
            cache_key = f"_health_check_ping_{int(time.time())}"
            cache.set(cache_key, 'pong', timeout=10)
            val = cache.get(cache_key)
            cache.delete(cache_key)
            redis_latency = round((time.time() - redis_start) * 1000, 2)
            if val == 'pong':
                health_data['components']['redis'] = {
                    'status': 'healthy',
                    'title': 'حافظه موقت و کش Redis',
                    'latency_ms': redis_latency,
                    'message': 'نوشتن و خواندن کلید با موفقیت انجام شد.'
                }
            else:
                score_deductions += 25
                health_data['components']['redis'] = {
                    'status': 'degraded',
                    'title': 'حافظه موقت و کش Redis',
                    'latency_ms': redis_latency,
                    'message': 'کلید تستی مقدار متفاوتی بازگرداند.'
                }
        except Exception as e:
            score_deductions += 25
            health_data['components']['redis'] = {
                'status': 'unhealthy',
                'title': 'حافظه موقت و کش Redis',
                'latency_ms': None,
                'message': f'سرور ردیس در دسترس نیست: {str(e)}'
            }

        # ۳. تست لایه کانال‌های وب‌سوکت
        ws_start = time.time()
        try:
            from channels.layers import get_channel_layer
            channel_layer = get_channel_layer()
            if channel_layer:
                ws_latency = round((time.time() - ws_start) * 1000, 2)
                health_data['components']['websocket'] = {
                    'status': 'healthy',
                    'title': 'لایه وب‌سوکت (Channel Layer)',
                    'latency_ms': ws_latency,
                    'layer_type': channel_layer.__class__.__name__,
                    'message': 'لایه کانال‌های توزیع‌شده وب‌سوکت فعال است.'
                }
            else:
                score_deductions += 15
                health_data['components']['websocket'] = {
                    'status': 'degraded',
                    'title': 'لایه وب‌سوکت (Channel Layer)',
                    'latency_ms': None,
                    'message': 'کانال وب‌سوکت تنظیم نشده است.'
                }
        except Exception as e:
            score_deductions += 15
            health_data['components']['websocket'] = {
                'status': 'unhealthy',
                'title': 'لایه وب‌سوکت (Channel Layer)',
                'latency_ms': None,
                'message': f'خطا در دسترسی به لایه وب‌سوکت: {str(e)}'
            }

        # محاسبه نمره سلامت و وضعیت کلی
        final_score = max(0, 100 - score_deductions)
        health_data['health_score'] = final_score
        if final_score == 100:
            health_data['status'] = 'healthy'
        elif final_score >= 60:
            health_data['status'] = 'degraded'
        else:
            health_data['status'] = 'unhealthy'

        health_data['total_check_time_ms'] = round((time.time() - t0_total) * 1000, 2)
        return Response(health_data, status=status.HTTP_200_OK)

class ConcurrencyStressTestView(APIView):
    """
    اندپوینت شبیه‌ساز تست فشار همروندی و پایش مقاومت در برابر بن‌بست دیتابیس
    (High-Concurrency Stress & Deadlock Resistance Endpoint)
    منحصر به مدیر ارشد سیستم (Superuser)
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not (request.user and request.user.is_authenticated and request.user.is_superuser):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("اجرای تست استرس و همروندی دیتابیس منحصر به مدیر ارشد سیستم (Superuser) می‌باشد.")

        data = request.data or {}
        concurrency_level = data.get('concurrency_level', 30)
        scenario = data.get('scenario', 'combined')

        from ..concurrency_stress_service import ConcurrencyStressService
        report = ConcurrencyStressService.run_stress_test(
            user=request.user,
            concurrency_level=concurrency_level,
            scenario=scenario
        )

        return Response(report, status=status.HTTP_200_OK)

__all__ = [
    'DatabaseBackupViewSet',
    'SystemHealthView',
    'ConcurrencyStressTestView',
]
