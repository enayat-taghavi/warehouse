import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()
from accounts.models import CustomUser
user = CustomUser.objects.filter(username='enayat.taghavi').first()
print('User Found:', bool(user))
if user:
    print('Superuser:', user.is_superuser)
    print('Groups:', list(user.groups.values_list('name', flat=True)))
    print('Has perm_rec_import:', user.has_perm('accounts.perm_rec_import'))
