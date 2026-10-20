from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from communications.serializers import GenericCommentSerializer, get_allowed_comment_models
from inventory.models import Item
from platform_core.registry import contributions
from warehouses.models import Warehouse


class CommentTargetModelsIntegrationTests(TestCase):
    def setUp(self):
        self.warehouse = Warehouse.objects.create(name='انبار تست کامنت')
        self.item = Item.objects.create(
            warehouse=self.warehouse,
            fa_unic_code='CODE-TEST-COMM-001',
            description='کالای تستی برای کامنت',
        )

    def test_contributed_comment_target_models_set(self):
        """مجموعه مدل‌های ثبت‌شده در point مشارکت دقیقاً برابر ۴ مدل انبارداری است."""
        contributed = set(contributions('comment_target_models'))
        self.assertEqual(contributed, {'item', 'counttask', 'doctask', 'warehouse'})
        self.assertEqual(get_allowed_comment_models(), {'item', 'counttask', 'doctask', 'warehouse'})

    def test_comment_serializer_accepts_inventory_item(self):
        """سریالایزر کامنت inventory.item را مجاز می‌داند و فیلد content_type را تنظیم می‌کند."""
        serializer = GenericCommentSerializer(data={
            'content_type_str': 'inventory.item',
            'object_id': str(self.item.id),
            'text': 'یادداشت تستی روی کالا',
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        expected_ct = ContentType.objects.get_for_model(Item)
        self.assertEqual(serializer.validated_data['content_type'], expected_ct)

    def test_comment_serializer_rejects_personnel_document_with_error(self):
        """سریالایزر کامنت مدل personnel.personneldocument را با خطای فارسی «مجاز نیست» رد می‌کند."""
        serializer = GenericCommentSerializer(data={
            'content_type_str': 'personnel.personneldocument',
            'object_id': '1',
            'text': 'تست مدل غیرمجاز',
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn('content_type_str', serializer.errors)
        err_msg = str(serializer.errors['content_type_str'][0])
        self.assertIn('مجاز نیست', err_msg)

    def test_comment_serializer_validate_direct_call(self):
        """فراخوانی مستقیم متد validate برای inventory.item از گیت allow-list عبور می‌کند."""
        serializer = GenericCommentSerializer()
        validated = serializer.validate({'content_type_str': 'inventory.item'})
        expected_ct = ContentType.objects.get_for_model(Item)
        self.assertEqual(validated.get('content_type'), expected_ct)
