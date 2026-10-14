from django.db import models
from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.contrib.contenttypes.fields import GenericForeignKey
from common.sync_models import SyncModelMixin


class ConversationType(models.TextChoices):
    DIRECT = 'direct', 'گفتگوی دو‌نفره'
    WAREHOUSE_GROUP = 'warehouse_group', 'گروه کاری انبار'
    ANNOUNCEMENT = 'announcement', 'اطلاعیه عمومی'


class Conversation(SyncModelMixin):
    title = models.CharField(max_length=255, null=True, blank=True, verbose_name="عنوان گفتگو")
    conv_type = models.CharField(
        max_length=25,
        choices=ConversationType.choices,
        default=ConversationType.DIRECT,
        verbose_name="نوع گفتگو"
    )
    warehouse_id = models.IntegerField(
        null=True,
        blank=True,
        db_index=True,
        db_column='warehouse_id',
        verbose_name="شناسهٔ انبار"
    )
    participants = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name='chat_conversations',
        blank=True,
        verbose_name="اعضا"
    )
    is_active = models.BooleanField(default=True, verbose_name="فعال")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاریخ ایجاد")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ بروزرسانی")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_conversations',
        verbose_name="ایجادکننده"
    )

    def __init__(self, *args, **kwargs):
        if 'warehouse' in kwargs:
            wh = kwargs.pop('warehouse')
            if 'warehouse_id' not in kwargs:
                kwargs['warehouse_id'] = getattr(wh, 'id', wh) if wh is not None else None
        super().__init__(*args, **kwargs)

    @property
    def warehouse(self):
        """سازگاری رو به عقب — خواندن انبار مرتبط بدون وابستگی به اپ انبار."""
        if not self.warehouse_id:
            return None
        from django.apps import apps
        if apps.is_installed('warehouses'):
            Warehouse = apps.get_model('warehouses', 'Warehouse')
            return Warehouse.objects.filter(id=self.warehouse_id).first()
        return None

    @warehouse.setter
    def warehouse(self, val):
        self.warehouse_id = getattr(val, 'id', val) if val is not None else None

    class Meta:
        ordering = ['-updated_at']
        base_manager_name = 'all_objects'
        verbose_name = "گفتگو / اتاق چت"
        verbose_name_plural = "گفتگوها / اتاق‌های چت"
        indexes = [
            models.Index(fields=['warehouse_id', 'conv_type', 'updated_at']),
        ]

    def __str__(self):
        return self.title or f"{self.get_conv_type_display()} ({self.id})"


class Message(SyncModelMixin):
    client_temp_id = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_index=True,
        verbose_name="شناسه یکتایی کلاینت"
    )
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name='messages',
        verbose_name="گفتگو"
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='sent_chat_messages',
        verbose_name="فرستنده"
    )
    text = models.TextField(blank=True, null=True, verbose_name="متن پیام")
    reply_to = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='replies',
        verbose_name="پاسخ به"
    )
    is_system = models.BooleanField(default=False, verbose_name="پیام سیستمی")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True, verbose_name="تاریخ ارسال")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ بروزرسانی")
    read_by = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name='read_chat_messages',
        blank=True,
        verbose_name="خوانده‌شده توسط"
    )

    class Meta:
        ordering = ['created_at']
        base_manager_name = 'all_objects'
        verbose_name = "پیام گفتگو"
        verbose_name_plural = "پیام‌های گفتگو"
        indexes = [
            models.Index(fields=['conversation', 'created_at']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['conversation', 'sender', 'client_temp_id'],
                name='unique_message_client_temp_id',
                condition=models.Q(client_temp_id__isnull=False)
            )
        ]

    def __str__(self):
        return f"{self.sender}: {self.text[:30] if self.text else '[پیوست]'}"


class MessageAttachment(SyncModelMixin):
    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name='attachments',
        verbose_name="پیام"
    )
    file = models.FileField(upload_to='chat_attachments/%Y/%m/', verbose_name="فایل ضمیمه")
    file_name = models.CharField(max_length=255, verbose_name="نام فایل")
    file_size = models.PositiveIntegerField(default=0, verbose_name="حجم بایت")
    content_type = models.CharField(max_length=100, default='application/octet-stream', verbose_name="نوع فایل")
    thumbnail = models.ImageField(upload_to='chat_attachments/thumbs/%Y/%m/', null=True, blank=True, verbose_name="بندانگشتی")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاریخ ثبت")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ بروزرسانی")

    class Meta:
        base_manager_name = 'all_objects'
        verbose_name = "پیوست پیام"
        verbose_name_plural = "پیوست‌های پیام"

    def __str__(self):
        return self.file_name


class ConversationParticipant(SyncModelMixin):
    """مدل اعضای گفتگو و رهگیری آخرین پیام خوانده‌شده بدون تحمیل بار به دیتابیس"""
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name='participant_memberships',
        verbose_name="گفتگو"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='conversation_participations',
        verbose_name="کاربر"
    )
    last_read_message = models.ForeignKey(
        Message,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='read_by_participants',
        verbose_name="آخرین پیام خوانده‌شده"
    )
    last_read_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان آخرین خواندن")
    is_muted = models.BooleanField(default=False, verbose_name="بی‌صدا")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاریخ عضویت")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ بروزرسانی")

    class Meta:
        base_manager_name = 'all_objects'
        verbose_name = "عضو گفتگو"
        verbose_name_plural = "اعضای گفتگو"
        constraints = [
            models.UniqueConstraint(
                fields=['conversation', 'user'],
                name='unique_conversation_participant'
            )
        ]

    def __str__(self):
        return f"{self.user} in {self.conversation}"


class GenericComment(SyncModelMixin):
    """مدل چندریختی برای کامنت و یادداشت روی کالاها، تسک‌های شمارش، اسناد و حواله‌ها"""
    client_temp_id = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_index=True,
        verbose_name="شناسه یکتایی کلاینت"
    )
    
    # ارتباط چندریختی
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        verbose_name="نوع موجودیت"
    )
    object_id = models.CharField(max_length=100, verbose_name="شناسه موجودیت")
    target_object = GenericForeignKey('content_type', 'object_id')
    
    warehouse_id = models.IntegerField(
        null=True,
        blank=True,
        db_index=True,
        db_column='warehouse_id',
        verbose_name="شناسهٔ انبار"
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='authored_comments',
        verbose_name="نویسنده"
    )
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='replies',
        verbose_name="پاسخ به نظر"
    )
    text = models.TextField(verbose_name="متن نظر")
    mentioned_users = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name='comment_mentions',
        blank=True,
        verbose_name="کاربران منشن‌شده"
    )
    attachment = models.FileField(upload_to='comment_attachments/%Y/%m/', null=True, blank=True, verbose_name="پیوست")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True, verbose_name="تاریخ ثبت")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ بروزرسانی")

    def __init__(self, *args, **kwargs):
        if 'warehouse' in kwargs:
            wh = kwargs.pop('warehouse')
            if 'warehouse_id' not in kwargs:
                kwargs['warehouse_id'] = getattr(wh, 'id', wh) if wh is not None else None
        super().__init__(*args, **kwargs)

    @property
    def warehouse(self):
        """سازگاری رو به عقب — خواندن انبار مرتبط بدون وابستگی به اپ انبار."""
        if not self.warehouse_id:
            return None
        from django.apps import apps
        if apps.is_installed('warehouses'):
            Warehouse = apps.get_model('warehouses', 'Warehouse')
            return Warehouse.objects.filter(id=self.warehouse_id).first()
        return None

    @warehouse.setter
    def warehouse(self, val):
        self.warehouse_id = getattr(val, 'id', val) if val is not None else None

    class Meta:
        ordering = ['created_at']
        base_manager_name = 'all_objects'
        verbose_name = "یادداشت و نظر تعاملی"
        verbose_name_plural = "یادداشت‌ها و نظرات تعاملی"
        indexes = [
            models.Index(fields=['content_type', 'object_id', 'created_at']),
            models.Index(fields=['warehouse_id', 'created_at']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['content_type', 'object_id', 'author', 'client_temp_id'],
                name='unique_generic_comment_client_temp_id',
                condition=models.Q(client_temp_id__isnull=False)
            )
        ]

    def __str__(self):
        return f"{self.author} on {self.content_type.model} #{self.object_id}: {self.text[:30]}"
