// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { Reports } from './reports';
import { ReportStore } from './report-store';
import { ReportApiService } from '../../../../core/api/report-api.service';
import { WarehouseHttpService } from '../../api/warehouse-http.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { AuthStore } from '../../../../core/stores/auth.store';
import { EntityFieldsResponse, ReportFieldMeta } from '../../../../core/models/report.model';

describe('Reports Component & ReportStore (Vitest)', () => {
  let component: Reports;
  let store: ReportStore;
  let reportApiMock: any;
  let warehouseHttpMock: any;
  let toastMock: any;
  let confirmMock: any;
  let authStoreMock: any;
  let routerMock: any;
  let routeMock: any;

  const mockFields: ReportFieldMeta[] = [
    {
      key: 'id',
      label: 'شناسه',
      type: 'number',
      operators: ['eq', 'gt', 'lt'],
      choices: null,
      groupable: true,
      aggregatable: true,
      dynamic: false,
    },
    {
      key: 'code',
      label: 'کد کالا',
      type: 'text',
      operators: ['eq', 'icontains'],
      choices: null,
      groupable: true,
      aggregatable: false,
      dynamic: false,
    },
    {
      key: 'inventory',
      label: 'موجودی',
      type: 'number',
      operators: ['eq', 'gt', 'lt', 'between'],
      choices: null,
      groupable: true,
      aggregatable: true,
      dynamic: false,
    },
  ];

  const mockFieldsResponse: EntityFieldsResponse = {
    entity: 'items',
    label: 'کالاها',
    warehouse_required_for_dynamic: false,
    fields: mockFields,
    joins: [],
  };

  beforeEach(() => {
    reportApiMock = {
      getEntities: vi.fn().mockReturnValue(of([{ key: 'items', label: 'کالاها' }])),
      getFields: vi.fn().mockReturnValue(of(mockFieldsResponse)),
      getTemplates: vi.fn().mockReturnValue(of([])),
      getExportJobs: vi.fn().mockReturnValue(of([])),
      run: vi.fn().mockReturnValue(of({ rows: [], columns: [], count: 0, join_mode: 'flat' })),
      export: vi.fn().mockReturnValue(of({ kind: 'file', blob: new Blob() })),
    };

    warehouseHttpMock = {
      getAll: vi.fn().mockReturnValue(of([])),
    };

    toastMock = {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
    };

    confirmMock = {
      confirm: vi.fn(),
    };

    authStoreMock = {
      activeWarehouseId: signal<number | string | null>('ALL'),
      isAllWarehouses: signal(true),
      isWarehouseContext: signal(false),
      currentTab: signal('reports'),
    };

    routerMock = {
      navigate: vi.fn(),
    };

    routeMock = {
      snapshot: { queryParams: {} },
      queryParams: of({}),
    };

    const injector = Injector.create({
      providers: [
        { provide: ReportApiService, useValue: reportApiMock },
        { provide: WarehouseHttpService, useValue: warehouseHttpMock },
        { provide: ToastService, useValue: toastMock },
        { provide: ConfirmDialogService, useValue: confirmMock },
        { provide: AuthStore, useValue: authStoreMock },
        { provide: Router, useValue: routerMock },
        { provide: ActivatedRoute, useValue: routeMock },
        ReportStore,
      ],
    });

    runInInjectionContext(injector, () => {
      component = new Reports();
      store = component.store;
    });

    component.ngOnInit();
  });

  it('باید کامپوننت با موفقیت ایجاد شود و سرویس‌های لازم را فراخوانی کند', () => {
    expect(component).toBeTruthy();
    expect(reportApiMock.getEntities).toHaveBeenCalled();
    expect(reportApiMock.getExportJobs).toHaveBeenCalled();
  });

  describe('اعتبارسنجی نام مستعار SQL و برچسب‌های فارسی (Alias & Label Validation)', () => {
    it('باید فرمت نامعتبر شناسه SQL را به درستی تشخیص دهد', () => {
      expect(component.isRowAliasInvalidFormat('جمع کل')).toBe(true); // فارسی غیرمجاز
      expect(component.isRowAliasInvalidFormat('123abc')).toBe(true); // شروع با عدد غیرمجاز
      expect(component.isRowAliasInvalidFormat('total-inv')).toBe(true); // خط فاصله غیرمجاز
      expect(component.isRowAliasInvalidFormat('total_inv_1')).toBe(false); // مجاز
      expect(component.isRowAliasInvalidFormat('sum_inventory')).toBe(false); // مجاز
    });

    it('باید شناسه‌های مستعار تکراری بین سطرها را تشخیص دهد', () => {
      store.aggregations.set([
        { field: 'inventory', fn: 'sum', alias: 'total_qty' },
        { field: 'inventory', fn: 'avg', alias: 'total_qty' },
      ]);
      expect(component.isRowAliasConflict('total_qty', 0)).toBe(true);
      expect(component.isRowAliasConflict('total_qty', 1)).toBe(true);
      expect(component.isRowAliasConflict('other_alias', 0)).toBe(false);
    });

    it('باید عنوان فارسی دلخواه را در aliasLabel اولویت دهد', () => {
      store.aggregations.set([
        { field: 'inventory', fn: 'sum', alias: 'total_stock', label: 'مجموع کل موجودی انبار' },
      ]);
      expect(component.aliasLabel('total_stock')).toBe('مجموع کل موجودی انبار');
    });

    it('اگر عنوان دلخواه داده نشده باشد، باید عنوان خودکار ترکیبی تابع و فیلد را بازگرداند', () => {
      store.fieldsMeta.set(mockFields);
      store.aggregations.set([
        { field: 'inventory', fn: 'sum', alias: 'sum_inventory' },
      ]);
      expect(component.aliasLabel('sum_inventory')).toBe('جمع موجودی');
    });
  });

  describe('تله فوکوس و بستن مودال‌ها (Focus Trap & Accessibility)', () => {
    it('کلید Tab روی آخرین عنصر باید به اولین عنصر فوکوس بازگرداند', () => {
      const container = document.createElement('div');
      const btn1 = document.createElement('button');
      const btn2 = document.createElement('button');
      container.appendChild(btn1);
      container.appendChild(btn2);
      document.body.appendChild(container);
      btn2.focus();

      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: false, cancelable: true });
      const preventSpy = vi.spyOn(event, 'preventDefault');
      const focusSpy = vi.spyOn(btn1, 'focus');

      component.onDialogKeyDown(event, container);
      expect(preventSpy).toHaveBeenCalled();
      expect(focusSpy).toHaveBeenCalled();

      document.body.removeChild(container);
    });

    it('کلید Shift+Tab روی اولین عنصر باید به آخرین عنصر فوکوس بازگرداند', () => {
      const container = document.createElement('div');
      const btn1 = document.createElement('button');
      const btn2 = document.createElement('button');
      container.appendChild(btn1);
      container.appendChild(btn2);
      document.body.appendChild(container);
      btn1.focus();

      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true });
      const preventSpy = vi.spyOn(event, 'preventDefault');
      const focusSpy = vi.spyOn(btn2, 'focus');

      component.onDialogKeyDown(event, container);
      expect(preventSpy).toHaveBeenCalled();
      expect(focusSpy).toHaveBeenCalled();

      document.body.removeChild(container);
    });

    it('کلید Escape باید مودال ذخیره را ببندد و فوکوس را بازگرداند', () => {
      const closeSpy = vi.spyOn(component, 'closeSaveModal');
      component.isSaveModalOpen.set(true);
      component.handleEscape();
      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('قالب‌بندی مقادیر جدول خروجی (Cell Formatting)', () => {
    it('اعداد اعشاری را با ارقام و جداکننده هزارگان فارسی فرمت کند', () => {
      const formatted = component.formatCell(1234567.5, 'number');
      const expected = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 3 }).format(1234567.5);
      expect(formatted).toBe(expected);
      expect(component.formatCell(0, 'number')).toBe(new Intl.NumberFormat('fa-IR').format(0));
      expect(component.formatCell(null, 'number')).toBe('—');
    });

    it('مقادیر بولی را به بله/خیر فارسی تبدیل کند', () => {
      expect(component.formatCell(true, 'boolean')).toBe('بله');
      expect(component.formatCell(false, 'boolean')).toBe('خیر');
      expect(component.formatCell(null, 'boolean')).toBe('—');
    });
  });
});
