#!/usr/bin/env python
"""
ایجنت نگهبان ۶۰ — حصار نوشتن مدیر کل (طرح نبودن نفر ۱۴۰۵-۰۸، بند ۴-۶)
(Guardian 60 — every module write route is fenced for the system superuser or explicitly allowlisted)

مرجع: Documents/Release_v1/2.3_workflow/plan_role_policies_1405-08.md (بند ۴-۶، راه پیشنهادی ۲)

حصار مرکزی (backend/core/accounts/superuser_fence.py، در AuditContextMiddleware) هر درخواست نوشتنی مدیر کل را
روی پیشوندهای اعلام‌شده (contribute('superuser_write_fence', ...)) با 403 superuser_view_only رد می‌کند، مگر مسیر
در فهرست استثنا (superuser_write_allowlist) باشد. این نگهبان همهٔ مسیرهای URL را با Django می‌خواند و:

  1. هر مسیر نوشتنی (POST/PUT/PATCH/DELETE) زیر پیشوند API ماژولی که گردش کار سند دارد (ModuleSpec.api_prefixes)
     باید حصارشده یا در فهرست استثنا باشد؛ مسیر بی‌حصار = شکست؛
  2. مسیرهای هستهٔ گردش (/api/workflow/tasks|instances) هم همین‌طور؛
  3. هر الگوی فهرست استثنا باید دست‌کم یک مسیر نوشتنی واقعی را بگیرد (الگوی کهنه = شکست)؛
  4. هر نوع سند گردش ماژول (WorkflowSpec.entity_kind) باید در superuser_view_only_kinds باشد (پیوست).

گزینه‌ها:
  python scripts/e2e/guardian_60_superuser_write_fence.py          # بررسی
  python scripts/e2e/guardian_60_superuser_write_fence.py --list   # فهرست مسیرهای نوشتنی و حکم هر کدام
  python scripts/e2e/guardian_60_superuser_write_fence.py --json   # خروجی ماشین‌خوان
"""

import argparse
import json
import os
import pathlib
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
WRITE_METHODS = ("post", "put", "patch", "delete")
CORE_WORKFLOW_PREFIXES = ("/api/workflow/tasks/", "/api/workflow/instances/")


def _setup_django():
    sys.path.insert(0, str(BACKEND_DIR))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    os.environ.setdefault("PYTHONUTF8", "1")
    import django
    django.setup()


_PARAM_RX = re.compile(r"<(?:(?P<conv>[^>:]+):)?(?P<name>[^>]+)>")


def _sample(route: str) -> str:
    """مسیر نمونه از الگوی path/re_path (پارامترها = 1)."""
    s = re.sub(r"\(\?P<[^>]+>[^)]*\)", "1", route)
    s = _PARAM_RX.sub(lambda m: "x" if (m.group("conv") in ("str", "slug", "path")) else "1", s)
    s = s.replace("^", "").replace("$", "").replace("\\.", ".").replace("/?", "/")
    s = re.sub(r"\[[^\]]*\][*+?]?", "", s)
    s = s.replace("(?:", "").replace(")", "").replace("?", "")
    return "/" + s.lstrip("/")


def _methods(callback):
    """متدهای نوشتنی یک view: ViewSet از actions، APIView از متدهای تعریف‌شده."""
    actions = getattr(callback, "actions", None)
    if actions:
        return sorted({m for m in actions if m in WRITE_METHODS})
    cls = getattr(callback, "view_class", None) or getattr(callback, "cls", None)
    if cls is None:
        return []
    return sorted(m for m in WRITE_METHODS if callable(getattr(cls, m, None)))


def write_routes():
    from django.urls import get_resolver
    from django.urls.resolvers import URLPattern, URLResolver
    out = []

    def walk(patterns, prefix):
        for p in patterns:
            route = prefix + str(p.pattern)
            if isinstance(p, URLResolver):
                walk(p.url_patterns, route)
            elif isinstance(p, URLPattern):
                if "<format>" in route:
                    continue  # پسوند قالب DRF (همان view بی پسوند شمرده می‌شود)
                for m in _methods(p.callback):
                    out.append({"method": m.upper(), "route": route, "path": _sample(route),
                                "view": getattr(p.callback, "__qualname__", getattr(p.callback, "__name__", "?"))})
    walk(get_resolver().url_patterns, "")
    seen, uniq = set(), []
    for r in out:
        key = (r["method"], r["path"])
        if key not in seen:
            seen.add(key)
            uniq.append(r)
    return uniq


def check():
    _setup_django()
    from accounts import superuser_fence as fence
    from platform_core.registry import get_module, installed_modules
    from workflow.registry import workflow_specs
    fence.reset_cache()
    prefixes, allow = fence._compiled()

    module_prefixes = []
    specs = workflow_specs()
    workflow_kinds = {s.entity_kind for s in (specs.values() if isinstance(specs, dict) else specs)}
    for code in installed_modules():
        spec = get_module(code)
        for api_prefix in getattr(spec, "api_prefixes", ()) or ():
            module_prefixes.append("/" + str(api_prefix).lstrip("/"))
    # فقط ماژول‌هایی که حصار اعلام کرده‌اند (انبار بیرون از نسخهٔ اول دست نخورده است، س۴)
    guarded = tuple(CORE_WORKFLOW_PREFIXES) + tuple(p for p in module_prefixes if p.startswith(prefixes))

    routes = write_routes()
    rows, failures = [], []
    for r in routes:
        if not r["path"].startswith(guarded):
            continue
        fenced = fence.is_fenced_write(r["method"], r["path"])
        allowed = any(rx.match(r["path"]) for rx in allow)
        verdict = "fenced" if fenced else ("allowlisted" if allowed else "OPEN")
        rows.append({**r, "verdict": verdict})
        if verdict == "OPEN":
            failures.append(f"مسیر نوشتنی بی‌حصار: {r['method']} {r['path']} ({r['view']})")

    write_paths = [r["path"] for r in routes]
    for rx in allow:
        if not any(rx.match(p) for p in write_paths):
            failures.append(f"الگوی کهنهٔ فهرست استثنا (هیچ مسیر نوشتنی را نمی‌گیرد): {rx.pattern}")

    view_only = fence.view_only_kinds()
    missing_kinds = sorted(k for k in workflow_kinds if k not in view_only)
    for k in missing_kinds:
        failures.append(f"نوع سند گردش بیرون از superuser_view_only_kinds: {k}")
    return rows, failures


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    rows, failures = check()
    if args.json:
        print(json.dumps({"routes": rows, "failures": failures}, ensure_ascii=False, indent=1))
    else:
        if args.list:
            for r in rows:
                print(f"{r['verdict']:<12} {r['method']:<6} {r['path']}  [{r['view']}]")
        counts = {}
        for r in rows:
            counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1
        print(f"نگهبان ۶۰: {len(rows)} مسیر نوشتنی سند — " + "، ".join(f"{k}={v}" for k, v in sorted(counts.items())))
        for f in failures:
            print("FAIL:", f)
        print("PASS" if not failures else f"FAILED ({len(failures)})")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
