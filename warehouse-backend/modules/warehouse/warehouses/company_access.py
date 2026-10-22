"""
سهم انبار در عضویت شرکت (طرح مجوزهای بخش‌به‌بخش شرکت، ت۷): کاربرِ منسوب به انبارِ فعال و
دارای شرکت، عضو همان شرکت است. در `WarehousesConfig.ready()` در هستهٔ companies ثبت می‌شود.
"""
from django.db.models import Q


def warehouse_derived_company_source(user):
    from warehouses.models import Warehouse
    details, seen = [], set()
    for wh in (Warehouse.objects.filter(assigned_users=user, is_active=True, company__isnull=False)
               .select_related('company').order_by('id')):
        if wh.company_id in seen:
            continue
        seen.add(wh.company_id)
        details.append({
            'company_id': wh.company_id,
            'company_name': wh.company.name,
            'company_code': wh.company.code,
            'source_label': f"از انبار {wh.name}",
        })
    return details


def build_warehouse_member_q(allowed_cids):
    return Q(assigned_warehouses__is_active=True, assigned_warehouses__company_id__in=allowed_cids)


def warehouse_member_sources(company_id):
    """{user_id: [برچسب منبع]} برای اعضای یک شرکت از راه انبار (نمایش در تب «دسترسی»)."""
    from warehouses.models import Warehouse
    result = {}
    for wh in Warehouse.objects.filter(company_id=company_id, is_active=True).prefetch_related('assigned_users'):
        for u in wh.assigned_users.all():
            result.setdefault(u.id, []).append(f"از انبار {wh.name}")
    return result
