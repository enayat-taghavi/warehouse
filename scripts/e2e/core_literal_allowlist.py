"""
فهرست مجاز دقیق لیترال نام ماژول در هسته (گام ۶ طرح ماژولارسازی عمیق، نشست ۲۹)

مشترک بین نگهبان ۲۹ (هستهٔ بک‌اند) و نگهبان ۵۷ (core/ و shared/ فرانت).
هر ورودی فایل، متن خط (trim شده)، لیترال، دسته و دلیل دارد. سنجش بر پایهٔ متن خط است، نه شمارهٔ خط،
تا جابه‌جایی خطوط شکست کاذب ندهد. لیترال بیرون از فهرست و ورودی کهنه هر دو شکست‌اند.

داده: scripts/e2e/core_literal_allowlist.json
"""

import json
import pathlib
from collections import Counter

ALLOWLIST_FILE = pathlib.Path(__file__).resolve().parent / "core_literal_allowlist.json"

# دسته‌های مجاز طبق معیار بستن پرونده (بخش «گام ۶» طرح)
CATEGORIES = {
    "data_field": "نام فیلد، ستون یا کلید داده (warehouse، warehouse_id) در مدل، سریالایزر، payload یا خروجی",
    "stored_value": "مقدار ذخیره‌شده در دیتابیس یا storage (app_module، app_scope، active_app_module، content type)",
    "protocol": "مقدار پروتکل سرور: هدر X-Active-App، کلید توکن wh_access_token_*، پارامتر query",
    "offline_db_lock": "قفل نام و قلمرو دیتابیس‌های آفلاین فعلی (IndexedDB) تا کش و صف کاربران از دست نرود",
    "dev_tooling": "ابزار توسعه؛ فقط فایل‌های تست بار هم‌زمانی (concurrency_stress_* و concurrency-stress-*)",
}

DEV_TOOLING_PREFIXES = ("concurrency_stress_", "concurrency-stress-")


def load_allowlist(path=None):
    path = pathlib.Path(path) if path else ALLOWLIST_FILE
    return json.loads(path.read_text(encoding="utf-8"))


def validate_entries(entries):
    """خطاهای ساختاری ورودی‌ها: فیلد ناقص، دستهٔ ناشناخته، دلیل خالی، dev_tooling بیرون از concurrency_stress_*."""
    errors = []
    for i, e in enumerate(entries):
        where = f"#{i} {e.get('file', '?')}"
        for key in ("file", "text", "match", "category", "reason"):
            if not isinstance(e.get(key), str) or not e.get(key).strip():
                errors.append(f"{where}: فیلد «{key}» خالی یا نامعتبر است")
        cat = e.get("category")
        if isinstance(cat, str) and cat not in CATEGORIES:
            errors.append(f"{where}: دستهٔ ناشناختهٔ «{cat}»")
        if cat == "dev_tooling" and not pathlib.PurePosixPath(str(e.get("file", ""))).name.startswith(DEV_TOOLING_PREFIXES):
            errors.append(f"{where}: دستهٔ dev_tooling فقط برای فایل‌های {'/'.join(p + '*' for p in DEV_TOOLING_PREFIXES)} مجاز است")
    return errors


def compare(found, entries):
    """
    found: [{file, line, match, text}] از پویشگر. entries: ورودی‌های فهرست مجاز.
    خروجی (unlisted, stale): لیترال‌های بیرون از فهرست و ورودی‌هایی که دیگر در کد نیستند (چندتایی شمرده می‌شود).
    """
    def key(item):
        return (item["file"], item["text"].strip(), item["match"])

    have = Counter(key(f) for f in found)
    allowed = Counter(key(e) for e in entries)
    unlisted = []
    for f in found:
        k = key(f)
        if allowed[k] > 0:
            allowed[k] -= 1
        else:
            unlisted.append(f)
    stale = []
    for e in entries:
        k = key(e)
        if have[k] > 0:
            have[k] -= 1
        else:
            stale.append(e)
    return unlisted, stale


def check(found, entries):
    """(ok, پیام‌ها) برای گزارش نگهبان."""
    errors = validate_entries(entries)
    unlisted, stale = compare(found, entries)
    messages = list(errors)
    for f in unlisted:
        messages.append(f"لیترال بیرون از فهرست مجاز: {f['file']}:{f.get('line', '?')} '{f['match']}' | {f['text'].strip()[:120]}")
    for e in stale:
        messages.append(f"ورودی کهنهٔ فهرست مجاز (در کد نیست): {e['file']} '{e['match']}' | {e['text'][:120]}")
    return not messages, messages


def self_test():
    """آزمون منطق فهرست مجاز روی داده‌های ساختگی؛ True یعنی همهٔ حالت‌ها درست تشخیص داده شد."""
    found = [
        {"file": "a.py", "line": 3, "match": "warehouse", "text": "  x = obj.get('warehouse')"},
        {"file": "a.py", "line": 9, "match": "warehouse", "text": "x = obj.get('warehouse')"},
    ]
    entry = {"file": "a.py", "text": "x = obj.get('warehouse')", "match": "warehouse",
             "category": "data_field", "reason": "نام فیلد"}
    exact_ok = check(found, [entry, dict(entry)])[0]
    extra_fails = not check(found + [{"file": "b.py", "line": 1, "match": "finance", "text": "y = 'finance'"}],
                            [entry, dict(entry)])[0]
    stale_fails = not check(found[:1], [entry, dict(entry)])[0]
    bad_cat_fails = not check(found, [entry, dict(entry, category="convenience")])[0]
    no_reason_fails = not check(found, [entry, dict(entry, reason=" ")])[0]
    dev_scope_fails = not check(found, [entry, dict(entry, category="dev_tooling")])[0]
    results = {
        "exact list passes": exact_ok,
        "extra literal fails": extra_fails,
        "stale entry fails": stale_fails,
        "unknown category fails": bad_cat_fails,
        "empty reason fails": no_reason_fails,
        "dev_tooling outside concurrency_stress_* fails": dev_scope_fails,
    }
    for name, ok in results.items():
        print(f"self-test allowlist: {name} = {ok}")
    return all(results.values())
