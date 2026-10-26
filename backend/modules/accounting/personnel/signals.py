from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import Company, CompanyBankAccount, CompanyDocument, PartyBankAccount, SectionAssignment, UserCompanyAccess


@receiver(post_delete, sender=CompanyBankAccount)
def handle_bank_account_deleted(sender, instance, **kwargs):
    """
    با حذف حساب اصلی، تازه‌ترین حساب فعال باقی‌مانده اصلی می‌شود. یکتایی حساب اصلی در save() مدل است (ت۶ طرح ۲.۱).
    """
    comp_id = instance.company_id
    if not comp_id or not instance.is_primary:
        return
    # فقط حساب فعال اصلی می‌شود؛ primary_bank_account() حساب غیرفعال را نمی‌پذیرد (data-loss-reviewer)
    remaining = CompanyBankAccount.objects.filter(company_id=comp_id, is_active=True).order_by('-created_at').first()
    if remaining:
        remaining.is_primary = True
        remaining.save()



@receiver(post_delete, sender=PartyBankAccount)
def handle_party_bank_account_deleted(sender, instance, **kwargs):
    """با حذف حساب اصلی طرف بیرونی، تازه‌ترین حساب فعال باقی‌مانده‌اش اصلی می‌شود (ص۳ طرح ۳.۱)."""
    if not instance.is_primary:
        return
    remaining = PartyBankAccount.objects.filter(party_id=instance.party_id, is_active=True).order_by('-created_at').first()
    if remaining:
        remaining.is_primary = True
        remaining.save()


@receiver(post_save, sender=Company)
def sync_company_core_documents(sender, instance, created, **kwargs):
    """
    سینک خودکار اسناد مادر آپلودشده روی کارت شرکت (اساسنامه و روزنامه رسمی) با جدول CompanyDocument
    جهت رفع ناهماهنگی و دوگانگی ذخیره‌سازی مدارک
    """
    # ۱. اساسنامه
    if instance.articles_of_association:
        doc = CompanyDocument.objects.filter(
            company=instance, document_type='statute'
        ).first()
        if not doc:
            CompanyDocument.objects.create(
                company=instance,
                document_type='statute',
                title=f"اساسنامه ثبتی {instance.name}",
                file=instance.articles_of_association,
                is_confidential=False,
                version=1
            )

    # ۲. آخرین روزنامه رسمی
    if instance.latest_gazette:
        doc = CompanyDocument.objects.filter(
            company=instance, document_type='changes_gazette'
        ).first()
        if not doc:
            CompanyDocument.objects.create(
                company=instance,
                document_type='changes_gazette',
                title=f"آخرین روزنامه رسمی {instance.name}",
                file=instance.latest_gazette,
                is_confidential=False,
                version=1
            )


def _assignment_company_name(assignment):
    """نام شرکتی که انتساب در آن معتبر است، در هر سه سطح (شرکت، پروژه یا بخش؛ طرح ۲.۱، ت۳)."""
    if assignment.company_id:
        return assignment.company.name
    project = assignment.target_project
    return project.company.name if project is not None and project.company_id else None


@receiver(post_save, sender=SectionAssignment)
def handle_user_section_assignment_saved(sender, instance, created, **kwargs):
    """
    همگام‌سازی بلادرنگ نام شرکت سازمانی کاربر بر مبنای شرکتِ انتساب (هر سه سطح)
    """
    if not instance.user_id or not instance.is_active:
        return
    company_name = _assignment_company_name(instance)
    if company_name and instance.user.company != company_name:
        instance.user.company = company_name
        instance.user.save(update_fields=['company'])


@receiver(post_delete, sender=SectionAssignment)
def handle_user_section_assignment_deleted(sender, instance, **kwargs):
    """
    بازبینی نام شرکت کاربر پس از حذف انتساب (هر سه سطح)
    """
    if not instance.user:
        return
    user = instance.user
    remaining = SectionAssignment.objects.filter(user=user, is_active=True).select_related(
        'company', 'project__company', 'section__project__company'
    ).first()
    new_name = _assignment_company_name(remaining) if remaining else None

    if new_name:
        if user.company != new_name:
            user.company = new_name
            user.save(update_fields=['company'])
    elif not user.is_superuser and user.company:
        user.company = None
        user.save(update_fields=['company'])


# ─── رویداد حذف قلمروهای هسته/انبار (طرح راه میانهٔ ماژولار گام ۳) ───
from platform_core.events import scope_deleted


@receiver(scope_deleted)
def handle_scope_deleted(sender, kind, id, **kwargs):
    """
    هنگام حذف یک قلمرو در هسته یا انبار (مانند 'warehouse')، شناسه‌های متناظر در ۵ مدل مالی
    خالی می‌شوند (رفتار: خالی کردن فیلدها و نه حذف رکوردهای مالی).
    """
    if kind == 'warehouse' and id:
        try:
            from .models import (
                PersonnelProfile, VehicleDriverProfile,
                DailyAttendance, MonthlyWorkPeriod, VehicleTripLog
            )
            PersonnelProfile.objects.filter(assigned_warehouse_id=id).update(assigned_warehouse_id=None)
            VehicleDriverProfile.objects.filter(assigned_warehouse_id=id).update(assigned_warehouse_id=None)
            DailyAttendance.objects.filter(warehouse_id=id).update(warehouse_id=None)
            MonthlyWorkPeriod.objects.filter(warehouse_id=id).update(warehouse_id=None)
            VehicleTripLog.objects.filter(warehouse_id=id).update(warehouse_id=None)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"[PersonnelSignals] Error clearing warehouse_id on scope_deleted: {e}")


def seed_expense_heads_for_new_company(sender, instance, created, raw=False, **kwargs):
    """شرکت تازه فهرست پیش‌فرض سرفصل‌های هزینه را می‌گیرد (ص۵ طرح ۳.۴)؛ بارگذاری fixture (raw) نه."""
    if created and not raw:
        from .expense_heads import seed_default_expense_heads
        seed_default_expense_heads(instance)
