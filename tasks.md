<!--
راهنمای استفاده:
- هر تسک را می‌توانید به صورت چندخطی و با توضیحات کامل بنویسید.
- بین هر تسک از جداکننده سه مساوی یا بیشتر (===) در یک خط مجزا استفاده کنید.
- با دابل‌کلیک روی run_tasks.bat، تسک‌ها به صورت کاملاً ترتیبی و در نشست‌های مستقل اجرا خواهند شد.
-->

<!--
یادداشت ناظر (Claude) — صف ۳ نشستی طرح «پیگیری‌های بازبینی ناظر»:
- طرح: Documents/Supervisor_Followups/implementation_plan_supervisor_followups.md (قواعد مشترک در `## ۴.`، راستی‌آزمایی در `## ۵.`).
- صف قبلی (راه میانهٔ ماژولار، ۱۰ نشست) کامل [DONE] شده بود و در تاریخچهٔ git همین فایل هست (commit d33644a).
- هر نشست یک کامنت runner دارد که برای ایجنت فرستاده نمی‌شود: require تمیزی درخت کاری؛ verify بررسی‌های همان نشست،
  commit-exists و clean-tree.
- نگهبان‌های ۲۹ و ۵۷ در ۲۳ مهر روی HEAD (ddc3ea1) سبز بودند.
- آزمون‌های بک‌اند نشست ۱ روی HEAD (ddc3ea1): ۲۱۹ آزمون، ۳ خطای از پیش موجود در خود فایل‌های آزمون
  (دو ExportWorkerTests با import نسبی integration_tests.management، و NameError status در test_company_warehouse_isolation).
  خط verify فقط همین سه را می‌پذیرد و هر شکست تازه را رد می‌کند.
- بازبین‌ها (tenant-scope-reviewer برای نشست ۱، ui-reviewer برای ۲ و ۳)، بررسی 4300، release روی app و هر کار روی soft با ناظر است، نه با صف.
- توافق با Antigravity: چت 35c27e73 (دو دور). پذیرفته: سخت‌گیری بررسی switchTab در نشست ۲ (کوتیشن دوتایی و template literal)،
  و جملهٔ شرکت فعال در پیش‌نمایش Excel در نشست ۱. رد: «باگ regex» خط verify آزمون‌های نشست ۱، چون Python 3.12 نام متد را
  داخل پرانتز می‌آورد و همان regex روی لاگ واقعی HEAD درست کار کرد.
-->

نشست 1 از 3 — پیگیری‌های ناظر: دامنهٔ شرکت در گزارش‌ساز و ورود کاربران از Excel (بک‌اند)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import subprocess,sys; f=subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True,encoding='utf-8').stdout.split(); bad=[x for x in f if x.startswith('warehouse-front/') or '/migrations/' in x]; new=[x for x in f if x.endswith('integration_tests/test_company_scope_reports_import.py')]; print('front or migration files changed:',bad,'new test file in diff:',new); sys.exit(1 if bad or not new else 0)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python -c "import os,re,subprocess,sys; py=os.path.abspath(r'warehouse-backend\venv\Scripts\python.exe'); r=subprocess.run([py,'manage.py','test','integration_tests.test_company_scope_reports_import','--noinput'],cwd='warehouse-backend',capture_output=True,text=True,encoding='utf-8',errors='replace',env=dict(os.environ,PYTHONUTF8='1',PYTHONIOENCODING='utf-8')); o=r.stdout+r.stderr; m=re.search(r'Ran (\d+) test',o); n=int(m.group(1)) if m else 0; sk='skipped=' in o; print(o[-3000:]); print('exit',r.returncode,'ran',n,'skipped',sk); sys.exit(0 if r.returncode==0 and n>=13 and not sk else 1)"
verify: python -c "import os,re,subprocess,sys; py=os.path.abspath(r'warehouse-backend\venv\Scripts\python.exe'); r=subprocess.run([py,'manage.py','test','integration_tests','accounts','warehouses','reports','platform_core','--noinput'],cwd='warehouse-backend',capture_output=True,text=True,encoding='utf-8',errors='replace',env=dict(os.environ,PYTHONUTF8='1',PYTHONIOENCODING='utf-8')); o=r.stdout+r.stderr; known={'test_reports_integration.ExportWorkerTests.test_orphan_poison_pill_fails_after_max_attempts','test_reports_integration.ExportWorkerTests.test_orphan_recovery_by_heartbeat_not_age','test_company_warehouse_isolation.CompanyWarehouseIsolationTestCase.test_superuser_sees_all_warehouses_without_company_filter'}; bad=[t for t in re.findall(r'^(?:ERROR|FAIL): \S+ \(([^)]+)\)',o,re.M) if '.'.join(t.split('.')[-3:]) not in known]; ran=re.search(r'^Ran (\d+) test',o,re.M); print(o[-2500:]); print('ran',ran.group(1) if ran else None,'new failures:',bad); sys.exit(1 if bad or not ran else 0)"
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(scope): company scope in report builder and users Excel import"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. در فایل طرح Documents/Supervisor_Followups/implementation_plan_supervisor_followups.md بخش‌های `## ۲.`، `## ۴.` و `## ۷.` را کامل بخوان. قواعد `.agents/AGENTS.md` بخش ۳، ۵ و ۱۰ برقرارند. hash فعلی HEAD را یادداشت کن.

۲. کار این نشست، طبق `### ۲.۱.` و `### ۲.۲.`:
- تابع کمکی مشترک «کاربران قابل‌مشاهده برای این کاربر» در core/accounts، با همان قاعدهٔ امروز UserViewSet.get_queryset (کاربران شرکت‌های مجاز به‌علاوهٔ خود کاربر، حذف سوپریوزرها برای غیرسوپریوزر، distinct). UserViewSet.get_queryset هم از همین تابع استفاده کند و رفتارش عوض نشود.
- موتور گزارش (core/platform_core/query_engine/engine.py): قلاب اختیاری scope_resolver(qs, user) در EntityConfig (نام دقیقاً همین)، و در صورت نیاز scope_kind='company' با فیلتر {scope_path}__in روی شناسه‌های get_user_allowed_companies(user). سوپریوزر بی‌محدودیت؛ کاربر بی‌شرکت نتیجهٔ خالی. مسیر run و export هر دو از همین دامنه بگذرند.
- چهار موجودیت personnel_profiles، monthly_payrolls، fleet_trips (در modules/accounting/personnel/report_entities.py) و users (در core/reports/registry.py) دامنه بگیرند. resolverهای پرسنل و سفر در سمت ماژول تعریف شوند و قاعدهٔ موجود scope_personnel_queryset و VehicleTripViewSet.get_queryset را بازاستفاده کنند، نه رونوشت.
- ورود کاربران از Excel (core/accounts/excel_utils.py و UserViewSet.import_excel و download_template) و تابع‌های افزونهٔ انبار در modules/warehouse/warehouses/user_extension.py دقیقاً طبق `### ۲.۲.`: پارامترهای اختیاری actor=None و user=None، تشخیص تکرار از دو منبع، خطای ردیف فارسی در همان قالب موجود {'row','field','message'}، سنجش دوباره در زمان ثبت، و رکورد UserCompanyAccess با سطح workspace_full برای شرکت فعال سازنده. شرکت فعال در import_excel از request گرفته می‌شود و اگر پیش‌نمایش (dry-run) هم به آن نیاز دارد، با پارامتر اختیاری به parse_users_excel داده شود، تا خطای «بی‌شرکت فعال» در پیش‌نمایش و ثبت یکسان باشد.
- هسته به ماژول import مستقیم نگیرد؛ دامنهٔ انبار فقط از راه همان افزونهٔ موجود برود.
- هیچ مدل و مایگریشنی عوض نشود. فرانت دست نخورد، چون مودال ورود خطاهای ردیف را با همان قالب نشان می‌دهد.

۳. آزمون‌ها، طبق `### ۲.۳.`: فایل تازهٔ warehouse-backend/integration_tests/test_company_scope_reports_import.py با دو شرکت، یک کاربر غیرسوپریوزر در هر شرکت، یک کاربر بی‌شرکت و یک سوپریوزر. هر بند زیر یک متد آزمون جدا است (دست‌کم ۱۳ متد):
- run برای personnel_profiles: کاربر شرکت الف فقط ردیف‌های الف، سوپریوزر هر دو، کاربر بی‌شرکت هیچ.
- همین برای monthly_payrolls.
- همین برای fleet_trips.
- همین برای users، به‌علاوهٔ پنهان بودن سوپریوزر برای غیرسوپریوزر.
- مسیر export همان دامنه را دارد.
- پیمایش همهٔ موجودیت‌های ثبت‌شده: هر کدام scope_path یا scope_resolver دارد یا در فهرست سفید «سراسری» با دلیل نوشته‌شده در خود آزمون است.
- ورود با update_existing=1 و ردیفی برای کاربر شرکت ب: خطای ردیف، و کاربر هدف پس از خواندن دوباره از دیتابیس دست‌نخورده.
- همین برای یک سوپریوزر.
- ورود با انبار شرکت ب: خطای ردیف.
- قالب دانلودی نام انبار شرکت ب را ندارد.
- ورود موفق کاربر مجاز در دامنهٔ خودش، و کاربر تازه رکورد UserCompanyAccess با workspace_full برای شرکت فعال سازنده دارد.
- غیرسوپریوزر بی‌شرکت فعال: خطای روشن فارسی و هیچ کاربری ساخته نمی‌شود.
- تکرار نام کاربری یا کد ملی کاربرِ بیرون از دامنه: خطای ردیف، بی IntegrityError و بی پاسخ ۵۰۰.
در پروفایل کامل هیچ آزمونی skip نشود. در پروفایل تک‌ماژول، اگر موجودیتی ثبت نیست، همان آزمون با skipTest و پیام روشن رد شود (مثل test_companies_cross_module.py).

۴. فرمان‌هایی که خودت می‌توانی اجرا کنی: حداکثر سه بار فقط فایل آزمون تازه، در پوشهٔ warehouse-backend با متغیرهای PYTHONUTF8=1 و PYTHONIOENCODING=utf-8: venv\Scripts\python.exe manage.py test integration_tests.test_company_scope_reports_import --noinput. هرگز manage.py test بی‌برچسب اجرا نکن.

۵. پایان:
- خودبازبینی با git diff --stat <پایه>.
- زیر `## گزارش پیشرفت` طرح، بند «نشست ۱» را بنویس: فهرست فایل‌ها، فهرست سفید موجودیت‌های سراسری با دلیل، و هر تصمیم یا انحراف. هیچ برچسب DONE یا FAILED ننویس.
- فقط فایل‌های خودت را stage کن و با این پیام commit کن، بدون push:
fix(scope): company scope in report builder and users Excel import

===

نشست 2 از 3 — پیگیری‌های ناظر: لانچر، سایدبار و پیوند سریع از نقطه‌های توسعه (فرانت)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,re,sys; app=pathlib.Path('warehouse-front/src/app'); tpl=pathlib.Path('scripts/module-template/frontend'); mt=(tpl/'module.ts').read_text(encoding='utf-8'); nv=(tpl/'nav-items.ts').read_text(encoding='utf-8'); lt=(app/'modules/common/components/layout/layout.ts').read_text(encoding='utf-8'); lh=(app/'modules/common/components/app-launcher/app-launcher.html').read_text(encoding='utf-8'); ol=(app/'modules/common/components/operations/operations-layout/operations-layout.ts').read_text(encoding='utf-8'); specs=['modules/common/components/app-launcher/app-launcher.dom.spec.ts','modules/common/components/layout/layout-modular.dom.spec.ts','modules/common/components/operations/operations-layout/operations-layout.dom.spec.ts']; p={'template layoutNav':'layoutNav' in mt,'template old navItems gone':not re.search(r'^\s*navItems\s*:',mt,re.M),'template ModuleNavItem':'ModuleNavItem' in nv and 'interface NavItem' not in nv,'switchTab hard-coded prefixes gone':not re.search(r'[\x22\x27]/app/(warehouse|finance)/[\x22\x27]\s*\+|\x60/app/(warehouse|finance)/\$\{',lt),'launcher extraCards':'extraCards()' in lh,'operations quickLink':'quickLink' in ol}; p.update({'fake module in '+s.split('/')[-1]:'/app/sample' in (app/s).read_text(encoding='utf-8') for s in specs}); bad=[k for k,v in p.items() if not v]; print(p); print('failed:',bad); sys.exit(1 if bad else 0)"
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
verify: python scripts/automation/verify_tools.py sample-module
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(modular): launcher, sidebar and quick link from module extensions"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. در فایل طرح Documents/Supervisor_Followups/implementation_plan_supervisor_followups.md بخش‌های `## ۳.` و `## ۴.` و بند «نشست ۱» زیر `## گزارش پیشرفت` را بخوان. قواعد `.agents/AGENTS.md` بخش ۳، ۵، ۷، ۹ و ۱۰ برقرارند. hash فعلی HEAD را یادداشت کن.

۲. کار این نشست، طبق `### ۳.۱.`، `### ۳.۲.` و `### ۳.۲-ب.` (بند `### ۳.۳.` مال نشست ۳ است و دست نخورد):
- لانچر (modules/common/components/app-launcher/): کاشی‌های غنی امروز دست‌نخورده؛ برای هر ماژول نصب‌شدهٔ دیگر کاشی عمومی با @for (card of extraCards(); track card.code). «دیگر» از روی خود کارت تعیین شود، نه با نام ماژول. نقشهٔ ثابت کلاس برای هر themeColor، توکن‌های معنایی، appIcon و قفل بی‌دسترسی مثل کاشی‌های موجود. visibleCardsCount، isSingleAppMode و gridContainerClass دقیقاً برابر تعداد کاشی‌های رندرشده.
- سایدبار (modules/common/components/layout/): مسیر هر آیتم از ماژول صاحبش (routePrefix به‌علاوهٔ شناسه، یا فیلد اختیاری route در ModuleNavItem). امضای switchTab(tabId: string) عوض نشود و پیشوندهای ثابت '/app/warehouse/' و '/app/finance/' از آن برداشته شوند. شناسه‌های مشترک (audit، health) از روی ماژول فعال حل شوند. همهٔ مسیرهای امروز انبار و مالی، از جمله ریدایرکت companies، عیناً بمانند. آیتم‌های ماژولی که showWarehouseSwitcher ندارد در بخشی جدا با عنوان «سامانه‌های دیگر» و فقط با مجوز آیتم دیده شوند.
- پیوند سریع (modules/common/components/operations/operations-layout/): operations.quickLink هر ماژول نصب‌شده در نوار کناری خوانده و نشان داده شود؛ پیوندهای امروز انبار و مالی بمانند.
- قالب ماژول (scripts/module-template/frontend/): module.ts یک extensions.layoutNav واقعی بگیرد و بلوک خوانده‌نشدهٔ navItems حذف شود؛ nav-items.ts نوع ModuleNavItem را از module-contract.ts بگیرد و interface NavItem جدا حذف شود. فیلد icon در قالب نام یک آیکون رجیستری باشد، نه emoji، اگر کاشی عمومی آن را با appIcon نشان می‌دهد.
- ظاهر و رفتار در پروفایل کامل (انبار و مالی) عوض نشود.

۳. آزمون‌ها، طبق `### ۳.۴.`: در app-launcher.dom.spec.ts، layout-modular.dom.spec.ts و operations-layout.dom.spec.ts با سه فهرست ماژول (کامل، فقط انبار، فقط مالی) و یک ماژول ساختگی سوم با code برابر 'sample' و routePrefix برابر '/app/sample':
- کاشی ماژول sample رندر می‌شود و تعداد کاشی‌های رندرشده با visibleCardsCount برابر است.
- آیتم سایدبار ماژول sample به '/app/sample/...' می‌رود.
- مسیرهای امروز انبار و مالی (از جمله audit و health در هر persona) عوض نمی‌شوند.
- پیوند سریع ماژول sample در operations-layout دیده می‌شود.

۴. فرمان‌هایی که خودت می‌توانی اجرا کنی: حداکثر دو بار npx ng build --output-path ../scratch/ng-build-agent، تست‌های DOM همین سه فایل با npx ng test --watch=false --include <فایل spec>، و یک بار python scripts/automation/verify_tools.py sample-module برای بازخورد.

۵. پایان:
- خودبازبینی با git diff --stat <پایه>. برای هر قالبی که حذف خالص بزرگ دارد، hunk را بخوان (AGENTS بخش ۵ بند ۷).
- زیر `## گزارش پیشرفت` طرح، بند «نشست ۲» را بنویس، همراه فهرست چک ۳۶۰px برای کاربر (موارد پشت ورود). هیچ برچسب DONE یا FAILED ننویس.
- فقط فایل‌های خودت را stage کن و با این پیام commit کن، بدون push:
feat(modular): launcher, sidebar and quick link from module extensions

===

نشست 3 از 3 — پیگیری‌های ناظر: جفت‌شدگی‌های سست (فرانت)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,re,sys; app=pathlib.Path('warehouse-front/src/app'); co=(app/'modules/common/components/operations/companies/companies.ts').read_text(encoding='utf-8'); um=(app/'shared/components/user-menu/user-menu.component.ts').read_text(encoding='utf-8'); ct=(app/'core/modules/module-contract.ts').read_text(encoding='utf-8'); gd=pathlib.Path('Documents/Modular_Middle_Path/guide_new_module.md').read_text(encoding='utf-8'); sp=(app/'modules/common/components/layout/layout-modular.dom.spec.ts').read_text(encoding='utf-8'); files=[q for q in app.rglob('*.ts') if q.name not in ('module.ts','module-contract.ts') and not q.name.endswith('.spec.ts')]; dead=[f for f in ('tableColumns','gdriveSupported','rolePresetCategories') if re.search(r'\b'+f+r'\??\s*:',ct) and not any(f in q.read_text(encoding='utf-8') for q in files)]; p={'companies providesTreasury':'providesTreasury' in co and 'providesTreasury' in ct,'companies tabs inference gone':not re.search(r'extension\.tabs\?*\.length',co),'user-menu fixed 15 gone':not re.search(r'\b15\s*\+',um),'contract fields declared but never read':not dead,'guide limitation note gone':'\u0645\u062d\u062f\u0648\u062f\u06cc\u062a \u0641\u0639\u0644\u06cc' not in gd,'archive link test':'company-documents' in sp}; bad=[k for k,v in p.items() if not v]; print(p,'dead:',dead); print('failed:',bad); sys.exit(1 if bad else 0)"
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
verify: python scripts/automation/verify_tools.py sample-module
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(modular): loose coupling cleanup in companies, user menu and archive link"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. در فایل طرح Documents/Supervisor_Followups/implementation_plan_supervisor_followups.md بخش‌های `## ۳.` و `## ۴.` و بندهای «نشست ۱» و «نشست ۲» زیر `## گزارش پیشرفت` را بخوان. قواعد `.agents/AGENTS.md` بخش ۳، ۵، ۷، ۹ و ۱۰ برقرارند. hash فعلی HEAD را یادداشت کن.

۲. کار این نشست، طبق `### ۳.۳.`:
- modules/common/components/operations/companies/companies.ts: isAccountingInstalled دیگر از «هر ماژولی که companies.tabs دارد» نتیجه گرفته نشود. پرچم صریح providesTreasury در بخش companies از ExtensionMap (module-contract.ts) تعریف شود، ماژول مالی در module.ts خود آن را true کند، و companies.ts فقط همین پرچم را بخواند. رفتار پروفایل کامل و فقط‌انبار عوض نشود.
- shared/components/user-menu/user-menu.component.ts: عدد ثابت 15 در شمارندهٔ «همه کلیدها» از روی خود داده شمرده شود.
- modules/common/components/layout/layout.html: پیوند «بایگانی اسناد شرکت‌ها» برای سوپریوزر فقط وقتی دیده شود که ماژول صاحب آن نصب است، از راه یک نقطهٔ توسعه، نه با نام ماژول.
- فیلدهای بی‌مصرف ExtensionMap (companies.tableColumns، companies.gdriveSupported، users.rolePresetCategories): هر کدام یا مصرف شود یا از قرارداد و از module.ts ماژول‌ها حذف شود. تصمیم و دلیل هر کدام را در گزارش بنویس.
- Documents/Modular_Middle_Path/guide_new_module.md: یادداشت «محدودیت فعلی» در `## ۳.` حذف شود و جدول نقطه‌ها با نقطه‌های نشست ۲ و این نشست به‌روز شود.

۳. آزمون‌ها: در layout-modular.dom.spec.ts پیوند بایگانی اسناد (company-documents) در نسخهٔ فقط‌انبار نیست و در نسخهٔ کامل برای سوپریوزر هست. برای پرچم providesTreasury و شمارندهٔ منوی کاربر هم تست DOM کوتاه در spec همان مؤلفه.

۴. فرمان‌هایی که خودت می‌توانی اجرا کنی: حداکثر دو بار npx ng build --output-path ../scratch/ng-build-agent، و تست‌های DOM همان specها با npx ng test --watch=false --include <فایل spec>.

۵. پایان:
- خودبازبینی با git diff --stat <پایه>. برای هر قالبی که حذف خالص بزرگ دارد، hunk را بخوان (AGENTS بخش ۵ بند ۷).
- زیر `## گزارش پیشرفت` طرح، بند «نشست ۳» را بنویس. هیچ برچسب DONE یا FAILED ننویس.
- فقط فایل‌های خودت را stage کن و با این پیام commit کن، بدون push:
refactor(modular): loose coupling cleanup in companies, user menu and archive link
