"""
پرس‌وجوهای «کارهای من» (ت۴ و ت۱۹ طرح ۲.۳) از ردیف‌های ذخیره‌شده، با شمار پرس‌وجوی ثابت در هر صفحه (ق۱۸).
ردیف معتبر امروز: ردیف اصلی همیشه، ردیف جانشین فقط در بازه‌اش. مدیر کل ردیف ویژه‌ای ندارد (دریافت‌کننده نیست)؛
کارهای بی‌دریافت‌کننده را در تب جدای unassigned_open_tasks می‌بیند.
"""
from django.db.models import Prefetch
from django.utils import timezone

from .models import WorkflowTask, WorkflowTaskRecipient
from .recipients import valid_rows_q

_RELATED = ('instance', 'instance__section', 'instance__company', 'referred_by')


def _my_rows(user, today):
    return WorkflowTaskRecipient.objects.filter(user_id=user.pk).filter(valid_rows_q(today))


def _live(user):
    return bool(user) and getattr(user, 'is_active', False) and getattr(user, 'pk', None)


def tasks_for_user(user, today=None):
    """
    queryset کارهای باز کاربر (ردیف معتبر امروز)، جدیدترین اول. هر کار `my_rows` دارد: ردیف‌های همین کاربر با
    on_behalf_of بارشده (برچسب «به جانشینی از …» و بازه). یک صفحه = دو پرس‌وجو (کارها + ردیف‌ها).
    """
    if not _live(user):
        return WorkflowTask.objects.none()
    today = today or timezone.localdate()
    rows = _my_rows(user, today)
    return (
        WorkflowTask.objects.filter(is_open=True, id__in=rows.values('task_id'))
        .select_related(*_RELATED)
        .prefetch_related(Prefetch('recipients', queryset=rows.select_related('on_behalf_of').order_by('id'),
                                   to_attr='my_rows'))
        .order_by('-opened_at', '-id')
    )


def count_tasks_for_user(user, today=None) -> int:
    """شمار کارهای باز کاربر برای شمارندهٔ منو؛ یک پرس‌وجو."""
    if not _live(user):
        return 0
    today = today or timezone.localdate()
    return WorkflowTask.objects.filter(is_open=True, id__in=_my_rows(user, today).values('task_id')).count()


def unassigned_open_tasks(user, company_id=None):
    """
    کارهای باز بی‌دریافت‌کنندهٔ اصلی (تب مدیر کل)، جدیدترین اول. فقط برای مدیر کل فعال؛ برای دیگران none().
    company_id: محدود به نمونه‌های همان شرکت.
    """
    if not (_live(user) and getattr(user, 'is_superuser', False)):
        return WorkflowTask.objects.none()
    qs = WorkflowTask.objects.filter(is_open=True, has_recipients=False)
    if company_id is not None:
        qs = qs.filter(instance__company_id=company_id)
    return qs.select_related(*_RELATED).order_by('-opened_at', '-id')
