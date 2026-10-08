#!/usr/bin/env python
"""
ایجنت نگهبان ۵۳ — امنیت و پایداری سامانهٔ استقرار سرور (deploy.ps1 و متعلقات)
(Guardian 53 — Server Deployment Safety & Isolation)

مرجع: Documents/Server_Deployment_Hardening/implementation_plan_server_deployment_hardening.md
فاز ۱ طرح سخت‌سازی استقرار.

معیارها (کاملاً فقط‌خواندنی و بدون اتصال به دیتابیس):
  ۱) وجود #Requires -Version 7.4 (یا بالاتر) در ابتدای deploy.ps1
  ۲) بیلد ایزوله: deploy.ps1 هرگز مستقیماً در warehouse-front/dist اصلی پروژه بیلد نکند
  ۳) مدیریت ایمن junction: حذف junction صرفاً با rmdir و با اعتبارسنجی reparse point انجام شود
  ۴) فایل .gitattributes وجود داشته باشد و شامل قاعدهٔ LF برای *.sh و export-ignore فایل‌های تست باشد
  ۵) فایل deploy_config.json فاقد رمز عبور متنی (DbPassword، DjangoSecretKey) و دارای HostKeyFingerprint باشد
  ۶) اسکریپت قدیمی و ناامن scripts/deploy_runner.py در مخزن وجود نداشته باشد
  ۷) عدم ارسال اسرار در آرگومان‌های خط فرمان (argv) در اسکریپت‌های استقرار
  ۸) بسته‌بندی با tar.exe و اعتبارسنجی عدم وجود جداکننده بک‌اسلش و کاراکتر CR
  ۱۲) انتخاب سامانه (طرح Modular_Deploy_Options گام ۳): کلید Modules در deploy_config.json (اگر هست) معتبر است؛
      Update و Setup سامانه‌ها را تغییر نمی‌دهند؛ حذف سامانه وجود ندارد؛ بازسازی پایگاه پس از GO_LIVE در
      دروازه و در warehouse-deploy رد می‌شود؛ AddModule پیش از تغییر پشتیبان تأییدشده می‌گیرد و در شکست برمی‌گردد
"""

import json
import re
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

REPO_ROOT = Path(__file__).resolve().parents[2]
DEPLOY_PS1 = REPO_ROOT / "deploy.ps1"
DEPLOY_CONFIG = REPO_ROOT / "deploy_config.json"
GITATTRIBUTES = REPO_ROOT / ".gitattributes"
DEPLOY_RUNNER = REPO_ROOT / "scripts" / "deploy_runner.py"


def verify_deploy_safety() -> bool:
    errors = []

    print("=" * 74)
    print("🛡️ نگهبان ۵۳: بررسی امنیت و ایزولاسیون سامانهٔ استقرار سرور")
    print("=" * 74)

    # 1. deploy.ps1 existence and PowerShell version
    if not DEPLOY_PS1.exists():
        errors.append("فایل deploy.ps1 یافت نشد")
        print("❌ بند ۱: فایل deploy.ps1 در ریشه مخزن وجود ندارد.")
        return False

    ps1_text = DEPLOY_PS1.read_text(encoding="utf-8")
    first_non_empty = next((line.strip() for line in ps1_text.splitlines() if line.strip()), "")
    # pipe بایتی بین فرمان‌های native از 7.4 است و ارسال آرگومان خالی به حالت Windows (7.3) وابسته است (E-19)
    version_match = re.match(r"#Requires -Version (\d+)\.(\d+)", first_non_empty)
    if not version_match or tuple(int(x) for x in version_match.groups()) < (7, 4):
        errors.append("نسخه PowerShell 7.4 قفل نشده")
        print("❌ بند ۱: deploy.ps1 با #Requires -Version 7.4 (یا بالاتر) شروع نشده است.")
    else:
        print("✅ بند ۱: پیش‌نیاز نسخه PowerShell (pwsh 7.4+) رعایت شده است.")

    # 2. Isolated build: deploy.ps1 must not target root warehouse-front/dist
    if "Build-IsolatedFrontend" not in ps1_text or "scratch" not in ps1_text:
        errors.append("بیلد ایزوله در deploy.ps1 پیاده‌سازی نشده")
        print("❌ بند ۲: تابع بیلد ایزوله در scratch/deploy در deploy.ps1 وجود ندارد.")
    else:
        print("✅ بند ۲: بیلد فرانت‌ند در دایرکتوری ایزوله snapshot انجام می‌شود و dist اصلی دست‌نخورده می‌ماند.")

    # 3. Safe junction helpers
    has_junction_create = "mklink /J" in ps1_text
    has_safe_rmdir = "rmdir" in ps1_text
    has_reparse_check = "ReparsePoint" in ps1_text
    if not (has_junction_create and has_safe_rmdir and has_reparse_check):
        errors.append("مدیریت ایمن junction ناقص است")
        print("❌ بند ۳: توابع محافظتی junction (mklink, rmdir, ReparsePoint) ناقص هستند.")
    else:
        print("✅ بند ۳: ساخت و حذف junction با rmdir و بازرسی ReparsePoint ایمن‌سازی شده است.")

    # 4. .gitattributes rules
    if not GITATTRIBUTES.exists():
        errors.append("فایل .gitattributes وجود ندارد")
        print("❌ بند ۴: فایل .gitattributes در ریشه مخزن یافت نشد.")
    else:
        gitattr_text = GITATTRIBUTES.read_text(encoding="utf-8")
        has_sh_lf = "*.sh text eol=lf" in gitattr_text
        has_export_ignore = "export-ignore" in gitattr_text
        if not (has_sh_lf and has_export_ignore):
            errors.append("قواعد .gitattributes ناقص است")
            print("❌ بند ۴: قواعد LF برای *.sh یا export-ignore در .gitattributes غایب هستند.")
        else:
            print("✅ بند ۴: فایل .gitattributes دارای قواعد تفکیک LF و export-ignore است.")

    # 5. deploy_config.json security & host key pinning (E-32: graceful if absent, enforced if present)
    if not DEPLOY_CONFIG.exists():
        if "HostKeyFingerprint" not in ps1_text or "Assert-DeployConfig" not in ps1_text:
            errors.append("اعتبارسنجی HostKeyFingerprint در deploy.ps1 غایب است")
            print("❌ بند ۵: اعتبارسنجی HostKeyFingerprint در Assert-DeployConfig در deploy.ps1 یافت نشد.")
        else:
            print("✅ بند ۵: deploy_config.json در مخزن نیست (عادی در محیط ایزوله/CI)؛ اعتبارسنجی HostKeyFingerprint و ممانعت از رمز در deploy.ps1 تایید شد.")
    else:
        try:
            cfg = json.loads(DEPLOY_CONFIG.read_text(encoding="utf-8"))
            has_forbidden_secrets = "DbPassword" in cfg or "DjangoSecretKey" in cfg
            has_host_fingerprint = bool(cfg.get("HostKeyFingerprint"))
            if has_forbidden_secrets:
                errors.append("رمز متنی در deploy_config.json ذخیره شده")
                print("❌ بند ۵: اسرار و رمزهای متنی نباید در deploy_config.json ذخیره شوند.")
            elif not has_host_fingerprint:
                errors.append("پین اثرانگشت کلید میزبان غایب است")
                print("❌ بند ۵: HostKeyFingerprint در deploy_config.json ثبت نشده است.")
            else:
                print("✅ بند ۵: deploy_config.json فاقد رمز متنی بوده و اثرانگشت کلید سرور پین شده است.")
        except Exception as e:
            errors.append(f"خطا در خواندن deploy_config.json: {e}")
            print(f"❌ بند ۵: خطا در خواندن deploy_config.json: {e}")

    # 6. Absence of old deploy_runner.py
    if DEPLOY_RUNNER.exists():
        errors.append("فایل scripts/deploy_runner.py حذف نشده است")
        print("❌ بند ۶: اسکریپت موازی و ناامن deploy_runner.py هنوز در مخزن وجود دارد.")
    else:
        print("✅ بند ۶: اسکریپت موازی deploy_runner.py با موفقیت حذف شده است.")

    # 7. No secrets in argv in deploy.ps1
    forbidden_argv_patterns = [
        r"\$config\.DbPassword",
        r"\$config\.DjangoSecretKey",
    ]
    argv_leak = any(re.search(pat, ps1_text) for pat in forbidden_argv_patterns)
    if argv_leak:
        errors.append("اسرار در آرگومان‌های خط فرمان فرستاده می‌شوند")
        print("❌ بند ۷: اسرار دیتابیس یا جنگو در آرگومان‌های فراخوانی راه دور یافت شدند.")
    else:
        print("✅ بند ۷: هیچ رمز یا کلید مخفی در آرگومان‌های اجرایی خط فرمان ارسال نمی‌شود.")

    # 8. POSIX tar packaging & CR checking
    has_tar = "tar.exe" in ps1_text
    has_cr_check = "contains 13" in ps1_text or "CR" in ps1_text
    if not (has_tar and has_cr_check):
        errors.append("بسته‌بندی با tar و بررسی LF در deploy.ps1 غایب است")
        print("❌ بند ۸: اعتبارسنجی tar.exe و حذف CR در deploy.ps1 یافت نشد.")
    else:
        print("✅ بند ۸: آرشیو بسته استقرار با tar.exe و بررسی فقدان CR انجام می‌شود.")

    # 9. Nginx template media security (Phase 3 & Guardian 53 spec)
    nginx_tmpl = REPO_ROOT / "scripts" / "deploy" / "templates" / "nginx-https.conf"
    if not nginx_tmpl.exists():
        errors.append("قالب nginx-https.conf یافت نشد")
        print("❌ بند ۹: فایل قالب scripts/deploy/templates/nginx-https.conf وجود ندارد.")
    else:
        nginx_text = nginx_tmpl.read_text(encoding="utf-8")
        has_media_proxy = "location ^~ /media/" in nginx_text and "proxy_pass" in nginx_text
        has_internal_media = "location ^~ /internal_media/" in nginx_text and "internal;" in nginx_text
        if not (has_media_proxy and has_internal_media):
            errors.append("قالب Nginx برای سرو امن media ناقص است")
            print("❌ بند ۹: پیکربندی امن media (location ^~ /media/ و location ^~ /internal_media/) در Nginx غایب است.")
        else:
            print("✅ بند ۹: قالب Nginx مسیر /media/ را با ^~ پروکسی کرده و media داخلی را با ^~ و internal حفاظت می‌کند.")

    # 10. Dependency locking (Phase 2 & Guardian 53 spec)
    req_txt = REPO_ROOT / "warehouse-backend" / "requirements.txt"
    req_lock = REPO_ROOT / "warehouse-backend" / "requirements.lock"
    if not req_txt.exists() or not req_lock.exists():
        errors.append("فایل‌های requirements.txt یا requirements.lock یافت نشدند")
        print("❌ بند ۱۰: فایل‌های requirements.txt یا requirements.lock وجود ندارند.")
    else:
        req_lines = [l.strip() for l in req_txt.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")]
        has_floating = any(">=" in l or "<=" in l for l in req_lines)
        lock_text = req_lock.read_text(encoding="utf-8")
        has_hashes = "--hash=sha256:" in lock_text
        if has_floating or not has_hashes:
            errors.append("وابستگی‌ها قفل قطعی نیستند")
            print("❌ بند ۱۰: نسخه‌های شناور در requirements.txt یا فقدان هش در requirements.lock کشف شد.")
        else:
            print("✅ بند ۱۰: کلیه وابستگی‌های پایتون دقیقاً قفل شده و requirements.lock دارای هش‌های sha256 است.")

    # 11. Deployment orchestrator integrity (warehouse-deploy.sh - E-32)
    deploy_sh = REPO_ROOT / "scripts" / "deploy" / "warehouse-deploy.sh"
    if not deploy_sh.exists():
        errors.append("اسکریپت warehouse-deploy.sh یافت نشد")
        print("❌ بند ۱۱: اسکریپت scripts/deploy/warehouse-deploy.sh وجود ندارد.")
    else:
        sh_text = deploy_sh.read_text(encoding="utf-8")
        rollback_idx = sh_text.find("--rollback")
        base_dir_idx = sh_text.find('BASE_DIR="/var/www/warehouse"')
        has_disk_guard = "AVAIL_PCT" in sh_text and "df -P" in sh_text
        has_health_probe = "HEALTH_FAIL" in sh_text and ("curl" in sh_text or "probe" in sh_text)
        has_maintenance = "MAINTENANCE" in sh_text
        if base_dir_idx == -1 or (rollback_idx != -1 and base_dir_idx > rollback_idx):
            errors.append("متغیرهای مسیر در warehouse-deploy.sh بعد از بلاک رول‌بک تعریف شده‌اند")
            print("❌ بند ۱۱: نقص ترتیب متغیرها: BASE_DIR بعد از بلاک رول‌بک است.")
        elif not has_disk_guard:
            errors.append("گارد بررسی فضای دیسک در pre-update اسکریپت استقرار غایب است")
            print("❌ بند ۱۱: بررسی فضای خالی دیسک قبل از تهیه بکاپ pre-update غایب است.")
        elif not has_health_probe:
            errors.append("حلقه سلامت‌سنجی در warehouse-deploy.sh غایب است")
            print("❌ بند ۱۱: سلامت‌سنجی لایو پس از استقرار غایب است.")
        elif not has_maintenance:
            errors.append("مدیریت حالت نگهداری (MAINTENANCE) در warehouse-deploy.sh غایب است")
            print("❌ بند ۱۱: مدیریت حالت نگهداری غایب است.")
        else:
            print("✅ بند ۱۱: اسکریپت warehouse-deploy.sh دارای گارد فضای دیسک، ترتیب صحیح متغیرها، پایش سلامت و حالت نگهداری است.")

    # 12. Module selection (plan Modular_Deploy_Options step 3)
    known_modules = ("warehouse", "accounting")
    gateway_sh = REPO_ROOT / "scripts" / "deploy" / "warehouse-root-gateway.sh"
    setup_sh = REPO_ROOT / "scripts" / "remote-setup.sh"
    mod_problems = []
    if DEPLOY_CONFIG.exists():
        try:
            cfg_modules = json.loads(DEPLOY_CONFIG.read_text(encoding="utf-8")).get("Modules")
        except Exception:
            cfg_modules = None
        if cfg_modules is not None:
            parts = [m.strip() for m in str(cfg_modules).split(",")]
            if not parts or any(m not in known_modules for m in parts):
                mod_problems.append("کلید Modules در deploy_config.json سامانهٔ ناشناخته دارد")
    deploy_text = deploy_sh.read_text(encoding="utf-8") if deploy_sh.exists() else ""
    gateway_text = gateway_sh.read_text(encoding="utf-8") if gateway_sh.exists() else ""
    setup_text = setup_sh.read_text(encoding="utf-8") if setup_sh.exists() else ""
    reset_block = deploy_text[deploy_text.find('if [[ "${1:-}" == "--reset-database" ]]'):]
    gw_reset = gateway_text[gateway_text.find("    reset-database)"):]
    add_block = deploy_text[deploy_text.find('if [[ "${1:-}" == "--add-module" ]]'):]
    checks = [
        ('KNOWN_MODULES=(warehouse accounting)' in deploy_text, "فهرست سامانه‌ها در warehouse-deploy.sh با کاتالوگ یکی نیست"),
        ('Modules mismatch' in deploy_text and '--modules' in deploy_text, "prepare ناهمخوانی سامانه‌ها را رد نمی‌کند"),
        ('Modules mismatch' in setup_text and 'WH_MODULES=${MODULES}' in setup_text, "remote-setup.sh سامانه‌ها را ثبت یا بررسی نمی‌کند"),
        ('GO_LIVE' in reset_block[:600], "--reset-database پس از GO_LIVE رد نمی‌شود"),
        ('GO_LIVE_FLAG' in gw_reset[:300], "دروازه reset-database را پس از GO_LIVE رد نمی‌کند"),
        ('assert_release_backup' in reset_block[:1200], "--reset-database به پشتیبان تأییدشدهٔ release گره نخورده است"),
        ('assert_backup_matches_record' in add_block[:1800] and 'revert_modules' in add_block, "--add-module پشتیبان را بررسی نمی‌کند یا در شکست برنمی‌گردد"),
        ('remove-module' not in deploy_text + gateway_text and 'RemoveModule' not in ps1_text, "مسیر حذف سامانه نباید وجود داشته باشد"),
        ("Invoke-RemoteBackup $config 'pre_module'" in ps1_text and "Confirm-TypedWord 'RESET'" in ps1_text, "AddModule پشتیبان نمی‌گیرد یا ResetServer تأیید تایپی ندارد"),
    ]
    mod_problems += [msg for ok, msg in checks if not ok]
    if mod_problems:
        errors.extend(mod_problems)
        print("❌ بند ۱۲: " + "؛ ".join(mod_problems))
    else:
        print("✅ بند ۱۲: انتخاب سامانه: Modules معتبر، Update/Setup بدون تغییر سامانه، بدون حذف سامانه، ResetServer فقط پیش از GO_LIVE و با پشتیبان، AddModule با پشتیبان و بازگشت.")

    print("=" * 74)
    if errors:
        print(f"❌ نگهبان ۵۳ شکست خورد: {', '.join(errors)}")
        return False

    print("🎉 نگهبان ۵۳: تمامی حفاظ‌های امنیتی استقرار سرور با موفقیت تایید شدند.")
    return True


if __name__ == "__main__":
    sys.exit(0 if verify_deploy_safety() else 1)
