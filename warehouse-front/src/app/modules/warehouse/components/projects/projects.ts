import { Component, OnInit, OnDestroy, inject, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { StateService } from '../../../../services/state.service';
import { ToastService, ModalComponent, ConfirmDialogService, StatusBadgeComponent, HasPermissionDirective } from '../../../../shared';
import { SmartDeleteModalComponent } from '../../../../shared/components/smart-delete-modal/smart-delete-modal';
import { AuthStore } from '../../../../core/stores/auth.store';
import { WarehouseHttpService, Warehouse } from '../../../../core/http/warehouse-http.service';
import { AccountsHttpService, ImportResult } from '../../../../core/http/accounts-http.service';
import { ExcelImportModal } from '../../../../shared/components/excel-import-modal/excel-import-modal';
import { Observable, Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';

@Component({
  selector: 'app-projects',
  imports: [CommonModule, FormsModule, ModalComponent, HasPermissionDirective, ExcelImportModal, SmartDeleteModalComponent, SvgIconDirective, ActionButtonComponent],
  templateUrl: './projects.html',
  styleUrl: './projects.css'
})
export class Projects implements OnInit, OnDestroy {
  @ViewChild('addModal') addModal!: ModalComponent;
  addModalOpen = false;
  editModalOpen = false;

  searchQuery = '';
  searchSubject = new Subject<string>();
  private searchSub?: Subscription;
  statusFilter = 'all';
  openDropdownId: number | null = null;
  
  projects: Warehouse[] = [];

  // Color Palette Preset for Warehouses
  readonly colorPalette: string[] = [
    '#6366f1', '#4f46e5', '#3b82f6', '#0284c7', 
    '#0d9488', '#10b981', '#059669', '#16a34a',
    '#eab308', '#d97706', '#ea580c', '#e11d48',
    '#8b5cf6', '#9333ea', '#64748b', '#0f172a'
  ];

  // Excel Import/Export
  isExcelModalOpen = false;
  excelImportFn!: (file: File) => Observable<ImportResult>;
  excelTemplateFn!: () => void;
  
  isRefreshing = false;

  // Edit Model
  editingProject: any = null;

  // Delete Modal
  isDeleteModalOpen = false;
  entityToDelete: any = null;
  deleteImpactUrl = '';
  isDeleting = false;
  deleteErrorMessage = '';

  // Add Model
  newWh: Partial<Warehouse> = {
    code: '', name: '', project_name: '', type: '', location: '', gps_coordinates: '', phone_number: '',
    manager: null, is_active: true, capacity: null, parent_warehouse: null,
    description: '', operator_company: '', color: '#6366f1'
  };

  private whService = inject(WarehouseHttpService);
  private accountsService = inject(AccountsHttpService);

  constructor(
    public state: StateService,
    private toast: ToastService,
    private confirm: ConfirmDialogService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    public store: AuthStore
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      const q = params['q'] || '';
      if (q !== this.searchQuery) {
        this.searchQuery = q;
      }
      const status = params['status'] || 'all';
      if (status !== this.statusFilter) {
        this.statusFilter = status;
      }
      this.cdr.detectChanges();
    });

    this.searchSub = this.searchSubject.pipe(
      debounceTime(300)
    ).subscribe(q => {
      this.router.navigate([], { queryParams: { q: q ? q.trim() : null }, queryParamsHandling: 'merge', replaceUrl: true });
    });

    this.store.setWarehouseContext(false);
    this.loadWarehouses();
    this.loadUsers();
  }

  ngOnDestroy() {
    if (this.searchSub) {
      this.searchSub.unsubscribe();
    }
  }

  loadUsers() {
    if (!this.state.appState.users || this.state.appState.users.length === 0) {
      this.accountsService.getUsers().subscribe({
        next: (users: any) => {
          this.state.appState.users = users;
          this.cdr.detectChanges();
        },
        error: (err: any) => {
          console.error('Error loading users for warehouse managers:', err);
        }
      });
    }
  }

  onSearchChange(val: string) {
    this.searchSubject.next(val);
  }

  onStatusFilterChange(val: string) {
    this.statusFilter = val;
    this.router.navigate([], {
      queryParams: { status: val !== 'all' ? val : null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  loadWarehouses() {
    this.isRefreshing = true;
    this.whService.getAll().subscribe({
      next: (data) => {
        this.projects = data;
        this.state.appState.projects = data as any;
        this.store.sanitizeActiveWarehouse(data);
        this.state.appState.activeWarehouseId = this.store.activeWarehouseId() as any;
        setTimeout(() => {
          this.isRefreshing = false;
          this.cdr.detectChanges();
        }, 300);
      },
      error: () => {
        setTimeout(() => {
          this.isRefreshing = false;
          this.cdr.detectChanges();
        }, 300);
      }
    });
  }

  get activeProjectsCount(): number {
    return this.projects.filter(p => p.is_active).length;
  }

  getWarehouseInitials(p: Warehouse): string {
    if (p.code && p.code.trim()) {
      const code = p.code.trim();
      if (code.length <= 3) return code;
      return code.slice(-2);
    }
    if (p.name && p.name.trim()) {
      const words = p.name.trim().split(/\s+/);
      if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
      }
      return p.name.trim().slice(0, 2);
    }
    return String(p.id || '');
  }

  get filteredProjects() {
    const q = (this.searchQuery || '').trim().toLowerCase();
    return this.projects.filter((p) => {
      let matchSearch = true;
      if (q) {
        const pCode = (p.code || '').toLowerCase();
        const pName = (p.name || '').toLowerCase();
        const pLoc = (p.location || '').toLowerCase();
        const pType = (p.type || '').toLowerCase();
        const pOp = (p.operator_company || '').toLowerCase();
        const pDesc = (p.description || '').toLowerCase();

        let managerName = '';
        if (p.manager && this.state.appState.users) {
          const mgr = this.state.appState.users.find((u: any) => u.id === p.manager);
          if (mgr) {
            managerName = `${mgr.first_name || ''} ${mgr.last_name || ''} ${mgr.username || ''}`.toLowerCase();
          }
        }

        matchSearch = pName.includes(q) || pCode.includes(q) || pLoc.includes(q) ||
                      pType.includes(q) || pOp.includes(q) || pDesc.includes(q) ||
                      managerName.includes(q);
      }

      let matchStatus = true;
      if (this.statusFilter === 'active') matchStatus = p.is_active === true;
      if (this.statusFilter === 'inactive') matchStatus = p.is_active === false;

      return matchSearch && matchStatus;
    });
  }

  handleWarehouseSwitch(id: number) {
    this.store.setActiveWarehouse(id);
    this.state.appState.activeWarehouseId = id as any;
  }

  goToWarehouseWorkspace(id: number) {
    this.handleWarehouseSwitch(id);
    this.store.setWarehouseContext(true);
    const p = this.projects.find((x) => x.id === id);
    if (p) {
      this.toast.info(`شما وارد محیط انبار «${p.name}» شدید`);
    }
    
    if (this.store.isSwitchingWarehouse()) {
      const nextTab = this.store.lastWarehouseTab() || 'dashboard';
      this.store.setIsSwitchingWarehouse(false);
      this.router.navigate(['/' + nextTab]);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  toggleDropdown(event: Event, id: number) {
    event.stopPropagation();
    if (this.openDropdownId === id) this.openDropdownId = null;
    else this.openDropdownId = id;
    this.cdr.detectChanges();
  }

  closeDropdowns() {
    this.openDropdownId = null;
    this.cdr.detectChanges();
  }

  openDeleteModal(id: number) {
    this.closeDropdowns();
    const p = this.projects.find((proj) => proj.id === id);
    if (p) {
      this.entityToDelete = p;
      this.deleteImpactUrl = `/api/warehouses/${id}/delete_impact/`;
      this.isDeleteModalOpen = true;
      this.isDeleting = false;
      this.deleteErrorMessage = '';
    }
  }

  handleHardDelete() {
    if (!this.entityToDelete) return;
    this.isDeleting = true;
    this.deleteErrorMessage = '';
    this.whService.delete(this.entityToDelete.id).subscribe({
      next: () => {
        this.loadWarehouses();
        this.toast.show('success', `انبار ${this.entityToDelete.name} برای همیشه حذف شد.`);
        this.isDeleteModalOpen = false;
        this.entityToDelete = null;
        this.isDeleting = false;
      },
      error: (err) => {
        this.deleteErrorMessage = err.error?.error || err.error?.detail || (typeof err.error === 'string' ? err.error : 'متأسفانه این انبار به دلیل وابستگی اطلاعاتی قابل حذف فیزیکی نیست. لطفاً از گزینه بایگانی استفاده کنید.');
        this.isDeleting = false;
      }
    });
  }

  async restoreWarehouse(id: number) {
    this.closeDropdowns();
    const p = this.projects.find((proj) => proj.id === id);
    if (p) {
      const confirmed = await this.confirm.open({
        title: 'فعال‌سازی انبار',
        message: `آیا می‌خواهید انبار «${p.name}» را مجدداً فعال کنید؟`,
        confirmText: 'بله، فعال شود',
        type: 'info'
      });
      if (confirmed) {
        this.whService.toggleArchive(id).subscribe(() => {
           this.loadWarehouses();
           this.toast.show('success', `انبار «${p.name}» با موفقیت فعال شد.`);
        });
      }
    }
  }

  openEditModal(id: number) {
    this.closeDropdowns();
    const p = this.projects.find((proj) => proj.id === id);
    if (p) {
      this.editingProject = JSON.parse(JSON.stringify(p));
      if (!this.editingProject.color) this.editingProject.color = '#6366f1';
      this.editModalOpen = true;
    }
  }

  saveWarehouseEdit() {
    if (!this.editingProject.name || this.editingProject.name.trim() === '') {
      return this.toast.show('warning', 'وارد کردن نام انبار الزامی است');
    }

    const payload: any = { ...this.editingProject };
    if (!payload.code || String(payload.code).trim() === '') {
      payload.code = null;
    }

    this.whService.update(this.editingProject.id, payload).subscribe({
       next: () => {
         this.loadWarehouses();
         this.toast.show('success', 'تغییرات با موفقیت ذخیره شد.');
         this.editModalOpen = false;
       },
       error: (err) => {
         const msg = err.error?.code?.[0] || err.error?.name?.[0] || err.error?.detail || 'خطا در ذخیره تغییرات انبار';
         this.toast.show('error', msg);
       }
    });
  }

  openAddModal() {
    this.newWh = {
      code: '', name: '', project_name: '', type: '', location: '', gps_coordinates: '', phone_number: '',
      manager: null, is_active: true, capacity: null, parent_warehouse: null,
      description: '', operator_company: '', color: '#6366f1'
    };
    this.addModalOpen = true;
  }

  saveNewWarehouse() {
    if (!this.newWh.name || this.newWh.name.trim() === '') {
      return this.toast.show('warning', 'وارد کردن نام انبار الزامی است');
    }
    
    const payload: any = { ...this.newWh };
    if (!payload.code || payload.code.trim() === '') {
      payload.code = null;
    }

    this.whService.create(payload).subscribe({
      next: () => {
        this.loadWarehouses();
        this.toast.show('success', 'انبار جدید با موفقیت ایجاد شد');
        this.addModalOpen = false;
      },
      error: (err) => {
        const msg = err.error?.code?.[0] || err.error?.name?.[0] || err.error?.detail || 'خطا در ایجاد انبار جدید';
        this.toast.show('error', msg);
        console.error(err);
      }
    });
  }

  // ── Excel Import/Export ──────────────────────────────────────────
  private triggerDownloadBlob(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  exportWarehousesExcel() {
    this.whService.exportExcel().subscribe(blob => {
      this.triggerDownloadBlob(blob, 'warehouses_export.xlsx');
      this.toast.show('success', 'فایل اکسل انبارها با موفقیت دانلود شد.');
    });
  }

  openWarehouseImportModal() {
    this.excelImportFn = (file: File) => this.whService.importExcel(file);
    this.excelTemplateFn = () => this.downloadWarehouseTemplate();
    this.isExcelModalOpen = true;
    this.cdr.detectChanges();
  }

  downloadWarehouseTemplate() {
    this.whService.downloadTemplate().subscribe(blob => {
      this.triggerDownloadBlob(blob, 'warehouses_template.xlsx');
    });
  }

  onExcelImported(result: ImportResult) {
    if (result.success && result.summary.created > 0) {
      this.toast.show('success', `${result.summary.created} انبار با موفقیت ایجاد شد.`);
      this.loadWarehouses();
    }
  }

  closeExcelModal() {
    this.isExcelModalOpen = false;
    this.cdr.detectChanges();
  }
}
