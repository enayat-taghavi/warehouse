"""
اعلان آزمایشی برای یک کاربر از همان مسیر معمول ۲.۴ (`notify_users`: ردیف زنگوله + وب‌سوکت + FCM) — د۵ طرح ۵.
هیچ توکن، مسیر کلید یا محتوای کلیدی چاپ نمی‌شود.
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from notifications import push
from notifications.models import DeviceToken
from notifications.services import notify_users

TEST_TITLE = 'اعلان آزمایشی'
TEST_MESSAGE = 'این یک اعلان آزمایشی است. با لمس آن «کارهای من» باز می‌شود.'
PUSH_WAIT_SECONDS = 30


class Command(BaseCommand):
    help = "Send a test notification (in-app row + FCM push) to one user through the normal notify_users path."

    def add_arguments(self, parser):
        parser.add_argument('--username', required=True, type=str, help="Recipient username")
        parser.add_argument('--url', default='/app/my-tasks', type=str,
                            help="App path opened when the notification is tapped (default /app/my-tasks)")

    def handle(self, *args, **options):
        username = (options.get('username') or '').strip()
        url = (options.get('url') or '').strip()
        if not username:
            raise CommandError("--username is required.")
        if not url.startswith('/') or url.startswith('//') or len(url) > 300:
            raise CommandError("--url must be an app path starting with '/'.")

        User = get_user_model()
        user = User.objects.filter(username=username).first()
        if user is None:
            raise CommandError(f"User '{username}' not found.")
        if not user.is_active:
            raise CommandError(f"User '{username}' is inactive.")

        provider = push.get_push_provider()
        token_count = DeviceToken.objects.filter(user_id=user.pk).count()
        self.stdout.write(f"Push provider: {type(provider).__name__}")
        self.stdout.write(f"Device tokens for user: {token_count}")

        push._last_push_future = None
        created = notify_users(
            [user.pk], title=TEST_TITLE, message=TEST_MESSAGE,
            notification_type='test_push', url=url,
        )
        if user.pk not in created:
            raise CommandError("In-app notification was not created (see backend log).")
        self.stdout.write(f"In-app notification created: id={created[user.pk].id}, url={url}")

        if not provider.is_enabled:
            self.stdout.write("FCM key not configured; in-app notification only.")
            return
        if not token_count:
            self.stdout.write("User has no registered device; in-app notification only.")
            return
        future = push._last_push_future
        if future is None:
            self.stdout.write("FCM push was not scheduled (see backend log).")
            return
        try:
            accepted = future.result(timeout=PUSH_WAIT_SECONDS)
        except Exception:
            self.stdout.write("FCM push did not finish in time (see backend log).")
            return
        if accepted is None:
            self.stdout.write(f"FCM push dispatched to {token_count} device(s); result unknown (see backend log).")
        else:
            self.stdout.write(f"FCM accepted {accepted} of {token_count} device(s); errors, if any, are in the backend log.")
            if not accepted:
                self.stdout.write("No device accepted: check the network path to Google (OUTBOUND_HTTP_PROXY) and the log.")
