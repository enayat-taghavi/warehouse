#!/usr/bin/env python
"""
ایجنت نگهبان ۲۹ — قرارداد وابستگی و مرزبندی ماژولی
(Guardian 29 — Dependency Contract & Module Boundary Ratchet)

فاز ۰ طرح «جداسازی انبارگردانی و حسابداری به دو ماژول نصب‌شدنی مستقل».
مرجع: Documents/Modular_Split_Warehouse_Accounting/implementation_plan_modular_split.md §۶ و §۷

این نگهبان هیچ رفتاری را عوض نمی‌کند؛ فقط مرز را می‌سنجد و آچار را یک‌طرفه می‌کند:
    ۱) نقض‌های *مستقیم* قراردادهای C1، C2 و C3 را با موتور grimp می‌شمارد
       (همان موتور import-linter، ولی با جزئیات فایل و سطر).
    ۲) قرارداد C4 را راستی‌آزمایی می‌کند: هر استثنای فهرست‌شده در بخش
       [wh-c4-allowlist] باید ایمپورت تنبل درون تابع + گارد apps.is_installed باشد.
    ۳) وابستگی ریشهٔ ترکیب (config/settings.py، urls.py، asgi.py) به نام ماژول‌ها
       را می‌شمارد — مبنای معیار خروج فاز ۳.
    ۴) `lint-imports` را هم اجرا می‌کند تا اعتبار خود فایل .importlinter اثبات شود.
    ۵) همهٔ شمارنده‌ها را با snapshot مبنا مقایسه می‌کند:
       افزایش هر شمارنده = شکست (REJECTED). کاهش = پیشرفت.

اجرا:
    python scripts/e2e/guardian_modularization.py
    python scripts/e2e/guardian_modularization.py --update-baseline   # ثبت پیشرفت
    python scripts/e2e/guardian_modularization.py --json              # خروجی ماشین‌خوان
"""

import argparse
import configparser
import json
import os
import re
import subprocess
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "warehouse-backend"
IMPORTLINTER_FILE = REPO_ROOT / ".importlinter"
BASELINE_FILE = Path(__file__).resolve().parent / "modularization_baseline.json"
VENV_PYTHON = BACKEND_DIR / "venv" / ("Scripts" if os.name == "nt" else "bin") / (
    "python.exe" if os.name == "nt" else "python"
)
COMPOSITION_ROOT_FILES = ("config/settings.py", "config/urls.py", "config/asgi.py")
MODULE_PACKAGES = ("warehouses", "inventory", "reports", "personnel")
C4_SECTION = "wh-c4-allowlist"
C4_OPTION = "guarded_lazy_imports"
GUARD_CALL = "apps.is_installed"

# ماژول‌هایی که مسیر اجرایی تولیدی نیستند: تست، نگهبان و دستورهای seed.
# طرح جداسازی این‌ها را صریحاً «غیرتولیدی» می‌نامد (§۴).
NON_PRODUCTION_RE = re.compile(
    r"(^|\.)(tests?|conftest)($|\.)"
    r"|(^|\.)tests?_\w+($|\.)"
    r"|(^|\.)\w*guardian\w*($|\.)"
    r"|(^|\.)management\.commands\.seed_\w+$"
    r"|(^|\.)(verify_build_and_suite|concurrency_stress_test)$"
)


def ensure_engine():
    """اگر مفسر جاری grimp ندارد، خود را با پایتون venv پروژه دوباره اجرا کن."""
    try:
        import grimp  # noqa: F401
        return
    except ImportError:
        pass
    if os.environ.get("WH_GUARDIAN29_REEXEC") == "1" or not VENV_PYTHON.exists():
        print("❌ بستهٔ import-linter/grimp نصب نیست. برای نصب حصار فاز ۰:")
        print('   "%s" -m pip install "import-linter==2.3"' % VENV_PYTHON)
        sys.exit(1)
    env = dict(os.environ, WH_GUARDIAN29_REEXEC="1", PYTHONUTF8="1")
    sys.exit(subprocess.call([str(VENV_PYTHON), os.path.abspath(__file__)] + sys.argv[1:], env=env))


def read_importlinter_config():
    """خواندن .importlinter با انکدینگ صریح UTF-8 (فارسی داخل فایل)."""
    if not IMPORTLINTER_FILE.exists():
        print("❌ فایل .importlinter در ریشهٔ مخزن یافت نشد. حصار فاز ۰ نصب نشده است.")
        sys.exit(1)
    parser = configparser.ConfigParser()
    parser.read_string(IMPORTLINTER_FILE.read_text(encoding="utf-8"))
    return parser


def as_list(raw):
    return [line.strip() for line in (raw or "").splitlines() if line.strip()]


def parse_layers(raw):
    """هر سطر یک لایه است؛ اعضای هم‌لایه با | یا : جدا می‌شوند. ترتیب: بالا به پایین."""
    layers = []
    for line in as_list(raw):
        members = [part.strip().strip("()") for part in re.split(r"[|:]", line)]
        layers.append([m for m in members if m])
    return layers


def build_contract_rules(parser):
    """
    استخراج قواعد از خود .importlinter (بدون تکرار تعریف‌ها در کد نگهبان).
    خروجی: فهرست (contract_id, name, checker) که checker(importer_pkg, imported_pkg)->bool
    """
    rules = []
    for section in parser.sections():
        if not section.startswith("importlinter:contract:"):
            continue
        cid = section.split(":")[-1]
        cfg = parser[section]
        name = cfg.get("name", cid).strip()
        ctype = cfg.get("type", "").strip()
        if ctype == "layers":
            layers = parse_layers(cfg.get("layers", ""))
            depth = {pkg: idx for idx, layer in enumerate(layers) for pkg in layer}

            def checker(importer_pkg, imported_pkg, depth=depth):
                if importer_pkg not in depth or imported_pkg not in depth:
                    return False
                # ایمپورت رو به بالا = لایهٔ مقصد شمارهٔ کوچک‌تری دارد.
                return depth[imported_pkg] < depth[importer_pkg]

            rules.append((cid, name, checker))
        elif ctype == "forbidden":
            sources = set(as_list(cfg.get("source_modules", "")))
            targets = set(as_list(cfg.get("forbidden_modules", "")))

            def checker(importer_pkg, imported_pkg, sources=sources, targets=targets):
                return importer_pkg in sources and imported_pkg in targets

            rules.append((cid, name, checker))
    return rules


def collect_violations(root_packages, rules):
    """
    شمارش نقض‌های *مستقیم*. زنجیرهٔ غیرمستقیم عمداً شمرده نمی‌شود چون از همین
    یال‌های مستقیم مشتق می‌شود و شمارنده را دوباره‌شماری می‌کند.
    هر نقض = (contract_id, importer_module, imported_module, line_number)
    """
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))
    import backend_paths
    backend_paths.install()
    import grimp

    graph = grimp.build_graph(*root_packages, include_external_packages=False)
    known = set(root_packages)
    per_contract = {cid: [] for cid, _, _ in rules}
    unique_edges = {}

    for importer in sorted(graph.modules):
        importer_pkg = importer.split(".")[0]
        if importer_pkg not in known:
            continue
        for imported in sorted(graph.find_modules_directly_imported_by(importer)):
            imported_pkg = imported.split(".")[0]
            if imported_pkg not in known or imported_pkg == importer_pkg:
                continue
            broken = [(cid, name) for cid, name, check in rules if check(importer_pkg, imported_pkg)]
            if not broken:
                continue
            details = graph.get_import_details(importer=importer, imported=imported)
            lines = sorted({d["line_number"] for d in details}) or [-1]
            is_prod = not NON_PRODUCTION_RE.search(importer)
            for line in lines:
                edge = (importer, imported, line)
                unique_edges[edge] = is_prod
                for cid, _ in broken:
                    per_contract[cid].append(edge)

    return {
        "graph_modules": len(graph.modules),
        "per_contract": {cid: sorted(set(edges)) for cid, edges in per_contract.items()},
        "unique_edges": unique_edges,
        "production": sorted(e for e, prod in unique_edges.items() if prod),
        "non_production": sorted(e for e, prod in unique_edges.items() if not prod),
    }


def _import_targets(node):
    import ast

    if isinstance(node, ast.Import):
        return [alias.name for alias in node.names]
    if isinstance(node, ast.ImportFrom) and node.module and not node.level:
        return [node.module]
    return []


def verify_c4_entry(entry):
    """
    قرارداد C4: تنها استثنای مجاز، ایمپورت تنبل درون تابع همراه گارد
    apps.is_installed در همان تابع است. قالب سطر: `importer.mod -> imported.mod`
    """
    import ast

    if "->" not in entry:
        return False, f"قالب سطر نامعتبر است (انتظار «importer -> imported»): {entry}"
    importer_mod, imported_mod = (part.strip() for part in entry.split("->", 1))
    path = BACKEND_DIR / (importer_mod.replace(".", os.sep) + ".py")
    if not path.exists():
        return False, f"فایل ماژول {importer_mod} یافت نشد: {path}"

    source = path.read_text(encoding="utf-8")
    findings = []

    def walk(node, enclosing_func):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                walk(child, child)
                continue
            for target in _import_targets(child):
                if target == imported_mod or target.startswith(imported_mod + "."):
                    findings.append((child.lineno, enclosing_func))
            walk(child, enclosing_func)

    walk(ast.parse(source), None)
    if not findings:
        return False, f"هیچ ایمپورتی از {imported_mod} در {importer_mod} یافت نشد (سطر مرده در فهرست C4)"
    for line, func in findings:
        if func is None:
            return False, f"{importer_mod}:{line} ایمپورت ماژول‌سطح است، نه تنبل درون تابع"
        segment = ast.get_source_segment(source, func) or ""
        if GUARD_CALL not in segment:
            return False, f"{importer_mod}:{line} درون تابع {func.name} گارد {GUARD_CALL}(...) ندارد"
    return True, f"{len(findings)} ایمپورت تنبل گاردشده تایید شد"


def composition_root_counts():
    """شمار سطرهای ریشهٔ ترکیب که نام ماژول را سخت‌کد کرده‌اند (معیار خروج فاز ۳)."""
    pattern = re.compile(r"\b(" + "|".join(MODULE_PACKAGES) + r")\b")
    result = {}
    for rel in COMPOSITION_ROOT_FILES:
        path = BACKEND_DIR / rel
        hits = []
        if path.exists():
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if pattern.search(line.split("#", 1)[0]):
                    hits.append(number)
        result[rel] = hits
    return result


def run_lint_imports():
    """
    اجرای `lint-imports` برای اثبات اعتبار خود فایل .importlinter.
    کد خروجی آن در فاز ۰ عمداً ۱ است (report-only) و شکست نگهبان نیست؛
    آنچه شکست است، نتوانستن از خواندن/تحلیل کانفیگ است.
    """
    executables = [
        BACKEND_DIR / "venv" / "Scripts" / "lint-imports.exe",
        BACKEND_DIR / "venv" / "bin" / "lint-imports",
    ]
    command = None
    for candidate in executables:
        if candidate.exists():
            command = [str(candidate)]
            break
    if command is None:
        command = [sys.executable, "-c", "from importlinter.cli import lint_imports_command; lint_imports_command()"]

    env = dict(os.environ)
    env["PYTHONUTF8"] = "1"
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))
    import backend_paths
    python_paths = [str(BACKEND_DIR)] + backend_paths.paths()
    env["PYTHONPATH"] = os.pathsep.join(filter(None, [os.pathsep.join(python_paths), env.get("PYTHONPATH", "")]))
    proc = subprocess.run(
        command, cwd=str(REPO_ROOT), env=env, capture_output=True, text=True, encoding="utf-8"
    )
    output = (proc.stdout or "") + (proc.stderr or "")
    match = re.search(r"Contracts:\s*(\d+)\s*kept,\s*(\d+)\s*broken", output)
    if not match:
        return None, output
    return {"kept": int(match.group(1)), "broken": int(match.group(2))}, output


def build_snapshot(root_packages, rules):
    data = collect_violations(root_packages, rules)
    composition = composition_root_counts()
    counters = {
        "unique_direct_violations": len(data["unique_edges"]),
        "production_violations": len(data["production"]),
        "non_production_violations": len(data["non_production"]),
        "composition_root_hardcoded_lines": sum(len(v) for v in composition.values()),
    }
    for cid, edges in sorted(data["per_contract"].items()):
        counters["contract:" + cid] = len(edges)
    return counters, data, composition


def load_baseline():
    if not BASELINE_FILE.exists():
        return None
    return json.loads(BASELINE_FILE.read_text(encoding="utf-8"))


def save_baseline(counters, data, composition, lint_summary):
    payload = {
        "_readme": (
            "snapshot مبنای نقض‌های مرزبندی ماژولی (نگهبان ۲۹، فاز ۰). "
            "هیچ شمارنده‌ای مجاز به افزایش نیست. برای ثبت پیشرفت: "
            "python scripts/e2e/guardian_modularization.py --update-baseline"
        ),
        "counters": counters,
        "lint_imports": lint_summary,
        "composition_root": composition,
        "violations": {
            "production": [list(e) for e in data["production"]],
            "non_production": [list(e) for e in data["non_production"]],
        },
    }
    BASELINE_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def report_line(ok, title, detail):
    print(f"{'✅' if ok else '❌'} {title}: {detail}")


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--update-baseline", action="store_true", help="ثبت snapshot جدید پس از پیشرفت")
    ap.add_argument("--json", action="store_true", help="خروجی ماشین‌خوان به‌جای گزارش فارسی")
    args = ap.parse_args()

    ensure_engine()
    parser = read_importlinter_config()
    root_packages = as_list(parser["importlinter"].get("root_packages", ""))
    rules = build_contract_rules(parser)
    counters, data, composition = build_snapshot(root_packages, rules)
    lint_summary, lint_output = run_lint_imports()
    baseline = load_baseline()

    if args.json:
        print(json.dumps({"counters": counters, "lint_imports": lint_summary}, ensure_ascii=False, indent=2))

    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۲۹: قرارداد وابستگی و مرزبندی ماژولی (فاز ۰ — نصب حصار)")
    print("=" * 74)

    passed = True

    # ۱) اعتبار کانفیگ و اجراپذیری lint-imports
    if lint_summary is None:
        passed = False
        report_line(False, "اجرای lint-imports", "خروجی قابل تحلیل نبود:\n" + lint_output[-1500:])
    else:
        report_line(
            True,
            "اجرای lint-imports",
            f"{len(rules)} قرارداد تحلیل شد — {lint_summary['kept']} سالم، {lint_summary['broken']} شکسته "
            "(در فاز ۰ حالت report-only است و شکست محسوب نمی‌شود)",
        )

    # ۲) قرارداد C4 — فهرست استثناهای مهارشده
    c4_entries = as_list(parser[C4_SECTION].get(C4_OPTION, "")) if parser.has_section(C4_SECTION) else []
    if not c4_entries:
        report_line(True, "قرارداد C4 (استثنای مهارشده)", "فهرست خالی است — در فاز ۰ همین درست است")
    for entry in c4_entries:
        ok, detail = verify_c4_entry(entry)
        passed = passed and ok
        report_line(ok, f"قرارداد C4 — {entry}", detail)

    # ۳) شمارنده‌ها و آچار یک‌طرفه
    print("-" * 74)
    print("📊 شمارنده‌های مرز (نقض مستقیم = یک یال ایمپورت در یک سطر مشخص):")
    regressions, improvements = [], []
    for key, value in counters.items():
        previous = (baseline or {}).get("counters", {}).get(key)
        if previous is None:
            mark, note = "🆕", "مبنای جدید"
        elif value > previous:
            mark, note = "🔴", f"پس‌رفت! از {previous} به {value}"
            regressions.append((key, previous, value))
        elif value < previous:
            mark, note = "🟢", f"پیشرفت: از {previous} به {value}"
            improvements.append((key, previous, value))
        else:
            mark, note = "⚪", f"بدون تغییر (مبنا {previous})"
        print(f"   {mark} {key} = {value}   [{note}]")

    print("-" * 74)
    print("🧭 وابستگی ریشهٔ ترکیب به نام ماژول‌ها (باید در فاز ۳ به صفر برسد):")
    for rel, hits in composition.items():
        shown = ", ".join(str(h) for h in hits) if hits else "—"
        print(f"   · {rel}: {len(hits)} سطر [{shown}]")

    print("-" * 74)
    print(f"🏭 نقض در مسیر تولیدی: {len(data['production'])} یال")
    for importer, imported, line in data["production"]:
        print(f"   · {importer}:{line} → {imported}")
    print(f"🧪 نقض در تست/نگهبان/seed (غیرتولیدی): {len(data['non_production'])} یال")

    if baseline is None:
        save_baseline(counters, data, composition, lint_summary)
        print("-" * 74)
        print(f"📌 snapshot مبنا ثبت شد: {BASELINE_FILE.relative_to(REPO_ROOT)}")
        print("   از این لحظه هر افزایش شمارنده = شکست نگهبان ۲۹.")
    elif args.update_baseline:
        if regressions:
            print("-" * 74)
            print("🚫 با وجود پس‌رفت، مبنا به‌روزرسانی نشد. اول پس‌رفت را رفع کنید.")
        else:
            save_baseline(counters, data, composition, lint_summary)
            print("-" * 74)
            print(f"📌 snapshot مبنا با {len(improvements)} پیشرفت به‌روزرسانی شد.")

    if regressions:
        passed = False
        print("-" * 74)
        print("🚫 پس‌رفت مرزبندی (قانون آچار یک‌طرفه نقض شد):")
        for key, previous, value in regressions:
            print(f"   ❌ {key}: {previous} ← {value}")
    elif improvements and not args.update_baseline:
        print("-" * 74)
        print("🟢 پیشرفت ثبت‌نشده وجود دارد. برای قفل‌کردن آن اجرا کنید:")
        print("   python scripts/e2e/guardian_modularization.py --update-baseline")

    print("=" * 74)
    if passed:
        print("✨ نتیجه: نگهبان ۲۹ تایید شد (PASS) — مرز سنجیده شد و هیچ پس‌رفتی نیست ✨")
    else:
        print("🚫 نتیجه: نگهبان ۲۹ رد شد (REJECTED) 🚫")
    print("=" * 74)
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
