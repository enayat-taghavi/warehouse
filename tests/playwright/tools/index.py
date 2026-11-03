"""
Index page generator for the training videos (plan §3.5): Documents/Training_Videos/videos/index.html
Generates a modern, world-class, responsive Persian (RTL) video hub with comprehensive textual descriptions,
learning topics, roles, pro-tips, desktop/mobile players, real-time search, filters, and offline support.

Run:
    tests/playwright/.venv-tools/Scripts/python tests/playwright/tools/index.py
"""
import html
import json
import re
import sys
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

try:
    from media import duration_ms
except ImportError:
    duration_ms = None

ROOT = Path(__file__).resolve().parents[1]
VIDEOS = ROOT.parents[1] / 'Documents' / 'Training_Videos' / 'videos'
SCENARIOS = ROOT / 'scenarios'

# Pre-computed durations in milliseconds for fast generation (fallback to ffmpeg if not present)
PRECOMPUTED_DURATIONS = {
    "00-intro": {"desktop": 111000, "mobile": 109000},
    "01-users-company": {"desktop": 416000, "mobile": 320000},
    "02-accounting-setup": {"desktop": 203000, "mobile": 175000},
    "03a-invoice-record": {"desktop": 174000, "mobile": 141000},
    "03b-invoice-approvals": {"desktop": 160000, "mobile": 139000},
    "03c-invoice-payment": {"desktop": 129000, "mobile": 110000},
    "04a-petty-account-charge": {"desktop": 200000, "mobile": 173000},
    "04b-petty-statement": {"desktop": 226000, "mobile": 188000},
    "04c-petty-close": {"desktop": 165000, "mobile": 149000},
    "05-personnel-file": {"desktop": 288000, "mobile": 251000},
    "06-attendance": {"desktop": 265000, "mobile": 224000},
    "07-payroll": {"desktop": 214000, "mobile": 190000},
    "08-fleet": {"desktop": 344000, "mobile": 275000},
    "09-reports": {"desktop": 112000, "mobile": 108000},
    "10-common-tasks": {"desktop": 192000, "mobile": 165000},
}

# Comprehensive metadata, descriptions, key learning outcomes, roles, and pro-tips for all 15 episodes
EPISODE_METADATA = {
    "00-intro": {
        "category": "پایه و دسترسی",
        "category_id": "setup",
        "icon": "home",
        "summary": "آشنایی اولیه با محیط سامانه جامع مالی و انبار، نحوه ورود امن، کاوش در ماژول‌ها و ابزارهای پرکاربرد، مدیریت پروفایل کاربری و کار با کارتابل متمرکز «کارهای من».",
        "topics": [
            "ورود امن با نام کاربری و رمز عبور اختصاصی و رعایت استاندارد تغییر رمز",
            "صفحه انتخاب سامانه (Launcher) و تفکیک دسترسی ماژول‌های مجاز",
            "منوی درختی کناری (Sidebar) در دسکتاپ و منوی واکنش‌گرای کشویی موبایل",
            "سیستم زنگوله اعلان‌های لحظه‌ای برای رویدادها و اسناد نیازمند اقدام",
            "منوی کاربری، بارگذاری تصویر پروفایل، تنظیم امضای دیجیتال و خروج ایمن",
            "داشبورد «کارهای من» به عنوان میز کار مرکزی برای پیگیری اسناد و تاییدات"
        ],
        "roles": ["همه کاربران", "مدیر سیستم", "سرپرستان"],
        "pro_tip": "داشبورد «کارهای من» نقطه آغازین فعالیت روزانه شماست؛ به محض ارجاع یا ثبت سندی که نیازمند امضا یا اقدام شما باشد، در این بخش نمایان می‌شود."
    },
    "01-users-company": {
        "category": "مدیریت و ساختار",
        "category_id": "setup",
        "icon": "building",
        "summary": "فرآیند کامل ثبت شرکت جدید، تعریف پروژه‌ها و کارگاه‌های تابعه، ثبت شناسنامه حساب‌های کاربری، انتساب کاربران و نقش‌ها، و تنظیم الگوهای گردش کار و شماره‌گذاری اسناد.",
        "topics": [
            "ثبت شرکت جدید با کد و نام ثبتی رسمی و تنظیمات عمومی",
            "تعریف پروژه‌ها و تفکیک کارگاه‌ها/بخش‌های عملیاتی زیرمجموعه",
            "ایجاد کاربران جدید با سطوح سازمانی، ایمیل و رمز عبور امن",
            "انتساب نقش‌های استاندارد (سرپرست، حسابدار، مدیر، خزانه‌دار و کارمند)",
            "تنظیم الگوهای شماره‌گذاری خودکار اسناد مالی و فاکتورها",
            "بررسی تفکیک دسترسی‌ها با تست ورود و مشاهده منوی متناسب با نقش"
        ],
        "roles": ["مدیر ارشد سیستم (Super Admin)", "مدیر عامل"],
        "pro_tip": "دسترسی کاربران بر مبنای ترکیب «شرکت + پروژه + نقش» تفکیک می‌شود و امکان مشاهده داده‌های پروژه‌های غیرمجاز برای سایر کاربران وجود ندارد."
    },
    "02-accounting-setup": {
        "category": "حسابداری پایه",
        "category_id": "setup",
        "icon": "settings",
        "summary": "راه‌اندازی شالوده سیستم مالی شرکت شامل افتتاح دوره‌های مالی شمسی، تعریف حساب‌های بانکی و صندوق‌ها، کدینگ سرفصل‌های هزینه و مدیریت طرف‌حساب‌های تجاری.",
        "topics": [
            "تعریف و بازگشایی دوره‌های مالی جدید با شروع و پایان تقویم شمسی",
            "معرفی حساب‌های بانکی، صندوق‌ها و تعریف شماره شبا با اعتبارسنجی ISO 7064",
            "ثبت سند افتتاحیه و انتقال مانده‌های اول دوره نقد و بانک",
            "ایجاد ساختار درختی گروه‌های سرفصل و کدینگ حساب‌های هزینه",
            "شناسنامه طرف‌حساب‌ها، ثبت کدهای ملی/اقتصادی و اطلاعات تماس و شبا"
        ],
        "roles": ["مدیر سیستم", "حسابدار ارشد", "مدیر مالی"],
        "pro_tip": "الگوریتم اعتبارسنجی شبا (ISO 7064 Mod 97) به صورت خودکار مانع از اشتباه تایپی در شماره حساب و شبای طرف‌حساب‌ها و بانک‌ها می‌شود."
    },
    "03a-invoice-record": {
        "category": "فاکتور و خرید",
        "category_id": "invoice",
        "icon": "receipt",
        "summary": "فرآیند ثبت فاکتورهای هزینه و خرید توسط پرسنل و مسئولین خرید، ورود اقلام و سرفصل‌ها، بارگذاری مدارک مثبته و کنترل فاکتورهای تکراری.",
        "topics": [
            "ایجاد فاکتور جدید و انتخاب هوشمند بخش/پروژه مجاز کارمند",
            "ورود اطلاعات پایه فاکتور شامل طرف‌حساب، شماره فاکتور فروشنده و تاریخ شمسی",
            "افزودن چند ردیف هزینه، تخصیص سرفصل، مبالغ، تخفیف و مالیات ارزش افزوده",
            "پیوست فایل تصویر فاکتور و اسناد مدارک ضمیمه",
            "سیستم تشخیص هوشمند فاکتور تکراری و الزام به ثبت دلیل مستند در صورت تشابه",
            "صدور کد رهگیری داخلی و ارسال فاکتور به گردش کار تأییدات"
        ],
        "roles": ["کارمند", "مسئول خرید", "تنخواه‌دار"],
        "pro_tip": "هنگام ثبت فاکتور، در صورتی که مبلغ و شماره فاکتور قبلاً ثبت شده باشد، سیستم هوشمند هشدار تکراری داده و برای ثبت نهایی ارائه توضیح مستند الزامی است."
    },
    "03b-invoice-approvals": {
        "category": "فاکتور و خرید",
        "category_id": "invoice",
        "icon": "check-circle",
        "summary": "گردش کارتابل تأییدات چندمرحله‌ای فاکتورها، ممیزی فنی توسط سرپرست، عودت و رفع نقص، ممیزی مالی حسابدار و تأیید نهایی جهت پرداخت توسط مدیر.",
        "topics": [
            "کارتابل «تأیید فاکتورها» سرپرست و انطباق اقلام با فعالیت کارگاه",
            "عودت فاکتور دارای ایراد به کارمند با ذکر دقیق دلیل بازگشت",
            "اصلاح سریع مدارک و اقلام توسط کارمند و ارسال مجدد به گردش کار",
            "ممیزی فاکتورها توسط حسابدار از نظر تطبیق سرفصل و قوانین مالیاتی",
            "صدور مجوز پرداخت نهایی توسط مدیر و ثبت در تاریخچه سند",
            "ارسال لحظه‌ای اعلان‌ها در زنگوله برای تمامی مراحل گردش کار"
        ],
        "roles": ["سرپرست کارگاه", "کارمند", "حسابدار ممیز", "مدیر مالی"],
        "pro_tip": "با ثبت یادداشت شفاف در زمان عودت سند، کارمند بدون اتلاف وقت متوجه نقص مدارک شده و فاکتور پس از ویرایش در اولویت کارتابل قرار می‌گیرد."
    },
    "03c-invoice-payment": {
        "category": "خزانه و پرداخت",
        "category_id": "invoice",
        "icon": "credit-card",
        "summary": "فرآیند تسویه و پرداخت فاکتورهای مصوب در ماژول خزانه‌داری، پرداخت‌های اقساطی و چندمرحله‌ای، مدیریت فاکتورهای پرداخت ناقص، ابطال و چاپ سند.",
        "topics": [
            "مشاهده فاکتورهای مصوب در کارتابل «تسویه فاکتور و تن‌خواه» خزانه",
            "ثبت پرداخت قسط اول با تعیین بانک مبدا، شماره پیگیری و تاریخ واریز",
            "وضعیت «پرداخت ناقص» و پایش مانده بدهی تا تسویه نهایی",
            "ثبت پرداخت قسط دوم و بسته شدن خودکار فاکتور پس از تسویه کامل",
            "سازوکار ابطال پرداخت اشتباه با رعایت کامل اصول ردگیری تراکنش",
            "چاپ سند پرداخت رسمی و استخراج خروجی‌های استاندارد اکسل"
        ],
        "roles": ["خزانه‌دار", "مدیر مالی", "حسابدار"],
        "pro_tip": "پرداخت‌های چندمرحله‌ای اجازه می‌دهند متناسب با نقدینگی شرکت یا توافقات با تامین‌کننده، فاکتورها در چندین نوبت پرداخت و تسویه شوند."
    },
    "04a-petty-account-charge": {
        "category": "تنخواه گردان",
        "category_id": "petty",
        "icon": "wallet",
        "summary": "افتتاح حساب‌های تنخواه گردان برای پرسنل، تعریف سقف تنخواه، گردش درخواست شارژ اولیه، رسیدگی حسابداری و واریز وجه توسط خزانه‌داری.",
        "topics": [
            "ایجاد حساب تنخواه جدید در سامانه و انتساب به پرسنل تنخواه‌دار",
            "تعیین سقف اعتباری مجاز تنخواه بر اساس سیاست‌های شرکت",
            "ثبت درخواست الکترونیکی شارژ تنخواه توسط کارمند",
            "رسیدگی حسابدار و کنترل مانده و تأیید سقف توسط مدیر",
            "ثبت واریز بانکی توسط خزانه‌دار و افزایش آنی موجودی کیف تنخواه"
        ],
        "roles": ["حسابدار تنخواه", "تنخواه‌دار", "مدیر", "خزانه‌دار"],
        "pro_tip": "درخواست‌های شارژ درون سقف تنخواه به صورت روان‌تر پردازش شده و پس از واریز خزانه‌دار، مانده در پنل تنخواه‌دار بلافاصله بروز می‌شود."
    },
    "04b-petty-statement": {
        "category": "تنخواه گردان",
        "category_id": "petty",
        "icon": "file-text",
        "summary": "ثبت روزانه هزینه‌های تنخواه با تصویر قبوض، بسته‌بندی در قالب صورت‌حساب دوره‌ای، ممیزی حسابداری، رد ردیف‌های غیرمجاز و شارژ مجدد.",
        "topics": [
            "ثبت تک‌تک هزینه‌های خرد با ذکر سرفصل و تصویر قبض و رسید",
            "تجمیع هزینه‌ها و ایجاد صورت‌حساب تنخواه دوره‌ای",
            "ارسال صورت‌حساب به کارتابل رسیدگی تنخواه حسابداری",
            "رد هوشمند یک ردیف هزینه نامعتبر با ذکر دلیل بدون اختلال در کل صورت‌حساب",
            "تأیید هزینه‌های مصوب توسط مدیر و صدور خودکار شارژ کسری تنخواه"
        ],
        "roles": ["تنخواه‌دار", "حسابدار", "مدیر"],
        "pro_tip": "قابلیت رد ردیف (Reject Line) این مزیت را دارد که صورت‌حساب به خاطر یک ایراد جزئی متوقف نمی‌شود؛ ردیف معیوب کسر شده و بقیه مبالغ سریعاً تأیید می‌گردند."
    },
    "04c-petty-close": {
        "category": "تنخواه گردان",
        "category_id": "petty",
        "icon": "shield-check",
        "summary": "فرآیند پایان دوره تنخواه، تطبیق نقدینگی فیزیکی و مانده دفتری، ثبت کسری/مازاد، تسویه حساب، تحویل حساب به تنخواه‌دار دیگر و بستن رسمی حساب.",
        "topics": [
            "فرآیند شمارش نقدینگی و تطبیق موجودی فیزیکی با سیستم",
            "ثبت کسری یا مازاد نقدینگی و اعمال خودکار سند تعدیل در حسابداری",
            "تسویه حساب کامل و عودت وجه باقیمانده به حساب شرکت",
            "تحویل رسمی حساب و انتقال مسئولیت تنخواه به کارمند جانشین",
            "بستن قطعی حساب تنخواه پس از تراز کامل دفتر تنخواه"
        ],
        "roles": ["حسابدار تنخواه", "تنخواه‌دار قبلی", "تنخواه‌دار جدید", "مدیر مالی"],
        "pro_tip": "پیش از بستن یا تحویل تنخواه، حتماً تمام صورت‌حساب‌های معلق باید تعیین تکلیف شده و تطبیق موجودی نقدی ثبت شود."
    },
    "05-personnel-file": {
        "category": "منابع انسانی و پرسنل",
        "category_id": "hr",
        "icon": "user",
        "summary": "تشکیل پرونده الکترونیک پرسنلی، مشخصات هویتی و شغلی، حساب‌های بانکی، گردش کار تأیید پرونده، حفاظت از داده‌های حساس و درخواست تغییر اطلاعات.",
        "topics": [
            "معرفی پرسنل جدید با کد ملی ۱۰ رقمی، اطلاعات شناسنامه‌ای و تصویر",
            "تعیین سمت شغلی، کد ۶ رقمی شغل بیمه تأمین اجتماعی، پروژه و کارگاه",
            "ثبت شماره شبا و حساب بانکی پرسنل با بررسی صحت شبا",
            "گردش تأیید پرونده پرسنلی توسط سرپرست و مدیر ارشد",
            "ثبت درخواست اصلاح مشخصات هویتی یا بانکی با پیوست مدارک جدید",
            "چاپ شناسنامه و پرونده شغلی استاندارد پرسنل"
        ],
        "roles": ["کارمند", "مسئول کارگزینی", "سرپرست", "مدیر منابع انسانی"],
        "pro_tip": "اطلاعات حساس بانکی و دستمزد پرسنل تحت پروتکل‌های محرمانگی بوده و دسترسی به آن‌ها منحصراً به نقش‌های مجاز محدود است."
    },
    "06-attendance": {
        "category": "حضور و غیاب",
        "category_id": "hr",
        "icon": "calendar",
        "summary": "ثبت کارکرد روزانه پرسنل کارگاه‌ها، ثبت ساعت کار و اضافه‌کاری، نشان‌های حضور/مرخصی/غیبت، بستن دوره کارکرد ماهانه و اخذ برگه امضای کارکرد.",
        "topics": [
            "کار با ماتریس ثبت کارکرد روزانه پرسنل به تفکیک کارگاه و تاریخ",
            "ورود ساعات کارکرد عادی، اضافه‌کاری و روزهای جمعه و تعطیل کاری",
            "نشان‌های وضعیت (مرخصی، غیبت) و صفر شدن خودکار ساعات در این روزها",
            "قابلیت تاگل سریع و لغو نشان‌ها با کلیک مجدد روی بج‌ها",
            "گردش تأیید، نهایی‌سازی و بستن ماهانه کارکرد کارگاه",
            "چاپ برگه خلاصه کارکرد ماهانه جهت اخذ امضای پرسنل و سرپرست"
        ],
        "roles": ["ثبت‌کننده کارکرد", "سرپرست کارگاه", "کارمند", "حسابدار حقوق"],
        "pro_tip": "روزهای جمعه و تعطیل رسمی طبق قانون کار ۱۰ ساعت پایه دارند؛ اما در وضعیت مرخصی یا غیبت، ساعات کار به صورت هوشمند صفر می‌گردد."
    },
    "07-payroll": {
        "category": "حقوق و دستمزد",
        "category_id": "hr",
        "icon": "dollar-sign",
        "summary": "محاسبه جامع حقوق و دستمزد ماهانه منطبق بر اکسل مرجع شرکت، صدور دیسکت‌های قانونی بیمه تأمین اجتماعی و مالیات حقوق، و واریز گروهی خزانه.",
        "topics": [
            "تنظیم پایه‌های قانونی سال شامل حداقل مزد، حق مسکن، بن خواربار و حق اولاد",
            "محاسبه مکانیزه حقوق ماهانه بر مبنای کارکرد تاییدشده کارگاه",
            "فیش حقوقی شفاف با تفکیک مزایا، اضافه کار، بیمه ۷٪ کارگر، ۲۰٪ کارفرما و مالیات پلکانی",
            "تولید خودکار دیسکت‌های استاندارد بیمه تأمین اجتماعی (DSKWOR00 و DSKKAR00)",
            "استخراج فایل‌های استاندارد مالیات حقوق سامانه دارایی (WH و WP)",
            "ارسال لیست تسویه حقوق به کارتابل خزانه‌داری جهت واریز گروهی پایا/ساتنا"
        ],
        "roles": ["حسابدار حقوق و دستمزد", "مدیر مالی", "خزانه‌دار"],
        "pro_tip": "تمامی محاسبات حقوقی بر اساس اکسل سازمانی و فرمول‌های دقیق قانونی کار محاسبه می‌شوند تا دیسکت‌های بیمه و مالیات بدون کوچک‌ترین عدم تطابقی صادر شوند."
    },
    "08-fleet": {
        "category": "ناوگان و ترابری",
        "category_id": "fleet",
        "icon": "truck",
        "summary": "مدیریت ناوگان و ماشین‌آلات، تشکیل شناسنامه خودرو با پلاک ملی، ثبت کارکرد و ترددهای روزانه، مأموریت‌های باربری و تسویه کرایه رانندگان.",
        "topics": [
            "تعریف خودرو و ماشین‌آلات استیجاری/سازمانی با پلاک ۴ بخشی کشوری",
            "ثبت مشخصات راننده، شماره شبا، تاریخ انقضای بیمه‌نامه و معاینه فنی",
            "ثبت کارکرد روزانه ترددها، تناژ بار، ساعت فعالیت و مبدا و مقصد",
            "گردش تأیید ترددها توسط سرپرست و ممیزی مالیات و استهلاک توسط حسابدار",
            "محاسبه ناخالص و خالص کرایه راننده و کسر مساعده و سوخت",
            "انتقال سند کارکرد ناوگان به خزانه‌داری جهت واریز کرایه"
        ],
        "roles": ["مسئول ترابری", "سرپرست کارگاه", "حسابدار", "رانندگان"],
        "pro_tip": "سامانه وضعیت اعتبار بیمه‌نامه خودروها را پایش می‌کند و از تخصیص سرویس به خودروهای با بیمه‌نامه منقضی‌شده جلوگیری به عمل می‌آورد."
    },
    "09-reports": {
        "category": "گزارشات و داشبورد",
        "category_id": "reports",
        "icon": "pie-chart",
        "summary": "داشبورد جامع شاخص‌های عملکرد، ابزارهای کنترل بودجه و انحرافات پروژه، تحلیل چندبعدی هزینه‌ها و استخراج گزارش‌های رسمی اکسل و چاپ.",
        "topics": [
            "داشبورد کلان مدیریتی با نمودارهای تعاملی هزینه‌ها و کارتابل‌های معلق",
            "سیستم کنترل بودجه کارگاه‌ها و پایش درصد انحراف بودجه مصوب در برابر واقعی",
            "گزارش‌های تفکیکی بر مبنای سرفصل هزینه، پروژه‌ها و طرف‌حساب‌ها",
            "فیلترهای زمانی پیشرفته، جستجوی بلادرنگ و گزارش‌های ماتریسی",
            "خروجی رسمی اکسل دو ردیفه استاندارد با فرمت تاریخ‌های شمسی و سرستون‌های شفاف",
            "حالت چاپ رسمی گزارشات به صورت استاندارد شرکتی"
        ],
        "roles": ["مدیر عامل", "مدیران پروژه", "مدیر مالی", "کارشناس کنترل پروژه"],
        "pro_tip": "گزارش‌های اکسل سیستم از ساختار استاندارد ۲ ردیفه هدر (عنوان فارسی + کلید لاتین) و تاریخ‌های شمسی استاندارد بهره می‌برند."
    },
    "10-common-tasks": {
        "category": "امکانات مشترک",
        "category_id": "common",
        "icon": "layers",
        "summary": "امکانات مشارکتی و زیرساختی سامانه شامل تعیین جانشین در مرخصی، ارجاع سند با مهلت و دستور، ارسال رونوشت و کارکرد پیوسته در حالت آفلاین.",
        "topics": [
            "تعیین جانشین در منوی کاربر برای بازه زمانی مشخص در زمان مرخصی",
            "اقدام و امضا به جای دیگری با برچسب مشخص «به عنوان جانشین»",
            "ارجاع اسناد کارتابل به همکاران به همراه دستور اقدام و تعیین ضرب‌الاجل (Deadline)",
            "ارسال رونوشت جهت اطلاع و پیگیری وضعیت «مشاهده شده»",
            "کارکرد بدون اینترنت (Offline PWA) و ثبت بدون مانع فاکتورها و کارکردها",
            "صف همگام‌سازی پس‌زمینه و ارسال خودکار اطلاعات پس از برقراری اینترنت"
        ],
        "roles": ["همه کاربران سامانه"],
        "pro_tip": "به لطف معماری آفلاین‌محور سامانه، قطعی مقطعی اینترنت هیچ خللی در ثبت گزارش‌ها و هزینه‌ها ایجاد نکرده و اطلاعات به محض اتصال مجدد سینک می‌شوند."
    }
}

# SVG Icons with EXPLICIT width, height, and inline styles so they NEVER explode in size
SVG_ICONS = {
    "play": '<svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor" style="width:22px;height:22px;min-width:22px;display:inline-block;vertical-align:middle;"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" /></svg>',
    "desktop": '<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:15px;height:15px;min-width:15px;display:inline-block;vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>',
    "mobile": '<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:15px;height:15px;min-width:15px;display:inline-block;vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>',
    "check": '<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#059669" style="width:14px;height:14px;min-width:14px;color:#059669;display:inline-block;vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" /></svg>',
    "info": '<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#d97706" style="width:16px;height:16px;min-width:16px;color:#d97706;display:inline-block;vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
    "search": '<svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:17px;height:17px;min-width:17px;display:inline-block;vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>',
    "download": '<svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:13px;height:13px;min-width:13px;display:inline-block;vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>',
    "copy": '<svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:13px;height:13px;min-width:13px;display:inline-block;vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>',
    "clock": '<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:14px;height:14px;min-width:14px;display:inline-block;vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
    "subtitles": '<svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:13px;height:13px;min-width:13px;display:inline-block;vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>',
    "sparkles": '<svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="#4f46e5" style="width:17px;height:17px;min-width:17px;color:#4f46e5;display:inline-block;vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>',
    "tag": '<svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:13px;height:13px;min-width:13px;display:inline-block;vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>'
}


def to_vtt(srt):
    vtt = srt.with_suffix('.vtt')
    lines = [line.replace(',', '.') if '-->' in line else line
             for line in srt.read_text(encoding='utf-8').splitlines()]
    vtt.write_text('WEBVTT\n\n' + '\n'.join(lines) + '\n', encoding='utf-8')
    return vtt


def length(ms):
    s = ms // 1000
    return f'{s // 60}:{s % 60:02d}'


def get_duration(v_key, profile, mp4_path):
    if v_key in PRECOMPUTED_DURATIONS and profile in PRECOMPUTED_DURATIONS[v_key]:
        return PRECOMPUTED_DURATIONS[v_key][profile]
    if duration_ms:
        try:
            return duration_ms(mp4_path)
        except Exception:
            pass
    return 180000


def build_page():
    VIDEOS.mkdir(parents=True, exist_ok=True)
    video_cards = []
    nav_links = []
    total_duration_ms = 0
    total_videos_count = 0

    scenario_files = sorted(SCENARIOS.glob('*.captions.json'))

    for captions_file in scenario_files:
        data = json.loads(captions_file.read_text(encoding='utf-8'))
        v_key = data['video']
        v_num = data['number']
        v_title = data['title']

        meta = EPISODE_METADATA.get(v_key, {
            "category": "عمومی",
            "category_id": "common",
            "summary": "آموزش گام به گام و ویدیویی این بخش از سامانه.",
            "topics": [v_title],
            "roles": ["کاربران سامانه"],
            "pro_tip": "پیش از ثبت نهایی اسناد، صحت اطلاعات ورودی را بررسی نمایید."
        })

        ep_durations = {}
        players_html = []

        for profile, label, dim_label, icon_key in (
            ('desktop', 'نسخه کامپیوتر (افقی)', '1440 × 900', 'desktop'),
            ('mobile', 'نسخه گوشی (عمودی)', '412 × 915', 'mobile')
        ):
            mp4 = VIDEOS / f"{v_key}-{profile}.mp4"
            if not mp4.exists():
                players_html.append(f"""
                <div class="player-panel player-panel-{profile}" data-profile="{profile}">
                    <div class="empty-state">
                        <span class="empty-icon">⏳</span>
                        <p class="font-bold">ویدیوی {label} در حال ضبط یا آماده‌سازی است</p>
                    </div>
                </div>
                """)
                continue

            total_videos_count += 1
            dur_ms = get_duration(v_key, profile, mp4)
            ep_durations[profile] = dur_ms
            total_duration_ms += dur_ms
            time_str = length(dur_ms)

            srt = mp4.with_suffix('.srt')
            track = ""
            has_sub = False
            if srt.exists():
                vtt = to_vtt(srt)
                track = f'<track kind="subtitles" srclang="fa" label="فارسی" src="{vtt.name}" default>'
                has_sub = True

            sub_badge = f'<span class="badge badge-emerald">{SVG_ICONS["subtitles"]} زیرنویس فعال</span>' if has_sub else ''

            players_html.append(f"""
            <div class="player-panel player-panel-{profile}" data-profile="{profile}">
                <div class="player-meta-bar">
                    <div class="player-title-info">
                        <span class="player-badge">{SVG_ICONS[icon_key]} {label}</span>
                        <span class="badge badge-slate">{SVG_ICONS['clock']} {time_str}</span>
                        <span class="badge badge-slate">{dim_label}</span>
                        {sub_badge}
                    </div>
                    <div class="player-actions">
                        <a href="{mp4.name}" download class="btn-action" title="دانلود این ویدیو">
                            {SVG_ICONS['download']} دانلود
                        </a>
                        {f'<a href="{srt.with_suffix(".vtt").name}" download class="btn-action" title="دانلود زیرنویس VTT">{SVG_ICONS["subtitles"]} VTT</a>' if has_sub else ''}
                    </div>
                </div>
                <div class="video-container video-aspect-{profile}">
                    <video controls preload="metadata" src="{mp4.name}">
                        {track}
                        مرورگر شما از پخش این ویدیو پشتیبانی نمی‌کند.
                    </video>
                </div>
            </div>
            """)

        # Calculate combined / display time
        desktop_time = length(ep_durations.get('desktop', 0)) if 'desktop' in ep_durations else ''
        mobile_time = length(ep_durations.get('mobile', 0)) if 'mobile' in ep_durations else ''
        badge_time = f"{desktop_time} (دسکتاپ) · {mobile_time} (موبایل)" if desktop_time and mobile_time else (desktop_time or mobile_time or 'در حال آماده‌سازی')

        # Nav link for sidebar
        nav_links.append(f"""
        <a href="#{v_key}" class="toc-link" data-category="{meta['category_id']}">
            <span class="toc-num">{v_num}</span>
            <span class="toc-text">{html.escape(v_title)}</span>
        </a>
        """)

        # Learning topics list with dedicated circular check badges
        topics_items = "".join(f"""
        <li class="topic-item">
            <span class="topic-check-badge">✓</span>
            <span class="topic-text">{html.escape(t)}</span>
        </li>
        """ for t in meta['topics'])

        # Roles badges
        roles_items = "".join(f"""
        <span class="role-pill">{html.escape(r)}</span>
        """ for r in meta['roles'])

        # Card HTML
        card_html = f"""
        <article id="{v_key}" class="episode-card" data-category="{meta['category_id']}">
            <!-- Card Header -->
            <header class="card-header">
                <div class="card-header-top">
                    <div class="badges-row">
                        <span class="badge badge-primary font-mono">قسمت {v_num}</span>
                        <span class="badge badge-category">{SVG_ICONS['tag']} {meta['category']}</span>
                        <span class="badge badge-slate">{SVG_ICONS['clock']} {badge_time}</span>
                    </div>
                    <button class="btn-copy-link" onclick="copyEpisodeLink('{v_key}')" title="کپی لینک اشتراک این قسمت">
                        {SVG_ICONS['copy']} کپی لینک قسمت
                    </button>
                </div>
                <h2 class="card-title">
                    <span class="title-num">{v_num}.</span>
                    <span>{html.escape(v_title)}</span>
                </h2>
            </header>

            <!-- Pre-Video Educational Content / Textual Description -->
            <section class="card-overview-box">
                <div class="overview-header-row">
                    <div class="overview-title-tag">
                        {SVG_ICONS['sparkles']}
                        <span>شناسنامه و سرفصل‌های این قسمت</span>
                    </div>
                    <p class="overview-summary-text">
                        {html.escape(meta['summary'])}
                    </p>
                </div>

                <div class="topics-grid">
                    <div class="topics-column">
                        <div class="column-title">سرفصل‌ها و اهداف آموزشی:</div>
                        <ul class="topics-list">
                            {topics_items}
                        </ul>
                    </div>

                    <div class="meta-column">
                        <div class="meta-group">
                            <div class="column-title">نقش‌های درگیر در فرآیند:</div>
                            <div class="roles-wrap">
                                {roles_items}
                            </div>
                        </div>

                        <div class="tip-callout">
                            <div class="tip-header">
                                {SVG_ICONS['info']}
                                <span>نکته مهم سیستمی</span>
                            </div>
                            <p class="tip-text">{html.escape(meta['pro_tip'])}</p>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Video Players Section with View Tabs -->
            <section class="card-video-section">
                <div class="player-view-switch">
                    <div class="view-tabs" role="tablist">
                        <button class="view-tab-btn active" onclick="switchEpisodeView('{v_key}', 'both')">
                            نمایش هر دو نسخه (کنار هم)
                        </button>
                        <button class="view-tab-btn" onclick="switchEpisodeView('{v_key}', 'desktop')">
                            {SVG_ICONS['desktop']} نسخه کامپیوتر
                        </button>
                        <button class="view-tab-btn" onclick="switchEpisodeView('{v_key}', 'mobile')">
                            {SVG_ICONS['mobile']} نسخه گوشی
                        </button>
                    </div>
                </div>

                <div class="players-grid view-mode-both" id="players-{v_key}">
                    {''.join(players_html)}
                </div>
            </section>
        </article>
        """
        video_cards.append(card_html)

    total_mins = total_duration_ms // 60000
    total_secs = (total_duration_ms % 60000) // 1000
    total_time_str = f"{total_mins} دقیقه و {total_secs} ثانیه"

    # Full HTML Page Template
    html_page = f"""<!doctype html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>فیلم‌های آموزشی سامانه مدیریت جامع و حسابداری</title>
    <!-- Modern Vazirmatn Persian Font -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        :root {{
            --font-family: 'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Tahoma, sans-serif;
            --bg-base: #f8fafc;
            --bg-card: #ffffff;
            --bg-subtle: #f1f5f9;
            --bg-muted: #e2e8f0;
            --text-main: #0f172a;
            --text-muted: #475569;
            --text-dim: #94a3b8;
            --border-color: #e2e8f0;
            --border-hover: #cbd5e1;
            --primary: #4f46e5;
            --primary-hover: #4338ca;
            --primary-light: #eef2ff;
            --primary-text: #4338ca;
            --emerald-bg: #ecfdf5;
            --emerald-text: #059669;
            --amber-bg: #fffbeb;
            --amber-border: #f59e0b;
            --amber-text: #b45309;
            --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
            --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.06);
            --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.06);
            --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
            --radius-md: 10px;
            --radius-lg: 16px;
            --radius-xl: 20px;
        }}

        [data-theme="dark"] {{
            --bg-base: #090d16;
            --bg-card: #131b2e;
            --bg-subtle: #1c263d;
            --bg-muted: #273553;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --text-dim: #64748b;
            --border-color: #26334d;
            --border-hover: #3b4d71;
            --primary: #6366f1;
            --primary-hover: #4f46e5;
            --primary-light: #1e1e38;
            --primary-text: #a5b4fc;
            --emerald-bg: #064e3b;
            --emerald-text: #34d399;
            --amber-bg: #2d1804;
            --amber-border: #d97706;
            --amber-text: #fbbf24;
            --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.5);
            --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
            --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.6);
            --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.7);
        }}

        *, *::before, *::after {{
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }}

        html {{
            scroll-behavior: smooth;
            font-size: 15px;
        }}

        body {{
            font-family: var(--font-family);
            background-color: var(--bg-base);
            color: var(--text-main);
            line-height: 1.65;
            text-rendering: optimizeLegibility;
            -webkit-font-smoothing: antialiased;
            min-height: 100vh;
        }}

        /* STRICT SVG RULES: Never blow up in size! */
        svg {{
            display: inline-block;
            vertical-align: middle;
            flex-shrink: 0;
            max-width: 24px;
            max-height: 24px;
        }}

        /* App Header */
        .site-header {{
            position: sticky;
            top: 0;
            z-index: 50;
            background: rgba(255, 255, 255, 0.88);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border-bottom: 1px solid var(--border-color);
            transition: background 0.3s, border-color 0.3s;
        }}

        [data-theme="dark"] .site-header {{
            background: rgba(19, 27, 46, 0.88);
        }}

        .header-inner {{
            max-width: 1440px;
            margin: 0 auto;
            padding: 12px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            flex-wrap: wrap;
        }}

        .brand-section {{
            display: flex;
            align-items: center;
            gap: 12px;
        }}

        .brand-logo {{
            width: 40px;
            height: 40px;
            border-radius: var(--radius-md);
            background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            box-shadow: 0 4px 10px rgba(79, 70, 229, 0.3);
        }}

        .brand-title h1 {{
            font-size: 1.15rem;
            font-weight: 800;
            color: var(--text-main);
            letter-spacing: -0.02em;
        }}

        .brand-title p {{
            font-size: 0.78rem;
            color: var(--text-muted);
            font-weight: 500;
        }}

        .header-stats {{
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }}

        .stat-badge {{
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 5px 12px;
            background: var(--bg-subtle);
            border: 1px solid var(--border-color);
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 600;
            color: var(--text-muted);
        }}

        .stat-badge strong {{
            color: var(--text-main);
            font-weight: 800;
        }}

        .header-actions {{
            display: flex;
            align-items: center;
            gap: 8px;
        }}

        .btn-theme {{
            width: 36px;
            height: 36px;
            border-radius: var(--radius-md);
            border: 1px solid var(--border-color);
            background: var(--bg-card);
            color: var(--text-main);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 1rem;
        }}

        .btn-theme:hover {{
            background: var(--bg-subtle);
            border-color: var(--border-hover);
        }}

        /* Hero & Search Banner */
        .hero-banner {{
            max-width: 1440px;
            margin: 20px auto 0;
            padding: 0 24px;
        }}

        .hero-card {{
            background: linear-gradient(135deg, rgba(79, 70, 229, 0.06) 0%, rgba(124, 58, 237, 0.03) 100%), var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-lg);
            padding: 22px 26px;
            box-shadow: var(--shadow-sm);
        }}

        .hero-content h2 {{
            font-size: 1.35rem;
            font-weight: 900;
            margin-bottom: 6px;
            color: var(--text-main);
        }}

        .hero-content p {{
            font-size: 0.88rem;
            color: var(--text-muted);
            max-width: 800px;
            margin-bottom: 16px;
        }}

        .search-and-filters {{
            display: flex;
            flex-direction: column;
            gap: 14px;
        }}

        .search-box {{
            position: relative;
            max-width: 600px;
        }}

        .search-icon {{
            position: absolute;
            right: 14px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-dim);
            pointer-events: none;
            display: flex;
            align-items: center;
        }}

        .search-input {{
            width: 100%;
            padding: 10px 42px 10px 16px;
            font-family: inherit;
            font-size: 0.88rem;
            background: var(--bg-base);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            color: var(--text-main);
            outline: none;
            transition: all 0.2s;
        }}

        .search-input:focus {{
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
            background: var(--bg-card);
        }}

        .filter-pills {{
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }}

        .filter-btn {{
            padding: 5px 12px;
            font-family: inherit;
            font-size: 0.77rem;
            font-weight: 600;
            border-radius: 9999px;
            border: 1px solid var(--border-color);
            background: var(--bg-card);
            color: var(--text-muted);
            cursor: pointer;
            transition: all 0.2s;
        }}

        .filter-btn:hover {{
            color: var(--text-main);
            border-color: var(--border-hover);
        }}

        .filter-btn.active {{
            background: var(--primary);
            color: #ffffff;
            border-color: var(--primary);
            box-shadow: 0 2px 6px rgba(79, 70, 229, 0.25);
        }}

        /* Main Layout */
        .main-layout {{
            max-width: 1440px;
            margin: 24px auto 60px;
            padding: 0 24px;
            display: grid;
            grid-template-columns: 280px 1fr;
            gap: 24px;
            align-items: flex-start;
        }}

        @media (max-width: 1024px) {{
            .main-layout {{
                grid-template-columns: 1fr;
            }}
            .sidebar-toc {{
                display: none;
            }}
        }}

        /* Sidebar Table of Contents */
        .sidebar-toc {{
            position: sticky;
            top: 78px;
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-lg);
            padding: 16px 14px;
            box-shadow: var(--shadow-sm);
            max-height: calc(100vh - 96px);
            overflow-y: auto;
        }}

        .toc-header {{
            font-size: 0.85rem;
            font-weight: 800;
            color: var(--text-main);
            padding-bottom: 10px;
            border-bottom: 1px solid var(--border-color);
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }}

        .toc-list {{
            display: flex;
            flex-direction: column;
            gap: 3px;
        }}

        .toc-link {{
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 7px 9px;
            border-radius: 6px;
            font-size: 0.77rem;
            font-weight: 500;
            color: var(--text-muted);
            text-decoration: none;
            transition: all 0.15s;
        }}

        .toc-link:hover {{
            background: var(--bg-subtle);
            color: var(--primary);
        }}

        .toc-num {{
            font-family: inherit;
            font-size: 0.7rem;
            font-weight: 700;
            background: var(--bg-subtle);
            color: var(--text-dim);
            padding: 2px 5px;
            border-radius: 4px;
            min-width: 26px;
            text-align: center;
        }}

        .toc-text {{
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }}

        /* Episodes Container */
        .episodes-feed {{
            display: flex;
            flex-direction: column;
            gap: 28px;
        }}

        /* Episode Card */
        .episode-card {{
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-xl);
            padding: 24px;
            box-shadow: var(--shadow-md);
            transition: all 0.25s ease;
            scroll-margin-top: 86px;
        }}

        .episode-card:hover {{
            box-shadow: var(--shadow-lg);
            border-color: var(--border-hover);
        }}

        .card-header {{
            margin-bottom: 16px;
        }}

        .card-header-top {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 8px;
            flex-wrap: wrap;
        }}

        .badges-row {{
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }}

        .badge {{
            display: inline-flex;
            align-items: center;
            gap: 5px;
            font-size: 0.72rem;
            font-weight: 700;
            padding: 3px 9px;
            border-radius: 9999px;
            line-height: 1.4;
        }}

        .badge-primary {{
            background: var(--primary-light);
            color: var(--primary-text);
        }}

        .badge-category {{
            background: var(--bg-subtle);
            color: var(--text-muted);
            border: 1px solid var(--border-color);
        }}

        .badge-slate {{
            background: var(--bg-subtle);
            color: var(--text-muted);
        }}

        .badge-emerald {{
            background: var(--emerald-bg);
            color: var(--emerald-text);
        }}

        .btn-copy-link {{
            background: none;
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            color: var(--text-muted);
            padding: 4px 9px;
            font-family: inherit;
            font-size: 0.73rem;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            transition: all 0.2s;
        }}

        .btn-copy-link:hover {{
            background: var(--bg-subtle);
            color: var(--text-main);
        }}

        .card-title {{
            font-size: 1.25rem;
            font-weight: 800;
            color: var(--text-main);
            display: flex;
            align-items: center;
            gap: 6px;
        }}

        .title-num {{
            color: var(--primary);
            font-weight: 900;
        }}

        /* Educational Description Box (Compact, Sleek, Professional) */
        .card-overview-box {{
            background: var(--bg-subtle);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-lg);
            padding: 16px 18px;
            margin-bottom: 20px;
        }}

        .overview-header-row {{
            margin-bottom: 14px;
        }}

        .overview-title-tag {{
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 0.82rem;
            font-weight: 800;
            color: var(--primary);
            margin-bottom: 6px;
        }}

        .overview-summary-text {{
            font-size: 0.88rem;
            color: var(--text-main);
            line-height: 1.65;
        }}

        .topics-grid {{
            display: grid;
            grid-template-columns: 1.4fr 1fr;
            gap: 18px;
            padding-top: 12px;
            border-top: 1px solid var(--border-color);
        }}

        @media (max-width: 768px) {{
            .topics-grid {{
                grid-template-columns: 1fr;
            }}
        }}

        .column-title {{
            font-size: 0.76rem;
            font-weight: 800;
            color: var(--text-muted);
            margin-bottom: 8px;
            letter-spacing: -0.01em;
        }}

        .topics-list {{
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 7px;
        }}

        .topic-item {{
            display: flex;
            align-items: flex-start;
            gap: 8px;
            font-size: 0.82rem;
            color: var(--text-main);
            line-height: 1.5;
        }}

        /* Tiny circular check badge (never relies on huge SVG!) */
        .topic-check-badge {{
            width: 17px;
            height: 17px;
            min-width: 17px;
            border-radius: 50%;
            background: var(--emerald-bg);
            color: var(--emerald-text);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 900;
            margin-top: 2px;
            flex-shrink: 0;
        }}

        .topic-text {{
            flex: 1;
        }}

        .meta-column {{
            display: flex;
            flex-direction: column;
            gap: 12px;
        }}

        .roles-wrap {{
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
        }}

        .role-pill {{
            background: var(--primary-light);
            color: var(--primary-text);
            border: 1px solid rgba(79, 70, 229, 0.15);
            padding: 2px 8px;
            border-radius: 6px;
            font-size: 0.72rem;
            font-weight: 600;
        }}

        /* Subtle and compact callout for pro tip */
        .tip-callout {{
            background: var(--amber-bg);
            border-right: 3px solid var(--amber-border);
            border-radius: 8px;
            padding: 10px 12px;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }}

        .tip-header {{
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 0.76rem;
            font-weight: 800;
            color: var(--amber-text);
        }}

        .tip-text {{
            font-size: 0.76rem;
            color: var(--text-main);
            line-height: 1.5;
        }}

        /* Video Section & Tabs */
        .card-video-section {{
            display: flex;
            flex-direction: column;
            gap: 12px;
        }}

        .player-view-switch {{
            display: flex;
            align-items: center;
            justify-content: space-between;
        }}

        .view-tabs {{
            display: inline-flex;
            background: var(--bg-subtle);
            padding: 3px;
            border-radius: var(--radius-md);
            border: 1px solid var(--border-color);
            gap: 3px;
        }}

        .view-tab-btn {{
            border: none;
            background: none;
            font-family: inherit;
            font-size: 0.75rem;
            font-weight: 600;
            color: var(--text-muted);
            padding: 4px 10px;
            border-radius: 6px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            transition: all 0.2s;
        }}

        .view-tab-btn.active {{
            background: var(--bg-card);
            color: var(--text-main);
            box-shadow: var(--shadow-sm);
        }}

        /* Players Grid */
        .players-grid {{
            display: grid;
            gap: 16px;
            align-items: start;
        }}

        .players-grid.view-mode-both {{
            grid-template-columns: minmax(0, 1.4fr) minmax(0, 0.9fr);
        }}

        @media (max-width: 900px) {{
            .players-grid.view-mode-both {{
                grid-template-columns: 1fr;
            }}
        }}

        .player-panel {{
            background: var(--bg-subtle);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }}

        .player-meta-bar {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            flex-wrap: wrap;
        }}

        .player-title-info {{
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }}

        .player-badge {{
            font-size: 0.75rem;
            font-weight: 700;
            color: var(--text-main);
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }}

        .player-actions {{
            display: flex;
            align-items: center;
            gap: 5px;
        }}

        .btn-action {{
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 3px 7px;
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 5px;
            font-size: 0.7rem;
            font-weight: 600;
            color: var(--text-muted);
            text-decoration: none;
            transition: all 0.15s;
        }}

        .btn-action:hover {{
            background: var(--bg-base);
            color: var(--text-main);
            border-color: var(--border-hover);
        }}

        .video-container {{
            width: 100%;
            background: #000000;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
            display: flex;
            align-items: center;
            justify-content: center;
        }}

        .video-container video {{
            width: 100%;
            height: auto;
            max-height: 520px;
            display: block;
            outline: none;
            border-radius: 8px;
        }}

        .video-aspect-mobile video {{
            max-height: 460px;
        }}

        .empty-state {{
            padding: 30px 16px;
            text-align: center;
            color: var(--text-muted);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            font-size: 0.85rem;
        }}

        .empty-icon {{
            font-size: 1.8rem;
        }}

        /* Floating Back to Top Button */
        .btn-back-to-top {{
            position: fixed;
            bottom: 24px;
            left: 24px;
            width: 40px;
            height: 40px;
            border-radius: 9999px;
            background: var(--primary);
            color: white;
            border: none;
            box-shadow: var(--shadow-lg);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            opacity: 0;
            visibility: hidden;
            transition: all 0.25s;
            z-index: 40;
            font-size: 1.1rem;
            font-weight: 800;
        }}

        .btn-back-to-top.visible {{
            opacity: 1;
            visibility: visible;
        }}

        .btn-back-to-top:hover {{
            background: var(--primary-hover);
            transform: translateY(-2px);
        }}

        /* Toast Notification */
        .toast {{
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: #0f172a;
            color: #ffffff;
            padding: 8px 16px;
            border-radius: var(--radius-md);
            font-size: 0.82rem;
            font-weight: 600;
            box-shadow: var(--shadow-xl);
            opacity: 0;
            transform: translateY(10px);
            transition: all 0.3s;
            pointer-events: none;
            z-index: 100;
        }}

        .toast.visible {{
            opacity: 1;
            transform: translateY(0);
        }}
    </style>
</head>
<body>
    <!-- Top Sticky Header -->
    <header class="site-header">
        <div class="header-inner">
            <div class="brand-section">
                <div class="brand-logo">
                    {SVG_ICONS['play']}
                </div>
                <div class="brand-title">
                    <h1>مرکز فیلم‌های آموزشی سامانه مدیریت جامع</h1>
                    <p>راهنمای تصویری ویدیویی و مکتوب تمامی فرآیندهای مالی، انبار، پرسنلی و ناوگان</p>
                </div>
            </div>

            <div class="header-stats">
                <div class="stat-badge">
                    <span>دوره‌ها:</span>
                    <strong>{len(scenario_files)} سرفصل</strong>
                </div>
                <div class="stat-badge">
                    <span>ویدیوها:</span>
                    <strong>{total_videos_count} فایل</strong>
                </div>
                <div class="stat-badge">
                    <span>مجموع زمان:</span>
                    <strong>{total_time_str}</strong>
                </div>
            </div>

            <div class="header-actions">
                <button class="btn-theme" id="themeToggleBtn" onclick="toggleTheme()" title="تغییر حالت شب و روز">
                    🌓
                </button>
            </div>
        </div>
    </header>

    <!-- Hero Banner with Live Search and Filters -->
    <section class="hero-banner">
        <div class="hero-card">
            <div class="hero-content">
                <h2>بانک جامع ویدیوهای آموزشی و راهنمای عملیاتی</h2>
                <p>
                    این مجموعه ویدیویی تمامی فرآیندهای روزمره سامانه را به دو فرمت سازگار با کامپیوتر و گوشی همراه با زیرنویس فارسی و توضیحات جامع سرفصل‌ها ارائه می‌دهد.
                </p>
            </div>

            <div class="search-and-filters">
                <div class="search-box">
                    <span class="search-icon">{SVG_ICONS['search']}</span>
                    <input type="text" id="searchInput" class="search-input" placeholder="جستجو در عناوین، سرفصل‌ها، نقش‌ها و توضیحات متنی..." oninput="handleSearch()">
                </div>

                <div class="filter-pills">
                    <button class="filter-btn active" onclick="filterCategory('all', this)">همه سرفصل‌ها ({len(scenario_files)})</button>
                    <button class="filter-btn" onclick="filterCategory('setup', this)">پایه و دسترسی</button>
                    <button class="filter-btn" onclick="filterCategory('invoice', this)">فاکتور و خرید</button>
                    <button class="filter-btn" onclick="filterCategory('petty', this)">تنخواه گردان</button>
                    <button class="filter-btn" onclick="filterCategory('hr', this)">منابع انسانی و حقوق</button>
                    <button class="filter-btn" onclick="filterCategory('fleet', this)">ناوگان و ترابری</button>
                    <button class="filter-btn" onclick="filterCategory('reports', this)">گزارشات و داشبورد</button>
                    <button class="filter-btn" onclick="filterCategory('common', this)">امکانات مشترک</button>
                </div>
            </div>
        </div>
    </section>

    <!-- Main Content Layout -->
    <main class="main-layout">
        <!-- Sidebar Navigation -->
        <aside class="sidebar-toc">
            <div class="toc-header">
                <span>فهرست سریع قسمت‌ها</span>
                <span class="badge badge-primary">{len(scenario_files)}</span>
            </div>
            <nav class="toc-list" id="tocList">
                {''.join(nav_links)}
            </nav>
        </aside>

        <!-- Episodes Feed -->
        <section class="episodes-feed" id="episodesFeed">
            {''.join(video_cards)}
        </section>
    </main>

    <!-- Back to Top Button -->
    <button class="btn-back-to-top" id="backToTopBtn" onclick="scrollToTop()" title="بازگشت به ابتدای صفحه">
        ↑
    </button>

    <!-- Toast Notification -->
    <div id="toast" class="toast">لینک بخش در کلیپ‌بورد کپی شد</div>

    <!-- Interactive Client Script -->
    <script>
        // Theme Toggle (Dark / Light)
        function toggleTheme() {{
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', nextTheme);
            localStorage.setItem('training_theme', nextTheme);
        }}

        // Initialize saved theme
        (function() {{
            const savedTheme = localStorage.getItem('training_theme') || 
                               (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
            document.documentElement.setAttribute('data-theme', savedTheme);
        }})();

        // Switch View Mode for Episode Players (both, desktop, mobile)
        function switchEpisodeView(episodeKey, mode) {{
            const container = document.getElementById('players-' + episodeKey);
            if (!container) return;

            const buttons = container.parentElement.querySelectorAll('.view-tab-btn');
            buttons.forEach(btn => btn.classList.remove('active'));

            const panels = container.querySelectorAll('.player-panel');

            if (mode === 'both') {{
                container.className = 'players-grid view-mode-both';
                panels.forEach(p => p.style.display = 'flex');
                buttons[0].classList.add('active');
            }} else if (mode === 'desktop') {{
                container.className = 'players-grid';
                panels.forEach(p => {{
                    p.style.display = p.dataset.profile === 'desktop' ? 'flex' : 'none';
                }});
                buttons[1].classList.add('active');
            }} else if (mode === 'mobile') {{
                container.className = 'players-grid';
                panels.forEach(p => {{
                    p.style.display = p.dataset.profile === 'mobile' ? 'flex' : 'none';
                }});
                buttons[2].classList.add('active');
            }}
        }}

        // Copy Direct Episode Link
        function copyEpisodeLink(episodeKey) {{
            const url = window.location.origin + window.location.pathname + '#' + episodeKey;
            navigator.clipboard.writeText(url).then(() => {{
                showToast('لینک مستقیم این قسمت در کلیپ‌بورد کپی شد');
            }}).catch(() => {{
                showToast('آدرس: ' + url);
            }});
        }}

        function showToast(message) {{
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.classList.add('visible');
            setTimeout(() => {{
                toast.classList.remove('visible');
            }}, 3000);
        }}

        // Real-Time Search Handler
        function handleSearch() {{
            const query = document.getElementById('searchInput').value.trim().toLowerCase();
            const cards = document.querySelectorAll('.episode-card');
            const tocLinks = document.querySelectorAll('.toc-link');

            cards.forEach(card => {{
                const text = card.textContent.toLowerCase();
                const matches = text.includes(query);
                card.style.display = matches ? 'block' : 'none';
            }});

            tocLinks.forEach(link => {{
                const targetId = link.getAttribute('href').substring(1);
                const targetCard = document.getElementById(targetId);
                link.style.display = (targetCard && targetCard.style.display !== 'none') ? 'flex' : 'none';
            }});
        }}

        // Category Filter Handler
        function filterCategory(catId, btnElement) {{
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            if (btnElement) btnElement.classList.add('active');

            const cards = document.querySelectorAll('.episode-card');
            const tocLinks = document.querySelectorAll('.toc-link');
            document.getElementById('searchInput').value = '';

            cards.forEach(card => {{
                if (catId === 'all' || card.dataset.category === catId) {{
                    card.style.display = 'block';
                }} else {{
                    card.style.display = 'none';
                }}
            }});

            tocLinks.forEach(link => {{
                if (catId === 'all' || link.dataset.category === catId) {{
                    link.style.display = 'flex';
                }} else {{
                    link.style.display = 'none';
                }}
            }});
        }}

        // Back to top scroll listener
        window.addEventListener('scroll', () => {{
            const btn = document.getElementById('backToTopBtn');
            if (window.scrollY > 400) {{
                btn.classList.add('visible');
            }} else {{
                btn.classList.remove('visible');
            }}
        }});

        function scrollToTop() {{
            window.scrollTo({{ top: 0, behavior: 'smooth' }});
        }}
    </script>
</body>
</html>"""

    output_path = VIDEOS / 'index.html'
    output_path.write_text(html_page, encoding='utf-8')
    print(f"Generated clean modern index for {len(scenario_files)} scenarios -> {output_path}")


def main():
    build_page()


if __name__ == '__main__':
    main()
