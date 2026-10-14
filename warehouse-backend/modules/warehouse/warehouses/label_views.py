from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.http import HttpResponse
from django.db.models import Q

from .models import LabelTemplate
from .label_serializers import LabelTemplateSerializer
from inventory.models import Item, ItemFieldDefinition


class LabelTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = LabelTemplateSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return LabelTemplate.objects.none()

        qs = LabelTemplate.objects.all()

        if not user.is_superuser:
            assigned_wh_ids = list(user.assigned_warehouses.values_list('id', flat=True))
            qs = qs.filter(Q(warehouse_id__in=assigned_wh_ids) | Q(warehouse__isnull=True))

        warehouse_param = self.request.query_params.get('warehouse')
        if warehouse_param:
            try:
                wh_id = int(warehouse_param)
                qs = qs.filter(Q(warehouse_id=wh_id) | Q(warehouse__isnull=True))
            except (ValueError, TypeError):
                pass

        return qs

    def perform_create(self, serializer):
        user = self.request.user
        target_warehouse = serializer.validated_data.get('warehouse')

        if target_warehouse is None:
            if not (user.is_superuser or user.has_perm('accounts.perm_sys_settings')):
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('تعریف قالب سراسری منحصراً در اختیار مدیر ارشد سیستم است.')
        else:
            if not user.is_superuser:
                has_edit_perm = user.has_perm('accounts.perm_wh_edit') or user.has_perm('accounts.view_wh_label_designer')
                if not has_edit_perm:
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied('شما مجوز ایجاد یا ویرایش قالب انبار را ندارید.')
                if not user.assigned_warehouses.filter(id=target_warehouse.id).exists():
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied('شما به این انبار دسترسی ندارید.')

        serializer.save()

    def perform_update(self, serializer):
        user = self.request.user
        instance = self.get_object()
        target_warehouse = serializer.validated_data.get('warehouse', instance.warehouse)

        if instance.warehouse is None:
            if not (user.is_superuser or user.has_perm('accounts.perm_sys_settings')):
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('ویرایش قالب سراسری منحصراً در اختیار مدیر ارشد سیستم است.')
        else:
            if not user.is_superuser:
                has_edit_perm = user.has_perm('accounts.perm_wh_edit') or user.has_perm('accounts.view_wh_label_designer')
                if not has_edit_perm:
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied('شما مجوز ویرایش قالب این انبار را ندارید.')
                if not user.assigned_warehouses.filter(id=instance.warehouse_id).exists():
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied('شما به انبار فعلی این قالب دسترسی ندارید.')

        if target_warehouse != instance.warehouse:
            if target_warehouse is None:
                if not (user.is_superuser or user.has_perm('accounts.perm_sys_settings')):
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied('تبدیل قالب انبار به قالب سراسری منحصراً در اختیار مدیر ارشد است.')
            else:
                if not user.is_superuser and not user.assigned_warehouses.filter(id=target_warehouse.id).exists():
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied('شما به انبار مقصد جدید دسترسی ندارید.')

        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user

        if instance.warehouse is None:
            if not (user.is_superuser or user.has_perm('accounts.perm_sys_settings')):
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('حذف قالب سراسری منحصراً در اختیار مدیر ارشد سیستم است.')
        else:
            if not user.is_superuser:
                has_edit_perm = user.has_perm('accounts.perm_wh_edit') or user.has_perm('accounts.view_wh_label_designer')
                if not has_edit_perm:
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied('شما مجوز حذف قالب این انبار را ندارید.')
                if not user.assigned_warehouses.filter(id=instance.warehouse_id).exists():
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied('شما به انبار این قالب دسترسی ندارید.')

        instance.delete()

    @action(detail=True, methods=['post'], url_path='copy-to-warehouse')
    def copy_to_warehouse(self, request, pk=None):
        source = self.get_object()
        target_warehouse_id = request.data.get('warehouse_id')
        raw_name = request.data.get('name') or f'کپی {source.name}'
        new_name = str(raw_name).strip()[:100]

        if not target_warehouse_id:
            return Response({'error': 'شناسه انبار مقصد (warehouse_id) الزامی است.'}, status=400)

        try:
            target_wh_id_int = int(target_warehouse_id)
        except (ValueError, TypeError):
            return Response({'error': 'شناسه انبار مقصد نامعتبر است.'}, status=400)

        from django.shortcuts import get_object_or_404
        from .models import Warehouse
        target_wh = get_object_or_404(Warehouse, id=target_wh_id_int)

        if not request.user.is_superuser:
            has_edit_perm = request.user.has_perm('accounts.perm_wh_edit') or request.user.has_perm('accounts.view_wh_label_designer')
            if not has_edit_perm:
                return Response({'error': 'شما مجوز ویرایش یا ایجاد قالب در انبار مقصد را ندارید.'}, status=403)
            if not request.user.assigned_warehouses.filter(id=target_wh.id).exists():
                return Response({'error': 'شما به انبار مقصد تخصیص داده نشده‌اید.'}, status=403)

        import copy as copy_module
        cloned = LabelTemplate.objects.create(
            warehouse=target_wh,
            name=new_name,
            width_mm=source.width_mm,
            height_mm=source.height_mm,
            qr_source_field=source.qr_source_field,
            elements=copy_module.deepcopy(source.elements),
            paper_type=source.paper_type,
            grid_rows=source.grid_rows,
            grid_cols=source.grid_cols,
            margin_mm=source.margin_mm,
            is_active=False,
        )

        serializer = self.get_serializer(cloned)
        return Response(serializer.data, status=201)

    @action(detail=False, methods=['get'], url_path='active')
    def get_active(self, request):
        warehouse_param = request.query_params.get('warehouse')
        template = None
        if warehouse_param:
            try:
                wh_id = int(warehouse_param)
                if request.user.is_superuser or request.user.assigned_warehouses.filter(id=wh_id).exists():
                    template = LabelTemplate.objects.filter(warehouse_id=wh_id, is_active=True).first()
            except (ValueError, TypeError):
                pass

        if not template:
            template = LabelTemplate.objects.filter(warehouse__isnull=True, is_active=True).first()

        if template:
            return Response(self.get_serializer(template).data)
        return Response(None, status=200)

    @action(detail=False, methods=['get'], url_path='available-fields')
    def available_fields(self, request):
        warehouse_param = request.query_params.get('warehouse')
        
        static_fields = [
            {'key': 'fa_unic_code', 'label': 'کد یکتا (FA-UNIC)', 'group': 'شناسه‌ها'},
            {'key': 'pl', 'label': 'پکینگ لیست (PL)', 'group': 'شناسه‌ها'},
            {'key': 'po', 'label': 'سفارش خرید (PO)', 'group': 'شناسه‌ها'},
            {'key': 'pk_number', 'label': 'پکیج (PK)', 'group': 'شناسه‌ها'},
            {'key': 'request_number_of_table', 'label': 'شماره درخواست جدول', 'group': 'شناسه‌ها'},
            {'key': 'tag', 'label': 'شماره تگ کالا', 'group': 'شناسه‌ها'},
            {'key': 'description', 'label': 'شرح کالا', 'group': 'مشخصات'},
            {'key': 'size', 'label': 'سایز اصلی', 'group': 'مشخصات'},
            {'key': 'unit', 'label': 'واحد سنجش', 'group': 'مشخصات'},
            {'key': 'scope_discipline', 'label': 'دیسیپلین کاری', 'group': 'مشخصات'},
            {'key': 'inventory', 'label': 'موجودی فیزیکی', 'group': 'مقادیر'},
            {'key': 'bal4miv', 'label': 'موجودی مجاز MIV', 'group': 'مقادیر'},
            {'key': 'new_location', 'label': 'لوکیشن جدید', 'group': 'مکان'},
            {'key': 'hov_no', 'label': 'شماره HOV', 'group': 'تدارکات'},
            {'key': 'vendor', 'label': 'سازنده (Vendor)', 'group': 'تدارکات'},
            {'key': 'supplier', 'label': 'تامین‌کننده (SupplierFromAriaNaft)', 'group': 'تدارکات'},
            {'key': 'irn_no', 'label': 'شماره IRN', 'group': 'تدارکات'},
            {'key': 'added_rti_no', 'label': 'شماره RTI افزوده‌شده', 'group': 'مدارک'},
            {'key': 'inv_rti_number', 'label': 'شماره RTI فاکتور', 'group': 'مدارک'},
            {'key': 'invoice_type', 'label': 'نوع فاکتور', 'group': 'مدارک'},
            {'key': 'invoice_date', 'label': 'تاریخ فاکتور', 'group': 'مدارک'},
            {'key': 'invoice_page', 'label': 'صفحه فاکتور', 'group': 'مدارک'},
            {'key': 'page_row', 'label': 'ردیف در فاکتور', 'group': 'مدارک'},
            {'key': 'doc_supplier', 'label': 'تامین‌کننده فاکتور', 'group': 'مدارک'},
            {'key': 'price_amount', 'label': 'قیمت واحد', 'group': 'مالی'},
            {'key': 'similar_unit_price', 'label': 'قیمت کالای مشابه', 'group': 'مالی'},
            {'key': 'total_value', 'label': 'ارزش کل', 'group': 'مالی'},
            {'key': 'currency', 'label': 'ارز', 'group': 'مالی'},
            {'key': 'folder_address', 'label': 'مسیر پوشه اسناد', 'group': 'مدارک'},
            {'key': 'hyperlink', 'label': 'هایپرلینک اسناد', 'group': 'مدارک'},
            {'key': 'stamp', 'label': 'وضعیت مهر اسناد', 'group': 'اسناد'},
            {'key': 'signature', 'label': 'وضعیت امضای اسناد', 'group': 'اسناد'},
            {'key': 'desc_from_standard_system', 'label': 'شرح در سامانه یکنواخت', 'group': 'سامانه یکنواخت'},
            {'key': 'unit_from_standard_system', 'label': 'واحد در سامانه یکنواخت', 'group': 'سامانه یکنواخت'},
            {'key': 'my_tag', 'label': 'تگ‌ها', 'group': 'سایر'},
            {'key': 'remark', 'label': 'ملاحظات', 'group': 'سایر'},
        ]
        fields = list(static_fields)

        if warehouse_param:
            try:
                wh_id = int(warehouse_param)
                if request.user.is_superuser or request.user.assigned_warehouses.filter(id=wh_id).exists():
                    dynamic_defs = ItemFieldDefinition.objects.filter(warehouse_id=wh_id, is_active=True)
                    for d in dynamic_defs:
                        fields.append({
                            'key': f'dynamic__{d.name}',
                            'label': f'{d.label} (پویا)',
                            'group': 'فیلدهای پویا'
                        })
            except (ValueError, TypeError):
                pass

        special_fields = [
            {'key': '__print_date__', 'label': 'تاریخ و ساعت چاپ (شمسی)', 'group': 'ویژه'},
            {'key': '__warehouse_name__', 'label': 'نام انبار', 'group': 'ویژه'},
            {'key': '__project_name__', 'label': 'نام پروژه', 'group': 'ویژه'},
            {'key': '__custom_remark__', 'label': 'توضیحات لحظه‌ای (هنگام چاپ)', 'group': 'ویژه'},
        ]
        fields.extend(special_fields)
        return Response(fields)

    @action(detail=False, methods=['post'], url_path='generate-pdf')
    def generate_pdf(self, request):
        if not (request.user.is_superuser or 
                request.user.has_perm('accounts.perm_rec_label') or 
                request.user.has_perm('accounts.view_wh_labels')):
            return Response({'error': 'شما مجوز صدور و چاپ لیبل را ندارید.'}, status=403)

        template_id = request.data.get('template_id')
        items_config = request.data.get('items_config', [])
        custom_remark = str(request.data.get('custom_remark', ''))[:500]
        print_settings = request.data.get('print_settings', {})

        if not isinstance(print_settings, dict):
            print_settings = {}

        if not items_config:
            item_ids = request.data.get('item_ids', [])
            if isinstance(item_ids, list):
                items_config = [{'id': i, 'quantity': 1} for i in item_ids if isinstance(i, int)]

        if not template_id or not items_config or not isinstance(items_config, list):
            return Response({'error': 'پارامترهای template_id و اقلام ارسالی نامعتبر یا الزامی هستند.'}, status=400)

        MAX_CONFIG_ITEMS = 500
        if len(items_config) > MAX_CONFIG_ITEMS:
            return Response({'error': f'حداکثر {MAX_CONFIG_ITEMS} قلم کالا در یک درخواست چاپ قابل ارسال است.'}, status=400)

        from django.shortcuts import get_object_or_404
        template = get_object_or_404(self.get_queryset(), id=template_id)

        MAX_ITEM_QTY = 500
        MAX_TOTAL_LABELS = 2000
        cleaned_config = []
        total_labels_requested = 0

        for conf in items_config:
            if not isinstance(conf, dict) or 'id' not in conf:
                continue
            try:
                item_id = int(conf['id'])
                raw_qty = conf.get('quantity', 1)
                qty = max(1, min(int(raw_qty if raw_qty is not None else 1), MAX_ITEM_QTY))
            except (ValueError, TypeError):
                qty = 1

            cleaned_config.append({'id': item_id, 'quantity': qty})
            total_labels_requested += qty

        if not cleaned_config:
            return Response({'error': 'هیچ رکورد معتبری برای چاپ ارسال نشده است.'}, status=400)

        if total_labels_requested > MAX_TOTAL_LABELS:
            return Response({
                'error': f'مجموع تیراژ درخواستی ({total_labels_requested}) فراتر از سقف مجاز سیستم ({MAX_TOTAL_LABELS} عدد لیبل در هر فایل) است.'
            }, status=400)

        target_ids = [c['id'] for c in cleaned_config]
        items_qs = Item.objects.filter(id__in=target_ids).select_related('warehouse')

        if not request.user.is_superuser:
            assigned_wh_ids = list(request.user.assigned_warehouses.values_list('id', flat=True))
            items_qs = items_qs.filter(warehouse_id__in=assigned_wh_ids)

        items_map = {item.id: item for item in items_qs}
        if not items_map:
            return Response({'error': 'هیچ‌یک از رکوردهای درخواستی یافت نشد یا شما به انبار آن‌ها دسترسی ندارید.'}, status=404)

        collation = print_settings.get('collation', 'group')
        final_items = []

        if collation == 'collate':
            max_qty = max((c['quantity'] for c in cleaned_config), default=1)
            for round_i in range(max_qty):
                for c in cleaned_config:
                    if round_i < c['quantity']:
                        item = items_map.get(c['id'])
                        if item:
                            final_items.append(item)
        else:
            for c in cleaned_config:
                item = items_map.get(c['id'])
                if item:
                    for _ in range(c['quantity']):
                        final_items.append(item)

        if not final_items:
            return Response({'error': 'رکوردی برای چاپ آماده نشد.'}, status=400)

        from .label_pdf_generator import LabelPdfGenerator
        generator = LabelPdfGenerator(template, final_items, custom_remark=custom_remark, print_settings=print_settings)
        pdf_buffer = generator.generate()

        response = HttpResponse(pdf_buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="labels_{template_id}.pdf"'
        pdf_buffer.close()
        return response
