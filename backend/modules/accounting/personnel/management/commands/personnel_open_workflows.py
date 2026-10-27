"""
د۵ طرح ۴.۳: پرونده‌ها و درخواست‌های تغییرِ در جریانِ پیش از موتور ۲.۳ (وضعیت pending_* یا *_approved به‌جز
approved) که نمونهٔ موتور ندارند، نمونه می‌گیرند و کارشان در مرحلهٔ متناظر وضعیت فعلی باز می‌شود.
بی‌خطر و تکرارپذیر: هیچ رکوردی حذف یا به پیش‌نویس برگردانده نمی‌شود؛ اجرای دوباره چیزی نمی‌سازد.
"""
from django.core.management.base import BaseCommand

from workflow.errors import WorkflowError
from workflow.models import WorkflowInstance


class Command(BaseCommand):
    help = 'Open engine workflow instances for in-flight personnel profiles and change requests (idempotent).'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Only count; create nothing.')

    def handle(self, *args, **options):
        from personnel.models import PersonnelChangeRequest, PersonnelProfile
        from personnel.workflows import (
            PERSONNEL_CHANGE_ENTITY, PERSONNEL_CHANGE_WORKFLOW, PERSONNEL_ENTITY, PERSONNEL_LEGACY_STATUS_STEP,
            PERSONNEL_WORKFLOW, open_legacy_personnel_workflow,
        )
        dry = options['dry_run']
        statuses = list(PERSONNEL_LEGACY_STATUS_STEP)
        groups = (
            (PERSONNEL_WORKFLOW, PERSONNEL_ENTITY,
             PersonnelProfile.objects.filter(approval_status__in=statuses).select_related('created_by')),
            (PERSONNEL_CHANGE_WORKFLOW, PERSONNEL_CHANGE_ENTITY,
             PersonnelChangeRequest.objects.filter(status__in=statuses).select_related('personnel', 'requested_by')),
        )
        for key, kind, qs in groups:
            existing = {str(e) for e in WorkflowInstance.objects.filter(workflow_key=key, entity_kind=kind)
                        .values_list('entity_id', flat=True)}
            opened = skipped = failed = 0
            for obj in qs.order_by('pk').iterator():
                if str(obj.pk) in existing:
                    skipped += 1
                    continue
                if dry:
                    opened += 1
                    continue
                try:
                    task = open_legacy_personnel_workflow(key, obj)
                except WorkflowError as exc:
                    failed += 1
                    self.stderr.write(f'{key} #{obj.pk}: {exc.code}')
                    continue
                if task is None:
                    skipped += 1
                else:
                    opened += 1
            self.stdout.write(f'{key}: opened={opened} skipped={skipped} failed={failed}' + (' (dry-run)' if dry else ''))
