#!/usr/bin/env python
"""
ایجنت نگهبان ۵۶ — یکپارچگی تغییرات قالب (Guardian 56 — Change Integrity)

چرا: در گام ۶ طرح ارگونومی، بازنویسی یک قالب بزرگ بی‌صدا جدول، نوار عملیات و مودال خروجی را حذف کرد
و یک <div> را باز گذاشت. بیلد سبز ماند، چون متدها در ts مانده بودند و Angular تگ باز را می‌بخشد.
زیرتب‌های mobile="icon" بی‌آیکون و نام آیکون نامعتبر در ts هم از نگهبان ۵۲ رد شدند.
این نگهبان همین خطاها را بدون بازبینی دستی می‌گیرد.

معیارها:
  ۱) (نسبت به پایه) فراخوانی رویدادی که از قالب حذف شده ولی متدش هنوز در کامپوننت هست: نشانهٔ حذف تصادفی.
  ۲) (نسبت به پایه، فقط هشدار) فایل با حذف خالص بیش از ۸۰ سطر یا فایل حذف‌شده: باید در گزارش توجیه شود.
  ۳) تگ‌های نامتوازن (باز ماندن یا بستن بی‌جفت) در همهٔ قالب‌ها، html و قالب درون‌خطی ts.
  ۴) app-tab-bar با mobile="icon" که تب بی‌آیکون دارد (زیر sm دکمه خالی می‌ماند).
  ۵) نام آیکون در فیلدهای *icon فایل‌های ts که در رجیستری یا فرهنگ معنایی نیست.
  ۶) رویداد روی کامپوننت یا دایرکتیو خود پروژه که نه output آن است و نه رویداد بومی DOM؛ Angular آن را
     بی‌خطا شنونده DOM می‌کند و دکمه بی‌صدا کار نمی‌کند (گام ۷: ۳۳ دکمه با (actionClick) ناموجود).

استفاده:
  python scripts/e2e/guardian_56_change_integrity.py                     # تغییرات کامیت‌نشده نسبت به HEAD (پیش از هر commit)
  python scripts/e2e/guardian_56_change_integrity.py --base <commit>     # کل کار یک گام: از commit آغاز گام تا درخت کاری
  python scripts/e2e/guardian_56_change_integrity.py --base A --head B   # بازبینی ناظر روی دو commit
  --allow-removed name1,name2   حذف عمدی فراخوانی؛ دلیل هر نام باید در گزارش بیاید
"""

import argparse
import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

REPO_ROOT = Path(__file__).resolve().parents[2]
APP_PREFIX = "frontend/src/app/"
REGISTRY = APP_PREFIX + "shared/icons/icon-registry.ts"
SEMANTIC = APP_PREFIX + "shared/icons/semantic-icons.ts"
NET_DELETION_WARN = 80

EVENT_BINDING = re.compile(r'\s\(([\w.:-]+)\)\s*=\s*"([^"]*)"')
CALL = re.compile(r"([A-Za-z_$][\w$]*)\s*\(")
IGNORED_CALLS = {
    "stopPropagation", "preventDefault", "stopImmediatePropagation", "emit", "next", "set", "update",
    "toString", "trim", "includes", "push", "has", "get", "delete", "add", "focus", "blur", "click",
    "select", "parseInt", "parseFloat", "Number", "String", "Boolean", "if",
}
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
TAB_BAR_TAG = re.compile(r"<app-tab-bar\b((?:[^>\"']|\"[^\"]*\"|'[^']*')*)>", re.S)
ICON_FIELD = re.compile(r"\b(\w*[iI]con)\s*:\s*(['\"])([^'\"\n]+)\2")
KEBAB = re.compile(r"[a-z0-9]+(-[a-z0-9]+)*")
START_TAG = re.compile(r"<([a-zA-Z][\w-]*)((?:[^>\"']|\"[^\"]*\"|'[^']*')*)>", re.S)
ATTR_NAME = re.compile(r"(?:^|\s)([\[(*#@]*[\w.:@$-]+[\])]*)(?=\s*=|\s|/?$)")
NATIVE_EVENTS = {
    "click", "dblclick", "contextmenu", "auxclick", "mousedown", "mouseup", "mouseenter", "mouseleave",
    "mouseover", "mouseout", "mousemove", "pointerdown", "pointerup", "pointermove", "pointerenter",
    "pointerleave", "pointerover", "pointerout", "pointercancel", "touchstart", "touchend", "touchmove",
    "touchcancel", "keydown", "keyup", "keypress", "focus", "blur", "focusin", "focusout", "input", "change",
    "submit", "reset", "scroll", "scrollend", "wheel", "drag", "dragstart", "dragend", "dragenter", "dragleave",
    "dragover", "drop", "load", "error", "paste", "copy", "cut", "select", "resize", "transitionend",
    "animationend", "animationstart", "toggle", "close", "cancel", "compositionstart", "compositionend",
    "beforeinput", "invalid", "play", "pause", "ended", "loadeddata", "loadedmetadata", "timeupdate",
    # خروجی‌های دایرکتیوهای خود Angular
    "ngModelChange", "ngSubmit",
}


def git(*args):
    return subprocess.run(["git", "-C", str(REPO_ROOT), *args], capture_output=True, check=True).stdout


class Tree:
    """متن فایل‌های frontend/src/app از درخت کاری (ref=None) یا از یک commit."""

    def __init__(self, ref=None):
        self.ref = ref
        self.cache = {}
        if ref:
            out = git("ls-tree", "-r", "--name-only", ref, "--", APP_PREFIX).decode("utf-8")
            self.files = [p for p in out.splitlines() if p]
            self._prefetch([p for p in self.files if p.endswith((".html", ".ts"))])
        else:
            root = REPO_ROOT / APP_PREFIX
            self.files = sorted(p.relative_to(REPO_ROOT).as_posix() for p in root.rglob("*") if p.is_file())

    def _prefetch(self, paths):
        # یک فراخوانی git cat-file --batch به‌جای صدها git show
        if not paths:
            return
        req = "".join(f"{self.ref}:{p}\n" for p in paths).encode("utf-8")
        out = subprocess.run(["git", "-C", str(REPO_ROOT), "cat-file", "--batch"], input=req,
                             capture_output=True, check=True).stdout
        pos = 0
        for p in paths:
            nl = out.index(b"\n", pos)
            header = out[pos:nl].split()
            pos = nl + 1
            if len(header) < 3 or header[1] == b"missing":
                self.cache[p] = None
                continue
            size = int(header[2])
            self.cache[p] = out[pos:pos + size].decode("utf-8", errors="replace")
            pos += size + 1

    def read(self, path):
        if path not in self.cache:
            if self.ref:
                try:
                    self.cache[path] = git("show", f"{self.ref}:{path}").decode("utf-8", errors="replace")
                except subprocess.CalledProcessError:
                    self.cache[path] = None
            else:
                p = REPO_ROOT / path
                self.cache[path] = p.read_text(encoding="utf-8", errors="replace") if p.exists() else None
        return self.cache[path]


def inline_template(text):
    """(قالب درون‌خطی، شماره سطر آغاز) یا None."""
    m = re.search(r"template\s*:\s*`", text)
    if not m:
        return None
    end = text.find("`", m.end())
    return text[m.end():end if end != -1 else len(text)], text[:m.end()].count("\n") + 1


def template_of(path, text):
    if text is None:
        return None
    if path.endswith(".html"):
        return text, 1
    if path.endswith(".ts") and not path.endswith(".spec.ts"):
        return inline_template(text)
    return None


def owner_ts(tree, html_path):
    folder, name = html_path.rsplit("/", 1)
    pattern = re.compile(r"templateUrl\s*:\s*['\"]\./" + re.escape(name) + r"['\"]")
    for f in tree.files:
        if f.startswith(folder + "/") and "/" not in f[len(folder) + 1:] and f.endswith(".ts") and not f.endswith(".spec.ts"):
            text = tree.read(f)
            if text and pattern.search(text):
                return text
    return None


def ts_for_template(tree, path, text):
    return text if path.endswith(".ts") else owner_ts(tree, path)


def method_defined(ts, name):
    n = re.escape(name)
    mods = r"(?:(?:public|protected|private|readonly|static|override|async)\s+)*"
    return bool(
        re.search(rf"^\s*{mods}{n}\s*(?:<[^>\n]*>)?\s*\([^;]*?\)\s*(?::[^;{{=]+)?\{{", ts, re.M)
        or re.search(rf"^\s*{mods}{n}\s*(?::[^=;\n]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*(?::[^=;\n]+)?=>", ts, re.M)
    )


def handler_calls(tpl):
    calls = set()
    for _, expr in EVENT_BINDING.findall(tpl):
        calls.update(CALL.findall(expr))
    return calls - IGNORED_CALLS


class TagBalance(HTMLParser):
    def __init__(self, line_offset):
        super().__init__(convert_charrefs=True)
        self.line_shift = line_offset - 1
        self.stack = []
        self.problems = []

    def line(self):
        return self.getpos()[0] + self.line_shift

    def handle_starttag(self, tag, attrs):
        if tag not in VOID_TAGS:
            self.stack.append((tag, self.line()))

    def handle_endtag(self, tag):
        if tag in VOID_TAGS:
            return
        if self.stack and self.stack[-1][0] == tag:
            self.stack.pop()
            return
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                for t, ln in self.stack[i + 1:]:
                    self.problems.append(f"<{t}> سطر {ln} پیش از </{tag}> سطر {self.line()} بسته نشده")
                del self.stack[i:]
                return
        self.problems.append(f"</{tag}> سطر {self.line()} بی‌جفت")

    def finish(self):
        self.close()
        for t, ln in self.stack:
            self.problems.append(f"<{t}> سطر {ln} تا پایان قالب بسته نشده")
        return self.problems


def balanced(text, start):
    """متن متوازن از text[start] (یکی از [ یا {) تا جفتش، با نادیده گرفتن رشته‌ها؛ None اگر ناتمام."""
    pairs = {"[": "]", "{": "}", "(": ")"}
    depth, quote, i = [], None, start
    while i < len(text):
        c = text[i]
        if quote:
            if c == "\\":
                i += 2
                continue
            if c == quote:
                quote = None
        elif c in "'\"`":
            quote = c
        elif c in pairs:
            depth.append(pairs[c])
        elif depth and c == depth[-1]:
            depth.pop()
            if not depth:
                return text[start:i + 1]
        i += 1
    return None


def returned_array(ts, name, hops=2):
    m = re.search(rf"^\s*(?:(?:public|protected|private|static|override)\s+)*(?:get\s+)?{re.escape(name)}\s*\([^;]*?\)\s*(?::[^;{{=]+)?\{{", ts, re.M)
    if not m:
        return None
    body = balanced(ts, m.end() - 1)
    if not body:
        return None
    r = re.search(r"\breturn\s*\[", body)
    if r:
        return balanced(body, r.end() - 1)
    r = re.search(r"\breturn\s+this\.([A-Za-z_$][\w$]*)\s*\(\s*[^)]*\)\s*;", body)
    if r and hops:
        return returned_array(ts, r.group(1), hops - 1)
    return None


def resolve_tabs(expr, ts):
    expr = expr.strip()
    if expr.startswith("["):
        return expr
    if not ts or not re.fullmatch(r"[A-Za-z_$][\w$]*", expr):
        return None
    m = re.search(rf"^\s*(?:(?:public|protected|private|readonly)\s+)*{re.escape(expr)}\s*(?::[^=;\n]+)?=\s*", ts, re.M)
    if m:
        rest_start = m.end()
        if ts[rest_start:rest_start + 1] == "[":
            return balanced(ts, rest_start)
        call = re.match(r"this\.([A-Za-z_$][\w$]*)\s*\(", ts[rest_start:])
        return returned_array(ts, call.group(1)) if call else None
    return returned_array(ts, expr)


def tabs_without_icon(array_text):
    """شناسه تب‌های بی‌آیکون؛ None اگر آرایه با spread یا map ساخته شده و ایستا سنجیدنی نیست."""
    inner = array_text[1:-1]
    if "..." in inner or re.search(r"\.\s*(map|filter|concat)\s*\(", inner):
        return None
    missing, i = [], 0
    while True:
        j = inner.find("{", i)
        if j == -1:
            return missing
        obj = balanced(inner, j)
        if not obj:
            return None
        if re.search(r"\bid\s*:", obj) and not re.search(r"\bicon\s*:", obj):
            idm = re.search(r"\bid\s*:\s*['\"]([^'\"]+)", obj)
            missing.append(idm.group(1) if idm else "?")
        i = j + len(obj)


def load_icon_names(tree):
    reg = tree.read(REGISTRY) or ""
    icons = set(re.findall(r"^  '([^']+)': '", reg, re.M))
    sem = tree.read(SEMANTIC) or ""
    dicts = {}
    for prefix, const in (("action-", "ACTION_ICONS"), ("status-", "STATUS_ICONS"), ("role-", "ROLE_ICONS")):
        m = re.search(rf"export const {const} = \{{([^}}]+)\}}", sem)
        dicts[prefix] = dict(re.findall(r"'?([\w-]+)'?\s*:\s*'([^']+)'", m.group(1))) if m else {}
    return icons, dicts


def icon_resolves(name, icons, dicts):
    for prefix, table in dicts.items():
        if name.startswith(prefix):
            target = table.get(name[len(prefix):])
            return target is not None and target in icons
    return name in icons


def component_outputs(tree):
    """(نام تگ ← outputها، نام ویژگی ← outputها) برای کامپوننت‌ها و دایرکتیوهای خود پروژه."""
    by_tag, by_attr = {}, {}
    for path in tree.files:
        if not path.endswith(".ts") or path.endswith(".spec.ts"):
            continue
        text = tree.read(path) or ""
        if "@Component(" not in text and "@Directive(" not in text:
            continue
        outs = set(re.findall(r"\b(\w+)\s*=\s*output(?:FromObservable)?\s*[<(]", text))
        outs |= {alias or name for alias, name in re.findall(r"@Output\(\s*(?:['\"]([^'\"]+)['\"])?\s*\)\s*(\w+)", text)}
        outs |= {n + "Change" for n in re.findall(r"\b(\w+)\s*=\s*model(?:\.required)?\s*[<(]", text)}
        for sel in re.findall(r"selector\s*:\s*['\"]([^'\"]+)['\"]", text):
            for part in sel.split(","):
                part = part.strip()
                if re.fullmatch(r"[a-z][\w-]*", part):
                    by_tag.setdefault(part, set()).update(outs)
                for attr in re.findall(r"\[([\w-]+)\]", part):
                    by_attr.setdefault(attr, set()).update(outs)
    return by_tag, by_attr


def unknown_events(tpl, line_offset, by_tag, by_attr):
    """رویدادهایی روی عنصرِ دارای کامپوننت یا دایرکتیو پروژه که نه output آن‌اند نه رویداد بومی."""
    found = []
    for m in START_TAG.finditer(tpl):
        tag, attrs = m.group(1), m.group(2)
        names = [a for a in ATTR_NAME.findall(attrs)]
        plain = {re.sub(r"^[\[(*#@]+|[\])]+$", "", a) for a in names}
        matched = tag in by_tag or any(p in by_attr for p in plain)
        if not matched:
            continue
        outs = set(by_tag.get(tag, set()))
        for p in plain:
            outs |= by_attr.get(p, set())
        events = re.findall(r"(?:^|\s)\(([\w.:-]+)\)\s*=", attrs)
        events += [e + "Change" for e in re.findall(r"(?:^|\s)\[\(([\w-]+)\)\]\s*=", attrs)]
        for ev in events:
            if ":" in ev:
                continue
            base = ev.split(".")[0]
            if base not in outs and base not in NATIVE_EVENTS:
                found.append((line_offset + tpl[:m.start()].count("\n"), tag, ev))
    return found


def main():
    ap = argparse.ArgumentParser(description="Guardian 56 — change integrity")
    ap.add_argument("--base", default="HEAD", help="commit پایه برای معیار ۱ و ۲ (پیش‌فرض HEAD)")
    ap.add_argument("--head", default=None, help="commit سر؛ بدون آن درخت کاری سنجیده می‌شود")
    ap.add_argument("--allow-removed", default="", help="نام فراخوانی‌هایی که عمداً حذف شده‌اند، با کاما")
    args = ap.parse_args()
    allowed = {a.strip() for a in args.allow_removed.split(",") if a.strip()}

    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۵۶: یکپارچگی تغییرات قالب (Guardian 56 — Change Integrity)")
    print(f"   پایه: {args.base}  ←  سر: {args.head or 'درخت کاری'}")
    print("=" * 74)

    try:
        git("rev-parse", "--verify", args.base + "^{commit}")
        if args.head:
            git("rev-parse", "--verify", args.head + "^{commit}")
    except subprocess.CalledProcessError:
        print("❌ commit پایه یا سر معتبر نیست.")
        return False

    head = Tree(args.head)
    base = Tree(args.base)
    errors = []

    # ── معیار ۱ و ۲: نسبت به پایه ──
    diff_args = ["diff", "--numstat", "--no-renames", args.base] + ([args.head] if args.head else []) + ["--", APP_PREFIX]
    rows = []
    for line in git(*diff_args).decode("utf-8").splitlines():
        added, deleted, path = line.split("\t", 2)
        if added != "-":
            rows.append((path, int(added), int(deleted)))

    lost, big = [], []
    for path, added, deleted in rows:
        new_text = head.read(path)
        if new_text is None:
            big.append(f"{path} (فایل حذف شد، {deleted} سطر)")
            continue
        if deleted - added > NET_DELETION_WARN:
            big.append(f"{path} (+{added} / -{deleted})")
        old_tpl = template_of(path, base.read(path))
        new_tpl = template_of(path, new_text)
        if not old_tpl or not new_tpl:
            continue
        ts = ts_for_template(head, path, new_text)
        if not ts:
            continue
        for name in sorted(handler_calls(old_tpl[0])):
            if name in allowed or re.search(rf"(?<![\w$]){re.escape(name)}(?![\w$])", new_tpl[0]):
                continue
            if method_defined(ts, name):
                lost.append(f"{path}: {name}()")

    if lost:
        errors.append("فراخوانی گم‌شده")
        print(f"❌ معیار ۱: {len(lost)} فراخوانی رویداد از قالب حذف شده ولی متدش هنوز در کامپوننت هست (حذف تصادفی؟):")
        for item in lost:
            print(f"     - {item}")
        print("     اگر حذف عمدی است، با --allow-removed نام ببر و دلیلش را در گزارش بنویس.")
    else:
        print(f"✅ معیار ۱: در {len(rows)} فایل تغییرکرده هیچ فراخوانی رویدادی بی‌جایگزین حذف نشده است.")

    if big:
        print(f"⚠️ معیار ۲ (هشدار): {len(big)} فایل حذف خالص بیش از {NET_DELETION_WARN} سطر دارد؛ diff هر کدام را بخوان و در گزارش توجیه کن:")
        for item in big:
            print(f"     - {item}")
    else:
        print(f"✅ معیار ۲: هیچ فایلی حذف خالص بیش از {NET_DELETION_WARN} سطر ندارد.")

    # ── معیار ۳ تا ۵: کل درخت سر ──
    unbalanced, empty_tabs, unresolved_tabs, bad_icons, bad_events = [], [], [], [], []
    icons, dicts = load_icon_names(head)
    by_tag, by_attr = component_outputs(head)
    templates_checked = 0
    for path in head.files:
        if not path.endswith((".html", ".ts")) or path.endswith(".spec.ts"):
            continue
        text = head.read(path)
        tpl = template_of(path, text)
        if tpl:
            templates_checked += 1
            parser = TagBalance(tpl[1])
            parser.feed(tpl[0])
            for problem in parser.finish():
                unbalanced.append(f"{path}: {problem}")
            for line, tag, ev in unknown_events(tpl[0], tpl[1], by_tag, by_attr):
                bad_events.append(f"{path}:{line} <{tag}> ({ev})")

            ts = None
            for m in TAB_BAR_TAG.finditer(tpl[0]):
                attrs = m.group(1)
                if not re.search(r"(?<![\w\[])mobile\s*=\s*\"icon\"|\[mobile\]\s*=\s*\"'icon'\"", attrs):
                    continue
                tabs = re.search(r"\[tabs\]\s*=\s*\"([^\"]*)\"", attrs)
                if not tabs:
                    continue
                ts = ts if ts is not None else (ts_for_template(head, path, text) or "")
                line = tpl[1] + tpl[0][:m.start()].count("\n")
                array = resolve_tabs(tabs.group(1), ts)
                missing = tabs_without_icon(array) if array else None
                if missing is None:
                    unresolved_tabs.append(f"{path}:{line} [tabs]=\"{tabs.group(1)}\"")
                elif missing:
                    empty_tabs.append(f"{path}:{line} [tabs]=\"{tabs.group(1)}\" بی‌آیکون: {', '.join(missing)}")

        if path.endswith(".ts") and path not in (REGISTRY, SEMANTIC):
            for m in ICON_FIELD.finditer(text):
                value = m.group(3)
                if KEBAB.fullmatch(value) and not icon_resolves(value, icons, dicts):
                    bad_icons.append(f"{path}:{text[:m.start()].count(chr(10)) + 1} {m.group(1)}: '{value}'")

    if unbalanced:
        errors.append("تگ نامتوازن")
        print(f"❌ معیار ۳: {len(unbalanced)} تگ نامتوازن در قالب‌ها:")
        for item in unbalanced[:30]:
            print(f"     - {item}")
    else:
        print(f"✅ معیار ۳: تگ‌های همهٔ {templates_checked} قالب متوازن‌اند.")

    if empty_tabs:
        errors.append("تب بی‌آیکون")
        print(f"❌ معیار ۴: {len(empty_tabs)} نوار تب mobile=\"icon\" تب بی‌آیکون دارد (زیر sm دکمه خالی):")
        for item in empty_tabs:
            print(f"     - {item}")
    else:
        print("✅ معیار ۴: همهٔ نوارهای تب mobile=\"icon\" که ایستا سنجیدنی‌اند برای هر تب آیکون دارند.")
    if unresolved_tabs:
        print(f"ℹ️ معیار ۴: {len(unresolved_tabs)} نوار mobile=\"icon\" ایستا سنجیدنی نیست؛ دستی ببین که هر تب icon دارد:")
        for item in unresolved_tabs:
            print(f"     - {item}")

    if bad_icons:
        errors.append("نام آیکون ts")
        print(f"❌ معیار ۵: {len(bad_icons)} نام آیکون نامعتبر در فایل‌های ts (در رجیستری یا فرهنگ معنایی نیست):")
        for item in bad_icons[:30]:
            print(f"     - {item}")
    else:
        print("✅ معیار ۵: همهٔ نام‌های آیکون فیلدهای ts در رجیستری یا فرهنگ معنایی هستند.")

    if bad_events:
        errors.append("رویداد ناموجود")
        print(f"❌ معیار ۶: {len(bad_events)} رویداد روی کامپوننت یا دایرکتیو پروژه نه output آن است نه رویداد بومی DOM (هرگز اجرا نمی‌شود):")
        for item in bad_events[:40]:
            print(f"     - {item}")
    else:
        print("✅ معیار ۶: همهٔ رویدادهای کامپوننت‌ها و دایرکتیوهای پروژه output تعریف‌شده یا رویداد بومی‌اند.")

    print("=" * 74)
    if errors:
        print(f"❌ نگهبان ۵۶ شکست خورد: {', '.join(errors)}")
        return False
    print("🎉 نگهبان ۵۶: تغییرات قالب سالم است.")
    return True


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
