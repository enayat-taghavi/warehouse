"""
شمارنده‌های وابستگی بی‌نام هسته و ماژول‌ها (گام ۷ طرح ماژولارسازی عمیق).

نگهبان‌های ۲۹ و ۵۷ نام ماژول را می‌شمارند؛ این پویشگر «مفهوم ماژول» را می‌شمارد:
- module_permission_literals: کد مجوزی که یک ماژول در module.py خودش اعلام کرده، در هستهٔ بک‌اند
  (backend/core) یا پوستهٔ فرانت (core/، shared/، modules/common/). باید صفر باشد، جز فایل‌های فهرست مجاز.
- cross_module_permission_literals: کد مجوز ماژول دیگر در کد یک ماژول. باید صفر باشد، جز فایل‌های فهرست مجاز.
  ماژول مجوز ماژول دیگر را فقط با نام «توانایی» می‌شناسد (alias مجوز، گام ۸).
- locked_scope_refs (فقط فرانت): ارجاع به دو دیتابیس آفلاین قفل‌شده (LOCKED_OFFLINE_SCOPES، warehouseOfflineDb،
  financeOfflineDb) بیرون از سرویس‌های آفلاین هسته و ماژول صاحب هر دیتابیس. باید صفر باشد، جز فایل‌های فهرست مجاز.
- permission_parity (فقط فرانت):
  * ماژول قالب قدیم (PERMISSIONS تاپلی، بی PERMISSION_CATEGORIES): کدهای users.permissionGroup هر ماژول فرانت
    با PERMISSION_CODENAMES همان ماژول در بک‌اند برابر است.
  * ماژول قالب جدید طرح ۲.۲ (PERMISSION_CATEGORIES یا ردیف دیکشنری/فراخوانی در PERMISSIONS): فهرست، نام و بستهٔ
    نقش‌ها از بک‌اند می‌آید (ت۶)، پس module.ts فرانت آن نباید permissionGroup، shortPermissionNames یا rolePresets داشته باشد.

کدهای مجوز از اعلام‌های خود ماژول‌ها خوانده می‌شوند (PERMISSIONS، PERMISSION_CODENAMES و permission_markers
با پیشوند accounts.)، نه از فهرست دستی؛ ماژول تازه بی‌تغییر این فایل پوشش داده می‌شود.
specها، آزمون‌ها و migrationها شمرده نمی‌شوند.
"""

import ast
import pathlib
import re
import shutil
import tempfile

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
FRONT_APP_DIR = REPO_ROOT / "frontend" / "src" / "app"

# فایل‌هایی (یا «فایل|کد») که آگاهانه ارجاع دارند؛ هر کدام دلیل دارد. فایل فهرست‌شده‌ای که دیگر ارجاعی ندارد، ورودی کهنه و شکست است.
ALLOWED_FILES = {
    "module_permission_literals": {
        "front:core/auth/auth.service.ts": "دادهٔ کاربران mock حالت environment.useMockData (در هیچ environment روشن نیست)",
    },
    # ارجاع بین‌ماژولی مجوز: از گام ۸ با alias مجوز (permission_aliases / permissionAliases) جایگزین شد؛
    # فقط اسکریپت توسعهٔ زیر می‌ماند که عمداً کاربر شمارشگر ماژول دیگر می‌سازد.
    "cross_module_permission_literals": {
        "backend:modules/accounting/personnel/phase_guardian_approval.py|view_sys_counter":
            "اسکریپت نگهبان فاز توسعه که هر دو ماژول را لازم دارد و عمداً کاربر شمارشگر انبار می‌سازد؛ مسیر اجرایی نیست",
    },
    "locked_scope_refs": {
        "front:shared/components/deep-sync-modal/deep-sync-modal.component.ts":
            "پروتکل زندهٔ payload بروزرسانی عمیق (warehouseIds/projectIds) برای دو قلمرو قفل‌شده؛ قلمرو سوم با idsByScope",
        "front:shared/components/user-menu/user-menu.component.ts":
            "مصرف‌کنندهٔ همان پروتکل بروزرسانی عمیق deep-sync-modal",
    },
}

LOCKED_SCOPE_RE = re.compile(r"\b(LOCKED_OFFLINE_SCOPES|warehouseOfflineDb|financeOfflineDb)\b")
# دیتابیس قفل‌شدهٔ هر ماژول؛ ماژول صاحب می‌تواند دیتابیس خودش را مستقیم بخواند
# ساختن مستقیم اعلان در ماژول ممنوع است؛ ماژول‌ها notifications.services.notify_users را صدا می‌زنند (طرح ۲.۴، ص۷)
DIRECT_NOTIFICATION_RE = re.compile(r"\bfrom\s+notifications\.models\s+import\b|\bimport\s+notifications\.models\b|\bNotification\.objects\b")
LOCKED_DB_OWNER = {"warehouseOfflineDb": "warehouse", "financeOfflineDb": "accounting"}
LOCKED_ZONE_PREFIXES = ("core/services/offline-db.ts", "core/services/offline/")


# ─── خواندن اعلام‌های ماژول‌ها ──────────────────────────────────────────────

def _spec_code(elt):
    """کد یک ردیف قالب جدید: {'code': ...} یا فراخوانی سازنده‌ای مثل _p('code', ...) با رشتهٔ نخست."""
    if isinstance(elt, ast.Dict):
        for k, v in zip(elt.keys, elt.values):
            if isinstance(k, ast.Constant) and k.value == "code" and isinstance(v, ast.Constant) and isinstance(v.value, str):
                return v.value
    elif isinstance(elt, ast.Call) and elt.args and isinstance(elt.args[0], ast.Constant) and isinstance(elt.args[0].value, str):
        return elt.args[0].value
    return None


def _const_strings(node):
    if isinstance(node, (ast.Tuple, ast.List)):
        out = []
        for elt in node.elts:
            if isinstance(elt, ast.Constant) and isinstance(elt.value, str):
                out.append(elt.value)
            elif isinstance(elt, (ast.Tuple, ast.List)) and elt.elts and isinstance(elt.elts[0], ast.Constant):
                out.append(elt.elts[0].value)
            elif _spec_code(elt) is not None:
                out.append(_spec_code(elt))
        return out
    return []


def _is_new_format_value(node):
    return isinstance(node, (ast.Tuple, ast.List)) and any(isinstance(e, (ast.Dict, ast.Call)) for e in node.elts)


def module_declarations(modules_dir=None):
    """
    {کد ماژول: {'codes': set همهٔ کدها, 'codenames': set PERMISSION_CODENAMES, 'new_format': bool}}
    از module.py هر ماژول (با ast، بی اجرا). new_format: قالب اعلام طرح ۲.۲ (PERMISSION_CATEGORIES یا ردیف دیکشنری).
    """
    modules_dir = pathlib.Path(modules_dir or BACKEND_DIR / "modules")
    result = {}
    for manifest in sorted(modules_dir.glob("*/module.py")):
        code = manifest.parent.name
        tree = ast.parse(manifest.read_text(encoding="utf-8"))
        codes, codenames, new_format = set(), set(), False
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if not isinstance(target, ast.Name):
                        continue
                    if target.id.endswith("PERMISSION_CODENAMES"):
                        values = _const_strings(node.value)
                        codenames.update(values)
                        codes.update(values)
                    elif target.id == "PERMISSIONS" or target.id.endswith("_PERMISSIONS"):
                        codes.update(_const_strings(node.value))
                        new_format |= _is_new_format_value(node.value)
                    elif target.id == "PERMISSION_CATEGORIES" or target.id.endswith("_PERMISSION_CATEGORIES"):
                        new_format = True
            elif isinstance(node, ast.keyword) and node.arg == "permission_markers":
                for marker in _const_strings(node.value):
                    if marker.startswith("accounts."):
                        codes.add(marker.split(".", 1)[1])
        result[code] = {"codes": codes, "codenames": codenames, "new_format": new_format}
    return result


def _literal_re(codes, ts=False):
    if not codes:
        return None
    alt = "|".join(sorted((re.escape(c) for c in codes), key=len, reverse=True))
    quoted = r"""(?P<q>['"`])(?:accounts\.)?(?P<code>%s)(?P=q)""" % alt
    if ts:
        # کلید شیء بی‌نقل‌قول در ts (مثل view_x: 'نام')
        quoted += r"|(?<![\w.$])(?P<key>%s)\s*:" % alt
    return re.compile(quoted)


def _is_test_file(rel):
    name = rel.name
    return (".spec." in name or name.startswith("test") or name == "tests.py"
            or "tests" in rel.parts or "migrations" in rel.parts)


def _iter_files(root, patterns):
    for pattern in patterns:
        for f in sorted(root.rglob(pattern)):
            if f.is_file():
                yield f


def _scan_file(path, pattern):
    hits = []
    for i, line in enumerate(path.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
        for m in pattern.finditer(line):
            hits.append((i, m.group("code") or m.groupdict().get("key"), line.strip()))
    return hits


# ─── پویش ─────────────────────────────────────────────────────────────────────

def scan_backend(backend_dir=None):
    backend_dir = pathlib.Path(backend_dir or BACKEND_DIR)
    decl = module_declarations(backend_dir / "modules")
    all_codes = set().union(*(d["codes"] for d in decl.values())) if decl else set()
    found = {"module_permission_literals": [], "cross_module_permission_literals": [], "direct_notification_refs": []}
    core_re = _literal_re(all_codes)
    if core_re:
        for f in _iter_files(backend_dir / "core", ("*.py",)):
            rel = f.relative_to(backend_dir)
            if _is_test_file(rel):
                continue
            for line, code, text in _scan_file(f, core_re):
                found["module_permission_literals"].append({"file": f"backend:{rel.as_posix()}", "line": line, "match": code, "text": text})
    for code, d in decl.items():
        foreign = set().union(*(o["codes"] for c, o in decl.items() if c != code)) - d["codes"] if len(decl) > 1 else set()
        pattern = _literal_re(foreign)
        if not pattern:
            continue
        for f in _iter_files(backend_dir / "modules" / code, ("*.py",)):
            rel = f.relative_to(backend_dir)
            if _is_test_file(rel):
                continue
            for line, c, text in _scan_file(f, pattern):
                found["cross_module_permission_literals"].append({"file": f"backend:{rel.as_posix()}", "line": line, "match": c, "text": text})
    for f in _iter_files(backend_dir / "modules", ("*.py",)):
        rel = f.relative_to(backend_dir)
        if _is_test_file(rel):
            continue
        for i, text in enumerate(f.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
            if DIRECT_NOTIFICATION_RE.search(text):
                found["direct_notification_refs"].append({"file": f"backend:{rel.as_posix()}", "line": i, "match": "Notification", "text": text.strip()})
    return found


def _front_group_codenames(module_dir):
    """کدهای users.permissionGroup ماژول فرانت (آرایهٔ درون‌خطی یا ثابت export‌شده در همان پوشه)؛ None اگر گروه ندارد."""
    manifest = (module_dir / "module.ts").read_text(encoding="utf-8")
    m = re.search(r"permissionGroup:\s*\{[^}]*?codenames:\s*(\[[^\]]*\]|[A-Za-z_$][\w$]*)", manifest, re.S)
    if not m:
        return None
    value = m.group(1)
    if not value.startswith("["):
        for f in _iter_files(module_dir, ("*.ts",)):
            cm = re.search(r"export const %s\b[^=]*=\s*(\[[^\]]*\])" % re.escape(value), f.read_text(encoding="utf-8"), re.S)
            if cm:
                value = cm.group(1)
                break
        else:
            return set()
    return set(re.findall(r"['\"]([a-z0-9_]+)['\"]", value))


# فیلدهای تکراری مجوز در module.ts که ماژول قالب جدید نباید داشته باشد (ت۶ طرح ۲.۲)
DUPLICATED_PERMISSION_FIELDS_RE = re.compile(r"(?<![\w$])(permissionGroup|shortPermissionNames|rolePresets)\s*:")


def _front_duplicated_permission_fields(module_dir):
    text = (module_dir / "module.ts").read_text(encoding="utf-8")
    found = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith(("//", "*", "/*")):
            continue
        found.extend(DUPLICATED_PERMISSION_FIELDS_RE.findall(line))
    return sorted(set(found))


def scan_front(front_app_dir=None, backend_dir=None):
    front = pathlib.Path(front_app_dir or FRONT_APP_DIR)
    decl = module_declarations(pathlib.Path(backend_dir or BACKEND_DIR) / "modules")
    all_codes = set().union(*(d["codes"] for d in decl.values())) if decl else set()
    found = {"module_permission_literals": [], "cross_module_permission_literals": [], "locked_scope_refs": []}
    parity = []
    shell_re = _literal_re(all_codes, ts=True)
    for zone in ("core", "shared", "modules/common"):
        if not shell_re or not (front / zone).is_dir():
            continue
        for f in _iter_files(front / zone, ("*.ts", "*.html")):
            rel = f.relative_to(front)
            if _is_test_file(rel):
                continue
            for line, code, text in _scan_file(f, shell_re):
                found["module_permission_literals"].append({"file": f"front:{rel.as_posix()}", "line": line, "match": code, "text": text})
    modules_root = front / "modules"
    module_dirs = [d for d in sorted(modules_root.iterdir()) if d.is_dir() and (d / "module.ts").is_file()] if modules_root.is_dir() else []
    for mdir in module_dirs:
        code = mdir.name
        own = decl.get(code, {"codes": set()})["codes"]
        foreign = set().union(*(o["codes"] for c, o in decl.items() if c != code)) - own if decl else set()
        pattern = _literal_re(foreign, ts=True)
        if pattern:
            for f in _iter_files(mdir, ("*.ts", "*.html")):
                rel = f.relative_to(front)
                if _is_test_file(rel):
                    continue
                for line, c, text in _scan_file(f, pattern):
                    found["cross_module_permission_literals"].append({"file": f"front:{rel.as_posix()}", "line": line, "match": c, "text": text})
        if decl.get(code, {}).get("new_format"):
            dup = _front_duplicated_permission_fields(mdir)
            if dup:
                parity.append(f"{code}: بک‌اند قالب اعلام ۲.۲ دارد؛ module.ts فرانت نباید {dup} داشته باشد (از API بک‌اند می‌آید، ت۶)")
            continue
        group = _front_group_codenames(mdir)
        backend_codes = decl.get(code, {}).get("codenames")
        if backend_codes and group is None:
            parity.append(f"{code}: ماژول بک‌اند کد مجوز دارد ولی users.permissionGroup فرانت ندارد")
        elif group is not None and backend_codes is not None and group != backend_codes:
            parity.append(f"{code}: فقط فرانت {sorted(group - backend_codes)} | فقط بک‌اند {sorted(backend_codes - group)}")
        elif group is not None and backend_codes is None:
            parity.append(f"{code}: گروه مجوز فرانت دارد ولی module.py بک‌اند ندارد")
    for f in _iter_files(front, ("*.ts", "*.html")):
        rel = f.relative_to(front)
        posix = rel.as_posix()
        if _is_test_file(rel) or posix.startswith(LOCKED_ZONE_PREFIXES):
            continue
        parts = rel.parts
        owner = parts[1] if len(parts) > 2 and parts[0] == "modules" else None
        for i, line in enumerate(f.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
            for m in LOCKED_SCOPE_RE.finditer(line):
                name = m.group(1)
                if owner and LOCKED_DB_OWNER.get(name) == owner:
                    continue
                found["locked_scope_refs"].append({"file": f"front:{posix}", "line": i, "match": name, "text": line.strip()})
    return found, parity


# ─── سنجش با فهرست مجاز فایل‌محور ───────────────────────────────────────────

def evaluate(found, side, allowed=None):
    """(counters, errors): شمار هر شمارنده بیرون از فهرست مجاز، و خطاها (نقض و ورودی کهنه)."""
    allowed = ALLOWED_FILES if allowed is None else allowed
    counters, errors = {}, []
    for key, items in found.items():
        allow = {f: r for f, r in allowed.get(key, {}).items() if f.startswith(side + ":")}
        # ورودی «فایل» هر کدی را در آن فایل مجاز می‌کند و ورودی «فایل|کد» فقط همان کد را
        unlisted = [v for v in items if v["file"] not in allow and f"{v['file']}|{v['match']}" not in allow]
        counters[key] = len(unlisted)
        for v in unlisted:
            errors.append(f"{key}: {v['file'].split(':', 1)[1]}:{v['line']} '{v['match']}' | {v['text'][:110]}")
        hits = {v["file"] for v in items} | {f"{v['file']}|{v['match']}" for v in items}
        for f in allow:
            if f not in hits:
                errors.append(f"{key}: ورودی کهنهٔ فهرست مجاز (دیگر ارجاعی ندارد): {f.split(':', 1)[1]}")
    return counters, errors


def report_backend():
    counters, errors = evaluate(scan_backend(), "backend")
    return counters, errors


def report_front():
    found, parity = scan_front()
    counters, errors = evaluate(found, "front")
    counters["permission_parity"] = len(parity)
    errors.extend(f"permission_parity: {p}" for p in parity)
    return counters, errors


# ─── خودآزمایی ────────────────────────────────────────────────────────────────

def self_test():
    """با یک مخزن ساختگی در پوشهٔ موقت: هر نقض باید دیده شود و مورد مجاز نه."""
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="g7scan_"))
    ok = True
    try:
        be, fe = tmp / "be", tmp / "fe"
        (be / "modules" / "alpha").mkdir(parents=True)
        (be / "modules" / "beta" / "beta_app").mkdir(parents=True)
        (be / "core" / "x").mkdir(parents=True)
        (be / "modules" / "alpha" / "module.py").write_text(
            "SPEC = ModuleSpec(code='alpha', permission_markers=('accounts.view_alpha',))\n"
            "ALPHA_PERMISSION_CODENAMES = ('view_alpha', 'act_alpha')\nPERMISSIONS = (('view_alpha', 'x'), ('act_alpha', 'y'))\n", encoding="utf-8")
        (be / "modules" / "beta" / "module.py").write_text(
            "BETA_PERMISSION_CODENAMES = ('view_beta',)\nPERMISSIONS = (('view_beta', 'z'),)\n", encoding="utf-8")
        (be / "core" / "x" / "views.py").write_text("ok = user.has_perm('accounts.view_alpha')\nfine = 'view_platform'\n", encoding="utf-8")
        (be / "core" / "x" / "tests.py").write_text("t = 'view_alpha'\n", encoding="utf-8")
        (be / "modules" / "beta" / "beta_app" / "views.py").write_text("p = 'act_alpha'\n", encoding="utf-8")
        (be / "modules" / "gamma").mkdir(parents=True)
        (be / "modules" / "gamma" / "module.py").write_text(
            "GAMMA_PERMISSION_CATEGORIES = ({'key': 'g', 'label_fa': 'g'},)\n"
            "PERMISSIONS = ({'code': 'view_gamma', 'label_fa': 'x', 'scope': 'section', 'defaults': ('r',)}, _p('act_gamma', 'y'))\n",
            encoding="utf-8")
        (be / "modules" / "beta" / "beta_app" / "notify.py").write_text(
            "from notifications.models import Notification\nNotification.objects.create(title='x')\n", encoding="utf-8")
        (be / "modules" / "beta" / "beta_app" / "tests.py").write_text("from notifications.models import Notification\n", encoding="utf-8")
        b = scan_backend(be)
        got = ([v["match"] for v in b["module_permission_literals"]], [v["match"] for v in b["cross_module_permission_literals"]])
        exp = (["view_alpha"], ["act_alpha"])
        print(f"self-test backend: {got} (expected {exp})")
        ok &= got == exp
        lines = [v["line"] for v in b["direct_notification_refs"]]
        print(f"self-test direct notification refs: {lines} (expected [1, 2])")
        ok &= lines == [1, 2]

        (fe / "core").mkdir(parents=True)
        (fe / "modules" / "common").mkdir(parents=True)
        (fe / "modules" / "alpha").mkdir(parents=True)
        (fe / "modules" / "beta").mkdir(parents=True)
        (fe / "core" / "a.ts").write_text("const p = ['view_beta'];\nconst names = { act_alpha: 'x' };\nconst q = 'view_platform';\n", encoding="utf-8")
        (fe / "core" / "a.spec.ts").write_text("const p = 'view_beta';\n", encoding="utf-8")
        (fe / "modules" / "common" / "c.ts").write_text("import { warehouseOfflineDb } from 'x';\n", encoding="utf-8")
        (fe / "modules" / "alpha" / "module.ts").write_text(
            "export const MODULE = { extensions: { users: { permissionGroup: { key: 'A', codenames: ALPHA_CODES } } } };\n", encoding="utf-8")
        (fe / "modules" / "alpha" / "permissions.ts").write_text("export const ALPHA_CODES: string[] = ['view_alpha', 'act_alpha'];\n", encoding="utf-8")
        (fe / "modules" / "beta" / "module.ts").write_text(
            "export const MODULE = { extensions: { users: { permissionGroup: { key: 'B', codenames: ['view_beta', 'extra'] } } } };\nconst n = 'view_alpha';\n", encoding="utf-8")
        (fe / "modules" / "gamma").mkdir(parents=True)
        (fe / "modules" / "gamma" / "module.ts").write_text(
            "export const MODULE = { extensions: { users: {\n  // rolePresets: در توضیح شمرده نمی‌شود\n"
            "  shortPermissionNames: { act_gamma: 'x' } } } };\nconst c = 'view_gamma';\n", encoding="utf-8")
        (fe / "core" / "g.ts").write_text("const p = 'act_gamma';\n", encoding="utf-8")
        f, parity = scan_front(fe, be)
        got = (sorted(v["match"] for v in f["module_permission_literals"]),
               [v["match"] for v in f["cross_module_permission_literals"]],
               [v["match"] for v in f["locked_scope_refs"]], len(parity),
               sorted(p.split(":", 1)[0] for p in parity))
        # beta: ناهمخوانی قالب قدیم؛ gamma: قالب جدید با shortPermissionNames در فرانت (کد قالب جدید هم در پوسته دیده می‌شود)
        exp = (["act_alpha", "act_gamma", "view_beta"], ["view_alpha"], ["warehouseOfflineDb"], 2, ["beta", "gamma"])
        print(f"self-test front: {got} (expected {exp})")
        ok &= got == exp

        (fe / "modules" / "gamma" / "module.ts").write_text("export const MODULE = { extensions: {} };\n", encoding="utf-8")
        _, parity = scan_front(fe, be)
        clean_ok = sorted(p.split(":", 1)[0] for p in parity) == ["beta"]
        print(f"self-test new-format module without duplicated fields passes: {clean_ok}")
        ok &= clean_ok

        counters, errors = evaluate({"locked_scope_refs": f["locked_scope_refs"]}, "front",
                                    {"locked_scope_refs": {"front:modules/common/c.ts": "r", "front:gone.ts": "r"}})
        stale_ok = counters["locked_scope_refs"] == 0 and any("gone.ts" in e for e in errors)
        print(f"self-test allowlist (allowed file passes, stale entry fails): {stale_ok}")
        ok &= stale_ok
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return ok


if __name__ == "__main__":
    import sys
    if "--self-test" in sys.argv:
        sys.exit(0 if self_test() else 1)
    for name, fn in (("backend", report_backend), ("front", report_front)):
        counters, errors = fn()
        print(name, counters)
        for e in errors:
            print("  ", e)
