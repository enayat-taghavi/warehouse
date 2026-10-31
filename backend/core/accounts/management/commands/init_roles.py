from django.core.management.base import BaseCommand
from accounts.models import CustomRole


# نقش‌های پلتفرمی؛ نقش‌های هر ماژول از نقطهٔ توسعهٔ 'default_roles' همان ماژول می‌آیند
CORE_ROLES = [
    {'name': 'admin', 'title': 'مدیریت کل سیستم', 'color': '#4f46e5'},
    {'name': 'manager', 'title': 'مدیریت پروژه', 'color': '#0891b2'},
]


def default_roles():
    from platform_core.registry import contributions
    return CORE_ROLES + list(contributions('default_roles'))


class Command(BaseCommand):
    help = 'Initialize default roles (CustomRole): platform roles plus those of the installed modules.'

    def handle(self, *args, **kwargs):
        for role_def in default_roles():
            role, created = CustomRole.objects.get_or_create(
                name=role_def['name'],
                defaults={
                    'title': role_def['title'],
                    'color': role_def['color'],
                }
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f'Created role: {role_def["name"]} ({role_def["title"]})'))
            else:
                self.stdout.write(self.style.WARNING(f'Role {role_def["name"]} already exists.'))

        self.stdout.write(self.style.SUCCESS('Successfully initialized all default roles.'))
