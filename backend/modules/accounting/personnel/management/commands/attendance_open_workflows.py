"""
د۶ طرح ۴.۴: دوره‌های کارکرد بخش‌دارِ در جریانِ پیش از موتور ۲.۳ (SUBMITTED، SUBMITTED_SUPERVISOR،
SUBMITTED_ACCOUNTANT) که نمونهٔ موتور ندارند، نمونه می‌گیرند و کارشان در مرحلهٔ متناظر وضعیت فعلی باز می‌شود.
بی‌خطر و تکرارپذیر: هیچ دوره‌ای حذف یا به عقب برگردانده نمی‌شود؛ اجرای دوباره چیزی نمی‌سازد.
"""
from django.core.management.base import BaseCommand

from workflow.errors import WorkflowError
from workflow.models import WorkflowInstance


class Command(BaseCommand):
    help = 'Open engine workflow instances for in-flight sectioned attendance periods (idempotent).'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Only count; create nothing.')

    def handle(self, *args, **options):
        from personnel.attendance_periods import PERIOD_LEGACY_STATUS_STEP
        from personnel.models import MonthlyWorkPeriod
        from personnel.workflows import ATTENDANCE_PERIOD_ENTITY, ATTENDANCE_PERIOD_WORKFLOW, open_legacy_period_workflow
        dry = options['dry_run']
        qs = (MonthlyWorkPeriod.objects.filter(status__in=list(PERIOD_LEGACY_STATUS_STEP), section__isnull=False,
                                               company__isnull=False)
              .select_related('submitted_by', 'locked_by', 'section'))
        existing = {str(e) for e in WorkflowInstance.objects.filter(
            workflow_key=ATTENDANCE_PERIOD_WORKFLOW, entity_kind=ATTENDANCE_PERIOD_ENTITY).values_list('entity_id', flat=True)}
        opened = skipped = failed = 0
        for period in qs.order_by('pk').iterator():
            if str(period.pk) in existing:
                skipped += 1
                continue
            if dry:
                opened += 1
                continue
            try:
                task = open_legacy_period_workflow(period)
            except WorkflowError as exc:
                failed += 1
                self.stderr.write(f'{ATTENDANCE_PERIOD_WORKFLOW} #{period.pk}: {exc.code}')
                continue
            if task is None:
                skipped += 1
            else:
                opened += 1
        self.stdout.write(f'{ATTENDANCE_PERIOD_WORKFLOW}: opened={opened} skipped={skipped} failed={failed}'
                          + (' (dry-run)' if dry else ''))
