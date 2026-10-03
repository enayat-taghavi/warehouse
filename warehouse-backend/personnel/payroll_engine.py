# -*- coding: utf-8 -*-
"""
Comprehensive Monthly Payroll Calculation Engine.
Calculates all 58 columns matching sheet `تیر` and `Settings` in company Excel blueprint (`حقوق تیر ماه انبارداری.xlsm`).
Includes dynamic insurance days optimization and parametric surplus allocation.
"""
from decimal import Decimal, ROUND_HALF_UP
from django.db import transaction
from django.db.models import Q
from .models import (
    MonthlyWorkPeriod,
    MonthlyPayrollRecord,
    PersonnelProfile,
    PayrollYearlySettings,
    JobGradeTier,
    DailyAttendance
)

def get_effective_payroll_settings(year_month: str, project_id: int = None, company_id: int = None) -> PayrollYearlySettings:
    """
    واکشی هوشمند تنظیمات احکام حقوق منطبق بر ماه دوره، پروژه و شرکت متبوع:
    1. ابتدا تطبیق با تنظیمات اختصاصی پروژه در بازه موثر
    2. در صورت عدم تعریف، ارث‌بری هوشمند از تنظیمات شرکت متبوع در همان بازه
    3. در صورت عدم تعریف، ارث‌بری از تنظیمات سراسری سازمان (بدون پروژه و شرکت)
    4. در صورت عدم تعریف، فال‌بک به هر رکورد سراسری معتبر در بازه
    5. در نهایت، فال‌بک به تنظیمات فعال سال مالی
    """
    year_str = year_month.split('/')[0] if '/' in year_month else '1405'

    # 1. تنظیمات اختصاصی پروژه در بازه معتبر
    if project_id:
        proj_setting = PayrollYearlySettings.objects.filter(
            project_id=project_id,
            effective_from__lte=year_month
        ).filter(
            Q(effective_to__gte=year_month) | Q(effective_to__isnull=True)
        ).order_by('-effective_from').first()
        if proj_setting:
            return proj_setting

        # در صورت نبود تنظیمات پروژه، در صورت عدم ارسال صریح company_id، شرکت پروژه را می‌یابیم
        if not company_id:
            from .models import FinancialProject
            proj_company_id = FinancialProject.objects.filter(id=project_id).values_list('company_id', flat=True).first()
            if proj_company_id:
                company_id = proj_company_id

    # 2. ارث‌بری از تنظیمات اختصاصی شرکت در همان بازه
    if company_id:
        company_setting = PayrollYearlySettings.objects.filter(
            company_id=company_id,
            project__isnull=True,
            effective_from__lte=year_month
        ).filter(
            Q(effective_to__gte=year_month) | Q(effective_to__isnull=True)
        ).order_by('-effective_from').first()
        if company_setting:
            return company_setting

    # 3. ارث‌بری از تنظیمات سراسری سازمان در همان بازه (بدون پروژه و بدون شرکت)
    global_setting = PayrollYearlySettings.objects.filter(
        project__isnull=True,
        company__isnull=True,
        effective_from__lte=year_month
    ).filter(
        Q(effective_to__gte=year_month) | Q(effective_to__isnull=True)
    ).order_by('-effective_from').first()
    if global_setting:
        return global_setting

    # 4. فال‌بک به هر تنظیم سراسری در بازه زمانی (جهت سازگاری با رکوردهای قدیمی)
    fallback_global = PayrollYearlySettings.objects.filter(
        project__isnull=True,
        effective_from__lte=year_month
    ).filter(
        Q(effective_to__gte=year_month) | Q(effective_to__isnull=True)
    ).order_by('-effective_from').first()
    if fallback_global:
        return fallback_global

    # 5. فال‌بک نهایی به تنظیمات فعال سال مالی
    fallback = PayrollYearlySettings.objects.filter(fiscal_year=year_str, is_active=True).first()
    if not fallback:
        fallback = PayrollYearlySettings.objects.filter(is_active=True).first()
    if not fallback:
        fallback = PayrollYearlySettings.objects.first()
    return fallback


class PayrollCalculationEngine:
    """
    موتور جامع محاسبات حقوق، دستمزد و مالیات بر اساس الگوریتم مرجع شرکت
    """

    def __init__(self, period: MonthlyWorkPeriod = None):
        self.period = period

    def calculate_single_employee(
        self,
        personnel: PersonnelProfile,
        period: MonthlyWorkPeriod,
        settings: PayrollYearlySettings,
        job_grades: dict,
        month_days: int,
        existing_record: MonthlyPayrollRecord = None
    ) -> dict:
        """
        محاسبه تمام ۵۸ ستون برای یک پرسنل بر اساس قوانین و فرمول‌های اکسل
        """
        p = personnel
        # ── 1. Job Grade & Base Wage ──────────────────────────────
        grade_key = str(p.job_grade or '19').strip()
        if grade_key in job_grades:
            daily_wage, daily_seniority = job_grades[grade_key]
        else:
            daily_wage = p.daily_base_wage or Decimal(0)
            daily_seniority = p.daily_seniority_bonus or Decimal(0)

        years_exp = p.base_years_experience or 0
        base_daily_rate = daily_wage + (years_exp * daily_seniority)
        contract_hours = Decimal(p.contract_hours or 230)
        contract_salary = Decimal(p.contract_base_salary or 0)

        # ── 2. Attendance Aggregation ─────────────────────────────
        if getattr(p, 'id', None):
            attendances = DailyAttendance.objects.filter(
                personnel=p,
                date_shamsi__startswith=period.year_month,
                approval_status='APPROVED',
                is_deleted=False
            )
        else:
            attendances = DailyAttendance.objects.none()

        if attendances.exists():
            worked_hours = sum(Decimal(a.effective_hours or 0) for a in attendances)
            manual_overtime_hours = sum(Decimal(a.overtime_hours or 0) for a in attendances)
            friday_work_days = sum(1 for a in attendances if a.is_friday_work or a.status == 'FRIDAY_WORK')
            mission_days = sum(1 for a in attendances if a.is_mission or a.status == 'MISSION')
            adv_deduction = sum(Decimal(a.advance_payment or 0) for a in attendances)
            raw_att_days = min(len(attendances), month_days)
        else:
            # Default standard full attendance
            worked_hours = contract_hours
            manual_overtime_hours = Decimal(0)
            friday_work_days = Decimal(0)
            mission_days = Decimal(0)
            adv_deduction = Decimal(0)
            raw_att_days = month_days

        # ── 3. Gross Salary (حقوق ناخالص) ───────────────────────────
        # Formula: ROUND((ساعت کارکرد / کارکرد قرارداد شده) * حقوق قرارداد شده, 0)
        if contract_hours > 0 and contract_salary > 0:
            gross_salary = Decimal(round((worked_hours / contract_hours) * contract_salary))
        else:
            gross_salary = Decimal(round(base_daily_rate * raw_att_days))

        # Allowances constants from settings
        monthly_food = Decimal(settings.monthly_food_allowance if settings else 22000000)
        monthly_housing = Decimal(settings.monthly_housing_allowance if settings else 30000000)
        monthly_spouse = Decimal(settings.monthly_spouse_allowance if settings else 5000000)
        monthly_child = Decimal(settings.monthly_child_allowance if settings else 16625549)
        travel_cost_day = Decimal(settings.travel_cost_per_day if settings else 8736600)
        transport_fixed = Decimal(settings.transport_fixed_amount if settings else 2388728)

        # درصدها: نرمال‌سازی خودکار مقادیر درصد ورودی (مثلاً عدد ۱۰ به ۰.۱۰)
        def _to_fraction(val):
            d = Decimal(val or 0)
            return d / Decimal(100.0) if d > Decimal(1.0) else d

        transport_help_pct = _to_fraction(settings.transport_help_percent if settings else 0)
        attraction_pct = _to_fraction(settings.specialist_attraction_percent if settings else 0)
        bad_weather_pct = _to_fraction(settings.bad_weather_percent if settings else 0)
        remote_hardship_pct = _to_fraction(settings.remote_hardship_percent if settings else 0)
        south_pars_pct = _to_fraction(settings.south_pars_percent if settings else 0)
        surplus_overtime_pct = (Decimal(settings.surplus_overtime_percent if settings else 50.00) / Decimal(100.0))

        # ساعات کار استاندارد روزانه و ضرایب مصوب اکسل مرجع شرکت
        std_daily_hours = Decimal(settings.standard_daily_hours if settings and settings.standard_daily_hours else 10.00)
        bonus_coeff = Decimal(settings.bonus_daily_coefficient if settings and settings.bonus_daily_coefficient else 5.00)
        sen_coeff = Decimal(settings.seniority_monthly_coefficient if settings and settings.seniority_monthly_coefficient else 2.50)
        ot_multiplier = Decimal(settings.overtime_rate_multiplier if settings and settings.overtime_rate_multiplier else 1.40)
        fri_multiplier = Decimal(settings.friday_work_rate_multiplier if settings and settings.friday_work_rate_multiplier else 0.40)

        is_married = p.marital_status == 'married'
        children_count = p.children_count or 0

        # ── 4. Smart Insurance Days Optimization ─────────────────
        # سیستم بررسی می‌کند که آیا حقوق ناخالص کفاف حداقل دستمزد و مزایای قانونی کل ماه را می‌دهد یا خیر
        def compute_statutory_base(days: int):
            d_ratio = Decimal(days) / Decimal(month_days)
            b_sal = Decimal(round(Decimal(days) * base_daily_rate))
            f_all = Decimal(round(monthly_food * d_ratio))
            h_all = Decimal(round(monthly_housing * d_ratio))
            m_all = Decimal(round(monthly_spouse * d_ratio)) if is_married else Decimal(0)
            c_all = Decimal(round(Decimal(children_count) * monthly_child * d_ratio))
            t_all = Decimal(round(transport_fixed * Decimal(days) * transport_help_pct))
            mkt_all = Decimal(round(attraction_pct * daily_wage * Decimal(days)))
            bw_all = Decimal(round(bad_weather_pct * daily_wage * Decimal(days)))
            rh_all = Decimal(round(remote_hardship_pct * daily_wage * Decimal(days)))
            sp_all = Decimal(round(south_pars_pct * daily_wage * Decimal(days)))
            bon_all = Decimal(round(bonus_coeff * base_daily_rate * d_ratio))

            s_base_weather = bw_all + rh_all + sp_all + b_sal
            sen_all = Decimal(round((sen_coeff * s_base_weather) / Decimal(month_days)))

            if days > 0 and friday_work_days > 0:
                fri_all = Decimal(round(((fri_multiplier * s_base_weather) / Decimal(days)) * Decimal(friday_work_days)))
            else:
                fri_all = Decimal(0)

            total_stat = b_sal + f_all + h_all + m_all + c_all + t_all + mkt_all + bw_all + rh_all + sp_all + bon_all + sen_all + fri_all
            return {
                'days': days,
                'days_ratio': d_ratio,
                'base_salary': b_sal,
                'food_allowance': f_all,
                'housing_allowance': h_all,
                'marital_allowance': m_all,
                'child_allowance': c_all,
                'transport_allowance': t_all,
                'market_attraction_allowance': mkt_all,
                'bad_weather_allowance': bw_all,
                'remote_hardship_allowance': rh_all,
                'south_pars_allowance': sp_all,
                'bonus_amount': bon_all,
                'seniority_allowance': sen_all,
                'friday_work_amount': fri_all,
                'total_statutory': total_stat
            }

        # Determine optimal insurance days
        best_days = raw_att_days
        stat_eval = compute_statutory_base(best_days)
        if gross_salary < stat_eval['total_statutory'] and raw_att_days > 1:
            for test_d in range(raw_att_days, 0, -1):
                stat_eval = compute_statutory_base(test_d)
                if gross_salary >= stat_eval['total_statutory']:
                    best_days = test_d
                    break
            else:
                best_days = 1
                stat_eval = compute_statutory_base(1)

        insurance_days = best_days
        base_salary = stat_eval['base_salary']
        food_allowance = stat_eval['food_allowance']
        housing_allowance = stat_eval['housing_allowance']
        marital_allowance = stat_eval['marital_allowance']
        child_allowance = stat_eval['child_allowance']
        transport_allowance = stat_eval['transport_allowance']
        market_attraction_allowance = stat_eval['market_attraction_allowance']
        bad_weather_allowance = stat_eval['bad_weather_allowance']
        remote_hardship_allowance = stat_eval['remote_hardship_allowance']
        south_pars_allowance = stat_eval['south_pars_allowance']
        bonus_amount = stat_eval['bonus_amount']
        seniority_allowance = stat_eval['seniority_allowance']
        friday_work_amount = stat_eval['friday_work_amount']
        leave_amount = Decimal(0)
        other_allowances = Decimal(0)

        # ── 5. Surplus Allocation (تسهیم مازاد) ─────────────────────
        # مازاد = حقوق ناخالص - جمع اقلام قانونی شناخته‌شده
        statutory_sum = stat_eval['total_statutory']
        surplus = gross_salary - statutory_sum

        if surplus > 0:
            surplus_overtime = Decimal(round(surplus * surplus_overtime_pct))
            surplus_travel_mission = surplus - surplus_overtime
            overtime_amount = surplus_overtime

            hourly_rate = base_daily_rate / (std_daily_hours if std_daily_hours > 0 else Decimal(10))
            if hourly_rate > 0:
                overtime_hours = Decimal(round(overtime_amount / (hourly_rate * ot_multiplier), 2))
            else:
                overtime_hours = manual_overtime_hours

            # Distribute remainder between Travel and Mission weighted by daily travel cost & base wage
            travel_weight = travel_cost_day
            mission_weight = base_daily_rate
            total_weight = travel_weight + mission_weight

            if total_weight > 0 and surplus_travel_mission > 0:
                travel_cost_amount = Decimal(round(surplus_travel_mission * (travel_weight / total_weight)))
                mission_amount = surplus_travel_mission - travel_cost_amount
            else:
                travel_cost_amount = Decimal(0)
                mission_amount = Decimal(0)
        else:
            overtime_amount = Decimal(0)
            overtime_hours = manual_overtime_hours
            travel_cost_amount = Decimal(0)
            mission_amount = Decimal(0)

        # ── 6. Subtotals & Tax/Insurance Calculations ──────────────
        total_taxable_allowances = Decimal(round(
            other_allowances + overtime_amount + marital_allowance + housing_allowance +
            food_allowance + transport_allowance + market_attraction_allowance +
            bad_weather_allowance + remote_hardship_allowance + south_pars_allowance + friday_work_amount
        ))

        total_non_continuous_taxable_allowances = Decimal(round(other_allowances + overtime_amount + friday_work_amount))
        
        continuous_taxable_allowances = Decimal(round(
            child_allowance + marital_allowance + housing_allowance + food_allowance +
            transport_allowance + market_attraction_allowance + bad_weather_allowance +
            remote_hardship_allowance + south_pars_allowance
        ))

        total_non_taxable_allowances = Decimal(round(
            mission_amount + travel_cost_amount + leave_amount + bonus_amount + seniority_allowance + child_allowance
        ))

        total_seniority_accumulated = Decimal(round(Decimal(insurance_days) * daily_seniority * Decimal(years_exp)))

        # Insurance calculations (7% worker, 20% employer, 3% unemployment) with smart statutory ceiling
        if p.include_in_insurance:
            total_insurable_salary_allowances = base_salary + total_taxable_allowances
            # سقف قانونی حق بیمه: معادل ۷ برابر حداقل دستمزد روزانه گروه ۱ یا سقف دستی تعیین‌شده
            daily_ceiling = Decimal(0)
            if settings and getattr(settings, 'max_insurable_daily_wage', None):
                daily_ceiling = Decimal(settings.max_insurable_daily_wage)
            else:
                g1_data = job_grades.get('1') or job_grades.get(1)
                g1_rate = Decimal(g1_data[0]) if g1_data else Decimal(0)
                if g1_rate > 0:
                    daily_ceiling = g1_rate * Decimal(7)
                elif settings:
                    tier1 = settings.job_grades.filter(grade_number=1).first()
                    if tier1 and tier1.daily_base_wage:
                        daily_ceiling = Decimal(tier1.daily_base_wage) * Decimal(7)

            if daily_ceiling > 0 and insurance_days > 0:
                monthly_max_insurable = daily_ceiling * Decimal(insurance_days)
                total_insurable_salary_allowances = min(total_insurable_salary_allowances, monthly_max_insurable)
        else:
            total_insurable_salary_allowances = Decimal(0)

        w_rate = Decimal(str(settings.worker_insurance_rate if settings else '7.00')) / Decimal('100.0')
        e_rate = Decimal(str(settings.employer_insurance_rate if settings else '20.00')) / Decimal('100.0')
        u_rate = Decimal(str(settings.unemployment_insurance_rate if settings else '3.00')) / Decimal('100.0')

        worker_insurance = Decimal(round(total_insurable_salary_allowances * w_rate))
        employer_insurance = Decimal(round(total_insurable_salary_allowances * e_rate))
        unemployment_insurance = Decimal(round(total_insurable_salary_allowances * u_rate))
        total_insurance = worker_insurance + employer_insurance + unemployment_insurance

        continuous_taxable_salary_allowances = base_salary + continuous_taxable_allowances

        # ── 7. Income Tax Logic (حفظ مقدار ایمپورت‌شده از سامانه دارایی یا دستی) ────
        tax_source_type = 'MANUAL'
        tax_exemption_months = 1
        has_multiple_employers = False
        is_tax_imported = False

        if existing_record and (existing_record.is_tax_imported or existing_record.tax_source_type == 'IMPORTED_EXCEL'):
            # Preserve uploaded/imported tax from Tax Administration calculation file
            income_tax = existing_record.income_tax
            tax_source_type = existing_record.tax_source_type or 'IMPORTED_EXCEL'
            tax_exemption_months = existing_record.tax_exemption_months or 1
            has_multiple_employers = existing_record.has_multiple_employers
            is_tax_imported = True
        elif existing_record and existing_record.income_tax > 0:
            # Preserve manually assigned tax
            income_tax = existing_record.income_tax
            tax_source_type = existing_record.tax_source_type or 'MANUAL'
        else:
            # Tax is computed externally by Tax Administration portal via WH/WP export
            income_tax = Decimal(0)
            tax_source_type = 'MANUAL'

        total_deductions = worker_insurance
        net_salary = gross_salary - worker_insurance - income_tax
        payable_amount = net_salary - adv_deduction

        # ── 8. Tax Discrepancy Check (چک مالیات - ستون ۵۸) ───────────
        # Formula: (ستون ۵۱ + ستون ۲۸ + ستون ۲۷ + ستون ۲۹ + ستون ۲۴ + ستون ۲۶ + ستون ۴۰ + ستون ۲۵) - ستون ۵۳
        sum_tax_check = (
            continuous_taxable_salary_allowances + mission_amount + travel_cost_amount +
            bonus_amount + other_allowances + overtime_amount + seniority_allowance + friday_work_amount
        )
        tax_check_discrepancy = sum_tax_check - gross_salary

        return {
            'status_category': p.status_category or 'نفرات شرکتی',
            'include_in_tax': p.include_in_tax,
            'include_in_insurance': p.include_in_insurance,
            'include_in_bank': p.include_in_bank,
            'national_code': p.national_code,
            'full_name': p.full_name,
            'marital_status': 'متاهل' if is_married else 'مجرد',
            'children_count': children_count,
            'contract_hours': contract_hours,
            'contract_salary': contract_salary,
            'job_grade': grade_key,
            'daily_wage': daily_wage,
            'daily_seniority': daily_seniority,
            'years_of_service': years_exp,
            'base_daily_rate': base_daily_rate,
            'worked_hours': worked_hours,
            'insurance_days': insurance_days,
            'overtime_hours': overtime_hours,
            'friday_work_days': friday_work_days,
            'mission_days': mission_days,
            'income_tax': income_tax,
            'tax_source_type': tax_source_type,
            'tax_exemption_months': tax_exemption_months,
            'has_multiple_employers': has_multiple_employers,
            'is_tax_imported': is_tax_imported,
            'advance_payment_deduction': adv_deduction,
            'other_allowances': other_allowances,
            'friday_work_amount': friday_work_amount,
            'overtime_amount': overtime_amount,
            'travel_cost_amount': travel_cost_amount,
            'mission_amount': mission_amount,
            'bonus_amount': bonus_amount,
            'leave_amount': leave_amount,
            'food_allowance': food_allowance,
            'housing_allowance': housing_allowance,
            'marital_allowance': marital_allowance,
            'transport_allowance': transport_allowance,
            'market_attraction_allowance': market_attraction_allowance,
            'bad_weather_allowance': bad_weather_allowance,
            'remote_hardship_allowance': remote_hardship_allowance,
            'south_pars_allowance': south_pars_allowance,
            'child_allowance': child_allowance,
            'seniority_allowance': seniority_allowance,
            'total_taxable_allowances': total_taxable_allowances,
            'total_non_continuous_taxable_allowances': total_non_continuous_taxable_allowances,
            'continuous_taxable_allowances': continuous_taxable_allowances,
            'total_non_taxable_allowances': total_non_taxable_allowances,
            'total_seniority_accumulated': total_seniority_accumulated,
            'worker_insurance': worker_insurance,
            'employer_insurance': employer_insurance,
            'unemployment_insurance': unemployment_insurance,
            'total_insurance': total_insurance,
            'base_salary': base_salary,
            'continuous_taxable_salary_allowances': continuous_taxable_salary_allowances,
            'total_insurable_salary_allowances': total_insurable_salary_allowances,
            'gross_salary': gross_salary,
            'total_deductions': total_deductions,
            'net_salary': net_salary,
            'bank_account_number': p.account_number or p.sheba_number or '',
            'payable_amount': payable_amount,
            'tax_check_discrepancy': tax_check_discrepancy,
        }

    def calculate_period(self, period: MonthlyWorkPeriod, user=None) -> list:
        """
        محاسبه کلیه رکوردهای حقوق برای کل پرسنل یک دوره ماهانه با تفکیک هوشمند پروژه و بازه احکام
        """
        year_str = period.year_month.split('/')[0] if '/' in period.year_month else '1405'
        month_str = period.year_month.split('/')[1] if '/' in period.year_month else '04'
        month_num = int(month_str)
        month_days = 31 if month_num <= 6 else (30 if month_num <= 11 else 29)

        # کش محلی تنظیمات و جداول ۲۰ گروه شغلی به ازای پروژه برای سرعت بالا
        resolved_settings_cache = {}
        job_grades_cache = {}

        def get_cached_project_settings(proj_id):
            if proj_id not in resolved_settings_cache:
                s = get_effective_payroll_settings(period.year_month, proj_id)
                resolved_settings_cache[proj_id] = s
                jg_dict = {}
                if s:
                    for jg in s.job_grades.all():
                        jg_dict[str(jg.grade_number)] = (jg.daily_base_wage, jg.daily_seniority_bonus)
                job_grades_cache[proj_id] = jg_dict
            return resolved_settings_cache[proj_id], job_grades_cache[proj_id]

        # پرسنل فعال یا پرسنلی که در این دوره کارکرد ثبت‌شده دارند
        personnel_qs = PersonnelProfile.objects.filter(
            Q(is_active=True) | Q(daily_attendances__date_shamsi__startswith=period.year_month, daily_attendances__is_deleted=False)
        ).distinct().order_by('last_name', 'first_name')

        # ایزولاسیون شرکتی: فیلتر پرسنل بر مبنای شرکت دوره
        if period.company_id:
            personnel_qs = personnel_qs.filter(
                Q(company_id=period.company_id) | Q(section__project__company_id=period.company_id)
            ).distinct()

        if period.warehouse:
            wh_personnel = personnel_qs.filter(
                Q(assigned_warehouse_id=period.warehouse_id) | Q(daily_attendances__warehouse_id=period.warehouse_id, daily_attendances__date_shamsi__startswith=period.year_month)
            ).distinct()
            if wh_personnel.exists():
                personnel_qs = wh_personnel

        created_records = []

        with transaction.atomic():
            row_idx = 1
            for p in personnel_qs:
                existing = MonthlyPayrollRecord.objects.filter(period=period, personnel=p).first()
                if existing and existing.is_manually_overridden:
                    created_records.append(existing)
                    row_idx += 1
                    continue

                from .lifecycle_services import validate_personnel_validity
                is_valid, val_reason = validate_personnel_validity(p, period.year_month)
                has_curr_att = DailyAttendance.objects.filter(personnel=p, date_shamsi__startswith=period.year_month, is_deleted=False).exists()
                if not is_valid and not has_curr_att:
                    continue

                emp_settings, emp_job_grades = get_cached_project_settings(p.project_id)

                calc_data = self.calculate_single_employee(
                    personnel=p,
                    period=period,
                    settings=emp_settings,
                    job_grades=emp_job_grades,
                    month_days=month_days,
                    existing_record=existing
                )

                calc_data['row_number'] = row_idx
                calc_data['is_manually_overridden'] = False

                # DEF-20 (گام ۲ اصلاحیه): تعلیق پرداخت در صورت انقضای اعتبار و حفظ تمامیت تعلیق
                if not is_valid and has_curr_att:
                    if not existing or not existing.payment_hold_released_at:
                        calc_data['payment_hold'] = True
                        calc_data['payment_hold_reason'] = val_reason or "انقضای اعتبار تا تمدید"
                    else:
                        # رکورد قبلاً توسط حسابدار آزاد شده است؛ حفظ متادیتا و وضعیت آزادسازی
                        calc_data['payment_hold'] = False
                        calc_data['payment_hold_released_at'] = existing.payment_hold_released_at
                        calc_data['payment_hold_released_by'] = existing.payment_hold_released_by
                else:
                    if existing and existing.payment_hold:
                        # پرسنلی که فیش آن‌ها معلق شده، با محاسبه مجدد نباید قفل تعلیق به‌صورت بی‌صدا برداشته شود؛
                        # آزادسازی منحصراً باید از طریق اکشن صریح release-payment-hold همراه با ثبت لاگ ممیزی انجام گیرد.
                        calc_data['payment_hold'] = True
                        calc_data['payment_hold_reason'] = existing.payment_hold_reason
                    elif existing and existing.payment_hold_released_at:
                        calc_data['payment_hold'] = False
                        calc_data['payment_hold_released_at'] = existing.payment_hold_released_at
                        calc_data['payment_hold_released_by'] = existing.payment_hold_released_by
                    else:
                        calc_data['payment_hold'] = False
                        calc_data['payment_hold_reason'] = None

                record, _ = MonthlyPayrollRecord.objects.update_or_create(
                    period=period,
                    personnel=p,
                    defaults=calc_data
                )
                created_records.append(record)
                row_idx += 1

        return created_records


def calculate_monthly_payroll_for_period(period: MonthlyWorkPeriod, user=None) -> list:
    """
    تابع واسط جهت حفظ سازگاری و فراخوانی از ویوها و تسک‌ها
    """
    engine = PayrollCalculationEngine(period=period)
    return engine.calculate_period(period, user=user)
