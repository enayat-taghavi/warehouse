from django.core.management.base import BaseCommand
from accounts.models import CustomRole


# Default role definitions with metadata
DEFAULT_ROLES = [
    {'name': 'admin', 'title': 'مدیریت کل سیستم', 'color': '#4f46e5'},
    {'name': 'manager', 'title': 'مدیریت پروژه', 'color': '#0891b2'},
    {'name': 'supervisor', 'title': 'سرپرست اجرا / شمارش', 'color': '#059669'},
    {'name': 'counter', 'title': 'انباردار میدانی / انبارگردان', 'color': '#d97706'},
    {'name': 'doc_worker', 'title': 'کارشناس اسناد', 'color': '#64748b'},
    {'name': 'doc_supervisor', 'title': 'سرپرست اسناد', 'color': '#7c3aed'},
    {'name': 'document_expert', 'title': 'کارشناس مدارک', 'color': '#7c3aed'},
    {'name': 'feeding_operator', 'title': 'اپراتور تغذیه MT', 'color': '#be123c'},
]


class Command(BaseCommand):
    help = 'Initialize default roles (CustomRole) for the warehouse system.'

    def handle(self, *args, **kwargs):
        for role_def in DEFAULT_ROLES:
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
