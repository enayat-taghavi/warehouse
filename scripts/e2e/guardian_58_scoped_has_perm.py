#!/usr/bin/env python
"""
ایجنت نگهبان ۵۸ — has_perm روی مجوز بخشی در ماژول‌ها (طرح ۲.۲، ت۸)
(Guardian 58 — no new global has_perm checks on section-scope permissions)

مرجع: Documents/Release_v1/2.2_permissions/plan_2.2_permissions.md (ت۱، ت۸)

مجوز بخشی (scope='section') «کجا» را از انتساب می‌گیرد؛ user.has_perm('accounts.<code>') روی آن فقط
می‌گوید «دست‌کم در یک بخش» و قلمرو را نمی‌سنجد. بررسی درست با scoped_permissions.can(user, code, section)،
sections_where() یا section_q() است. این نگهبان شمار فراخوانی‌های سراسری را در کد غیرآزمونی backend/modules
می‌شمارد و با مبنا می‌سنجد (آچار یک‌طرفه):

  شمرده می‌شود (AST، فقط آرگومان رشته‌ای ثابت):
    - x.has_perm('accounts.<code>') یا x.has_perm('<code>')
    - x.has_perms([...]) / x.has_perms((...)) — هر عضو رشته‌ای جدا شمرده می‌شود
    - HasMenuAccess('<code>') — کلاس مجوز هسته که با has_perm یک کد را سراسری می‌سنجد
  شمرده نمی‌شود: آرگومان متغیر یا f-string (قابل حل ایستا نیست)، has_permission_alias (نام توانایی)،
  can()/sections_where()/section_q() و فایل‌های آزمون/migration.

مجموعهٔ کدهای بخشی: همهٔ مجوزهای scope='section' همهٔ ماژول‌های روی دیسک (platform_core.module_catalog،
بی Django) منهای SENSITIVE_PERMISSION_CODENAMES (خوانده‌شده با AST از core/accounts/models.py).

مبنا: scripts/e2e/scoped_has_perm_baseline.json  {"total": N, "files": {path: n}}
  - افزایش total یا شمار هر فایل (یا فایل تازه) = شکست.
  - کاهش (مبنای کهنه) هم شکست است تا پیشرفت قفل شود: --write-baseline را اجرا کنید.

گزینه‌ها:
  python scripts/e2e/guardian_58_scoped_has_perm.py                    # بررسی
  python scripts/e2e/guardian_58_scoped_has_perm.py --write-baseline   # ثبت مبنای جدید از درخت جاری
  python scripts/e2e/guardian_58_scoped_has_perm.py --self-test        # آزمون تشخیص روی نمونهٔ ساختگی
  python scripts/e2e/guardian_58_scoped_has_perm.py --json             # خروجی ماشین‌خوان
"""

import argparse
import ast
import json
import pathlib
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
MODULES_DIR = BACKEND_DIR / "modules"
ACCOUNTS_MODELS = BACKEND_DIR / "core" / "accounts" / "models.py"
BASELINE_FILE = pathlib.Path(__file__).resolve().parent / "scoped_has_perm_baseline.json"

PERM_METHODS = {"has_perm", "has_perms"}
PERM_CLASSES = {"HasMenuAccess"}


# ─── مجموعهٔ کدهای بخشی ─────────────────────────────────────────────────────

def sensitive_codenames(models_path=ACCOUNTS_MODELS):
    try:
        tree = ast.parse(pathlib.Path(models_path).read_text(encoding="utf-8"))
    except (OSError, SyntaxError):
        return set()
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
                isinstance(t, ast.Name) and t.id == "SENSITIVE_PERMISSION_CODENAMES" for t in node.targets):
            try:
                return set(ast.literal_eval(node.value))
            except ValueError:
                return set()
    return set()


def section_codes():
    """کدهای بخشی همهٔ ماژول‌های روی دیسک (نه فقط نصب‌شده‌ها) منهای حساس‌ها."""
    core_dir = str(BACKEND_DIR / "core")
    if core_dir not in sys.path:
        sys.path.insert(0, core_dir)
    from platform_core import module_catalog  # بی وابستگی به Django
    codes = {
        spec["code"]
        for specs in module_catalog.MODULE_PERMISSION_SPECS.values()
        for spec in specs
        if spec.get("scope") == "section"
    }
    return codes - sensitive_codenames()


# ─── پویش ─────────────────────────────────────────────────────────────────────

def _is_test_or_migration(rel):
    name = rel.name
    return (name.startswith("test") or name == "tests.py" or name.endswith("_tests.py")
            or "tests" in rel.parts or "migrations" in rel.parts)


def _bare(code):
    return code.split(".", 1)[1] if code.startswith("accounts.") else code


def _string_args(call):
    out = []
    for arg in call.args[:1]:
        if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
            out.append(arg.value)
        elif isinstance(arg, (ast.List, ast.Tuple, ast.Set)):
            out.extend(e.value for e in arg.elts if isinstance(e, ast.Constant) and isinstance(e.value, str))
    return out


def scan_source(text, codes):
    """[(سطر، کد، نوع)] برای هر بررسی سراسری کد بخشی در یک منبع پایتون."""
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return []
    hits = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if isinstance(func, ast.Attribute) and func.attr in PERM_METHODS:
            kind = func.attr
        elif isinstance(func, ast.Name) and func.id in PERM_CLASSES:
            kind = func.id
        elif isinstance(func, ast.Attribute) and func.attr in PERM_CLASSES:
            kind = func.attr
        else:
            continue
        for raw in _string_args(node):
            if raw.count(".") > 1 or (raw.count(".") == 1 and not raw.startswith("accounts.")):
                continue
            code = _bare(raw)
            if code in codes:
                hits.append((node.lineno, code, kind))
    return hits


def scan(modules_dir=MODULES_DIR, codes=None, root=BACKEND_DIR):
    codes = section_codes() if codes is None else codes
    files, details = {}, []
    for f in sorted(pathlib.Path(modules_dir).rglob("*.py")):
        rel = f.relative_to(root)
        if _is_test_or_migration(rel):
            continue
        hits = scan_source(f.read_text(encoding="utf-8", errors="ignore"), codes)
        if hits:
            key = rel.as_posix()
            files[key] = len(hits)
            details.extend({"file": key, "line": ln, "code": c, "kind": k} for ln, c, k in hits)
    return {"total": sum(files.values()), "files": files}, details


def compare(current, baseline):
    """(regressions, stale): پس‌رفت‌ها و کاهش‌های ثبت‌نشده."""
    regressions, stale = [], []
    base_files = baseline.get("files", {})
    if current["total"] > baseline.get("total", 0):
        regressions.append(f"total: مبنا {baseline.get('total', 0)} ← جاری {current['total']}")
    elif current["total"] < baseline.get("total", 0):
        stale.append(f"total: مبنا {baseline.get('total', 0)} ← جاری {current['total']}")
    for path in sorted(set(base_files) | set(current["files"])):
        prev, now = base_files.get(path, 0), current["files"].get(path, 0)
        if now > prev:
            regressions.append(f"{path}: مبنا {prev} ← جاری {now}")
        elif now < prev:
            stale.append(f"{path}: مبنا {prev} ← جاری {now}")
    return regressions, stale


def load_baseline():
    if not BASELINE_FILE.exists():
        return None
    return json.loads(BASELINE_FILE.read_text(encoding="utf-8"))


def write_baseline(current):
    data = {"total": current["total"], "files": dict(sorted(current["files"].items()))}
    BASELINE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# ─── خودآزمایی ────────────────────────────────────────────────────────────────

def self_test():
    codes = {"perm_sec", "view_sec"}
    src = (
        "u.has_perm('accounts.perm_sec')\n"          # 1
        "request.user.has_perm('view_sec')\n"         # 2
        "u.has_perm('accounts.perm_sys')\n"           # سامانه‌ای: نه
        "u.has_perms(['accounts.perm_sec', 'x'])\n"   # 3
        "p = HasMenuAccess('view_sec')\n"             # 4
        "u.has_perm(code)\n"                          # متغیر: نه
        "u.has_perm('other.perm_sec')\n"              # برنامهٔ دیگر: نه
        "can(u, 'perm_sec', section)\n"               # بررسی درست: نه
    )
    hits = scan_source(src, codes)
    got = [(ln, k) for ln, _, k in hits]
    exp = [(1, "has_perm"), (2, "has_perm"), (4, "has_perms"), (5, "HasMenuAccess")]
    ok = sorted(got) == exp
    print(f"self-test scan: {sorted(got)} (expected {exp}) -> {'PASS' if ok else 'FAIL'}")
    base = {"total": 3, "files": {"a.py": 2, "b.py": 1}}
    reg, st = compare({"total": 3, "files": {"a.py": 3}}, base)
    ok_cmp = len(reg) == 1 and len(st) == 1
    reg2, st2 = compare({"total": 2, "files": {"a.py": 1, "b.py": 1}}, base)
    ok_cmp &= not reg2 and len(st2) == 2
    reg3, _ = compare({"total": 4, "files": {"a.py": 2, "b.py": 1, "c.py": 1}}, base)
    ok_cmp &= len(reg3) == 2
    print(f"self-test compare (file growth, stale baseline, new file) -> {'PASS' if ok_cmp else 'FAIL'}")
    return ok and ok_cmp


def main():
    ap = argparse.ArgumentParser(description="نگهبان ۵۸: has_perm سراسری روی مجوز بخشی")
    ap.add_argument("--write-baseline", action="store_true", help="ثبت مبنای جدید از درخت جاری")
    ap.add_argument("--self-test", action="store_true", help="خودآزمایی تشخیص")
    ap.add_argument("--json", action="store_true", help="خروجی ماشین‌خوان")
    args = ap.parse_args()

    if args.self_test:
        return 0 if self_test() else 1

    codes = section_codes()
    current, details = scan(codes=codes)
    baseline = load_baseline()

    if args.json:
        print(json.dumps({"section_codes": sorted(codes), "current": current, "baseline": baseline,
                          "details": details}, ensure_ascii=False, indent=2))

    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۵۸: has_perm سراسری روی مجوز بخشی در ماژول‌ها (طرح ۲.۲، ت۸)")
    print("=" * 74)
    print(f"   کدهای بخشی (همهٔ ماژول‌های روی دیسک، بی حساس‌ها): {len(codes)}")
    print(f"   فراخوانی سراسری جاری: {current['total']} در {len(current['files'])} فایل")

    if args.write_baseline or baseline is None:
        write_baseline(current)
        print(f"📌 مبنا ثبت شد: {BASELINE_FILE.relative_to(REPO_ROOT).as_posix()} (total={current['total']})")
        print("=" * 74)
        print("✨ نتیجه: نگهبان ۵۸ تایید شد (PASS) ✨")
        return 0

    regressions, stale = compare(current, baseline)
    passed = True
    if regressions:
        passed = False
        print("🚫 has_perm سراسری تازه روی مجوز بخشی (به‌جای آن can(user, code, section) یا sections_where/section_q):")
        for r in regressions:
            print(f"   ❌ {r}")
        regressed = {r.split(":", 1)[0] for r in regressions}
        for d in details:
            if d["file"] in regressed:
                print(f"      {d['file']}:{d['line']} {d['kind']}('{d['code']}')")
    if stale:
        passed = False
        print("🟢 کاهش ثبت‌نشده (مبنای کهنه) — update baseline with --write-baseline:")
        for s in stale:
            print(f"   ⚠️ {s}")
        print("   python scripts/e2e/guardian_58_scoped_has_perm.py --write-baseline")
    if passed:
        print(f"   🟢 برابر مبنا (total={baseline.get('total')}).")
    print("=" * 74)
    print("✨ نتیجه: نگهبان ۵۸ تایید شد (PASS) ✨" if passed else "🚫 نتیجه: نگهبان ۵۸ رد شد (REJECTED) 🚫")
    print("=" * 74)
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
