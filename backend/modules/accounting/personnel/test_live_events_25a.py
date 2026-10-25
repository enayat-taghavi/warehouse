from django.test import TestCase
from unittest.mock import patch, MagicMock, AsyncMock
import inspect
import types

from personnel.models import Company, PersonnelProfile
from personnel.views_domains.scope_helpers import (
    broadcast_personnel_update,
    broadcast_vehicle_update,
    broadcast_attendance_updated,
)
from accounts.middleware import (
    set_current_client_tab_id,
    get_current_client_tab_id,
    _current_client_tab_id_var,
)
from personnel.views_domains import trip_views


class LiveEventTabIdTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(
            code='LIVE_TEST_25A',
            name='شرکت تست رویداد زنده ۲۵الف',
            national_id='14008123499',
            economic_code='411512345699',
            is_active=True,
        )
        self.personnel = PersonnelProfile.objects.create(
            first_name='سارا',
            last_name='احمدی',
            national_code='1234567890',
            company=self.company,
        )

    def test_personnel_default_tab_id_from_request(self):
        token = set_current_client_tab_id('tab_a')
        try:
            with patch('channels.layers.get_channel_layer') as mock_get_layer:
                mock_layer = MagicMock()
                mock_layer.group_send = AsyncMock()
                mock_get_layer.return_value = mock_layer

                broadcast_personnel_update(self.personnel)

                mock_layer.group_send.assert_called_once()
                call_args = mock_layer.group_send.call_args[0]
                group_name = call_args[0]
                payload = call_args[1]

                self.assertEqual(group_name, f'company_{self.company.id}_notifications')
                self.assertEqual(payload.get('client_tab_id'), 'tab_a')
        finally:
            _current_client_tab_id_var.reset(token)

    def test_personnel_explicit_tab_id_wins(self):
        token = set_current_client_tab_id('tab_a')
        try:
            with patch('channels.layers.get_channel_layer') as mock_get_layer:
                mock_layer = MagicMock()
                mock_layer.group_send = AsyncMock()
                mock_get_layer.return_value = mock_layer

                broadcast_personnel_update(self.personnel, client_tab_id='tab_b')

                mock_layer.group_send.assert_called_once()
                call_args = mock_layer.group_send.call_args[0]
                group_name = call_args[0]
                payload = call_args[1]

                self.assertEqual(group_name, f'company_{self.company.id}_notifications')
                self.assertEqual(payload.get('client_tab_id'), 'tab_b')
        finally:
            _current_client_tab_id_var.reset(token)

    def test_personnel_no_context_tab_is_none(self):
        token = set_current_client_tab_id(None)
        try:
            with patch('channels.layers.get_channel_layer') as mock_get_layer:
                mock_layer = MagicMock()
                mock_layer.group_send = AsyncMock()
                mock_get_layer.return_value = mock_layer

                broadcast_personnel_update(self.personnel)

                mock_layer.group_send.assert_called_once()
                call_args = mock_layer.group_send.call_args[0]
                group_name = call_args[0]
                payload = call_args[1]

                self.assertEqual(group_name, f'company_{self.company.id}_notifications')
                self.assertIsNone(payload.get('client_tab_id'))
        finally:
            _current_client_tab_id_var.reset(token)

    def test_vehicle_default_tab_id_from_request(self):
        token = set_current_client_tab_id('tab_a')
        try:
            with patch('channels.layers.get_channel_layer') as mock_get_layer:
                mock_layer = MagicMock()
                mock_layer.group_send = AsyncMock()
                mock_get_layer.return_value = mock_layer

                vehicle = types.SimpleNamespace(
                    id=1,
                    company_id=self.company.id,
                    plate_number='12ب345',
                    driver_name='علی رضایی',
                )
                broadcast_vehicle_update(vehicle)

                mock_layer.group_send.assert_called_once()
                call_args = mock_layer.group_send.call_args[0]
                group_name = call_args[0]
                payload = call_args[1]

                self.assertEqual(group_name, f'company_{self.company.id}_notifications')
                self.assertEqual(payload.get('client_tab_id'), 'tab_a')
        finally:
            _current_client_tab_id_var.reset(token)

    def test_attendance_without_company_sends_nothing(self):
        with patch('channels.layers.get_channel_layer') as mock_get_layer:
            mock_layer = MagicMock()
            mock_layer.group_send = AsyncMock()
            mock_get_layer.return_value = mock_layer

            broadcast_attendance_updated(date_shamsi='1405/08/03')

            mock_layer.group_send.assert_not_called()

    def test_attendance_with_company_and_tab(self):
        token = set_current_client_tab_id('tab_c')
        try:
            with patch('channels.layers.get_channel_layer') as mock_get_layer:
                mock_layer = MagicMock()
                mock_layer.group_send = AsyncMock()
                mock_get_layer.return_value = mock_layer

                broadcast_attendance_updated(
                    company_id=self.company.id,
                    date_shamsi='1405/08/03',
                )

                mock_layer.group_send.assert_called_once()
                call_args = mock_layer.group_send.call_args[0]
                group_name = call_args[0]
                payload = call_args[1]

                self.assertEqual(group_name, f'company_{self.company.id}_notifications')
                self.assertEqual(payload.get('client_tab_id'), 'tab_c')
                self.assertEqual(payload.get('company_id'), self.company.id)
                self.assertEqual(payload.get('type_str'), 'attendance_updated')
        finally:
            _current_client_tab_id_var.reset(token)

    def test_trip_views_never_use_global_channel(self):
        source = inspect.getsource(trip_views)
        self.assertNotIn('global_notifications', source)
