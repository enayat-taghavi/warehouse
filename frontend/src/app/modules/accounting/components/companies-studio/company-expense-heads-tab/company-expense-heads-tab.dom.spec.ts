// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of, Subject, throwError } from 'rxjs';

import { CompanyExpenseHeadsTabComponent } from './company-expense-heads-tab';
import { TreasuryOrgApiService } from '../../../api/treasury-org-api.service';
import { CompanyStudioContextService } from '../../../../../core/services/company-studio-context.service';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ExpenseHead } from '../../../models/personnel.model';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('CompanyExpenseHeadsTabComponent (DOM specs - Release v1 step 3.4-c)', () => {
  let fixture: ComponentFixture<CompanyExpenseHeadsTabComponent>;
  let component: CompanyExpenseHeadsTabComponent;
  let context: CompanyStudioContextService;
  let mockApi: any;
  let mockToast: any;
  let mockWebSocket: any;
  let mockConfirm: any;

  const sampleRows: ExpenseHead[] = [
    { id: 1, company: 7, parent: null, code: '10', title: 'گروه عملیاتی', is_active: true },
    { id: 11, company: 7, parent: 1, code: '1001', title: 'تعمیرات', is_active: true }
  ];

  beforeEach(async () => {
    mockApi = {
      getExpenseHeads: vi.fn().mockReturnValue(of(sampleRows)),
      createExpenseHead: vi.fn().mockImplementation((data: any) => of({ id: 99, ...data })),
      updateExpenseHead: vi.fn().mockImplementation((id: number, data: any) => of({ id, ...data })),
      deleteExpenseHead: vi.fn().mockReturnValue(of(void 0)),
      seedDefaultExpenseHeads: vi.fn().mockReturnValue(of({ created: 10 }))
    };

    mockToast = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };

    mockWebSocket = {
      notifications$: new Subject<any>(),
      tabId: 't1'
    };

    mockConfirm = {
      open: vi.fn().mockResolvedValue(true)
    };

    await TestBed.configureTestingModule({
      imports: [CompanyExpenseHeadsTabComponent],
      providers: [
        CompanyStudioContextService,
        { provide: TreasuryOrgApiService, useValue: mockApi },
        { provide: ToastService, useValue: mockToast },
        { provide: WebSocketService, useValue: mockWebSocket },
        { provide: ConfirmDialogService, useValue: mockConfirm }
      ]
    }).compileComponents();

    context = TestBed.inject(CompanyStudioContextService);
    fixture = TestBed.createComponent(CompanyExpenseHeadsTabComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('a) tree render: the group title and the head title both appear in fixture.nativeElement.textContent', () => {
    fixture.componentRef.setInput('companyId', 7);
    fixture.detectChanges();

    expect(mockApi.getExpenseHeads).toHaveBeenCalledWith(7);
    expect(component.tree.length).toBe(1);
    expect(component.tree[0].group.title).toBe('گروه عملیاتی');
    expect(component.tree[0].heads.length).toBe(1);
    expect(component.tree[0].heads[0].title).toBe('تعمیرات');

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('گروه عملیاتی');
    expect(text).toContain('تعمیرات');
  });

  it('b) read level hides the write buttons (سرفصل تازه, ویرایش, حذف, ساخت فهرست پیشفرض)', () => {
    fixture.componentRef.setInput('companyId', 7);
    fixture.detectChanges();

    // در دسترسی کامل (null) دکمه‌های نوشتن در صفحه حضور دارند
    const buttonsBefore = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>);
    expect(buttonsBefore.some(b => b.textContent?.includes('سرفصل تازه'))).toBe(true);
    expect(buttonsBefore.some(b => b.textContent?.includes('ویرایش'))).toBe(true);
    expect(buttonsBefore.some(b => b.textContent?.includes('حذف'))).toBe(true);

    // اعمال سطح فقط خواندن
    context.sectionLevels.set({ expense_heads: 'read' });
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();

    expect(component.canWrite).toBe(false);
    const buttonsAfter = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>);
    expect(buttonsAfter.some(b => b.textContent?.includes('سرفصل تازه'))).toBe(false);
    expect(buttonsAfter.some(b => b.textContent?.includes('ویرایش'))).toBe(false);
    expect(buttonsAfter.some(b => b.textContent?.includes('حذف'))).toBe(false);

    // در فهرست خالی با سطح خواندن نیز دکمه ساخت فهرست پیش‌فرض پنهان است
    mockApi.getExpenseHeads.mockReturnValue(of([]));
    component.load(7);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();

    const emptyButtons = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>);
    expect(emptyButtons.some(b => b.textContent?.includes('پیش‌فرض') || b.textContent?.includes('پیشفرض'))).toBe(false);
  });

  it('c) delete 400 shows the server message via toast.error and the row stays', async () => {
    fixture.componentRef.setInput('companyId', 7);
    fixture.detectChanges();

    expect(component.heads.length).toBe(2);

    const serverErr = { status: 400, error: { detail: 'این گروه زیرمجموعه دارد.' } };
    mockApi.deleteExpenseHead.mockReturnValue(throwError(() => serverErr));

    await component.remove(sampleRows[0]);

    expect(mockConfirm.open).toHaveBeenCalled();
    expect(mockApi.deleteExpenseHead).toHaveBeenCalledWith(1);
    expect(mockToast.error).toHaveBeenCalledWith('این گروه زیرمجموعه دارد.');
    expect(component.heads.length).toBe(2);
    expect(component.heads.some(h => h.id === 1)).toBe(true);
  });

  it('d) empty list shows ساخت فهرست پیشفرض and the click calls seedDefaultExpenseHeads(7)', () => {
    mockApi.getExpenseHeads.mockReturnValue(of([]));
    fixture.componentRef.setInput('companyId', 7);
    fixture.detectChanges();

    expect(component.heads.length).toBe(0);
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>);
    const seedBtn = buttons.find(b => b.textContent?.includes('ساخت فهرست پیش‌فرض') || b.textContent?.includes('ساخت فهرست پیشفرض'));

    expect(seedBtn).toBeDefined();
    seedBtn!.click();

    expect(mockApi.seedDefaultExpenseHeads).toHaveBeenCalledWith(7);
  });
});
