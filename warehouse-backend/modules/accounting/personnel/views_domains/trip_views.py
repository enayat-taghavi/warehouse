# -*- coding: utf-8 -*-
"""
ViewSet for vehicle trip logs, monthly trip grids, and vehicle excel import/export.
"""

import jdatetime
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.http import HttpResponse
from django.db import transaction
from django.db.models import Q
from common.date_utils import normalize_digits
from companies.access import (
    get_user_allowed_companies,
    get_request_company_id,
    validate_user_company_access,
)
from ..models import (
    VehicleTripLog,
    VehicleTripAuditLog,
    VehicleDriverProfile,
    MonthlyWorkPeriod,
    ProjectSection,
    FinancialProject,
)
from ..serializers import (
    VehicleTripLogSerializer,
    VehicleTripAuditLogSerializer,
    BulkVehicleTripMatrixSerializer,
    VehicleDayTripUpdateSerializer,
    BulkVehicleMonthlyGridSerializer,
)
from ..fleet_excel_engine import export_fleet_monthly_excel, import_fleet_monthly_excel
from .scope_helpers import (
    scope_trips_for_user,
    scope_vehicle_queryset,
)

class VehicleTripViewSet(viewsets.ModelViewSet):
    queryset = VehicleTripLog.objects.filter(is_deleted=False).select_related('vehicle', 'period')
    serializer_class = VehicleTripLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def _scoped_vehicles(self, qs=None):
        base_qs = VehicleDriverProfile.objects.all() if qs is None else qs
        return scope_vehicle_queryset(self.request, base_qs)

    def _scoped_trips(self, qs):
        cid = validate_user_company_access(self.request.user, get_request_company_id(self.request))
        return scope_trips_for_user(self.request.user, qs, company_id=cid)

    def _validate_write_target(self, request, section_id, project_id, warehouse_id=None):
        sec_obj = None
        if section_id:
            try:
                sec_id_int = int(section_id)
            except (ValueError, TypeError):
                return Response({'error': 'شناسه بخش نامعتبر است.'}, status=status.HTTP_400_BAD_REQUEST)
            sec_obj = ProjectSection.objects.filter(id=sec_id_int).select_related('project').first()
            if not sec_obj:
                return Response({'error': 'بخش مشخص‌شده یافت نشد.'}, status=status.HTTP_400_BAD_REQUEST)
            if not sec_obj.project or not sec_obj.project.company_id:
                return Response({'error': 'بخش مشخص‌شده فاقد پروژه یا شرکت معتبر است.'}, status=status.HTTP_400_BAD_REQUEST)

        proj_obj = None
        if project_id:
            try:
                proj_id_int = int(project_id)
            except (ValueError, TypeError):
                return Response({'error': 'شناسه پروژه نامعتبر است.'}, status=status.HTTP_400_BAD_REQUEST)
            proj_obj = FinancialProject.objects.filter(id=proj_id_int).first()
            if not proj_obj:
                return Response({'error': 'پروژه مشخص‌شده یافت نشد.'}, status=status.HTTP_400_BAD_REQUEST)
            if not proj_obj.company_id:
                return Response({'error': 'پروژه مشخص‌شده فاقد شرکت معتبر است.'}, status=status.HTTP_400_BAD_REQUEST)

        if sec_obj and proj_obj:
            if sec_obj.project_id != proj_obj.id:
                return Response({'error': 'بخش انتخابی متعلق به پروژه مشخص‌شده نیست.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            cid = validate_user_company_access(request.user, get_request_company_id(request))
        except PermissionDenied as e:
            return Response({'error': str(e.detail) if hasattr(e, 'detail') else str(e)}, status=status.HTTP_403_FORBIDDEN)

        if cid:
            if sec_obj and sec_obj.project.company_id != cid:
                return Response({'error': 'بخش مشخص‌شده متعلق به شرکت فعال در سربرگ نیست.'}, status=status.HTTP_403_FORBIDDEN)
            if proj_obj and proj_obj.company_id != cid:
                return Response({'error': 'پروژه مشخص‌شده متعلق به شرکت فعال در سربرگ نیست.'}, status=status.HTTP_403_FORBIDDEN)
        elif not request.user.is_superuser:
            allowed_ids = set(get_user_allowed_companies(request.user).values_list('id', flat=True))
            if sec_obj and sec_obj.project.company_id not in allowed_ids:
                return Response({'error': 'شما به بخش یا شرکت مربوطه دسترسی ندارید.'}, status=status.HTTP_403_FORBIDDEN)
            if proj_obj and proj_obj.company_id not in allowed_ids:
                return Response({'error': 'شما به پروژه یا شرکت مربوطه دسترسی ندارید.'}, status=status.HTTP_403_FORBIDDEN)

        if warehouse_id is not None:
            from platform_core.registry import is_module_installed, company_of, contributions
            if is_module_installed('warehouse'):
                try:
                    wh_id_int = int(warehouse_id)
                except (ValueError, TypeError):
                    return Response({'error': 'شناسه انبار نامعتبر است.'}, status=status.HTTP_400_BAD_REQUEST)

                validators = contributions('validate_warehouse')
                wh_exists = any(v(wh_id_int) for v in validators) if validators else (company_of('warehouse', wh_id_int) is not None)
                if not wh_exists:
                    return Response({'error': 'انبار مشخص‌شده یافت نشد.'}, status=status.HTTP_400_BAD_REQUEST)

                wh_cid = company_of('warehouse', wh_id_int)
                if cid:
                    if wh_cid is not None and wh_cid != cid:
                        return Response({'error': 'انبار مشخص‌شده متعلق به شرکت فعال در سربرگ نیست.'}, status=status.HTTP_403_FORBIDDEN)

                if not request.user.is_superuser:
                    if wh_cid is not None:
                        allowed_ids = set(get_user_allowed_companies(request.user).values_list('id', flat=True))
                        if wh_cid not in allowed_ids:
                            return Response({'error': 'شما به انبار مشخص‌شده دسترسی ندارید.'}, status=status.HTTP_403_FORBIDDEN)

                    scoped_wh_ids = set()
                    for ext in contributions('user_extensions'):
                        if hasattr(ext, 'get_all_warehouses'):
                            try:
                                wh_list = ext.get_all_warehouses(user=request.user)
                                for w in wh_list:
                                    w_id = getattr(w, 'id', getattr(w, 'pk', None))
                                    if w_id is not None:
                                        scoped_wh_ids.add(w_id)
                            except Exception:
                                pass

                    # همچنین برای خودروهای یتیم خود کاربر (بی‌شرکت و بی‌بخش)، انبار بی‌شرکت خودرو در دامنه است
                    if wh_cid is None:
                        orphan_wh_ids = set(
                            VehicleDriverProfile.objects.filter(
                                created_by=request.user,
                                company__isnull=True,
                                section__isnull=True,
                                assigned_warehouse_id__isnull=False
                            ).values_list('assigned_warehouse_id', flat=True)
                        )
                        scoped_wh_ids.update(orphan_wh_ids)

                    if wh_id_int not in scoped_wh_ids:
                        return Response({'error': 'شما به انبار مشخص‌شده دسترسی ندارید.'}, status=status.HTTP_403_FORBIDDEN)

        return None

    def get_queryset(self):
        qs = super().get_queryset()
        warehouse_id = self.request.query_params.get('warehouse_id')
        if warehouse_id:
            qs = qs.filter(warehouse_id=warehouse_id)
        section_id = self.request.query_params.get('section_id')
        if section_id:
            qs = qs.filter(Q(section_id=section_id) | Q(vehicle__section_id=section_id))
        project_id = self.request.query_params.get('project_id')
        if project_id:
            qs = qs.filter(Q(section__project_id=project_id) | Q(vehicle__section__project_id=project_id))
        date_shamsi = self.request.query_params.get('date_shamsi')
        if date_shamsi:
            qs = qs.filter(date_shamsi=date_shamsi)
        vehicle_id = self.request.query_params.get('vehicle_id')
        if vehicle_id:
            qs = qs.filter(vehicle_id=vehicle_id)
        return self._scoped_trips(qs)

    def perform_create(self, serializer):
        from ..fleet_lifecycle_services import assert_vehicle_trip_allowed
        vehicle = serializer.validated_data.get('vehicle')
        date_shamsi = serializer.validated_data.get('date_shamsi')
        trip_count = serializer.validated_data.get('trip_count', 1)
        if (trip_count is None or trip_count > 0) and vehicle and date_shamsi:
            assert_vehicle_trip_allowed(vehicle, date_shamsi)
        serializer.save(created_by=self.request.user if (self.request.user and self.request.user.is_authenticated) else None)

    def perform_update(self, serializer):
        from ..fleet_lifecycle_services import assert_vehicle_trip_allowed
        vehicle = serializer.validated_data.get('vehicle') or serializer.instance.vehicle
        date_shamsi = serializer.validated_data.get('date_shamsi') or serializer.instance.date_shamsi
        trip_count = serializer.validated_data.get('trip_count', serializer.instance.trip_count)
        if (trip_count is None or trip_count > 0) and vehicle and date_shamsi:
            assert_vehicle_trip_allowed(vehicle, date_shamsi)
        serializer.save()

    @action(detail=False, methods=['get'], url_path='matrix')
    def get_matrix(self, request):
        """
        دریافت لیست سریع خودروها برای ثبت سرویس روزانه
        (پشتیبانی از فیلتر انبار و همچنین حالت سراسری کلیه خودروها)
        """
        raw_wh = request.query_params.get('warehouse_id')
        warehouse_id = int(raw_wh) if (raw_wh and str(raw_wh).upper() not in ['ALL', '0', 'NONE', '']) else None
        date_shamsi = request.query_params.get('date_shamsi')
        if not date_shamsi:
            return Response({'error': 'پارامتر date_shamsi الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)

        status_filter = request.query_params.get('status', 'active').lower()
        active_filter_q = Q()
        if status_filter == 'active':
            active_filter_q = Q(is_active=True, approval_status='approved')
        elif status_filter == 'inactive':
            active_filter_q = Q(is_active=False)

        vehicles_base = self._scoped_vehicles().filter(active_filter_q)
        if warehouse_id:
            vehicles = vehicles_base.filter(
                Q(assigned_warehouse_id=warehouse_id) | Q(assigned_warehouse_id__isnull=True)
            ).order_by('driver_name')
            trip_qs = self._scoped_trips(VehicleTripLog.objects.filter(
                warehouse_id=warehouse_id,
                date_shamsi=date_shamsi,
                is_deleted=False
            ))
        else:
            vehicles = vehicles_base.order_by('driver_name')
            trip_qs = self._scoped_trips(VehicleTripLog.objects.filter(
                date_shamsi=date_shamsi,
                is_deleted=False
            ))

        raw_sec = request.query_params.get('section_id')
        section_id = int(raw_sec) if (raw_sec and str(raw_sec).upper() not in ['ALL', '0', 'NONE', '']) else None
        if section_id:
            vehicles = vehicles.filter(section_id=section_id)
            trip_qs = trip_qs.filter(Q(section_id=section_id) | Q(vehicle__section_id=section_id))

        existing_trips = {
            t.vehicle_id: t
            for t in trip_qs
        }

        matrix_rows = []
        for v in vehicles:
            t = existing_trips.get(v.id)
            if t:
                matrix_rows.append({
                    'vehicle_id': v.id,
                    'driver_name': v.driver_name,
                    'plate_number': v.plate_number,
                    'vehicle_type_display': v.get_vehicle_type_display(),
                    'default_rate': float(v.default_service_rate),
                    'trip_id': t.id,
                    'trip_count': t.trip_count,
                    'unit_rate': float(t.unit_rate),
                    'total_amount': float(t.total_amount),
                    'dispatch_reference': t.dispatch_reference or '',
                    'origin_destination': t.origin_destination or '',
                    'notes': t.notes or '',
                    'is_existing': True,
                    'is_active': v.is_active
                })
            else:
                matrix_rows.append({
                    'vehicle_id': v.id,
                    'driver_name': v.driver_name,
                    'plate_number': v.plate_number,
                    'vehicle_type_display': v.get_vehicle_type_display(),
                    'default_rate': float(v.default_service_rate),
                    'trip_id': None,
                    'trip_count': 0,
                    'unit_rate': float(v.default_service_rate),
                    'total_amount': 0.0,
                    'dispatch_reference': '',
                    'origin_destination': '',
                    'notes': '',
                    'is_existing': False,
                    'is_active': v.is_active
                })

        return Response({
            'warehouse_id': warehouse_id,
            'date_shamsi': date_shamsi,
            'rows': matrix_rows
        })

    @action(detail=False, methods=['post'], url_path='bulk-save')
    def bulk_save(self, request):
        """
        ثبت سریع سرویس‌های ناوگان در پایان روز
        (پشتیبانی از ذخیره سراسری ناوگان و ارسال برودکست وب‌سوکت)
        """
        serializer = BulkVehicleTripMatrixSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        raw_wh = serializer.validated_data.get('warehouse_id') or request.query_params.get('warehouse_id') or request.data.get('warehouse_id')
        warehouse_id = int(raw_wh) if (raw_wh and str(raw_wh).upper() not in ['ALL', '0', 'NONE', '']) else None
        raw_sec = serializer.validated_data.get('section_id') or request.query_params.get('section_id') or request.data.get('section_id')
        section_id = int(raw_sec) if (raw_sec and str(raw_sec).upper() not in ['ALL', '0', 'NONE', '']) else None
        raw_proj = serializer.validated_data.get('project_id') or request.query_params.get('project_id') or request.data.get('project_id')
        project_id = int(raw_proj) if (raw_proj and str(raw_proj).upper() not in ['ALL', '0', 'NONE', '']) else None

        target_err = self._validate_write_target(request, section_id, project_id, warehouse_id=warehouse_id)
        if target_err is not None:
            return target_err

        date_shamsi = serializer.validated_data['date_shamsi']
        items = serializer.validated_data['items']

        year_month = date_shamsi[:7]
        period = None
        if warehouse_id:
            period, _ = MonthlyWorkPeriod.objects.get_or_create(
                warehouse_id=warehouse_id,
                year_month=year_month,
                defaults={'status': 'OPEN'}
            )
            if period.status == 'LOCKED':
                return Response({'error': f'دوره {year_month} قفل شده است.'}, status=status.HTTP_400_BAD_REQUEST)

        saved_count = 0
        with transaction.atomic():
            for item in items:
                vehicle_id = item['vehicle_id']
                trip_count = item.get('trip_count', 0)
                
                v_obj = self._scoped_vehicles().filter(id=vehicle_id).first()
                if not v_obj:
                    continue

                # تسک ۲.۱ و ب-۲۰: گارد جامع ثبت تردد (وضعیت تصویب، پایان همکاری، انقضای بیمه/معاینه/گواهینامه/قرارداد)
                if trip_count > 0:
                    from ..fleet_lifecycle_services import validate_vehicle_validity
                    is_valid, reason = validate_vehicle_validity(v_obj, date_shamsi)
                    if not is_valid:
                        return Response({'error': reason}, status=status.HTTP_400_BAD_REQUEST)

                target_wh = warehouse_id if warehouse_id else v_obj.assigned_warehouse_id
                target_period = period
                if not target_period and target_wh:
                    target_period, _ = MonthlyWorkPeriod.objects.get_or_create(
                        warehouse_id=target_wh,
                        year_month=year_month,
                        defaults={'status': 'OPEN'}
                    )
                if target_period and target_period.status == 'LOCKED':
                    return Response({'error': f'دوره {year_month} برای انبار خودرو ({v_obj.driver_name}) قفل شده است.'}, status=status.HTTP_400_BAD_REQUEST)

                trip_obj = VehicleTripLog.objects.filter(
                    vehicle_id=vehicle_id,
                    warehouse_id=target_wh,
                    date_shamsi=date_shamsi,
                    is_deleted=False
                ).first()

                unit_rate = item.get('unit_rate', v_obj.default_service_rate)
                total_amount = unit_rate * trip_count

                if trip_count > 0:
                    effective_section_id = section_id or v_obj.section_id
                    effective_project_id = project_id or (v_obj.section.project_id if v_obj.section else None)
                    if trip_obj:
                        trip_obj.trip_count = trip_count
                        trip_obj.unit_rate = unit_rate
                        trip_obj.total_amount = total_amount
                        trip_obj.dispatch_reference = item.get('dispatch_reference', '')
                        trip_obj.origin_destination = item.get('origin_destination', '')
                        trip_obj.notes = item.get('notes', '')
                        trip_obj.period = target_period
                        if effective_section_id:
                            trip_obj.section_id = effective_section_id
                        if effective_project_id:
                            trip_obj.project_id = effective_project_id
                        trip_obj.save()
                    else:
                        VehicleTripLog.objects.create(
                            vehicle_id=vehicle_id,
                            warehouse_id=target_wh,
                            section_id=effective_section_id,
                            project_id=effective_project_id,
                            date_shamsi=date_shamsi,
                            trip_count=trip_count,
                            unit_rate=unit_rate,
                            total_amount=total_amount,
                            dispatch_reference=item.get('dispatch_reference', ''),
                            origin_destination=item.get('origin_destination', ''),
                            notes=item.get('notes', ''),
                            period=target_period,
                            created_by=request.user if (request.user and request.user.is_authenticated) else None
                        )
                    saved_count += 1
                else:
                    # اگر صفر بود و قبلاً ثبت شده بود، حذف منطقی
                    if trip_obj:
                        trip_obj.is_deleted = True
                        trip_obj.save()

        # ارسال برودکست وب‌سوکت برای ناوگان
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            channel_layer = get_channel_layer()
            client_tab_id = request.data.get('client_tab_id') or request.headers.get('X-Client-Tab-ID')
            if channel_layer:
                from common.tenant_scope import get_current_tenant_company_id
                cid = get_current_tenant_company_id(request=request, user=request.user)
                target_group = f'company_{cid}_notifications' if cid else 'global_notifications'
                async_to_sync(channel_layer.group_send)(
                    target_group,
                    {
                        'type': 'send_notification',
                        'type_str': 'fleet_trips_updated',
                        'message': f'تردد ناوگان برای تاریخ {date_shamsi} ثبت/به‌روزرسانی شد.',
                        'company_id': cid,
                        'warehouse_id': warehouse_id,
                        'section_id': section_id,
                        'date_shamsi': date_shamsi,
                        'year_month': year_month,
                        'sender_id': request.user.id if request.user and request.user.is_authenticated else None,
                        'client_tab_id': client_tab_id
                    }
                )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"[WebSocket] Error broadcasting fleet_trips_updated: {e}")

        return Response({
            'message': 'سرویس‌های خودروها با موفقیت ذخیره شدند.',
            'saved_count': saved_count
        })

    @action(detail=False, methods=['get'], url_path='monthly-summary')
    def get_monthly_summary(self, request):
        """
        گزارش کاردکس و عملکرد ماهانه خودروها
        """
        raw_wh = request.query_params.get('warehouse_id')
        warehouse_id = int(raw_wh) if (raw_wh and str(raw_wh).upper() not in ['ALL', '0', 'NONE', '', 'UNDEFINED', 'NULL']) else None
        year_month = request.query_params.get('year_month')
        if not year_month:
            latest_period = MonthlyWorkPeriod.objects.order_by('-year_month').first()
            year_month = latest_period.year_month if latest_period else '1405/06'

        vehicles_base = self._scoped_vehicles().filter(is_active=True)
        if warehouse_id:
            vehicles = vehicles_base.filter(
                Q(assigned_warehouse_id=warehouse_id) | Q(assigned_warehouse_id__isnull=True)
            ).order_by('driver_name')
            trips = self._scoped_trips(VehicleTripLog.objects.filter(
                warehouse_id=warehouse_id,
                date_shamsi__startswith=year_month,
                is_deleted=False
            ))
        else:
            vehicles = vehicles_base.order_by('driver_name')
            trips = self._scoped_trips(VehicleTripLog.objects.filter(
                date_shamsi__startswith=year_month,
                is_deleted=False
            ))

        summary_rows = []
        for v in vehicles:
            v_trips = [t for t in trips if t.vehicle_id == v.id]
            total_trips = sum(t.trip_count for t in v_trips)
            total_payable = sum(float(t.total_amount) for t in v_trips)
            active_days = len(set(t.date_shamsi for t in v_trips if t.trip_count > 0))

            summary_rows.append({
                'vehicle_id': v.id,
                'driver_name': v.driver_name,
                'plate_number': v.plate_number,
                'vehicle_type': v.get_vehicle_type_display(),
                'default_rate': float(v.default_service_rate),
                'sheba_number': v.sheba_number or '',
                'active_days': active_days,
                'total_trips': total_trips,
                'total_payable': total_payable
            })

        return Response({
            'warehouse_id': warehouse_id,
            'year_month': year_month,
            'summary': summary_rows
        })

    @action(detail=False, methods=['get'], url_path='monthly-grid')
    def get_monthly_grid(self, request):
        """
        دریافت ماتریس تردد ۳۱ روزه کلیه خودروها در یک ماه مشخص (نمای شیت ماهانه ناوگان)
        """
        raw_wh = request.query_params.get('warehouse_id')
        warehouse_id = int(raw_wh) if (raw_wh and str(raw_wh).upper() not in ['ALL', '0', 'NONE', '']) else None
        raw_year_month = request.query_params.get('year_month')
        if not raw_year_month:
            return Response({'error': 'پارامتر year_month الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)

        # نرمال‌سازی سال و ماه
        ym_cleaned = normalize_digits(str(raw_year_month)).strip().replace('-', '/')
        parts = ym_cleaned.split('/')
        if len(parts) >= 2:
            y, m = int(parts[0]), int(parts[1])
            year_month = f"{y:04d}/{m:02d}"
        else:
            digits_only = ''.join(c for c in ym_cleaned if c.isdigit())
            if len(digits_only) >= 6:
                y, m = int(digits_only[:4]), int(digits_only[4:6])
                year_month = f"{y:04d}/{m:02d}"
            else:
                return Response({'error': 'فرمت year_month نامعتبر است (مثال: 1405/04).'}, status=status.HTTP_400_BAD_REQUEST)

        if 1 <= m <= 6:
            days_in_month = 31
        elif 7 <= m <= 11:
            days_in_month = 30
        elif m == 12:
            days_in_month = 30 if jdatetime.date(y, 1, 1).isleap() else 29
        else:
            return Response({'error': 'شماره ماه باید بین ۱ تا ۱۲ باشد.'}, status=status.HTTP_400_BAD_REQUEST)

        month_names = ["", "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"]
        month_name = month_names[m] if 1 <= m <= 12 else ""

        is_locked = False
        period_status = 'OPEN'
        if warehouse_id:
            period_obj = MonthlyWorkPeriod.objects.filter(warehouse_id=warehouse_id, year_month=year_month).first()
            if period_obj:
                period_status = period_obj.status
                is_locked = period_obj.status in ['LOCKED', 'SUBMITTED', 'FINALIZED']

        today = jdatetime.date.today()
        days_meta = []
        weekday_names = ["ش", "ی", "د", "س", "چ", "پ", "ج"]
        full_weekday_names = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه"]

        for d in range(1, days_in_month + 1):
            target_date = jdatetime.date(y, m, d)
            weekday = target_date.weekday()
            is_friday = (weekday == 6)
            date_str = f"{year_month}/{d:02d}"
            days_meta.append({
                'day': d,
                'date_shamsi': date_str,
                'weekday_short': weekday_names[weekday],
                'weekday_name': full_weekday_names[weekday],
                'is_friday': is_friday,
                'is_editable': not is_locked,
                'is_today': (target_date == today)
            })

        status_filter = request.query_params.get('status', 'active').lower()
        active_filter_q = Q()
        if status_filter == 'active':
            active_filter_q = Q(is_active=True, approval_status='approved')
        elif status_filter == 'inactive':
            active_filter_q = Q(is_active=False)

        vehicles_base = self._scoped_vehicles().filter(active_filter_q)
        if warehouse_id:
            vehicles = vehicles_base.filter(
                Q(assigned_warehouse_id=warehouse_id) | Q(assigned_warehouse_id__isnull=True)
            ).order_by('driver_name')
        else:
            vehicles = vehicles_base.order_by('driver_name')

        raw_sec = request.query_params.get('section_id')
        section_id = int(raw_sec) if (raw_sec and str(raw_sec).upper() not in ['ALL', '0', 'NONE', '', 'UNDEFINED', 'NULL']) else None
        if section_id:
            vehicles = vehicles.filter(section_id=section_id)

        raw_proj = request.query_params.get('project_id')
        project_id = int(raw_proj) if (raw_proj and str(raw_proj).upper() not in ['ALL', '0', 'NONE', '', 'UNDEFINED', 'NULL']) else None
        if project_id:
            vehicles = vehicles.filter(section__project_id=project_id)

        trips = self._scoped_trips(VehicleTripLog.objects.filter(
            date_shamsi__startswith=year_month,
            is_deleted=False
        ))
        if warehouse_id:
            trips = trips.filter(warehouse_id=warehouse_id)
        if section_id:
            trips = trips.filter(Q(section_id=section_id) | Q(vehicle__section_id=section_id))
        if project_id:
            trips = trips.filter(Q(section__project_id=project_id) | Q(vehicle__section__project_id=project_id))

        trip_map = {}
        for t in trips:
            try:
                d_num = int(t.date_shamsi.split('/')[2])
                trip_map[(t.vehicle_id, d_num)] = t
            except Exception:
                continue

        grid_rows = []
        for v in vehicles:
            v_days = []
            total_trips = 0
            total_amount = 0.0
            active_days_count = 0

            for dm in days_meta:
                d = dm['day']
                date_str = dm['date_shamsi']
                t = trip_map.get((v.id, d))
                if t:
                    c = t.trip_count
                    rate = float(t.unit_rate)
                    amt = float(t.total_amount)
                    total_trips += c
                    if v.ownership_type in ['contract', 'personal']:
                        total_amount += amt
                    if c > 0:
                        active_days_count += 1

                    v_days.append({
                        'day': d,
                        'date_shamsi': date_str,
                        'trip_id': t.id,
                        'trip_count': c,
                        'unit_rate': rate,
                        'total_amount': amt,
                        'dispatch_reference': t.dispatch_reference or '',
                        'origin_destination': t.origin_destination or '',
                        'notes': t.notes or '',
                        'is_existing': True
                    })
                else:
                    def_rate = float(v.default_service_rate)
                    v_days.append({
                        'day': d,
                        'date_shamsi': date_str,
                        'trip_id': None,
                        'trip_count': 0,
                        'unit_rate': def_rate,
                        'total_amount': 0.0,
                        'dispatch_reference': '',
                        'origin_destination': '',
                        'notes': '',
                        'is_existing': False
                    })

            grid_rows.append({
                'vehicle_id': v.id,
                'driver_name': v.driver_name,
                'plate_number': v.plate_number,
                'vehicle_type': v.vehicle_type,
                'vehicle_type_display': v.get_vehicle_type_display(),
                'ownership_type': v.ownership_type,
                'ownership_type_display': v.get_ownership_type_display(),
                'default_rate': float(v.default_service_rate),
                'sheba_number': v.sheba_number or '',
                'total_trips': total_trips,
                'total_amount': total_amount,
                'active_days': active_days_count,
                'is_active': v.is_active,
                'days': v_days
            })

        return Response({
            'warehouse_id': warehouse_id,
            'year_month': year_month,
            'month_name': month_name,
            'days_in_month': days_in_month,
            'days_meta': days_meta,
            'is_locked': is_locked,
            'period_status': period_status,
            'rows': grid_rows
        })

    @action(detail=False, methods=['post'], url_path='update-day-trip')
    def update_day_trip(self, request):
        """
        ویرایش یا ثبت سریع سرویس یک روز خاص از تقویم ماهانه
        """
        serializer = VehicleDayTripUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        vehicle_id = serializer.validated_data['vehicle_id']
        raw_wh = serializer.validated_data.get('warehouse_id') or request.query_params.get('warehouse_id') or request.data.get('warehouse_id')
        warehouse_id = int(raw_wh) if (raw_wh and str(raw_wh).upper() not in ['ALL', '0', 'NONE', '']) else None
        date_shamsi = serializer.validated_data['date_shamsi']
        trip_count = serializer.validated_data.get('trip_count', 0)
        unit_rate = serializer.validated_data.get('unit_rate')
        dispatch_ref = serializer.validated_data.get('dispatch_reference', '') or ''
        orig_dest = serializer.validated_data.get('origin_destination', '') or ''
        notes = serializer.validated_data.get('notes', '') or ''
        client_tab_id = serializer.validated_data.get('client_tab_id')

        raw_sec = serializer.validated_data.get('section_id') or request.query_params.get('section_id') or request.data.get('section_id')
        section_id = int(raw_sec) if (raw_sec and str(raw_sec).upper() not in ['ALL', '0', 'NONE', '']) else None
        raw_proj = serializer.validated_data.get('project_id') or request.query_params.get('project_id') or request.data.get('project_id')
        project_id = int(raw_proj) if (raw_proj and str(raw_proj).upper() not in ['ALL', '0', 'NONE', '']) else None

        target_err = self._validate_write_target(request, section_id, project_id, warehouse_id=warehouse_id)
        if target_err is not None:
            return target_err

        v_obj = self._scoped_vehicles().filter(id=vehicle_id).first()
        if not v_obj:
            return Response({'error': 'خودرو یافت نشد.'}, status=status.HTTP_404_NOT_FOUND)

        # تسک ۲.۱ و ب-۲۰: گارد جامع ثبت تردد (وضعیت تصویب، پایان همکاری، انقضای بیمه/معاینه/گواهینامه/قرارداد)
        if trip_count > 0:
            from ..fleet_lifecycle_services import validate_vehicle_validity
            is_valid, reason = validate_vehicle_validity(v_obj, date_shamsi)
            if not is_valid:
                return Response({'error': reason}, status=status.HTTP_400_BAD_REQUEST)

        if unit_rate is None:
            unit_rate = v_obj.default_service_rate

        target_wh = warehouse_id if warehouse_id else v_obj.assigned_warehouse_id
        year_month = date_shamsi[:7]

        allow_override = bool(request.data.get('is_override', False) or request.headers.get('X-Admin-Override') == 'true')
        is_admin_override = allow_override and (getattr(request.user, 'is_superuser', False) or request.user.has_perm('personnel.can_override_attendance_lock'))

        # بررسی قفل دوره
        if target_wh and not is_admin_override:
            period = MonthlyWorkPeriod.objects.filter(warehouse_id=target_wh, year_month=year_month).first()
            if period and period.status in ['LOCKED', 'SUBMITTED', 'FINALIZED']:
                return Response({'error': f'دوره کارکرد {year_month} قفل شده است و امکان ویرایش وجود ندارد.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            trip_obj = VehicleTripLog.objects.filter(
                vehicle_id=vehicle_id,
                warehouse_id=target_wh,
                date_shamsi=date_shamsi,
                is_deleted=False
            ).first()

            effective_section_id = section_id or v_obj.section_id
            effective_project_id = project_id or (v_obj.section.project_id if v_obj.section else None)

            if trip_count > 0:
                total_amount = unit_rate * trip_count
                if trip_obj:
                    old_trips = trip_obj.trip_count
                    old_rate = trip_obj.unit_rate
                    if old_trips != trip_count:
                        VehicleTripAuditLog.objects.create(
                            trip=trip_obj,
                            driver_name=v_obj.driver_name,
                            plate_number=v_obj.plate_number,
                            date_shamsi=date_shamsi,
                            changed_by=request.user if request.user.is_authenticated else None,
                            field_name='trip_count',
                            old_value=str(old_trips),
                            new_value=str(trip_count),
                            reason=notes or 'ویرایش سریع روزانه'
                        )
                    if old_rate != unit_rate:
                        VehicleTripAuditLog.objects.create(
                            trip=trip_obj,
                            driver_name=v_obj.driver_name,
                            plate_number=v_obj.plate_number,
                            date_shamsi=date_shamsi,
                            changed_by=request.user if request.user.is_authenticated else None,
                            field_name='unit_rate',
                            old_value=str(old_rate),
                            new_value=str(unit_rate),
                            reason=notes or 'تغییر نرخ سرویس'
                        )
                    trip_obj.trip_count = trip_count
                    trip_obj.unit_rate = unit_rate
                    trip_obj.total_amount = total_amount
                    trip_obj.dispatch_reference = dispatch_ref
                    trip_obj.origin_destination = orig_dest
                    trip_obj.notes = notes
                    trip_obj.is_deleted = False
                    if effective_section_id:
                        trip_obj.section_id = effective_section_id
                    if effective_project_id:
                        trip_obj.project_id = effective_project_id
                    trip_obj.save()
                else:
                    trip_obj = VehicleTripLog.objects.create(
                        vehicle_id=vehicle_id,
                        warehouse_id=target_wh,
                        section_id=effective_section_id,
                        project_id=effective_project_id,
                        date_shamsi=date_shamsi,
                        trip_count=trip_count,
                        unit_rate=unit_rate,
                        total_amount=total_amount,
                        dispatch_reference=dispatch_ref,
                        origin_destination=orig_dest,
                        notes=notes,
                        created_by=request.user if request.user.is_authenticated else None
                    )
                    VehicleTripAuditLog.objects.create(
                        trip=trip_obj,
                        driver_name=v_obj.driver_name,
                        plate_number=v_obj.plate_number,
                        date_shamsi=date_shamsi,
                        changed_by=request.user if request.user.is_authenticated else None,
                        field_name='create',
                        old_value='0',
                        new_value=str(trip_count),
                        reason=notes or 'ثبت اولیه تردد'
                    )
            else:
                if trip_obj:
                    VehicleTripAuditLog.objects.create(
                        trip=trip_obj,
                        driver_name=v_obj.driver_name,
                        plate_number=v_obj.plate_number,
                        date_shamsi=date_shamsi,
                        changed_by=request.user if request.user.is_authenticated else None,
                        field_name='delete',
                        old_value=str(trip_obj.trip_count),
                        new_value='0',
                        reason='حذف تردد'
                    )
                    trip_obj.is_deleted = True
                    trip_obj.save()

        # ارسال برودکست وب‌سوکت
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            channel_layer = get_channel_layer()
            if channel_layer:
                cid = getattr(v_obj, 'company_id', None)
                if not cid and hasattr(v_obj, 'section') and v_obj.section and v_obj.section.project:
                    cid = v_obj.section.project.company_id
                target_group = f'company_{cid}_notifications' if cid else 'global_notifications'
                async_to_sync(channel_layer.group_send)(
                    target_group,
                    {
                        'type': 'send_notification',
                        'type_str': 'fleet_trips_updated',
                        'message': f'تردد خودرو {v_obj.driver_name} در تاریخ {date_shamsi} به‌روزرسانی شد.',
                        'company_id': cid,
                        'warehouse_id': warehouse_id,
                        'section_id': section_id,
                        'date_shamsi': date_shamsi,
                        'year_month': year_month,
                        'sender_id': request.user.id if request.user and request.user.is_authenticated else None,
                        'client_tab_id': client_tab_id
                    }
                )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"[WebSocket] Error broadcasting fleet_trips_updated: {e}")

        return Response({
            'message': f'تردد خودرو {v_obj.driver_name} برای تاریخ {date_shamsi} با موفقیت ثبت شد.',
            'trip_id': trip_obj.id if (trip_count > 0 and trip_obj) else None
        })

    @action(detail=False, methods=['get'], url_path='audit-logs')
    def audit_logs(self, request):
        """
        لیست تاریخچه و ممیزی تغییرات تردد ناوگان
        """
        vehicle_id = request.query_params.get('vehicle_id')
        year_month = request.query_params.get('year_month')
        scoped_trips_qs = self._scoped_trips(VehicleTripLog.objects.all())
        qs = VehicleTripAuditLog.objects.filter(trip__in=scoped_trips_qs).select_related('changed_by')
        if vehicle_id:
            qs = qs.filter(trip__vehicle_id=vehicle_id)
        if year_month:
            qs = qs.filter(date_shamsi__startswith=year_month)

        serializer = VehicleTripAuditLogSerializer(qs[:100], many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='bulk-save-monthly-grid')
    def bulk_save_monthly_grid(self, request):
        """
        ثبت دسته‌جمعی ماتریس ۳۱ روزه ناوگان
        """
        serializer = BulkVehicleMonthlyGridSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        raw_wh = serializer.validated_data.get('warehouse_id') or request.query_params.get('warehouse_id') or request.data.get('warehouse_id')
        warehouse_id = int(raw_wh) if (raw_wh and str(raw_wh).upper() not in ['ALL', '0', 'NONE', '']) else None
        raw_sec = serializer.validated_data.get('section_id') or request.query_params.get('section_id') or request.data.get('section_id')
        section_id = int(raw_sec) if (raw_sec and str(raw_sec).upper() not in ['ALL', '0', 'NONE', '']) else None
        raw_proj = serializer.validated_data.get('project_id') or request.query_params.get('project_id') or request.data.get('project_id')
        project_id = int(raw_proj) if (raw_proj and str(raw_proj).upper() not in ['ALL', '0', 'NONE', '']) else None

        target_err = self._validate_write_target(request, section_id, project_id, warehouse_id=warehouse_id)
        if target_err is not None:
            return target_err

        year_month = serializer.validated_data['year_month']
        items = serializer.validated_data['items']
        client_tab_id = serializer.validated_data.get('client_tab_id')

        if warehouse_id:
            period = MonthlyWorkPeriod.objects.filter(warehouse_id=warehouse_id, year_month=year_month).first()
            if period and period.status in ['LOCKED', 'SUBMITTED', 'FINALIZED']:
                return Response({'error': f'دوره کارکرد {year_month} قفل شده است.'}, status=status.HTTP_400_BAD_REQUEST)

        saved_count = 0
        with transaction.atomic():
            for item in items:
                v_id = item['vehicle_id']
                day = item['day']
                trip_count = item.get('trip_count', 0)
                v_obj = self._scoped_vehicles().filter(id=v_id).first()
                if not v_obj:
                    continue

                target_wh = warehouse_id if warehouse_id else v_obj.assigned_warehouse_id
                date_shamsi = f"{year_month}/{day:02d}"

                # تسک ۲.۱ و ب-۲۰: گارد جامع ثبت تردد (وضعیت تصویب، پایان همکاری، انقضای بیمه/معاینه/گواهینامه/قرارداد)
                if trip_count > 0:
                    from ..fleet_lifecycle_services import validate_vehicle_validity
                    is_valid, reason = validate_vehicle_validity(v_obj, date_shamsi)
                    if not is_valid:
                        return Response({'error': reason}, status=status.HTTP_400_BAD_REQUEST)

                unit_rate = item.get('unit_rate') or v_obj.default_service_rate
                total_amount = unit_rate * trip_count

                trip_obj = VehicleTripLog.objects.filter(
                    vehicle_id=v_id,
                    warehouse_id=target_wh,
                    date_shamsi=date_shamsi,
                    is_deleted=False
                ).first()

                effective_section_id = section_id or v_obj.section_id
                effective_project_id = project_id or (v_obj.section.project_id if v_obj.section else None)

                if trip_count > 0:
                    if trip_obj:
                        trip_obj.trip_count = trip_count
                        trip_obj.unit_rate = unit_rate
                        trip_obj.total_amount = total_amount
                        trip_obj.dispatch_reference = item.get('dispatch_reference', '') or ''
                        trip_obj.origin_destination = item.get('origin_destination', '') or ''
                        trip_obj.notes = item.get('notes', '') or ''
                        trip_obj.is_deleted = False
                        if effective_section_id:
                            trip_obj.section_id = effective_section_id
                        if effective_project_id:
                            trip_obj.project_id = effective_project_id
                        trip_obj.save()
                    else:
                        VehicleTripLog.objects.create(
                            vehicle_id=v_id,
                            warehouse_id=target_wh,
                            section_id=effective_section_id,
                            project_id=effective_project_id,
                            date_shamsi=date_shamsi,
                            trip_count=trip_count,
                            unit_rate=unit_rate,
                            total_amount=total_amount,
                            dispatch_reference=item.get('dispatch_reference', '') or '',
                            origin_destination=item.get('origin_destination', '') or '',
                            notes=item.get('notes', '') or '',
                            created_by=request.user
                        )
                    saved_count += 1
                else:
                    if trip_obj:
                        trip_obj.is_deleted = True
                        trip_obj.save()

        # وب‌سوکت
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            channel_layer = get_channel_layer()
            if channel_layer:
                from common.tenant_scope import get_current_tenant_company_id
                cid = get_current_tenant_company_id(request=request, user=request.user)
                target_group = f'company_{cid}_notifications' if cid else 'global_notifications'
                async_to_sync(channel_layer.group_send)(
                    target_group,
                    {
                        'type': 'send_notification',
                        'type_str': 'fleet_trips_updated',
                        'message': f'ماتریس ۳۱ روزه ناوگان برای دوره {year_month} ذخیره شد.',
                        'company_id': cid,
                        'warehouse_id': warehouse_id,
                        'section_id': section_id,
                        'year_month': year_month,
                        'sender_id': request.user.id if request.user and request.user.is_authenticated else None,
                        'client_tab_id': client_tab_id
                    }
                )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"[WebSocket] Error broadcasting fleet_trips_updated: {e}")

        return Response({
            'message': f'ماتریس ۳۱ روزه ناوگان برای دوره {year_month} با موفقیت ذخیره شد.',
            'saved_count': saved_count
        })

    @action(detail=False, methods=['get'], url_path='export-monthly-excel')
    def export_monthly_excel(self, request):
        """
        دانلود فایل اکسل ۳۱ روزه استاندارد کارکرد و تردد ناوگان
        """
        raw_wh = request.query_params.get('warehouse_id')
        warehouse_id = int(raw_wh) if (raw_wh and str(raw_wh).upper() not in ['ALL', '0', 'NONE', '']) else None
        year_month = request.query_params.get('year_month')
        if not year_month:
            return Response({'error': 'پارامتر year_month الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)

        raw_sec = request.query_params.get('section_id')
        section_id = int(raw_sec) if (raw_sec and str(raw_sec).upper() not in ['ALL', '0', 'NONE', '']) else None

        excel_buffer = export_fleet_monthly_excel(
            warehouse_id=warehouse_id,
            year_month=year_month,
            section_id=section_id,
            vehicles_qs=self._scoped_vehicles(),
            trips_qs=self._scoped_trips(VehicleTripLog.objects.all())
        )
        filename = f"Fleet_Timesheet_{year_month.replace('/', '_')}.xlsx"
        response = HttpResponse(
            excel_buffer.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    @action(detail=False, methods=['post'], url_path='import-monthly-excel')
    def import_monthly_excel(self, request):
        """
        درون‌ریزی فایل اکسل ۳۱ روزه کارکرد ناوگان
        """
        raw_wh = request.data.get('warehouse_id') or request.query_params.get('warehouse_id')
        warehouse_id = int(raw_wh) if (raw_wh and str(raw_wh).upper() not in ['ALL', '0', 'NONE', '']) else None
        raw_sec = request.data.get('section_id') or request.query_params.get('section_id')
        section_id = int(raw_sec) if (raw_sec and str(raw_sec).upper() not in ['ALL', '0', 'NONE', '']) else None
        raw_proj = request.data.get('project_id') or request.query_params.get('project_id')
        project_id = int(raw_proj) if (raw_proj and str(raw_proj).upper() not in ['ALL', '0', 'NONE', '']) else None

        target_err = self._validate_write_target(request, section_id, project_id, warehouse_id=warehouse_id)
        if target_err is not None:
            return target_err

        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'فایل اکسل الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)

        year_month = request.data.get('year_month')

        try:
            result = import_fleet_monthly_excel(
                file_obj=file_obj,
                warehouse_id=warehouse_id,
                year_month=year_month,
                user=request.user,
                vehicles_qs=self._scoped_vehicles()
            )
            return Response(result, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

__all__ = [
    'VehicleTripViewSet',
]
