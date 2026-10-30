/**
 * Video 6: daily & monthly attendance, period workflow & signed sheet upload (plan §4 row 6).
 * Seed: --purge, then --base --with-personnel.
 * demo_employee records daily attendance (showing auto-zero on leave/absent and toggle-off on re-click),
 * fills the monthly grid, and submits the period;
 * demo_supervisor inspects attendance, returns the period for revision with a reason, and after employee
 * resubmission approves it; demo_accountant reviews; demo_manager approves (period -> READY_TO_PAY);
 * demo_employee opens the printable timesheet modal, prints, and uploads the signed timesheet image.
 */
import type { Locator, Page } from '@playwright/test';
import captions from './06-attendance.captions.json';
import { expect, videoTest, type TrainingVideo } from '../helpers/video';

const test = videoTest(captions);

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function openMyTasks(tv: TrainingVideo, page: Page): Promise<void> {
  await page.goto('/app/my-tasks');
  await expect(page.getByRole('heading', { name: 'کارهای من' })).toBeVisible({ timeout: 30_000 });
}

function periodTaskCard(page: Page): Locator {
  return page.locator('div.rounded-2xl').filter({ hasText: 'مرحله:' }).first();
}

test('video 6: daily and monthly attendance, period approval workflow and signed timesheet', async ({ page, tv }) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto('/login');
      break;
    } catch {
      await page.waitForTimeout(2000);
    }
  }
  await expect(page.getByRole('button', { name: 'ورود به سامانه' })).toBeVisible();
  await tv.titleCard();

  // ─── ۱. کارمند: ثبت کارکرد روزانه، صفر شدن در مرخصی/غیبت، خاموش شدن با کلیک دوباره ───
  await tv.say('emp_open');
  await tv.loginAs('demo_employee');
  await tv.pickCompany();
  await tv.openMenu('کارکرد پرسنل', '/app/finance/employee-attendance');

  await expect(page.getByText('علی رضایی').filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });

  const leaveBtn = page.locator('#btn-status-LEAVE-0, #m-btn-status-LEAVE-0').filter({ visible: true }).first();
  const absentBtn = page.locator('#btn-status-ABSENT-0, #m-btn-status-ABSENT-0').filter({ visible: true }).first();
  const presentBtn = page.locator('#btn-status-PRESENT_10H-0, #m-btn-status-PRESENT_10H-0').filter({ visible: true }).first();
  const effInput = page.locator('#input-eff-0, #m-input-eff-0').filter({ visible: true }).first();
  const otInput = page.locator('#input-ot-0, #m-input-ot-0').filter({ visible: true }).first();

  await tv.say('leave_absent');
  await tv.act.click(leaveBtn);
  await expect(effInput).toHaveValue('0');
  await tv.act.click(absentBtn);
  await expect(effInput).toHaveValue('0');

  await tv.say('toggle_off');
  await tv.act.click(absentBtn);

  await tv.say('save_daily');
  await tv.act.click(presentBtn);
  await expect(effInput).toHaveValue('10');
  await tv.act.fill(otInput, '2');
  const saveDailyBtn = page.getByRole('button', { name: /ثبت کارکرد|به‌روزرسانی/ }).filter({ visible: true }).first();
  await tv.act.click(saveDailyBtn);
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();

  // ─── ۲. کارمند: تقویم ماهانه، ثبت بازه‌ای + مأموریت و ارسال دوره به سرپرست ───
  await tv.say('monthly_grid');
  await tv.act.click(page.getByRole('tab', { name: /ماهانه/ }));
  await expect(page.getByText('دوره باز')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('tr[id^="grid-row-"]').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);

  await tv.act.click(page.getByRole('button', { name: /اعمال کارکرد در بازه زمانی/ }));
  await expect(page.getByRole('heading', { name: 'اعمال کارکرد در بازه زمانی مشخص' })).toBeVisible({ timeout: 10_000 });
  await tv.act.click(page.getByRole('button', { name: 'اعمال در تقویم' }));
  await expect(page.getByRole('heading', { name: 'اعمال کارکرد در بازه زمانی مشخص' })).toBeHidden({ timeout: 10_000 });

  const saveMonthlyBtn = page.getByRole('button', { name: 'ذخیره ماهانه' }).filter({ visible: true }).first();
  await expect(saveMonthlyBtn).toBeEnabled({ timeout: 10_000 });
  await tv.act.click(saveMonthlyBtn);
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();

  await tv.say('emp_submit');
  await tv.act.click(page.getByRole('button', { name: 'ارسال به مالی' }));
  await tv.act.fill(page.getByPlaceholder('توضیحات درباره کارکرد این ماه...'), 'کارکرد ماهانه کارگاه اول تکمیل شد.');
  await tv.act.click(page.getByRole('button', { name: 'ارسال نهایی' }));
  await expect(page.getByText('در انتظار تأیید سرپرست')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();

  // ─── ۳. سرپرست: بازبینی در تأیید کارکرد و عودت دوره در کارهای من ───
  await tv.loginAs('demo_supervisor');
  await tv.pickCompany();
  await tv.openMenu('تأیید کارکرد', '/app/finance/supervisor-attendance');
  await expect(page.locator('app-command-center')).toBeVisible({ timeout: 30_000 });
  await tv.say('sup_review');

  await openMyTasks(tv, page);
  const supCard1 = periodTaskCard(page);
  await expect(supCard1).toBeVisible({ timeout: 30_000 });
  await tv.act.click(supCard1.getByRole('button', { name: 'عودت برای اصلاح' }));
  const reasonDialog = page.getByRole('dialog');
  await expect(reasonDialog).toBeVisible({ timeout: 30_000 });
  await tv.act.fill(reasonDialog.locator('textarea'), 'لطفاً اضافه‌کاری روز اول بازبینی شود.');
  await tv.act.click(reasonDialog.getByRole('button', { name: /عودت برای اصلاح|ثبت و ارسال/ }));
  await expect(reasonDialog).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();

  // ─── ۴. کارمند: مشاهدهٔ وضعیت «نیازمند اصلاح» و ارسال دوباره ───
  await tv.loginAs('demo_employee');
  await tv.pickCompany();
  await tv.openMenu('کارکرد پرسنل', '/app/finance/employee-attendance');
  await expect(page.getByText('علی رضایی').filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
  await tv.act.click(page.getByRole('tab', { name: /ماهانه/ }));
  await expect(page.locator('tr[id^="grid-row-"]').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('نیازمند اصلاح')).toBeVisible({ timeout: 30_000 });
  await tv.say('emp_resubmit');
  await tv.act.click(page.getByRole('button', { name: 'ارسال به مالی' }));
  await tv.act.fill(page.getByPlaceholder('توضیحات درباره کارکرد این ماه...'), 'اضافه‌کاری روز اول بررسی و اصلاح شد.');
  await tv.act.click(page.getByRole('button', { name: 'ارسال نهایی' }));
  await expect(page.getByText('در انتظار تأیید سرپرست')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();

  // ─── ۵. سرپرست: تأیید دوره ───
  await tv.loginAs('demo_supervisor');
  await tv.pickCompany();
  await openMyTasks(tv, page);
  await tv.say('sup_approve');
  await tv.act.click(periodTaskCard(page).getByRole('button', { name: 'تأیید' }));
  await expect(periodTaskCard(page)).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();

  // ─── ۶. حسابدار: بررسی دوره ───
  await tv.loginAs('demo_accountant');
  await tv.pickCompany();
  await openMyTasks(tv, page);
  await tv.say('acc_review');
  await tv.act.click(periodTaskCard(page).getByRole('button', { name: 'بررسی' }));
  await expect(periodTaskCard(page)).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();

  // ─── ۷. مدیر: تأیید نهایی دوره (READY_TO_PAY) ───
  await tv.loginAs('demo_manager');
  await tv.pickCompany();
  await openMyTasks(tv, page);
  await tv.say('mgr_approve');
  await tv.act.click(periodTaskCard(page).getByRole('button', { name: 'تأیید' }));
  await expect(periodTaskCard(page)).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();

  // ─── ۸. کارمند: مشاهدهٔ «آمادهٔ پرداخت»، چاپ شیت و بارگذاری برگهٔ امضاشده ───
  await tv.loginAs('demo_employee');
  await tv.pickCompany();
  await tv.openMenu('کارکرد پرسنل', '/app/finance/employee-attendance');
  await expect(page.getByText('علی رضایی').filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
  await tv.act.click(page.getByRole('tab', { name: /ماهانه/ }));
  await expect(page.locator('tr[id^="grid-row-"]').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('آمادهٔ پرداخت')).toBeVisible({ timeout: 30_000 });

  await page.evaluate(() => {
    window.print = () => {};
    window.open = () => null;
  });
  await tv.say('emp_print_sign');
  await tv.act.click(page.getByRole('button', { name: 'چاپ شیت' }));
  await expect(page.getByText('برگه رسمی کارکرد ماهانه پرسنل و ثبت اثر انگشت')).toBeVisible({ timeout: 30_000 });
  await tv.act.click(page.getByRole('button', { name: /ارسال به چاپگر/ }));

  const signedInput = page.locator('#signedTimesheetInput');
  await signedInput.setInputFiles({
    name: 'signed-timesheet.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(page.getByText('تصویر برگهٔ امضاشده ثبت شد')).toBeVisible({ timeout: 30_000 });
  await tv.act.click(page.locator('.no-print button[appAction="close"]'));
  await expect(page.locator('#printable-timesheet-area')).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();
  await tv.say('end');
});
