<!--
راهنمای استفاده:
- هر تسک را می‌توانید به صورت چندخطی و با توضیحات کامل بنویسید.
- بین هر تسک از جداکننده سه مساوی یا بیشتر (===) در یک خط مجزا استفاده کنید.
- با دابل‌کلیک روی run_tasks.bat، تسک‌ها به صورت کاملاً ترتیبی و در نشست‌های مستقل اجرا خواهند شد.
-->

<!--
یادداشت ناظر (Claude) — صف ۱۰ نشستی طرح «راه میانهٔ ماژولار»:
- طرح: Documents/Modular_Middle_Path/implementation_plan_modular_middle_path.md (قواعد مشترک در بخش `## ۷.`).
- صف قبلی (ارگونومی، نشست‌های ۰ تا ۱۵) کامل [DONE] شده بود و در تاریخچهٔ git همین فایل هست (commit de276d9).
- هر نشست یک کامنت runner دارد که برای ایجنت فرستاده نمی‌شود: require تمیزی درخت کاری؛ verify بررسی‌های همان گام،
  commit-exists و clean-tree.
- نگهبان ۲۹ تا پیش از نشست ۵ روی HEAD رد می‌شود؛ تا آن موقع به‌جایش verify_tools.py guardian29-max می‌آید.
- بازبین‌ها، بررسی 4300، release روی app، test_integration.ps1 و هر کار روی soft با ناظر است، نه با صف.
- پیش‌شرط صف: Docker روشن باشد (migrate-empty و test_bundle.ps1 کانتینر می‌سازند). ناظر پیش از شروع می‌سنجد.
- توافق با Antigravity: چت‌های f2b8c66f (بازبینی طرح) و f8f6a31d (این صف)؛ تصمیم‌ها در بخش `## ۸.` طرح.
-->

نشست 1 از 10 — راه میانهٔ ماژولار: گام ۰-الف (پوشه‌های بک‌اند)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; b=pathlib.Path('warehouse-backend'); need=['core/accounts','core/common','core/companies','core/communications','core/notifications','core/reports','core/settings_core','core/platform_core','modules/warehouse/warehouses','modules/warehouse/inventory','modules/accounting/personnel']; miss=[p for p in need if not (b/p/'__init__.py').is_file()]; root=[p.split('/')[-1] for p in need if (b/p.split('/')[-1]/'__init__.py').exists()]; pk=[str(p) for p in [b/'modules'/'__init__.py']+[d/'__init__.py' for d in (b/'modules').iterdir() if d.is_dir()] if p.exists()]; helper=(b/'backend_paths.py').is_file(); print('missing:',miss,'still at root:',root,'package markers:',pk,'helper:',helper); sys.exit(1 if miss or root or pk or not helper else 0)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py migrate-empty
verify: python scripts/automation/verify_tools.py guardian29-max --max unique_direct_violations=41 production_violations=10 non_production_violations=31 composition_root_hardcoded_lines=4 --min unique_direct_violations=41 production_violations=10
verify: python scripts/e2e/guardian_30_settings_core.py
verify: python scripts/e2e/guardian_31_install_profiles.py
verify: python scripts/e2e/guardian_54_module_independence.py
verify: python scripts/e2e/guardian_53_deploy_safety.py
verify: python scripts/test_guard_hooks.py
verify: pwsh -NoProfile -File scripts/deploy_tests/test_bundle.ps1
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(modular): step 0-a backend folders"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. در فایل Documents/Modular_Middle_Path/implementation_plan_modular_middle_path.md این بخش‌ها را کامل بخوان: `## ۲.`، `## ۴.`، `### گام ۰-الف` و `## ۷.`. قواعد `.agents/AGENTS.md` بخش ۵ و ۱۰ برقرارند. hash فعلی HEAD را پیش از هر تغییر یادداشت کن؛ پایهٔ این نشست است.

۲. کار این نشست، دقیقاً طبق `### گام ۰-الف`:
- با git mv اپ‌ها را جابه‌جا کن: accounts، common، companies، communications، notifications، reports، settings_core و platform_core به warehouse-backend/core/؛ warehouses و inventory به warehouse-backend/modules/warehouse/؛ personnel به warehouse-backend/modules/accounting/. پوشهٔ config و فایل manage.py سر جایشان می‌مانند.
- در هیچ‌کدام از warehouse-backend/modules/ و warehouse-backend/modules/<x>/ فایل __init__.py نساز (علتش در بخش `### گام ۳` طرح آمده است).
- name و label هیچ AppConfig و هیچ ایمپورتی (from accounts...) را عوض نکن. هیچ مایگریشنی نساز.
- warehouse-backend/backend_paths.py را با paths() و install() بساز و در config/__init__.py صدا بزن.
- همهٔ مصرف‌کننده‌های فهرست‌شده در طرح را اصلاح کن: نگهبان ۲۹ (PYTHONPATH برای lint-imports از paths())، اسکریپت‌های scripts/ که sys.path.insert دارند، اسکریپت‌های داخل اپ‌ها که مسیر را از __file__ می‌سازند، pyproject.toml، توضیح .importlinter، Get-BackendWhitelist و Test-BundleStage در deploy.ps1، scripts/deploy_tests/test_bundle.ps1 (همراه یک بررسی تازه: فهرست اپ‌های بسته برابر INSTALLED_APPS پروفایل کامل باشد)، warehouse-backend/docker-compose.yml اگر مسیر اپ دارد، .claude/hooks/guard.py، .claude/skills/safe-migration، .claude/agents، بخش ساختار CLAUDE.md و .agents/AGENTS.md.
- deploy.ps1 فقط در همین نقاط تغییر کند. تغییر دیگری در آن نده.
- پس از git mv، پوشه‌های قدیمی که فقط __pycache__ (نادیده‌گرفته‌شده در git) یا desktop.ini دارند را پاک کن تا پوشهٔ خالی هم‌نام اپ در ریشهٔ بک‌اند نماند.

۳. فرمان‌هایی که خودت می‌توانی اجرا کنی (استثنای بخش ۱۰ AGENTS): git mv، و این دو فرمان برای بازخورد:
python scripts/automation/verify_tools.py django-check
python scripts/automation/verify_tools.py migrations-unchanged
بقیهٔ بررسی‌ها را runner اجرا می‌کند.

۴. پایان:
- خودبازبینی با git diff --stat <پایه> و git status.
- در انتهای همان فایل طرح، زیر `## گزارش پیشرفت`، یک بند کوتاه برای «نشست ۱ (گام ۰-الف)» بنویس: کارهای انجام‌شده، انحراف‌ها و علتشان، فرمان‌هایی که خودت اجرا کردی با خط خلاصهٔ خروجی، و آنچه به runner و ناظر می‌ماند. هیچ برچسب DONE یا FAILED ننویس.
- فقط فایل‌های خودت را stage کن (tasks.md، run_tasks.* و tasks_history.md را نه) و با این پیام commit کن، بدون push:
refactor(modular): step 0-a backend folders
- اگر چیزی در طرح با کد نخواند و نتوانستی بی‌انحراف بزرگ ادامه دهی، علت را در همان بند گزارش بنویس، همان را commit کن و پایان بده.

===

نشست 2 از 10 — راه میانهٔ ماژولار: گام ۰-ب-۱ (پوشه‌های مشترک فرانت)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; m=pathlib.Path('warehouse-front/src/app/modules'); c=pathlib.Path('warehouse-front/src/app/components'); need=['login','layout','app-launcher','change-password','verify-card','users','operations','audit','health-dashboard','settings']; miss=[n for n in need if not (m/'common'/'components'/n).is_dir()]; old=[n for n in need if (c/n).exists()]; shell=(m/'platform-shell').exists(); script=pathlib.Path('scripts/refactor/move_front_components.mjs').is_file(); print('missing:',miss,'still in components:',old,'platform-shell left:',shell,'script:',script); sys.exit(1 if miss or old or shell or not script else 0)"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: cd warehouse-front && npx ng build --configuration accounting-only --output-path ../scratch/ng-build-acc
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-acc/browser --pattern "app-counter-dashboard|app-count-tracking|app-feeding"
verify: cd warehouse-front && npx ng build --configuration warehouse-only --output-path ../scratch/ng-build-wh
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-wh/browser --pattern "app-accountant-payroll|app-treasurer"
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_55_clickable_ergonomics.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_38_users_persona_texts.py
verify: python scripts/e2e/guardian_39_users_chunked_list.py
verify: python scripts/e2e/guardian_40_users_avatar_transactional.py
verify: python scripts/e2e/guardian_42_users_role_scope_permissions.py
verify: python scripts/e2e/guardian_44_users_query_params_clean.py
verify: python scripts/e2e/guardian_45_users_mobile_actions.py
verify: python scripts/e2e/guardian_46_users_avatar_contrast.py
verify: python scripts/e2e/guardian_47_users_status_filters.py
verify: python scripts/e2e/guardian_48_users_emergency_normalize.py
verify: warehouse-backend\venv\Scripts\python.exe scripts/e2e/guardian_50_users_sensitive_sync.py
verify: python scripts/e2e/guardian_51_users_expiry_cleanup.py
verify: python scripts/test_guard_hooks.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(modular): step 0-b1 common front folders"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. در فایل Documents/Modular_Middle_Path/implementation_plan_modular_middle_path.md بخش‌های `## ۴.`، `### گام ۰-ب` و `## ۷.` را کامل بخوان. قواعد `.agents/AGENTS.md` بخش ۵ و ۱۰ برقرارند. hash فعلی HEAD را یادداشت کن؛ پایهٔ این نشست است.

۲. کار این نشست، طبق «نشست ۰-ب-۱» در `### گام ۰-ب`:
- نگاشت را قطعی کن: برای هر پوشهٔ warehouse-front/src/app/components/<name> از روی route‌ها (app.routes.ts و modules/*/…routes.ts) و گراف ایمپورت تعیین کن به common، warehouse یا accounting می‌رود. جدول نهایی را در بند گزارش این نشست بنویس. پوشه‌های جدول پیش‌نویس طرح فقط وقتی جابه‌جا شوند که شواهد خلافشان را نشان ندهد؛ اگر نشان داد، شاهد را در گزارش بیاور.
- اسکریپت scripts/refactor/move_front_components.mjs را با API کامپایلر TypeScript (موجود در node_modules) بساز: با git mv پوشه را منتقل کند و مسیرهای نسبی ایمپورت را در همهٔ فایل‌های *.ts (از جمله *.spec.ts و *.dom.spec.ts و import() پویا) بازنویسی کند؛ هم در فایل‌های جابه‌جاشده و هم در فایل‌هایی که به آن‌ها ایمپورت دارند. نام فایل‌ها پسوند .component ندارند (مثل login/login.ts).
- فقط پوشه‌های گروه common را به warehouse-front/src/app/modules/common/components/ ببر و محتوای modules/platform-shell را در modules/common ادغام کن (index.ts و هر ارجاع به آن را درست کن). پوشه‌های انبار و مالی در این نشست دست نخورند.
- هر مسیر ثابتی که به پوشه‌های جابه‌جاشدهٔ همین نشست اشاره دارد، در همین نشست اصلاح شود تا همه‌چیز سبز بماند. فهرست کامل این فایل‌ها در `### گام ۰-ب` طرح، بند «مسیرهای ثابتی که باید اصلاح شوند» است: مبنای نگهبان ۵۵ (فقط بازنویسی مسیر، بدون --update-baseline)، نگهبان‌های users (۳۸ تا ۵۱)، scripts/test_guard_hooks.py (مسیر components/login)، dom-verify.js، tsconfig.*.spec.json، specهای __dirname و مستندها. بقیهٔ پوشه‌ها در نشست ۳.
- templateUrl و styleUrl را دست نزن. هیچ رفتار، قالب یا استایلی را تغییر نده.

۳. فرمان‌هایی که خودت می‌توانی اجرا کنی: git mv، اسکریپت خودت، و حداکثر دو بار این بیلد برای بازخورد:
cd warehouse-front && npx ng build --output-path ../scratch/ng-build-agent
بقیهٔ بررسی‌ها (دو بیلد پروفایل، نگهبان‌ها و ng test) را runner اجرا می‌کند.

۴. پایان:
- خودبازبینی با git diff -M --stat <پایه>: باید فقط تغییر نام و سطرهای ایمپورت باشد.
- زیر `## گزارش پیشرفت` طرح، بند «نشست ۲ (گام ۰-ب-۱)» را مثل نشست ۱ بنویس، همراه جدول نهایی نگاشت. هیچ برچسب DONE یا FAILED ننویس.
- فقط فایل‌های خودت را stage کن و با این پیام commit کن، بدون push:
refactor(modular): step 0-b1 common front folders

===

نشست 3 از 10 — راه میانهٔ ماژولار: گام ۰-ب-۲ (پوشه‌های انبار و مالی در فرانت)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; m=pathlib.Path('warehouse-front/src/app/modules'); c=pathlib.Path('warehouse-front/src/app/components'); left=[str(p) for p in c.rglob('*.ts')] if c.exists() else []; ok=[(m/'warehouse'/'components'/'counter').is_dir(),(m/'accounting'/'components'/'finance').is_dir()]; script=pathlib.Path('scripts/refactor/move_front_components.mjs').exists(); print('left in components:',left[:5],'module folders:',ok,'script left:',script); sys.exit(1 if left or not all(ok) or script else 0)"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: cd warehouse-front && npx ng build --configuration accounting-only --output-path ../scratch/ng-build-acc
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-acc/browser --pattern "app-counter-dashboard|app-count-tracking|app-feeding"
verify: cd warehouse-front && npx ng build --configuration warehouse-only --output-path ../scratch/ng-build-wh
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-wh/browser --pattern "app-accountant-payroll|app-treasurer"
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_55_clickable_ergonomics.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_38_users_persona_texts.py
verify: python scripts/e2e/guardian_39_users_chunked_list.py
verify: python scripts/e2e/guardian_40_users_avatar_transactional.py
verify: python scripts/e2e/guardian_42_users_role_scope_permissions.py
verify: python scripts/e2e/guardian_44_users_query_params_clean.py
verify: python scripts/e2e/guardian_45_users_mobile_actions.py
verify: python scripts/e2e/guardian_46_users_avatar_contrast.py
verify: python scripts/e2e/guardian_47_users_status_filters.py
verify: python scripts/e2e/guardian_48_users_emergency_normalize.py
verify: warehouse-backend\venv\Scripts\python.exe scripts/e2e/guardian_50_users_sensitive_sync.py
verify: python scripts/e2e/guardian_51_users_expiry_cleanup.py
verify: python scripts/test_guard_hooks.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(modular): step 0-b2 module front folders"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. در فایل طرح بخش‌های `### گام ۰-ب` و `## ۷.` و بند «نشست ۲» زیر `## گزارش پیشرفت` (جدول نهایی نگاشت) را بخوان. قواعد `.agents/AGENTS.md` بخش ۵ و ۱۰ برقرارند. hash فعلی HEAD را یادداشت کن.

۲. کار این نشست، طبق «نشست ۰-ب-۲» در `### گام ۰-ب`:
- با همان اسکریپت scripts/refactor/move_front_components.mjs همهٔ پوشه‌های باقی‌ماندهٔ warehouse-front/src/app/components را طبق جدول نشست ۲ به modules/warehouse/components/ و modules/accounting/components/ (یا common اگر جدول گفته) ببر. در پایان پوشهٔ components نباید هیچ فایل *.ts داشته باشد.
- باقی‌ماندهٔ مسیرهای ثابت فهرست‌شده در طرح را اصلاح کن (هر چه نشست ۲ برای پوشه‌های خودش اصلاح نکرده است):
  - مبنای نگهبان ۵۵ (scripts/e2e/clickable_ergonomics_baseline.json): فقط مسیرها را با همان نگاشت بازنویسی کن. --update-baseline اجرا نکن و هیچ عددی را عوض نکن.
  - نگهبان‌های ۳۸ تا ۴۰، ۴۲، ۴۴ تا ۴۸، ۵۰، ۵۱ و guardian_header_harmonization.py، و scripts/test_guard_hooks.py.
  - warehouse-front/tools/dom-verify.js، tsconfig.spec.json و tsconfig.test21.spec.json.
  - specهایی که با __dirname فایل می‌خوانند.
  - .agents/PROJECT_ARCHITECTURE_MAP.md، .claude/skills/design-system، .claude/agents/ui-reviewer.md، CLAUDE.md و .agents/AGENTS.md.
- در پایان اسکریپت scripts/refactor/move_front_components.mjs را حذف کن (git rm).
- هیچ رفتار، قالب یا استایلی را تغییر نده.

۳. فرمان‌هایی که خودت می‌توانی اجرا کنی: git mv، اسکریپت، و حداکثر دو بار:
cd warehouse-front && npx ng build --output-path ../scratch/ng-build-agent
بقیه را runner اجرا می‌کند.

۴. پایان:
- خودبازبینی با git diff -M --stat <پایه>.
- زیر `## گزارش پیشرفت` طرح، بند «نشست ۳ (گام ۰-ب-۲)» را بنویس. هیچ برچسب DONE یا FAILED ننویس.
- فقط فایل‌های خودت را stage کن و با این پیام commit کن، بدون push:
refactor(modular): step 0-b2 module front folders

===

نشست 4 از 10 — راه میانهٔ ماژولار: گام ۱ (بیلد و استقرار جدا)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: cd warehouse-front && set "WH_MODULES=accounting" && npm run build:modules -- --output-path ../scratch/ng-build-acc
verify: python -c "import pathlib,sys; t=pathlib.Path('scratch/ng-build-acc/browser/build-modules.txt').read_text(encoding='utf-8').strip(); print(repr(t)); sys.exit(0 if t=='accounting' else 1)"
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-acc/browser --pattern "app-counter-dashboard|app-count-tracking|app-feeding"
verify: cd warehouse-front && set "WH_MODULES=warehouse" && npm run build:modules -- --output-path ../scratch/ng-build-wh
verify: python -c "import pathlib,sys; t=pathlib.Path('scratch/ng-build-wh/browser/build-modules.txt').read_text(encoding='utf-8').strip(); print(repr(t)); sys.exit(0 if t=='warehouse' else 1)"
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-wh/browser --pattern "app-accountant-payroll|app-treasurer"
verify: cd warehouse-front && set "WH_MODULES=" && npm run build:modules -- --output-path ../scratch/ng-build-all
verify: python -c "import pathlib,sys; t=pathlib.Path('scratch/ng-build-all/browser/build-modules.txt').read_text(encoding='utf-8').strip(); print(repr(t)); sys.exit(0 if t=='accounting,warehouse' else 1)"
verify: python scripts/e2e/guardian_53_deploy_safety.py
verify: pwsh -NoProfile -File scripts/deploy_tests/test_bundle.ps1
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(modular): step 1 per-module build and deploy"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. در فایل طرح بخش‌های `### گام ۱` و `## ۷.` را کامل بخوان. قواعد `.agents/AGENTS.md` بخش ۵ و ۱۰ برقرارند. hash فعلی HEAD را یادداشت کن.

۲. کار این نشست، طبق `### گام ۱`:
- warehouse-front/tools/build-for-modules.js و اسکریپت npm به نام build:modules:
  - فهرست ماژول‌ها را از متغیر WH_MODULES می‌خواند. خالی یعنی همهٔ ماژول‌ها.
  - accounting پروفایل accounting-only، warehouse پروفایل warehouse-only، و هر دو یا خالی بیلد کامل را می‌سازد.
  - گزینهٔ --output-path را به ng build می‌دهد و همان مسیر را به tools/patch-ngsw-530.js هم می‌رساند. برای این کار به patch-ngsw-530.js یک آرگومان اختیاری مسیر خروجی اضافه کن؛ بی‌آرگومان، رفتار امروزش عوض نشود.
  - پس از بیلد، فایل <output-path>/browser/build-modules.txt را می‌نویسد: کد ماژول‌ها به ترتیب الفبا و جداشده با ویرگول (accounting، warehouse یا accounting,warehouse).
- deploy.ps1:
  - فرانت را با npm run build:modules و WH_MODULES برابر Modules پیکربندی بیلد کند.
  - نشانگر .build-complete شامل MODULES= شود تا -SkipBuild بیلد پروفایل دیگر را دوباره به‌کار نبرد.
  - بررسی بسته build-modules.txt را با Modules سرور مقایسه کند (مقایسهٔ مجموعه، نه ترتیب).
  - -AddModule پیش از تغییر WH_MODULES فرانت را با فهرست تازه بیلد و release کند. بقیهٔ مسیر مثل امروز بماند.
  - $KnownModules را از git ls-tree کامیت استقرار (warehouse-backend/modules/*/) بسازد، نه ثابت.
- scripts/deploy/warehouse-deploy.sh: KNOWN_MODULES را از پوشهٔ modules همان release بسازد. MODULE_SERVICES برای ماژول ناشناخته مقدار خالی بگیرد.
- به نگهبان ۵۳ یک بند تازه اضافه کن: فهرست ماژول‌ها در deploy.ps1 و warehouse-deploy.sh ثابت نوشته نشده باشد.
- scripts/deploy_tests/test_bundle.ps1 را برای مسیر تازهٔ بیلد به‌روز کن، از جمله بررسی محتوای .build-complete (امروز دقیقاً COMMIT=<sha> را می‌خواهد) که باید با بخش تازهٔ MODULES= بخواند.

۳. فرمان‌هایی که خودت می‌توانی اجرا کنی: حداکثر یک بار بیلد هر پروفایل با build:modules برای بازخورد. test_integration.ps1 را اجرا نکن؛ با ناظر است.

۴. پایان:
- خودبازبینی با git diff --stat <پایه>.
- زیر `## گزارش پیشرفت` طرح، بند «نشست ۴ (گام ۱)» را بنویس. هیچ برچسب DONE یا FAILED ننویس.
- فقط فایل‌های خودت را stage کن و با این پیام commit کن، بدون push:
feat(modular): step 1 per-module build and deploy

===

نشست 5 از 10 — راه میانهٔ ماژولار: گام ۲ (حصارها)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/automation/verify_tools.py guardian29-max --max non_production_violations=0 composition_root_hardcoded_lines=0 production_violations=40 --min production_violations=10
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/e2e/guardian_57_front_module_fence.py --self-test
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/e2e/guardian_30_settings_core.py
verify: python scripts/e2e/guardian_31_install_profiles.py
verify: python scripts/e2e/guardian_54_module_independence.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "chore(modular): step 2 backend and front fences"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. در فایل طرح بخش‌های `### گام ۲`، `## ۴.` (قاعدهٔ وابستگی) و `## ۷.` را کامل بخوان. قواعد `.agents/AGENTS.md` بخش ۵ و ۱۰ برقرارند. hash فعلی HEAD را یادداشت کن.

۲. کار این نشست، طبق `### گام ۲`:
- بک‌اند:
  - .importlinter را با پوشه‌ها هم‌تراز کن: config بالا، warehouses و inventory و personnel در لایهٔ ماژول، و همهٔ اپ‌های core (از جمله reports) در لایهٔ هسته. C2 دوطرفه بماند و C3 یعنی هیچ اپ هسته‌ای هیچ اپ ماژولی را ایمپورت نکند.
  - ۴ سطر ریشهٔ ترکیب را صفر کن. _PROJECT_LOGGERS در config/settings.py از INSTALLED_APPS ساخته شود. سطر urls.py را پس از هم‌ترازی دوباره بسنج.
  - هر ۳۱ یال غیرتولیدی را رفع کن. تست‌های ذاتاً بین‌ماژولی را به warehouse-backend/integration_tests/ ببر (این پوشه در root_packages نیست، اسکریپت ریشه ندارد و فقط با برچسب اجرا می‌شود).
  - شمار یال‌های تولیدی پس از هم‌ترازی ممکن است بیشتر از ۱۰ شود (مثلاً ایمپورت‌های انباری reports). این‌ها در گام ۳ رفع می‌شوند؛ در این نشست رفعشان نکن.
  - پس از همهٔ این‌ها یک بار python scripts/e2e/guardian_modularization.py --update-baseline اجرا کن. عددهای قبل و بعد هر شمارنده را در گزارش بیاور.
- فرانت: scripts/e2e/guardian_57_front_module_fence.py را بساز، طبق بند «فرانت» در `### گام ۲`:
  - سه شمارنده (الف، ب، ج)، استثنای ریشهٔ ترکیب، و مبنای آچاری scripts/e2e/front_fence_baseline.json (فقط کاهش مجاز است؛ --update-baseline برای ثبت).
  - گزینهٔ --self-test یک فایل نقض ساختگی در scratch/ می‌سازد و فقط وقتی کد ۰ می‌دهد که نقض را پیدا کرده باشد. فایل ساختگی را پاک می‌کند.
  - نگهبان باید در guardian_all.py خودکار کشف شود.
  - یک بار با --update-baseline مبنای امروز را ثبت کن.

۳. فرمان‌هایی که خودت می‌توانی اجرا کنی: guardian_modularization.py (با و بی --update-baseline، به‌ترتیب بالا)، lint-imports با PYTHONUTF8=1، نگهبان ۵۷ و --self-test و --update-baseline آن، و verify_tools.py django-check.

۴. پایان:
- خودبازبینی با git diff --stat <پایه>.
- زیر `## گزارش پیشرفت` طرح، بند «نشست ۵ (گام ۲)» را با فهرست یال‌های غیرتولیدی و راه رفع هر کدام بنویس. هیچ برچسب DONE یا FAILED ننویس.
- فقط فایل‌های خودت را stage کن و با این پیام commit کن، بدون push:
chore(modular): step 2 backend and front fences

===

نشست 6 از 10 — راه میانهٔ ماژولار: گام ۳-الف (معرفی ماژول‌ها و ابزار هسته)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,re,sys; b=pathlib.Path('warehouse-backend'); files={'modules/warehouse/warehouses/signals.py':'personnel','modules/accounting/personnel/models.py':'warehouses','modules/accounting/personnel/views.py':'warehouses','core/accounts/serializers.py':'personnel'}; bad=[f for f,m in files.items() if re.search(r'^\s*(from|import)\s+'+m+r'(\.|\s|$)',(b/f).read_text(encoding='utf-8'),re.M)]; man=[str(p) for p in [b/'modules/warehouse/module.py',b/'modules/accounting/module.py',b/'core/platform_core/events.py'] if not p.is_file()]; cat=(b/'core/platform_core/module_catalog.py').read_text(encoding='utf-8'); hard=[n for n in ('WAREHOUSE_SPEC = ','ACCOUNTING_SPEC = ') if n in cat]; print('still importing:',bad,'missing:',man,'hard-coded specs:',hard); sys.exit(1 if bad or man or hard else 0)"
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py migrate-empty
verify: python scripts/e2e/guardian_30_settings_core.py
verify: python scripts/e2e/guardian_31_install_profiles.py
verify: python scripts/e2e/guardian_54_module_independence.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(modular): step 3a module manifests and core events"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. در فایل طرح بخش‌های `### گام ۳`، `## ۳.` (جدول ۱۰ یال تولیدی) و `## ۷.` را کامل بخوان. قواعد `.agents/AGENTS.md` بخش ۵ و ۱۰ برقرارند. hash فعلی HEAD را یادداشت کن.

۲. کار این نشست (نیمهٔ اول `### گام ۳`):
- معرفی خودکار: WAREHOUSE_SPEC و ACCOUNTING_SPEC و فهرست مجوزهای هر ماژول را از core/platform_core/module_catalog.py به warehouse-backend/modules/warehouse/module.py و modules/accounting/module.py ببر. module_catalog.py فقط modules/*/module.py را با importlib.util.spec_from_file_location و نام یکتا پویش کند و شرط برابری code با نام پوشه را بسنجد. config/settings.py همان MODULE_CATALOG را بی‌تغییر بخواند.
- ابزار هسته: contribute(point, item)، contributions(point) و company_of(kind, id) در platform_core/registry.py، و رویداد scope_deleted در platform_core/events.py (فایل تازه).
- این چهار یال، دقیقاً طبق جدول `### گام ۳`:
  - warehouses/signals.py → personnel: انبار scope_deleted را می‌فرستد و personnel/signals.py گیرنده است و همان ۵ مدل را خالی می‌کند. رفتار عوض نشود (خالی کردن، نه حذف).
  - personnel/models.py:2296 و personnel/views.py:4973 → warehouses: انبار تابع «شرکتِ این انبار» را contribute می‌کند و مالی company_of('warehouse', id) را صدا می‌زند.
  - accounts/serializers.py:449 → personnel: مالی در ready() با register_derived_company_source (companies/access.py) ثبت می‌شود.
- برای سیگنال حذف انبار یک تست Django در اپ personnel بنویس که برابری رفتار را نشان دهد. اگر پایگاه تست در دسترس نبود، در گزارش صریح بنویس که اجرا نشد.

۳. فرمان‌هایی که خودت می‌توانی اجرا کنی: verify_tools.py django-check، verify_tools.py migrations-unchanged و guardian_modularization.py (بدون --update-baseline، مگر شمار کم شده باشد؛ در آن صورت یک بار --update-baseline و عددها در گزارش).

۴. پایان:
- خودبازبینی با git diff --stat <پایه>.
- زیر `## گزارش پیشرفت` طرح، بند «نشست ۶ (گام ۳-الف)» را بنویس. هیچ برچسب DONE یا FAILED ننویس.
- فقط فایل‌های خودت را stage کن و با این پیام commit کن، بدون push:
refactor(modular): step 3a module manifests and core events

===

نشست 7 از 10 — راه میانهٔ ماژولار: گام ۳-ب (بقیهٔ یال‌های هسته)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/automation/verify_tools.py guardian29-max --max production_violations=0 non_production_violations=0 composition_root_hardcoded_lines=0
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py migrate-empty
verify: python scripts/e2e/guardian_30_settings_core.py
verify: python scripts/e2e/guardian_31_install_profiles.py
verify: python scripts/e2e/guardian_54_module_independence.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(modular): step 3b extension points for core edges"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. در فایل طرح بخش‌های `### گام ۳` و `## ۷.` و بند «نشست ۶» زیر `## گزارش پیشرفت` را بخوان. قواعد `.agents/AGENTS.md` بخش ۵ و ۱۰ برقرارند. hash فعلی HEAD را یادداشت کن.

۲. کار این نشست (نیمهٔ دوم `### گام ۳`)، با همان ابزار contribute و contributions نشست ۶:
- accounts/serializers.py:13 و accounts/excel_utils.py → warehouses: نقطهٔ user_extensions. انبار فیلد و ستون اکسل «انبارهای کاربر» را می‌دهد. خروجی API و اکسل در پروفایل کامل عوض نشود.
- accounts/rollback_service.py → inventory و warehouses: نقطهٔ rollback_models. هر ماژول نگاشت نام به مدل خودش را می‌دهد.
- reports: همهٔ موجودیت‌ها و joinهای انبار و مالی از core/reports/registry.py (و هر ایمپورت ماژولی در core/reports، مثل serializers.py) به فایل report_entities.py هر ماژول بروند و در ready() با register_entity و register_joins ثبت شوند. فهرست موجودیت‌ها و کلیدهایشان در پروفایل کامل عیناً همان قبل بماند.
- هر نقض تولیدی دیگری که نگهبان ۲۹ پس از نشست ۵ نشان می‌دهد، به همین روش رفع شود. هدف: production_violations = 0.
- پس از صفر شدن، یک بار python scripts/e2e/guardian_modularization.py --update-baseline.
- یک تست Django بنویس که فهرست کلید موجودیت‌های گزارش در پروفایل کامل را با فهرست پیش از تغییر مقایسه کند. اگر پایگاه تست در دسترس نبود، در گزارش صریح بنویس.

۳. فرمان‌هایی که خودت می‌توانی اجرا کنی: verify_tools.py django-check، verify_tools.py migrations-unchanged و guardian_modularization.py (با --update-baseline فقط یک بار در پایان).

۴. پایان:
- خودبازبینی با git diff --stat <پایه>.
- زیر `## گزارش پیشرفت` طرح، بند «نشست ۷ (گام ۳-ب)» را بنویس. هیچ برچسب DONE یا FAILED ننویس.
- فقط فایل‌های خودت را stage کن و با این پیام commit کن، بدون push:
refactor(modular): step 3b extension points for core edges

===

نشست 8 از 10 — راه میانهٔ ماژولار: گام ۴-الف (قرارداد فرانت و پوسته)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; f=pathlib.Path('warehouse-front'); m=f/'src/app/modules'; stubs=[str(p) for p in m.rglob('*.stub.ts')]; aj=(f/'angular.json').read_text(encoding='utf-8'); prof=[n for n in ('accounting-only','warehouse-only') if n in aj]; need=[str(p) for p in [f/'src/app/core/modules/module-contract.ts',m/'warehouse/module.ts',m/'accounting/module.ts',m/'installed-modules.ts',f/'tools/gen-installed-modules.js'] if not p.is_file()]; print('stubs:',stubs,'profiles in angular.json:',prof,'missing:',need); sys.exit(1 if stubs or prof or need else 0)"
verify: cd warehouse-front && set "WH_MODULES=accounting" && npm run build:modules -- --output-path ../scratch/ng-build-acc
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-acc/browser --pattern "app-counter-dashboard|app-count-tracking|app-feeding"
verify: cd warehouse-front && set "WH_MODULES=warehouse" && npm run build:modules -- --output-path ../scratch/ng-build-wh
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-wh/browser --pattern "app-accountant-payroll|app-treasurer"
verify: cd warehouse-front && set "WH_MODULES=" && npm run build:modules -- --output-path ../scratch/ng-build-all
verify: python -c "import pathlib,sys; t=pathlib.Path('scratch/ng-build-all/browser/build-modules.txt').read_text(encoding='utf-8').strip(); print(repr(t)); sys.exit(0 if t=='accounting,warehouse' else 1)"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_55_clickable_ergonomics.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(modular): step 4a front module contract"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. در فایل طرح بخش‌های `### گام ۴`، `## ۴.` و `## ۷.` را کامل بخوان. قواعد `.agents/AGENTS.md` بخش ۵، ۹ و ۱۰ برقرارند. hash فعلی HEAD را یادداشت کن.

۲. کار این نشست، طبق «نشست ۴-الف» در `### گام ۴`:
- warehouse-front/src/app/core/modules/module-contract.ts: نوع WhFrontendModule (فیلدهای فعلی FrontendModuleSpec به‌علاوهٔ routes، navItems، entityIcons و extensions) و نوع ExtensionMap. نام‌های ExtensionMap را پس از خواندن هر ۲۴ فایلی که isModuleInstalled دارند قطعی کن و فهرستش را در گزارش بیاور.
- modules/warehouse/module.ts و modules/accounting/module.ts هر کدام export const MODULE.
- tools/gen-installed-modules.js فایل src/app/modules/installed-modules.ts را از WH_MODULES می‌سازد (خالی یعنی همهٔ پوشه‌هایی که module.ts دارند). نسخهٔ commitشده همهٔ ماژول‌ها را دارد. build-for-modules.js به‌جای انتخاب پروفایل، مولد را صدا بزند و پس از بیلد نسخهٔ commitشده را برگرداند تا درخت کاری تمیز بماند. بازگرداندن حتماً در try/finally باشد تا شکست یا قطع بیلد هم درخت را کثیف نگذارد. قرارداد build:modules (WH_MODULES، --output-path، build-modules.txt) عوض نشود و deploy.ps1 دست نخورد.
- فایل‌های *.stub.ts و پرچم‌های modules/*/…-flags*.ts و پروفایل‌های accounting-only و warehouse-only و نسخه‌های dev آن‌ها (accounting-dev و warehouse-dev و پیکربندی‌های serve وابسته) از angular.json حذف شوند. اسکریپت‌های npm قدیمی build:accounting و build:warehouse هم به build:modules با WH_MODULES تبدیل یا حذف شوند.
- ModuleRegistryService فهرست را از installed-modules.ts بسازد و KNOWN_MODULE_CATALOG از هسته حذف شود. isModuleInstalled می‌ماند.
- پوسته (layout، app-launcher، user-menu) از extensions بخواند، نه از نام ماژول.
- تست DOM برای layout، app-launcher و user-menu با سه فهرست ماژول (فقط انبار، فقط مالی، هر دو).
- ظاهر و رفتار در پروفایل کامل عوض نشود.

۳. فرمان‌هایی که خودت می‌توانی اجرا کنی: حداکثر دو بار npx ng build --output-path ../scratch/ng-build-agent، و تست‌های DOM تازهٔ خودت با npx ng test --watch=false --include <فایل spec> (فقط همان فایل‌ها).

۴. پایان:
- خودبازبینی با git diff --stat <پایه>.
- زیر `## گزارش پیشرفت` طرح، بند «نشست ۸ (گام ۴-الف)» را بنویس، همراه فهرست نقطه‌های ExtensionMap و یک چک‌لیست از ۲۴ فایل: برای هر فایل، نقطهٔ توسعهٔ آن و اینکه در این نشست تبدیل شد یا به نشست ۹ می‌ماند. نشست ۹ بی‌پویش دوباره از همین چک‌لیست کار می‌کند. هیچ برچسب DONE یا FAILED ننویس.
- فقط فایل‌های خودت را stage کن و با این پیام commit کن، بدون push:
feat(modular): step 4a front module contract

===

نشست 9 از 10 — راه میانهٔ ماژولار: گام ۴-ب (نقطه‌های توسعه)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import json,pathlib,sys; d=json.loads(pathlib.Path('scripts/e2e/front_fence_baseline.json').read_text(encoding='utf-8')); c=d.get('counters',d); bad={k:v for k,v in c.items() if isinstance(v,int) and v!=0}; print('non-zero fence counters:',bad); sys.exit(1 if bad else 0)"
verify: cd warehouse-front && set "WH_MODULES=accounting" && npm run build:modules -- --output-path ../scratch/ng-build-acc
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-acc/browser --pattern "app-counter-dashboard|app-count-tracking|app-feeding"
verify: cd warehouse-front && set "WH_MODULES=warehouse" && npm run build:modules -- --output-path ../scratch/ng-build-wh
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-wh/browser --pattern "app-accountant-payroll|app-treasurer"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_55_clickable_ergonomics.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(modular): step 4b front extension points"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. در فایل طرح بخش `### گام ۴` و `## ۷.` و بند «نشست ۸» زیر `## گزارش پیشرفت` (نقطه‌ها و فهرست ۲۴ فایل) را بخوان. قواعد `.agents/AGENTS.md` بخش ۵، ۹ و ۱۰ برقرارند. hash فعلی HEAD را یادداشت کن.

۲. کار این نشست، طبق «نشست ۴-ب» در `### گام ۴`:
- هر فایلی از آن ۲۴ فایل که هنوز نام ماژول را با isModuleInstalled یا رشتهٔ ثابت می‌سنجد، به خواندن extensions تبدیل شود. ماژول‌ها نقطه‌ها را در module.ts خود پر کنند. اگر ماژولی به قابلیت ماژول دیگر نیاز دارد، آن هم از راه نقطهٔ توسعه است.
- تست DOM مرکز عملیات (operations-cockpit و operations-layout) با سه فهرست ماژول.
- نگهبان ۵۷ سخت‌گیر شود: بررسی‌های قرارداد بند «نگهبان ۵۷ گسترش می‌یابد» در `### گام ۴` (module.ts در هر پوشهٔ ماژول، برابری code با نام پوشه و با warehouse-backend/modules/<x>/module.py، کامل بودن installed-modules.ts) و مبنای همهٔ شمارنده‌ها صفر. یک بار --update-baseline.
- ظاهر و رفتار در پروفایل کامل عوض نشود.

۳. فرمان‌هایی که خودت می‌توانی اجرا کنی: حداکثر دو بار npx ng build --output-path ../scratch/ng-build-agent، تست‌های DOM تازهٔ خودت با npx ng test --watch=false --include <فایل spec>، و نگهبان ۵۷ (با --update-baseline یک بار در پایان).

۴. پایان:
- خودبازبینی با git diff --stat <پایه>. برای هر قالبی که حذف خالص بزرگ دارد، hunk را بخوان (AGENTS بخش ۵ بند ۷).
- زیر `## گزارش پیشرفت` طرح، بند «نشست ۹ (گام ۴-ب)» را بنویس، همراه فهرست چک ۳۶۰px برای کاربر (موارد پشت ورود). هیچ برچسب DONE یا FAILED ننویس.
- فقط فایل‌های خودت را stage کن و با این پیام commit کن، بدون push:
refactor(modular): step 4b front extension points

===

نشست 10 از 10 — راه میانهٔ ماژولار: گام ۵ (ماژول‌های آینده)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; need=[pathlib.Path(p) for p in ('scripts/new_module.py','scripts/module-template','Documents/Modular_Middle_Path/guide_new_module.md')]; miss=[str(p) for p in need if not p.exists()]; print('missing:',miss); sys.exit(1 if miss else 0)"
verify: python scripts/automation/verify_tools.py sample-module
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(modular): step 5 module template and guide"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. در فایل طرح بخش‌های `### گام ۵`، `## ۴.` و `## ۷.` را کامل بخوان. قواعد `.agents/AGENTS.md` بخش ۵ و ۱۰ برقرارند. hash فعلی HEAD را یادداشت کن.

۲. کار این نشست، طبق `### گام ۵`:
- قالب خالی scripts/module-template/ (بک‌اند: module.py و یک اپ با apps.py که در ready() ثبت می‌کند، models.py، urls.py، migrations/__init__.py و tests.py؛ فرانت: module.ts، <code>.routes.ts، nav-items.ts و یک صفحهٔ نمونه که از مؤلفه‌ها و آیکون‌های مشترک استفاده می‌کند).
- scripts/new_module.py با گزینه‌های --code، --title-fa و --root (پیش‌فرض ریشهٔ همین مخزن). قالب را با نام تازه در <root>/warehouse-backend/modules/<code> و <root>/warehouse-front/src/app/modules/<code> می‌سازد و installed-modules.ts را با gen-installed-modules.js به‌روز می‌کند. هیچ فایل دیگری را تغییر نمی‌دهد. اگر پوشهٔ مقصد وجود دارد، بدون تغییر خطا می‌دهد.
- راهنمای Documents/Modular_Middle_Path/guide_new_module.md به فارسی و کوتاه، با محتوای فهرست‌شده در `### گام ۵`، داخل <div dir="rtl" align="right">.
- قالب در مخزن نباید به‌عنوان ماژول نصب‌شده شناخته شود (scripts/module-template بیرون از warehouse-backend/modules و src/app/modules است).
- حصار ماژول تازه بدون ویرایش هسته: نگهبان ۲۹ بسته‌های ماژول‌ها را از warehouse-backend/modules/*/*/__init__.py کشف کند و اگر در .importlinter نیستند، یک پیکربندی موقت در scratch/ از روی .importlinter به‌علاوهٔ آن‌ها بسازد (لایهٔ ماژول، و قرارداد استقلال برای هر دو ماژول). نگهبان ۵۷ هم پوشه‌های ماژول را خودش کشف کند. هیچ فهرست ثابت ماژولی در این دو نگهبان نماند.

۳. فرمان‌هایی که خودت می‌توانی اجرا کنی: یک بار python scripts/automation/verify_tools.py sample-module برای بازخورد. هیچ ماژول نمونه‌ای در خود مخزن نساز.

۴. پایان:
- خودبازبینی با git diff --stat <پایه>.
- زیر `## گزارش پیشرفت` طرح، بند «نشست ۱۰ (گام ۵)» را بنویس. هیچ برچسب DONE یا FAILED ننویس.
- فقط فایل‌های خودت را stage کن و با این پیام commit کن، بدون push:
feat(modular): step 5 module template and guide
