"""
درس ا۱ طرح ۲.۲: هیچ رویداد شرکتیِ ساختار سازمانی (شرکت، شبا، مدارک، هیئت‌مدیره، طرف‌حساب شرکت)
به کانال عمومی وب‌سوکت نمی‌رود؛ همهٔ کاربران وصل‌شده، از هر شرکتی، عضو آن کانال‌اند.
"""
import ast
from pathlib import Path
from unittest import mock

from django.apps import apps
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from companies.models import Company
from companies.realtime import GLOBAL_GROUP, SUPERUSER_GROUP, org_structure_target_groups

User = get_user_model()
BACKEND = Path(__file__).resolve().parents[1]


class _Layer:
    def __init__(self):
        self.sent = []

    async def group_send(self, group, payload):
        self.sent.append((group, payload))


class OrgStructureTargetGroupsTests(TestCase):
    def test_company_event_goes_only_to_company_channel(self):
        self.assertEqual(org_structure_target_groups(7), ['company_7_notifications'])
        self.assertEqual(org_structure_target_groups(7, notify_superusers=True),
                         ['company_7_notifications', SUPERUSER_GROUP])

    def test_event_without_company_is_dropped_unless_explicitly_global(self):
        self.assertEqual(org_structure_target_groups(None), [])
        self.assertEqual(org_structure_target_groups(None, global_scope=True), [GLOBAL_GROUP])
        # شرکت داده شده باشد، global_scope اثری ندارد
        self.assertEqual(org_structure_target_groups(3, global_scope=True), ['company_3_notifications'])

    def test_every_call_site_passes_company_or_explicit_global_by_keyword(self):
        """هر فراخوانی broadcast_org_structure_updated شرکت یا global_scope را با نام می‌دهد (نه جایگاهی)."""
        offenders = []
        for path in list((BACKEND / 'core').rglob('*.py')) + list((BACKEND / 'modules').rglob('*.py')):
            if 'migrations' in path.parts or path.name.startswith('test'):
                continue
            src = path.read_text(encoding='utf-8')
            if 'broadcast_org_structure_updated(' not in src:
                continue
            for node in ast.walk(ast.parse(src)):
                if not isinstance(node, ast.Call):
                    continue
                fn = node.func
                name = fn.id if isinstance(fn, ast.Name) else getattr(fn, 'attr', '')
                if name not in ('broadcast_org_structure_updated', 'core_broadcast_org_structure_updated'):
                    continue
                kws = {k.arg for k in node.keywords}
                if len(node.args) > 4 or not ({'company_id', 'project_id'} & kws):
                    offenders.append(f'{path.relative_to(BACKEND)}:{node.lineno}')
        self.assertEqual(offenders, [])


class OrgStructureNoGlobalLeakApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(username='ws_leak_admin', password='x-pass-123',
                                                   phone_number='09170000301')
        self.client.force_authenticate(self.admin)
        self.company = Company.objects.create(code='WSL-1', name='شرکت آزمون نشت')
        self.layer = _Layer()
        patcher = mock.patch('channels.layers.get_channel_layer', return_value=self.layer)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _groups(self, entity_type):
        return [g for g, p in self.layer.sent if p.get('entity_type') == entity_type]

    def test_company_create_update_delete(self):
        r = self.client.post('/api/org/companies/', {'code': 'WSL-2', 'name': 'شرکت تازه'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        cid = r.data['id']
        self.client.patch(f'/api/org/companies/{cid}/', {'name': 'شرکت تازهٔ ویرایش‌شده'}, format='json')
        self.client.delete(f'/api/org/companies/{cid}/')
        groups = self._groups('company')
        self.assertGreaterEqual(len(groups), 3)
        self.assertNotIn(GLOBAL_GROUP, groups)
        self.assertIn(f'company_{cid}_notifications', groups)
        self.assertIn(SUPERUSER_GROUP, groups)

    def test_accounting_company_entities(self):
        if not apps.is_installed('personnel'):
            self.skipTest('accounting module is not installed')
        r = self.client.post('/api/personnel/company-board-members/',
                             {'company': self.company.id, 'first_name': 'علی', 'last_name': 'آزمون',
                              'role': 'board_member', 'member_type': 'real', 'national_code': '0012345679'}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        r = self.client.post('/api/personnel/counterparties/',
                             {'company': self.company.id, 'name': 'طرف‌حساب شرکت', 'counterparty_type': 'other'},
                             format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        board = self._groups('company_board_member')
        counterparty = self._groups('counterparty')
        self.assertEqual(board, [f'company_{self.company.id}_notifications'])
        self.assertEqual(counterparty, [f'company_{self.company.id}_notifications'])
        self.assertNotIn(GLOBAL_GROUP, [g for g, _ in self.layer.sent])
