#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
اسکریپت ساخت ماژول جدید مستقل در پلتفرم انبارداری و مالی
(New Module Generator — Step 5 Modular Architecture)

گزینه‌ها:
  --code:       کد شناسه ماژول به صورت انگلیسی کوچک و معتبر (مانند sample یا logistics)
  --title-fa:   عنوان فارسی ماژول (مانند «سامانه لجستیک و توزیع»)
  --root:       مسیر ریشه مخزن پروژه (پیش‌فرض: ریشه همین مخزن)
"""

import argparse
import os
import pathlib
import subprocess
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]


def parse_args():
    parser = argparse.ArgumentParser(description="تولید ماژول جدید مستقل در بک‌اند و فرانت‌اند")
    parser.add_argument("--code", required=True, help="کد ماژول (شناسه انگلیسی معتبر، حروف کوچک)")
    parser.add_argument("--title-fa", required=True, help="عنوان فارسی ماژول")
    parser.add_argument("--root", default=str(REPO_ROOT), help="مسیر ریشه مخزن پروژه (پیش‌فرض: ریشه مخزن)")
    return parser.parse_args()


def validate_module_code(code: str) -> None:
    if not code or not code.isidentifier() or not code.islower():
        sys.exit(f"❌ خطا: کد ماژول '{code}' نامعتبر است. کد باید شامل حروف کوچک انگلیسی، اعداد یا خط زیر (_) و یک شناسه معتبر پایتون باشد.")


def main():
    args = parse_args()
    code = args.code.strip()
    title_fa = args.title_fa.strip()
    root = pathlib.Path(args.root).resolve()

    validate_module_code(code)

    backend_module_dir = root / "warehouse-backend" / "modules" / code
    frontend_module_dir = root / "warehouse-front" / "src" / "app" / "modules" / code

    # ۱. بررسی عدم وجود پوشه مقصد (اگر پوشه مقصد وجود دارد، بدون تغییر خطا می‌دهد)
    if backend_module_dir.exists():
        sys.exit(f"❌ خطا: پوشه ماژول بک‌اند از قبل وجود دارد: {backend_module_dir}")
    if frontend_module_dir.exists():
        sys.exit(f"❌ خطا: پوشه ماژول فرانت‌اند از قبل وجود دارد: {frontend_module_dir}")

    # ۲. مسیر قالب
    template_dir = root / "scripts" / "module-template"
    if not template_dir.exists():
        template_dir = REPO_ROOT / "scripts" / "module-template"
    if not template_dir.exists():
        sys.exit(f"❌ خطا: پوشه قالب ماژول یافت نشد: {template_dir}")

    pascal_code = "".join(part.capitalize() for part in code.split("_"))
    upper_code = code.upper()
    kebab_code = code.replace("_", "-")

    replacements = {
        "__MODULE_CODE__": code,
        "__MODULE_CODE_UPPER__": upper_code,
        "__MODULE_UPPER__": upper_code,
        "__MODULE_PASCAL__": pascal_code,
        "__MODULE_KEBAB__": kebab_code,
        "__MODULE_TITLE_FA__": title_fa,
    }

    def replace_content(text: str) -> str:
        for placeholder, val in replacements.items():
            text = text.replace(placeholder, val)
        return text

    # ۳. کپی و ایجاد ساختار بک‌اند
    backend_template = template_dir / "backend"
    backend_module_dir.mkdir(parents=True, exist_ok=False)

    for item in sorted(backend_template.rglob("*")):
        if item.is_dir():
            continue
        rel = item.relative_to(backend_template)
        # جایگزینی متغیرها در مسیر فایل
        rel_str = str(rel)
        for placeholder, val in replacements.items():
            rel_str = rel_str.replace(placeholder, val)
        dest_file = backend_module_dir / rel_str
        dest_file.parent.mkdir(parents=True, exist_ok=True)
        content = item.read_text(encoding="utf-8")
        dest_file.write_text(replace_content(content), encoding="utf-8")

    # ۴. کپی و ایجاد ساختار فرانت‌اند
    frontend_template = template_dir / "frontend"
    frontend_module_dir.mkdir(parents=True, exist_ok=False)

    for item in sorted(frontend_template.rglob("*")):
        if item.is_dir():
            continue
        rel = item.relative_to(frontend_template)
        rel_str = str(rel)
        for placeholder, val in replacements.items():
            rel_str = rel_str.replace(placeholder, val)
        dest_file = frontend_module_dir / rel_str
        dest_file.parent.mkdir(parents=True, exist_ok=True)
        content = item.read_text(encoding="utf-8")
        dest_file.write_text(replace_content(content), encoding="utf-8")

    # ۵. به‌روزرسانی installed-modules.ts با فراخوانی gen-installed-modules.js
    gen_script = root / "warehouse-front" / "tools" / "gen-installed-modules.js"
    if not gen_script.exists():
        sys.exit(f"❌ خطا: اسکریپت مولد ماژول‌های فرانت یافت نشد: {gen_script}")

    node_cmd = "node"
    r = subprocess.run([node_cmd, str(gen_script)], cwd=str(root / "warehouse-front"), capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        sys.exit(f"❌ خطا در اجرای gen-installed-modules.js (exit {r.returncode}):\n{r.stderr or r.stdout}")

    print(f"✅ ماژول «{title_fa}» با شناسه '{code}' با موفقیت در بک‌اند و فرانت‌اند ساخته شد.")


if __name__ == "__main__":
    main()
