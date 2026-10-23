import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from accounts.models import CustomUser

users = [
    {'username': 'admin', 'password': '123', 'role': 'admin', 'first_name': 'Admin', 'last_name': 'User'},
    {'username': 'm_user', 'password': '123', 'role': 'management', 'first_name': 'Manager', 'last_name': 'User'},
    {'username': 'e_user', 'password': '123', 'role': 'execution', 'first_name': 'Executor', 'last_name': 'User'},
    {'username': 'd_user', 'password': '123', 'role': 'documents', 'first_name': 'Doc', 'last_name': 'User'},
    {'username': 'f_user', 'password': '123', 'role': 'feeding', 'first_name': 'Feeder', 'last_name': 'User'},
]

for u in users:
    if not CustomUser.objects.filter(username=u['username']).exists():
        CustomUser.objects.create_user(**u)
        print(f"User {u['username']} created.")

