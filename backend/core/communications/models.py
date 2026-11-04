from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.contrib.contenttypes.fields import GenericForeignKey
from django.utils import timezone
from common.sync_models import SyncModelMixin
from .reactions import ALLOWED_REACTION_EMOJIS


class ConversationType(models.TextChoices):
    DIRECT = 'direct', 'گفتگوی دو‌نفره'
    GROUP = 'group', 'گروه'
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
        from platform_core.registry import resolve_entity
        return resolve_entity('warehouse', self.warehouse_id)

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
    forwarded_from_message = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='forwards',
        verbose_name="بازارسال از پیام"
    )
    forwarded_from_name = models.CharField(
        max_length=150,
        null=True,
        blank=True,
        verbose_name="نام فرستنده اصلی بازارسال"
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


class PreviewStatus(models.TextChoices):
    PENDING = 'pending', 'در انتظار'
    READY = 'ready', 'آماده'
    NONE = 'none', 'بی‌پیش‌نمایش'
    FAILED = 'failed', 'ناموفق'


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
    width = models.PositiveIntegerField(null=True, blank=True, verbose_name="عرض (پیکسل)")
    height = models.PositiveIntegerField(null=True, blank=True, verbose_name="ارتفاع (پیکسل)")
    page_count = models.PositiveIntegerField(null=True, blank=True, verbose_name="تعداد صفحه")
    duration = models.PositiveIntegerField(null=True, blank=True, verbose_name="مدت (ثانیه)")
    preview_status = models.CharField(
        max_length=10, choices=PreviewStatus.choices, default=PreviewStatus.PENDING, verbose_name="وضعیت پیش‌نمایش"
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاریخ ثبت")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ بروزرسانی")

    class Meta:
        base_manager_name = 'all_objects'
        verbose_name = "پیوست پیام"
        verbose_name_plural = "پیوست‌های پیام"

    def __str__(self):
        return self.file_name

    def delete(self, *args, **kwargs):
        safe_delete_attachment_files(self)
        return super().delete(*args, **kwargs)


def safe_delete_attachment_files(attachment):
    """
    حذف ایمن فایل فیزیکی و بندانگشتی پیوست با شمارش ارجاع (Reference Counting).
    اگر پیوست دیگری (مثلاً در پیام‌های بازارسال‌شده) به همان فایل یا بندانگشتی
    اشاره کند، فایل فیزیکی روی دیسک حفظ می‌شود.
    """
    if not attachment:
        return
    file_name = attachment.file.name if attachment.file else None
    thumb_name = attachment.thumbnail.name if attachment.thumbnail else None

    if file_name:
        other_file_exists = MessageAttachment.all_objects.exclude(pk=attachment.pk).filter(file=file_name).exists()
        if not other_file_exists:
            try:
                attachment.file.storage.delete(file_name)
            except Exception as exc:
                import logging
                logging.getLogger(__name__).warning("[safe_delete_attachment_files] file %s delete failed: %s", file_name, exc)

    if thumb_name:
        other_thumb_exists = MessageAttachment.all_objects.exclude(pk=attachment.pk).filter(thumbnail=thumb_name).exists()
        if not other_thumb_exists:
            try:
                attachment.thumbnail.storage.delete(thumb_name)
            except Exception as exc:
                import logging
                logging.getLogger(__name__).warning("[safe_delete_attachment_files] thumbnail %s delete failed: %s", thumb_name, exc)


@receiver(post_delete, sender=MessageAttachment)
def on_message_attachment_post_delete(sender, instance, **kwargs):
    """
    هوک پس از حذف پیوست؛ در صورت حذف مستقیم از کوئری‌ست یا حذف آبشاری از Message.delete،
    تنها در صورتی فایل فیزیکی را از دیسک پاک می‌کند که هیچ پیوست دیگری به آن اشاره نداشته باشد.
    """
    file_name = instance.file.name if instance.file else None
    thumb_name = instance.thumbnail.name if instance.thumbnail else None

    if file_name and not MessageAttachment.all_objects.filter(file=file_name).exists():
        try:
            instance.file.storage.delete(file_name)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("[attachment post_delete] file %s delete failed: %s", file_name, exc)

    if thumb_name and not MessageAttachment.all_objects.filter(thumbnail=thumb_name).exists():
        try:
            instance.thumbnail.storage.delete(thumb_name)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("[attachment post_delete] thumbnail %s delete failed: %s", thumb_name, exc)


class MessageReaction(models.Model):
    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name='reactions',
        verbose_name="پیام"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='message_reactions',
        verbose_name="کاربر"
    )
    emoji = models.CharField(
        max_length=16,
        choices=ALLOWED_REACTION_EMOJIS,
        verbose_name="ایموجی واکنش"
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="زمان ثبت")

    class Meta:
        verbose_name = "واکنش به پیام"
        verbose_name_plural = "واکنش‌های پیام"
        indexes = [
            models.Index(fields=['message', 'emoji']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['message', 'user'],
                name='unique_message_user_reaction'
            )
        ]

    def __str__(self):
        return f"{self.user}: {self.emoji} on Message #{self.message_id}"


class ParticipantRole(models.TextChoices):
    OWNER = 'owner', 'مالک'
    ADMIN = 'admin', 'مدیر گروه'
    MEMBER = 'member', 'عضو'


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
    last_delivered_message = models.ForeignKey(
        Message,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        verbose_name="آخرین پیام تحویل‌شده"
    )
    last_read_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان آخرین خواندن")
    is_muted = models.BooleanField(default=False, verbose_name="بی‌صدا")
    # نقش در گروه؛ عضو حذف‌شده یا خارج‌شده پاک نمی‌شود، فقط left_at می‌گیرد (U1)
    role = models.CharField(
        max_length=10,
        choices=ParticipantRole.choices,
        default=ParticipantRole.MEMBER,
        verbose_name="نقش"
    )
    joined_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان پیوستن")
    left_at = models.DateTimeField(null=True, blank=True, db_index=True, verbose_name="زمان خروج")
    pinned_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان سنجاق گفتگو")
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


class PinnedMessage(models.Model):
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name='pinned_messages',
        verbose_name="گفتگو"
    )
    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name='pin_records',
        verbose_name="پیام"
    )
    pinned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='pinned_chat_messages',
        verbose_name="سنجاق‌کننده"
    )
    pinned_at = models.DateTimeField(auto_now_add=True, verbose_name="زمان سنجاق پیام")

    class Meta:
        ordering = ['pinned_at', 'id']
        verbose_name = "پیام سنجاق‌شده"
        verbose_name_plural = "پیام‌های سنجاق‌شده"
        constraints = [
            models.UniqueConstraint(
                fields=['conversation', 'message'],
                name='unique_conversation_pinned_message'
            )
        ]

    def __str__(self):
        return f"Pinned msg #{self.message_id} in conv #{self.conversation_id}"


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
        from platform_core.registry import resolve_entity
        return resolve_entity('warehouse', self.warehouse_id)

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


class ChatContactScope(models.TextChoices):
    SECTION = 'section', 'فقط بخش'
    PROJECT = 'project', 'فقط پروژه'
    COMPANY = 'company', 'فقط شرکت'
    ALL = 'all', 'همهٔ شرکت‌ها'


class ChatUserPolicy(models.Model):
    """
    سیاست چت هر کاربر (طرح دسترسی به چت، ت۱ و ت۹): نبودن ردیف یعنی پیش‌فرض
    (دسترسی باز و «پیروی از شرکت»). contact_scope خالی یعنی «پیروی از شرکت».
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='chat_policy',
        verbose_name="کاربر"
    )
    chat_allowed = models.BooleanField(default=True, verbose_name="دسترسی به پیام‌رسان")
    contact_scope = models.CharField(
        max_length=20,
        choices=ChatContactScope.choices,
        blank=True,
        default='',
        verbose_name="حوزهٔ مخاطبان"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        verbose_name="آخرین تغییردهنده"
    )
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ بروزرسانی")

    class Meta:
        verbose_name = "سیاست چت کاربر"
        verbose_name_plural = "سیاست‌های چت کاربران"

    def __str__(self):
        return f"{self.user_id}: allowed={self.chat_allowed} scope={self.contact_scope or '-'}"


class ChatCompanyPolicy(models.Model):
    """پیش‌فرض حوزهٔ مخاطبان چت هر شرکت (ت۳)؛ نبودن ردیف یعنی «company»."""
    company = models.OneToOneField(
        'companies.Company',
        on_delete=models.CASCADE,
        related_name='chat_policy',
        verbose_name="شرکت"
    )
    contact_scope = models.CharField(
        max_length=20,
        choices=ChatContactScope.choices,
        default=ChatContactScope.COMPANY,
        verbose_name="حوزهٔ پیش‌فرض مخاطبان"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        verbose_name="آخرین تغییردهنده"
    )
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ بروزرسانی")

    class Meta:
        verbose_name = "سیاست چت شرکت"
        verbose_name_plural = "سیاست‌های چت شرکت‌ها"

    def __str__(self):
        return f"{self.company_id}: scope={self.contact_scope}"


class ChatPresence(models.Model):
    """
    وضعیت حضور و آخرین زمان مشاهده کاربر در چت (فاز ۷).
    کلید اصلی شناسه کاربر است و جدول auth_user تغییر نمی‌کند.
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='chat_presence',
        primary_key=True,
        verbose_name="کاربر"
    )
    last_seen_at = models.DateTimeField(
        default=timezone.now,
        db_index=True,
        verbose_name="آخرین زمان مشاهده"
    )

    class Meta:
        verbose_name = "وضعیت حضور در چت"
        verbose_name_plural = "وضعیت‌های حضور در چت"

    def __str__(self):
        return f"{self.user_id}: {self.last_seen_at}"

