import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { StateService } from '../../../../../core/services/state.service';
import { AuthService } from '../../../../../core/auth/auth.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../api/personnel-api.service';
import { PayrollYearlySettings, FinancialProject } from '../../../../../core/models/personnel.model';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { TabBarComponent, TabDef } from '../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../entity-icons';

@Component({
  selector: 'app-base-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SvgIconDirective, TabBarComponent, ActionButtonComponent],
  templateUrl: './base-settings.html',
  styleUrl: './base-settings.css'
})
export class BaseSettings implements OnInit, OnDestroy {
  readonly settingsTabs: TabDef[] = [
    { id: 'grades', label: 'جدول گروه‌های شغلی', shortLabel: 'گروه‌ها', icon: ACCOUNTING_ENTITY_ICONS.jobGrades },
    { id: 'labor', label: 'مزایای قانون کار', shortLabel: 'مزایا', icon: ACCOUNTING_ENTITY_ICONS.payroll },
    { id: 'attendance_window', label: 'بازه ویرایش تقویم', shortLabel: 'تقویم', icon: ACCOUNTING_ENTITY_ICONS.attendance },
    { id: 'dsk', label: 'اطلاعات کارگاه بیمه', shortLabel: 'بیمه', icon: ACCOUNTING_ENTITY_ICONS.insurance },
    { id: 'tax', label: 'سازمان مالیاتی', shortLabel: 'مالیات', icon: ACCOUNTING_ENTITY_ICONS.tax },
    { id: 'bank', label: 'تنظیمات بانک ملی', shortLabel: 'بانک', icon: ACCOUNTING_ENTITY_ICONS.bankAccounts },
  ];
  // 6 Dedicated Top Tabs:
  // 'grades' | 'labor' | 'attendance_window' | 'dsk' | 'tax' | 'bank'
  activeTab: 'grades' | 'labor' | 'attendance_window' | 'dsk' | 'tax' | 'bank' = 'grades';

  fiscalYear = '1405';
  availableYears: string[] = ['1405'];
  yearlySettings: PayrollYearlySettings | null = null;
  projects: FinancialProject[] = [];
  selectedProjectId: number | null = null;

  // نسخه‌های احکام در طول سال (شروع از فروردین یا اصلاحیه میانه سال)
  versions: any[] = [];
  selectedVersionId: number | null = null;

  // مودال ثبت نسخه جدید در میانه سال
  showCreateVersionModal = false;
  newVersionEffectiveFrom = '1405/07';
  newVersionTitle = 'اصلاحیه احکام و دستمزد نیمه دوم سال';
  isCreatingVersion = false;

  // مودال ایجاد سال مالی جدید
  showCreateYearModal = false;
  newFiscalYear = '';
  newYearSourceYear = '1405';
  isCreatingYear = false;

  isLoading = false;
  isSaving = false;
  isDirty = false;

  private querySub!: Subscription;

  constructor(
    public auth: AuthService,
    public state: StateService,
    private api: PersonnelApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showCreateVersionModal) this.closeCreateVersionModal();
    if (this.showCreateYearModal) this.closeCreateYearModal();
  }

  get canManageSettings(): boolean {
    const p = this.auth.userPermissions() || [];
    return p.includes('perm_sys_settings') || p.includes('admin_all') || !!this.auth.user()?.is_superuser;
  }

  get isCurrentSettingSpecificToProject(): boolean {
    return !!(this.selectedProjectId && this.yearlySettings?.project === this.selectedProjectId);
  }

  markDirty(): void {
    this.isDirty = true;
  }

  toToman(val: number | string | null | undefined): string {
    if (val === null || val === undefined || val === '') return '';
    const num = Number(val);
    if (isNaN(num) || num === 0) return '';
    const toman = Math.floor(num / 10);
    return new Intl.NumberFormat('fa-IR').format(toman) + ' تومان';
  }

  formatRial(val: number | string | null | undefined): string {
    if (val === null || val === undefined || val === '') return '۰ ریال';
    const num = Number(val);
    if (isNaN(num)) return '۰ ریال';
    return new Intl.NumberFormat('fa-IR').format(num) + ' ریال';
  }

  ngOnInit(): void {
    this.loadAvailableYears();

    // بارگذاری لیست پروژه‌ها جهت سلکتور دامنه تنظیمات
    this.api.getFinancialProjects().subscribe({
      next: (projs) => {
        this.projects = projs || [];
        this.cdr.detectChanges();
      }
    });

    this.querySub = this.route.queryParams.subscribe(params => {
      let shouldReload = false;

      if (params['tab']) {
        const t = params['tab'];
        if (['grades', 'labor', 'attendance_window', 'dsk', 'tax', 'bank'].includes(t)) {
          this.activeTab = t;
        } else if (t === 'payroll_settings') {
          this.activeTab = 'grades';
        } else if (t === 'calendar_attendance') {
          this.activeTab = 'attendance_window';
        } else if (t === 'system_settings') {
          this.activeTab = 'dsk';
        }
      }

      if (params['year'] && params['year'] !== this.fiscalYear) {
        this.fiscalYear = params['year'];
        shouldReload = true;
      }

      const rawPid = params['project_id'];
      let parsedPid: number | null = null;
      if (rawPid !== undefined && rawPid !== null && rawPid !== '' && rawPid !== 'null' && rawPid !== 'undefined') {
        const num = Number(rawPid);
        parsedPid = !isNaN(num) ? num : null;
      }
      if (parsedPid !== this.selectedProjectId) {
        this.selectedProjectId = parsedPid;
        shouldReload = true;
      }

      const rawVid = params['version_id'];
      let parsedVid: number | null = null;
      if (rawVid !== undefined && rawVid !== null && rawVid !== '' && rawVid !== 'null' && rawVid !== 'undefined') {
        const num = Number(rawVid);
        parsedVid = !isNaN(num) ? num : null;
      }
      if (parsedVid !== this.selectedVersionId) {
        this.selectedVersionId = parsedVid;
        shouldReload = true;
      }

      // فقط در صورتی که پارامترهای اصلی تغییر کرده باشند یا تنظیماتی در حافظه نباشد کوئری شبکه اجرا شود
      // تغییر صرف تب نباید دیتای ویرایش شده کاربر را از بین ببرد
      if (shouldReload || !this.yearlySettings) {
        this.loadVersionsAndSettings();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.querySub) {
      this.querySub.unsubscribe();
    }
  }

  onTabChange(tabId: string): void {
    if (tabId === 'grades' || tabId === 'labor' || tabId === 'attendance_window' || tabId === 'dsk' || tabId === 'tax' || tabId === 'bank') {
      this.setTab(tabId);
    }
  }

  setTab(tab: 'grades' | 'labor' | 'attendance_window' | 'dsk' | 'tax' | 'bank' | string): void {
    this.activeTab = tab as any;
    this.updateQueryParams();
  }

  onYearChange(year: any): void {
    if (year) {
      this.fiscalYear = String(year);
      this.selectedVersionId = null;
      this.updateQueryParams();
      this.loadVersionsAndSettings();
    }
  }

  onProjectChange(projId: any): void {
    const num = projId !== null && projId !== undefined && projId !== '' ? Number(projId) : null;
    this.selectedProjectId = num !== null && !isNaN(num) ? num : null;
    this.selectedVersionId = null;
    this.updateQueryParams();
    this.loadVersionsAndSettings();
  }

  onVersionChange(vId: any): void {
    const num = vId !== null && vId !== undefined && vId !== '' ? Number(vId) : null;
    this.selectedVersionId = num !== null && !isNaN(num) ? num : null;
    this.updateQueryParams();
    this.loadYearlySettings();
  }

  private updateQueryParams(): void {
    const qp: Record<string, any> = {
      tab: this.activeTab,
      year: this.fiscalYear
    };
    if (this.selectedProjectId !== null && this.selectedProjectId !== undefined) {
      qp['project_id'] = this.selectedProjectId;
    }
    if (this.selectedVersionId !== null && this.selectedVersionId !== undefined) {
      qp['version_id'] = this.selectedVersionId;
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: qp
    });
  }

  loadVersionsAndSettings(): void {
    this.isLoading = true;
    this.api.getSettingsVersions(this.fiscalYear, this.selectedProjectId).subscribe({
      next: (vers) => {
        this.versions = vers || [];
        if (this.selectedVersionId && !this.versions.some(v => v.id === this.selectedVersionId)) {
          this.selectedVersionId = null;
        }
        if (!this.selectedVersionId && this.versions.length > 0) {
          const activeV = this.versions.find(v => v.is_active) || this.versions[0];
          this.selectedVersionId = activeV.id;
        }
        this.loadYearlySettings();
      },
      error: () => {
        this.loadYearlySettings();
      }
    });
  }

  loadYearlySettings(): void {
    this.isLoading = true;
    let eff: string | null = null;
    if (this.selectedVersionId && this.versions.length > 0) {
      const match = this.versions.find(v => v.id === this.selectedVersionId);
      if (match?.effective_from) eff = match.effective_from;
    }

    this.api.getYearlySettings(this.fiscalYear, this.selectedProjectId, this.selectedVersionId, eff).subscribe({
      next: (res: any) => {
        this.yearlySettings = res;
        if (res && res.id && !this.selectedVersionId) {
          this.selectedVersionId = res.id;
        }
        this.isLoading = false;
        this.isDirty = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.toast.show('error', 'خطا در بارگذاری تنظیمات پایه');
        this.cdr.detectChanges();
      }
    });
  }

  openCreateVersionModal(): void {
    this.newVersionEffectiveFrom = `${this.fiscalYear}/07`;
    this.newVersionTitle = `اصلاحیه احکام و دستمزد نیمه دوم سال ${this.fiscalYear}`;
    this.showCreateVersionModal = true;
    this.cdr.detectChanges();
  }

  closeCreateVersionModal(): void {
    this.showCreateVersionModal = false;
    this.cdr.detectChanges();
  }

  submitCreateVersion(): void {
    const trimmed = (this.newVersionEffectiveFrom || '').trim();
    if (!trimmed || !/^\d{4}\/(0[1-9]|1[0-2])$/.test(trimmed)) {
      this.toast.show('warning', 'لطفاً فرمت معتبر سال و ماه شمسی (مثلاً 1405/07) را وارد نمایید.');
      return;
    }
    this.isCreatingVersion = true;
    this.api.createSettingsVersion({
      year: this.fiscalYear,
      effective_from: trimmed,
      version_title: this.newVersionTitle,
      project_id: this.selectedProjectId,
      source_setting_id: this.yearlySettings?.id
    }).subscribe({
      next: (created) => {
        this.isCreatingVersion = false;
        this.showCreateVersionModal = false;
        this.toast.show('success', `نسخه جدید احکام («${created.version_title || created.effective_from}») با موفقیت ثبت شد.`);
        this.selectedVersionId = created.id;
        this.isDirty = false;
        this.updateQueryParams();
        this.loadVersionsAndSettings();
      },
      error: (err) => {
        this.isCreatingVersion = false;
        this.toast.show('error', err?.error?.error || 'خطا در ثبت نسخه جدید احکام');
        this.cdr.detectChanges();
      }
    });
  }

  cloneForSelectedProject(): void {
    if (!this.selectedProjectId) return;
    this.isLoading = true;
    this.api.cloneSettingsForProject(this.selectedProjectId, this.fiscalYear).subscribe({
      next: (cloned) => {
        this.yearlySettings = cloned;
        this.selectedVersionId = cloned.id;
        this.isLoading = false;
        this.isDirty = false;
        this.toast.show('success', `تنظیمات اختصاصی برای پروژه «${cloned.project_name || ''}» با موفقیت ایجاد شد.`);
        this.loadVersionsAndSettings();
      },
      error: (err) => {
        this.isLoading = false;
        this.toast.show('error', err?.error?.error || 'خطا در کپی تنظیمات برای پروژه');
        this.cdr.detectChanges();
      }
    });
  }

  revertToGlobal(): void {
    if (!this.yearlySettings?.id || !this.selectedProjectId) return;
    if (!confirm(`آیا از حذف تنظیمات اختصاصی پروژه «${this.yearlySettings.project_name || 'جاری'}» و بازگشت به تنظیمات سراسری سازمان اطمینان دارید؟`)) {
      return;
    }
    this.isLoading = true;
    this.api.revertSettingsToGlobal(this.yearlySettings.id).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        this.toast.show('success', res?.message || 'تنظیمات اختصاصی پروژه حذف شد و به سراسری بازگشت.');
        this.isDirty = false;
        this.loadVersionsAndSettings();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.show('error', err?.error?.error || 'خطا در بازگشت به تنظیمات سراسری');
        this.cdr.detectChanges();
      }
    });
  }

  saveYearlySettings(): void {
    if (!this.yearlySettings) return;
    this.isSaving = true;

    // ثبت سال مالی انتخابی در آبجکت تنظیمات
    this.yearlySettings.fiscal_year = this.fiscalYear;

    // اگر کاربر در دامنه یک پروژه مشخص است و هنوز رکورد مستقل برای پروژه ایجاد نشده،
    // ابتدا نسخه پروژه را ایجاد و تغییرات کاربر را مستقیماً روی آن ذخیره می‌کنیم تا به وضعیت قبل بازنگردد.
    if (this.selectedProjectId && !this.isCurrentSettingSpecificToProject) {
      const modifiedSettings = JSON.parse(JSON.stringify(this.yearlySettings));
      this.api.cloneSettingsForProject(this.selectedProjectId, this.fiscalYear).subscribe({
        next: (cloned) => {
          const payload = {
            ...modifiedSettings,
            id: cloned.id,
            project: this.selectedProjectId,
            fiscal_year: this.fiscalYear
          };
          this.api.updateYearlySettings(this.fiscalYear, payload).subscribe({
            next: (res: any) => {
              this.isSaving = false;
              this.isDirty = false;
              this.yearlySettings = res?.settings || payload;
              this.selectedVersionId = cloned.id;
              this.toast.show('success', `تنظیمات اختصاصی پروژه با موفقیت ذخیره شد.`);
              this.updateQueryParams();
              this.loadVersionsAndSettings();
            },
            error: (err: any) => {
              this.isSaving = false;
              this.toast.show('error', err?.error?.error || 'خطا در ذخیره تنظیمات اختصاصی پروژه');
              this.cdr.detectChanges();
            }
          });
        },
        error: (err: any) => {
          this.isSaving = false;
          this.toast.show('error', err?.error?.error || 'خطا در ایجاد رکورد اختصاصی پروژه');
          this.cdr.detectChanges();
        }
      });
      return;
    }

    this.api.updateYearlySettings(this.fiscalYear, this.yearlySettings).subscribe({
      next: (res: any) => {
        this.isSaving = false;
        this.isDirty = false;
        if (res?.settings) {
          this.yearlySettings = res.settings;
        }
        this.toast.show('success', `تنظیمات نسخه «${this.yearlySettings?.version_title || this.yearlySettings?.effective_from || this.fiscalYear}» با موفقیت ذخیره شد.`);
        this.loadVersionsAndSettings();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.show('error', err?.error?.error || 'خطا در ذخیره تنظیمات پایه');
        this.cdr.detectChanges();
      }
    });
  }

  setAttendanceWindowPreset(pastDays: number, futureDays: number): void {
    if (!this.yearlySettings) return;
    this.yearlySettings.attendance_edit_past_days = pastDays;
    this.yearlySettings.attendance_edit_future_days = futureDays;
    this.markDirty();
    this.toast.show('info', `الگوی انتخابی: ${pastDays === -1 ? 'نامحدود' : pastDays} روز قبل، ${futureDays === -1 ? 'نامحدود' : futureDays} روز بعد`);
    this.cdr.detectChanges();
  }

  loadAvailableYears(targetYear?: string): void {
    if (targetYear && !this.availableYears.includes(targetYear)) {
      this.availableYears = [targetYear, ...this.availableYears];
      this.fiscalYear = targetYear;
    }
    this.api.getAvailableFiscalYears().subscribe({
      next: (res) => {
        if (res && res.years && res.years.length > 0) {
          const list = [...res.years];
          if (targetYear && !list.includes(targetYear)) {
            list.unshift(targetYear);
          }
          this.availableYears = list;
          if (targetYear && this.availableYears.includes(targetYear)) {
            this.fiscalYear = targetYear;
          } else if (!this.availableYears.includes(this.fiscalYear)) {
            this.fiscalYear = this.availableYears[0];
          }
        }
        this.cdr.detectChanges();
      },
      error: () => {
        if (!this.availableYears.includes('1405')) {
          this.availableYears = ['1405'];
        }
      }
    });
  }

  openCreateYearModal(): void {
    const currentNum = parseInt(this.fiscalYear, 10);
    this.newFiscalYear = !isNaN(currentNum) ? String(currentNum + 1) : '';
    this.newYearSourceYear = this.fiscalYear || (this.availableYears[0] || '1405');
    this.showCreateYearModal = true;
    this.cdr.detectChanges();
  }

  closeCreateYearModal(): void {
    this.showCreateYearModal = false;
    this.cdr.detectChanges();
  }

  submitCreateYear(): void {
    const trimmed = (this.newFiscalYear || '').trim();
    if (!trimmed || trimmed.length !== 4 || !/^\d{4}$/.test(trimmed)) {
      this.toast.show('warning', 'لطفاً یک سال مالی معتبر ۴ رقمی (مثلاً ۱۴۰۶) وارد کنید.');
      return;
    }
    if (this.availableYears.includes(trimmed)) {
      this.toast.show('warning', `سال مالی ${trimmed} قبلاً در سیستم ایجاد شده است.`);
      return;
    }
    this.isCreatingYear = true;
    this.api.createFiscalYear({
      year: trimmed,
      source_year: this.newYearSourceYear,
      project_id: this.selectedProjectId
    }).subscribe({
      next: (created) => {
        this.isCreatingYear = false;
        this.showCreateYearModal = false;
        this.toast.show('success', `سال مالی جدید (${trimmed}) با موفقیت ایجاد و فعال شد.`);
        this.availableYears = [trimmed, ...this.availableYears.filter(y => y !== trimmed)];
        this.fiscalYear = trimmed;
        this.selectedVersionId = created.id;
        this.isDirty = false;
        this.updateQueryParams();
        this.loadAvailableYears(trimmed);
        this.loadVersionsAndSettings();
      },
      error: (err) => {
        this.isCreatingYear = false;
        this.toast.show('error', err?.error?.error || 'خطا در ایجاد سال مالی جدید');
        this.cdr.detectChanges();
      }
    });
  }

  exportJobGradesCsv(): void {
    if (!this.yearlySettings?.job_grades || this.yearlySettings.job_grades.length === 0) {
      this.toast.show('warning', 'جدول گروه‌های شغلی برای استخراج خالی است.');
      return;
    }
    const headers = ['گروه شغلی', 'مزد روزانه پایه (ریال)', 'پایه سنواتی روزانه (ریال)', 'نرخ هر ساعت کارکرد (ریال)'];
    const rows = this.yearlySettings.job_grades.map(jg => [
      jg.grade_number,
      jg.daily_base_wage,
      jg.daily_seniority_bonus,
      Math.round(jg.daily_base_wage / (this.yearlySettings?.standard_daily_hours || 10))
    ]);
    const csvContent = '﻿' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `job_grades_${this.fiscalYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast.show('success', 'فایل اکسل/CSV جدول ۲۰ گروه شغلی دانلود شد.');
  }

  importJobGradesCsv(event: any): void {
    const file = event.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const text = e.target.result as string;
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length < 2) {
          this.toast.show('warning', 'فایل معتبری برای گروه‌های شغلی یافت نشد.');
          return;
        }
        let updatedCount = 0;
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(',').map(p => p.trim().replace(/"/g, ''));
          if (parts.length >= 2) {
            const gNum = Number(parts[0]);
            const wage = Number(parts[1]);
            const sen = parts[2] ? Number(parts[2]) : 0;
            if (!isNaN(gNum) && !isNaN(wage) && this.yearlySettings?.job_grades) {
              const item = this.yearlySettings.job_grades.find(j => j.grade_number === gNum);
              if (item) {
                item.daily_base_wage = wage;
                if (!isNaN(sen)) item.daily_seniority_bonus = sen;
                updatedCount++;
              }
            }
          }
        }
        if (updatedCount > 0) {
          this.markDirty();
          this.toast.show('success', `${updatedCount} گروه شغلی با موفقیت از فایل به‌روزرسانی شد. جهت ثبت دکمه ذخیره را بزنید.`);
          this.cdr.detectChanges();
        }
      } catch {
        this.toast.show('error', 'خطا در پردازش فایل اکسل/CSV');
      } finally {
        if (event.target) event.target.value = '';
      }
    };
    reader.readAsText(file, 'utf-8');
  }
}
