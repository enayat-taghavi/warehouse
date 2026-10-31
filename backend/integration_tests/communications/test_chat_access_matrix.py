"""
ماتریس آزمون‌های حوزهٔ مخاطبان چت (طرح Communication_System_Hardening/chat_access_contact_scope):
حوزهٔ پروژه، چند شرکت، اولویت حوزهٔ کاربر بر پیش‌فرض شرکت، حوزهٔ «all» و شرکت غیرفعال.
"""
from integration_tests.communications.test_chat_access import ChatAccessTestBase


class ProjectScopeMatrixTests(ChatAccessTestBase):
    """شرکت با پیش‌فرض `project`؛ دو پروژه؛ P1 دو بخش و P2 یک بخش دارد"""

    def setUp(self):
        super().setUp()
        self.co = self.make_company()
        self.set_company_scope(self.co, 'project')
        self.p1, self.p2 = self.make_project(self.co), self.make_project(self.co)
        self.s1, self.s2 = self.make_section(self.p1), self.make_section(self.p1)
        self.s3 = self.make_section(self.p2)

    def test_project_scope_sees_project_mates_across_sections(self):
        viewer, mate1, mate2, outsider = (self.make_user() for _ in range(4))
        self.assign_section(viewer, self.s1)
        self.assign_section(mate1, self.s1)
        self.assign_section(mate2, self.s2)
        self.assign_section(outsider, self.s3)
        self.assertEqual(self.contact_ids(viewer), {mate1.id, mate2.id, self.superuser.id})

    def test_project_level_assignment_covers_all_sections_of_project(self):
        viewer, pm, u2, u3 = (self.make_user() for _ in range(4))
        self.assign_section(viewer, self.s1)
        self.assign_section(u2, self.s2)
        self.assign_section(u3, self.s3)
        self.assign_project(pm, self.p1)
        self.assertIn(pm.id, self.contact_ids(viewer))
        pm_ids = self.contact_ids(pm)
        self.assertIn(viewer.id, pm_ids)
        self.assertIn(u2.id, pm_ids)
        self.assertNotIn(u3.id, pm_ids)

    def test_inactive_assignment_not_counted_in_project_scope(self):
        viewer, ghost = self.make_user(), self.make_user()
        self.assign_section(viewer, self.s1)
        self.assign_section(ghost, self.s2, active=False)
        self.assertNotIn(ghost.id, self.contact_ids(viewer))
        self.assertEqual(self.contact_ids(ghost), {self.superuser.id})


class MultiCompanyMatrixTests(ChatAccessTestBase):
    """چند شرکت: اجتماع حوزه‌ها، اولویت حوزهٔ کاربر، حوزهٔ all"""

    def test_union_over_two_companies_with_different_defaults(self):
        co_a, co_b, co_x = self.make_company(), self.make_company(), self.make_company()
        self.set_company_scope(co_a, 'section')
        self.set_company_scope(co_b, 'company')
        pa = self.make_project(co_a)
        sa1, sa2 = self.make_section(pa), self.make_section(pa)
        sb1 = self.make_section(self.make_project(co_b))
        sx = self.make_section(self.make_project(co_x))
        viewer, a1, a2, b1, b2, x = (self.make_user() for _ in range(6))
        self.assign_section(viewer, sa1)
        self.assign_section(viewer, sb1)
        self.assign_section(a1, sa1)
        self.assign_section(a2, sa2)
        self.assign_section(b1, sb1)
        self.link_company(b2, co_b)
        self.assign_section(x, sx)
        self.assertEqual(self.contact_ids(viewer), {a1.id, b1.id, b2.id, self.superuser.id})

    def test_user_scope_overrides_company_default(self):
        co_e = self.make_company()
        self.set_company_scope(co_e, 'section')
        pe = self.make_project(co_e)
        viewer, peer = self.make_user(), self.make_user()
        self.assign_section(viewer, self.make_section(pe))
        self.assign_section(peer, self.make_section(pe))
        self.assertNotIn(peer.id, self.contact_ids(viewer))
        self.set_user_policy(viewer, contact_scope='company')
        self.assertIn(peer.id, self.contact_ids(viewer))

        co_d = self.make_company()
        self.set_company_scope(co_d, 'company')
        pd = self.make_project(co_d)
        viewer2, peer2 = self.make_user(), self.make_user()
        self.assign_section(viewer2, self.make_section(pd))
        self.assign_section(peer2, self.make_section(pd))
        self.assertIn(peer2.id, self.contact_ids(viewer2))
        self.set_user_policy(viewer2, contact_scope='section')
        self.assertNotIn(peer2.id, self.contact_ids(viewer2))

    def test_user_scope_all_sees_every_active_user(self):
        sections = [self.make_section(self.make_project(self.make_company())) for _ in range(3)]
        viewer = self.make_user()
        self.assign_section(viewer, sections[0])
        others = []
        for sec in sections:
            u = self.make_user()
            self.assign_section(u, sec)
            others.append(u)
        loner = self.make_user()
        inactive = self.make_user(is_active=False)
        self.set_user_policy(viewer, contact_scope='all')
        ids = self.contact_ids(viewer)
        for u in others + [loner]:
            self.assertIn(u.id, ids)
        self.assertNotIn(inactive.id, ids)
        self.assertNotIn(viewer.id, ids)

    def test_company_default_all_crosses_companies(self):
        co_a, co_b = self.make_company(), self.make_company()
        self.set_company_scope(co_a, 'all')
        self.set_company_scope(co_b, 'company')
        viewer, other = self.make_user(), self.make_user()
        self.assign_section(viewer, self.make_section(self.make_project(co_a)))
        self.assign_section(other, self.make_section(self.make_project(co_b)))
        self.assertIn(other.id, self.contact_ids(viewer))
        self.assertEqual(self.contact_ids(other), {self.superuser.id})


class InactiveCompanyMatrixTests(ChatAccessTestBase):
    """شرکت غیرفعال عضویت حساب نمی‌شود"""

    def test_inactive_company_membership_not_counted(self):
        z = self.make_company(active=False)
        sec = self.make_section(self.make_project(z))
        viewer, peer = self.make_user(), self.make_user()
        self.assign_section(viewer, sec)
        self.assign_section(peer, sec)
        self.link_company(viewer, z)
        self.link_company(peer, z)
        self.assertEqual(self.contact_ids(viewer), {self.superuser.id})

    def test_inactive_company_ignored_but_active_company_counts(self):
        z = self.make_company(active=False)
        a = self.make_company()
        sz = self.make_section(self.make_project(z))
        sa = self.make_section(self.make_project(a))
        viewer, z1, a1 = self.make_user(), self.make_user(), self.make_user()
        self.assign_section(viewer, sz)
        self.assign_section(z1, sz)
        self.assign_section(viewer, sa)
        self.assign_section(a1, sa)
        self.assertEqual(self.contact_ids(viewer), {a1.id, self.superuser.id})
