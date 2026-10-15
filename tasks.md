<!--
راهنمای استفاده:
- هر تسک را می‌توانید به صورت چندخطی و با توضیحات کامل بنویسید.
- بین هر تسک از جداکننده سه مساوی یا بیشتر (===) در یک خط مجزا استفاده کنید.
- با دابل‌کلیک روی run_tasks.bat، تسک‌ها به صورت کاملاً ترتیبی و در نشست‌های مستقل اجرا خواهند شد.
-->

<!--
یادداشت ناظر (Claude) — تسک تک‌نشستی «دامنهٔ شرکت در actionهای سفارشی VehicleTripViewSet» (۲۴ مهر ۱۴۰۵):
- طرح: Documents/Supervisor_Followups/implementation_plan_supervisor_followups.md، بند «اقدام بعدی» آخرین ورودی `## گزارش پیشرفت`.
- صف قبلی (سه نشست پیگیری‌های ناظر) کامل [DONE] شده و در تاریخچهٔ git همین فایل هست (commit 4a47e18).
- یافته‌های ناظر روی HEAD (4a47e18)، همه بی‌دامنه: matrix، monthly-summary، monthly-grid (VehicleDriverProfile.objects و VehicleTripLog.objects خام)،
  bulk-save، update-day-trip، bulk-save-monthly-grid (خودرو با شناسهٔ خام)، audit-logs (VehicleTripAuditLog.objects.all())،
  export-monthly-excel و import-monthly-excel (موتور fleet_excel_engine.py همهٔ خودروها را می‌خواند).
- آزمون‌های پایه: «integration_tests personnel» روی HEAD؛ شناسهٔ خطاهای از پیش موجود در scratch/runner-cache/known_failures_trip_actions.txt.
  خط verify فقط همین‌ها را می‌پذیرد و هر شکست تازه را رد می‌کند.
- بازبین tenant-scope-reviewer و release روی app با ناظر است، نه با صف.
-->

[DONE] نشست 1 از 1 — دامنهٔ شرکت در actionهای سفارشی VehicleTripViewSet (بک‌اند)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import subprocess,sys; f=subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True,encoding='utf-8').stdout.split(); ok={'warehouse-backend/modules/accounting/personnel/views.py','warehouse-backend/modules/accounting/personnel/fleet_excel_engine.py','warehouse-backend/integration_tests/test_vehicle_trip_actions_scope.py','Documents/Supervisor_Followups/implementation_plan_supervisor_followups.md'}; bad=[x for x in f if x not in ok]; new='warehouse-backend/integration_tests/test_vehicle_trip_actions_scope.py' in f; print('files outside scope:',bad,'new test file in diff:',new); sys.exit(1 if bad or not new else 0)"
verify: python -c "import ast,sys; src=open('warehouse-backend/modules/accounting/personnel/views.py',encoding='utf-8').read(); t=ast.parse(src); c=[n for n in t.body if isinstance(n,ast.ClassDef) and n.name=='VehicleTripViewSet'][0]; m={n.name:ast.get_source_segment(src,n) for n in c.body if isinstance(n,ast.FunctionDef)}; g=lambda k:m.get(k,''); trips=['get_matrix','get_monthly_summary','get_monthly_grid','audit_logs','export_monthly_excel','get_queryset']; veh=['get_matrix','get_monthly_summary','get_monthly_grid','bulk_save','update_day_trip','bulk_save_monthly_grid','export_monthly_excel','import_monthly_excel']; p={'_scoped_vehicles uses scope_vehicle_queryset':'scope_vehicle_queryset(' in g('_scoped_vehicles'),'_scoped_trips exists':bool(g('_scoped_trips'))}; p.update({k+' uses _scoped_trips':'_scoped_trips(' in g(k) for k in trips}); p.update({k+' uses _scoped_vehicles':'_scoped_vehicles(' in g(k) for k in veh}); p.update({k+' no raw VehicleDriverProfile.objects':'VehicleDriverProfile.objects' not in g(k) for k in veh}); p['audit_logs no objects.all()']='VehicleTripAuditLog.objects.all()' not in g('audit_logs'); bad=[k for k,v in p.items() if not v]; print('failed:',bad); sys.exit(1 if bad else 0)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python -c "import os,re,subprocess,sys; py=os.path.abspath(r'warehouse-backend\venv\Scripts\python.exe'); r=subprocess.run([py,'manage.py','test','integration_tests.test_vehicle_trip_actions_scope','--noinput'],cwd='warehouse-backend',capture_output=True,text=True,encoding='utf-8',errors='replace',env=dict(os.environ,PYTHONUTF8='1',PYTHONIOENCODING='utf-8')); o=r.stdout+r.stderr; m=re.search(r'Ran (\d+) test',o); n=int(m.group(1)) if m else 0; sk='skipped=' in o; print(o[-3000:]); print('exit',r.returncode,'ran',n,'skipped',sk); sys.exit(0 if r.returncode==0 and n>=12 and not sk else 1)"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(scope): company scope in VehicleTripViewSet custom actions"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قواعد حیاتی:
- فقط این فایل‌ها را تغییر بده: warehouse-backend/modules/accounting/personnel/views.py، warehouse-backend/modules/accounting/personnel/fleet_excel_engine.py، فایل تازهٔ warehouse-backend/integration_tests/test_vehicle_trip_actions_scope.py و بند گزارش در فایل طرح. هیچ مدل، مایگریشن یا فایل فرانتی تغییر نکند.
- push نکن. فقط فایل‌های خودت را stage کن؛ tasks.md، run_tasks.py، run_tasks.bat و tasks_history.md را stage نکن.
- هرگز manage.py test بی‌برچسب اجرا نکن (روی دیتابیس واقعی انبارها را پاک می‌کند).
- هیچ رکورد سفر یا خودرویی حذف نشود. درخواست بیرون از دامنه فقط رد شود؛ داده‌ای پاک یا بازنویسی نشود.
- قواعد `.agents/AGENTS.md` بخش ۳، ۵ و ۱۰ برقرارند.

۲. زمینه، پیش از هر ویرایش بخوان:
- در فایل طرح Documents/Supervisor_Followups/implementation_plan_supervisor_followups.md بخش `## ۴.` و دو ورودی آخر زیر `## گزارش پیشرفت`.
- در warehouse-backend/modules/accounting/personnel/views.py: تابع scope_vehicle_queryset، کل کلاس VehicleTripViewSet (از class VehicleTripViewSet تا class MonthlyWorkPeriodViewSet)، و get_queryset در VehicleDriverProfileViewSet.
- warehouse-backend/modules/accounting/personnel/fleet_excel_engine.py: تابع‌های export_fleet_monthly_excel و import_fleet_monthly_excel.
- آزمون test_trips_endpoint_without_company_header_is_company_scoped و setUp کلاس در warehouse-backend/integration_tests/test_company_scope_reports_import.py، به‌عنوان الگوی ساخت داده.
- hash فعلی HEAD را یادداشت کن.

۳. تعریف‌ها:
- «خودروهای در دامنه»: scope_vehicle_queryset(self.request, VehicleDriverProfile.objects.all()). این همان قاعدهٔ صفحهٔ فهرست خودروهاست (بخش منتسب یا ثبت خودِ کاربر، و شرکت‌های مجاز؛ سوپریوزر و ممیز سراسری طبق همان تابع).
- «سفرهای در دامنه»: همان بخش شرکتی امروز get_queryset (از خط cid = validate_user_company_access تا پایان آن): با سربرگ شرکت، فقط همان شرکت؛ بی سربرگ و غیرسوپریوزر، شرکت‌های مجاز از get_user_allowed_companies؛ سوپریوزر بی‌محدودیت. مسیر شرکت سفر: section__project__company_id یا vehicle__section__project__company_id.
- «شرکت ب»: هر شرکتی که در دامنهٔ کاربر درخواست‌دهنده نیست.

۴. کار این نشست:
- دو متد کمکی در VehicleTripViewSet با همین نام‌ها بساز: _scoped_vehicles(self, qs=None) که خروجی‌اش «خودروهای در دامنه» است، و _scoped_trips(self, qs) که فقط بخش شرکتی را روی qs اعمال می‌کند. بخش شرکتی get_queryset به _scoped_trips منتقل شود و get_queryset آن را صدا بزند، بی هیچ تغییر رفتاری. رونوشت قاعده ممنوع است؛ هر دو متد قاعدهٔ موجود را بازاستفاده کنند.
- actionهای خواندنی matrix (get_matrix)، monthly-summary و monthly-grid: هر جا امروز VehicleDriverProfile.objects خام است، از _scoped_vehicles() شروع شود؛ هر جا VehicleTripLog.objects برای خواندن است، از self._scoped_trips(...) بگذرد. فیلترهای امروز (انبار، بخش، تاریخ، وضعیت) عیناً روی همان بمانند.
- audit-logs: فقط ممیزی سفرهای در دامنه، با فیلتر trip__in روی self._scoped_trips(VehicleTripLog.objects.all()). VehicleTripAuditLog.objects.all() بی‌فیلتر نماند.
- actionهای نوشتنی bulk-save، update-day-trip و bulk-save-monthly-grid: خودرو با شناسه فقط از _scoped_vehicles() پیدا شود. خودروی بیرون از دامنه دقیقاً مثل خودروی ناموجود امروز رفتار شود (همان پاسخ یا خطای ردیف موجود)، و برای آن هیچ سفری ساخته یا عوض نشود. section_id داده‌شده در درخواست، اگر به شرکتی بیرون از شرکت‌های مجاز کاربر تعلق دارد (برای غیرسوپریوزر)، پاسخ ۴۰۳ با پیام فارسی بدهد و هیچ نوشتنی انجام نشود.
- export-monthly-excel و import-monthly-excel: به export_fleet_monthly_excel و import_fleet_monthly_excel پارامتر اختیاری vehicles_qs=None بده (و برای export در صورت نیاز trips_qs=None). مقدار پیش‌فرض None باید رفتار امروز را عیناً نگه دارد، چون آزمون‌های test_attendance_fleet_audit.py بی این پارامترها صدا می‌زنند. ViewSet هر دو را با _scoped_vehicles() و _scoped_trips(...) صدا بزند. در import، ردیف خودروی بیرون از دامنه همان رفتار «خودرو پیدا نشد» امروز را بگیرد.
- پیام‌های اعلان (company_{cid}_notifications) و بقیهٔ منطق قفل دوره و ممیزی دست نخورد.
- بیرون از دامنه: viewsetهای دیگر، فرانت، و آزمون‌های خراب از پیش موجود personnel.

۵. آزمون‌ها: فایل تازهٔ warehouse-backend/integration_tests/test_vehicle_trip_actions_scope.py با دو شرکت (الف و ب)، در هر شرکت یک پروژه، یک بخش، یک خودرو و یک سفر با ممیزی؛ یک کاربر غیرسوپریوزر شرکت الف با UserCompanyAccess سطح workspace_full و انتساب فعال به بخش الف و مجوزهای لازم؛ یک کاربر بی‌شرکت؛ یک سوپریوزر. درخواست‌ها بی سربرگ شرکت، مگر جایی که گفته شده. هر بند یک متد جدا (دست‌کم ۱۲ متد):
- matrix: کاربر الف فقط خودرو و سفر الف را می‌بیند؛ سوپریوزر هر دو را.
- matrix با سربرگ شرکت ب برای کاربر الف: هیچ دادهٔ ب برنمی‌گردد (۴۰۳ یا نتیجهٔ بی ب).
- monthly-summary: کاربر الف هیچ دادهٔ ب نمی‌بیند.
- monthly-grid: کاربر الف هیچ دادهٔ ب نمی‌بیند.
- audit-logs: ممیزی سفر ب برای کاربر الف برنمی‌گردد و ممیزی سفر الف برمی‌گردد.
- bulk-save با خودروی ب توسط کاربر الف: پس از خواندن دوباره از دیتابیس، هیچ سفری برای خودروی ب ساخته یا عوض نشده است.
- update-day-trip با خودروی ب: پاسخ غیر ۲xx و سفر ب پس از خواندن دوباره دست‌نخورده.
- bulk-save-monthly-grid با خودروی ب: سفر ب دست‌نخورده و سفر تازه‌ای برای ب ساخته نشده.
- bulk-save با section_id بخش ب توسط کاربر الف: پاسخ ۴۰۳ و هیچ سفر تازه‌ای.
- export-monthly-excel توسط کاربر الف: پلاک خودروی ب در هیچ سلول کتاب‌کار (با openpyxl) نیست و پلاک الف هست.
- import-monthly-excel توسط کاربر الف با ردیفی برای پلاک ب: سفر ب ساخته یا عوض نمی‌شود.
- مسیر مثبت: bulk-save با خودروی الف توسط کاربر الف موفق است و سفر ساخته یا به‌روز می‌شود.
- کاربر بی‌شرکت: matrix هیچ خودرویی برنمی‌گرداند.
هیچ آزمونی در پروفایل کامل skip نشود. اگر personnel نصب نیست، با skipTest و پیام روشن رد شود (مثل همان فایل الگو).

۶. فرمان‌هایی که خودت می‌توانی اجرا کنی: حداکثر چهار بار فقط فایل آزمون تازه، در پوشهٔ warehouse-backend با متغیرهای PYTHONUTF8=1 و PYTHONIOENCODING=utf-8: venv\Scripts\python.exe manage.py test integration_tests.test_vehicle_trip_actions_scope --noinput. و یک بار: venv\Scripts\python.exe manage.py test personnel.test_attendance_fleet_audit --noinput. اگر فرمانی دو بار با یک خطا شکست، رویکرد را عوض کن، نه تکرار. فرمان را در پس‌زمینه رها نکن؛ پیش از پایان نوبت هر فرمانی باید تمام شده باشد.

۷. راستی‌آزمایی پیش از پایان:
- git diff --stat <پایه> فقط فایل‌های بند ۱ را نشان دهد.
- در diff ببین get_queryset همان رفتار را دارد و فقط _scoped_trips را صدا می‌زند.
- برای هر action بند ۴ یک بار بخوان که خودرو و سفر از دو متد کمکی می‌آیند.

۸. پایان:
- زیر `## گزارش پیشرفت` طرح یک بند تازه بنویس با عنوان «۲۴ مهر ۱۴۰۵ (2026-10-15)، Antigravity — دامنهٔ شرکت در actionهای سفارشی VehicleTripViewSet»، شامل جداگانه: علت ریشه‌ای، فهرست فایل‌های تغییریافته، رفتار هر action پس از تغییر، آزمون‌هایی که واقعاً اجرا شد با نتیجه، و ابهام‌های مانده. عدد ساختگی ننویس. هیچ برچسب DONE یا FAILED ننویس. محتوای بند داخل همان <div dir="rtl"> موجود بماند.
- فقط فایل‌های خودت را stage کن و با این پیام commit کن، بدون push:
fix(scope): company scope in VehicleTripViewSet custom actions
- پس از commit نوبت را تمام کن. پایان نوبت پیش از commit شکست است.

===

[DONE] نشست 2 از 2 — اصلاح یافته‌های بازبین: پروژه و سربرگ شرکت در actionهای نوشتنی VehicleTripViewSet (بک‌اند)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import subprocess,sys; f=subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True,encoding='utf-8').stdout.split(); ok={'warehouse-backend/modules/accounting/personnel/views.py','warehouse-backend/integration_tests/test_vehicle_trip_actions_scope.py','Documents/Supervisor_Followups/implementation_plan_supervisor_followups.md'}; bad=[x for x in f if x not in ok]; print('files outside scope:',bad,'files:',f); sys.exit(1 if bad or 'warehouse-backend/modules/accounting/personnel/views.py' not in f else 0)"
verify: python -c "import ast,sys; src=open('warehouse-backend/modules/accounting/personnel/views.py',encoding='utf-8').read(); t=ast.parse(src); c=[n for n in t.body if isinstance(n,ast.ClassDef) and n.name=='VehicleTripViewSet'][0]; m={n.name:ast.get_source_segment(src,n) for n in c.body if isinstance(n,ast.FunctionDef)}; h=m.get('_validate_write_target',''); p={'helper exists':bool(h),'helper reads header company':'get_request_company_id(' in h,'helper checks project':'Project' in h,'helper checks allowed companies':'get_user_allowed_companies(' in h}; p.update({k+' calls helper':'_validate_write_target(' in m.get(k,'') for k in ('bulk_save','update_day_trip','bulk_save_monthly_grid')}); p.update({k+' old inline section check gone':'ProjectSection.objects.filter(id=section_id)' not in m.get(k,'') for k in ('bulk_save','update_day_trip','bulk_save_monthly_grid')}); bad=[k for k,v in p.items() if not v]; print('failed:',bad); sys.exit(1 if bad else 0)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python -c "import os,re,subprocess,sys; py=os.path.abspath(r'warehouse-backend\venv\Scripts\python.exe'); r=subprocess.run([py,'manage.py','test','integration_tests.test_vehicle_trip_actions_scope','--noinput'],cwd='warehouse-backend',capture_output=True,text=True,encoding='utf-8',errors='replace',env=dict(os.environ,PYTHONUTF8='1',PYTHONIOENCODING='utf-8')); o=r.stdout+r.stderr; m=re.search(r'Ran (\d+) test',o); n=int(m.group(1)) if m else 0; sk='skipped=' in o; print(o[-3000:]); print('exit',r.returncode,'ran',n,'skipped',sk); sys.exit(0 if r.returncode==0 and n>=20 and not sk else 1)"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(scope): validate project and header company in trip write actions"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قواعد حیاتی:
- فقط این فایل‌ها را تغییر بده: warehouse-backend/modules/accounting/personnel/views.py، warehouse-backend/integration_tests/test_vehicle_trip_actions_scope.py و بند گزارش در فایل طرح. هیچ مدل، مایگریشن، فایل فرانت یا fleet_excel_engine.py تغییر نکند.
- push نکن. فقط فایل‌های خودت را stage کن؛ tasks.md، run_tasks.py، run_tasks.bat و tasks_history.md را stage نکن.
- هرگز manage.py test بی‌برچسب اجرا نکن.
- هیچ رکوردی حذف نشود. درخواست نامعتبر فقط رد شود و پیش از هر نوشتنی برگردد.
- قواعد `.agents/AGENTS.md` بخش ۳، ۵ و ۱۰ برقرارند.

۲. زمینه، پیش از هر ویرایش بخوان:
- آخرین ورودی Antigravity زیر `## گزارش پیشرفت` در Documents/Supervisor_Followups/implementation_plan_supervisor_followups.md (کار نشست قبل، commit d189c44).
- در views.py کلاس VehicleTripViewSet: متدهای _scoped_vehicles و _scoped_trips، و سه action نوشتنی bulk_save، update_day_trip و bulk_save_monthly_grid، به‌ویژه بلوک «if section_id and not request.user.is_superuser» و خواندن raw_proj و project_id در هر سه.
- تابع‌های get_request_company_id و validate_user_company_access در warehouse-backend/core/companies/access.py.
- فایل آزمون warehouse-backend/integration_tests/test_vehicle_trip_actions_scope.py.
- hash فعلی HEAD را یادداشت کن.

۳. یافته‌های تأییدشدهٔ بازبین که باید رفع شوند:
- (متوسط) project_id درخواست در هر سه action سنجیده نمی‌شود. کاربر شرکت الف با خودروی خودش و project_id پروژهٔ شرکت ب، سفر را در پروژهٔ ب ثبت می‌کند (trip_obj.project_id = effective_project_id و VehicleTripLog.objects.create(project_id=...)).
- (متوسط) سنجش section_id سربرگ شرکت را نادیده می‌گیرد. کاربر دارای دسترسی به الف و ب، با سربرگ شرکت الف و section_id بخش ب، سفر را در بخش ب ثبت می‌کند و فهرست سفرهای الف دیگر آن را نمی‌بیند.

۴. کار این نشست:
- یک متد کمکی در VehicleTripViewSet با همین نام بساز: _validate_write_target(self, request, section_id, project_id). خروجی: None اگر مجاز است، وگرنه یک Response. سه action نوشتنی، پس از خواندن section_id و project_id و پیش از هر نوشتن، آن را صدا بزنند و اگر Response برگشت همان را برگردانند. بلوک‌های تکراری فعلی سنجش بخش در هر سه action با این متد جایگزین شوند.
- قاعده‌های متد:
  - section_id یا project_id داده‌شده‌ای که در دیتابیس نیست: پاسخ ۴۰۰ با پیام فارسی.
  - شرکت هدف: برای بخش، section.project.company_id؛ برای پروژه، project.company_id (مدل Project).
  - اگر سربرگ شرکت آمده است (cid = validate_user_company_access(request.user, get_request_company_id(request)) مقدار دارد)، شرکت هدف بخش و پروژه باید برابر cid باشد؛ وگرنه ۴۰۳ با پیام فارسی. این قاعده برای سوپریوزر هم برقرار است.
  - بی سربرگ و غیرسوپریوزر: شرکت هدف باید در get_user_allowed_companies(request.user) باشد؛ وگرنه ۴۰۳. سوپریوزر بی سربرگ بی‌محدودیت است.
  - اگر هر دو داده شده‌اند، section.project_id باید برابر project_id باشد؛ وگرنه ۴۰۰ با پیام فارسی.
- رفتار مسیر مجاز امروز (خودرو، بخش و پروژهٔ شرکت خود کاربر، یا بی section_id و project_id) عیناً بماند.
- بیرون از دامنه: warehouse_id درخواست، viewsetهای دیگر، موتور Excel، فرانت.

۵. آزمون‌ها: به فایل warehouse-backend/integration_tests/test_vehicle_trip_actions_scope.py متدهای تازه اضافه کن؛ آزمون‌های موجود دست‌نخورده بمانند و همه پاس شوند. مجموع دست‌کم ۲۰ متد. هر بند یک متد جدا، و در هر بند ردشده، پس از خواندن دوباره از دیتابیس هیچ سفر تازه یا تغییری نباشد:
- update-day-trip با section_id بخش ب توسط کاربر الف: ۴۰۳.
- bulk-save-monthly-grid با section_id بخش ب توسط کاربر الف: ۴۰۳.
- bulk-save با خودروی الف و project_id پروژهٔ ب توسط کاربر الف: ۴۰۳.
- update-day-trip با project_id پروژهٔ ب: ۴۰۳.
- bulk-save-monthly-grid با project_id پروژهٔ ب: ۴۰۳.
- کاربر دارای دسترسی به الف و ب، با سربرگ شرکت الف و section_id بخش ب در bulk-save: ۴۰۳.
- bulk-save با section_id بخش الف و project_id پروژهٔ دیگری (ناهمخوان): ۴۰۰.
- مسیر مثبت: bulk-save با خودرو، بخش و پروژهٔ الف توسط کاربر الف موفق است و سفر با همان بخش و پروژه ذخیره می‌شود.

۶. فرمان‌هایی که خودت می‌توانی اجرا کنی: حداکثر چهار بار، در پوشهٔ warehouse-backend با PYTHONUTF8=1 و PYTHONIOENCODING=utf-8: venv\Scripts\python.exe manage.py test integration_tests.test_vehicle_trip_actions_scope --noinput. اگر فرمانی دو بار با یک خطا شکست، رویکرد را عوض کن. فرمان را در پس‌زمینه رها نکن.

۷. راستی‌آزمایی پیش از پایان:
- git diff --stat <پایه> فقط فایل‌های بند ۱ را نشان دهد.
- در diff ببین هر سه action متد کمکی را پیش از هر نوشتن صدا می‌زنند و بلوک‌های قدیمی سنجش بخش حذف شده‌اند.

۸. پایان:
- زیر `## گزارش پیشرفت` طرح یک بند تازه بنویس با عنوان «۲۴ مهر ۱۴۰۵ (2026-10-15)، Antigravity — اصلاح یافته‌های بازبین در actionهای نوشتنی سفر»، شامل جداگانه: هر یافته و رفع آن، فهرست فایل‌ها، آزمون‌هایی که واقعاً اجرا شد با نتیجه، و ابهام‌های مانده. عدد ساختگی ننویس. هیچ برچسب DONE یا FAILED ننویس. محتوا داخل همان <div dir="rtl"> موجود بماند.
- فقط فایل‌های خودت را stage کن و با این پیام commit کن، بدون push:
fix(scope): validate project and header company in trip write actions
- پس از commit نوبت را تمام کن. پایان نوبت پیش از commit شکست است.

===

[DONE] نشست 3 از 4 — دو آزمون حقوق شکستهٔ personnel.tests (مالیات Excel و دیسکت بیمه)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import subprocess,sys; f=subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True,encoding='utf-8').stdout.split(); ok={'warehouse-backend/modules/accounting/personnel/tests.py','warehouse-backend/modules/accounting/personnel/payroll_engine.py','warehouse-backend/modules/accounting/personnel/payroll_exports.py','warehouse-backend/modules/accounting/personnel/views.py','Documents/Supervisor_Followups/implementation_plan_supervisor_followups.md'}; bad=[x for x in f if x not in ok]; print('files outside scope:',bad); sys.exit(1 if bad or not f else 0)"
verify: python -c "import os,re,subprocess,sys; py=os.path.abspath(r'warehouse-backend\venv\Scripts\python.exe'); r=subprocess.run([py,'manage.py','test','personnel.tests','--noinput'],cwd='warehouse-backend',capture_output=True,text=True,encoding='utf-8',errors='replace',env=dict(os.environ,PYTHONUTF8='1',PYTHONIOENCODING='utf-8')); o=r.stdout+r.stderr; got=re.findall(r'^(?:ERROR|FAIL): \S+ \(([^)]+)\)',o,re.M); sk=re.search(r'skipped=(\d+)',o); s=int(sk.group(1)) if sk else 0; print(o[-2500:]); print('failures',got,'skipped',s); sys.exit(0 if r.returncode==0 and not got and s<=2 else 1)"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(personnel): fix payroll tax import and dsk export tests"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قواعد حیاتی:
- فقط warehouse-backend/modules/accounting/personnel/tests.py را تغییر بده، مگر اینکه علت یک باگ واقعی در کد حقوق باشد؛ آن‌وقت فقط فایل مربوط در همان پوشه (payroll_engine.py، payroll_exports.py یا views.py)، و بند گزارش در فایل طرح. هیچ مدل، مایگریشن یا فرانتی تغییر نکند.
- هیچ فایلی در Documents یا ریشهٔ مخزن ساخته یا عوض نشود، جز بند گزارش طرح.
- push نکن. فقط فایل‌های خودت را stage کن؛ tasks.md، run_tasks.py، run_tasks.bat و tasks_history.md را stage نکن.
- هرگز manage.py test بی‌برچسب اجرا نکن.
- قواعد `.agents/AGENTS.md` بخش ۳، ۵ و ۱۰ برقرارند.

۲. زمینه:
- Claude در commit 685d22e خطاهای import آزمون‌های personnel را رفع کرد. فقط این دو آزمون در personnel.tests.PersonnelAppTests هنوز شکست می‌خورند:
  - test_import_tax_excel_flow: AssertionError: 0 not greater than 0 روی res.data['matched_count']. فایل ورودی از فهرست possible_paths خوانده می‌شود (Documents/SalaryCalculation و ریشهٔ مخزن)، و کدملی پرسنل در آزمون 2450718214 گذاشته می‌شود.
  - test_monthly_payroll_calculation_and_exports_flow: AssertionError: 972 not greater than 1000 روی طول ZIP خروجی export-dsk-zip.
- تا پیش از commit f9e539b این دو آزمون به‌خاطر خطای import اصلاً اجرا نمی‌شدند، پس ممکن است انتظارشان از رفتارهای بعدی کهنه شده باشد.
- hash فعلی HEAD را یادداشت کن.

۳. کار این نشست:
- برای هر آزمون علت ریشه‌ای را پیدا کن: کدام فایل ورودی پیدا شد، آیا کدملی‌ها در آن فایل با پرسنل آزمون می‌خوانند، و ZIP دیسکت دقیقاً چه فایل‌ها و چند ردیف دارد.
- اگر انتظار آزمون کهنه است یا آزمون به فایل بیرونی ناپایدار وابسته است: آزمون را طوری درست کن که دادهٔ ورودی‌اش را خودش در حافظه بسازد (مثلاً کتاب‌کار openpyxl با همان ستون‌هایی که import-tax-excel می‌خواند و کدملی پرسنل آزمون)، و برای ZIP به‌جای طول خام، وجود DSKWOR00.DBF و DSKKAR00.DBF و ردیف پرسنل را بسنج. انتظار را سست نکن.
- اگر باگ واقعی در کد حقوق است: کمترین اصلاح را در همان فایل کد بده و در گزارش بنویس. اگر اصلاح امن نیست، آزمون را با @unittest.skip('باگ برنامه: <شرح کوتاه>') نشانه بگذار و در گزارش بنویس (حداکثر ۲ skip).

۴. فرمان‌هایی که خودت می‌توانی اجرا کنی، در پوشهٔ warehouse-backend با PYTHONUTF8=1 و PYTHONIOENCODING=utf-8: حداکثر پنج بار venv\Scripts\python.exe manage.py test personnel.tests.PersonnelAppTests --noinput. فرمان را در پس‌زمینه رها نکن. اگر فرمانی دو بار با یک خطا شکست، رویکرد را عوض کن.

۵. پایان:
- زیر `## گزارش پیشرفت` طرح یک بند تازه بنویس با عنوان «۲۴ مهر ۱۴۰۵ (2026-10-15)، Antigravity — دو آزمون حقوق personnel»، شامل جداگانه: علت ریشه‌ای هر آزمون، تغییرها، آیا باگ برنامه بود، و آزمون‌هایی که واقعاً اجرا شد با نتیجه. عدد ساختگی ننویس. هیچ برچسب DONE یا FAILED ننویس. محتوا داخل همان <div dir="rtl"> موجود بماند.
- فقط فایل‌های خودت را stage کن و با این پیام commit کن، بدون push:
test(personnel): fix payroll tax import and dsk export tests
- پس از commit نوبت را تمام کن. پایان نوبت پیش از commit شکست است.

===

[DONE] نشست 4 از 4 — سفرهای خودروی بی‌شرکت و بی‌بخش، و سنجش warehouse_id در actionهای نوشتنی سفر (بک‌اند)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import subprocess,sys; f=subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True,encoding='utf-8').stdout.split(); ok={'warehouse-backend/modules/accounting/personnel/views.py','warehouse-backend/modules/accounting/personnel/report_entities.py','warehouse-backend/integration_tests/test_vehicle_trip_actions_scope.py','Documents/Supervisor_Followups/implementation_plan_supervisor_followups.md'}; bad=[x for x in f if x not in ok]; print('files outside scope:',bad); sys.exit(1 if bad or 'warehouse-backend/modules/accounting/personnel/views.py' not in f else 0)"
verify: python -c "import ast,sys; src=open('warehouse-backend/modules/accounting/personnel/views.py',encoding='utf-8').read(); t=ast.parse(src); fn={n.name:ast.get_source_segment(src,n) for n in t.body if isinstance(n,ast.FunctionDef)}; c=[n for n in t.body if isinstance(n,ast.ClassDef) and n.name=='VehicleTripViewSet'][0]; m={n.name:ast.get_source_segment(src,n) for n in c.body if isinstance(n,ast.FunctionDef)}; s=fn.get('scope_trips_for_user',''); re_src=open('warehouse-backend/modules/accounting/personnel/report_entities.py',encoding='utf-8').read(); rt=ast.parse(re_src); r=[ast.get_source_segment(re_src,n) for n in rt.body if isinstance(n,ast.FunctionDef) and n.name=='resolve_fleet_trips_scope']; r=r[0] if r else ''; h=m.get('_validate_write_target',''); p={'shared function exists':bool(s),'covers vehicle company':'vehicle__company_id' in s,'covers trip project company':'project__company_id' in s,'covers creator orphan rule':'vehicle__created_by' in s,'_scoped_trips reuses it':'scope_trips_for_user(' in m.get('_scoped_trips',''),'report resolver reuses it':'scope_trips_for_user(' in r,'helper takes warehouse_id':'warehouse_id' in h.split(')')[0],'helper uses registry':'company_of(' in h or 'user_extensions' in h}; p.update({k+' passes warehouse_id':'_validate_write_target(' in m.get(k,'') and 'warehouse_id' in m.get(k,'').split('_validate_write_target(')[1].split(')')[0] for k in ('bulk_save','update_day_trip','bulk_save_monthly_grid','import_monthly_excel')}); bad=[k for k,v in p.items() if not v]; print('failed:',bad); sys.exit(1 if bad else 0)"
verify: python -c "import re,subprocess,sys; d=subprocess.run(['git','diff','{base}','HEAD','--','warehouse-backend/modules/accounting'],capture_output=True,text=True,encoding='utf-8').stdout; bad=re.findall(r'^\+\s*(?:from|import)\s+(?:warehouses|inventory)\b.*$',d,re.M); print('direct warehouse imports added:',bad); sys.exit(1 if bad else 0)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python -c "import os,re,subprocess,sys; py=os.path.abspath(r'warehouse-backend\venv\Scripts\python.exe'); r=subprocess.run([py,'manage.py','test','integration_tests.test_vehicle_trip_actions_scope','integration_tests.test_company_scope_reports_import','personnel.test_fleet_scenarios_10_vehicles','personnel.test_attendance_fleet_audit','--noinput'],cwd='warehouse-backend',capture_output=True,text=True,encoding='utf-8',errors='replace',env=dict(os.environ,PYTHONUTF8='1',PYTHONIOENCODING='utf-8')); o=r.stdout+r.stderr; m=re.search(r'Ran (\d+) test',o); n=int(m.group(1)) if m else 0; sk='skipped=' in o; print(o[-3000:]); print('exit',r.returncode,'ran',n,'skipped',sk); sys.exit(0 if r.returncode==0 and n>=60 and not sk else 1)"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(scope): orphan vehicle trips and warehouse check in trip writes"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قواعد حیاتی:
- فقط این فایل‌ها را تغییر بده: warehouse-backend/modules/accounting/personnel/views.py، warehouse-backend/modules/accounting/personnel/report_entities.py، warehouse-backend/integration_tests/test_vehicle_trip_actions_scope.py و بند گزارش در فایل طرح. هیچ مدل، مایگریشن یا فرانتی تغییر نکند.
- ماژول حسابداری هیچ import مستقیمی از warehouses یا inventory نگیرد. انبار فقط از راه رجیستری هسته: company_of('warehouse', id) و contributions('user_extensions') از platform_core.registry.
- هیچ رکوردی حذف یا بازنویسی نشود. سفرهای موجود فقط دیده‌شدنی‌تر می‌شوند؛ درخواست نامعتبر پیش از هر نوشتن رد می‌شود.
- push نکن. فقط فایل‌های خودت را stage کن؛ tasks.md، run_tasks.py، run_tasks.bat و tasks_history.md را stage نکن.
- هرگز manage.py test بی‌برچسب اجرا نکن.
- قواعد `.agents/AGENTS.md` بخش ۳، ۵ و ۱۰ برقرارند.

۲. زمینه، پیش از هر ویرایش بخوان:
- دو ورودی آخر Antigravity و آخرین ورودی Claude زیر `## گزارش پیشرفت` در Documents/Supervisor_Followups/implementation_plan_supervisor_followups.md.
- در views.py: تابع‌های scope_vehicle_queryset و scope_personnel_for_user (الگوی تابع مشترک)، و در VehicleTripViewSet متدهای _scoped_vehicles، _scoped_trips، _validate_write_target و actionهای bulk_save، update_day_trip، bulk_save_monthly_grid و import_monthly_excel.
- resolve_fleet_trips_scope در report_entities.py.
- company_of و contributions در warehouse-backend/core/platform_core/registry.py، و _get_scoped_warehouses_qs و get_all_warehouses در warehouse-backend/modules/warehouse/warehouses/user_extension.py (فقط خواندن؛ این فایل را تغییر نده).
- hash فعلی HEAD را یادداشت کن.

۳. تعریف‌ها:
- «خودروی یتیم»: VehicleDriverProfile با company خالی و section خالی. scope_vehicle_queryset آن را برای سازنده‌اش (created_by) نشان می‌دهد، ولی سفرهایش امروز از _scoped_trips دیده نمی‌شوند، چون مسیرهای شرکت سفر فقط section__project__company_id و vehicle__section__project__company_id است.
- «انبار در دامنه» برای غیرسوپریوزر: شناسه‌ای که در خروجی get_all_warehouses(user=request.user) افزونهٔ user_extensions هست (انبار شرکت‌های مجاز، یا انبار قدیمی بی‌شرکت که مستقیم به خود کاربر منتسب است).

۴. کار این نشست:
- (یتیم‌ها) تابع مشترک سطح ماژول scope_trips_for_user(user, qs, company_id=None) در views.py بساز، به سبک scope_personnel_for_user:
  - کاربر ناشناس: qs.none().
  - با company_id: فقط سفرهایی که یکی از این مسیرها برابر آن است: section__project__company_id، project__company_id، vehicle__company_id، vehicle__section__project__company_id.
  - بی company_id و سوپریوزر: بی‌محدودیت.
  - بی company_id و غیرسوپریوزر: یکی از همان چهار مسیر در شرکت‌های مجاز get_user_allowed_companies(user)، یا قاعدهٔ یتیم: vehicle__company__isnull=True و vehicle__section__isnull=True و vehicle__created_by=user (همان قاعدهٔ scope_vehicle_queryset). distinct اگر join چندمقداری تکرار می‌سازد.
  - _scoped_trips در VehicleTripViewSet همین تابع را با company_id حاصل از validate_user_company_access(request.user, get_request_company_id(request)) صدا بزند، و resolve_fleet_trips_scope در report_entities.py هم همین تابع را بازاستفاده کند (import از views.py یا جابه‌جایی تابع به فایل مشترکی که هر دو import کنند؛ رونوشت ممنوع است).
- (warehouse_id) امضای _validate_write_target را به _validate_write_target(self, request, section_id, project_id, warehouse_id=None) گسترش بده و در bulk_save، update_day_trip، bulk_save_monthly_grid و import_monthly_excel همان warehouse_id خوانده‌شده را به آن بده، پیش از هر نوشتن. قاعده‌ها:
  - اگر warehouse_id خالی است یا ماژول warehouse نصب نیست (is_module_installed('warehouse') از platform_core.registry): رفتار امروز، بی سنجش.
  - انبار ناموجود (company_of خالی و همچنین در هیچ‌جا پیدا نشود): ۴۰۰ با پیام فارسی. برای تشخیص وجود از contributions('validate_warehouse') هسته استفاده کن.
  - با سربرگ شرکت (cid): اگر انبار شرکت دارد و برابر cid نیست، ۴۰۳.
  - غیرسوپریوزر: انبار باید «انبار در دامنه» باشد؛ وگرنه ۴۰۳ با پیام فارسی.
  - سوپریوزر بی سربرگ: فقط سنجش وجود.
- actionهای خواندنی (matrix، monthly-grid، monthly-summary، export) را تغییر نده؛ دادهٔ آن‌ها از قبل با _scoped_vehicles و _scoped_trips محدود است.

۵. آزمون‌ها: به warehouse-backend/integration_tests/test_vehicle_trip_actions_scope.py متدهای تازه اضافه کن؛ آزمون‌های موجود دست‌نخورده بمانند و پاس شوند. هر بند یک متد جدا. آزمون‌های وابسته به انبار، اگر warehouses نصب نیست، با skipTest رد شوند:
- کاربر الف خودروی یتیم خودش را دارد و سفر آن را با bulk-save ثبت می‌کند؛ سفر در GET /api/personnel/trips/ و در monthly-grid برای همان کاربر دیده می‌شود.
- همان سفر یتیم برای کاربر دیگر شرکت الف (نه سازنده) و برای کاربر شرکت ب دیده نمی‌شود.
- سفری با خودروی دارای company شرکت الف و بی section برای کاربر الف دیده می‌شود و برای کاربر ب نه.
- گزارش fleet_trips (POST /api/reports/run/) برای سازندهٔ خودروی یتیم سفرش را برمی‌گرداند و برای کاربر ب نه.
- bulk-save با warehouse_id انبار شرکت ب توسط کاربر الف: ۴۰۳ و هیچ سفر تازه.
- update-day-trip با warehouse_id انبار شرکت ب: ۴۰۳.
- bulk-save-monthly-grid با warehouse_id انبار شرکت ب: ۴۰۳.
- import-monthly-excel با warehouse_id انبار شرکت ب: ۴۰۳.
- warehouse_id ناموجود در bulk-save: ۴۰۰.
- مسیر مثبت: bulk-save با warehouse_id انبار شرکت الف موفق است و سفر با همان warehouse_id ذخیره می‌شود.

۶. فرمان‌هایی که خودت می‌توانی اجرا کنی، در پوشهٔ warehouse-backend با PYTHONUTF8=1 و PYTHONIOENCODING=utf-8:
- حداکثر چهار بار: venv\Scripts\python.exe manage.py test integration_tests.test_vehicle_trip_actions_scope integration_tests.test_company_scope_reports_import --noinput.
- یک بار: venv\Scripts\python.exe manage.py test personnel.test_attendance_fleet_audit --noinput.
فرمان را در پس‌زمینه رها نکن. اگر فرمانی دو بار با یک خطا شکست، رویکرد را عوض کن.

۷. راستی‌آزمایی پیش از پایان:
- git diff --stat <پایه> فقط فایل‌های بند ۱ را نشان دهد.
- در diff ببین _scoped_trips و resolve_fleet_trips_scope هر دو scope_trips_for_user را صدا می‌زنند و هیچ رونوشتی از قاعده نمانده است.

۸. پایان:
- زیر `## گزارش پیشرفت` طرح یک بند تازه بنویس با عنوان «۲۴ مهر ۱۴۰۵ (2026-10-15)، Antigravity — سفرهای خودروی یتیم و سنجش warehouse_id»، شامل جداگانه: علت ریشه‌ای هر مورد، فهرست فایل‌ها، رفتار تازه، آزمون‌هایی که واقعاً اجرا شد با نتیجه، و ابهام‌های مانده. عدد ساختگی ننویس. هیچ برچسب DONE یا FAILED ننویس. محتوا داخل همان <div dir="rtl"> موجود بماند.
- فقط فایل‌های خودت را stage کن و با این پیام commit کن، بدون push:
fix(scope): orphan vehicle trips and warehouse check in trip writes
- پس از commit نوبت را تمام کن. پایان نوبت پیش از commit شکست است.
