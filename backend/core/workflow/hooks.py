"""
قلاب‌های محاسبهٔ دوبارهٔ کارهای باز (ت۴ و ت۷ طرح ۲.۳). همه هم‌زمان و درون تراکنش فراخوان‌اند و با
safe_recompute در savepoint اجرا می‌شوند تا خطای محاسبهٔ دوباره تغییر اصلی را نشکند.

- permissions_changed (accounts): بسته ← همهٔ کارهای باز؛ نقش، تفاوت مجوز و انتساب ← شرکت‌ها و کاربران.
- ذخیره یا حذف مستقیم SectionAssignment (اکسل، ادمین) ← کاربر انتساب و شرکت آن.
- ذخیره یا حذف WorkflowSubstitute ← کارهای صاحب کار و جانشین.
- ذخیرهٔ کاربر: فقط اگر غیرفعال یا مدیر کل شد **و** ردیف کار دارد (یک exists ارزان؛ برای ذخیرهٔ فقط
  last_login هیچ پرس‌وجویی). فعال شدن دوباره یا برداشته شدن مدیر کلی با محاسبهٔ دوبارهٔ بعدی (هر تغییر انتساب
  یا مجوز در شرکت او) دیده می‌شود.
"""
from .recompute import safe_recompute


def on_permissions_changed(sender, user_ids=(), company_ids=(), reason='', **kwargs):
    if reason == 'bundle':
        safe_recompute(all_tasks=True)
    else:
        safe_recompute(company_ids=set(company_ids), user_ids=set(user_ids))


def on_substitute_changed(sender, instance, **kwargs):
    if kwargs.get('raw'):
        return
    # جانشین هم: اگر صاحب کار عوض شد، ردیف‌های جانشینیِ صاحب کار پیشین از راه ردیف‌های خود جانشین پاک می‌شوند
    safe_recompute(user_ids={u for u in (instance.principal_id, instance.substitute_id) if u})


def _assignment_company_id(assignment):
    """شرکت انتساب (هر سطح)؛ بی‌پرس‌وجو اگر شناسه‌ها یا روابط بارشده کافی باشند، وگرنه یک values_list."""
    from companies.models import Project, ProjectSection, SectionAssignment

    if assignment.company_id:
        return assignment.company_id
    if assignment.project_id:
        if SectionAssignment._meta.get_field('project').is_cached(assignment):
            return assignment.project.company_id
        return Project.objects.filter(pk=assignment.project_id).values_list('company_id', flat=True).first()
    if assignment.section_id:
        if SectionAssignment._meta.get_field('section').is_cached(assignment):
            section = assignment.section
            if ProjectSection._meta.get_field('project').is_cached(section):
                return section.project.company_id
            return Project.objects.filter(pk=section.project_id).values_list('company_id', flat=True).first()
        return (ProjectSection.objects.filter(pk=assignment.section_id)
                .values_list('project__company_id', flat=True).first())
    return None


def on_assignment_changed(sender, instance, **kwargs):
    """
    ذخیره یا حذف مستقیم SectionAssignment (ورود اکسل، پنل ادمین و هر مسیری که notify_assignment_changed را صدا
    نمی‌زند). محاسبهٔ دوبارهٔ تکراری کنار مسیر permissions_changed پذیرفته است (درستی اول).
    """
    if kwargs.get('raw') or not instance.user_id:
        return
    company_id = _assignment_company_id(instance)
    safe_recompute(user_ids={instance.user_id}, company_ids={company_id} if company_id else set())


def on_user_saved(sender, instance, created=False, update_fields=None, raw=False, **kwargs):
    if raw or created or not instance.pk:
        return
    if update_fields is not None and set(update_fields) == {'last_login'}:
        return
    if instance.is_active and not instance.is_superuser:
        return
    from .models import WorkflowTaskRecipient
    if WorkflowTaskRecipient.objects.filter(user_id=instance.pk).exists():
        safe_recompute(user_ids={instance.pk})


def connect():
    from django.contrib.auth import get_user_model
    from django.db.models.signals import post_delete, post_save

    from accounts.permission_events import permissions_changed
    from companies.models import SectionAssignment

    from .models import WorkflowSubstitute

    permissions_changed.connect(on_permissions_changed, dispatch_uid='workflow_permissions_changed')
    post_save.connect(on_assignment_changed, sender=SectionAssignment, dispatch_uid='workflow_assignment_saved')
    post_delete.connect(on_assignment_changed, sender=SectionAssignment, dispatch_uid='workflow_assignment_deleted')
    post_save.connect(on_substitute_changed, sender=WorkflowSubstitute, dispatch_uid='workflow_substitute_saved')
    post_delete.connect(on_substitute_changed, sender=WorkflowSubstitute, dispatch_uid='workflow_substitute_deleted')
    post_save.connect(on_user_saved, sender=get_user_model(), dispatch_uid='workflow_user_saved')
