from django.test import TransactionTestCase
from django.db import close_old_connections
from django.contrib.auth import get_user_model
from channels.testing import WebsocketCommunicator
from config.asgi import application
from rest_framework_simplejwt.tokens import AccessToken
from communications.presence import add_online_user_sync, remove_online_user_sync, get_online_users_sync

User = get_user_model()


class PresenceCacheTestCase(TransactionTestCase):
    def setUp(self):
        super().setUp()
        close_old_connections()
        self.user1 = User.objects.create_user(username='u1_pres', first_name='کاربر', last_name='یک')
        self.user2 = User.objects.create_user(username='u2_pres', first_name='کاربر', last_name='دو')

    def test_sync_cache_operations(self):
        # تست ثبت و بازیابی کش حضور
        add_online_user_sync(self.user1.id)
        current = get_online_users_sync()
        self.assertIn(self.user1.id, current)

        add_online_user_sync(self.user2.id)
        current = get_online_users_sync()
        self.assertIn(self.user1.id, current)
        self.assertIn(self.user2.id, current)

        remove_online_user_sync(self.user1.id)
        current = get_online_users_sync()
        self.assertNotIn(self.user1.id, current)
        self.assertIn(self.user2.id, current)

        remove_online_user_sync(self.user2.id)
        current = get_online_users_sync()
        self.assertNotIn(self.user2.id, current)

    async def test_websocket_online_users_snapshot(self):
        token1 = str(AccessToken.for_user(self.user1))
        comm1 = WebsocketCommunicator(application, f"/ws/chat/?token={token1}")
        connected1, _ = await comm1.connect()
        self.assertTrue(connected1)

        # استعلام اسنپ‌شات آنلاین‌ها با get_online_users
        await comm1.send_json_to({'type': 'get_online_users'})
        snapshot1 = await comm1.receive_json_from(timeout=5)
        self.assertEqual(snapshot1.get('event'), 'chat.online_users')
        self.assertIn(self.user1.id, snapshot1.get('data', {}).get('user_ids', []))

        # اتصال کاربر ۲
        token2 = str(AccessToken.for_user(self.user2))
        comm2 = WebsocketCommunicator(application, f"/ws/chat/?token={token2}")
        connected2, _ = await comm2.connect()
        self.assertTrue(connected2)

        # کاربر ۱ رویداد online شدن کاربر ۲ را دریافت می‌کند
        presence_event = await comm1.receive_json_from(timeout=5)
        self.assertEqual(presence_event.get('event'), 'chat.presence')
        self.assertEqual(presence_event.get('data', {}).get('user_id'), self.user2.id)
        self.assertEqual(presence_event.get('data', {}).get('status'), 'online')

        # کاربر ۲ با get_online_users هر دو شناسه را دریافت می‌کند
        await comm2.send_json_to({'type': 'get_online_users'})
        snapshot2 = await comm2.receive_json_from(timeout=5)
        self.assertEqual(snapshot2.get('event'), 'chat.online_users')
        user_ids = snapshot2.get('data', {}).get('user_ids', [])
        self.assertIn(self.user1.id, user_ids)
        self.assertIn(self.user2.id, user_ids)

        await comm1.disconnect()
        await comm2.disconnect()
