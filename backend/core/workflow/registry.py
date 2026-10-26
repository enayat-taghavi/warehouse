"""
رجیستری گردش‌های کار (ت۱ طرح ۲.۳). هر ماژول گردش‌های خود را با `contribute('workflows', WorkflowSpec(...))`
اعلام می‌کند؛ هسته هیچ نام ماژول، نقش یا مجوزی را نمی‌شناسد و فقط اعلام را می‌سنجد.

اعتبارسنجی تنبل است، چون ready() اپ‌های ماژول پس از اپ‌های هسته اجرا می‌شود: `workflow_specs()` در اولین
فراخوانی می‌سنجد و کش می‌کند؛ بررسی سامانه‌ای workflow.E001 همان سنجش را بی‌کش اجرا می‌کند.
"""
from dataclasses import dataclass, field

from django.core.exceptions import ImproperlyConfigured

# نوع مرحله: «تأیید» با قاعده‌های ت۶ رد می‌شود؛ «بررسی» و «اجرا» همیشه اجباری‌اند
APPROVE = 'approve'
REVIEW = 'review'
EXECUTE = 'execute'
STEP_KINDS = (APPROVE, REVIEW, EXECUTE)

ACT = 'act'
RETURN = 'return'
REJECT = 'reject'
STEP_ACTIONS = (ACT, RETURN, REJECT)

# نوع کار ارجاع (ر۲ طرح ۲.۳-و): «ارجاع» اقدام می‌خواهد، «برای اطلاع» فقط رؤیت؛ هرگز نوع مرحلهٔ اعلام‌شده نیست
REFER = 'refer'
INFORM = 'inform'
REFERRAL_KINDS = (REFER, INFORM)

# وضعیت‌های پایانی که به on_state_change داده می‌شوند (به‌جای کلید مرحله)
COMPLETED = 'completed'
RETURNED = 'returned'
REJECTED = 'rejected'
CANCELLED = 'cancelled'
TERMINAL_STATES = (COMPLETED, RETURNED, REJECTED, CANCELLED)


@dataclass(frozen=True)
class StepSpec:
    """یک مرحلهٔ گردش: نقش انتساب دریافت‌کننده و مجوز بخشی لازم برای اقدام (ت۳)."""
    key: str
    title_fa: str
    role: str
    permission: str
    kind: str
    actions: tuple = STEP_ACTIONS


@dataclass(frozen=True)
class WorkflowSpec:
    """
    اعلام یک گردش.
    - on_state_change(obj, state, instance): state کلید مرحلهٔ تازه یا یکی از TERMINAL_STATES؛ ماژول
      وضعیت سند خودش را به‌روز می‌کند (ت۲).
    - summary(obj) -> dict: دست‌کم 'title'؛ موتور آن را JSON-امن ذخیره می‌کند (Decimal به رشته).
    - route: الگوی مسیر صفحهٔ سند در فرانت با '{id}'.
    - بخش سند از getattr(obj, f'{section_field}_id') و مبلغ (اختیاری) از getattr(obj, amount_field).
    - view_permission (اختیاری): مجوز بخشی که دارنده‌اش در بخش سند سابقهٔ گردش آن را هم می‌بیند (API سابقه).
    - referral_only (ر۱۵ طرح ۲.۳-و): سند بی‌مرحله که فقط ارجاع می‌گیرد (steps=())؛ با engine.open_for_referral.
    """
    key: str
    version: int
    entity_kind: str
    title_fa: str
    steps: tuple
    on_state_change: object
    summary: object
    route: str
    section_field: str = 'section'
    amount_field: str | None = None
    view_permission: str | None = None
    referral_only: bool = False
    _index: dict = field(default=None, init=False, repr=False, compare=False, hash=False)

    def __post_init__(self):
        object.__setattr__(self, 'steps', tuple(self.steps))
        object.__setattr__(self, '_index', {s.key: s for s in self.steps})

    @property
    def step_keys(self) -> list:
        return [s.key for s in self.steps]

    def step(self, key):
        return self._index.get(key)


_CACHE: dict | None = None


def _declared() -> list:
    from platform_core.registry import contributions
    out = []
    for item in contributions('workflows'):
        if isinstance(item, (list, tuple)):
            out.extend(item)
        else:
            out.append(item)
    return out


def _fail(msg):
    raise ImproperlyConfigured(f'گردش کار: {msg}')


def _validate_step(spec, step, ranks, perm_specs):
    from accounts.scoped_permissions import SECTION, permission_scope
    where = f'«{spec.key}» مرحلهٔ «{getattr(step, "key", step)}»'
    if not isinstance(step, StepSpec):
        _fail(f'{where}: مرحله باید StepSpec باشد')
    if not step.key or not isinstance(step.key, str):
        _fail(f'{where}: کلید مرحله خالی است')
    if step.key in TERMINAL_STATES:
        _fail(f'{where}: کلید مرحله نباید یکی از وضعیت‌های پایانی {TERMINAL_STATES} باشد')
    if step.kind not in STEP_KINDS:
        _fail(f'{where}: نوع مرحلهٔ «{step.kind}» نامعتبر است')
    actions = tuple(step.actions)
    if not actions or ACT not in actions or any(a not in STEP_ACTIONS for a in actions):
        _fail(f'{where}: اقدام‌های مجاز باید زیرمجموعهٔ {STEP_ACTIONS} و شامل «act» باشند')
    if ranks.get(step.role) is None:
        _fail(f'{where}: نقش «{step.role}» اعلام نشده یا رتبه ندارد')
    if step.permission not in perm_specs or permission_scope(step.permission) != SECTION:
        _fail(f'{where}: مجوز «{step.permission}» اعلام نشده یا بخشی نیست')


def validate_specs(items=None) -> dict:
    """سنجش اعلام‌ها بی‌کش؛ خروجی {key: WorkflowSpec}. خطا: ImproperlyConfigured با نام کلید خطادار."""
    from companies.models import section_role_ranks
    from platform_core.module_catalog import installed_permission_specs
    items = _declared() if items is None else list(items)
    if not items:
        return {}
    ranks = section_role_ranks()
    perm_specs = installed_permission_specs()
    out = {}
    for spec in items:
        if not isinstance(spec, WorkflowSpec):
            _fail(f'اعلام {spec!r} باید WorkflowSpec باشد')
        if not spec.key or not isinstance(spec.key, str):
            _fail(f'کلید گردش خالی است ({spec!r})')
        if spec.key in out:
            _fail(f'کلید «{spec.key}» تکراری اعلام شده است')
        if not isinstance(spec.version, int) or isinstance(spec.version, bool) or spec.version < 1:
            _fail(f'«{spec.key}»: نسخه باید عدد صحیح ۱ یا بیشتر باشد')
        if not spec.entity_kind:
            _fail(f'«{spec.key}»: نوع سند (entity_kind) خالی است')
        if spec.referral_only and spec.steps:
            _fail(f'«{spec.key}»: گردش فقط ارجاع (referral_only) نباید مرحله داشته باشد')
        if not spec.steps and not spec.referral_only:
            _fail(f'«{spec.key}»: دست‌کم یک مرحله لازم است')
        keys = [getattr(s, 'key', None) for s in spec.steps]
        if len(set(keys)) != len(keys):
            _fail(f'«{spec.key}»: کلید مرحله‌ها تکراری است')
        for step in spec.steps:
            _validate_step(spec, step, ranks, perm_specs)
        if spec.view_permission is not None:
            from accounts.scoped_permissions import SECTION, permission_scope
            if spec.view_permission not in perm_specs or permission_scope(spec.view_permission) != SECTION:
                _fail(f'«{spec.key}»: مجوز دیدن سابقه «{spec.view_permission}» اعلام نشده یا بخشی نیست')
        if not isinstance(spec.route, str) or '{id}' not in spec.route:
            _fail(f'«{spec.key}»: مسیر صفحهٔ سند باید «{{id}}» داشته باشد')
        if not callable(spec.on_state_change) or not callable(spec.summary):
            _fail(f'«{spec.key}»: on_state_change و summary باید callable باشند')
        out[spec.key] = spec
    return out


def workflow_specs() -> dict:
    """{key: WorkflowSpec} گردش‌های اعلام‌شده؛ سنجش در اولین فراخوانی و کش."""
    global _CACHE
    if _CACHE is None:
        _CACHE = validate_specs()
    return _CACHE


def reset_workflow_cache() -> None:
    """پاک کردن کش اعلام‌ها (برای تست‌ها)."""
    global _CACHE
    _CACHE = None


def get_spec(key):
    """اعلام گردش با این کلید؛ ناموجود WorkflowError('unknown_workflow') می‌دهد."""
    spec = workflow_specs().get(key)
    if spec is None:
        from .errors import WorkflowError
        raise WorkflowError('unknown_workflow', f'گردش کار «{key}» تعریف نشده است', 400)
    return spec
