# چک‌لیست: راه میانهٔ ماژولار

<div dir="rtl" align="right">

مرجع: `implementation_plan_modular_middle_path.md` (همین پوشه). اجرا با صف `run_tasks.py` (Antigravity). `[DONE]` هر نشست را فقط runner در `tasks.md` می‌گذارد. این چک‌لیست را ناظر (Claude) پس از بازبینی هر گام تیک می‌زند.

- [ ] <!-- id: 0 --> **Claude، پیش از صف**
  - [ ] <!-- id: 1 --> کامیت جدا و بی‌تغییر `deploy.ps1` و `scripts/deploy/warehouse-deploy.sh`
  - [ ] <!-- id: 2 --> کامیت طرح، چک‌لیست، `tasks.md` و فرمان‌های تازهٔ `verify_tools.py` (`django-check`، `migrations-unchanged`، `migrate-empty`، `dist-free`، `guardian29-max`، `sample-module`، و تشخیص جابه‌جایی در `ng-test-compare`)

- [ ] <!-- id: 10 --> **نشست ۱ — گام ۰-الف: پوشه‌های بک‌اند**
  - [ ] <!-- id: 11 --> `git mv` به `core/`، `modules/warehouse/`، `modules/accounting/` (بدون `__init__.py` در `modules/`)
  - [ ] <!-- id: 12 --> `backend_paths.py` و فراخوانی در `config/__init__.py`، نگهبان ۲۹ و اسکریپت‌های فهرست‌شده
  - [ ] <!-- id: 13 --> اسکریپت‌های داخل اپ‌ها با مسیر نسبی `__file__`
  - [ ] <!-- id: 14 --> `pyproject.toml`، `.importlinter`، `Get-BackendWhitelist`، `Test-BundleStage`، `test_bundle.ps1`، `docker-compose.yml`
  - [ ] <!-- id: 15 --> `guard.py`، `safe-migration`، بازبین‌ها، `CLAUDE.md`، `.agents/AGENTS.md`
  - [ ] <!-- id: 16 --> ناظر: release روی `app` و پاسخ 200

- [ ] <!-- id: 20 --> **نشست ۲ — گام ۰-ب-۱: پوشه‌های مشترک فرانت**
  - [ ] <!-- id: 21 --> نگاشت قطعی پوشه‌ها و اسکریپت `scripts/refactor/move_front_components.mjs`
  - [ ] <!-- id: 22 --> جابه‌جایی پوشه‌های `common` و ادغام `platform-shell`
- [ ] <!-- id: 25 --> **نشست ۳ — گام ۰-ب-۲: پوشه‌های انبار و مالی**
  - [ ] <!-- id: 26 --> جابه‌جایی پوشه‌های `warehouse` و `accounting`
  - [ ] <!-- id: 27 --> مبنای نگهبان ۵۵، نگهبان‌های ۳۸ تا ۵۱ و `header_harmonization`، `dom-verify.js`، `tsconfig.*.spec.json`، مستندها
  - [ ] <!-- id: 28 --> حذف اسکریپت یک‌بارمصرف
  - [ ] <!-- id: 29 --> ناظر: صفحهٔ ورود روی 4300، release روی `app`

- [ ] <!-- id: 30 --> **نشست ۴ — گام ۱: بیلد و استقرار جدا**
  - [ ] <!-- id: 31 --> `tools/build-for-modules.js` و `npm run build:modules` (`WH_MODULES`، `--output-path`، `build-modules.txt`، مسیر خروجی برای `patch-ngsw-530.js`)
  - [ ] <!-- id: 32 --> `deploy.ps1`: `build:modules`، `MODULES=` در نشانگر، بررسی `build-modules.txt`، `-AddModule` با بیلد تازه
  - [ ] <!-- id: 33 --> فهرست ماژول‌های شناخته‌شده از روی پوشه‌ها در `deploy.ps1` و `warehouse-deploy.sh`
  - [ ] <!-- id: 34 --> ناظر: `test_integration.ps1`؛ استقرار روی `soft` فقط با تأیید جداگانهٔ کاربر

- [ ] <!-- id: 40 --> **نشست ۵ — گام ۲: حصارها**
  - [ ] <!-- id: 41 --> `.importlinter` هم‌تراز پوشه‌ها؛ ریشهٔ ترکیب صفر؛ ۳۱ یال غیرتولیدی؛ `integration_tests/`
  - [ ] <!-- id: 42 --> مبنای تازهٔ نگهبان ۲۹ (یک بار، با عددهای قبل و بعد)
  - [ ] <!-- id: 43 --> نگهبان ۵۷ با مبنای آچاری و `--self-test`

- [ ] <!-- id: 50 --> **نشست ۶ — گام ۳-الف: معرفی ماژول‌ها و ابزار هسته**
  - [ ] <!-- id: 51 --> `modules/<x>/module.py` و پویش در `module_catalog.py`
  - [ ] <!-- id: 52 --> `contribute`، `contributions`، `company_of`، `scope_deleted`
  - [ ] <!-- id: 53 --> یال‌های `warehouses/signals.py`، `personnel/models.py`، `personnel/views.py`، `accounts/serializers.py:449`
- [ ] <!-- id: 55 --> **نشست ۷ — گام ۳-ب: بقیهٔ یال‌های هسته**
  - [ ] <!-- id: 56 --> `user_extensions`، `rollback_models`، موجودیت‌های گزارش در ماژول‌ها
  - [ ] <!-- id: 57 --> نقض تولیدی صفر و به‌روزرسانی مبنای نگهبان ۲۹
  - [ ] <!-- id: 58 --> ناظر: `data-loss-reviewer`، `tenant-scope-reviewer`، release روی `app`

- [ ] <!-- id: 70 --> **نشست ۸ — گام ۴-الف: قرارداد فرانت و پوسته**
  - [ ] <!-- id: 71 --> `module-contract.ts`، `module.ts` دو ماژول، مولد و `installed-modules.ts`
  - [ ] <!-- id: 72 --> حذف stubها و پروفایل‌ها؛ اتصال `build-for-modules.js` به مولد
  - [ ] <!-- id: 73 --> پوسته (`layout`، `app-launcher`، `user-menu`) و تست‌های DOM با سه فهرست ماژول
- [ ] <!-- id: 75 --> **نشست ۹ — گام ۴-ب: نقطه‌های توسعه**
  - [ ] <!-- id: 76 --> تبدیل بقیهٔ ۲۴ فایل و تست DOM مرکز عملیات
  - [ ] <!-- id: 77 --> نگهبان ۵۷ سخت‌گیر (مبنا = ۰)
  - [ ] <!-- id: 78 --> ناظر: `ui-reviewer`، 4300، release روی `app`؛ اعلام موارد پشت ورود به کاربر

- [ ] <!-- id: 90 --> **نشست ۱۰ — گام ۵: ماژول‌های آینده**
  - [ ] <!-- id: 91 --> قالب `scripts/module-template/` و `scripts/new_module.py` (با `--root`)
  - [ ] <!-- id: 92 --> راهنمای `guide_new_module.md`

- [ ] <!-- id: 95 --> **Claude، پس از صف:** بازبینی نهایی کل صف، رفع یافته‌ها، به‌روزرسانی `CLAUDE.md` و حافظه، گزارش به کاربر

</div>
