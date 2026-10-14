from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import Company, CompanyBankAccount, CompanyDocument, UserSectionAssignment, UserCompanyAccess


@receiver(post_save, sender=CompanyBankAccount)
def handle_bank_account_saved(sender, instance, created, **kwargs):
    """
    همگام‌سازی خودکار حساب بانکی اصلی شرکت پس از ذخیره رکورد
    """
    comp_id = instance.company_id
    if not comp_id:
        return

    if instance.is_primary:
        # ۱. سایر حساب‌های این شرکت غیر اصلی شوند
        CompanyBankAccount.objects.filter(
            company_id=comp_id, is_primary=True
        ).exclude(pk=instance.pk).update(is_primary=False)

        # ۲. فیلدهای تجمیعی روی جدول Company به‌روزرسانی شوند
        Company.objects.filter(pk=comp_id).update(
            primary_bank_name=instance.bank_name,
            primary_account_number=instance.account_number,
            primary_iban=instance.sheba_number
        )


@receiver(post_delete, sender=CompanyBankAccount)
def handle_bank_account_deleted(sender, instance, **kwargs):
    """
    همگام‌سازی خودکار حساب بانکی اصلی شرکت پس از حذف رکورد
    """
    comp_id = instance.company_id
    if not comp_id:
        return

    if instance.is_primary:
        remaining = CompanyBankAccount.objects.filter(company_id=comp_id).order_by('-created_at').first()
        if remaining:
            remaining.is_primary = True
            remaining.save()
        else:
            Company.objects.filter(pk=comp_id).update(
                primary_bank_name=None,
                primary_account_number=None,
                primary_iban=None
            )


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


@receiver(post_save, sender=UserSectionAssignment)
def handle_user_section_assignment_saved(sender, instance, created, **kwargs):
    """
    همگام‌سازی بلادرنگ نام شرکت سازمانی کاربر بر مبنای بخش‌های پروژه انتساب‌یافته
    """
    if not instance.user or not instance.section or not instance.is_active:
        return
    proj = instance.section.project
    if proj and proj.company:
        comp = proj.company
        if instance.user.company != comp.name:
            instance.user.company = comp.name
            instance.user.save(update_fields=['company'])


@receiver(post_delete, sender=UserSectionAssignment)
def handle_user_section_assignment_deleted(sender, instance, **kwargs):
    """
    بازبینی نام شرکت کاربر پس از حذف انتساب بخش
    """
    if not instance.user:
        return
    user = instance.user
    remaining = UserSectionAssignment.objects.filter(
        user=user, is_active=True, section__project__company__isnull=False
    ).select_related('section__project__company').first()

    if remaining and remaining.section and remaining.section.project and remaining.section.project.company:
        new_name = remaining.section.project.company.name
        if user.company != new_name:
            user.company = new_name
            user.save(update_fields=['company'])
    elif not user.is_superuser and user.company:
        user.company = None
        user.save(update_fields=['company'])
