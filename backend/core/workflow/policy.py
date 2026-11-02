"""
تنظیم «نبودن نفر در مرحله» و «تأیید سند خود» با ارث (طرح نبودن نفر، ۱۲ آبان ۱۴۰۵، بند ۴-۲ و ۴-۳).

ترتیب ارث هر مقدار: ردیف گردش ← ردیف پیش‌فرض شرکت (workflow_key خالی) ← پیش‌فرض اعلام‌شدهٔ ماژول برای نقش
(contribute('workflow_role_defaults', {نقش: 'skip'|'wait'})) ← پیش‌فرض نوع مرحله (تأیید = رد، بقیه = منتظر).
قفل مرحله (StepSpec.fixed_missing_action) بر همه مقدم است. هسته هیچ نام نقشی نمی‌شناسد (ق۱).
همهٔ ردیف‌های چند جفت (شرکت، گردش) با یک پرس‌وجو خوانده می‌شوند (ق۱۸).
"""
from dataclasses import dataclass, field

from django.core.exceptions import ImproperlyConfigured

from .registry import APPROVE, MISSING_ACTIONS, SKIP, WAIT

OWN = 'own'
COMPANY = 'company'
DEFAULT = 'default'

CREATOR_MAY_APPROVE_OWN = 'creator_may_approve_own'
NOTIFY_MODE = 'notify_mode'


def role_defaults() -> dict:
    """{نقش: 'skip'|'wait'} از اعلام ماژول‌ها؛ اعلام ناهمخوان یک نقش خطای پیکربندی است."""
    from platform_core.registry import contributions
    out = {}
    for item in contributions('workflow_role_defaults'):
        for role, action in dict(item).items():
            if action not in MISSING_ACTIONS:
                raise ImproperlyConfigured(f'workflow_role_defaults: مقدار «{action}» برای نقش «{role}» نامعتبر است')
            if out.get(role, action) != action:
                raise ImproperlyConfigured(f'workflow_role_defaults: نقش «{role}» با مقدار ناهمخوان اعلام شده است')
            out[role] = action
    return out


def _row_values(row) -> dict | None:
    if row is None:
        return None
    actions = row.role_actions if isinstance(row.role_actions, dict) else {}
    ids = row.notify_user_ids if isinstance(row.notify_user_ids, list) else []
    return {
        'role_actions': {k: v for k, v in actions.items() if v in MISSING_ACTIONS},
        CREATOR_MAY_APPROVE_OWN: row.creator_may_approve_own,
        NOTIFY_MODE: row.notify_mode or None,
        'notify_user_ids': [int(i) for i in ids if isinstance(i, int) or (isinstance(i, str) and i.isdigit())],
    }


@dataclass(frozen=True)
class EffectivePolicy:
    """
    تنظیم مؤثر یک (شرکت، گردش). برای workflow_key خالی (پیش‌فرض شرکت) ردیف شرکت همان ردیف «خود» است.
    source(name) برای نام نقش، 'creator_may_approve_own' یا 'notify_mode': 'own' | 'company' | 'default'.
    """
    company_id: int
    workflow_key: str
    workflow_row: dict | None = None
    company_row: dict | None = None
    defaults: dict = field(default_factory=dict)

    def _levels(self):
        """[(منبع، مقدارها)] به ترتیب ارث، بی سطح خالی."""
        if not self.workflow_key:
            return [(OWN, self.company_row)] if self.company_row else []
        out = []
        if self.workflow_row:
            out.append((OWN, self.workflow_row))
        if self.company_row:
            out.append((COMPANY, self.company_row))
        return out

    def _lookup(self, name):
        for source, values in self._levels():
            if name in (CREATOR_MAY_APPROVE_OWN, NOTIFY_MODE):
                if values[name] is not None:
                    return source, values[name], values
            elif name in values['role_actions']:
                return source, values['role_actions'][name], values
        return DEFAULT, None, None

    def role_action(self, role, kind=None):
        """رد/منتظر برای نقش؛ بی تنظیم و بی پیش‌فرض ماژول، پیش‌فرض نوع مرحله (kind)."""
        _source, value, _row = self._lookup(role)
        if value is not None:
            return value
        if role in self.defaults:
            return self.defaults[role]
        return SKIP if kind == APPROVE else WAIT

    def missing_action(self, step) -> str:
        """'skip' یا 'wait' برای مرحلهٔ بی‌دریافت‌کنندهٔ اصلی؛ قفل مرحله بر همه مقدم است."""
        fixed = getattr(step, 'fixed_missing_action', None)
        if fixed in MISSING_ACTIONS:
            return fixed
        return self.role_action(step.role, step.kind)

    @property
    def creator_may_approve_own(self) -> bool:
        return bool(self._lookup(CREATOR_MAY_APPROVE_OWN)[1])

    @property
    def notify_mode(self) -> str:
        from .models import WorkflowPolicy
        return self._lookup(NOTIFY_MODE)[1] or WorkflowPolicy.NOTIFY_ROLE_ASSIGNERS

    @property
    def notify_user_ids(self) -> list:
        """کاربران همان سطحی که notify_mode را داده است (بی تنظیم: خالی)."""
        _source, _value, row = self._lookup(NOTIFY_MODE)
        return list(row['notify_user_ids']) if row else []

    def source(self, name) -> str:
        return self._lookup(name)[0]


def effective_policies(pairs) -> dict:
    """{(company_id, workflow_key): EffectivePolicy} برای همهٔ جفت‌ها با یک پرس‌وجو."""
    from .models import WorkflowPolicy
    pairs = {(c, k or '') for c, k in pairs if c}
    if not pairs:
        return {}
    company_ids = {c for c, _k in pairs}
    keys = {k for _c, k in pairs} | {''}
    rows = {(r.company_id, r.workflow_key): r
            for r in WorkflowPolicy.objects.filter(company_id__in=company_ids, workflow_key__in=keys)}
    defaults = role_defaults()
    out = {}
    for company_id, key in pairs:
        out[(company_id, key)] = EffectivePolicy(
            company_id=company_id, workflow_key=key,
            workflow_row=_row_values(rows.get((company_id, key))) if key else None,
            company_row=_row_values(rows.get((company_id, ''))),
            defaults=defaults,
        )
    return out


def effective_policy(company_id, workflow_key) -> EffectivePolicy:
    """تنظیم مؤثر یک جفت (شرکت، گردش)."""
    key = workflow_key or ''
    if not company_id:
        return EffectivePolicy(company_id=company_id, workflow_key=key, defaults=role_defaults())
    return effective_policies([(company_id, key)])[(company_id, key)]
