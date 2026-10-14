import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { SystemHealthService } from '../../../../../core/services/system-health.service';
import { SettingsService } from '../../../../../services/settings';
import { CompanyApiService } from '../../../../../core/api/company-api.service';
import { CompanyDocument } from '../../../../../core/models/company.model';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { downloadLocalDatabaseSnapshotFile } from '../../../../../core/services/offline-db';
import { ModuleRegistryService } from '../../../../../core/modules/module-registry.service';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';

import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';

@Component({
  selector: 'app-operations-cockpit',
  standalone: true,
  imports: [CommonModule, RouterLink, SvgIconDirective, ActionButtonComponent],
  templateUrl: './operations-cockpit.html',
  styleUrl: './operations-cockpit.css'
})
export class OperationsCockpitComponent implements OnInit {
  private router = inject(Router);
  public healthService = inject(SystemHealthService);
  private settingsService = inject(SettingsService);
  private companyApi = inject(CompanyApiService);
  private toast = inject(ToastService);
  private moduleRegistry = inject(ModuleRegistryService);

  /** بایگانی مدارک شرکت در حسابداری است؛ در نصب «فقط انبار» ویجت سررسید مدارک نمایش داده نمی‌شود */
  get isAccountingInstalled(): boolean {
    return this.moduleRegistry.isModuleInstalled('accounting');
  }

  get isWarehouseInstalled(): boolean {
    return this.moduleRegistry.isModuleInstalled('warehouse');
  }

  public isCreatingSnapshot = signal<boolean>(false);
  public snapshotCount = signal<number>(0);
  public lastSnapshotTime = signal<string>('نامشخص');
  public lastSnapshotSize = signal<string>('۰ مگابایت');

  // مدارک هلدینگ در آستانه انقضا یا منقضی شده
  public expiringDocs = signal<CompanyDocument[]>([]);
  public isLoadingExpiringDocs = signal<boolean>(false);

  ngOnInit(): void {
    this.loadSnapshotSummary();
    this.loadExpiringDocuments();
    this.healthService.runFullDiagnostic(false).catch(() => {});
  }

  public loadSnapshotSummary(): void {
    this.settingsService.getSnapshotSummary().subscribe({
      next: (summary: any) => {
        this.snapshotCount.set(summary.total_count || 0);
        this.lastSnapshotTime.set(summary.latest_created_at_jalali || 'ثبت‌نشده');
        this.lastSnapshotSize.set(summary.latest_file_size || '۰ مگابایت');
      },
      error: () => {
        // Fallback gracefully
      }
    });
  }

  public loadExpiringDocuments(): void {
    if (!this.isAccountingInstalled) return;
    this.isLoadingExpiringDocs.set(true);
    this.companyApi.getExpiringDocuments().subscribe({
      next: (res) => {
        this.isLoadingExpiringDocs.set(false);
        this.expiringDocs.set(res?.results || []);
      },
      error: () => {
        this.isLoadingExpiringDocs.set(false);
      }
    });
  }

  public createInstantSnapshot(): void {
    if (this.isCreatingSnapshot()) return;
    this.isCreatingSnapshot.set(true);
    this.settingsService.createSnapshot('اسنپ‌شات فوری از اتاق فرماندهی مرکز عملیات').subscribe({
      next: (res: any) => {
        this.isCreatingSnapshot.set(false);
        this.toast.success(res.message || 'اسنپ‌شات جدید در سرور با موفقیت ایجاد شد.');
        this.loadSnapshotSummary();
      },
      error: (err: any) => {
        this.isCreatingSnapshot.set(false);
        this.toast.error(err?.error?.error || 'خطا در ساخت اسنپ‌شات لحظه‌ای');
      }
    });
  }

  public async exportIndexedDB(): Promise<void> {
    try {
      const res = await downloadLocalDatabaseSnapshotFile();
      this.toast.success(`فایل پشتیبان محلی مرورگر (${res.fileName}) با موفقیت دانلود شد.`);
    } catch {
      this.toast.error('خطا در استخراج نسخه پشتیبان کلاینت');
    }
  }

  public navigateTo(path: string): void {
    this.router.navigate([path]);
  }
}
