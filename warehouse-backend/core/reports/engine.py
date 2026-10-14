"""
لایه سازگاری موتور کوئری گزارش‌ساز (فاز ۵ طرح جداسازی).
مرجع: Documents/Modular_Split_Warehouse_Accounting/implementation_plan_modular_split.md §۵

موتور اصلی به `platform_core.query_engine` منتقل شده است. این ماژول
تمامی نام‌ها و کلاس‌ها را بازصادرات (re-export) می‌کند تا کدهای موجود بدون
تغییر کار کنند.
"""
from platform_core.query_engine.engine import (
    AGG_MAP,
    ALIAS_RE,
    HAVING_OPERATORS,
    MAX_FILTER_CONDITIONS,
    MAX_FILTER_DEPTH,
    MAX_HAVING_CONDITIONS,
    MAX_JOINS,
    MAX_PAGE_SIZE,
    OPERATOR_LOOKUPS,
    STATEMENT_TIMEOUT_MS,
    ReportEngine,
    ReportError,
    _jsonable,
    _safe_float,
)

__all__ = [
    'ReportEngine',
    'ReportError',
    'MAX_FILTER_DEPTH',
    'MAX_FILTER_CONDITIONS',
    'MAX_HAVING_CONDITIONS',
    'MAX_PAGE_SIZE',
    'MAX_JOINS',
    'HAVING_OPERATORS',
    'STATEMENT_TIMEOUT_MS',
    'ALIAS_RE',
    'AGG_MAP',
    'OPERATOR_LOOKUPS',
    '_jsonable',
    '_safe_float',
]
