from django.db import models
from django.conf import settings


class Notification(models.Model):
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
        verbose_name='کاربر دریافت‌کننده'
    )
    title = models.CharField(max_length=255, verbose_name='عنوان اعلان')
    message = models.TextField(verbose_name='متن اعلان')
    notification_type = models.CharField(
        max_length=50,
        default='mention',
        db_index=True,
        verbose_name='نوع اعلان'
    )
    target_model = models.CharField(max_length=100, blank=True, null=True, verbose_name='مدل هدف')
    target_id = models.CharField(max_length=100, blank=True, null=True, verbose_name='شناسه هدف')
    is_read = models.BooleanField(default=False, db_index=True, verbose_name='خوانده‌شده')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True, verbose_name='تاریخ ایجاد')

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'اعلان'
        verbose_name_plural = 'اعلان‌ها'

    def __str__(self):
        return f"اعلان برای {self.recipient.username}: {self.title}"


class DeviceToken(models.Model):
    PLATFORM_CHOICES = (
        ('android', 'Android'),
        ('ios', 'iOS'),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='device_tokens',
        verbose_name='کاربر'
    )
    token = models.CharField(
        max_length=512,
        unique=True,
        verbose_name='توکن دستگاه'
    )
    platform = models.CharField(
        max_length=20,
        choices=PLATFORM_CHOICES,
        default='android',
        verbose_name='پلتفرم'
    )
    app_version = models.CharField(
        max_length=50,
        blank=True,
        default='',
        verbose_name='نسخه برنامه'
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='تاریخ ایجاد'
    )
    last_seen_at = models.DateTimeField(
        auto_now=True,
        verbose_name='آخرین مشاهده'
    )

    class Meta:
        ordering = ['-last_seen_at']
        verbose_name = 'توکن دستگاه'
        verbose_name_plural = 'توکن‌های دستگاه'

    def __str__(self):
        return f"{self.user.username} - {self.platform} ({self.token[:16]}...)"


# Import push to connect signal handlers
from . import push  # noqa: F401, E402
