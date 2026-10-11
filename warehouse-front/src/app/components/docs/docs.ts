import { Component, OnInit, ChangeDetectorRef, OnDestroy, DoCheck } from '@angular/core';
import { HttpEventType } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { StateService } from '../../services/state.service';
import { ToastService } from '../../services/toast.service';
import { FileUploadComponent, HasPermissionDirective } from '../../shared';
import { ModalComponent } from '../../shared';
import { ItemApiService } from '../../core/api/item-api.service';
import { ImportService } from '../../core/services/import.service';
import { AuthService } from '../../core/auth/auth.service';
import { environment } from '../../../environments/environment';
import { isServerUnreachable } from '../../core/services/server-reachability';
import { SvgIconDirective } from '../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../shared/components/action-button/action-button.component';

@Component({
  selector: 'app-docs',
  standalone: true,
  imports: [CommonModule, FormsModule, FileUploadComponent, ModalComponent, HasPermissionDirective, SvgIconDirective, ActionButtonComponent],
  templateUrl: './docs.html',
  styleUrl: './docs.css'
})
export class Docs implements OnInit, OnDestroy, DoCheck {
  isDeleteModalOpen: boolean = false;
  deleteMode: 'all' | 'excel' = 'all';
  deleteCountdown: number = 3;
  private deleteInterval: any;
  existingTags: string[] = [];
  expandedSection: string | null = null;
  
  showRestrictedWarning: boolean = false;
  isWarningModalOpen: boolean = false;
  showEmptyTagWarning: boolean = false;
  
  showLeaveModal: boolean = false;
  private leavePromiseResolver: ((value: boolean) => void) | null = null;

  confirmLeave(): Promise<boolean> | boolean {
    if (this.importService.hasAnyActiveImport()) {
      this.showLeaveModal = true;
      return new Promise<boolean>((resolve) => {
        this.leavePromiseResolver = resolve;
      });
    }
    return true;
  }

  resolveLeave(choice: 'continue' | 'cancel' | 'stay') {
    if (!this.leavePromiseResolver) return;

    if (choice === 'continue') {
      this.leavePromiseResolver(true);
    } else if (choice === 'cancel') {
      this.importService.cancelProcess();
      this.leavePromiseResolver(true);
    } else if (choice === 'stay') {
      this.leavePromiseResolver(false);
    }

    this.showLeaveModal = false;
    this.leavePromiseResolver = null;
  }

  ALL_FIELDS: {id: string, name: string}[] = [];

  constructor(
    public state: StateService,
    private toast: ToastService,
    private itemApi: ItemApiService,
    public importService: ImportService,
    private cdr: ChangeDetectorRef,
    private auth: AuthService
  ) {}

  get hasWarehouse(): boolean {
    return !!this.state.appState.activeWarehouseId;
  }

  private stateSub?: Subscription;
  private fieldsSub?: Subscription;
  private lastCheckedWarehouseId: number | null = null;

  loadDynamicFields(warehouseId?: number) {
    if (this.fieldsSub) {
      this.fieldsSub.unsubscribe();
    }
    const NON_IMPORTABLE = new Set(['created_at', 'updated_at', 'created_by', 'modified_by', 'sync_id', 'is_deleted']);
    this.fieldsSub = this.itemApi.getExportColumns(warehouseId).subscribe({
      next: (cols) => {
        this.ALL_FIELDS = cols
          .filter(c => !NON_IMPORTABLE.has(c.key))
          .map(c => ({ id: c.key, name: c.label }));
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  ngOnInit() {
    this.lastCheckedWarehouseId = this.state.appState.activeWarehouseId || null;
    this.loadDynamicFields(this.state.appState.activeWarehouseId || undefined);
    
    const tagsSet = new Set<string>();
    try {
      const saved = localStorage.getItem('recent_import_tags');
      if (saved) {
        JSON.parse(saved).forEach((t: string) => {
          if (t && typeof t === 'string') tagsSet.add(t.trim());
        });
      }
    } catch {}
    const recent = this.state.appState.dispatchSettings?.recentTags || [];
    recent.forEach((t: string) => {
      if (t && typeof t === 'string') tagsSet.add(t.trim());
    });
    this.existingTags = Array.from(tagsSet).filter(Boolean);
    
    this.stateSub = this.importService.stateUpdated.subscribe(() => {
      this.cdr.detectChanges();
    });
  }

  ngDoCheck() {
    const currentWId = this.state.appState.activeWarehouseId;
    if (currentWId && currentWId !== this.lastCheckedWarehouseId) {
      this.lastCheckedWarehouseId = currentWId;
      this.importService.checkLatestImport(currentWId);
      this.loadDynamicFields(currentWId);
    }
  }

  ngOnDestroy() {
    if (this.deleteInterval) {
      clearInterval(this.deleteInterval);
    }
    if (this.fieldsSub) {
      this.fieldsSub.unsubscribe();
    }
    if (this.stateSub) {
      this.stateSub.unsubscribe();
    }
  }

  formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  handleFileDrop(file: File) {
    if (file) {
      this.importService.currentState.fileToUpload = file;
      this.toast.show('info', `فایل ${file.name} جهت پردازش آماده شد.`);
      
      this.importService.currentState.showErrorDetails = false;
      this.importService.currentState.foundFields = [];
      this.importService.currentState.missingFields = [];
      
      // Parse headers
      this.importService.currentState.isParsingHeaders = true;
      this.importService.currentState.uploadProgress = 0;
      this.cdr.detectChanges();
      
      const wId = this.state.appState.activeWarehouseId || undefined;
      this.itemApi.parseHeaders(file, wId).subscribe({
        next: (event: any) => {
          if (event.type === HttpEventType.UploadProgress) {
            this.importService.currentState.uploadProgress = Math.round(100 * event.loaded / event.total);
            this.cdr.detectChanges();
          } else if (event.type === HttpEventType.Response) {
            this.importService.currentState.isParsingHeaders = false;
            const res = event.body;
            if (res && res.status === 'success') {
              this.importService.currentState.foundFields = res.found_fields || [];
              this.importService.currentState.missingFields = res.missing_fields || [];
              
              if (res.has_restricted_fields && !res.is_superuser) {
                this.showRestrictedWarning = true;
              } else {
                this.showRestrictedWarning = false;
              }
            }
            this.cdr.detectChanges();
          }
        },
        error: (err) => {
          this.importService.currentState.isParsingHeaders = false;
          this.cdr.detectChanges();
          console.error('Error parsing headers', err);
          // اگر به سرور نرسیدیم (آفلاین/تونل قطع) مشکل از فایل نیست؛ پیام آفلاین
          // را interceptor سراسری نشان می‌دهد و توست قرمز گمراه‌کننده است.
          if (!isServerUnreachable(err?.status ?? 0)) {
            if (err?.status === 403) {
              const msg = err?.error?.error || 'شما مجوز دسترسی به این عملیات یا انبار را ندارید.';
              this.toast.show('error', msg);
            } else {
              const msg = err?.error?.error || 'خطا در خواندن فایل اکسل. لطفاً از معتبر بودن فایل اطمینان حاصل کنید.';
              this.toast.show('error', msg);
            }
          }
        }
      });
    }
  }

  removeFile() {
    this.importService.clearFile();
    this.expandedSection = null;
    this.showRestrictedWarning = false;
    this.isWarningModalOpen = false;
    this.cdr.detectChanges();
  }

  resetForm() {
    this.importService.resetForm();
    this.expandedSection = null;
    this.showRestrictedWarning = false;
    this.isWarningModalOpen = false;
    this.cdr.detectChanges();
  }

  downloadTemplate() {
    let wId: number | string | undefined = undefined;
    
    // Determine the active warehouse ID
    if (this.hasWarehouse) {
        wId = this.state.appState.activeWarehouseId;
    }

    this.itemApi.downloadTemplate(wId).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'Warehouse_Template.xlsx';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      },
      error: () => {
        this.toast.show('error', 'خطا در دریافت قالب نمونه.');
      }
    });
  }

  downloadLog() {
    const importId = this.importService.currentState.importId;
    if (!importId) {
      this.toast.show('error', 'شما هنوز هیچ فرآیندی را آغاز نکرده‌اید.');
      return;
    }
    
    // Check if the process was cancelled
    const isCancelled = this.importService.currentState.logs.some(l => l.type === 'err' && l.msg.includes('لغو شد'));
    if (isCancelled || this.importService.currentState.isCanceling) {
      this.toast.show('error', 'فرآیند لغو شده و هیچ لاگی وجود ندارد.');
      return;
    }

    this.itemApi.downloadImportLog(importId).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `import_log_${importId}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      },
      error: () => {
        this.toast.show('error', 'خطا در دریافت فایل لاگ یا فایل منقضی شده است.');
      }
    });
  }

  toggleErrorDetails() {
    this.importService.currentState.showErrorDetails = !this.importService.currentState.showErrorDetails;
  }

  toggleSection(section: string) {
    if (this.expandedSection === section) {
      this.expandedSection = null;
    } else {
      this.expandedSection = section;
    }
  }

  cancelProcess() {
    this.importService.cancelProcess();
  }

  clearLogs() {
    this.importService.clearLogs();
  }

  async simulateImportProcess() {
    if (this.importService.currentState.isSimulating || !this.importService.currentState.fileToUpload) {
      if (!this.importService.currentState.fileToUpload) {
        this.toast.show('error', 'لطفا ابتدا یک فایل انتخاب کنید.');
      }
      return;
    }

    if (!this.importService.currentState.foundFields.includes('fa_unic_code') && !this.importService.currentState.foundFields.includes('id')) {
      this.toast.show('error', 'خطا: هیچ‌کدام از ستون‌های کلیدی fa_unic_code یا id در فایل اکسل شما یافت نشد. پردازش امکان‌پذیر نیست.');
      return;
    }

    if (!this.hasWarehouse) {
      this.toast.show('error', 'لطفاً ابتدا یک انبار را انتخاب کنید.');
      return;
    }
    
    if (this.showRestrictedWarning) {
      this.isWarningModalOpen = true;
      return;
    }

    if (!this.importService.currentState.importTag || this.importService.currentState.importTag.trim() === '') {
      this.showEmptyTagWarning = true;
      return;
    }

    this.executeImport();
  }
  
  confirmEmptyTagImport() {
    this.showEmptyTagWarning = false;
    this.executeImport();
  }

  executeImport() {
    this.isWarningModalOpen = false;
    this.showRestrictedWarning = false;
    
    const tag = this.importService.currentState.importTag?.trim();
    if (tag && !this.existingTags.includes(tag)) {
      this.existingTags = [tag, ...this.existingTags].slice(0, 20);
      try {
        localStorage.setItem('recent_import_tags', JSON.stringify(this.existingTags));
      } catch {}
    }

    const warehouseId = this.state.appState.activeWarehouseId;
    if (warehouseId) {
      this.importService.simulateImportProcess(warehouseId);
      this.cdr.detectChanges();
    }
  }

  // ---- Delete Confirmation Logic ----
  
  openDeleteModal(mode: 'all' | 'excel') {
    if (mode === 'excel' && !this.importService.currentState.fileToUpload) {
      this.toast.show('error', 'هیچ فایلی برای حذف انتخاب نشده است.');
      return;
    }
    
    this.deleteMode = mode;
    this.deleteCountdown = 3;
    this.isDeleteModalOpen = true;
    
    if (this.deleteInterval) clearInterval(this.deleteInterval);
    this.deleteInterval = setInterval(() => {
      this.deleteCountdown--;
      if (this.deleteCountdown <= 0) {
        clearInterval(this.deleteInterval);
      }
      this.cdr.detectChanges();
    }, 1000);
  }

  closeDeleteModal() {
    this.isDeleteModalOpen = false;
    if (this.deleteInterval) clearInterval(this.deleteInterval);
  }

  confirmDelete() {
    if (this.deleteCountdown > 0) return;
    
    const wId = this.state.appState.activeWarehouseId;
    if (!wId) return;

    if (this.deleteMode === 'all') {
      this.importService.clearWarehouseData(wId);
      this.closeDeleteModal();
    } else if (this.deleteMode === 'excel') {
      const file = this.importService.currentState.fileToUpload;
      if (file) {
        this.itemApi.deleteFromExcel(file, wId).subscribe({
          next: (res) => {
            this.toast.show('success', res.msg || 'عملیات حذف با موفقیت انجام شد.');
            this.importService.currentState.logs.unshift({ time: new Date(), type: 'info', msg: `>> حذف رکوردهای بر اساس اکسل انجام شد: ${res.msg}` });
            this.importService.checkLatestImport(wId);
          },
          error: (err) => {
            this.toast.show('error', err.error?.error || 'خطا در حذف با اکسل.');
          }
        });
      }
      this.closeDeleteModal();
    }
  }
}

