import os
import re
from typing import Optional, Tuple, Any
from django.utils import timezone

try:
    import jdatetime
except ImportError:
    jdatetime = None


def get_current_shamsi_date_str() -> str:
    """Return Shamsi date string in YYYY-MM-DD format"""
    if jdatetime:
        now_shamsi = jdatetime.datetime.now()
        return now_shamsi.strftime('%Y-%m-%d')
    return timezone.now().strftime('%Y-%m-%d')


def get_current_shamsi_year_str() -> str:
    """Return Shamsi year in YYYY format"""
    if jdatetime:
        return str(jdatetime.datetime.now().year)
    return str(timezone.now().year)


def sanitize_filename(name: str) -> str:
    """Remove illegal characters for filesystem and Google Drive display"""
    # Replace dangerous characters while preserving Persian and English characters
    clean = re.sub(r'[\\/*?:"<>|]', '_', name)
    clean = re.sub(r'\s+', '_', clean).strip('_')
    return clean[:200]


class GoogleDrivePathResolver:
    """
    موتور هوشمند نگاشت موجودیت‌های داده به ساختار پوشه‌بندی و نام‌گذاری استاندارد گوگل‌درایو
    منطبق بر ساختار سلسله‌مراتبی:
    پوشه سراسری / سامانه انبارداری یا حسابداری / پروژه / بخش / سال و دسته / فایل معنادار
    """

    @classmethod
    def resolve(cls, instance, field_name: str = 'file', file_obj=None, orig_name: Optional[str] = None) -> Optional[Tuple[Any, str, str]]:
        """
        ورودی: نمونه مدل جنگو و نام فیلد فایل
        خروجی: تاپل سه تایی:
        (company, target_folder_path, target_filename)
        یا None در صورتی که امکان همگام‌سازی وجود نداشته باشد.
        """
        model_name = instance.__class__.__name__
        shamsi_date = get_current_shamsi_date_str()
        shamsi_year = get_current_shamsi_year_str()

        # استخراج نام فایل اصلی
        if not orig_name:
            if file_obj and hasattr(file_obj, 'name'):
                orig_name = os.path.basename(file_obj.name)
            elif hasattr(instance, field_name):
                file_field = getattr(instance, field_name)
                if file_field and hasattr(file_field, 'name'):
                    orig_name = os.path.basename(file_field.name)

        ext = os.path.splitext(orig_name)[1] if orig_name else ""
        if not ext and orig_name and '.' in orig_name:
            ext = f".{orig_name.split('.')[-1]}"

        # =====================================================================
        # ۱. اسناد مرکزی شرکت (CompanyDocument, Company Core Docs)
        # =====================================================================
        if model_name == 'CompanyDocument':
            company = instance.company
            doc_type_label = instance.get_document_type_display() if hasattr(instance, 'get_document_type_display') else "سند"
            folder = f"سامانه حسابداری و اداری/اسناد مرکزی شرکت/{doc_type_label}"
            title = sanitize_filename(instance.title or doc_type_label)
            filename = f"{shamsi_date}_{doc_type_label}_{instance.id}_{title}{ext}"
            return company, folder, filename

        elif model_name == 'Company':
            company = instance
            doc_label = "اساسنامه" if field_name == 'articles_of_association' else "روزنامه_رسمی" if field_name == 'latest_gazette' else "لوگو"
            folder = f"سامانه حسابداری و اداری/اسناد مرکزی شرکت/{doc_label}"
            filename = f"{shamsi_date}_{doc_label}_{company.code}{ext}"
            return company, folder, filename

        elif model_name == 'CompanyBoardMember':
            company = instance.company
            doc_label = "کارت_ملی_شناسنامه" if field_name == 'attached_id_doc' else "حکم_انتصاب"
            raw_full_name = getattr(instance, 'full_name', None) or f"{getattr(instance, 'first_name', '')} {getattr(instance, 'last_name', '')}".strip()
            member_name = sanitize_filename(raw_full_name or f"عضو_{instance.id}")
            folder = f"سامانه حسابداری و اداری/اسناد مرکزی شرکت/ارکان_و_هیئت_مدیره/{member_name}"
            filename = f"{shamsi_date}_{doc_label}_{member_name}{ext}"
            return company, folder, filename

        # =====================================================================
        # ۲. فاکتورها، تنخواه‌ها و اسناد مالی (Invoice, ExpenseInvoice, PettyCashTransaction)
        # =====================================================================
        elif model_name in ('Invoice', 'ExpenseInvoice'):
            company = getattr(instance, 'company', None)
            project_name = "پروژه_عمومی"
            section_name = "بخش_عمومی"

            section = getattr(instance, 'section', None)
            project = getattr(instance, 'project', None)
            if not project and section and hasattr(section, 'project') and section.project:
                project = section.project

            if project:
                project_name = sanitize_filename(project.name)
                if not company and getattr(project, 'company', None):
                    company = project.company

            if section:
                section_name = sanitize_filename(section.name)

            if not company:
                # Fallback to active company or first company
                from .models import Company
                company = Company.objects.filter(is_active=True).first()

            if not company:
                return None

            inv_date = getattr(instance, 'invoice_date_shamsi', None)
            if inv_date and len(str(inv_date).strip()) >= 4:
                doc_date = str(inv_date).strip().replace('/', '-')
                doc_year = doc_date.split('-')[0] if '-' in doc_date else shamsi_year
            else:
                doc_date = shamsi_date
                doc_year = shamsi_year

            inv_num = getattr(instance, 'invoice_number', str(instance.id)) or str(instance.id)
            inv_desc = getattr(instance, 'category', None) or getattr(instance, 'description', None) or (os.path.splitext(orig_name)[0] if orig_name else 'سند')
            clean_desc = sanitize_filename(inv_desc)[:40]
            folder = f"سامانه حسابداری و اداری/{project_name}/{section_name}/فاکتورها_و_تنخواه/{doc_year}"
            filename = f"{doc_date}_فاکتور_{inv_num}_{clean_desc}{ext}"
            return company, folder, filename

        elif model_name == 'PettyCashTransaction':
            account = getattr(instance, 'account', None)
            company = getattr(account, 'company', None) if account else None
            project_name = "پروژه_تنخواه"
            section_name = "تنخواه_گردان"

            section = getattr(instance, 'section', None)
            project = None
            if account:
                if not section:
                    section = getattr(account, 'section', None)
                project = getattr(account, 'project', None)

            if section:
                section_name = sanitize_filename(section.name)
                if not project and hasattr(section, 'project') and section.project:
                    project = section.project

            if project:
                project_name = sanitize_filename(project.name)
                if not company and getattr(project, 'company', None):
                    company = project.company

            if not company:
                from .models import Company
                company = Company.objects.filter(is_active=True).first()

            if not company:
                return None

            tx_shamsi = getattr(instance, 'transaction_date_shamsi', None)
            if tx_shamsi and len(str(tx_shamsi).strip()) >= 4:
                doc_date = str(tx_shamsi).strip().replace('/', '-')
                doc_year = doc_date.split('-')[0] if '-' in doc_date else shamsi_year
            else:
                doc_date = shamsi_date
                doc_year = shamsi_year

            tx_num = getattr(instance, 'receipt_number', None) or getattr(instance, 'tracking_code', None) or str(instance.id)
            tx_title = sanitize_filename(getattr(instance, 'title', None) or getattr(instance, 'category', 'تنخواه'))[:40]
            folder = f"سامانه حسابداری و اداری/{project_name}/{section_name}/رسیدهای_تنخواه/{doc_year}"
            filename = f"{doc_date}_رسید_تنخواه_{tx_num}_{tx_title}{ext}"
            return company, folder, filename

        # =====================================================================
        # ۳. مدارک پرسنلی (PersonnelProfile, PersonnelDocument)
        # =====================================================================
        elif model_name == 'PersonnelProfile':
            company = getattr(instance, 'company', None)
            if not company:
                from .models import Company
                company = Company.objects.filter(is_active=True).first()

            if not company:
                return None

            full_name = sanitize_filename(f"{instance.first_name}_{instance.last_name}" if hasattr(instance, 'first_name') else f"پرسنل_{instance.id}")
            nat_id = getattr(instance, 'national_code', None) or getattr(instance, 'national_id', str(instance.id))
            folder = f"سامانه حسابداری و اداری/مدارک پرسنلی/{full_name}_{nat_id}"
            filename = f"{shamsi_date}_مدارک_هویتی_{full_name}_{nat_id}{ext}"
            return company, folder, filename

        elif model_name == 'PersonnelDocument':
            personnel = getattr(instance, 'personnel', None)
            company = getattr(personnel, 'company', None) if personnel else None
            if not company:
                from .models import Company
                company = Company.objects.filter(is_active=True).first()

            if not company:
                return None

            full_name = sanitize_filename(f"{personnel.first_name}_{personnel.last_name}" if personnel and hasattr(personnel, 'first_name') else f"پرسنل_{getattr(personnel, 'id', instance.id)}")
            nat_id = getattr(personnel, 'national_code', None) or getattr(personnel, 'national_id', str(getattr(personnel, 'id', instance.id)))
            doc_type = instance.get_doc_type_display() if hasattr(instance, 'get_doc_type_display') else getattr(instance, 'doc_type', 'سند')
            folder = f"سامانه حسابداری و اداری/مدارک پرسنلی/{full_name}_{nat_id}"
            filename = f"{shamsi_date}_{sanitize_filename(doc_type)}_{full_name}_{instance.id}{ext}"
            return company, folder, filename

        # =====================================================================
        # ۴. اسناد و مدارک ناوگان و خودروها (VehicleDocument, VehicleDriverProfile)
        # =====================================================================
        elif model_name == 'VehicleDocument':
            vehicle = getattr(instance, 'vehicle', None)
            company = getattr(vehicle, 'company', None) if vehicle else None
            if not company:
                from .models import Company
                company = Company.objects.filter(is_active=True).first()

            if not company:
                return None

            plate = sanitize_filename(getattr(vehicle, 'plate_number', f"خودرو_{vehicle.id if vehicle else instance.id}"))
            doc_type_display = instance.get_doc_type_display() if hasattr(instance, 'get_doc_type_display') else "مدرک"
            doc_title = sanitize_filename(instance.title or doc_type_display)[:40]
            doc_date = getattr(instance, 'issue_date', None) or shamsi_date
            if doc_date and '/' in doc_date:
                doc_date = doc_date.replace('/', '-')

            folder = f"سامانه حسابداری و اداری/ناوگان و خودروها/{plate}"
            filename = f"{doc_date}_{doc_title}_{plate}_{instance.id}{ext}"
            return company, folder, filename

        # =====================================================================
        # ۵. تصاویر کالاهای انبارگردانی و اقلام انبار (ItemPhoto)
        # =====================================================================
        elif model_name == 'ItemPhoto':
            item = getattr(instance, 'item', None)
            warehouse_name = "انبار_مرکزی"
            company = None

            if item and hasattr(item, 'warehouse') and item.warehouse:
                warehouse = item.warehouse
                warehouse_name = sanitize_filename(warehouse.name)
                company = getattr(warehouse, 'company', None)

            if not company:
                from .models import Company
                company = Company.objects.filter(is_active=True).first()

            if not company:
                return None

            item_code = sanitize_filename(getattr(item, 'fa_unic_code', None) or getattr(item, 'code', None) or str(instance.id))
            item_desc = sanitize_filename(getattr(item, 'description', None) or getattr(item, 'name', None) or 'کالا')[:40]
            folder = f"سامانه انبارداری/{warehouse_name}/تصاویر کالاها/{item_code}_{item_desc}"
            filename = f"{shamsi_date}_عکس_کالا_کد{item_code}_{instance.id}{ext or '.webp'}"
            return company, folder, filename

        # =====================================================================
        # ۶. فایل‌های پشتیبان پایگاه داده (Database Backups)
        # =====================================================================
        elif model_name in ('BackupFile', 'DatabaseBackup'):
            # Backups are company-specific or global
            company = getattr(instance, 'company', None)
            if not company:
                from .models import Company
                company = Company.objects.filter(is_active=True).first()

            if not company:
                return None

            filename = getattr(instance, 'filename', orig_name or f"backup_{shamsi_date}.dump")
            folder = f"پشتیبان‌های پایگاه داده/{shamsi_year}"
            return company, folder, filename

        return None
