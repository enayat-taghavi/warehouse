from django.db import migrations


def map_remaining_legacy_levels(apps, schema_editor):
    """
    Contract step (decision T14): before dropping access_level, any row whose section_levels is still empty
    and whose old level was docs_read/docs_write gets the archive level it had at runtime until now
    (companies.access._row_levels mapped exactly these). No row is deleted; rows with levels are untouched.
    If the module that maps these levels is not installed, the migration stops instead of dropping the
    column, so the old level is never lost (install the module, or set section_levels, then migrate again).
    """
    from companies.permission_sections import legacy_levels
    Access = apps.get_model('companies', 'UserCompanyAccess')
    for level in ('docs_read', 'docs_write'):
        rows = Access.objects.filter(access_level=level, section_levels={})
        if not rows.exists():
            continue
        mapped = legacy_levels(level)
        if not mapped:
            raise RuntimeError(
                f"{rows.count()} UserCompanyAccess rows still carry access_level={level!r} with empty "
                "section_levels, and no installed module maps that level. Refusing to drop access_level."
            )
        rows.update(section_levels=mapped)


def restore_as_link(apps, schema_editor):
    """
    Reverse: the re-added column defaults to 'docs_read'; every row is set to 'link' so that the old
    code's fallback does not grant archive read to rows that never had it. Levels stay in section_levels.
    """
    Access = apps.get_model('companies', 'UserCompanyAccess')
    Access.objects.update(access_level='link')


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0003_access_level_link'),
    ]

    operations = [
        migrations.RunPython(map_remaining_legacy_levels, restore_as_link),
        migrations.RemoveField(
            model_name='usercompanyaccess',
            name='access_level',
        ),
    ]
