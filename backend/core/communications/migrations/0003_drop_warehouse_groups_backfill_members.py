"""
داده: حذف «گروه کاری انبار» و پرکردن ردیف عضویت (U1، پاسخ ۵ کاربر)

- گفتگوهای `warehouse_group` فقط دادهٔ آزمایشی‌اند و حذفشان را کاربر تأیید کرده است
  (پیام‌ها، پیوست‌ها و ردیف‌های عضویت‌شان با CASCADE می‌روند؛ فایل‌های روی دیسک دست نمی‌خورند).
- برای هر عضو M2M که ردیف `ConversationParticipant` ندارد، ردیف ساخته می‌شود
  تا عضویت یک منبع واحد داشته باشد؛ `joined_at` از `created_at` پر می‌شود.
- سازندهٔ گفتگوی غیرخصوصی نقش «مالک» می‌گیرد.
بازگشت: حذف برگشت‌پذیر نیست (noop)؛ پرکردن هم بی‌ضرر است و برگردانده نمی‌شود.
"""
from django.db import migrations
from django.db.models import F


def forwards(apps, schema_editor):
    Conversation = apps.get_model('communications', 'Conversation')
    Participant = apps.get_model('communications', 'ConversationParticipant')

    Conversation._base_manager.filter(conv_type='warehouse_group').delete()

    Through = Conversation.participants.through
    existing = set(Participant._base_manager.values_list('conversation_id', 'user_id'))
    missing = [
        Participant(conversation_id=c, user_id=u)
        for c, u in Through.objects.values_list('conversation_id', 'customuser_id')
        if (c, u) not in existing
    ]
    if missing:
        Participant._base_manager.bulk_create(missing, ignore_conflicts=True)

    Participant._base_manager.filter(joined_at__isnull=True).update(joined_at=F('created_at'))

    for conv_id, creator_id in Conversation._base_manager.exclude(conv_type='direct').exclude(
            created_by_id__isnull=True).values_list('id', 'created_by_id'):
        Participant._base_manager.filter(conversation_id=conv_id, user_id=creator_id).update(role='owner')


class Migration(migrations.Migration):

    dependencies = [
        ('communications', '0002_group_membership_roles'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
