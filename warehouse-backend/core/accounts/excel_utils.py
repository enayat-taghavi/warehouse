"""
ماژول ابزارهای اکسل هوشمند — کاربران (Users)
تولید فایل اکسل خروجی، فایل قالب نمونه، و خوانش/اعتبارسنجی پیشرفته فایل آپلودی
"""
import io
import re
from openpyxl import Workbook, load_workbook
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.workbook.defined_name import DefinedName
from common.excel_utils import (
    styled_cell, apply_header_styles_to_row, set_column_widths, 
    freeze_header_panes, find_data_start_and_mapping, jalali_now_str,
    sanitize_excel_cell, sanitize_excel_row
)
from django.http import HttpResponse
from django.contrib.auth.models import Group

from .models import CustomUser, CustomRole


# فاز ۲ §۲.۳ — حل اختیاری اپ انبار.
def _warehouse_model():
    """اگر اپ `warehouses` نصب است مدل `Warehouse` را برمی‌گرداند، وگرنه None."""
    from django.apps import apps
    if not apps.is_installed('warehouses'):
        return None
    from warehouses.models import Warehouse
    return Warehouse


# ── Column Definitions ──────────────────────────────────────────────
USERS_COLUMNS = [
    {'label': 'نام', 'key': 'first_name', 'width': 20, 'type': 'text'},
    {'label': 'نام خانوادگی', 'key': 'last_name', 'width': 20, 'type': 'text'},
    {'label': 'شناسه ورود', 'key': 'username', 'width': 20, 'type': 'text'},
    {'label': 'کد ملی', 'key': 'national_code', 'width': 18, 'type': 'text'},
    {'label': 'تلفن', 'key': 'phone_number', 'width': 18, 'type': 'text'},
    {'label': 'ایمیل', 'key': 'email', 'width': 25, 'type': 'text'},
    {'label': 'گروه خونی', 'key': 'blood_type', 'width': 14, 'type': 'text'},
    {'label': 'تماس اضطراری', 'key': 'emergency_contact', 'width': 18, 'type': 'text'},
    {'label': 'منطقه عملیاتی', 'key': 'operational_zone', 'width': 22, 'type': 'text'},
    {'label': 'شرکت متبوع', 'key': 'company', 'width': 22, 'type': 'text'},
    {'label': 'آدرس', 'key': 'address', 'width': 30, 'type': 'text'},
    {'label': 'نقش‌ها', 'key': 'roles', 'width': 30, 'type': 'text'},
    {'label': 'انبارها', 'key': 'warehouses', 'width': 30, 'type': 'text'},
    {'label': 'فعال', 'key': 'is_active', 'width': 12, 'type': 'text'},
]

ID_CARDS_COLUMNS = [
    {'label': 'نام', 'key': 'first_name', 'width': 18, 'type': 'text'},
    {'label': 'نام خانوادگی', 'key': 'last_name', 'width': 20, 'type': 'text'},
    {'label': 'کد پرسنلی / شناسه', 'key': 'username', 'width': 20, 'type': 'text'},
    {'label': 'کد ملی', 'key': 'national_code', 'width': 18, 'type': 'text'},
    {'label': 'تلفن تماس', 'key': 'phone_number', 'width': 18, 'type': 'text'},
    {'label': 'نقش سازمانی', 'key': 'roles', 'width': 25, 'type': 'text'},
    {'label': 'انبارها / پروژه‌های مجاز', 'key': 'warehouses', 'width': 28, 'type': 'text'},
    {'label': 'منطقه عملیاتی', 'key': 'operational_zone', 'width': 20, 'type': 'text'},
    {'label': 'شرکت متبوع', 'key': 'company', 'width': 20, 'type': 'text'},
    {'label': 'وضعیت تردد و گیت‌پاس', 'key': 'card_status', 'width': 22, 'type': 'text'},
    {'label': 'محتوای بارکد گیت‌پاس', 'key': 'barcode', 'width': 24, 'type': 'text'},
    {'label': 'تاریخ تهیه گزارش (شمسی)', 'key': 'report_date', 'width': 22, 'type': 'text'},
]

MAX_IMPORT_ROWS = 500


# ── Smart Data Cleaners & Normalizers ────────────────────────────────

PERSIAN_ARABIC_DIGITS = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')

def normalize_digits(text):
    """تبدیل ارقام فارسی و عربی به ارقام استاندارد انگلیسی"""
    if text is None:
        return ''
    return str(text).translate(PERSIAN_ARABIC_DIGITS).strip()

def normalize_phone(phone_str):
    """پاکسازی و استانداردسازی شماره تماس به قالب 09xxxxxxxxx"""
    if not phone_str:
        return None
    raw = normalize_digits(phone_str)
    digits = re.sub(r'[^\d+]', '', raw)
    if digits.startswith('+98'):
        digits = '0' + digits[3:]
    elif digits.startswith('0098'):
        digits = '0' + digits[4:]
    elif digits.startswith('98') and len(digits) == 12:
        digits = '0' + digits[2:]
    elif digits.startswith('9') and len(digits) == 10:
        digits = '0' + digits
    return digits if digits else None

def normalize_national_code(nid_str):
    """پاکسازی و افزودن صفرهای سمت چپ به کد ملی ۱۰ رقمی"""
    if not nid_str:
        return None
    raw = normalize_digits(nid_str)
    digits = re.sub(r'\D', '', raw)
    if not digits:
        return None
    if len(digits) < 10:
        digits = digits.zfill(10)
    return digits

def normalize_boolean(val_str, default=True):
    """تشخیص مقدار بولی از روی کلمات فارسی، انگلیسی و اعداد"""
    if val_str is None:
        return default
    s = normalize_digits(str(val_str)).lower().strip()
    if s in ('خیر', 'غیرفعال', 'نه', '0', 'no', 'false', 'f', 'off'):
        return False
    if s in ('بله', 'فعال', 'آره', '1', 'yes', 'true', 't', 'on', 'ok'):
        return True
    return default

def split_items(text):
    """تفکیک رشته با جداکننده‌های مختلف (ویرگول فارسی، انگلیسی، سمی‌کالن، اینتر)"""
    if not text:
        return []
    parts = re.split(r'[,،;\n|]+', str(text))
    return [p.strip() for p in parts if p.strip()]


def clean_persian_text(val):
    """
    نرمال‌سازی پیشرفته نویسه‌های فارسی/عربی و حذف کاراکترهای نامرئی
    """
    if val is None:
        return ''
    s = str(val)
    # 1. تبدیل ی و ک عربی به فارسی
    s = s.replace('ي', 'ی').replace('ك', 'ک')
    # 2. حذف کاراکترهای با عرض صفر، فاصله‌های نامرئی و BOM
    s = re.sub(r'[​‍‎‏﻿]', '', s)  # حفظ نیم‌فاصله
    s = re.sub(r'‌+', '‌', s)
    # 3. حذف کشیدگی حروف (تطویل)
    s = s.replace('ـ', '')
    # 4. یکپارچه‌سازی فاصله‌های متوالی
    s = re.sub(r'\s+', ' ', s)
    return s.strip()


# ── Excel Export & Template ──────────────────────────────────────────

def generate_users_excel(queryset):
    """
    تولید فایل اکسل استاندارد دو سطری از لیست کاربران
    """
    wb = Workbook()
    ws = wb.active
    ws.title = 'کاربران'
    ws.sheet_view.rightToLeft = True

    set_column_widths(ws, USERS_COLUMNS)
    freeze_header_panes(ws, row=3)

    # سطر اول: عناوین فارسی
    header_row = []
    for c in USERS_COLUMNS:
        header_row.append(styled_cell(ws, c['label']))
    apply_header_styles_to_row(header_row, is_key_row=False)
    ws.append(header_row)

    # سطر دوم: کلیدهای دیتابیسی
    key_row = []
    for c in USERS_COLUMNS:
        key_row.append(styled_cell(ws, c['key']))
    apply_header_styles_to_row(key_row, is_key_row=True)
    ws.append(key_row)

    # سطر سوم به بعد: داده‌های کاربران
    for row_idx, user in enumerate(queryset, 3):
        role_names = []
        for g in user.groups.all():
            try:
                role_names.append(g.customrole.title or g.name)
            except Exception:
                role_names.append(g.name)
        roles_str = '، '.join(role_names)

        wh_items = []
        # فاز ۲ §۲.۳ — اکسسور `user.assigned_warehouses` فقط در نصب دارای اپ
        # انبار وجود دارد؛ در حسابداری‌تنها این ستون خالی می‌ماند.
        if _warehouse_model() is not None:
            for w in user.assigned_warehouses.all():
                wh_items.append(f"{w.name} ({w.code})" if w.code else w.name)
        wh_str = '، '.join(wh_items)

        row_data = [
            user.first_name or '',
            user.last_name or '',
            user.username or '',
            user.national_code or '',
            user.phone_number or '',
            user.email or '',
            user.blood_type or '',
            user.emergency_contact or '',
            user.operational_zone or '',
            user.company or '',
            user.address or '',
            roles_str,
            wh_str,
            'بله' if user.is_active else 'خیر',
        ]
        ws.append(sanitize_excel_row(row_data))

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    response = HttpResponse(
        buffer.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    response['Content-Disposition'] = 'attachment; filename="users_export.xlsx"'
    return response


def generate_id_cards_excel(queryset):
    """
    تولید فایل اکسل مشخصات کارت پرسنلی و گیت‌پاس با ساختار ۲ سطری استاندارد
    """
    wb = Workbook()
    ws = wb.active
    ws.title = 'کارت پرسنلی و گیت‌پاس'
    ws.sheet_view.rightToLeft = True

    set_column_widths(ws, ID_CARDS_COLUMNS)
    freeze_header_panes(ws, row=3)

    # سطر اول: عناوین فارسی
    header_row = []
    for c in ID_CARDS_COLUMNS:
        header_row.append(styled_cell(ws, c['label']))
    apply_header_styles_to_row(header_row, is_key_row=False)
    ws.append(header_row)

    # سطر دوم: کلیدهای دیتابیسی
    key_row = []
    for c in ID_CARDS_COLUMNS:
        key_row.append(styled_cell(ws, c['key']))
    apply_header_styles_to_row(key_row, is_key_row=True)
    ws.append(key_row)

    now_shamsi = jalali_now_str()

    # سطر سوم به بعد: داده‌های کارت پرسنلی
    for row_idx, user in enumerate(queryset, 3):
        role_names = []
        for g in user.groups.all():
            try:
                role_names.append(g.customrole.title or g.name)
            except Exception:
                role_names.append(g.name)
        roles_str = '، '.join(role_names)

        wh_items = []
        if _warehouse_model() is not None:
            for w in user.assigned_warehouses.all():
                wh_items.append(f"{w.name} ({w.code})" if w.code else w.name)
        wh_str = '، '.join(wh_items)

        barcode_str = f"GP-{user.username or user.pk}"
        if user.national_code:
            barcode_str += f"-{user.national_code}"

        row_data = [
            user.first_name or '',
            user.last_name or '',
            user.username or '',
            user.national_code or '',
            user.phone_number or '',
            roles_str,
            wh_str,
            user.operational_zone or '',
            user.company or '',
            'فعال / مجاز به تردد' if user.is_active else 'مسدود / غیرمجاز',
            barcode_str,
            now_shamsi,
        ]
        ws.append(sanitize_excel_row(row_data))

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    response = HttpResponse(
        buffer.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    response['Content-Disposition'] = 'attachment; filename="id_cards_export.xlsx"'
    return response


def generate_users_template():
    """
    تولید فایل قالب نمونه دو سطری پویا با اعتبارسنجی درون اکسل متصل به دیتابیس زنده،
    شیت دوم راهنما و مقادیر مجاز، و شیت سوم مراجع داده
    """
    wb = Workbook()
    ws = wb.active
    ws.title = 'قالب کاربران'
    ws.sheet_view.rightToLeft = True

    set_column_widths(ws, USERS_COLUMNS)
    freeze_header_panes(ws, row=3)

    # سطر اول: عناوین فارسی
    header_row = []
    for c in USERS_COLUMNS:
        header_row.append(styled_cell(ws, c['label']))
    apply_header_styles_to_row(header_row, is_key_row=False)
    ws.append(header_row)

    # سطر دوم: کلیدهای دیتابیسی
    key_row = []
    for c in USERS_COLUMNS:
        key_row.append(styled_cell(ws, c['key']))
    apply_header_styles_to_row(key_row, is_key_row=True)
    ws.append(key_row)

    # ۱. استخراج داده‌های زنده از پایگاه داده
    # الف) نقش‌های فعال همراه با گزینه «همه نقش‌ها»
    roles_qs = CustomRole.objects.all().order_by('title', 'name')
    role_titles = [r.title or r.name for r in roles_qs if (r.title or r.name)]
    if not role_titles:
        role_titles = ['کاربر عادی', 'سرپرست انبار', 'مدیر سیستم']
    dropdown_roles = ['همه نقش‌ها'] + [r for r in role_titles if r != 'همه نقش‌ها']

    # ب) انبارهای فعال همراه با گزینه «همه انبارها»
    wh_names = []
    WhModel = _warehouse_model()
    if WhModel is not None:
        wh_names = [w.name for w in WhModel.objects.all().order_by('name') if w.name and w.name.strip()]
    if not wh_names:
        wh_names = ['انبار مرکزی']
    dropdown_warehouses = ['همه انبارها'] + [w for w in wh_names if w != 'همه انبارها']

    # ج) گروه‌های خونی
    blood_types = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']

    # د) وضعیت فعال
    active_statuses = ['بله', 'خیر']

    # ه) شرکت‌های متبوع
    companies = list(CustomUser.objects.exclude(company__isnull=True).exclude(company__exact='').values_list('company', flat=True).distinct())
    companies = [c.strip() for c in companies if c and c.strip()]
    if not companies:
        companies = ['شرکت اصلی', 'پیمانکار']

    # و) مناطق عملیاتی
    zones = list(CustomUser.objects.exclude(operational_zone__isnull=True).exclude(operational_zone__exact='').values_list('operational_zone', flat=True).distinct())
    zones = [z.strip() for z in zones if z and z.strip()]
    if not zones:
        zones = ['منطقه ۱ - جنوب', 'منطقه ۲ - مرکز', 'منطقه ۳ - شمال']

    # ۲. درج داده‌های نمونه پویا
    sample_role_1 = role_titles[0]
    sample_role_2 = 'همه نقش‌ها'
    sample_wh_1 = wh_names[0]
    sample_wh_2 = 'همه انبارها'

    sample_data = [
        ['علی', 'محمدی', 'ali.mohammadi', '1234567890', '09121234567', 'ali@example.com', 'O+', '09129998877', zones[0], companies[0], 'تهران، خیابان ولیعصر', sample_role_1, sample_wh_1, 'بله'],
        ['فاطمه', 'احمدی', '', '0987654321', '09351234567', 'fatemeh@example.com', 'A+', '09359998877', zones[1] if len(zones) > 1 else zones[0], companies[1] if len(companies) > 1 else companies[0], 'شیراز، بلوار ارم', sample_role_2, sample_wh_2, 'بله'],
    ]

    for row in sample_data:
        ws.append(sanitize_excel_row(row))

    # ۳. شیت دوم: راهنما، ضوابط و مقادیر مجاز (Help Sheet)
    ws_help = wb.create_sheet(title='راهنما و مقادیر مجاز')
    ws_help.sheet_view.rightToLeft = True

    HELP_COLUMNS = [
        {'label': 'نام ستون', 'key': 'col_name', 'width': 22, 'type': 'text'},
        {'label': 'الزامی / اختیاری', 'key': 'required', 'width': 18, 'type': 'text'},
        {'label': 'فرمت و ضوابط', 'key': 'rules', 'width': 48, 'type': 'text'},
        {'label': 'نمونه مقدار معتبر', 'key': 'sample', 'width': 25, 'type': 'text'},
    ]
    set_column_widths(ws_help, HELP_COLUMNS)
    freeze_header_panes(ws_help, row=3)

    h_row = [styled_cell(ws_help, c['label']) for c in HELP_COLUMNS]
    apply_header_styles_to_row(h_row, is_key_row=False)
    ws_help.append(h_row)

    k_row = [styled_cell(ws_help, c['key']) for c in HELP_COLUMNS]
    apply_header_styles_to_row(k_row, is_key_row=True)
    ws_help.append(k_row)

    help_rules = [
        ['نام (first_name)', 'الزامی', 'متن بدون کاراکترهای خاص', 'علی'],
        ['نام خانوادگی (last_name)', 'الزامی', 'متن بدون کاراکترهای خاص', 'محمدی'],
        ['شناسه ورود (username)', 'اختیاری', 'در صورت خالی بودن، به طور خودکار از «کد ملی» استفاده می‌شود', 'ali.mohammadi یا 0012345678'],
        ['کد ملی (national_code)', 'اختیاری / توصیه‌شده', 'دقیقاً ۱۰ رقم عددی بدون خط تیره (جهت تولید شناسه و رمز عبور اولیه)', '1234567890'],
        ['تلفن (phone_number)', 'اختیاری', '۱۱ رقم عددی همراه با ۰۹', '09121234567'],
        ['ایمیل (email)', 'اختیاری', 'آدرس ایمیل معتبر استاندارد', 'ali@example.com'],
        ['گروه خونی (blood_type)', 'اختیاری', 'انتخاب از منوی کشویی: O+, A+, B+, AB-, ...', 'O+'],
        ['تماس اضطراری (emergency_contact)', 'اختیاری', 'شماره تماس بستگان یا رابط اضطراری', '09129998877'],
        ['منطقه عملیاتی (operational_zone)', 'اختیاری', 'انتخاب از منوی کشویی یا تایپ عنوان دلخواه', 'منطقه ۱ - جنوب'],
        ['شرکت متبوع (company)', 'اختیاری', 'انتخاب از منوی کشویی یا تایپ نام شرکت دلخواه', 'پیمانکار فارس عالیش'],
        ['آدرس (address)', 'اختیاری', 'آدرس پستی یا محل سکونت', 'تهران، خیابان ولیعصر'],
        ['نقش‌ها (roles)', 'اختیاری', 'انتخاب از منوی کشویی: «همه نقش‌ها» جهت انتساب کلیه نقش‌ها، یا انتخاب نقش‌های مجزا (تفکیک با «،»)', 'همه نقش‌ها'],
        ['انبارها (warehouses)', 'اختیاری', 'انتخاب از منوی کشویی: «همه انبارها» جهت دسترسی به تمامی انبارها، یا انتخاب انبار مشخص (تفکیک با «،»)', 'همه انبارها'],
        ['فعال (is_active)', 'الزامی', 'انتخاب از منوی کشویی: بله یا خیر', 'بله'],
    ]
    for r in help_rules:
        ws_help.append(r)

    ws_help.append([])
    ws_help.append([])

    # جدول مرجع نقش‌های فعال در راهنما
    roles_h = [styled_cell(ws_help, 'عنوان فارسی نقش'), styled_cell(ws_help, 'نام انگلیسی سیستمی'), styled_cell(ws_help, 'توضیحات')]
    apply_header_styles_to_row(roles_h, is_key_row=False)
    ws_help.append(roles_h)
    ws_help.append(['همه نقش‌ها', 'ALL_ROLES', 'تخصیص کلیه نقش‌های فعال سیستم'])
    for g in Group.objects.all():
        cr = getattr(g, 'customrole', None)
        title = cr.title if cr and cr.title else g.name
        ws_help.append([title, g.name, 'نقش سازمانی فعال'])

    ws_help.append([])
    ws_help.append([])

    # جدول مرجع انبارهای فعال در راهنما
    whs_h = [styled_cell(ws_help, 'نام انبار'), styled_cell(ws_help, 'کد انبار'), styled_cell(ws_help, 'وضعیت')]
    apply_header_styles_to_row(whs_h, is_key_row=False)
    ws_help.append(whs_h)
    ws_help.append(['همه انبارها', 'ALL_WAREHOUSES', 'دسترسی مجاز به کلیه انبارهای فعال سیستم'])
    if WhModel is not None:
        for wh in WhModel.objects.all():
            ws_help.append([wh.name, wh.code or '', 'فعال'])

    # ۴. شیت سوم: مراجع داده (Data References) - مخفی‌سازی کامل شیت جهت عدم نمایش ستون‌های اضافی به کاربر
    ws_ref = wb.create_sheet(title='مراجع داده')
    ws_ref.sheet_state = 'hidden'
    ws_ref.sheet_view.rightToLeft = True

    REF_HEADERS = ['نقش‌های فعال', 'انبارهای فعال', 'گروه خونی', 'وضعیت فعال', 'شرکت‌های ثبت‌شده', 'مناطق عملیاتی']
    ref_h_row = [styled_cell(ws_ref, h) for h in REF_HEADERS]
    apply_header_styles_to_row(ref_h_row, is_key_row=False)
    ws_ref.append(ref_h_row)

    max_ref_len = max(len(dropdown_roles), len(dropdown_warehouses), len(blood_types), len(active_statuses), len(companies), len(zones))
    for r_idx in range(max_ref_len):
        row_vals = [
            dropdown_roles[r_idx] if r_idx < len(dropdown_roles) else '',
            dropdown_warehouses[r_idx] if r_idx < len(dropdown_warehouses) else '',
            blood_types[r_idx] if r_idx < len(blood_types) else '',
            active_statuses[r_idx] if r_idx < len(active_statuses) else '',
            companies[r_idx] if r_idx < len(companies) else '',
            zones[r_idx] if r_idx < len(zones) else ''
        ]
        ws_ref.append(row_vals)

    set_column_widths(ws_ref, [
        {'width': 26},
        {'width': 26},
        {'width': 14},
        {'width': 14},
        {'width': 26},
        {'width': 26}
    ])
    freeze_header_panes(ws_ref, row=2)

    # تعریف دامنه‌های نام‌گذاری‌شده در ورک‌بوک
    wb.defined_names['RolesList'] = DefinedName('RolesList', attr_text=f"'مراجع داده'!$A$2:$A${len(dropdown_roles)+1}")
    wb.defined_names['WarehousesList'] = DefinedName('WarehousesList', attr_text=f"'مراجع داده'!$B$2:$B${len(dropdown_warehouses)+1}")
    wb.defined_names['BloodTypesList'] = DefinedName('BloodTypesList', attr_text=f"'مراجع داده'!$C$2:$C${len(blood_types)+1}")
    wb.defined_names['ActiveStatusList'] = DefinedName('ActiveStatusList', attr_text=f"'مراجع داده'!$D$2:$D${len(active_statuses)+1}")
    wb.defined_names['CompaniesList'] = DefinedName('CompaniesList', attr_text=f"'مراجع داده'!$E$2:$E${len(companies)+1}")
    wb.defined_names['ZonesList'] = DefinedName('ZonesList', attr_text=f"'مراجع داده'!$F$2:$F${len(zones)+1}")

    # ۵. الصاق اعتبارسنجی‌های کشویی (Data Validations) به شیت اول
    # گروه خونی (ستون G)
    dv_blood = DataValidation(type="list", formula1='=BloodTypesList', allow_blank=True)
    dv_blood.error = 'لطفاً یکی از گروه‌های خونی استاندارد (مانند O+، A+، B- و ...) را انتخاب کنید.'
    dv_blood.errorTitle = 'گروه خونی نامعتبر'
    dv_blood.prompt = 'گروه خونی را از منوی کشویی انتخاب کنید'
    dv_blood.promptTitle = 'گروه خونی'
    dv_blood.showErrorMessage = True
    ws.add_data_validation(dv_blood)
    dv_blood.add("G3:G500")

    # منطقه عملیاتی (ستون I)
    dv_zone = DataValidation(type="list", formula1='=ZonesList', allow_blank=True)
    dv_zone.prompt = 'منطقه عملیاتی را از منوی کشویی انتخاب کنید یا عنوان دلخواه وارد نمایید.'
    dv_zone.promptTitle = 'منطقه عملیاتی'
    dv_zone.showErrorMessage = False
    ws.add_data_validation(dv_zone)
    dv_zone.add("I3:I500")

    # شرکت متبوع (ستون J)
    dv_comp = DataValidation(type="list", formula1='=CompaniesList', allow_blank=True)
    dv_comp.prompt = 'شرکت متبوع را از منوی کشویی انتخاب کنید یا عنوان دلخواه وارد نمایید.'
    dv_comp.promptTitle = 'شرکت متبوع'
    dv_comp.showErrorMessage = False
    ws.add_data_validation(dv_comp)
    dv_comp.add("J3:J500")

    # نقش‌ها (ستون L)
    dv_roles = DataValidation(type="list", formula1='=RolesList', allow_blank=True)
    dv_roles.prompt = 'نقش سازمانی را از منوی کشویی انتخاب کنید. برای چند نقش، با ویرگول (،) تفکیک نمایید.'
    dv_roles.promptTitle = 'نقش سازمانی'
    dv_roles.showErrorMessage = False
    ws.add_data_validation(dv_roles)
    dv_roles.add("L3:L500")

    # انبارها (ستون M)
    dv_wh = DataValidation(type="list", formula1='=WarehousesList', allow_blank=True)
    dv_wh.prompt = 'انبار مجاز را از منوی کشویی انتخاب کنید. برای چند انبار، با ویرگول (،) تفکیک نمایید.'
    dv_wh.promptTitle = 'انبار مجاز'
    dv_wh.showErrorMessage = False
    ws.add_data_validation(dv_wh)
    dv_wh.add("M3:M500")

    # وضعیت فعال (ستون N)
    dv_active = DataValidation(type="list", formula1='=ActiveStatusList', allow_blank=True)
    dv_active.error = 'مقدار فیلد فعال باید «بله» یا «خیر» باشد.'
    dv_active.errorTitle = 'مقدار نامعتبر'
    dv_active.prompt = 'وضعیت حساب کاربری را انتخاب کنید'
    dv_active.promptTitle = 'وضعیت فعال/غیرفعال'
    dv_active.showErrorMessage = True
    ws.add_data_validation(dv_active)
    dv_active.add("N3:N500")

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    response = HttpResponse(
        buffer.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    response['Content-Disposition'] = 'attachment; filename="users_template.xlsx"'
    return response


# ── Smart Excel Parser ───────────────────────────────────────────────

def parse_users_excel(file, update_existing=False):
    """
    پارس و اعتبارسنجی هوشمند فایل اکسل کاربران
    - پشتیبانی از تطبیق دوگانه نقش‌ها (عنوان فارسی و نام انگلیسی)
    - پشتیبانی از تطبیق دوگانه انبارها (کد و نام انبار)
    - پاکسازی خودکار ارقام و کد ملی و تلفن
    - پشتیبانی از پارامتر update_existing
    """
    try:
        wb = load_workbook(file, read_only=True, data_only=True)
    except Exception:
        return {'valid_rows': [], 'errors': [{'row': 0, 'field': 'file', 'message': 'فایل اکسل معتبر نیست یا قابل خواندن نمی‌باشد.'}]}

    ws = wb.active
    data_start_row, col_mapping = find_data_start_and_mapping(ws, USERS_COLUMNS)
    rows = list(ws.iter_rows(min_row=data_start_row, values_only=True))

    if len(rows) > MAX_IMPORT_ROWS:
        return {'valid_rows': [], 'errors': [{'row': 0, 'field': 'file', 'message': f'حداکثر {MAX_IMPORT_ROWS} سطر قابل پردازش است. فایل شما {len(rows)} سطر دارد.'}]}

    # ساخت مپ‌های جستجوی هوشمند
    existing_users_by_username = {u.username.lower(): u for u in CustomUser.objects.all()}
    existing_users_by_nid = {
        u.national_code: u for u in CustomUser.objects.exclude(national_code__isnull=True).exclude(national_code='')
    }

    # نقشه نقش‌ها: هم بر اساس name (کد انگلیسی) و هم بر اساس title (عنوان فارسی)
    roles_lookup = {}
    for group in Group.objects.all():
        roles_lookup[group.name.lower().strip()] = group
        try:
            cr = group.customrole
            if cr.title:
                roles_lookup[cr.title.lower().strip()] = group
        except Exception:
            pass

    # نقشه انبارها: هم بر اساس code و هم بر اساس name
    warehouses_lookup = {}
    WhModel = _warehouse_model()
    if WhModel is not None:
        for wh in WhModel.objects.all():
            if wh.code:
                warehouses_lookup[wh.code.lower().strip()] = wh
            if wh.name:
                warehouses_lookup[wh.name.lower().strip()] = wh
                # حالت ترکیبی نام و کد مثل "انبار مرکزی (WH-1)"
                if wh.code:
                    warehouses_lookup[f"{wh.name.lower().strip()} ({wh.code.lower().strip()})"] = wh

    valid_rows = []
    errors = []
    seen_usernames = set()
    seen_national_codes = set()

    for idx, row in enumerate(rows):
        row_num = idx + data_start_row

        if not row or all(cell is None or str(cell).strip() == '' for cell in row):
            continue

        row = list(row) + [None] * (len(USERS_COLUMNS) - len(row))

        def get_val(key, default_idx, default=''):
            idx_pos = col_mapping.get(key, default_idx)
            if idx_pos < len(row) and row[idx_pos] is not None:
                return str(row[idx_pos]).strip()
            return default

        first_name = clean_persian_text(get_val('first_name', 0))
        last_name = clean_persian_text(get_val('last_name', 1))
        username = normalize_digits(get_val('username', 2)).strip()
        raw_nid = get_val('national_code', 3)
        national_code = normalize_national_code(raw_nid)
        phone_number = normalize_phone(get_val('phone_number', 4))
        email = get_val('email', 5)
        blood_type = get_val('blood_type', 6)
        emergency_contact = normalize_phone(get_val('emergency_contact', 7))
        operational_zone = clean_persian_text(get_val('operational_zone', 8))
        company = clean_persian_text(get_val('company', 9))
        address = clean_persian_text(get_val('address', 10))
        roles_str = clean_persian_text(get_val('roles', 11))
        warehouses_str = clean_persian_text(get_val('warehouses', 12))
        is_active_str = get_val('is_active', 13, 'بله')
        is_active = normalize_boolean(is_active_str, default=True)

        row_errors = []

        # ── فیلدهای اجباری ──
        if not first_name:
            row_errors.append({'row': row_num, 'field': 'first_name', 'message': 'نام الزامی است.'})
        if not last_name:
            row_errors.append({'row': row_num, 'field': 'last_name', 'message': 'نام خانوادگی الزامی است.'})

        # قانون هوشمند: در صورت خالی بودن شناسه ورود، الزاماً از کد ملی استفاده شود
        if not username:
            if national_code:
                username = national_code
            else:
                row_errors.append({
                    'row': row_num,
                    'field': 'username',
                    'message': 'شناسه ورود الزامی است (یا کد ملی جهت تولید خودکار شناسه باید درج شود).'
                })

        # ── یکتایی و اعتبارسنجی شناسه ورود ──
        is_update_record = False
        target_user_id = None

        if username:
            if ' ' in username:
                row_errors.append({'row': row_num, 'field': 'username', 'message': 'شناسه ورود نباید شامل فاصله باشد.'})
            elif username in seen_usernames:
                row_errors.append({'row': row_num, 'field': 'username', 'message': 'این شناسه ورود در همین فایل تکرار شده است.'})
            else:
                existing_user = existing_users_by_username.get(username.lower())
                if existing_user:
                    if update_existing:
                        is_update_record = True
                        target_user_id = existing_user.id
                    else:
                        row_errors.append({'row': row_num, 'field': 'username', 'message': 'این شناسه ورود قبلاً در سیستم ثبت شده است.'})
                seen_usernames.add(username)

        # ── اعتبارسنجی کد ملی ──
        if national_code:
            if not national_code.isdigit() or len(national_code) != 10:
                row_errors.append({'row': row_num, 'field': 'national_code', 'message': 'کد ملی باید ۱۰ رقم عددی باشد.'})
            elif national_code in seen_national_codes:
                row_errors.append({'row': row_num, 'field': 'national_code', 'message': 'این کد ملی در همین فایل تکرار شده است.'})
            else:
                nid_user = existing_users_by_nid.get(national_code)
                if nid_user:
                    if not update_existing or (is_update_record and nid_user.id != target_user_id):
                        row_errors.append({'row': row_num, 'field': 'national_code', 'message': 'این کد ملی به کاربر دیگری تخصیص دارد.'})
                seen_national_codes.add(national_code)

        # ── اعتبارسنجی فرمت ایمیل ──
        if email:
            from django.core.validators import validate_email as django_validate_email
            from django.core.exceptions import ValidationError as DjangoValidationError
            try:
                django_validate_email(email)
            except DjangoValidationError:
                row_errors.append({'row': row_num, 'field': 'email', 'message': f'فرمت آدرس ایمیل «{email}» نامعتبر است.'})

        # ── تطبیق هوشمند نقش‌ها (پشتیبانی از گزینه «همه نقش‌ها») ──
        ALL_ROLES_ALIASES = {'همه نقش‌ها', 'همه نقش ها', 'همه نقشها', 'همه', 'all', 'all roles', 'all_roles'}
        ALL_WHS_ALIASES = {'همه انبارها', 'همه انبار ها', 'همه انبارها', 'همه', 'all', 'all warehouses', 'all_warehouses'}

        resolved_roles = []
        if roles_str:
            role_items = split_items(roles_str)
            has_all_roles = any(r.lower().strip() in ALL_ROLES_ALIASES for r in role_items)
            if has_all_roles:
                for group in Group.objects.all():
                    if group not in resolved_roles:
                        resolved_roles.append(group)
            else:
                for rname in role_items:
                    matched_role = roles_lookup.get(rname.lower())
                    if not matched_role:
                        row_errors.append({'row': row_num, 'field': 'roles', 'message': f'نقش «{rname}» در سیستم یافت نشد.'})
                    elif matched_role not in resolved_roles:
                        resolved_roles.append(matched_role)

        # ── تطبیق هوشمند انبارها (پشتیبانی از گزینه «همه انبارها») ──
        resolved_warehouses = []
        if warehouses_str:
            wh_items = split_items(warehouses_str)
            has_all_whs = any(w.lower().strip() in ALL_WHS_ALIASES for w in wh_items)
            if has_all_whs and WhModel is not None:
                for wh in WhModel.objects.all():
                    if wh not in resolved_warehouses:
                        resolved_warehouses.append(wh)
            else:
                for witem in wh_items:
                    matched_wh = warehouses_lookup.get(witem.lower())
                    if not matched_wh:
                        paren_match = re.search(r'\(([^)]+)\)', witem)
                        if paren_match:
                            matched_wh = warehouses_lookup.get(paren_match.group(1).lower().strip())
                    if not matched_wh:
                        row_errors.append({'row': row_num, 'field': 'warehouses', 'message': f'انبار «{witem}» در سیستم یافت نشد.'})
                    elif matched_wh not in resolved_warehouses:
                        resolved_warehouses.append(matched_wh)

        if row_errors:
            errors.extend(row_errors)
        else:
            valid_rows.append({
                '_row_num': row_num,
                'is_update': is_update_record,
                'user_id': target_user_id,
                'first_name': first_name,
                'last_name': last_name,
                'username': username,
                'national_code': national_code or None,
                'phone_number': phone_number or None,
                'email': email or '',
                'blood_type': blood_type or None,
                'emergency_contact': emergency_contact or None,
                'operational_zone': operational_zone or None,
                'company': company or None,
                'address': address or None,
                'is_active': is_active,
                'roles': resolved_roles,
                'warehouses': resolved_warehouses,
            })

    wb.close()
    return {'valid_rows': valid_rows, 'errors': errors}
