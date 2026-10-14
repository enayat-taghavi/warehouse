import django_filters
from .models import Item, ItemFieldDefinition
from django.db.models import Q

class CharInFilter(django_filters.BaseInFilter, django_filters.CharFilter):
    pass

class ItemFilter(django_filters.FilterSet):
    # Multiple choice filters
    field_assignee__in = CharInFilter(field_name='field_assignee', lookup_expr='in')
    doc_assignee__in = CharInFilter(field_name='doc_assignee', lookup_expr='in')
    field_status__in = CharInFilter(field_name='field_status', lookup_expr='in')
    doc_status__in = CharInFilter(field_name='doc_status', lookup_expr='in')
    labelStatus__in = CharInFilter(field_name='tag_status', lookup_expr='in')
    tag_status__in = CharInFilter(field_name='tag_status', lookup_expr='in')

    # Date ranges
    created_at_after = django_filters.DateTimeFilter(field_name='created_at', lookup_expr='gte')
    created_at_before = django_filters.DateTimeFilter(field_name='created_at', lookup_expr='lte')
    updated_at_after = django_filters.DateTimeFilter(field_name='updated_at', lookup_expr='gte')
    updated_at_before = django_filters.DateTimeFilter(field_name='updated_at', lookup_expr='lte')
    hov_date_after = django_filters.DateFilter(field_name='hov_date', lookup_expr='gte')
    hov_date_before = django_filters.DateFilter(field_name='hov_date', lookup_expr='lte')

    my_tag__in = django_filters.CharFilter(method='filter_tags_in')

    def filter_tags_in(self, queryset, name, value):
        if not value:
            return queryset
        tags = value.split(',')
        query = Q()
        for t in tags:
            query |= Q(my_tag__icontains=t.strip())
        return queryset.filter(query)

    created_by_name__in = django_filters.CharFilter(method='filter_created_by_name_in')
    modified_by_name__in = django_filters.CharFilter(method='filter_modified_by_name_in')

    def filter_created_by_name_in(self, queryset, name, value):
        if not value:
            return queryset
        names = [n.strip() for n in value.split(',')]
        query = Q()
        for n in names:
            query |= Q(created_by__first_name__icontains=n) | Q(created_by__last_name__icontains=n) | Q(created_by__username__icontains=n)
        return queryset.filter(query)

    def filter_modified_by_name_in(self, queryset, name, value):
        if not value:
            return queryset
        names = [n.strip() for n in value.split(',')]
        query = Q()
        for n in names:
            query |= Q(modified_by__first_name__icontains=n) | Q(modified_by__last_name__icontains=n) | Q(modified_by__username__icontains=n)
        return queryset.filter(query)

    created_by_name = django_filters.CharFilter(method='filter_created_by_name_search')
    modified_by_name = django_filters.CharFilter(method='filter_modified_by_name_search')

    def filter_created_by_name_search(self, queryset, name, value):
        if not value: return queryset
        return queryset.filter(Q(created_by__first_name__icontains=value) | Q(created_by__last_name__icontains=value) | Q(created_by__username__icontains=value))

    def filter_modified_by_name_search(self, queryset, name, value):
        if not value: return queryset
        return queryset.filter(Q(modified_by__first_name__icontains=value) | Q(modified_by__last_name__icontains=value) | Q(modified_by__username__icontains=value))

    # Text search
    description = django_filters.CharFilter(lookup_expr='icontains')
    my_tag = django_filters.CharFilter(lookup_expr='icontains')
    field_assignee = django_filters.CharFilter(lookup_expr='icontains')
    fa_unic_code = django_filters.CharFilter(lookup_expr='icontains')
    new_location = django_filters.CharFilter(lookup_expr='icontains')

    # Text search for other fields (icontains)
    unit = django_filters.CharFilter(lookup_expr='icontains')
    scope_discipline = django_filters.CharFilter(lookup_expr='icontains')
    vendor = django_filters.CharFilter(lookup_expr='icontains')
    supplier = django_filters.CharFilter(lookup_expr='icontains')
    irn_no = django_filters.CharFilter(lookup_expr='icontains')
    po = django_filters.CharFilter(lookup_expr='icontains')
    pk_number = django_filters.CharFilter(lookup_expr='icontains')
    pl = django_filters.CharFilter(lookup_expr='icontains')
    indent = django_filters.CharFilter(lookup_expr='icontains')
    remark = django_filters.CharFilter(lookup_expr='icontains')
    hov_no = django_filters.CharFilter(lookup_expr='icontains')
    msr_status = django_filters.CharFilter(lookup_expr='icontains')
    currency = django_filters.CharFilter(lookup_expr='icontains')
    invoice_page = django_filters.CharFilter(lookup_expr='icontains')
    # New fields
    request_number_of_table = django_filters.CharFilter(lookup_expr='icontains')
    tag = django_filters.CharFilter(lookup_expr='icontains')
    size = django_filters.CharFilter(lookup_expr='icontains')
    invoice_type = django_filters.CharFilter(lookup_expr='icontains')
    invoice_date = django_filters.CharFilter(lookup_expr='icontains')
    inv_rti_number = django_filters.CharFilter(lookup_expr='icontains')
    added_rti_no = django_filters.CharFilter(lookup_expr='icontains')
    page_row = django_filters.CharFilter(lookup_expr='icontains')
    doc_supplier = django_filters.CharFilter(lookup_expr='icontains')
    folder_address = django_filters.CharFilter(lookup_expr='icontains')
    hyperlink = django_filters.CharFilter(lookup_expr='icontains')
    desc_from_standard_system = django_filters.CharFilter(lookup_expr='icontains')
    unit_from_standard_system = django_filters.CharFilter(lookup_expr='icontains')
    stamp = django_filters.CharFilter(lookup_expr='icontains')
    signature = django_filters.CharFilter(lookup_expr='icontains')
    
    # Exact matches for numeric fields
    inventory = django_filters.NumberFilter(lookup_expr='exact')
    bal4miv = django_filters.NumberFilter(lookup_expr='exact')
    price_amount = django_filters.NumberFilter(lookup_expr='exact')

    # Number ranges
    inventory_min = django_filters.NumberFilter(field_name='inventory', lookup_expr='gte')
    inventory_max = django_filters.NumberFilter(field_name='inventory', lookup_expr='lte')
    
    # فیلتر امن بر اساس شناسه عددی انبار بدون پرتاب خطای اعتبارسنجی در صورت ناموجود بودن انبار
    warehouse = django_filters.NumberFilter(field_name='warehouse_id', lookup_expr='exact')

    class Meta:
        model = Item
        fields = {
            'field_assignee': ['exact', 'isnull'],
            'doc_assignee': ['exact', 'isnull'],
            'field_status': ['exact', 'in'],
            'doc_status': ['exact', 'in'],
            'tag_status': ['exact', 'in'],
            'has_conflict': ['exact'],
        }


class ItemFieldDefinitionFilter(django_filters.FilterSet):
    """فیلتر امن فیلدهای پویا بر اساس انبار بدون خطای 400 جنگو در صورت حذف یا نبود انبار"""
    warehouse = django_filters.NumberFilter(field_name='warehouse_id', lookup_expr='exact')

    class Meta:
        model = ItemFieldDefinition
        fields = ['warehouse']
