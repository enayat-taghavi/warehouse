from django.db import models

class _WarehouseCompatQuerySet(models.QuerySet):
    def _remap_wh_filter(self, k):
        if k == 'warehouse':
            return 'warehouse_id'
        if k.startswith('warehouse__'):
            return 'warehouse_id' + k[len('warehouse'):]
        if k == 'assigned_warehouse':
            return 'assigned_warehouse_id'
        if k.startswith('assigned_warehouse__'):
            return 'assigned_warehouse_id' + k[len('assigned_warehouse'):]
        return k

    def filter(self, *args, **kwargs):
        new_kwargs = {}
        for k, v in kwargs.items():
            new_k = self._remap_wh_filter(k)
            new_v = getattr(v, 'id', v) if (new_k.endswith('_id') and hasattr(v, 'id')) else v
            new_kwargs[new_k] = new_v
        return super().filter(*args, **new_kwargs)

    def get_or_create(self, defaults=None, **kwargs):
        new_kwargs = {}
        for k, v in kwargs.items():
            new_k = self._remap_wh_filter(k)
            new_v = getattr(v, 'id', v) if (new_k.endswith('_id') and hasattr(v, 'id')) else v
            new_kwargs[new_k] = new_v
        return super().get_or_create(defaults=defaults, **new_kwargs)

class _WarehouseCompatManager(models.Manager.from_queryset(_WarehouseCompatQuerySet)):
    pass

class _WarehouseCompatMixin(models.Model):
    """
    فاز ۴ — سازگاری رو به عقب برای FK→عدد (جدا کردن حسابداری از اپ انبار).

    نامِ فیلد قدیمیِ `assigned_warehouse`/`warehouse` به‌عنوان kwarg مدل پذیرفته و
    به ستون عددیِ `_id` مپ می‌شود تا کدهای موجود (شامل تست‌ها) بدون تغییر کار کنند.
    هر مدل، `_warehouse_field` و `_warehouse_id_field` را تعیین و پراپرتیِ هم‌نامِ
    فیلد قدیمی را ارائه می‌دهد.
    """
    _warehouse_field = ''      # نام فیلد قدیمی (مثلاً 'assigned_warehouse' یا 'warehouse')
    _warehouse_id_field = ''   # نام ستون عددی (مثلاً 'assigned_warehouse_id' یا 'warehouse_id')

    objects = _WarehouseCompatManager()

    class Meta:
        abstract = True

    def __init__(self, *args, **kwargs):
        src = self._warehouse_field
        if src and src in kwargs:
            val = kwargs.pop(src)
            id_field = self._warehouse_id_field
            if id_field not in kwargs and val is not None:
                kwargs[id_field] = getattr(val, 'id', val)
        super().__init__(*args, **kwargs)

    def _wh_obj(self):
        """خواندن انبار مرتبط در صورت نصب بودن اپ انبار (با کشِ per-instance)."""
        id_field = self._warehouse_id_field
        wh_id = getattr(self, id_field, None)
        if not wh_id:
            return None
        if hasattr(self, '_wh_cached'):
            return self._wh_cached
        # حل از رجیستری پلتفرم؛ بی‌ماژول انبار None (بدون ایمپورت اپ انبار)
        from platform_core.registry import resolve_entity
        obj = resolve_entity('warehouse', wh_id)
        self._wh_cached = obj
        return obj
