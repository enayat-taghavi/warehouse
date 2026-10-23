# -*- coding: utf-8 -*-
"""
ViewSets for daily attendance matrix/grids and monthly work periods.
"""

import io
import openpyxl
import jdatetime
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.http import HttpResponse
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from common.date_utils import normalize_digits
from companies.access import (
    get_request_company_id,
    validate_user_company_access,
)
from ..models import (
    DailyAttendance,
    MonthlyWorkPeriod,
    AttendanceAuditLog,
    PersonnelProfile,
    ProjectSection,
)
from ..serializers import (
    DailyAttendanceSerializer,
    BulkAttendanceMatrixSerializer,
    BulkMonthlyAttendanceGridSerializer,
    MonthlyWorkPeriodSerializer,
)
from ..payroll_engine import get_effective_payroll_settings
from .scope_helpers import (
    broadcast_attendance_updated,
    is_date_shamsi_friday,
    normalize_attendance_date,
    safe_int,
    validate_attendance_date_window,
)

class DailyAttendanceViewSet(viewsets.ModelViewSet):
    queryset = DailyAttendance.objects.filter(is_deleted=False).select_related('personnel', 'period')
    serializer_class = DailyAttendanceSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        warehouse_id = self.request.query_params.get('warehouse_id')
        if warehouse_id:
            qs = qs.filter(warehouse_id=warehouse_id)
        section_id = self.request.query_params.get('section_id')
        if section_id:
            qs = qs.filter(Q(section_id=section_id) | Q(personnel__section_id=section_id))
        project_id = self.request.query_params.get('project_id')
        if project_id:
            qs = qs.filter(Q(section__project_id=project_id) | Q(personnel__section__project_id=project_id))
        date_shamsi = self.request.query_params.get('date_shamsi')
        if date_shamsi:
            qs = qs.filter(date_shamsi=date_shamsi)
        personnel_id = self.request.query_params.get('personnel_id')
        if personnel_id:
            qs = qs.filter(personnel_id=personnel_id)
        approval_status = self.request.query_params.get('approval_status')
        if approval_status:
            qs = qs.filter(approval_status=approval_status)
        year_month = self.request.query_params.get('year_month')
        if year_month:
            norm_ym = year_month.replace('-', '/')
            qs = qs.filter(date_shamsi__startswith=norm_ym)
        cid = validate_user_company_access(self.request.user, get_request_company_id(self.request))
        if cid:
            qs = qs.filter(Q(section__project__company_id=cid) | Q(personnel__company_id=cid) | Q(personnel__section__project__company_id=cid))
        return qs

    @action(detail=False, methods=['get'], url_path='matrix')
    def get_matrix(self, request):
        """
        دریافت داده‌های ماتریسی حضور و غیاب (پشتیبانی از مستقل از انبار یا فیلتر انبار خاص)
        همراه با استخراج هوشمند آخرین وضعیت ثبت‌شده فرد در روز قبل به عنوان پیش‌فرض
        """
        raw_wh = request.query_params.get('warehouse_id')
        warehouse_id = int(raw_wh) if (raw_wh and str(raw_wh).upper() not in ['ALL', '0', 'NONE', '']) else None
        raw_date = request.query_params.get('date_shamsi')
        if not raw_date:
            return Response({'error': 'پارامتر date_shamsi الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)

        date_shamsi = normalize_attendance_date(raw_date)
        year_month = date_shamsi[:7]

        from common.tenant_scope import get_current_tenant_company_id
        company_id = request.query_params.get('company_id') or get_current_tenant_company_id(request=request, user=request.user)

        # بررسی وضعیت قفل دوره بر مبنای انبار یا شرکت
        period = None
        if warehouse_id:
            period = MonthlyWorkPeriod.objects.filter(warehouse_id=warehouse_id, year_month=year_month).first()
        elif company_id:
            period = MonthlyWorkPeriod.objects.filter(company_id=company_id, year_month=year_month).first()

        is_locked = period.status == 'LOCKED' if period else False
        period_status = period.status if period else 'OPEN'

        # لیست پرسنل تاییدشده یا پرسنلی که در این تاریخ کارکرد دارند (مستقل از انبار یا فیلتر انبار خاص)
        if warehouse_id:
            personnel_list = PersonnelProfile.objects.filter(
                Q(assigned_warehouse_id=warehouse_id) | Q(assigned_warehouse_id__isnull=True),
                Q(is_active=True, approval_status='approved') | Q(daily_attendances__date_shamsi=date_shamsi, daily_attendances__is_deleted=False)
            ).distinct().order_by('last_name', 'first_name')
            if company_id:
                personnel_list = personnel_list.filter(Q(company_id=company_id) | Q(section__project__company_id=company_id))

            attendances_qs = DailyAttendance.objects.filter(
                Q(warehouse_id=warehouse_id) | Q(personnel__in=personnel_list),
                date_shamsi=date_shamsi,
                is_deleted=False
            ).select_related('personnel').order_by('id')
            # اولویت با رکوردهایی است که اختصاصاً برای همین انبار ثبت شده‌اند
            existing_attendances = {}
            for att in attendances_qs:
                if att.personnel_id not in existing_attendances or att.warehouse_id == warehouse_id:
                    existing_attendances[att.personnel_id] = att
        else:
            personnel_list = PersonnelProfile.objects.filter(
                Q(is_active=True, approval_status='approved') | Q(daily_attendances__date_shamsi=date_shamsi, daily_attendances__is_deleted=False)
            ).distinct().order_by('last_name', 'first_name')
            if company_id:
                personnel_list = personnel_list.filter(Q(company_id=company_id) | Q(section__project__company_id=company_id))

            attendances_qs = DailyAttendance.objects.filter(
                date_shamsi=date_shamsi,
                is_deleted=False
            ).select_related('personnel').order_by('id')
            existing_attendances = {att.personnel_id: att for att in attendances_qs}

        raw_sec = request.query_params.get('section_id')
        section_id = int(raw_sec) if (raw_sec and str(raw_sec).upper() not in ['ALL', '0', 'NONE', '']) else None
        if section_id:
            personnel_list = personnel_list.filter(
                Q(section_id=section_id) |
                Q(section_assignments__section_id=section_id, section_assignments__is_active=True)
            ).distinct()
            attendances_qs = attendances_qs.filter(
                Q(section_id=section_id) | (Q(section_id__isnull=True) & Q(personnel__section_id=section_id))
            )
            existing_attendances = {att.personnel_id: att for att in attendances_qs}

        # فیلتر کانتکست شرکت فعال در ماتریس کارکرد
        cid = validate_user_company_access(request.user, get_request_company_id(request))
        if cid:
            personnel_list = personnel_list.filter(Q(company_id=cid) | Q(section__project__company_id=cid))

        is_today_friday = is_date_shamsi_friday(date_shamsi)

        matrix_rows = []
        for p in personnel_list:
            att = existing_attendances.get(p.id)
            p_job_title = p.job_title
            if section_id:
                sa = p.section_assignments.filter(section_id=section_id, is_active=True).first()
                if sa and sa.job_title:
                    p_job_title = sa.job_title
            if att:
                matrix_rows.append({
                    'personnel_id': p.id,
                    'full_name': p.full_name,
                    'national_code': p.national_code,
                    'job_title': p_job_title,
                    'is_active': p.is_active,
                    'warehouse_id': att.warehouse_id,
                    'warehouse_name': att.warehouse.name if att.warehouse else (p.assigned_warehouse.name if p.assigned_warehouse else 'شناور'),
                    'attendance_id': att.id,
                    'status': att.status,
                    'effective_hours': float(att.effective_hours),
                    'overtime_hours': float(att.overtime_hours),
                    'is_friday_work': att.is_friday_work,
                    'is_mission': att.is_mission,
                    'advance_payment': float(att.advance_payment),
                    'notes': att.notes or '',
                    'is_existing': True
                })
            else:
                # روزهای ثبت‌نشده یا پاکسازی‌شده با وضعیت خالی و ساعت ۰ بازگردانده می‌شوند
                matrix_rows.append({
                    'personnel_id': p.id,
                    'full_name': p.full_name,
                    'national_code': p.national_code,
                    'job_title': p_job_title,
                    'is_active': p.is_active,
                    'warehouse_id': p.assigned_warehouse_id,
                    'warehouse_name': p.assigned_warehouse.name if p.assigned_warehouse else 'شناور',
                    'attendance_id': None,
                    'status': '',
                    'effective_hours': 0.0,
                    'overtime_hours': 0.0,
                    'is_friday_work': is_today_friday,
                    'is_mission': False,
                    'advance_payment': 0.0,
                    'notes': '',
                    'is_existing': False
                })

        return Response({
            'warehouse_id': warehouse_id,
            'date_shamsi': date_shamsi,
            'year_month': year_month,
            'is_locked': is_locked,
            'period_status': period_status,
            'rows': matrix_rows
        })

    @action(detail=False, methods=['post'], url_path='bulk-save')
    def bulk_save(self, request):
        """
        ذخیره گروهی و سریع ماتریس حضور و غیاب پرسنل در پایان روز
        (پشتیبانی کامل از کارکرد مستقل از انبار و لاگ ممیزی)
        """
        serializer = BulkAttendanceMatrixSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        raw_wh = serializer.validated_data.get('warehouse_id')
        warehouse_id = int(raw_wh) if (raw_wh and str(raw_wh).upper() not in ['ALL', '0', 'NONE', '']) else None
        project_id = serializer.validated_data.get('project_id')
        section_id = serializer.validated_data.get('section_id')
        if section_id and not project_id:
            sec_ref = ProjectSection.objects.filter(id=section_id).first()
            if sec_ref:
                project_id = sec_ref.project_id

        raw_date = serializer.validated_data['date_shamsi']
        date_shamsi = normalize_attendance_date(raw_date)
        items = serializer.validated_data['items']

        allow_override = bool(request.data.get('is_override', False) or request.headers.get('X-Admin-Override') == 'true')
        is_admin_override = allow_override and (getattr(request.user, 'is_superuser', False) or request.user.has_perm('personnel.can_override_attendance_lock'))

        # اعتبارسنجی بازه زمانی مجاز بر مبنای تنظیمات مدیر
        try:
            validate_attendance_date_window(date_shamsi, user=request.user, allow_override=is_admin_override, warehouse_id=warehouse_id, project_id=project_id)
        except Exception as e:
            err_msg = getattr(e, 'detail', str(e))
            if isinstance(err_msg, list):
                err_msg = err_msg[0]
            return Response({'error': str(err_msg)}, status=status.HTTP_400_BAD_REQUEST)

        year_month = date_shamsi[:7]
        locked_period_statuses = [
            'LOCKED', 'SUBMITTED', 'FINALIZED', 'SUBMITTED_SUPERVISOR',
            'PENDING_ACCOUNTANT', 'SUBMITTED_ACCOUNTANT', 'PENDING_MANAGER',
            'READY_TO_PAY', 'PAID'
        ]
        period = None
        if warehouse_id:
            period, _ = MonthlyWorkPeriod.objects.get_or_create(
                warehouse_id=warehouse_id,
                year_month=year_month,
                defaults={'status': 'OPEN'}
            )
            if period.status in locked_period_statuses and not is_admin_override:
                return Response({'error': f'دوره کارکرد {year_month} در وضعیت «{period.get_status_display()}» بوده و امکان ثبت یا ویرایش وجود ندارد.'}, status=status.HTTP_400_BAD_REQUEST)

        saved_count = 0
        updated_count = 0

        with transaction.atomic():
            for item in items:
                personnel_id = item['personnel_id']
                p_obj = PersonnelProfile.objects.filter(id=personnel_id).first()
                if not p_obj:
                    continue

                if p_obj.approval_status != 'approved':
                    return Response({
                        'error': f'امکان ثبت کارکرد برای پرسنل «{p_obj.full_name}» وجود ندارد زیرا پرونده او در وضعیت «{p_obj.get_approval_status_display()}» بوده و هنوز به تایید نهایی مدیر و حسابدار نرسیده است.'
                    }, status=status.HTTP_400_BAD_REQUEST)

                from ..lifecycle_services import validate_personnel_validity
                is_valid_date, val_err = validate_personnel_validity(p_obj, date_shamsi)
                if not is_valid_date:
                    return Response({'error': val_err}, status=status.HTTP_400_BAD_REQUEST)

                item_wh = item.get('warehouse_id')
                check_wh = item_wh if item_wh is not None else (warehouse_id if warehouse_id else p_obj.assigned_warehouse_id)
                target_period = period
                if not target_period and check_wh:
                    target_period = MonthlyWorkPeriod.objects.filter(
                        warehouse_id=check_wh,
                        year_month=year_month
                    ).first()
                if target_period and target_period.status in locked_period_statuses and not is_admin_override:
                    return Response({'error': f'دوره کارکرد {year_month} برای انبار پرسنل ({p_obj.full_name}) قفل شده است.'}, status=status.HTTP_400_BAD_REQUEST)

                target_wh = item_wh if item_wh is not None else (warehouse_id if warehouse_id else p_obj.assigned_warehouse_id)

                status_val = item['status']
                eff_h = float(item.get('effective_hours', 0))
                ot_h = float(item.get('overtime_hours', 0))
                is_fri = bool(item.get('is_friday_work', False))
                is_mis = bool(item.get('is_mission', False))
                adv_pay = float(item.get('advance_payment', 0))
                notes_val = item.get('notes', '') or ''

                target_section_id = section_id or p_obj.section_id
                target_project_id = project_id or p_obj.project_id or (p_obj.section.project_id if p_obj.section else None)

                # اگر وضعیت خالی و ساعت صفر باشد (پاکسازی‌شده)، رکورد دیتابیس در این بخش حذف می‌گردد
                if not status_val and eff_h == 0:
                    att_filter = {
                        'personnel_id': personnel_id,
                        'date_shamsi': date_shamsi,
                        'is_deleted': False
                    }
                    if target_section_id:
                        att_obj = DailyAttendance.objects.select_for_update().filter(
                            Q(**att_filter) & (Q(section_id=target_section_id) | (Q(section_id__isnull=True) & Q(personnel__section_id=target_section_id)))
                        ).first()
                    else:
                        att_obj = DailyAttendance.objects.select_for_update().filter(**att_filter).first()
                    if att_obj:
                        att_obj.is_deleted = True
                        att_obj.modified_by = request.user
                        att_obj.save()
                        AttendanceAuditLog.objects.create(
                            attendance=att_obj,
                            personnel_name=p_obj.full_name,
                            date_shamsi=date_shamsi,
                            changed_by=request.user,
                            field_name='is_deleted',
                            old_value='False',
                            new_value='True',
                            reason='پاکسازی کارکرد روزانه'
                        )
                        updated_count += 1
                    continue

                # اعتبارسنجی و ریست منطقی ساعات در صورت غیبت یا مرخصی
                if status_val in ['ABSENT', 'LEAVE']:
                    eff_h = 0.0
                    ot_h = 0.0
                    is_fri = False
                    is_mis = False

                # پیدا کردن رکورد فعال پرسنل در این تاریخ و این بخش
                att_filter = {
                    'personnel_id': personnel_id,
                    'date_shamsi': date_shamsi,
                    'is_deleted': False
                }
                if target_section_id:
                    att_obj = DailyAttendance.objects.select_for_update().filter(
                        Q(**att_filter) & (Q(section_id=target_section_id) | (Q(section_id__isnull=True) & Q(personnel__section_id=target_section_id)))
                    ).first()
                else:
                    att_obj = DailyAttendance.objects.select_for_update().filter(**att_filter).first()

                # اعتبارسنجی عدم تداخل کارکرد در چند بخش مختلف در یک روز
                other_att_qs = DailyAttendance.objects.filter(
                    personnel_id=personnel_id,
                    date_shamsi=date_shamsi,
                    is_deleted=False
                )
                if att_obj:
                    other_att_qs = other_att_qs.exclude(id=att_obj.id)
                elif target_section_id:
                    other_att_qs = other_att_qs.exclude(Q(section_id=target_section_id) | (Q(section_id__isnull=True) & Q(personnel__section_id=target_section_id)))

                if status_val == 'PRESENT_10H':
                    conflicting_full = other_att_qs.filter(status='PRESENT_10H').first()
                    if conflicting_full:
                        sec_title = conflicting_full.section.name if conflicting_full.section else 'بخش دیگری'
                        return Response({
                            'error': f'برای پرسنل «{p_obj.full_name}» در تاریخ {date_shamsi} وضعیت «حاضر کامل» در «{sec_title}» ثبت شده است. در صورت کارکرد همزمان در دو بخش، از وضعیت نیمه‌وقت یا ساعت سفارشی استفاده نمایید.'
                        }, status=status.HTTP_400_BAD_REQUEST)

                other_hours_sum = sum(float(a.effective_hours or 0) for a in other_att_qs)
                if other_hours_sum + eff_h > 24:
                    return Response({
                        'error': f'مجموع کارکرد روزانه پرسنل «{p_obj.full_name}» در تاریخ {date_shamsi} در بخش‌های مختلف ({other_hours_sum + eff_h:.1f} ساعت) از سقف ۲۴ ساعت شبانه‌روز بیشتر است.'
                    }, status=status.HTTP_400_BAD_REQUEST)

                if att_obj:
                    # بررسی تغییرات جهت ثبت در Audit Log
                    changes = []
                    item_sanitized = {
                        'status': status_val,
                        'effective_hours': eff_h,
                        'overtime_hours': ot_h,
                        'is_friday_work': is_fri,
                        'is_mission': is_mis,
                        'advance_payment': adv_pay,
                        'notes': notes_val
                    }
                    fields_to_check = ['status', 'effective_hours', 'overtime_hours', 'is_friday_work', 'is_mission', 'advance_payment', 'notes']
                    for f in fields_to_check:
                        new_val = item_sanitized.get(f)
                        old_val = getattr(att_obj, f)
                        is_diff = False
                        if f in ['effective_hours', 'overtime_hours', 'advance_payment']:
                            if float(new_val or 0) != float(old_val or 0):
                                is_diff = True
                        elif f in ['is_friday_work', 'is_mission']:
                            if bool(new_val) != bool(old_val):
                                is_diff = True
                        else:
                            if str(new_val or '') != str(old_val or ''):
                                is_diff = True
                        if is_diff:
                            changes.append((f, str(old_val), str(new_val)))

                    # اعمال تغییرات
                    att_obj.status = status_val
                    att_obj.effective_hours = eff_h
                    att_obj.overtime_hours = ot_h
                    att_obj.is_friday_work = is_fri
                    att_obj.is_mission = is_mis
                    att_obj.advance_payment = adv_pay
                    att_obj.notes = notes_val
                    att_obj.warehouse_id = target_wh
                    if target_section_id:
                        att_obj.section_id = target_section_id
                    if target_project_id:
                        att_obj.project_id = target_project_id
                    # در صورت ویرایش رکوردی که قبلا تایید شده بود، تاییدیه باطل شده و به وضعیت در انتظار سرپرست بازمی‌گردد
                    if changes and att_obj.approval_status == 'APPROVED':
                        att_obj.approval_status = 'PENDING_SUPERVISOR'
                        att_obj.supervisor_approved_by = None
                        att_obj.supervisor_approved_at = None
                        changes.append(('approval_status', 'APPROVED', 'PENDING_SUPERVISOR'))

                    att_obj.modified_by = request.user
                    if target_period:
                        att_obj.period = target_period
                    att_obj.save()

                    # پاکسازی رکوردهای تکراری قدیمی احتمالی برای این روز در همین بخش
                    dup_qs = DailyAttendance.objects.filter(
                        personnel_id=personnel_id,
                        date_shamsi=date_shamsi,
                        is_deleted=False
                    ).exclude(id=att_obj.id)
                    if target_section_id:
                        dup_qs = dup_qs.filter(Q(section_id=target_section_id) | (Q(section_id__isnull=True) & Q(personnel__section_id=target_section_id)))
                    dup_qs.delete()

                    # ثبت لاگ‌های ممیزی
                    for f_name, o_val, n_val in changes:
                        AttendanceAuditLog.objects.create(
                            attendance=att_obj,
                            personnel_name=p_obj.full_name,
                            date_shamsi=date_shamsi,
                            changed_by=request.user,
                            field_name=f_name,
                            old_value=o_val,
                            new_value=n_val,
                            reason='ویرایش ماتریسی کارکرد روزانه'
                        )
                    updated_count += 1
                else:
                    # ایجاد رکورد جدید با انتساب به بخش و پروژه مشخص
                    att_obj = DailyAttendance.objects.create(
                        personnel_id=personnel_id,
                        warehouse_id=target_wh,
                        project_id=target_project_id,
                        section_id=target_section_id,
                        date_shamsi=date_shamsi,
                        status=status_val,
                        effective_hours=eff_h,
                        overtime_hours=ot_h,
                        is_friday_work=is_fri,
                        is_mission=is_mis,
                        advance_payment=adv_pay,
                        notes=notes_val,
                        period=target_period or period,
                        created_by=request.user,
                        modified_by=request.user
                    )
                    saved_count += 1

        client_tab_id = request.data.get('client_tab_id') or request.headers.get('X-Client-Tab-ID')
        broadcast_attendance_updated(
            warehouse_id=warehouse_id,
            date_shamsi=date_shamsi,
            year_month=year_month,
            sender_id=request.user.id if request.user and request.user.is_authenticated else None,
            client_tab_id=client_tab_id,
            message=f'کارکرد پرسنل برای تاریخ {date_shamsi} به‌روزرسانی شد.'
        )

        return Response({
            'message': f'اطلاعات کارکرد با موفقیت ذخیره شد ({saved_count} جدید، {updated_count} بروزرسانی).',
            'saved_count': saved_count,
            'updated_count': updated_count
        })

    @action(detail=False, methods=['post'], url_path='clear-day')
    def clear_day(self, request):
        """
        پاکسازی کامل و اصولی کارکرد روزانه پرسنل برای یک تاریخ مشخص
        """
        date_shamsi = request.data.get('date_shamsi')
        if not date_shamsi:
            return Response({'error': 'پارامتر date_shamsi الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)

        raw_wh = request.data.get('warehouse_id')
        warehouse_id = int(raw_wh) if (raw_wh and str(raw_wh).upper() not in ['ALL', '0', 'NONE', '']) else None
        project_id = safe_int(request.data.get('project_id'))
        section_id = safe_int(request.data.get('section_id'))
        personnel_ids = request.data.get('personnel_ids')

        # اعتبارسنجی بازه مجاز ویرایش تاریخ
        is_admin_override = request.user.is_superuser or (request.user.role and request.user.role.name in ['Admin', 'Manager']) or request.user.has_perm('personnel.can_override_attendance_lock')
        if not is_admin_override:
            validate_attendance_date_window(date_shamsi, user=request.user, allow_override=is_admin_override, warehouse_id=warehouse_id, project_id=project_id)

        qs = DailyAttendance.objects.filter(date_shamsi=date_shamsi, is_deleted=False)
        if warehouse_id:
            qs = qs.filter(warehouse_id=warehouse_id)
        if section_id:
            qs = qs.filter(section_id=section_id)
        if personnel_ids and isinstance(personnel_ids, list) and len(personnel_ids) > 0:
            qs = qs.filter(personnel_id__in=personnel_ids)

        deleted_count = 0
        with transaction.atomic():
            for att in qs.select_for_update():
                att.is_deleted = True
                att.modified_by = request.user
                att.save()
                AttendanceAuditLog.objects.create(
                    attendance=att,
                    personnel_name=att.personnel.full_name if att.personnel else '',
                    date_shamsi=date_shamsi,
                    changed_by=request.user,
                    field_name='is_deleted',
                    old_value='False',
                    new_value='True',
                    reason='پاکسازی کارکرد روزانه'
                )
                deleted_count += 1

        ym = date_shamsi[:7] if len(date_shamsi) >= 7 else None
        client_tab_id = request.data.get('client_tab_id') or request.headers.get('X-Client-Tab-ID')
        broadcast_attendance_updated(
            warehouse_id=warehouse_id,
            date_shamsi=date_shamsi,
            year_month=ym,
            sender_id=request.user.id if request.user and request.user.is_authenticated else None,
            client_tab_id=client_tab_id,
            message=f'کارکرد روز {date_shamsi} برای {deleted_count} نفر پاکسازی شد.'
        )

        return Response({
            'message': f'کارکرد روز {date_shamsi} برای {deleted_count} نفر با موفقیت پاکسازی شد.',
            'cleared_count': deleted_count
        })

    @action(detail=False, methods=['get'], url_path='monthly-grid')
    def get_monthly_grid(self, request):
        """
        دریافت ماتریس کارکرد ۳۱ روزه کلیه پرسنل در یک ماه مشخص (نمای شیت ماهانه)
        پشتیبانی کامل از کارکرد مستقل از انبار و اصلاح وضعیت روزهای ثبت‌نشده (نباید به عنوان حاضر بزند)
        """
        import jdatetime
        raw_wh = request.query_params.get('warehouse_id')
        warehouse_id = int(raw_wh) if (raw_wh and str(raw_wh).upper() not in ['ALL', '0', 'NONE', '']) else None
        project_id = safe_int(request.query_params.get('project_id'))
        section_id = safe_int(request.query_params.get('section_id'))
        raw_year_month = request.query_params.get('year_month')
        if not raw_year_month:
            return Response({'error': 'پارامتر year_month الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)

        # نرمال‌سازی سال و ماه (پشتیبانی از 140504 یا 1405/04)
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

        # محاسبه تعداد روزهای ماه خورشیدی
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
        period_obj = None
        if warehouse_id:
            period_obj = MonthlyWorkPeriod.objects.filter(warehouse_id=warehouse_id, year_month=year_month).first()
            if period_obj:
                period_status = period_obj.status
                is_locked = period_obj.status in ['LOCKED', 'SUBMITTED', 'FINALIZED']

        # واکشی تنظیمات بازه ویرایش متناسب با سال، ماه و پروژه
        settings = get_effective_payroll_settings(year_month, project_id)
        past_limit = settings.attendance_edit_past_days if settings else 3
        future_limit = settings.attendance_edit_future_days if settings else 0

        today = jdatetime.date.today()

        days_meta = []
        for d in range(1, days_in_month + 1):
            target_date = jdatetime.date(y, m, d)
            weekday = target_date.weekday()  # 0=شنبه ... 6=جمعه
            is_friday = (weekday == 6)
            weekday_names = ["ش", "ی", "د", "س", "چ", "پ", "ج"]
            full_weekday_names = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه"]
            
            delta_days = (target_date - today).days
            is_editable = not is_locked
            if is_editable:
                if delta_days < 0 and past_limit is not None and past_limit != -1 and abs(delta_days) > past_limit:
                    is_editable = False
                elif delta_days > 0 and future_limit is not None and future_limit != -1 and delta_days > future_limit:
                    is_editable = False

            date_str = f"{year_month}/{d:02d}"
            days_meta.append({
                'day': d,
                'date_shamsi': date_str,
                'weekday_short': weekday_names[weekday],
                'weekday_name': full_weekday_names[weekday],
                'is_friday': is_friday,
                'is_editable': is_editable,
                'is_today': (target_date == today)
            })

        # پرسنل تاییدشده یا پرسنل غیرفعالی که در این ماه کارکرد دارند (مستقل از انبار یا فیلتر انبار خاص)
        if warehouse_id:
            personnel_list = PersonnelProfile.objects.filter(
                Q(assigned_warehouse_id=warehouse_id) | Q(assigned_warehouse_id__isnull=True),
                Q(is_active=True, approval_status='approved') | Q(daily_attendances__date_shamsi__startswith=year_month, daily_attendances__is_deleted=False)
            ).distinct().order_by('last_name', 'first_name')
            if section_id:
                personnel_list = personnel_list.filter(
                    Q(section_id=section_id) |
                    Q(section_assignments__section_id=section_id, section_assignments__is_active=True)
                ).distinct()
            attendances = DailyAttendance.objects.filter(
                Q(warehouse_id=warehouse_id) | Q(personnel__in=personnel_list),
                date_shamsi__startswith=year_month,
                is_deleted=False
            ).order_by('id')
            if section_id:
                attendances = attendances.filter(section_id=section_id)
        else:
            personnel_list = PersonnelProfile.objects.filter(
                Q(is_active=True, approval_status='approved') | Q(daily_attendances__date_shamsi__startswith=year_month, daily_attendances__is_deleted=False)
            ).distinct().order_by('last_name', 'first_name')
            if section_id:
                personnel_list = personnel_list.filter(
                    Q(section_id=section_id) |
                    Q(section_assignments__section_id=section_id, section_assignments__is_active=True)
                ).distinct()
            attendances = DailyAttendance.objects.filter(
                date_shamsi__startswith=year_month,
                is_deleted=False
            ).order_by('id')
            if section_id:
                attendances = attendances.filter(section_id=section_id)

        att_map = {}
        for a in attendances:
            try:
                d_num = int(a.date_shamsi.split('/')[2])
                att_map[(a.personnel_id, d_num)] = a
            except Exception:
                continue

        status_display_map = {
            'PRESENT_10H': 'حاضر ۱۰س',
            'HALF_5H': 'نیمه‌وقت ۵س',
            'ABSENT': 'غایب',
            'LEAVE': 'مرخصی',
            'MISSION': 'ماموریت',
            'FRIDAY_WORK': 'جمعه‌کاری',
            'CUSTOM': 'سفارشی'
        }

        grid_rows = []
        anomalies = []

        for p in personnel_list:
            p_job_title = p.job_title
            if section_id:
                sa = p.section_assignments.filter(section_id=section_id, is_active=True).first()
                if sa and sa.job_title:
                    p_job_title = sa.job_title
            p_days = []
            total_hours = 0.0
            total_overtime = 0.0
            present_days_count = 0
            recorded_days = []

            for dm in days_meta:
                d = dm['day']
                att = att_map.get((p.id, d))
                if att:
                    eff_h = float(att.effective_hours)
                    ovt_h = float(att.overtime_hours)
                    adv = float(att.advance_payment or 0)
                    st_disp = status_display_map.get(att.status, att.status)

                    p_days.append({
                        'day': d,
                        'date_shamsi': dm['date_shamsi'],
                        'status': att.status,
                        'status_display': st_disp,
                        'effective_hours': eff_h,
                        'overtime_hours': ovt_h,
                        'is_friday_work': att.is_friday_work,
                        'is_mission': att.is_mission,
                        'advance_payment': adv,
                        'notes': att.notes or '',
                        'is_existing': True,
                        'attendance_id': att.id
                    })
                    total_hours += eff_h
                    total_overtime += ovt_h
                    if att.status and att.status != 'ABSENT' and eff_h > 0:
                        present_days_count += 1
                    recorded_days.append(d)

                    # ۱. ناهنجاری کارکرد بیش از ۱۶ ساعت
                    if (eff_h + ovt_h) > 16:
                        anomalies.append({
                            'type': 'EXCESSIVE_HOURS',
                            'severity': 'high',
                            'personnel_id': p.id,
                            'full_name': p.full_name,
                            'day': d,
                            'message': f"کارکرد بیش از سقف مجاز ({eff_h + ovt_h:.1f} ساعت) برای {p.full_name} در روز {d} ثبت شده است."
                        })

                    # ۲. تضاد اضافه‌کار با غیبت یا مرخصی
                    if att.status in ['ABSENT', 'LEAVE'] and ovt_h > 0:
                        anomalies.append({
                            'type': 'CONFLICT_OVERTIME',
                            'severity': 'high',
                            'personnel_id': p.id,
                            'full_name': p.full_name,
                            'day': d,
                            'message': f"ثبت اضافه‌کار ({ovt_h:.1f} ساعت) در روز {d} برای {p.full_name} با وضعیت «{st_disp}» مغایرت دارد."
                        })

                    # ۳. مساعده نقدی در روز غیبت
                    if att.status == 'ABSENT' and adv > 0:
                        anomalies.append({
                            'type': 'ADVANCE_ABSENT',
                            'severity': 'medium',
                            'personnel_id': p.id,
                            'full_name': p.full_name,
                            'day': d,
                            'message': f"ثبت مساعده ({adv:,.0f} ریال) برای {p.full_name} در روز {d} با وضعیت غایب مغایرت دارد."
                        })
                else:
                    p_days.append({
                        'day': d,
                        'date_shamsi': dm['date_shamsi'],
                        'status': '',
                        'status_display': '—',
                        'effective_hours': 0.0,
                        'overtime_hours': 0.0,
                        'is_friday_work': False,
                        'is_mission': False,
                        'advance_payment': 0.0,
                        'notes': '',
                        'is_existing': False,
                        'attendance_id': None
                    })

            # ۴. شناسایی روزهای خالی و ثبت‌نشده در میان ماه
            if len(recorded_days) >= 2:
                min_d, max_d = min(recorded_days), max(recorded_days)
                for d_i in range(min_d + 1, max_d):
                    if d_i not in recorded_days:
                        dm_meta = next((dm for dm in days_meta if dm['day'] == d_i), None)
                        if dm_meta and not dm_meta['is_friday']:
                            anomalies.append({
                                'type': 'GAP_DAY',
                                'severity': 'medium',
                                'personnel_id': p.id,
                                'full_name': p.full_name,
                                'day': d_i,
                                'message': f"روز کاری {d_i} برای {p.full_name} تعیین وضعیت نشده و خالی مانده است."
                            })

            grid_rows.append({
                'personnel_id': p.id,
                'full_name': p.full_name,
                'national_code': p.national_code,
                'job_title': p_job_title,
                'is_active': p.is_active,
                'total_hours': round(total_hours, 2),
                'total_overtime': round(total_overtime, 2),
                'present_days': present_days_count,
                'days': p_days
            })

        period_info = {
            'id': period_obj.id if period_obj else None,
            'status': period_status,
            'status_display': period_obj.get_status_display() if period_obj else 'باز (امکان ثبت و ویرایش)',
            'is_locked': is_locked,
            'submitted_at': period_obj.submitted_at if period_obj else None,
            'submitted_by_name': f"{period_obj.submitted_by.first_name} {period_obj.submitted_by.last_name}".strip() if period_obj and period_obj.submitted_by else None,
            'submission_notes': period_obj.submission_notes if period_obj else '',
            'rejection_reason': period_obj.rejection_reason if period_obj else '',
            'locked_at': period_obj.locked_at if period_obj else None,
            'locked_by_name': f"{period_obj.locked_by.first_name} {period_obj.locked_by.last_name}".strip() if period_obj and period_obj.locked_by else None,
        }

        return Response({
            'warehouse_id': warehouse_id,
            'year_month': year_month,
            'month_name': month_name,
            'days_in_month': days_in_month,
            'is_locked': is_locked,
            'period_status': period_status,
            'period_info': period_info,
            'settings_window': {
                'past_days': past_limit,
                'future_days': future_limit
            },
            'days_meta': days_meta,
            'rows': grid_rows,
            'anomalies': anomalies
        })

    @action(detail=False, methods=['post'], url_path='bulk-save-monthly-grid')
    def bulk_save_monthly_grid(self, request):
        """
        ذخیره گروهی سلول‌های تغییریافته شیت ماهانه
        (پشتیبانی از مستقل از انبار، با اعتبارسنجی بازه تاریخی و ثبت لاگ ممیزی)
        """
        serializer = BulkMonthlyAttendanceGridSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        raw_wh = serializer.validated_data.get('warehouse_id')
        warehouse_id = int(raw_wh) if (raw_wh and str(raw_wh).upper() not in ['ALL', '0', 'NONE', '']) else None
        raw_ym = serializer.validated_data['year_month']
        ym_cleaned = normalize_digits(str(raw_ym)).strip().replace('-', '/')
        parts = ym_cleaned.split('/')
        if len(parts) >= 2:
            year_month = f"{int(parts[0]):04d}/{int(parts[1]):02d}"
        else:
            year_month = raw_ym

        items = serializer.validated_data['items']
        section_id = serializer.validated_data.get('section_id')
        project_id = serializer.validated_data.get('project_id')

        allow_override = bool(request.data.get('is_override', False) or request.headers.get('X-Admin-Override') == 'true')
        is_admin_override = allow_override and (getattr(request.user, 'is_superuser', False) or request.user.has_perm('personnel.can_override_attendance_lock'))
        period = None
        if warehouse_id:
            period, _ = MonthlyWorkPeriod.objects.get_or_create(
                warehouse_id=warehouse_id,
                year_month=year_month,
                defaults={'status': 'OPEN'}
            )
            if period.status == 'LOCKED' and not is_admin_override:
                return Response({'error': f'دوره کارکرد {year_month} قفل شده است و امکان ویرایش وجود ندارد.'}, status=status.HTTP_400_BAD_REQUEST)

        # واکشی یکجای رکوردهای موجود ماه جاری جهت تشخیص تغییرات (فقط رکوردهای تغییریافته نیاز به ولیدیشن تاریخ دارند)
        existing_qs = DailyAttendance.objects.filter(
            date_shamsi__startswith=year_month,
            is_deleted=False
        )
        if warehouse_id:
            existing_qs = existing_qs.filter(warehouse_id=warehouse_id)
        if section_id:
            existing_qs = existing_qs.filter(section_id=section_id)
        existing_map = {(att.personnel_id, att.date_shamsi): att for att in existing_qs}

        # اعتبارسنجی فقط برای روزهای جدید یا تغییریافته
        for item in items:
            if not item.get('status') and float(item.get('effective_hours', 0)) == 0:
                continue
            day_str = f"{item['day']:02d}"
            date_shamsi = f"{year_month}/{day_str}"
            personnel_id = item['personnel_id']

            existing_att = existing_map.get((personnel_id, date_shamsi))
            is_changed = True
            if existing_att:
                status_val = item.get('status') or ('PRESENT_10H' if float(item.get('effective_hours', 0)) >= 10 else ('HALF_5H' if float(item.get('effective_hours', 0)) >= 5 else 'CUSTOM'))
                if (
                    str(existing_att.status) == str(status_val) and
                    float(existing_att.effective_hours) == float(item.get('effective_hours', 0)) and
                    float(existing_att.overtime_hours) == float(item.get('overtime_hours', 0)) and
                    bool(existing_att.is_friday_work) == bool(item.get('is_friday_work', False)) and
                    bool(existing_att.is_mission) == bool(item.get('is_mission', False)) and
                    float(existing_att.advance_payment) == float(item.get('advance_payment', 0)) and
                    (existing_att.notes or '') == (item.get('notes', '') or '')
                ):
                    is_changed = False

            if is_changed and not is_admin_override:
                try:
                    validate_attendance_date_window(date_shamsi, user=request.user, allow_override=is_admin_override, warehouse_id=warehouse_id, project_id=project_id)
                except Exception as e:
                    err_msg = getattr(e, 'detail', str(e))
                    if isinstance(err_msg, list):
                        err_msg = err_msg[0]
                    return Response({'error': f"خطا در روز {item['day']}: {err_msg}"}, status=status.HTTP_400_BAD_REQUEST)

        saved_count = 0
        updated_count = 0

        with transaction.atomic():
            for item in items:
                status_val = item.get('status') or ''
                eff_h = float(item.get('effective_hours', 0))
                day_str = f"{item['day']:02d}"
                date_shamsi = f"{year_month}/{day_str}"
                personnel_id = item['personnel_id']

                p_obj = PersonnelProfile.objects.filter(id=personnel_id).first()
                if not p_obj:
                    continue

                if p_obj.approval_status != 'approved':
                    return Response({
                        'error': f'امکان ثبت کارکرد برای پرسنل «{p_obj.full_name}» وجود ندارد زیرا پرونده او در وضعیت «{p_obj.get_approval_status_display()}» بوده و هنوز به تایید نهایی مدیر و حسابدار نرسیده است.'
                    }, status=status.HTTP_400_BAD_REQUEST)

                from ..lifecycle_services import validate_personnel_validity
                is_valid_date, val_err = validate_personnel_validity(p_obj, date_shamsi)
                if not is_valid_date:
                    return Response({'error': val_err}, status=status.HTTP_400_BAD_REQUEST)

                check_wh = warehouse_id if warehouse_id else p_obj.assigned_warehouse_id
                target_period = period
                if not target_period and check_wh:
                    target_period = MonthlyWorkPeriod.objects.filter(
                        warehouse_id=check_wh,
                        year_month=year_month
                    ).first()
                if target_period and target_period.status == 'LOCKED' and not is_admin_override:
                    return Response({'error': f'دوره کارکرد {year_month} برای انبار پرسنل ({p_obj.full_name}) قفل شده است.'}, status=status.HTTP_400_BAD_REQUEST)

                target_wh = warehouse_id if warehouse_id else p_obj.assigned_warehouse_id

                # پیدا کردن رکورد فعال پرسنل در این تاریخ و این بخش
                att_filter = {
                    'personnel_id': personnel_id,
                    'date_shamsi': date_shamsi,
                    'is_deleted': False
                }
                if section_id:
                    att_filter['section_id'] = section_id
                att_obj = DailyAttendance.objects.select_for_update().filter(**att_filter).first()

                if not att_obj and not status_val and eff_h == 0:
                    continue

                if not status_val:
                    status_val = 'PRESENT_10H' if eff_h >= 10 else ('HALF_5H' if eff_h >= 5 else 'CUSTOM')

                ot_h = float(item.get('overtime_hours', 0))
                is_fri = bool(item.get('is_friday_work', False))
                is_mis = bool(item.get('is_mission', False))
                adv_pay = float(item.get('advance_payment', 0))
                notes_val = item.get('notes', '') or ''

                # اعتبارسنجی و ریست منطقی ساعات در صورت غیبت یا مرخصی
                if status_val in ['ABSENT', 'LEAVE']:
                    eff_h = 0.0
                    ot_h = 0.0
                    is_fri = False
                    is_mis = False

                if att_obj:
                    changes = []
                    item_sanitized = {
                        'status': status_val,
                        'effective_hours': eff_h,
                        'overtime_hours': ot_h,
                        'is_friday_work': is_fri,
                        'is_mission': is_mis,
                        'advance_payment': adv_pay,
                        'notes': notes_val
                    }
                    fields_to_check = ['status', 'effective_hours', 'overtime_hours', 'is_friday_work', 'is_mission', 'advance_payment', 'notes']
                    for f in fields_to_check:
                        new_val = item_sanitized.get(f)
                        old_val = getattr(att_obj, f)
                        is_diff = False
                        if f in ['effective_hours', 'overtime_hours', 'advance_payment']:
                            if float(new_val or 0) != float(old_val or 0):
                                is_diff = True
                        elif f in ['is_friday_work', 'is_mission']:
                            if bool(new_val) != bool(old_val):
                                is_diff = True
                        else:
                            if str(new_val or '') != str(old_val or ''):
                                is_diff = True
                        if is_diff:
                            changes.append((f, str(old_val), str(new_val)))

                    # اگر تغییری نکرده بود از ذخیره و لاگ تکراری صرف‌نظر می‌کنیم
                    if not changes:
                        continue

                    att_obj.status = status_val
                    att_obj.effective_hours = eff_h
                    att_obj.overtime_hours = ot_h
                    att_obj.is_friday_work = is_fri
                    att_obj.is_mission = is_mis
                    att_obj.advance_payment = adv_pay
                    att_obj.notes = notes_val
                    if target_wh:
                        att_obj.warehouse_id = target_wh
                    if section_id:
                        att_obj.section_id = section_id
                    att_obj.modified_by = request.user
                    if target_period:
                        att_obj.period = target_period
                    att_obj.save()

                    # پاکسازی رکوردهای تکراری قدیمی احتمالی برای این روز در همین بخش
                    dup_qs = DailyAttendance.objects.filter(
                        personnel_id=personnel_id,
                        date_shamsi=date_shamsi,
                        is_deleted=False
                    ).exclude(id=att_obj.id)
                    if section_id:
                        dup_qs = dup_qs.filter(section_id=section_id)
                    dup_qs.delete()

                    for f_name, o_val, n_val in changes:
                        AttendanceAuditLog.objects.create(
                            attendance=att_obj,
                            personnel_name=p_obj.full_name,
                            date_shamsi=date_shamsi,
                            changed_by=request.user,
                            field_name=f_name,
                            old_value=o_val,
                            new_value=n_val,
                            reason='ویرایش شیت ماهانه کارکرد'
                        )
                    updated_count += 1
                else:
                    att_obj = DailyAttendance.objects.create(
                        personnel_id=personnel_id,
                        warehouse_id=target_wh,
                        section_id=section_id or p_obj.section_id,
                        project_id=project_id or p_obj.project_id,
                        date_shamsi=date_shamsi,
                        status=status_val,
                        effective_hours=eff_h,
                        overtime_hours=ot_h,
                        is_friday_work=is_fri,
                        is_mission=is_mis,
                        advance_payment=adv_pay,
                        notes=notes_val,
                        period=target_period or period,
                        created_by=request.user,
                        modified_by=request.user
                    )
                    saved_count += 1

        client_tab_id = request.data.get('client_tab_id') or request.headers.get('X-Client-Tab-ID')
        extra_data = {}
        if section_id:
            extra_data['section_id'] = section_id
        if project_id:
            extra_data['project_id'] = project_id

        broadcast_attendance_updated(
            warehouse_id=warehouse_id,
            date_shamsi=f"{year_month}/01",
            year_month=year_month,
            sender_id=request.user.id if request.user and request.user.is_authenticated else None,
            client_tab_id=client_tab_id,
            message=f'شیت کارکرد ماهانه {year_month} به‌روزرسانی شد.',
            extra_data=extra_data
        )

        return Response({
            'message': f'اطلاعات شیت ماهانه با موفقیت ذخیره شد ({saved_count} جدید، {updated_count} بروزرسانی).',
            'saved_count': saved_count,
            'updated_count': updated_count
        })

    @action(detail=False, methods=['get'], url_path='export-monthly-excel')
    def export_monthly_excel(self, request):
        """
        خروجی استاندارد دو سطری اکسل از شیت ماهانه کارکرد پرسنل
        (شامل فرمول‌های جمع، استایل زیبا و فریز ستون‌ها طبق استاندارد)
        """
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter

        raw_wh = request.query_params.get('warehouse_id')
        warehouse_id = int(raw_wh) if (raw_wh and str(raw_wh).upper() not in ['ALL', '0', 'NONE', '']) else None
        raw_sec = request.query_params.get('section_id')
        section_id = int(raw_sec) if (raw_sec and str(raw_sec).upper() not in ['ALL', '0', 'NONE', '']) else None
        raw_proj = request.query_params.get('project_id')
        project_id = int(raw_proj) if (raw_proj and str(raw_proj).upper() not in ['ALL', '0', 'NONE', '']) else None
        raw_ym = request.query_params.get('year_month')
        if not raw_ym:
            return Response({'error': 'پارامتر year_month الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)

        ym_cleaned = normalize_digits(str(raw_ym)).strip().replace('-', '/')
        parts = ym_cleaned.split('/')
        if len(parts) >= 2:
            y, m = int(parts[0]), int(parts[1])
            year_month = f"{y:04d}/{m:02d}"
        else:
            return Response({'error': 'فرمت year_month نامعتبر است.'}, status=status.HTTP_400_BAD_REQUEST)

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

        fridays = set()
        weekday_names = ["ش", "ی", "د", "س", "چ", "پ", "ج"]
        day_headers = []
        for d in range(1, days_in_month + 1):
            t_date = jdatetime.date(y, m, d)
            w = t_date.weekday()
            if w == 6:
                fridays.add(d)
            day_headers.append(f"{d} ({weekday_names[w]})")

        personnel_list = PersonnelProfile.objects.filter(is_active=True)
        attendances = DailyAttendance.objects.filter(
            date_shamsi__startswith=year_month,
            is_deleted=False
        )

        if section_id:
            personnel_list = personnel_list.filter(
                Q(section_id=section_id) |
                Q(section_assignments__section_id=section_id, section_assignments__is_active=True)
            ).distinct()
            attendances = attendances.filter(section_id=section_id)
        elif warehouse_id:
            personnel_list = personnel_list.filter(
                Q(assigned_warehouse_id=warehouse_id) | Q(assigned_warehouse_id__isnull=True)
            )
            attendances = attendances.filter(warehouse_id=warehouse_id)

        personnel_list = personnel_list.order_by('last_name', 'first_name')

        att_map = {(a.personnel_id, int(a.date_shamsi.split('/')[2])): a for a in attendances}

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = f"کارکرد {month_name} {y}"
        ws.sheet_view.rightToLeft = True

        font_header1 = Font(name='B Nazanin', size=11, bold=True, color='FFFFFF')
        font_header2 = Font(name='Calibri', size=9, bold=False, color='94A3B8')
        font_body = Font(name='B Nazanin', size=10, bold=False, color='0F172A')
        font_bold = Font(name='B Nazanin', size=10, bold=True, color='0F172A')
        font_mono = Font(name='Consolas', size=10, bold=True, color='0F172A')

        fill_header1 = PatternFill(start_color='1E293B', end_color='1E293B', fill_type='solid')
        fill_header2 = PatternFill(start_color='F1F5F9', end_color='F1F5F9', fill_type='solid')
        fill_friday = PatternFill(start_color='F3E8FF', end_color='F3E8FF', fill_type='solid')
        fill_total = PatternFill(start_color='EEF2FF', end_color='EEF2FF', fill_type='solid')
        fill_stripe = PatternFill(start_color='F8FAFC', end_color='F8FAFC', fill_type='solid')

        thin_border = Border(
            left=Side(style='thin', color='CBD5E1'),
            right=Side(style='thin', color='CBD5E1'),
            top=Side(style='thin', color='CBD5E1'),
            bottom=Side(style='thin', color='CBD5E1')
        )
        align_center = Alignment(horizontal='center', vertical='center', wrap_text=True)
        align_right = Alignment(horizontal='right', vertical='center')

        row1_titles = ['ردیف', 'کد ملی', 'نام و نام خانوادگی', 'عنوان شغلی', 'انبار اختصاصی'] + day_headers + ['جمع ساعت کارکرد', 'جمع اضافه کار', 'مجموع کل ساعات (کارکرد + اضافه‌کار)', 'تعداد روز حضور']
        row2_keys = ['row_num', 'national_code', 'full_name', 'job_title', 'warehouse_name'] + [f'day_{d:02d}' for d in range(1, days_in_month + 1)] + ['total_hours', 'total_overtime', 'total_hours_sum', 'present_days']

        for col_idx, (t1, t2) in enumerate(zip(row1_titles, row2_keys), start=1):
            c1 = ws.cell(row=1, column=col_idx, value=t1)
            c1.font = font_header1
            c1.fill = fill_header1
            c1.alignment = align_center
            c1.border = thin_border

            c2 = ws.cell(row=2, column=col_idx, value=t2)
            c2.font = font_header2
            c2.fill = fill_header2
            c2.alignment = align_center
            c2.border = thin_border

        for p_idx, p in enumerate(personnel_list, start=1):
            row_num = p_idx + 2
            is_even = (p_idx % 2 == 0)

            ws.cell(row=row_num, column=1, value=p_idx).alignment = align_center
            ws.cell(row=row_num, column=2, value=p.national_code or '').alignment = align_center
            ws.cell(row=row_num, column=3, value=p.full_name).alignment = align_right
            ws.cell(row=row_num, column=4, value=p.job_title or '').alignment = align_right
            ws.cell(row=row_num, column=5, value=p.assigned_warehouse.name if p.assigned_warehouse else 'تمام انبارها').alignment = align_center

            tot_hours = 0.0
            tot_ot = 0.0
            p_days = 0

            for d in range(1, days_in_month + 1):
                col_idx = 5 + d
                att = att_map.get((p.id, d))
                cell = ws.cell(row=row_num, column=col_idx)
                cell.alignment = align_center

                if att:
                    h = float(att.effective_hours)
                    ot = float(att.overtime_hours)
                    tot_hours += h
                    tot_ot += ot
                    if att.status and att.status != 'ABSENT' and h > 0:
                        p_days += 1

                    if att.status == 'LEAVE':
                        cell.value = 'مرخصی'
                    elif att.status == 'ABSENT':
                        cell.value = 'غایب'
                    elif att.status == 'MISSION':
                        cell.value = f"مامور ({h:g})"
                    elif att.status == 'FRIDAY_WORK':
                        cell.value = f"جمعه ({h:g})"
                    elif h > 0:
                        cell.value = h
                    else:
                        cell.value = ''
                else:
                    cell.value = ''

                if d in fridays:
                    cell.fill = fill_friday
                elif is_even:
                    cell.fill = fill_stripe

                cell.border = thin_border
                cell.font = font_body

            first_col_letter = get_column_letter(6)
            last_col_letter = get_column_letter(5 + days_in_month)
            col_tot_letter = get_column_letter(6 + days_in_month)
            col_ot_letter = get_column_letter(7 + days_in_month)

            c_tot = ws.cell(row=row_num, column=6 + days_in_month, value=f"=SUM({first_col_letter}{row_num}:{last_col_letter}{row_num})")
            c_tot.font = font_bold
            c_tot.fill = fill_total
            c_tot.alignment = align_center
            c_tot.border = thin_border

            c_ot = ws.cell(row=row_num, column=7 + days_in_month, value=tot_ot)
            c_ot.font = font_mono
            c_ot.alignment = align_center
            c_ot.border = thin_border

            c_tot_all = ws.cell(row=row_num, column=8 + days_in_month, value=f"={col_tot_letter}{row_num}+{col_ot_letter}{row_num}")
            c_tot_all.font = font_bold
            c_tot_all.fill = fill_total
            c_tot_all.alignment = align_center
            c_tot_all.border = thin_border

            c_pdays = ws.cell(row=row_num, column=9 + days_in_month, value=f'=COUNTIF({first_col_letter}{row_num}:{last_col_letter}{row_num}, ">0")')
            c_pdays.font = font_bold
            c_pdays.alignment = align_center
            c_pdays.border = thin_border

            for c_i in range(1, 6):
                cell_i = ws.cell(row=row_num, column=c_i)
                cell_i.font = font_bold if c_i == 3 else font_body
                cell_i.border = thin_border
                if is_even and cell_i.fill.fill_type is None:
                    cell_i.fill = fill_stripe

        ws.freeze_panes = 'F3'
        ws.row_dimensions[1].height = 28
        ws.row_dimensions[2].height = 18

        ws.column_dimensions['A'].width = 6
        ws.column_dimensions['B'].width = 14
        ws.column_dimensions['C'].width = 22
        ws.column_dimensions['D'].width = 18
        ws.column_dimensions['E'].width = 16
        for d in range(1, days_in_month + 1):
            col_letter = get_column_letter(5 + d)
            ws.column_dimensions[col_letter].width = 8
        ws.column_dimensions[get_column_letter(6 + days_in_month)].width = 14
        ws.column_dimensions[get_column_letter(7 + days_in_month)].width = 13
        ws.column_dimensions[get_column_letter(8 + days_in_month)].width = 20
        ws.column_dimensions[get_column_letter(9 + days_in_month)].width = 13

        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)

        filename = f"Timesheet_{year_month.replace('/', '_')}.xlsx"
        response = HttpResponse(
            buffer.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    @action(detail=False, methods=['post'], url_path='import-monthly-excel')
    def import_monthly_excel(self, request):
        """
        بارگذاری مستقیم و هوشمند شیت ماهانه از فایل اکسل
        (تطبیق بر اساس ردیف کلیدها و کد ملی پرسنل همراه با ذخیره اتمیک)
        """
        import openpyxl
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'فایل اکسل الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)

        raw_wh = request.data.get('warehouse_id')
        warehouse_id = int(raw_wh) if (raw_wh and str(raw_wh).upper() not in ['ALL', '0', 'NONE', '']) else None
        raw_sec = request.data.get('section_id')
        section_id = int(raw_sec) if (raw_sec and str(raw_sec).upper() not in ['ALL', '0', 'NONE', '']) else None
        raw_proj = request.data.get('project_id')
        project_id = int(raw_proj) if (raw_proj and str(raw_proj).upper() not in ['ALL', '0', 'NONE', '']) else None
        raw_ym = request.data.get('year_month')
        if not raw_ym:
            return Response({'error': 'پارامتر year_month الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)

        ym_cleaned = normalize_digits(str(raw_ym)).strip().replace('-', '/')
        parts = ym_cleaned.split('/')
        if len(parts) >= 2:
            year_month = f"{int(parts[0]):04d}/{int(parts[1]):02d}"
        else:
            return Response({'error': 'فرمت year_month نامعتبر است.'}, status=status.HTTP_400_BAD_REQUEST)

        allow_override = bool(request.data.get('is_override', False) or request.headers.get('X-Admin-Override') == 'true')
        is_admin_override = allow_override and (getattr(request.user, 'is_superuser', False) or request.user.has_perm('personnel.can_override_attendance_lock'))

        if warehouse_id:
            period = MonthlyWorkPeriod.objects.filter(warehouse_id=warehouse_id, year_month=year_month).first()
            if period and period.status in ['LOCKED', 'SUBMITTED', 'FINALIZED'] and not is_admin_override:
                return Response({'error': f'دوره کارکرد {year_month} در وضعیت «{period.get_status_display()}» است و امکان بارگذاری وجود ندارد.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            wb = openpyxl.load_workbook(file_obj, data_only=True)
            ws = wb.active
        except Exception as e:
            return Response({'error': f'خطا در باز کردن فایل اکسل: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

        nat_col_idx = None
        day_cols = {}

        for col_idx in range(1, ws.max_column + 1):
            k2 = str(ws.cell(row=2, column=col_idx).value or '').strip()
            k1 = str(ws.cell(row=1, column=col_idx).value or '').strip()

            if k2 == 'national_code' or 'کد ملی' in k1:
                nat_col_idx = col_idx
            elif k2.startswith('day_'):
                try:
                    d_num = int(k2.replace('day_', ''))
                    day_cols[d_num] = col_idx
                except ValueError:
                    pass
            elif k1.startswith('روز '):
                try:
                    d_num = int(k1.replace('روز ', '').split()[0].split('(')[0])
                    day_cols[d_num] = col_idx
                except ValueError:
                    pass

        if not nat_col_idx:
            return Response({'error': 'ستون کد ملی پرسنل در فایل اکسل یافت نشد.'}, status=status.HTTP_400_BAD_REQUEST)
        if not day_cols:
            return Response({'error': 'هیچ ستونی برای روزهای ماه در فایل اکسل شناسایی نشد.'}, status=status.HTTP_400_BAD_REQUEST)

        personnel_qs = PersonnelProfile.objects.filter(is_active=True)
        if section_id:
            personnel_qs = personnel_qs.filter(
                Q(section_id=section_id) |
                Q(section_assignments__section_id=section_id, section_assignments__is_active=True)
            ).distinct()
        elif warehouse_id:
            personnel_qs = personnel_qs.filter(
                Q(assigned_warehouse_id=warehouse_id) | Q(assigned_warehouse_id__isnull=True)
            )

        personnel_map = {
            normalize_digits(str(p.national_code)).split('.')[0].strip().zfill(10): p
            for p in personnel_qs
            if p.national_code
        }

        updated_cells = 0
        matched_personnel_count = 0

        with transaction.atomic():
            for row_idx in range(3, ws.max_row + 1):
                raw_nat = ws.cell(row=row_idx, column=nat_col_idx).value
                if raw_nat is None or str(raw_nat).strip() == '':
                    continue
                raw_nat_str = str(raw_nat).split('.')[0].strip()
                nat_code = normalize_digits(raw_nat_str).strip().zfill(10)
                p_obj = personnel_map.get(nat_code)
                if not p_obj:
                    continue

                matched_personnel_count += 1
                target_wh = warehouse_id if warehouse_id else p_obj.assigned_warehouse_id

                target_period = None
                if target_wh:
                    target_period, _ = MonthlyWorkPeriod.objects.get_or_create(
                        warehouse_id=target_wh,
                        year_month=year_month,
                        defaults={'status': 'OPEN'}
                    )
                    locked_period_statuses = [
                        'LOCKED', 'SUBMITTED', 'FINALIZED', 'SUBMITTED_SUPERVISOR',
                        'PENDING_ACCOUNTANT', 'SUBMITTED_ACCOUNTANT', 'PENDING_MANAGER',
                        'READY_TO_PAY', 'PAID'
                    ]
                    if target_period and target_period.status in locked_period_statuses and not is_admin_override:
                        return Response({
                            'error': f'امکان بارگذاری اکسل وجود ندارد؛ دوره کارکرد {year_month} برای انبار پرسنل ({p_obj.full_name}) در وضعیت «{target_period.get_status_display()}» است.'
                        }, status=status.HTTP_400_BAD_REQUEST)

                for d_num, col_i in day_cols.items():
                    val = ws.cell(row=row_idx, column=col_i).value
                    if val is None or str(val).strip() == '' or str(val).strip() == '—':
                        continue

                    val_str = str(val).strip()
                    val_str_clean = normalize_digits(val_str)
                    date_shamsi = f"{year_month}/{d_num:02d}"

                    status_val = 'PRESENT_10H'
                    eff_hours = 10.0
                    ot_hours = 0.0
                    is_friday = False
                    is_mission = False

                    try:
                        num = float(val_str_clean)
                        if num == 10:
                            status_val = 'PRESENT_10H'
                            eff_hours = 10.0
                        elif num == 5:
                            status_val = 'HALF_5H'
                            eff_hours = 5.0
                        elif num == 0:
                            status_val = 'ABSENT'
                            eff_hours = 0.0
                        else:
                            status_val = 'CUSTOM'
                            eff_hours = num
                    except ValueError:
                        if 'مرخصی' in val_str:
                            status_val = 'LEAVE'
                            eff_hours = 0.0
                        elif 'غایب' in val_str:
                            status_val = 'ABSENT'
                            eff_hours = 0.0
                        elif 'مامور' in val_str:
                            status_val = 'MISSION'
                            is_mission = True
                            eff_hours = 10.0
                        elif 'جمعه' in val_str:
                            status_val = 'FRIDAY_WORK'
                            is_friday = True
                            eff_hours = 10.0
                        elif 'نیمه' in val_str:
                            status_val = 'HALF_5H'
                            eff_hours = 5.0
                        elif 'حاضر' in val_str:
                            status_val = 'PRESENT_10H'
                            eff_hours = 10.0

                    att_filter = {'personnel_id': p_obj.id, 'date_shamsi': date_shamsi, 'is_deleted': False}
                    if target_wh:
                        att_filter['warehouse_id'] = target_wh

                    att_obj = DailyAttendance.objects.select_for_update().filter(**att_filter).first()
                    if not att_obj and not target_wh:
                        att_obj = DailyAttendance.objects.select_for_update().filter(personnel_id=p_obj.id, date_shamsi=date_shamsi, is_deleted=False).first()

                    # اعتبارسنجی بازه تاریخی در صورت تغییر یا ایجاد
                    is_changed = False
                    if not att_obj:
                        is_changed = True
                    else:
                        if (att_obj.status != status_val or float(att_obj.effective_hours) != eff_hours or
                            att_obj.is_friday_work != is_friday or att_obj.is_mission != is_mission):
                            is_changed = True

                    if is_changed and not is_admin_override:
                        try:
                            target_pid = getattr(p_obj, 'project_id', None)
                            validate_attendance_date_window(
                                date_shamsi=date_shamsi,
                                user=request.user,
                                allow_override=is_admin_override,
                                warehouse_id=target_wh,
                                project_id=target_pid
                            )
                        except Exception as e:
                            err_msg = getattr(e, 'detail', str(e))
                            if isinstance(err_msg, list):
                                err_msg = err_msg[0]
                            return Response({
                                'error': f"خطا در ردیف پرسنل {p_obj.full_name} ({date_shamsi}): {err_msg}"
                            }, status=status.HTTP_400_BAD_REQUEST)

                    if att_obj:
                        changes = []
                        if att_obj.status != status_val:
                            changes.append(('status', str(att_obj.status), str(status_val)))
                        if float(att_obj.effective_hours) != eff_hours:
                            changes.append(('effective_hours', str(att_obj.effective_hours), str(eff_hours)))
                        if att_obj.is_friday_work != is_friday:
                            changes.append(('is_friday_work', str(att_obj.is_friday_work), str(is_friday)))
                        if att_obj.is_mission != is_mission:
                            changes.append(('is_mission', str(att_obj.is_mission), str(is_mission)))

                        if changes:
                            att_obj.status = status_val
                            att_obj.effective_hours = eff_hours
                            att_obj.is_friday_work = is_friday
                            att_obj.is_mission = is_mission
                            if target_wh:
                                att_obj.warehouse_id = target_wh
                            if section_id:
                                att_obj.section_id = section_id
                            if project_id:
                                att_obj.project_id = project_id
                            if target_period:
                                att_obj.period = target_period
                            # در صورت ویرایش رکوردی که قبلا تایید شده بود، تاییدیه باطل شده و به وضعیت در انتظار بازمی‌گردد
                            if changes and att_obj.approval_status == 'APPROVED':
                                att_obj.approval_status = 'PENDING_SUPERVISOR'
                                att_obj.supervisor_approved_by = None
                                att_obj.supervisor_approved_at = None
                                changes.append(('approval_status', 'APPROVED', 'PENDING_SUPERVISOR'))

                            att_obj.modified_by = request.user
                            att_obj.save()

                            for f_name, o_val, n_val in changes:
                                AttendanceAuditLog.objects.create(
                                    attendance=att_obj,
                                    personnel_name=p_obj.full_name,
                                    date_shamsi=date_shamsi,
                                    changed_by=request.user,
                                    field_name=f_name,
                                    old_value=o_val,
                                    new_value=n_val,
                                    reason='ویرایش از طریق بارگذاری اکسل شیت ماهانه'
                                )
                            updated_cells += 1
                    else:
                        att_obj = DailyAttendance.objects.create(
                            personnel=p_obj,
                            warehouse_id=target_wh,
                            section_id=section_id or p_obj.section_id,
                            project_id=project_id or p_obj.project_id,
                            period=target_period,
                            date_shamsi=date_shamsi,
                            status=status_val,
                            effective_hours=eff_hours,
                            overtime_hours=ot_hours,
                            is_friday_work=is_friday,
                            is_mission=is_mission,
                            advance_payment=0,
                            created_by=request.user,
                            modified_by=request.user
                        )
                        AttendanceAuditLog.objects.create(
                            attendance=att_obj,
                            personnel_name=p_obj.full_name,
                            date_shamsi=date_shamsi,
                            changed_by=request.user,
                            field_name='all',
                            old_value=None,
                            new_value=f"{status_val} ({eff_hours}h)",
                            reason='ایجاد از طریق بارگذاری اکسل شیت ماهانه'
                        )
                        updated_cells += 1

        extra_data = {}
        if section_id:
            extra_data['section_id'] = section_id
        if project_id:
            extra_data['project_id'] = project_id

        broadcast_attendance_updated(
            warehouse_id=warehouse_id,
            date_shamsi=f"{year_month}/01",
            year_month=year_month,
            sender_id=request.user.id if request.user and request.user.is_authenticated else None,
            message=f'اطلاعات شیت کارکرد ماهانه {year_month} از فایل اکسل بارگذاری و به‌روزرسانی شد.',
            extra_data=extra_data
        )

        return Response({
            'message': f'اطلاعات شیت کارکرد با موفقیت از اکسل بارگذاری شد ({matched_personnel_count} پرسنل، {updated_cells} سلول کارکرد ثبت گردید).',
            'matched_personnel_count': matched_personnel_count,
            'updated_cells': updated_cells
        })

    @action(detail=False, methods=['get'], url_path='monthly-summary')
    def get_monthly_summary(self, request):
        """
        گزارش تجمیعی ماهانه کارکرد پرسنل با پشتیبانی از فیلتر بخش/پروژه و تفکیک وضعیت‌های تایید
        """
        raw_wh = request.query_params.get('warehouse_id')
        warehouse_id = int(raw_wh) if (raw_wh and str(raw_wh).upper() not in ['ALL', '0', 'NONE', '', 'UNDEFINED', 'NULL']) else None
        raw_sec = request.query_params.get('section_id')
        section_id = int(raw_sec) if (raw_sec and str(raw_sec).upper() not in ['ALL', '0', 'NONE', '', 'UNDEFINED', 'NULL']) else None
        raw_proj = request.query_params.get('project_id')
        project_id = int(raw_proj) if (raw_proj and str(raw_proj).upper() not in ['ALL', '0', 'NONE', '', 'UNDEFINED', 'NULL']) else None

        year_month = request.query_params.get('year_month')
        if not year_month:
            latest_period = MonthlyWorkPeriod.objects.order_by('-year_month').first()
            year_month = latest_period.year_month if latest_period else '1405/06'

        norm_ym = year_month.replace('-', '/')

        # فیلتر پرسنل
        personnel_list = PersonnelProfile.objects.filter(is_active=True)
        if section_id:
            personnel_list = personnel_list.filter(
                Q(section_id=section_id) |
                Q(section_assignments__section_id=section_id, section_assignments__is_active=True)
            ).distinct()
        elif project_id:
            personnel_list = personnel_list.filter(
                Q(section__project_id=project_id) |
                Q(section_assignments__section__project_id=project_id, section_assignments__is_active=True)
            ).distinct()
        elif warehouse_id:
            personnel_list = personnel_list.filter(
                Q(assigned_warehouse_id=warehouse_id) | Q(assigned_warehouse_id__isnull=True)
            )

        cid = validate_user_company_access(request.user, get_request_company_id(request))
        if cid:
            personnel_list = personnel_list.filter(
                Q(company_id=cid) | Q(section__project__company_id=cid)
            )

        personnel_list = personnel_list.order_by('last_name', 'first_name')

        # فیلتر کارکردها
        att_filter = Q(date_shamsi__startswith=norm_ym, is_deleted=False)
        if section_id:
            att_filter &= (Q(section_id=section_id) | (Q(section_id__isnull=True) & Q(personnel__section_id=section_id)))
        elif project_id:
            att_filter &= (Q(project_id=project_id) | (Q(project_id__isnull=True) & Q(personnel__project_id=project_id)))
        elif warehouse_id:
            att_filter &= Q(warehouse_id=warehouse_id)

        attendances = DailyAttendance.objects.filter(att_filter)

        # جستجوی دوره متناظر
        period = None
        if section_id:
            period = MonthlyWorkPeriod.objects.filter(section_id=section_id, year_month=year_month).first()
        elif project_id:
            period = MonthlyWorkPeriod.objects.filter(project_id=project_id, year_month=year_month).first()
        elif warehouse_id:
            period = MonthlyWorkPeriod.objects.filter(warehouse_id=warehouse_id, year_month=year_month).first()
        if not period:
            period = MonthlyWorkPeriod.objects.filter(year_month=year_month).first()

        # محاسبه کارکردهای تاییدنشده
        pending_approvals_count = attendances.exclude(approval_status='APPROVED').count()

        summary_rows = []
        for p in personnel_list:
            p_atts = [a for a in attendances if a.personnel_id == p.id]
            
            total_hours = sum(float(a.effective_hours) for a in p_atts)
            total_overtime = sum(float(a.overtime_hours) for a in p_atts)
            friday_days = sum(1 for a in p_atts if a.is_friday_work)
            mission_days = sum(1 for a in p_atts if a.is_mission)
            absent_days = sum(1 for a in p_atts if a.status == 'ABSENT')
            leave_days = sum(1 for a in p_atts if a.status == 'LEAVE')
            present_days = sum(1 for a in p_atts if a.status in ['PRESENT_10H', 'HALF_5H', 'FRIDAY_WORK', 'MISSION', 'CUSTOM'] and a.effective_hours > 0)
            total_advances = sum(float(a.advance_payment) for a in p_atts)
            
            # تبدیل به معادل روز (تقسیم بر ۱۰)
            equivalent_days = round(total_hours / 10.0, 2)
            
            # برآورد دستمزد ناخالص کارکرد
            daily_wage = float(p.daily_base_wage)
            hourly_wage = float(p.hourly_rate)
            gross_base_pay = round(equivalent_days * daily_wage, 0)
            overtime_pay = round(total_overtime * (hourly_wage * 1.4), 0)

            summary_rows.append({
                'personnel_id': p.id,
                'full_name': p.full_name,
                'national_code': p.national_code,
                'job_title': p.job_title,
                'contract_type': p.get_contract_type_display(),
                'daily_base_wage': daily_wage,
                'total_hours': round(total_hours, 1),
                'equivalent_days': equivalent_days,
                'present_days': present_days,
                'total_overtime_hours': round(total_overtime, 1),
                'friday_days': friday_days,
                'mission_days': mission_days,
                'absent_days': absent_days,
                'leave_days': leave_days,
                'total_advances': total_advances,
                'gross_base_pay': gross_base_pay,
                'overtime_pay': overtime_pay,
                'estimated_total_pay': gross_base_pay + overtime_pay - total_advances
            })

        locked_statuses = [
            'LOCKED', 'SUBMITTED', 'FINALIZED', 'SUBMITTED_SUPERVISOR',
            'PENDING_ACCOUNTANT', 'SUBMITTED_ACCOUNTANT', 'PENDING_MANAGER',
            'READY_TO_PAY', 'PAID'
        ]
        is_locked = period.status in locked_statuses if period else False

        return Response({
            'warehouse_id': warehouse_id,
            'section_id': section_id,
            'project_id': project_id,
            'year_month': year_month,
            'period_id': period.id if period else None,
            'period_status': period.status if period else 'OPEN',
            'is_locked': is_locked,
            'pending_approvals_count': pending_approvals_count,
            'summary': summary_rows
        })

class MonthlyWorkPeriodViewSet(viewsets.ModelViewSet):
    queryset = MonthlyWorkPeriod.objects.all().select_related('locked_by')
    serializer_class = MonthlyWorkPeriodSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        from common.tenant_scope import scope_tenant_queryset
        qs = scope_tenant_queryset(qs, self.request.user, company_field='company_id', request=self.request)
        warehouse_id = self.request.query_params.get('warehouse_id')
        if warehouse_id:
            qs = qs.filter(warehouse_id=warehouse_id)
        year_month = self.request.query_params.get('year_month')
        if year_month:
            qs = qs.filter(year_month=year_month)
        return qs

    @action(detail=True, methods=['post'], url_path='lock')
    def lock_period(self, request, pk=None):
        period = self.get_object()
        period.status = 'LOCKED'
        period.locked_at = timezone.now()
        period.locked_by = request.user
        period.save()
        return Response({'message': f'دوره {period.year_month} با موفقیت قفل شد.'})

    @action(detail=True, methods=['post'], url_path='unlock')
    def unlock_period(self, request, pk=None):
        if not request.user.is_superuser:
            return Response({'error': 'فقط مدیر ارشد سیستم اجازه بازگشایی دوره را دارد.'}, status=status.HTTP_403_FORBIDDEN)
        period = self.get_object()
        period.status = 'OPEN'
        period.locked_at = None
        period.locked_by = None
        period.save()
        return Response({'message': f'دوره {period.year_month} با موفقیت بازگشایی شد.'})

    @action(detail=True, methods=['post'], url_path='submit')
    def submit_period(self, request, pk=None):
        period = self.get_object()
        if period.status == 'LOCKED':
            return Response({'error': 'دوره از قبل قفل شده است.'}, status=status.HTTP_400_BAD_REQUEST)
        period.status = 'SUBMITTED'
        period.submitted_at = timezone.now()
        period.submitted_by = request.user
        period.submission_notes = request.data.get('notes', '')
        period.rejection_reason = None
        period.save()
        return Response({
            'message': f'دوره {period.year_month} جهت بررسی مالی ارسال گردید.',
            'status': period.status,
            'status_display': period.get_status_display()
        })

    @action(detail=True, methods=['post'], url_path='approve')
    def approve_period(self, request, pk=None):
        is_financial = request.user.is_superuser or request.user.groups.filter(name__in=['Accountant', 'Finance', 'مدیر مالی']).exists() or request.user.has_perm('personnel.can_override_attendance_lock')
        if not is_financial:
            return Response({'error': 'فقط حسابدار یا مدیر مالی مجاز به تایید نهایی دوره است.'}, status=status.HTTP_403_FORBIDDEN)
        period = self.get_object()
        period.status = 'LOCKED'
        period.locked_at = timezone.now()
        period.locked_by = request.user
        period.save()
        return Response({
            'message': f'دوره {period.year_month} تایید نهایی و قفل شد.',
            'status': period.status,
            'status_display': period.get_status_display()
        })

    @action(detail=True, methods=['post'], url_path='reject')
    def reject_period(self, request, pk=None):
        is_financial = request.user.is_superuser or request.user.groups.filter(name__in=['Accountant', 'Finance', 'مدیر مالی']).exists() or request.user.has_perm('personnel.can_override_attendance_lock')
        if not is_financial:
            return Response({'error': 'فقط حسابدار یا مدیر مالی مجاز به رد کارکرد است.'}, status=status.HTTP_403_FORBIDDEN)
        reason = request.data.get('reason', '').strip()
        if not reason:
            return Response({'error': 'درج علت رد دوره برای اطلاع سرپرست الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)
        period = self.get_object()
        period.status = 'REJECTED'
        period.rejection_reason = reason
        period.locked_at = None
        period.locked_by = None
        period.save()
        return Response({
            'message': f'دوره {period.year_month} رد شد و جهت بازبینی به سرپرست بازگشت.',
            'status': period.status,
            'status_display': period.get_status_display()
        })

    @action(detail=False, methods=['post'], url_path='workflow-action')
    def workflow_action(self, request):
        """
        اقدام گردش کار کارکرد بر مبنای warehouse_id و year_month (پشتیبانی از فراخوانی سریع بدون دانستن pk)
        """
        warehouse_id = request.data.get('warehouse_id')
        year_month = request.data.get('year_month')
        action_type = request.data.get('action')
        notes = request.data.get('notes', '')
        from common.tenant_scope import get_current_tenant_company_id
        company_id = request.data.get('company_id') or get_current_tenant_company_id(request=request, user=request.user)

        if not year_month or not action_type:
            return Response({'error': 'پارامترهای year_month و action الزامی هستند.'}, status=status.HTTP_400_BAD_REQUEST)
        if not warehouse_id and not company_id:
            return Response({'error': 'شناسه انبار یا شرکت فعال الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)

        wh_val = int(warehouse_id) if (warehouse_id and str(warehouse_id).isdigit()) else None
        comp_val = int(company_id) if (company_id and str(company_id).isdigit()) else None

        lookup = {'year_month': str(year_month).strip()}
        if wh_val:
            lookup['warehouse_id'] = wh_val
        if comp_val:
            lookup['company_id'] = comp_val

        period, _ = MonthlyWorkPeriod.objects.get_or_create(
            **lookup,
            defaults={'status': 'OPEN', 'company_id': comp_val, 'warehouse_id': wh_val}
        )

        is_financial = request.user.is_superuser or request.user.groups.filter(name__in=['Accountant', 'Finance', 'مدیر مالی']).exists() or request.user.has_perm('personnel.can_override_attendance_lock')

        if action_type == 'submit':
            if period.status == 'LOCKED':
                return Response({'error': 'دوره از قبل قفل شده است.'}, status=status.HTTP_400_BAD_REQUEST)
            period.status = 'SUBMITTED'
            period.submitted_at = timezone.now()
            period.submitted_by = request.user
            period.submission_notes = notes
            period.rejection_reason = None
            period.save()
            return Response({
                'message': f'کارکرد دوره {year_month} جهت بررسی مالی ارسال گردید.',
                'period': MonthlyWorkPeriodSerializer(period).data
            })

        elif action_type == 'approve':
            if not is_financial:
                return Response({'error': 'فقط حسابدار یا مدیر مالی مجاز به تایید نهایی و قفل دوره است.'}, status=status.HTTP_403_FORBIDDEN)
            period.status = 'LOCKED'
            period.locked_at = timezone.now()
            period.locked_by = request.user
            period.save()
            return Response({
                'message': f'کارکرد دوره {year_month} با موفقیت تایید نهایی و قفل شد.',
                'period': MonthlyWorkPeriodSerializer(period).data
            })

        elif action_type == 'reject':
            if not is_financial:
                return Response({'error': 'فقط حسابدار یا مدیر مالی مجاز به رد کارکرد است.'}, status=status.HTTP_403_FORBIDDEN)
            if not notes.strip():
                return Response({'error': 'درج علت رد دوره الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)
            period.status = 'REJECTED'
            period.rejection_reason = notes.strip()
            period.locked_at = None
            period.locked_by = None
            period.save()
            return Response({
                'message': f'دوره {year_month} رد شد و جهت بازبینی به سرپرست بازگردانده شد.',
                'period': MonthlyWorkPeriodSerializer(period).data
            })

        elif action_type == 'unlock':
            is_unlock_authorized = (
                request.user.is_superuser or
                request.user.groups.filter(name__in=['Accountant', 'Finance', 'مدیر مالی']).exists() or
                request.user.has_perm('personnel.can_override_attendance_lock')
            )
            if not is_unlock_authorized:
                return Response({'error': 'فقط مدیر ارشد سیستم یا مدیر مالی مجاز به بازگشایی دوره است.'}, status=status.HTTP_403_FORBIDDEN)
            period.status = 'OPEN'
            period.locked_at = None
            period.locked_by = None
            period.save()
            return Response({
                'message': f'دوره {year_month} با موفقیت بازگشایی شد.',
                'period': MonthlyWorkPeriodSerializer(period).data
            })

        return Response({'error': 'نوع اقدام ناشناخته است.'}, status=status.HTTP_400_BAD_REQUEST)

__all__ = [
    'DailyAttendanceViewSet',
    'MonthlyWorkPeriodViewSet',
]
