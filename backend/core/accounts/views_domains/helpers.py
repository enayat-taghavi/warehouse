# -*- coding: utf-8 -*-
"""
Common helper classes and utilities for accounts views.
"""
import logging
from rest_framework.pagination import PageNumberPagination

logger = logging.getLogger(__name__)

class OptionalPageNumberPagination(PageNumberPagination):
    """
    صفحه‌بندی دوگانه و هوشمند (Dual-Mode Smart Pagination):
    اگر کلاینت پارامترهای صفحه‌بندی (page، page_size یا paginate=true) را ارسال کند،
    پاسخ استاندارد صفحه‌بندی‌شده ({ count, next, previous, results }) تحویل داده می‌شود.
    در غیر این صورت، جهت حفظ پایداری کامل دراپ‌دان‌ها، فرم‌های تخصیص کالا و کش‌های کلاینت،
    پاسخ به صورت آرایه مستقیم بازگردانده می‌شود.
    """
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 500

    def paginate_queryset(self, queryset, request, view=None):
        if 'page' not in request.query_params and 'page_size' not in request.query_params and request.query_params.get('paginate') != 'true':
            return None
        return super().paginate_queryset(queryset, request, view=view)

__all__ = [
    'OptionalPageNumberPagination',
    'logger',
]
