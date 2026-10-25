from unittest.mock import patch

from django.contrib.auth import get_user_model
import django.test

import platform_core.registry
from platform_core.registry import can_view, entity_view_decision, is_entity_locked

from .base import KIND
from .test_api import ApiBase


class RegistryHookTests(django.test.TestCase):
    def setUp(self):
        super().setUp()
        user_model = get_user_model()
        self.user = user_model.objects.create_user('reg_user_26a', password='password123')
        self.su = user_model.objects.create_user('reg_su_26a', password='password123', is_superuser=True)

    def test_no_hook_is_none_and_can_view_false(self):
        self.assertIsNone(entity_view_decision(self.user, 'zz_doc', 7))
        self.assertIs(can_view(self.user, 'zz_doc', 7), False)

    def test_allow_hook_gives_true(self):
        allow = lambda u, eid: True
        with patch.dict(platform_core.registry._CONTRIBUTIONS, {'can_view:zz_doc': [allow]}):
            self.assertIs(entity_view_decision(self.user, 'zz_doc', 7), True)
            self.assertIs(can_view(self.user, 'zz_doc', 7), True)

    def test_deny_wins_over_allow(self):
        allow = lambda u, eid: True
        deny = lambda u, eid: False
        with patch.dict(platform_core.registry._CONTRIBUTIONS, {'can_view:zz_doc': [allow, deny]}):
            self.assertIs(entity_view_decision(self.user, 'zz_doc', 7), False)
            self.assertIs(can_view(self.user, 'zz_doc', 7), False)
        with patch.dict(platform_core.registry._CONTRIBUTIONS, {'can_view:zz_doc': [deny, allow]}):
            self.assertIs(entity_view_decision(self.user, 'zz_doc', 7), False)
            self.assertIs(can_view(self.user, 'zz_doc', 7), False)

    def test_hook_error_is_deny(self):
        def broken(u, eid):
            raise RuntimeError('hook crashed')

        with patch.dict(platform_core.registry._CONTRIBUTIONS, {'can_view:zz_doc': [broken]}):
            self.assertIs(entity_view_decision(self.user, 'zz_doc', 7), False)
            self.assertIs(can_view(self.user, 'zz_doc', 7), False)

    def test_superuser_and_inactive(self):
        deny = lambda u, eid: False
        with patch.dict(platform_core.registry._CONTRIBUTIONS, {'can_view:zz_doc': [deny]}):
            self.assertIs(entity_view_decision(self.su, 'zz_doc', 7), True)
            self.assertIs(can_view(self.su, 'zz_doc', 7), True)

        allow = lambda u, eid: True
        inactive_user = get_user_model().objects.create_user('reg_inactive_26a', password='password123', is_active=False)
        with patch.dict(platform_core.registry._CONTRIBUTIONS, {'can_view:zz_doc': [allow]}):
            self.assertIs(entity_view_decision(inactive_user, 'zz_doc', 7), False)
            self.assertIs(can_view(inactive_user, 'zz_doc', 7), False)
            self.assertIs(entity_view_decision(None, 'zz_doc', 7), False)
            self.assertIs(can_view(None, 'zz_doc', 7), False)

    def test_falsy_entity_or_kind_is_false(self):
        allow = lambda u, eid: True
        with patch.dict(platform_core.registry._CONTRIBUTIONS, {'can_view:zz_doc': [allow], 'can_view:': [allow]}):
            self.assertIs(entity_view_decision(self.user, 'zz_doc', 0), False)
            self.assertIs(can_view(self.user, 'zz_doc', 0), False)
            self.assertIs(entity_view_decision(self.user, 'zz_doc', None), False)
            self.assertIs(can_view(self.user, 'zz_doc', None), False)
            self.assertIs(entity_view_decision(self.user, '', 7), False)
            self.assertIs(can_view(self.user, '', 7), False)

    def test_user_kind_self_only(self):
        other_user = get_user_model().objects.create_user('reg_other_26a', password='password123')
        self.assertIs(entity_view_decision(self.user, 'user', self.user.pk), True)
        self.assertIs(entity_view_decision(self.user, 'user', str(self.user.pk)), True)
        self.assertIsNone(entity_view_decision(self.user, 'user', other_user.pk))
        self.assertIs(can_view(self.user, 'user', other_user.pk), False)

    def test_is_locked(self):
        self.assertFalse(is_entity_locked('zz_doc', 7))
        with patch.dict(platform_core.registry._CONTRIBUTIONS, {'is_locked:zz_doc': [lambda i: True]}):
            self.assertTrue(is_entity_locked('zz_doc', 7))
            self.assertFalse(is_entity_locked('zz_doc', 0))
        with patch.dict(platform_core.registry._CONTRIBUTIONS, {'is_locked:zz_doc': [lambda i: False]}):
            self.assertFalse(is_entity_locked('zz_doc', 7))

        def broken(i):
            raise RuntimeError('lock crashed')

        with patch.dict(platform_core.registry._CONTRIBUTIONS, {'is_locked:zz_doc': [broken]}):
            self.assertTrue(is_entity_locked('zz_doc', 7))


class HistoryHookTests(ApiBase):
    def test_deny_hook_hides_history_from_submitter(self):
        d, _ = self.submit()
        with patch.dict(platform_core.registry._CONTRIBUTIONS, {f'can_view:{KIND}': [lambda u, eid: False]}):
            self.assertEqual(self.get(self.member, 'history/', kind=KIND, id=d.pk).status_code, 404)
            self.assertEqual(self.get(self.su, 'history/', kind=KIND, id=d.pk).status_code, 200)
        self.assertEqual(self.get(self.member, 'history/', kind=KIND, id=d.pk).status_code, 200)

    def test_allow_hook_shows_history_to_outsider(self):
        d, _ = self.submit()
        allow_payer = lambda u, eid: True if getattr(u, 'pk', None) == self.payer.pk else None
        with patch.dict(platform_core.registry._CONTRIBUTIONS, {f'can_view:{KIND}': [allow_payer]}):
            self.assertEqual(self.get(self.payer, 'history/', kind=KIND, id=d.pk).status_code, 200)
        self.assertEqual(self.get(self.payer, 'history/', kind=KIND, id=d.pk).status_code, 404)

    def test_none_hook_keeps_old_rules(self):
        d, _ = self.submit()
        none_hook = lambda u, eid: None
        with patch.dict(platform_core.registry._CONTRIBUTIONS, {f'can_view:{KIND}': [none_hook]}):
            self.assertEqual(self.get(self.member, 'history/', kind=KIND, id=d.pk).status_code, 200)
            self.assertEqual(self.get(self.payer, 'history/', kind=KIND, id=d.pk).status_code, 404)
