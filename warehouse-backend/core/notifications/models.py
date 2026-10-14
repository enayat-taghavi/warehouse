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
