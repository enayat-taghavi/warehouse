# DEF-19 (remediation_plan_defects.md): موتور گردش کار برای پروندهٔ پرسنل content_type='personnelprofile'
# می‌نوشت و اکشن‌های ویو 'personnel'. این مهاجرت دادهٔ افزایشی برچسب قدیمی را یکدست می‌کند و برچسب قبلی را
# در metadata.legacy_content_type نگه می‌دارد تا برگشت دقیق باشد. هیچ رکوردی حذف نمی‌شود.
from django.db import migrations


def unify_content_type(apps, schema_editor):
    WorkflowAuditLog = apps.get_model('personnel', 'WorkflowAuditLog')
    for log in WorkflowAuditLog.objects.filter(content_type='personnelprofile').iterator():
        metadata = dict(log.metadata or {})
        metadata['legacy_content_type'] = 'personnelprofile'
        log.metadata = metadata
        log.content_type = 'personnel'
        log.save(update_fields=['content_type', 'metadata'])


def restore_content_type(apps, schema_editor):
    WorkflowAuditLog = apps.get_model('personnel', 'WorkflowAuditLog')
    for log in WorkflowAuditLog.objects.filter(content_type='personnel', metadata__legacy_content_type='personnelprofile').iterator():
        metadata = dict(log.metadata or {})
        metadata.pop('legacy_content_type', None)
        log.metadata = metadata
        log.content_type = 'personnelprofile'
        log.save(update_fields=['content_type', 'metadata'])


class Migration(migrations.Migration):

    dependencies = [
        ('personnel', '0031_deactivate_unsourced_insurance_job_codes'),
    ]

    operations = [
        migrations.RunPython(unify_content_type, restore_content_type),
    ]
