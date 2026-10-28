"""
د۴ طرح ۴.۶: خودروها و درخواست‌های تغییر خودروی در جریانِ پیش از موتور ۲.۳ (وضعیت pending_* یا *_approved به‌جز
approved؛ manager_approved قدیمی معادل مصوب است و دست نمی‌خورد) که نمونهٔ موتور ندارند، نمونه می‌گیرند و کارشان در
مرحلهٔ متناظر وضعیت فعلی باز می‌شود. بی‌خطر و تکرارپذیر: هیچ رکوردی حذف یا به پیش‌نویس برگردانده نمی‌شود؛ اجرای
دوباره چیزی نمی‌سازد؛ --dry-run فقط می‌شمارد.
"""
from django.core.management.base import BaseCommand

from workflow.errors import WorkflowError
from workflow.models import WorkflowInstance


class Command(BaseCommand):
    help = 'Open engine workflow instances for in-flight vehicles and vehicle change requests (idempotent).'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Only count; create nothing.')

    def handle(self, *args, **options):
        from personnel.models import VehicleChangeRequest, VehicleDriverProfile
        from personnel.workflows import (
            VEHICLE_CHANGE_ENTITY, VEHICLE_CHANGE_WORKFLOW, VEHICLE_ENTITY, VEHICLE_LEGACY_STATUS_STEP,
            VEHICLE_WORKFLOW, open_legacy_vehicle_workflow,
        )
        dry = options['dry_run']
        statuses = list(VEHICLE_LEGACY_STATUS_STEP)
        groups = (
            (VEHICLE_WORKFLOW, VEHICLE_ENTITY,
             VehicleDriverProfile.objects.filter(approval_status__in=statuses).select_related('created_by')),
            (VEHICLE_CHANGE_WORKFLOW, VEHICLE_CHANGE_ENTITY,
             VehicleChangeRequest.objects.filter(status__in=statuses).select_related('vehicle', 'requested_by')),
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
                    task = open_legacy_vehicle_workflow(key, obj)
                except WorkflowError as exc:
                    failed += 1
                    self.stderr.write(f'{key} #{obj.pk}: {exc.code}')
                    continue
                if task is None:
                    skipped += 1
                else:
                    opened += 1
            self.stdout.write(f'{key}: opened={opened} skipped={skipped} failed={failed}' + (' (dry-run)' if dry else ''))
