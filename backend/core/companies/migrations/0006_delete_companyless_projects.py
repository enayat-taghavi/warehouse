"""
Plan 2.1, decision T2: every project belongs to a company. Projects without a company ("global") are deleted
before 0007 makes Project.company NOT NULL. Until the first release data has no value (rule Q2), so rows that
PROTECT such a project or its sections (e.g. module records) are deleted too, recursively. A separate migration
from the schema change, because PostgreSQL refuses ALTER TABLE with pending deferred FK trigger events.
"""
from django.db import migrations, transaction
from django.db.models.deletion import ProtectedError, RestrictedError

MAX_DEPTH = 8


def _force_delete(qs, depth=0):
    for _ in range(MAX_DEPTH):
        try:
            with transaction.atomic():
                qs.delete()
            return
        except (ProtectedError, RestrictedError) as exc:
            if depth >= MAX_DEPTH:
                raise
            blockers = exc.protected_objects if isinstance(exc, ProtectedError) else exc.restricted_objects
            by_model = {}
            for obj in blockers:
                by_model.setdefault(type(obj), set()).add(obj.pk)
            for model, pks in by_model.items():
                _force_delete(model._base_manager.filter(pk__in=pks), depth + 1)
    qs.delete()


def delete_companyless_projects(apps, schema_editor):
    Project = apps.get_model('companies', 'Project')
    _force_delete(Project._base_manager.filter(company__isnull=True))


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0005_project_sections'),
    ]

    operations = [
        migrations.RunPython(delete_companyless_projects, migrations.RunPython.noop),
    ]
