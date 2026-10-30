from django.core.management.base import BaseCommand

from communications.models import MessageAttachment, PreviewStatus
from communications.previews import build_attachment_preview


class Command(BaseCommand):
    help = "ساخت پیش‌نمایش (بندانگشتی، ابعاد، تعداد صفحه) برای پیوست‌های قدیمی چت؛ پیش‌فرض فقط گزارش، با --apply اجرا"

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='واقعاً پیش‌نمایش بساز (بدون آن فقط شمارش)')
        parser.add_argument('--retry-failed', action='store_true', help='پیوست‌های ناموفق قبلی را هم دوباره امتحان کن')
        parser.add_argument('--limit', type=int, default=0, help='حداکثر تعداد پیوست در این اجرا (۰ = همه)')

    def handle(self, *args, **options):
        statuses = [PreviewStatus.PENDING]
        if options['retry_failed']:
            statuses.append(PreviewStatus.FAILED)
        # فقط پیوست‌های زنده و دارای فایل؛ فایل اصلی در هیچ حالتی حذف نمی‌شود
        qs = MessageAttachment.objects.filter(preview_status__in=statuses).exclude(file='').order_by('pk')
        if options['limit'] > 0:
            qs = qs[:options['limit']]
        total = qs.count()
        if not options['apply']:
            self.stdout.write(f"[Dry-run] {total} attachment(s) need a preview. Run with --apply to build them.")
            return

        counts = {}
        for att in qs.iterator():
            result = build_attachment_preview(att)
            counts[result] = counts.get(result, 0) + 1
        summary = ', '.join(f"{k}={v}" for k, v in sorted(counts.items())) or 'nothing to do'
        self.stdout.write(self.style.SUCCESS(f"[SUCCESS] processed {total}: {summary}"))
