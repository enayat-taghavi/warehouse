"""
رویدادها و سیگنال‌های عمومی پلتفرم و هسته — طرح راه میانهٔ ماژولار (گام ۳).

قانون طلایی: ارتباط بین ماژول‌ها و اطلاع‌رسانی از تغییرات قلمروها (مانند حذف انبار یا شرکت)
فقط از طریق رویدادهای هسته انجام می‌شود و هیچ ماژولی نباید مستقیماً مدل‌های ماژول دیگر را
دستکاری یا ایمپورت کند.
"""
from django.dispatch import Signal


class ScopeDeletedSignal(Signal):
    """
    سیگنال حذف یک قلمرو (مانند 'warehouse' یا 'company').
    هم به عنوان Signal استاندارد جنگو (با متدهای connect و send)
    و هم به عنوان شیء فراخوانی‌پذیر `scope_deleted(kind, id)` قابل استفاده است.
    """

    def __call__(self, kind: str, id, **kwargs):
        """
        ارسال آسان رویداد با سینتکس تابع: `scope_deleted('warehouse', warehouse_id)`
        """
        return self.send_robust(sender=kind, kind=kind, id=id, **kwargs)


# رویداد عمومی حذف قلمرو (kind: نوع موجودیت، id: شناسه موجودیت)
scope_deleted = ScopeDeletedSignal()
