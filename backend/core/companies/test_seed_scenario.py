"""دستور seed_scenario برای سناریوهای طرح ۲.۲ (کاربر چندنقشی، تفاوت کاربر و تفاوت بسته)."""
import os
from unittest import mock

from django.core.management import call_command
from django.test import TestCase

from accounts.models import RoleBundleOverride, UserPermissionOverride
from accounts.scoped_permissions import can, default_bundles, section_permission_codes
from companies.models import ProjectSection, SectionAssignment, section_role_choices


class SeedScenarioTests(TestCase):
    def setUp(self):
        roles = [item[0] for item in section_role_choices()]
        bundles = default_bundles()
        # دو نقش که اولی مجوز بخشی دارد که دومی ندارد
        self.pair = next(((a, b, sorted(bundles.get(a, set()) - bundles.get(b, set())))
                          for a in roles for b in roles if a != b and bundles.get(a, set()) - bundles.get(b, set())), None)
        if self.pair is None or not section_permission_codes():
            self.skipTest('هیچ ماژولی مجوز بخشی با بستهٔ پیش‌فرض اعلام نکرده است')
        env = mock.patch.dict(os.environ, {'WH_ALLOW_SCENARIO_SEED': '1'})
        env.start()
        self.addCleanup(env.stop)
        writer = mock.patch('companies.management.commands.seed_scenario.CREDENTIALS_FILE')
        writer.start()
        self.addCleanup(writer.stop)

    def test_mixed_user_override_and_bundle(self):
        role_a, role_b, only_a = self.pair
        code = only_a[0]
        call_command('seed_scenario', mixed=f'{role_a},{role_b}', remove=[f'mixed={code}'],
                     bundle=[f'{role_b}=+{code}'], stdout=mock.MagicMock())
        from django.contrib.auth import get_user_model
        user = get_user_model().objects.get(username='qa_scn_mixed')
        self.assertEqual(SectionAssignment.objects.filter(user=user, is_active=True).count(), 3)
        s1 = ProjectSection.objects.get(code='QA-S1')
        s3 = ProjectSection.objects.get(code='QA-S3')
        s_c2 = ProjectSection.objects.get(code='QA2-S1')
        override = UserPermissionOverride.objects.get(user=user)
        self.assertEqual((override.mode, override.company_id), ('remove', s1.project.company_id))
        self.assertTrue(RoleBundleOverride.objects.filter(role_key=role_b, mode='add', permission__codename=code).exists())
        # برداشته در شرکت اول؛ شرکت دوم با بستهٔ ویرایش‌شدهٔ نقش دوم همچنان دارد؛ بخش سه بی‌انتساب
        self.assertFalse(can(user, code, s1))
        self.assertTrue(can(user, code, s_c2))
        self.assertFalse(can(user, code, s3))

        call_command('seed_scenario', purge=True, stdout=mock.MagicMock())
        self.assertFalse(get_user_model().objects.filter(username__startswith='qa_scn_').exists())
        self.assertFalse(ProjectSection.objects.filter(code__in=['QA-S1', 'QA2-S1']).exists())
