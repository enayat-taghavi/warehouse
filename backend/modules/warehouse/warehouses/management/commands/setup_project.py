from django.core.management.base import BaseCommand
from django.core.management import call_command
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from warehouses.models import Warehouse

User = get_user_model()

class Command(BaseCommand):
    help = 'Setup the project with initial data for development/demo'

    def handle(self, *args, **kwargs):
        self.stdout.write(self.style.SUCCESS('Starting project setup...'))

        # 1. Run migrations
        self.stdout.write('Running migrations...')
        call_command('migrate', interactive=False)

        # 2. Create Superuser
        self.stdout.write('Checking superuser...')
        if not User.objects.filter(is_superuser=True).exists():
            User.objects.create_superuser('admin', 'admin@example.com', 'admin')
            self.stdout.write(self.style.SUCCESS('Superuser admin/admin created.'))
        else:
            self.stdout.write('Superuser already exists.')

        # 3. Seed Permissions
        self.stdout.write('Seeding core permissions...')
        call_command('seed_permissions')

        # 4. Initialize System Roles
        self.stdout.write('Initializing system roles...')
        call_command('init_roles')

        # Also assign admin role to superuser for completeness
        admin_user = User.objects.get(username='admin')
        try:
            from accounts.models import CustomRole
            admin_role = CustomRole.objects.get(name='admin')
            if not admin_user.groups.filter(name='admin').exists():
                admin_user.groups.add(admin_role)
                self.stdout.write(self.style.SUCCESS('Assigned admin role to superuser.'))
        except Exception as e:
            self.stdout.write(self.style.WARNING(f'Could not assign admin role: {e}'))

        self.stdout.write(self.style.SUCCESS('Project setup complete! System is ready for production deployment.'))
