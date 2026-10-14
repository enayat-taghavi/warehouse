"""
موتور استاندارد ورود و خروج اکسل ساختار سازمانی و طرف‌حساب‌های مالی
(Financial Projects, Project Sections & Counterparties Excel Engine)
مطابق با استاندارد Rule 6:
- ساختار ۲ سطری هدر (سطر ۱: عناوین فارسی، سطر ۲: کلیدهای دیتابیسی با فونت طوسی)
- فریز پنل در A3 (freeze_panes = 'A3')
- راست‌به‌چپ (rightToLeft = True)
- تبدیل زمان‌ها به تاریخ و زمان شمسی
- پشتیبانی کامل از پیش‌نمایش واقعی (dry_run) بدون ایجاد رکورد در دیتابیس
"""

import io
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from django.http import HttpResponse
from django.db import transaction
from django.db.models import Count, Q
import jdatetime

from django.contrib.auth import get_user_model
from .models import FinancialProject, ProjectSection, Counterparty, UserSectionAssignment
from common.date_utils import normalize_digits

User = get_user_model()

# فهرست‌های مجاز جهت استفاده در منوهای کشویی اکسل (Data Validation Lists)
COUNTERPARTY_TYPES_TUPLES = [
    ('راننده / مالک خودرو', 'driver'),
    ('تعمیرگاه و قطعات', 'repair_shop'),
    ('جایگاه سوخت', 'fuel_station'),
    ('پیمانکار خدماتی', 'contractor'),
    ('سایر اشخاص حقیقی/حقوقی', 'other'),
]

IRANIAN_BANKS_LIST = [
    'بانک ملی ایران',
    'بانک ملت',
    'بانک صادرات ایران',
    'بانک سپه',
    'بانک تجارت',
    'بانک پاسارگاد',
    'بانک سامان',
    'بانک پارسیان',
    'بانک کارآفرین',
    'بانک اقتصاد نوین',
    'بانک سینا',
    'بانک شهر',
    'بانک دی',
    'بانک گردشگری',
    'بانک ایران زمین',
    'بانک سرمایه',
    'بانک رفاه کارگران',
    'بانک مسکن',
    'بانک کشاورزی',
    'بانک صنعت و معدن',
    'بانک توسعه صادرات ایران',
    'بانک توسعه تعاون',
    'پست بانک ایران',
    'بانک قرض‌الحسنه مهر ایران',
    'بانک قرض‌الحسنه رسالت',
    'بانک خاورمیانه',
    'بانک آینده',
    'موسسه اعتباری غیربانکی ملل (عسکریه)',
    'بانک مرکزی جمهوری اسلامی ایران',
]

BOOLEAN_LIST = ['بله', 'خیر']


def _format_datetime_shamsi(dt):
    if not dt:
        return '-'
    try:
        jdt = jdatetime.datetime.fromgregorian(datetime=dt)
        return jdt.strftime('%Y/%m/%d %H:%M:%S')
    except Exception:
        return str(dt)


def _apply_2row_header(ws, columns, header_bg='059669'):
    """
    اعمال هدر دو سطری استاندارد شرکت:
    سطر ۱: عناوین فارسی
    سطر ۲: کلیدهای سیستمی دیتابیسی
    """
    f_title = Font(name='B Nazanin', size=11, bold=True, color='FFFFFF')
    f_key = Font(name='Segoe UI', size=9, bold=True, color='CBD5E1')
    fill_title = PatternFill(start_color=header_bg, end_color=header_bg, fill_type='solid')
    fill_key = PatternFill(start_color='1E293B', end_color='1E293B', fill_type='solid')

    align_center = Alignment(horizontal='center', vertical='center', wrap_text=True)
    thin_border = Border(
        left=Side(style='thin', color='E2E8F0'),
        right=Side(style='thin', color='E2E8F0'),
        top=Side(style='thin', color='E2E8F0'),
        bottom=Side(style='thin', color='E2E8F0')
    )

    ws.row_dimensions[1].height = 26
    ws.row_dimensions[2].height = 20
    ws.freeze_panes = 'A3'
    ws.sheet_view.rightToLeft = True

    for col_idx, col in enumerate(columns, 1):
        # سطر ۱
        c1 = ws.cell(row=1, column=col_idx, value=col['title'])
        c1.font = f_title
        c1.fill = fill_title
        c1.alignment = align_center
        c1.border = thin_border

        # سطر ۲
        c2 = ws.cell(row=2, column=col_idx, value=col['key'])
        c2.font = f_key
        c2.fill = fill_key
        c2.alignment = align_center
        c2.border = thin_border

        ws.column_dimensions[get_column_letter(col_idx)].width = col.get('width', 18)


# -------------------------------------------------------------
# ۱. پروژه‌های مالی (Financial Projects)
# -------------------------------------------------------------
PROJECT_COLUMNS = [
    {'title': 'کد پروژه', 'key': 'code', 'width': 15},
    {'title': 'نام پروژه مالی / عملیاتی', 'key': 'name', 'width': 28},
    {'title': 'توضیحات و دامنه فعالیت', 'key': 'description', 'width': 35},
    {'title': 'وضعیت فعال (بله/خیر)', 'key': 'is_active', 'width': 16},
    {'title': 'تعداد بخش‌ها', 'key': 'sections_count', 'width': 14},
    {'title': 'تاریخ ایجاد', 'key': 'created_at', 'width': 22},
]

def export_projects_excel(company_ids=None):
    """company_ids تهی یعنی همهٔ پروژه‌ها (سوپریوزر)؛ وگرنه پروژه‌های همان شرکت‌ها به‌علاوهٔ پروژه‌های سراسری"""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'پروژه‌های مالی'
    _apply_2row_header(ws, PROJECT_COLUMNS, header_bg='4338CA')  # رنگ ایندیگو

    font_data = Font(name='B Nazanin', size=11)
    align_data = Alignment(horizontal='center', vertical='center')
    align_text = Alignment(horizontal='right', vertical='center')

    # بهینه‌سازی N+1 کوئری با Count('sections')
    projects = FinancialProject.objects.annotate(sections_count=Count('sections'))
    if company_ids is not None:
        projects = projects.filter(Q(company_id__in=company_ids) | Q(company__isnull=True))
    for row_idx, p in enumerate(projects.order_by('code'), 3):
        ws.cell(row=row_idx, column=1, value=p.code).alignment = align_data
        ws.cell(row=row_idx, column=2, value=p.name).alignment = align_text
        ws.cell(row=row_idx, column=3, value=p.description or '-').alignment = align_text
        ws.cell(row=row_idx, column=4, value='بله' if p.is_active else 'خیر').alignment = align_data
        ws.cell(row=row_idx, column=5, value=p.sections_count).alignment = align_data
        ws.cell(row=row_idx, column=6, value=_format_datetime_shamsi(p.created_at)).alignment = align_data

        for c in range(1, 7):
            ws.cell(row=row_idx, column=c).font = font_data

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    response = HttpResponse(buf.read(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response['Content-Disposition'] = 'attachment; filename="financial_projects.xlsx"'
    return response


# -------------------------------------------------------------
# ۲. بخش‌ها و دپارتمان‌ها (Project Sections)
# -------------------------------------------------------------
SECTION_COLUMNS = [
    {'title': 'کد پروژه مادر', 'key': 'project_code', 'width': 16},
    {'title': 'نام پروژه مادر', 'key': 'project_name', 'width': 24},
    {'title': 'کد بخش', 'key': 'code', 'width': 15},
    {'title': 'نام بخش / دپارتمان', 'key': 'name', 'width': 28},
    {'title': 'وضعیت فعال (بله/خیر)', 'key': 'is_active', 'width': 16},
    {'title': 'تاریخ ایجاد', 'key': 'created_at', 'width': 22},
]

def export_sections_excel(project_id=None, company_ids=None):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'بخش‌های پروژه'
    _apply_2row_header(ws, SECTION_COLUMNS, header_bg='0D9488')  # سبز کله‌غازی

    qs = ProjectSection.objects.select_related('project').all()
    if company_ids is not None:
        qs = qs.filter(Q(project__company_id__in=company_ids) | Q(project__company__isnull=True))
    if project_id:
        try:
            qs = qs.filter(project_id=int(project_id))
        except (ValueError, TypeError):
            pass
    qs = qs.order_by('project__code', 'code')

    font_data = Font(name='B Nazanin', size=11)
    align_data = Alignment(horizontal='center', vertical='center')
    align_text = Alignment(horizontal='right', vertical='center')

    for row_idx, s in enumerate(qs, 3):
        ws.cell(row=row_idx, column=1, value=s.project.code if s.project else '-').alignment = align_data
        ws.cell(row=row_idx, column=2, value=s.project.name if s.project else '-').alignment = align_text
        ws.cell(row=row_idx, column=3, value=s.code).alignment = align_data
        ws.cell(row=row_idx, column=4, value=s.name).alignment = align_text
        ws.cell(row=row_idx, column=5, value='بله' if s.is_active else 'خیر').alignment = align_data
        ws.cell(row=row_idx, column=6, value=_format_datetime_shamsi(s.created_at)).alignment = align_data

        for c in range(1, 7):
            ws.cell(row=row_idx, column=c).font = font_data

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    response = HttpResponse(buf.read(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response['Content-Disposition'] = 'attachment; filename="project_sections.xlsx"'
    return response


# -------------------------------------------------------------
# ۳. طرف‌حساب‌های مالی (Counterparties)
# -------------------------------------------------------------
COUNTERPARTY_COLUMNS = [
    {'title': 'نام طرف‌حساب', 'key': 'name', 'width': 26},
    {'title': 'نوع طرف‌حساب', 'key': 'counterparty_type', 'width': 18},
    {'title': 'کد ملی / شناسه اقتصادی', 'key': 'national_id', 'width': 20},
    {'title': 'تلفن تماس', 'key': 'phone', 'width': 18},
    {'title': 'نام بانک عامل', 'key': 'bank_name', 'width': 18},
    {'title': 'شماره حساب', 'key': 'account_number', 'width': 20},
    {'title': 'شماره شبا (۲۴ رقمی)', 'key': 'sheba_number', 'width': 28},
    {'title': 'کد حساب تفصیلی', 'key': 'account_code', 'width': 20},
    {'title': 'وضعیت فعال', 'key': 'is_active', 'width': 14},
    {'title': 'تاریخ ثبت', 'key': 'created_at', 'width': 22},
]

def export_counterparties_excel(section_id=None, company_ids=None):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'طرف‌حساب‌های مالی'
    _apply_2row_header(ws, COUNTERPARTY_COLUMNS, header_bg='059669')  # سبز زمردی

    qs = Counterparty.objects.all()
    if company_ids is not None:
        qs = qs.filter(Q(company_id__in=company_ids) | Q(company__isnull=True))
    qs = qs.order_by('name')

    font_data = Font(name='B Nazanin', size=11)
    align_data = Alignment(horizontal='center', vertical='center')
    align_text = Alignment(horizontal='right', vertical='center')

    type_map = dict(Counterparty.TYPE_CHOICES)

    for row_idx, cp in enumerate(qs, 3):
        sheba_display = f"IR{cp.sheba_number}" if cp.sheba_number else '-'
        ws.cell(row=row_idx, column=1, value=cp.name).alignment = align_text
        ws.cell(row=row_idx, column=2, value=type_map.get(cp.counterparty_type, cp.counterparty_type)).alignment = align_data
        ws.cell(row=row_idx, column=3, value=cp.national_id or '-').alignment = align_data
        ws.cell(row=row_idx, column=4, value=cp.phone or '-').alignment = align_data
        ws.cell(row=row_idx, column=5, value=cp.bank_name or '-').alignment = align_text
        ws.cell(row=row_idx, column=6, value=cp.account_number or '-').alignment = align_data
        ws.cell(row=row_idx, column=7, value=sheba_display).alignment = align_data
        ws.cell(row=row_idx, column=8, value=cp.account_code or '-').alignment = align_data
        ws.cell(row=row_idx, column=9, value='بله' if cp.is_active else 'خیر').alignment = align_data
        ws.cell(row=row_idx, column=10, value=_format_datetime_shamsi(cp.created_at)).alignment = align_data

        for c in range(1, 11):
            ws.cell(row=row_idx, column=c).font = font_data

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    response = HttpResponse(buf.read(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response['Content-Disposition'] = 'attachment; filename="counterparties.xlsx"'
    return response


# -------------------------------------------------------------
# ۴. انتساب‌های سازمانی (User Section Assignments)
# -------------------------------------------------------------
ASSIGNMENT_COLUMNS = [
    {'title': 'نام کاربری', 'key': 'username', 'width': 18},
    {'title': 'نام و نام‌خانوادگی', 'key': 'full_name', 'width': 24},
    {'title': 'کد پروژه', 'key': 'project_code', 'width': 16},
    {'title': 'کد بخش', 'key': 'section_code', 'width': 16},
    {'title': 'نقش سازمانی', 'key': 'role', 'width': 18},
    {'title': 'عنوان نقش', 'key': 'role_display', 'width': 22},
    {'title': 'وضعیت فعال', 'key': 'is_active', 'width': 14},
    {'title': 'تاریخ انتساب', 'key': 'created_at', 'width': 22},
]

def export_assignments_excel(project_id=None, role=None, company_ids=None):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'ماتریس انتساب‌های سازمانی'
    _apply_2row_header(ws, ASSIGNMENT_COLUMNS, header_bg='6366F1')

    qs = UserSectionAssignment.objects.select_related('user', 'section', 'section__project').all()
    if company_ids is not None:
        qs = qs.filter(Q(section__project__company_id__in=company_ids) | Q(section__project__company__isnull=True))
    if project_id:
        try:
            qs = qs.filter(section__project_id=int(project_id))
        except (ValueError, TypeError):
            pass
    if role and role != 'all':
        qs = qs.filter(role=role)
    qs = qs.order_by('section__project__code', 'section__code', 'role')

    font_data = Font(name='B Nazanin', size=11)
    align_data = Alignment(horizontal='center', vertical='center')
    align_text = Alignment(horizontal='right', vertical='center')

    role_map = dict(UserSectionAssignment.ROLE_CHOICES)

    for row_idx, a in enumerate(qs, 3):
        u = a.user
        full_name = f"{u.first_name} {u.last_name}".strip() if u else '-'
        ws.cell(row=row_idx, column=1, value=u.username if u else '-').alignment = align_data
        ws.cell(row=row_idx, column=2, value=full_name).alignment = align_text
        ws.cell(row=row_idx, column=3, value=a.section.project.code if a.section and a.section.project else '-').alignment = align_data
        ws.cell(row=row_idx, column=4, value=a.section.code if a.section else '-').alignment = align_data
        ws.cell(row=row_idx, column=5, value=a.role).alignment = align_data
        ws.cell(row=row_idx, column=6, value=role_map.get(a.role, a.role)).alignment = align_data
        ws.cell(row=row_idx, column=7, value='بله' if a.is_active else 'خیر').alignment = align_data
        ws.cell(row=row_idx, column=8, value=_format_datetime_shamsi(a.created_at)).alignment = align_data

        for c in range(1, 9):
            ws.cell(row=row_idx, column=c).font = font_data

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    response = HttpResponse(buf.read(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response['Content-Disposition'] = 'attachment; filename="assignments_matrix.xlsx"'
    return response


# -------------------------------------------------------------
# دانلود قالب‌های آماده برای اکسل (Templates)
# -------------------------------------------------------------
def download_org_template(entity_type='counterparties'):
    wb = openpyxl.Workbook()
    ws = wb.active

    if entity_type == 'projects':
        ws.title = 'قالب پروژه‌ها'
        _apply_2row_header(ws, PROJECT_COLUMNS[:4], header_bg='4338CA')
        # ردیف نمونه
        ws.cell(row=3, column=1, value='PRJ-01')
        ws.cell(row=3, column=2, value='پروژه عملیات مرکزی')
        ws.cell(row=3, column=3, value='مدیریت کل عملیات و انبارها')
        ws.cell(row=3, column=4, value='بله')

        ws_lists = wb.create_sheet(title='Lists')
        ws_lists.sheet_view.rightToLeft = True
        ws_lists.cell(row=1, column=1, value='بله')
        ws_lists.cell(row=2, column=1, value='خیر')
        dv_active = DataValidation(type="list", formula1="Lists!$A$1:$A$2", allow_blank=True)
        ws.add_data_validation(dv_active)
        dv_active.add("D3:D500")

        filename = 'projects_template.xlsx'

    elif entity_type == 'sections':
        ws.title = 'قالب بخش‌ها'
        _apply_2row_header(ws, SECTION_COLUMNS[:5], header_bg='0D9488')
        ws.cell(row=3, column=1, value='PRJ-01')
        ws.cell(row=3, column=2, value='پروژه عملیات مرکزی')
        ws.cell(row=3, column=3, value='SEC-101')
        ws.cell(row=3, column=4, value='دپارتمان لجستیک و ترابری')
        ws.cell(row=3, column=5, value='بله')

        ws_lists = wb.create_sheet(title='Lists')
        ws_lists.sheet_view.rightToLeft = True
        ws_lists.cell(row=1, column=1, value='بله')
        ws_lists.cell(row=2, column=1, value='خیر')
        dv_active = DataValidation(type="list", formula1="Lists!$A$1:$A$2", allow_blank=True)
        ws.add_data_validation(dv_active)
        dv_active.add("E3:E500")

        filename = 'sections_template.xlsx'

    elif entity_type == 'assignments':
        ws.title = 'قالب انتساب پرسنل'
        _apply_2row_header(ws, ASSIGNMENT_COLUMNS[:7], header_bg='6366F1')
        ws.cell(row=3, column=1, value='admin')
        ws.cell(row=3, column=2, value='مدیر سیستم')
        ws.cell(row=3, column=3, value='PRJ-01')
        ws.cell(row=3, column=4, value='SEC-101')
        ws.cell(row=3, column=5, value='manager')
        ws.cell(row=3, column=6, value='مدیران پروژه')
        ws.cell(row=3, column=7, value='بله')

        ws_lists = wb.create_sheet(title='Lists')
        ws_lists.sheet_view.rightToLeft = True
        roles = [
            'مدیران پروژه',
            'حسابداران',
            'سرپرستان',
            'خزانه‌داران',
            'کارمندان',
        ]
        for idx, r in enumerate(roles, 1):
            ws_lists.cell(row=idx, column=1, value=r)
        ws_lists.cell(row=1, column=2, value='بله')
        ws_lists.cell(row=2, column=2, value='خیر')

        dv_role = DataValidation(type="list", formula1=f"Lists!$A$1:$A${len(roles)}", allow_blank=True)
        ws.add_data_validation(dv_role)
        dv_role.add("F3:F500")

        dv_active = DataValidation(type="list", formula1="Lists!$B$1:$B$2", allow_blank=True)
        ws.add_data_validation(dv_active)
        dv_active.add("G3:G500")

        filename = 'assignments_template.xlsx'

    else:
        ws.title = 'قالب طرف‌حساب‌ها'
        _apply_2row_header(ws, COUNTERPARTY_COLUMNS[:9], header_bg='059669')

        # ایجاد شیت دوم جهت نگهداری مقادیر کشویی (Data Validation Lists)
        ws_lists = wb.create_sheet(title='Lists')
        ws_lists.sheet_view.rightToLeft = True

        cp_types = [t[0] for t in COUNTERPARTY_TYPES_TUPLES]
        for idx, t in enumerate(cp_types, 1):
            ws_lists.cell(row=idx, column=1, value=t)

        for idx, b in enumerate(IRANIAN_BANKS_LIST, 1):
            ws_lists.cell(row=idx, column=2, value=b)

        for idx, yn in enumerate(BOOLEAN_LIST, 1):
            ws_lists.cell(row=idx, column=3, value=yn)

        # ۱. دراپ‌داون انتخاب نوع طرف‌حساب (ستون B سطر ۳ تا ۵۰۰)
        dv_type = DataValidation(type="list", formula1=f"Lists!$A$1:$A${len(cp_types)}", allow_blank=True)
        dv_type.error = 'لطفاً نوع طرف‌حساب را از میان گزینه‌های منوی کشویی انتخاب فرمایید.'
        dv_type.errorTitle = 'نوع طرف‌حساب نامعتبر'
        dv_type.prompt = 'نوع طرف‌حساب را از منوی کشویی انتخاب کنید.'
        dv_type.promptTitle = 'انتخاب نوع طرف‌حساب'
        ws.add_data_validation(dv_type)
        dv_type.add("B3:B500")

        # ۲. دراپ‌داون انتخاب نام بانک عامل (ستون E سطر ۳ تا ۵۰۰)
        dv_bank = DataValidation(type="list", formula1=f"Lists!$B$1:$B${len(IRANIAN_BANKS_LIST)}", allow_blank=True)
        dv_bank.error = 'لطفاً نام بانک عامل را از میان گزینه‌های منوی کشویی انتخاب فرمایید.'
        dv_bank.errorTitle = 'بانک نامعتبر'
        dv_bank.prompt = 'نام بانک عامل را از منوی کشویی انتخاب کنید.'
        dv_bank.promptTitle = 'انتخاب بانک عامل'
        ws.add_data_validation(dv_bank)
        dv_bank.add("E3:E500")

        # ۳. دراپ‌داون وضعیت فعال (ستون I سطر ۳ تا ۵۰۰)
        dv_active = DataValidation(type="list", formula1=f"Lists!$C$1:$C${len(BOOLEAN_LIST)}", allow_blank=True)
        dv_active.error = 'تنها گزینه‌های «بله» یا «خیر» مجاز است.'
        dv_active.errorTitle = 'ورودی نامعتبر'
        ws.add_data_validation(dv_active)
        dv_active.add("I3:I500")

        # ردیف ۳: ردیف نمونه اول (راننده / مالک خودرو)
        ws.cell(row=3, column=1, value='شرکت حمل‌ونقل پیشتاز')
        ws.cell(row=3, column=2, value='راننده / مالک خودرو')
        ws.cell(row=3, column=3, value='10101234567')
        ws.cell(row=3, column=4, value='09121111111')
        ws.cell(row=3, column=5, value='بانک ملت')
        ws.cell(row=3, column=6, value='0101111111001')
        ws.cell(row=3, column=7, value='060120000000000101111111')  # ۲۴ رقم عددی بدون IR
        ws.cell(row=3, column=8, value='110201')
        ws.cell(row=3, column=9, value='بله')

        # ردیف ۴: ردیف نمونه دوم (تعمیرگاه و قطعات)
        ws.cell(row=4, column=1, value='تعمیرگاه مرکزی ایران')
        ws.cell(row=4, column=2, value='تعمیرگاه و قطعات')
        ws.cell(row=4, column=3, value='14002345678')
        ws.cell(row=4, column=4, value='02188888888')
        ws.cell(row=4, column=5, value='بانک ملی ایران')
        ws.cell(row=4, column=6, value='0202222222002')
        ws.cell(row=4, column=7, value='170170000000000202222222')
        ws.cell(row=4, column=8, value='110202')
        ws.cell(row=4, column=9, value='بله')

        filename = 'counterparties_template.xlsx'

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    response = HttpResponse(buf.read(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


# -------------------------------------------------------------
# پارس و ورود دسته‌جمعی داده‌ها از فایل اکسل (Bulk Import با پشتیبانی از dry_run)
# -------------------------------------------------------------
def import_counterparties_from_excel(file_obj, dry_run=False, company_id=None):
    """
    خواندن و ثبت دسته‌جمعی طرف‌های حساب از اکسل با پشتیبانی از dry_run.
    company_id تهی (سوپریوزر): رفتار قبلی، تطبیق نام روی کل جدول.
    company_id داده‌شده: تطبیق و ساخت فقط در همان شرکت؛ طرف‌حساب سراسری یا شرکت دیگر دست نمی‌خورد.
    """
    try:
        wb = openpyxl.load_workbook(file_obj, data_only=True)
        ws = wb.active
    except Exception as e:
        return {
            'success': False,
            'dry_run': dry_run,
            'summary': {'total_rows': 0, 'valid_count': 0, 'error_count': 1, 'created': 0, 'updated': 0, 'skipped': 1},
            'errors': [{'row': 0, 'message': f'فایل اکسل نامعتبر یا آسیب‌دیده است: {str(e)}'}]
        }

    created = 0
    updated = 0
    errors = []

    # خواندن از ردیف ۳ به بعد (ردیف ۱ و ۲ هدر هستند)
    for row_idx in range(3, ws.max_row + 1):
        name = ws.cell(row=row_idx, column=1).value
        if not name or str(name).strip() == '':
            continue
        name = str(name).strip()

        raw_type = ws.cell(row=row_idx, column=2).value or 'other'
        cp_type = str(raw_type).strip().lower()
        if cp_type not in dict(Counterparty.TYPE_CHOICES):
            # تبدیل عناوین فارسی به کلید سیستمی
            f_map = {
                'راننده': 'driver', 'مالک خودرو': 'driver', 'راننده / مالک خودرو': 'driver',
                'راننده/مالک خودرو': 'driver',
                'تعمیرگاه': 'repair_shop', 'تعمیرگاه و قطعات': 'repair_shop',
                'جایگاه سوخت': 'fuel_station', 'بنزین': 'fuel_station',
                'پیمانکار': 'contractor', 'خدماتی': 'contractor', 'پیمانکار خدماتی': 'contractor',
                'سایر': 'other', 'سایر اشخاص حقیقی/حقوقی': 'other'
            }
            cp_type = f_map.get(cp_type, 'other')

        national_id = normalize_digits(str(ws.cell(row=row_idx, column=3).value or '')).strip()
        phone = normalize_digits(str(ws.cell(row=row_idx, column=4).value or '')).strip()
        bank_name = str(ws.cell(row=row_idx, column=5).value or '').strip()
        account_number = normalize_digits(str(ws.cell(row=row_idx, column=6).value or '')).strip()
        raw_sheba = normalize_digits(str(ws.cell(row=row_idx, column=7).value or '')).strip()
        sheba_number = raw_sheba.upper().replace('IR', '').strip()

        account_code = normalize_digits(str(ws.cell(row=row_idx, column=8).value or '')).strip()

        active_val = str(ws.cell(row=row_idx, column=9).value or 'بله').strip().lower()
        is_active = active_val not in ['خیر', 'false', '0', 'no']

        lookup = {'name': name}
        if company_id is not None:
            lookup['company_id'] = company_id
        try:
            exists = Counterparty.objects.filter(**lookup).exists()
            if dry_run:
                if exists:
                    updated += 1
                else:
                    created += 1
            else:
                with transaction.atomic():
                    defaults = {
                        'counterparty_type': cp_type,
                        'national_id': national_id or None,
                        'phone': phone or None,
                        'bank_name': bank_name or None,
                        'account_number': account_number or None,
                        'sheba_number': sheba_number or None,
                        'account_code': account_code or None,
                        'is_active': is_active
                    }
                    cp, is_new = Counterparty.objects.update_or_create(
                        **lookup,
                        defaults=defaults
                    )
                    if is_new:
                        created += 1
                    else:
                        updated += 1
        except Exception as e:
            errors.append(f"ردیف {row_idx} ({name}): {str(e)}")

    return {
        'success': len(errors) == 0,
        'dry_run': dry_run,
        'summary': {
            'total_rows': created + updated + len(errors),
            'valid_count': created + updated,
            'error_count': len(errors),
            'created': created,
            'updated': updated,
            'skipped': len(errors)
        },
        'errors': [{'row': idx, 'message': err} for idx, err in enumerate(errors, 1)]
    }


def import_projects_from_excel(file_obj, dry_run=False, company_id=None):
    """
    خواندن و ثبت دسته‌جمعی پروژه‌های مالی از اکسل با پشتیبانی از dry_run.
    company_id تهی (سوپریوزر): رفتار قبلی، تطبیق کد روی کل جدول.
    company_id داده‌شده: تطبیق و ساخت فقط در همان شرکت (کد پروژه در هر شرکت یکتاست).
    """
    try:
        wb = openpyxl.load_workbook(file_obj, data_only=True)
        ws = wb.active
    except Exception as e:
        return {
            'success': False,
            'dry_run': dry_run,
            'summary': {'total_rows': 0, 'created': 0, 'updated': 0, 'skipped': 0},
            'errors': [{'row': 0, 'message': f'فایل اکسل نامعتبر یا آسیب‌دیده است: {str(e)}'}]
        }

    created = 0
    updated = 0
    errors = []

    for row_idx in range(3, ws.max_row + 1):
        code = ws.cell(row=row_idx, column=1).value
        if not code or str(code).strip() == '':
            continue
        code = normalize_digits(str(code)).strip().upper()
        name = str(ws.cell(row=row_idx, column=2).value or '').strip()
        if not name:
            errors.append(f"ردیف {row_idx}: نام پروژه الزامی است.")
            continue
        desc = str(ws.cell(row=row_idx, column=3).value or '').strip()
        active_val = str(ws.cell(row=row_idx, column=4).value or 'بله').strip().lower()
        is_active = active_val not in ['خیر', 'false', '0', 'no']

        lookup = {'code': code}
        if company_id is not None:
            lookup['company_id'] = company_id
        try:
            exists = FinancialProject.objects.filter(**lookup).exists()
            if dry_run:
                if exists:
                    updated += 1
                else:
                    created += 1
            else:
                with transaction.atomic():
                    p, is_new = FinancialProject.objects.update_or_create(
                        **lookup,
                        defaults={'name': name, 'description': desc or None, 'is_active': is_active}
                    )
                    if is_new:
                        created += 1
                    else:
                        updated += 1
        except Exception as e:
            errors.append(f"ردیف {row_idx} ({code}): {str(e)}")

    return {
        'success': len(errors) == 0,
        'dry_run': dry_run,
        'summary': {
            'total_rows': created + updated + len(errors),
            'valid_count': created + updated,
            'error_count': len(errors),
            'created': created,
            'updated': updated,
            'skipped': len(errors)
        },
        'errors': [{'row': idx, 'message': err} for idx, err in enumerate(errors, 1)]
    }


def import_sections_from_excel(file_obj, dry_run=False, company_id=None):
    """
    خواندن و ثبت دسته‌جمعی بخش‌های پروژه از اکسل با پشتیبانی از dry_run.
    company_id داده‌شده: پروژهٔ مادر فقط از پروژه‌های همان شرکت پیدا می‌شود.
    """
    try:
        wb = openpyxl.load_workbook(file_obj, data_only=True)
        ws = wb.active
    except Exception as e:
        return {
            'success': False,
            'dry_run': dry_run,
            'summary': {'total_rows': 0, 'valid_count': 0, 'error_count': 1, 'created': 0, 'updated': 0, 'skipped': 1},
            'errors': [{'row': 0, 'message': f'فایل اکسل نامعتبر یا آسیب‌دیده است: {str(e)}'}]
        }

    created = 0
    updated = 0
    errors = []

    for row_idx in range(3, ws.max_row + 1):
        proj_code = ws.cell(row=row_idx, column=1).value
        if not proj_code or str(proj_code).strip() == '':
            continue
        proj_code = normalize_digits(str(proj_code)).strip().upper()
        proj_qs = FinancialProject.objects.filter(code=proj_code)
        if company_id is not None:
            proj_qs = proj_qs.filter(company_id=company_id)
        proj = proj_qs.first()
        if not proj:
            scope_hint = "در شرکت فعال " if company_id is not None else ""
            errors.append(f"ردیف {row_idx}: پروژه با کد «{proj_code}» {scope_hint}یافت نشد.")
            continue

        code = ws.cell(row=row_idx, column=3).value
        if not code or str(code).strip() == '':
            continue
        code = normalize_digits(str(code)).strip().upper()
        name = str(ws.cell(row=row_idx, column=4).value or '').strip()
        if not name:
            errors.append(f"ردیف {row_idx}: نام بخش الزامی است.")
            continue

        active_val = str(ws.cell(row=row_idx, column=5).value or 'بله').strip().lower()
        is_active = active_val not in ['خیر', 'false', '0', 'no']

        try:
            exists = ProjectSection.objects.filter(project=proj, code=code).exists()
            if dry_run:
                if exists:
                    updated += 1
                else:
                    created += 1
            else:
                with transaction.atomic():
                    s, is_new = ProjectSection.objects.update_or_create(
                        project=proj,
                        code=code,
                        defaults={'name': name, 'is_active': is_active}
                    )
                    if is_new:
                        created += 1
                    else:
                        updated += 1
        except Exception as e:
            errors.append(f"ردیف {row_idx} ({code}): {str(e)}")

    return {
        'success': len(errors) == 0,
        'dry_run': dry_run,
        'summary': {
            'total_rows': created + updated + len(errors),
            'valid_count': created + updated,
            'error_count': len(errors),
            'created': created,
            'updated': updated,
            'skipped': len(errors)
        },
        'errors': [{'row': idx, 'message': err} for idx, err in enumerate(errors, 1)]
    }


def import_assignments_from_excel(file_obj, dry_run=False, company_id=None, member_check=None, forbidden_user_id=None):
    """
    خواندن و ثبت دسته‌جمعی انتساب کاربران به بخش‌ها از اکسل با پشتیبانی از dry_run.
    company_id داده‌شده: بخش فقط از پروژه‌های همان شرکت پیدا می‌شود و کاربر باید از قبل عضو همان شرکت باشد
    (member_check)، چون عضویت بخش خودش دسترسی شرکت می‌دهد.
    forbidden_user_id: کاربری که نباید خودش را منتسب کند (راهبر تشکیلات).
    """
    try:
        wb = openpyxl.load_workbook(file_obj, data_only=True)
        ws = wb.active
    except Exception as e:
        return {
            'success': False,
            'dry_run': dry_run,
            'summary': {'total_rows': 0, 'valid_count': 0, 'error_count': 1, 'created': 0, 'updated': 0, 'skipped': 1},
            'errors': [{'row': 0, 'message': f'فایل اکسل نامعتبر یا آسیب‌دیده است: {str(e)}'}]
        }

    created = 0
    updated = 0
    errors = []

    role_keys = ['manager', 'accountant', 'supervisor', 'treasury', 'employee']
    role_fa_map = {
        'مدیر': 'manager', 'مدیران': 'manager', 'مدیر پروژه': 'manager',
        'حسابدار': 'accountant', 'حسابداران': 'accountant',
        'سرپرست': 'supervisor', 'سرپرستان': 'supervisor',
        'خزانه': 'treasury', 'خزانه‌دار': 'treasury', 'خزانه دار': 'treasury',
        'کارمند': 'employee', 'کارمندان': 'employee', 'اپراتور': 'employee'
    }

    for row_idx in range(3, ws.max_row + 1):
        raw_username = ws.cell(row=row_idx, column=1).value
        if not raw_username or str(raw_username).strip() == '':
            continue
        username = str(raw_username).strip()
        user = User.objects.filter(username=username).first()
        if not user:
            if company_id is not None:
                # همان پیام غیرعضو، تا وجود نام‌های کاربری بیرون از شرکت لو نرود
                errors.append(f"ردیف {row_idx}: کاربر «{username}» عضو شرکت فعال نیست یا یافت نشد.")
            else:
                errors.append(f"ردیف {row_idx}: کاربر با نام کاربری «{username}» یافت نشد.")
            continue
        if forbidden_user_id is not None and user.id == forbidden_user_id:
            errors.append(f"ردیف {row_idx}: انتساب خودتان را مدیر ارشد یا مدیر انجام می‌دهد، نه راهبر تشکیلات.")
            continue

        proj_code = normalize_digits(str(ws.cell(row=row_idx, column=3).value or '')).strip().upper()
        sec_code = normalize_digits(str(ws.cell(row=row_idx, column=4).value or '')).strip().upper()
        if not sec_code:
            errors.append(f"ردیف {row_idx}: کد بخش الزامی است.")
            continue

        sec_qs = ProjectSection.objects.filter(code=sec_code)
        if company_id is not None:
            sec_qs = sec_qs.filter(project__company_id=company_id)
        if proj_code:
            sec_qs = sec_qs.filter(project__code=proj_code)
        elif sec_qs.count() > 1:
            errors.append(f"ردیف {row_idx}: کد بخش «{sec_code}» بین چند پروژه مشترک است؛ درج کد پروژه الزامی است.")
            continue

        sec = sec_qs.first()
        if not sec:
            scope_hint = "در شرکت فعال " if company_id is not None else ""
            errors.append(f"ردیف {row_idx}: بخش با کد «{sec_code}» {scope_hint}یافت نشد.")
            continue

        if company_id is not None and member_check is not None and not member_check(user.id, company_id):
            errors.append(f"ردیف {row_idx}: کاربر «{username}» عضو شرکت فعال نیست یا یافت نشد.")
            continue

        raw_role = str(ws.cell(row=row_idx, column=5).value or 'employee').strip().lower()
        role = role_fa_map.get(raw_role, raw_role)
        if role not in role_keys:
            role = 'employee'

        active_val = str(ws.cell(row=row_idx, column=7).value or 'بله').strip().lower()
        is_active = active_val not in ['خیر', 'false', '0', 'no']

        try:
            exists = UserSectionAssignment.objects.filter(user=user, section=sec, role=role).exists()
            if dry_run:
                if exists:
                    updated += 1
                else:
                    created += 1
            else:
                with transaction.atomic():
                    a, is_new = UserSectionAssignment.objects.update_or_create(
                        user=user,
                        section=sec,
                        role=role,
                        defaults={'is_active': is_active}
                    )
                    if is_new:
                        created += 1
                    else:
                        updated += 1
        except Exception as e:
            errors.append(f"ردیف {row_idx} ({username}): {str(e)}")

    return {
        'success': len(errors) == 0,
        'dry_run': dry_run,
        'summary': {
            'total_rows': created + updated + len(errors),
            'valid_count': created + updated,
            'error_count': len(errors),
            'created': created,
            'updated': updated,
            'skipped': len(errors)
        },
        'errors': [{'row': idx, 'message': err} for idx, err in enumerate(errors, 1)]
    }
