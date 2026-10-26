"""طرح ۳.۲ (ص۷): کنش گردش روی سندی که قلاب is_locked ماژول آن را قفل می‌داند با 409 entity_locked رد می‌شود."""
from unittest.mock import patch

import platform_core.registry as preg
from workflow import engine
from workflow.errors import WorkflowError
from workflow.models import WorkflowInstance

from .base import KIND, WF
from .test_engine import EngineBase


class EntityLockTests(EngineBase):
    def lock(self, *locked_ids):
        return patch.dict(preg._CONTRIBUTIONS, {f'is_locked:{KIND}': [lambda i: int(i) in locked_ids]})

    def assert_locked(self, fn):
        with self.assertRaises(WorkflowError) as cm:
            fn()
        self.assertEqual(cm.exception.code, 'entity_locked')
        self.assertEqual(cm.exception.status, 409)

    def test_submit_of_locked_doc_rejected(self):
        d = self.doc()
        with self.lock(d.pk):
            self.assert_locked(lambda: engine.submit(WF, d, self.member))
        self.assertFalse(WorkflowInstance.objects.filter(entity_kind=KIND, entity_id=d.pk).exists())

    def test_act_and_cancel_of_locked_doc_rejected(self):
        d, inst = self.submit()
        with self.lock(d.pk):
            self.assert_locked(lambda: self.act(self.lead, d))
            self.assert_locked(lambda: engine.cancel(self.fresh(self.member), inst, obj=d))
        self.assertEqual(self.task(d).step_key, 'lead_ok')
        self.act(self.lead, d)
        self.assertEqual(self.task(d).step_key, 'review')

    def test_other_doc_not_affected(self):
        d = self.doc()
        with self.lock(d.pk + 1000):
            engine.submit(WF, d, self.member)
        self.assertIsNotNone(self.task(d))
