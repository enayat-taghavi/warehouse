"""Tests for core numbering (plan 2.8, decisions 1-5): allocate/void/display, constraints, rollback, concurrency."""
import threading
from datetime import datetime
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError, connection, transaction
from django.test import TestCase, TransactionTestCase
from django.utils import timezone

import platform_core.registry
from companies.models import Company
from numbering.models import IssuedNumber, NumberCounter, NumberSeriesConfig
from numbering.registry import NumberSeriesSpec, series_specs, shamsi_year
from numbering.services import allocate, format_display, next_preview, void

KEY = 'zz.doc'


def _period_from_at(company_id, at):
    return str(at.year)


def _specs(*specs):
    return patch.dict(platform_core.registry._CONTRIBUTIONS, {'numbering_series': list(specs)})


DEFAULT_SPEC = NumberSeriesSpec(key=KEY, title_fa='Test doc', period_key=_period_from_at)


class Numbering28bTests(TestCase):
    def setUp(self):
        self.c1 = Company.objects.create(code='NUM-C1', name='C1')
        self.c2 = Company.objects.create(code='NUM-C2', name='C2')
        self.user = get_user_model().objects.create_user(username='num_u', password='x')
        p = _specs(DEFAULT_SPEC)
        p.start()
        self.addCleanup(p.stop)

    def _alloc(self, eid, company=None, at=None):
        return allocate((company or self.c1).pk, KEY, 'zz_doc', eid, self.user,
                        at=at or timezone.make_aware(datetime(2026, 5, 1)))

    def test_sequential(self):
        nums = [self._alloc(i) for i in (1, 2, 3)]
        self.assertEqual([n.seq for n in nums], [1, 2, 3])
        self.assertEqual(nums[0].display, '2026/1')
        self.assertEqual(nums[0].issued_by_id, self.user.pk)
        self.assertEqual(nums[0].status, IssuedNumber.STATUS_ACTIVE)

    def test_new_period_restarts(self):
        self._alloc(1)
        self._alloc(2)
        n = self._alloc(3, at=timezone.make_aware(datetime(2027, 1, 5)))
        self.assertEqual((n.period_key, n.seq, n.display), ('2027', 1, '2027/1'))

    def test_other_company_independent(self):
        self._alloc(1)
        self._alloc(2)
        n = self._alloc(3, company=self.c2)
        self.assertEqual(n.seq, 1)
        same_id = self._alloc(1, company=self.c2)  # same entity id in another company gets its own number
        self.assertEqual((same_id.company_id, same_id.seq), (self.c2.pk, 2))

    def test_template_prefix_padding_and_start(self):
        NumberSeriesConfig.objects.create(company=self.c1, series_key=KEY, template='{prefix}-{period}-{seq}',
                                          prefix='INV', seq_padding=4, start_number=100)
        self.assertEqual(next_preview(self.c1.pk, KEY, at=timezone.make_aware(datetime(2026, 5, 1))), 'INV-2026-0100')
        n = self._alloc(1)
        self.assertEqual((n.seq, n.display), (100, 'INV-2026-0100'))
        self.assertEqual(self._alloc(2).seq, 101)

    def test_template_change_affects_only_next(self):
        first = self._alloc(1)
        NumberSeriesConfig.objects.create(company=self.c1, series_key=KEY, template='X{seq}')
        self._alloc(2)
        first.refresh_from_db()
        self.assertEqual(first.display, '2026/1')
        self.assertEqual(IssuedNumber.objects.get(entity_id='2').display, 'X2')

    def test_format_display(self):
        self.assertEqual(format_display('{period}/{seq}', '1405', '', 7, 3), '1405/007')
        self.assertEqual(format_display('{prefix}{seq}', 'p', 'A', 12, 0), 'A12')

    def test_idempotent_same_entity(self):
        a = self._alloc(1)
        b = self._alloc(1)
        self.assertEqual(a.pk, b.pk)
        self.assertEqual(NumberCounter.objects.get().last_seq, 1)

    def test_void_keeps_row_and_never_reuses(self):
        a = self._alloc(1)
        with self.assertRaises(ValueError):
            void(a, '   ', self.user)
        v = void(a, 'cancelled', self.user)
        self.assertEqual((v.status, v.void_reason, v.voided_by_id), (IssuedNumber.STATUS_VOID, 'cancelled', self.user.pk))
        self.assertIsNotNone(v.voided_at)
        with self.assertRaises(ValueError):
            void(a, 'again', self.user)
        self.assertEqual(self._alloc(2).seq, 2)
        again = self._alloc(1)  # same document gets a fresh number after void
        self.assertEqual(again.seq, 3)
        self.assertEqual(IssuedNumber.objects.count(), 3)

    def test_void_reason_too_long(self):
        a = self._alloc(1)
        with self.assertRaises(ValueError):
            void(a, 'x' * 501, self.user)

    def test_outer_rollback_leaves_no_gap(self):
        class Boom(Exception):
            pass
        with self.assertRaises(Boom):
            with transaction.atomic():
                self._alloc(1)
                raise Boom
        self.assertEqual(IssuedNumber.objects.count(), 0)
        self.assertEqual(self._alloc(2).seq, 1)

    def test_unknown_series_and_bad_entity(self):
        with self.assertRaises(ValueError):
            allocate(self.c1.pk, 'zz.unknown', 'zz_doc', 1, self.user)
        with self.assertRaises(ValueError):
            allocate(self.c1.pk, KEY, '', 1, self.user)

    def test_unique_constraints(self):
        a = self._alloc(1)
        with self.assertRaises(IntegrityError), transaction.atomic():
            IssuedNumber.objects.create(company=self.c1, series_key=KEY, period_key=a.period_key, seq=a.seq,
                                        display='other', entity_kind='zz_doc', entity_id='9')
        with self.assertRaises(IntegrityError), transaction.atomic():
            IssuedNumber.objects.create(company=self.c1, series_key=KEY, period_key=a.period_key, seq=50,
                                        display=a.display, entity_kind='zz_doc', entity_id='9')
        with self.assertRaises(IntegrityError), transaction.atomic():
            IssuedNumber.objects.create(company=self.c1, series_key=KEY, period_key=a.period_key, seq=51,
                                        display='d51', entity_kind='zz_doc', entity_id='1')

    def test_series_specs_validation(self):
        bad = [
            NumberSeriesSpec(key='nomodule', title_fa='t'),
            NumberSeriesSpec(key='zz.noseq', title_fa='t', default_template='{period}'),
            NumberSeriesSpec(key='zz.notitle', title_fa=''),
            'not a spec',
            NumberSeriesSpec(key=KEY, title_fa='duplicate'),
        ]
        with _specs(DEFAULT_SPEC, *bad), self.assertLogs('numbering.registry', 'WARNING'):
            specs = series_specs()
        self.assertEqual(list(specs), [KEY])
        self.assertEqual(specs[KEY].title_fa, 'Test doc')

    def test_shamsi_year_default(self):
        self.assertEqual(shamsi_year(1, timezone.make_aware(datetime(2026, 10, 26))), '1405')
        self.assertEqual(shamsi_year(1, timezone.make_aware(datetime(2026, 3, 19))), '1404')


class NumberingConcurrency28bTests(TransactionTestCase):
    def setUp(self):
        if connection.vendor != 'postgresql':
            self.skipTest('row locks need postgresql; sqlite serialises writes')
        self.company = Company.objects.create(code='NUM-CC', name='CC')
        p = _specs(DEFAULT_SPEC)
        p.start()
        self.addCleanup(p.stop)

    def test_parallel_allocations_get_distinct_numbers(self):
        workers = 4
        barrier = threading.Barrier(workers)
        results, errors = [], []
        at = timezone.make_aware(datetime(2026, 5, 1))

        def run(i):
            try:
                barrier.wait()
                n = allocate(self.company.pk, KEY, 'zz_doc', f'e{i}', None, at=at)
                results.append(n.seq)
            except Exception as exc:  # noqa: BLE001 - reported below
                errors.append(repr(exc))
            finally:
                connection.close()

        threads = [threading.Thread(target=run, args=(i,)) for i in range(workers)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(30)
        self.assertEqual(errors, [])
        self.assertEqual(sorted(results), list(range(1, workers + 1)))
        self.assertEqual(NumberCounter.objects.get().last_seq, workers)

