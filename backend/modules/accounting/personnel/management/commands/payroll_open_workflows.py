"""
د۹ طرح ۴.۵: دوره‌های بخش‌دار READY_TO_PAY که ردیف حقوق دارند و نمونهٔ گردش حقوق ندارند، نمونه می‌گیرند و کارشان
در مرحلهٔ manager_ok (تأیید مدیر) باز می‌شود (open_at_step).
بی‌خطر و تکرارپذیر: هیچ دوره یا ردیفی حذف یا به عقب برگردانده نمی‌شود؛ اجرای دوباره چیزی نمی‌سازد.
"""
from django.core.management.base import BaseCommand

from workflow.errors import WorkflowError
from workflow.models import WorkflowInstance


class Command(BaseCommand):
    help = 'Open payroll workflow instances (at manager_ok) for calculated READY_TO_PAY section periods (idempotent).'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Only count; create nothing.')

    def handle(self, *args, **options):
        from personnel.models import MonthlyWorkPeriod
        from personnel.workflows import PAYROLL_PERIOD_ENTITY, PAYROLL_PERIOD_WORKFLOW, open_legacy_payroll_workflow
        dry = options['dry_run']
        qs = (MonthlyWorkPeriod.objects.filter(status='READY_TO_PAY', section__isnull=False, company__isnull=False,
                                               payroll_records__isnull=False)
              .distinct().select_related('submitted_by', 'locked_by', 'section'))
        existing = {str(e) for e in WorkflowInstance.objects.filter(
            workflow_key=PAYROLL_PERIOD_WORKFLOW, entity_kind=PAYROLL_PERIOD_ENTITY).values_list('entity_id', flat=True)}
        opened = skipped = failed = 0
        for period in qs.order_by('pk').iterator():
            if str(period.pk) in existing:
                skipped += 1
                continue
            if dry:
                opened += 1
                continue
            try:
                task = open_legacy_payroll_workflow(period)
            except WorkflowError as exc:
                failed += 1
                self.stderr.write(f'{PAYROLL_PERIOD_WORKFLOW} #{period.pk}: {exc.code}')
                continue
            if task is None:
                skipped += 1
            else:
                opened += 1
        self.stdout.write(f'{PAYROLL_PERIOD_WORKFLOW}: opened={opened} skipped={skipped} failed={failed}'
                          + (' (dry-run)' if dry else ''))
