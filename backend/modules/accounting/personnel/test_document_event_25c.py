import inspect
import unittest
from decimal import Decimal
from unittest.mock import patch, MagicMock, AsyncMock

from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from companies.models import Company, Project, ProjectSection, UserCompanyAccess
from companies.realtime import broadcast_document_changed
from core.notifications.consumers import NotificationConsumer
from accounts.middleware import (
    set_current_client_tab_id,
    _current_client_tab_id_var,
)
from personnel.models import (
    Counterparty,
    ExpenseInvoice,
    PersonnelProfile,
    PettyCashAccount,
    PettyCashTransaction,
)
from personnel.scoped_test_support import give_valid_sheba, grant_section_perms, expense_head_id
from personnel.workflow_engine import (
    notify_document_changed,
    advance_workflow_step,
)

User = get_user_model()
BASE = '/api/personnel/expense-invoices/'


def events(mock_layer):
    res = []
    for call in mock_layer.group_send.call_args_list:
        args, kwargs = call
        payload = args[1] if len(args) > 1 else kwargs.get('payload', {})
        if payload.get('type_str') == 'document_changed':
            res.append(payload)
    return res


class DocumentChangedEventTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(code='DOC25C', name='شرکت رویداد سند', is_active=True)
        project = Project.objects.create(company=self.company, code='DOC25C-P', name='پروژه تست')
        self.sec = ProjectSection.objects.create(project=project, code='DOC25C-S', name='بخش تست')
        self.cp = Counterparty.objects.create(company=self.company, name='طرف‌حساب تست', counterparty_type='other')
        give_valid_sheba(self.cp)

        self.emp = self.user('emp', 'employee')
        self.admin = User.objects.create_superuser(username='doc25c_admin', password='x')
        UserCompanyAccess.objects.create(user=self.admin, company=self.company, is_default=True)

    def user(self, name, role, section=None):
        u = User.objects.create_user(username=f'doc25c_{name}', password='x')
        UserCompanyAccess.objects.create(user=u, company=self.company, is_default=True)
        grant_section_perms(u, [], section=section or self.sec, role=role, exact=False)
        return u

    def invoice(self, creator=None, amount='1000', section=None):
        return ExpenseInvoice.objects.create(
            section=section or self.sec,
            counterparty=self.cp,
            invoice_number=f'DOC25C-INV-{ExpenseInvoice.objects.count() + 1}',
            invoice_date_shamsi='1405/08/01',
            amount=Decimal(amount),
            description='d',
            created_by=creator or self.admin,
        )

    def test_1_helper_without_company_sends_nothing(self):
        with patch('channels.layers.get_channel_layer') as mock_get_layer:
            mock_layer = MagicMock()
            mock_layer.group_send = AsyncMock()
            mock_get_layer.return_value = mock_layer

            with self.captureOnCommitCallbacks(execute=True) as callbacks:
                broadcast_document_changed('expense_invoice', 1, company_id=None)

            self.assertEqual(len(callbacks), 0)
            mock_layer.group_send.assert_not_called()

    def test_2_helper_sends_only_after_commit(self):
        with patch('channels.layers.get_channel_layer') as mock_get_layer:
            mock_layer = MagicMock()
            mock_layer.group_send = AsyncMock()
            mock_get_layer.return_value = mock_layer

            with self.captureOnCommitCallbacks(execute=False) as callbacks:
                broadcast_document_changed('expense_invoice', 101, company_id=self.company.pk)

            mock_layer.group_send.assert_not_called()
            self.assertEqual(len(callbacks), 1)

            for cb in callbacks:
                cb()

            evs = events(mock_layer)
            self.assertEqual(len(evs), 1)
            group_called = mock_layer.group_send.call_args[0][0]
            self.assertEqual(group_called, f'company_{self.company.pk}_notifications')
            self.assertEqual(evs[0]['doc_type'], 'expense_invoice')
            self.assertEqual(evs[0]['doc_id'], 101)
            self.assertEqual(evs[0]['action'], 'updated')

    def test_3_helper_default_tab_id_and_explicit_wins(self):
        token = set_current_client_tab_id('tab_doc')
        try:
            with patch('channels.layers.get_channel_layer') as mock_get_layer:
                mock_layer = MagicMock()
                mock_layer.group_send = AsyncMock()
                mock_get_layer.return_value = mock_layer

                with self.captureOnCommitCallbacks(execute=True):
                    broadcast_document_changed('expense_invoice', 1, company_id=self.company.pk)

                evs = events(mock_layer)
                self.assertEqual(len(evs), 1)
                self.assertEqual(evs[0]['client_tab_id'], 'tab_doc')

                mock_layer.group_send.reset_mock()

                with self.captureOnCommitCallbacks(execute=True):
                    broadcast_document_changed(
                        'expense_invoice', 2, company_id=self.company.pk, client_tab_id='tab_x'
                    )

                evs2 = events(mock_layer)
                self.assertEqual(len(evs2), 1)
                self.assertEqual(evs2[0]['client_tab_id'], 'tab_x')
        finally:
            _current_client_tab_id_var.reset(token)

    def test_4_invoice_create_sends_created(self):
        with patch('channels.layers.get_channel_layer') as mock_get_layer:
            mock_layer = MagicMock()
            mock_layer.group_send = AsyncMock()
            mock_get_layer.return_value = mock_layer

            c = APIClient()
            c.force_authenticate(self.admin)
            payload = {
                'section': self.sec.pk,
                'counterparty': self.cp.pk,
                'invoice_number': 'DOC25C-INV-CREATE',
                'invoice_date_shamsi': '1405/08/01',
                'amount': '5000',
                'expense_head': expense_head_id(self.sec),
                'description': 'd',
            }
            with self.captureOnCommitCallbacks(execute=True):
                resp = c.post(BASE, payload, format='json', HTTP_X_COMPANY_ID=str(self.company.pk))

            self.assertEqual(resp.status_code, 201, resp.data)
            new_id = resp.data['id']
            evs = events(mock_layer)
            self.assertEqual(len(evs), 1)
            ev = evs[0]
            self.assertEqual(ev['doc_type'], 'expense_invoice')
            self.assertEqual(ev['action'], 'created')
            self.assertEqual(ev['doc_id'], new_id)
            self.assertEqual(ev['section_id'], self.sec.pk)
            self.assertEqual(ev['company_id'], self.company.pk)

    def test_5_invoice_submit_sends_status_changed_with_new_status(self):
        inv = self.invoice(self.emp)
        with patch('channels.layers.get_channel_layer') as mock_get_layer:
            mock_layer = MagicMock()
            mock_layer.group_send = AsyncMock()
            mock_get_layer.return_value = mock_layer

            c = APIClient()
            c.force_authenticate(self.emp)
            with self.captureOnCommitCallbacks(execute=True):
                resp = c.post(f'{BASE}{inv.pk}/submit/', {}, format='json', HTTP_X_COMPANY_ID=str(self.company.pk))

            self.assertIn(resp.status_code, (200, 201))
            inv.refresh_from_db()
            evs = events(mock_layer)
            status_changed_evs = [e for e in evs if e.get('action') == 'status_changed']
            self.assertGreaterEqual(len(status_changed_evs), 1)
            self.assertEqual(status_changed_evs[-1]['status'], inv.status)

    def test_6_invoice_update_and_delete(self):
        inv = self.invoice(self.emp)
        with patch('channels.layers.get_channel_layer') as mock_get_layer:
            mock_layer = MagicMock()
            mock_layer.group_send = AsyncMock()
            mock_get_layer.return_value = mock_layer

            c = APIClient()
            c.force_authenticate(self.admin)

            # PATCH
            with self.captureOnCommitCallbacks(execute=True):
                resp = c.patch(
                    f'{BASE}{inv.pk}/',
                    {'description': 'updated_desc'},
                    format='json',
                    HTTP_X_COMPANY_ID=str(self.company.pk),
                )
            self.assertEqual(resp.status_code, 200)
            evs_patch = events(mock_layer)
            self.assertEqual(len(evs_patch), 1)
            self.assertEqual(evs_patch[0]['action'], 'updated')
            self.assertEqual(evs_patch[0]['doc_id'], inv.pk)

            mock_layer.group_send.reset_mock()

            # DELETE
            old_id = inv.pk
            with self.captureOnCommitCallbacks(execute=True):
                resp = c.delete(f'{BASE}{old_id}/', HTTP_X_COMPANY_ID=str(self.company.pk))
            self.assertEqual(resp.status_code, 204)
            evs_del = events(mock_layer)
            self.assertEqual(len(evs_del), 1)
            self.assertEqual(evs_del[0]['action'], 'deleted')
            self.assertEqual(evs_del[0]['doc_id'], old_id)

    def test_7_petty_cash_create_sends_created(self):
        with patch('channels.layers.get_channel_layer') as mock_get_layer:
            mock_layer = MagicMock()
            mock_layer.group_send = AsyncMock()
            mock_get_layer.return_value = mock_layer

            c = APIClient()
            c.force_authenticate(self.admin)
            payload = {
                'section': self.sec.pk,
                'custodian': self.admin.pk,
                'counterparty': self.cp.pk,
                'amount': '25000',
                'transaction_date_shamsi': '1405/08/01',
                'title': 'سند تنخواه آزمایشی',
                'expense_head': expense_head_id(self.sec),
                'transaction_type': 'expense',
            }
            with self.captureOnCommitCallbacks(execute=True):
                resp = c.post(
                    '/api/personnel/petty-cash-transactions/',
                    payload,
                    format='json',
                    HTTP_X_COMPANY_ID=str(self.company.pk),
                )

            self.assertEqual(resp.status_code, 201)
            evs = events(mock_layer)
            created_evs = [
                e for e in evs if e.get('doc_type') == 'petty_cash' and e.get('action') == 'created'
            ]
            self.assertGreaterEqual(len(created_evs), 1)

    def test_8_engine_advance_sends_one_event(self):
        with patch('channels.layers.get_channel_layer') as mock_get_layer:
            mock_layer = MagicMock()
            mock_layer.group_send = AsyncMock()
            mock_get_layer.return_value = mock_layer

            account, _ = PettyCashAccount.objects.get_or_create(
                section=self.sec,
                custodian=self.admin,
                defaults={'ceiling_amount': Decimal('100000000')},
            )
            tx = PettyCashTransaction.objects.create(
                section=self.sec,
                account=account,
                custodian=self.admin,
                created_by=self.admin,
                amount=Decimal('10000'),
                transaction_date_shamsi='1405/08/01',
                title='تنخواه تست ۸',
                category='متفرقه',
                status='pending_supervisor',
            )

            with self.captureOnCommitCallbacks(execute=True):
                advance_workflow_step(tx, self.admin, is_financial=True)

            tx.refresh_from_db()
            evs = events(mock_layer)
            self.assertEqual(len(evs), 1)
            self.assertEqual(evs[0]['doc_type'], 'petty_cash')
            self.assertEqual(evs[0]['status'], tx.status)

    def test_9_other_models_send_nothing(self):
        with patch('channels.layers.get_channel_layer') as mock_get_layer:
            mock_layer = MagicMock()
            mock_layer.group_send = AsyncMock()
            mock_get_layer.return_value = mock_layer

            with self.captureOnCommitCallbacks(execute=True):
                notify_document_changed(
                    PersonnelProfile.objects.create(
                        first_name='a',
                        last_name='b',
                        national_code='0012345679',
                        company=self.company,
                    )
                )

            evs = events(mock_layer)
            self.assertEqual(len(evs), 0)

    def test_10_consumer_forwards_document_fields(self):
        src = inspect.getsource(NotificationConsumer.send_notification)
        self.assertIn("'doc_type'", src)
        self.assertIn("'doc_id'", src)
        self.assertIn("'status'", src)
