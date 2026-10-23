// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of, Subject, throwError } from 'rxjs';
import { CompanyGovernanceTabComponent } from './company-governance-tab';
import { CompanyApiService } from '../../../../../core/api/company-api.service';
import { CompanyStudioContextService } from '../../../../../core/services/company-studio-context.service';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('CompanyGovernanceTabComponent (تب «هیئت‌مدیره و امضا»، مشارکت حسابداری)', () => {
  let fixture: ComponentFixture<CompanyGovernanceTabComponent>;
  let component: CompanyGovernanceTabComponent;
  let context: CompanyStudioContextService;
  let mockCompanyApi: any;
  let mockToast: any;
  let mockWebSocket: any;

  beforeEach(async () => {
    mockCompanyApi = {
      matchesCompanyUrl: vi.fn().mockReturnValue(false),
      getBoardMembers: vi.fn().mockReturnValue(of([
        {
          id: 1,
          company: 1,
          first_name: 'رضا',
          last_name: 'پاینده',
          national_code: '0012345679',
          member_type: 'real',
          role: 'chairman',
          has_signature_right: true,
          signature_scope: 'امضای کلیه اسناد',
          term_start: '1403/01/01',
          term_expiry: '1405/01/01',
          is_active: true
        }
      ])),
      createBoardMember: vi.fn().mockImplementation(() => of({ id: 2, first_name: 'عضو', last_name: 'جدید', is_active: true })),
      updateBoardMember: vi.fn().mockImplementation((id: number) => of({ id, first_name: 'عضو', last_name: 'ویرایش', is_active: true })),
      deleteBoardMember: vi.fn().mockReturnValue(of(void 0))
    };
    mockToast = { show: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    mockWebSocket = { notifications$: new Subject<any>(), tabId: 'test-client-tab-id' };

    await TestBed.configureTestingModule({
      imports: [CompanyGovernanceTabComponent],
      providers: [
        CompanyStudioContextService,
        { provide: CompanyApiService, useValue: mockCompanyApi },
        { provide: ToastService, useValue: mockToast },
        { provide: WebSocketService, useValue: mockWebSocket },
        { provide: ConfirmDialogService, useValue: { open: vi.fn().mockResolvedValue(true) } }
      ]
    }).compileComponents();

    context = TestBed.inject(CompanyStudioContextService);
    fixture = TestBed.createComponent(CompanyGovernanceTabComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('companyId', 1);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('بارگذاری و context استودیو', () => {
    it('با companyId اعضا یک بار دریافت می‌شوند و شمارندهٔ تب در context می‌نشیند', () => {
      expect(mockCompanyApi.getBoardMembers).toHaveBeenCalledTimes(1);
      expect(mockCompanyApi.getBoardMembers).toHaveBeenCalledWith(1);
      expect(context.count('governance')).toBe(1);
    });

    it('شرکت تازه (بدون شناسه) درخواستی نمی‌زند و فرم افزودن باز نمی‌شود', () => {
      mockCompanyApi.getBoardMembers.mockClear();
      fixture.componentRef.setInput('companyId', null);
      fixture.detectChanges();
      expect(mockCompanyApi.getBoardMembers).not.toHaveBeenCalled();
      component.openNewBoardMemberForm();
      expect(component.showBoardMemberForm).toBe(false);
      expect(mockToast.warning).toHaveBeenCalled();
    });

    it('شکست دریافت حالت خطا با «تلاش دوباره» و نشان خطای تب دارد', () => {
      mockCompanyApi.getBoardMembers.mockReturnValueOnce(throwError(() => ({ status: 500 })));
      component.retry();
      fixture.detectChanges();
      expect(component.loadError).toBe(true);
      expect(context.hasError('governance')).toBe(true);
      expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('دریافت اعضای هیئت‌مدیره انجام نشد.');
    });

    it('فرم عضو باز در هشدار خروج استودیو (context.isDirty) حساب می‌شود', () => {
      expect(context.isDirty()).toBe(false);
      component.openNewBoardMemberForm();
      expect(context.isDirty()).toBe(true);
      component.cancelBoardMemberForm();
      expect(context.isDirty()).toBe(false);
    });

    it('وب‌سوکت عضو هیئت‌مدیرهٔ همین شرکت داده را تازه می‌کند و پیام همین تب (اکو) نادیده گرفته می‌شود', () => {
      mockCompanyApi.getBoardMembers.mockClear();
      mockWebSocket.notifications$.next({ type_str: 'org_structure_updated', entity_type: 'company_board_member', company_id: 1, client_tab_id: 'test-client-tab-id' });
      expect(mockCompanyApi.getBoardMembers).not.toHaveBeenCalled();
      mockWebSocket.notifications$.next({ type_str: 'org_structure_updated', entity_type: 'company_board_member', company_id: 1, client_tab_id: 'other' });
      expect(mockCompanyApi.getBoardMembers).toHaveBeenCalledWith(1);
    });
  });

  describe('مدیریت پویای اعضای هیئت‌مدیره، حق امضا و مدارک پیوست', () => {
    it('باید آمار کل ارکان، صاحبان حق امضا، رئیس و مدیرعامل را در DOM به درستی رندر کند', () => {
      const el: HTMLElement = fixture.nativeElement;
      expect(component.companyBoardMembers.length).toBe(1);

      expect(component.getSignersCount()).toBe(1);
      expect(component.getChairmanMember()?.first_name).toBe('رضا');

      const boardTable = el.querySelector('table');
      expect(boardTable).not.toBeNull();
      const rows = boardTable!.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).toContain('رضا پاینده');
      expect(rows[0].textContent).toContain('0012345679');
      expect(rows[0].textContent).toContain('رئیس هیئت‌مدیره');
      expect(rows[0].textContent).toContain('دارای حق امضا');
      expect(el.textContent).toContain('صاحبان حق امضا');
    });

    it('باید دکمه «افزودن عضو جدید» فرم ثبت را در DOM باز کند و امکان انصراف وجود داشته باشد', () => {
      expect(component.showBoardMemberForm).toBe(false);

      component.openNewBoardMemberForm();
      fixture.detectChanges();
      expect(component.showBoardMemberForm).toBe(true);

      component.cancelBoardMemberForm();
      fixture.detectChanges();
      expect(component.showBoardMemberForm).toBe(false);
    });

    it('باید ثبت عضو جدید هیئت‌مدیره همراه با حق امضا و تاریخ‌های تصدی جلالی در وب‌سرویس فراخوانی شود', () => {
      component.openNewBoardMemberForm();
      fixture.detectChanges();

      component.newBoardMember.first_name = 'علیرضا';
      component.newBoardMember.last_name = 'عالیشوندی';
      component.newBoardMember.national_code = '0012345679';
      component.newBoardMember.member_type = 'real';
      component.newBoardMember.role = 'managing_director';
      component.newBoardMember.has_signature_right = true;
      component.newBoardMember.signature_scope = 'امضای کلیه قراردادها منفرداً';

      component.isBoardTermStartDatePickerOpen = true;
      component.onBoardTermStartSelect('1403/01/01');
      expect(component.isBoardTermStartDatePickerOpen).toBe(false);
      expect(component.newBoardMember.term_start).toBe('1403/01/01');

      component.isBoardTermExpiryDatePickerOpen = true;
      component.onBoardTermExpirySelect('1405/01/01');
      expect(component.isBoardTermExpiryDatePickerOpen).toBe(false);
      expect(component.newBoardMember.term_expiry).toBe('1405/01/01');

      // تایپ مستقیم در کنترل تاریخ هم مدل را به‌روز می‌کند
      component.boardTermStartControl.setValue('1403/02/02');
      expect(component.newBoardMember.term_start).toBe('1403/02/02');

      component.saveBoardMember();
      expect(mockCompanyApi.createBoardMember).toHaveBeenCalled();
      const fd = mockCompanyApi.createBoardMember.mock.calls[0][0] as FormData;
      expect(fd.get('company')).toBe('1');
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('با موفقیت افزوده شد.'));
      expect(component.showBoardMemberForm).toBe(false);
    });

    it('کد ملی نامعتبر عضو ثبت نمی‌شود', () => {
      component.openNewBoardMemberForm();
      component.newBoardMember.first_name = 'علی';
      component.newBoardMember.last_name = 'رضایی';
      component.newBoardMember.national_code = '0012345678';
      component.saveBoardMember();
      expect(mockCompanyApi.createBoardMember).not.toHaveBeenCalled();
      expect(mockToast.warning).toHaveBeenCalledWith('کد ملی عضو هیئت‌مدیره با الگوریتم ثبت احوال همخوانی ندارد.');
    });

    it('باید ویرایش عضو هیئت‌مدیره فرم را با داده‌های عضو پر کرده و updateBoardMember را فراخوانی کند', () => {
      const member = component.companyBoardMembers[0];
      component.editBoardMember(member);
      fixture.detectChanges();

      expect(component.showBoardMemberForm).toBe(true);
      expect(component.isEditingBoardMember).toBe(true);
      expect(component.editingBoardMemberId).toBe(member.id);
      expect(component.newBoardMember.first_name).toBe('رضا');

      component.newBoardMember.role = 'managing_director_and_member';
      component.saveBoardMember();

      expect(mockCompanyApi.updateBoardMember).toHaveBeenCalledWith(member.id, expect.any(FormData));
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('با موفقیت ویرایش شد.'));
    });

    it('باید حذف عضو هیئت‌مدیره پس از تایید کاربر، وب‌سرویس deleteBoardMember را فراخوانی کند', async () => {
      const member = component.companyBoardMembers[0];
      await component.deleteBoardMember(member);

      expect(mockCompanyApi.deleteBoardMember).toHaveBeenCalledWith(member.id);
      expect(mockToast.success).toHaveBeenCalledWith('عضو هیئت‌مدیره با موفقیت حذف گردید.');
      expect(context.count('governance')).toBeUndefined();
    });

    it('افزودن عضو جدید هیئت‌مدیره باید بلافاصله در companyBoardMembers ظاهر شود بدون بستن صفحه', () => {
      const initialCount = component.companyBoardMembers.length;
      component.openNewBoardMemberForm();
      component.newBoardMember = {
        first_name: 'علی',
        last_name: 'اکبری',
        national_code: '0012345679',
        member_type: 'real',
        represented_legal_name: '',
        role: 'board_member',
        has_signature_right: false,
        signature_scope: '',
        term_start: '',
        term_expiry: '',
        is_active: true
      };

      mockCompanyApi.createBoardMember.mockReturnValue(of({
        id: 77,
        company: 1,
        first_name: 'علی',
        last_name: 'اکبری',
        national_code: '0012345679',
        role: 'board_member',
        is_active: true
      }));

      component.saveBoardMember();
      fixture.detectChanges();

      expect(component.companyBoardMembers.length).toBe(initialCount + 1);
      const added = component.companyBoardMembers.find(m => m.id === 77);
      expect(added).toBeDefined();
      expect(added?.first_name).toBe('علی');
      expect(added?.last_name).toBe('اکبری');
      expect(context.count('governance')).toBe(initialCount + 1);
    });
  });
});
