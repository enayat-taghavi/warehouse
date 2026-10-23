"""
Test-only automatic membership source (company permissions plan, Q2).

Since a manual UserCompanyAccess row no longer grants membership, integration tests that only need
"user X is a member of company Y" (without a specific module source) call `grant_membership`.
"""
from companies.access import register_derived_company_source

_PAIRS = set()


def _test_source(user):
    return [{'company_id': cid, 'source_label': 'test'} for uid, cid in _PAIRS if uid == user.id]


register_derived_company_source(_test_source)


def grant_membership(user, company):
    _PAIRS.add((user.id, getattr(company, 'id', company)))


def _test_member_q(allowed_cids):
    from django.db.models import Q
    ids = [uid for uid, cid in _PAIRS if cid in set(allowed_cids)]
    return Q(id__in=ids) if ids else None


from platform_core.registry import contribute  # noqa: E402

contribute('company_member_q_builders', _test_member_q)
