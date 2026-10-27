// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { SupervisorPersonnelHubComponent } from './supervisor-personnel';
import { PersonnelChangeRequest, PersonnelProfile } from '../../../../models/personnel.model';

describe('SupervisorPersonnelHubComponent - Phase 8 Comprehensive Tests', () => {
  let component: SupervisorPersonnelHubComponent;
  let mockAuth: any;
  let mockState: any;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockRouter: any;
  let mockRoute: any;
  let mockCdr: any;
  let wsSubject: Subject<any>;

  const mockCrPersonnel: PersonnelChangeRequest = {
    id: 301,
    personnel: 50,
    personnel_name: 'رضا کمالی',
    personnel_national_code: '0071234567',
    status: 'pending_supervisor',
    status_display: 'در انتظار تایید سرپرست',
    proposed_changes: { daily_base_wage: 5000000, job_title: 'سرپرست خط' },
    previous_values: { daily_base_wage: 4000000, job_title: 'کارشناس فنی' },
    requested_by_name: 'کارمند انبار',
    created_at: '2026-09-25T11:00:00Z',
    updated_at: '2026-09-25T11:00:00Z'
  };

  const sampleProfile1: PersonnelProfile = {
    id: 101,
    first_name: 'احمد',
    last_name: 'قاسمی',
    national_code: '1234567890',
    phone_number: '09123456789',
    job_title: 'انباردار',
    job_code: '123456',
    contract_type: 'daily',
    daily_base_wage: 3500000,
    is_active: true,
    marital_status: 'single',
    children_count: 0,
    approval_status: 'pending_supervisor',
    bank_accounts: [
      { id: 1, bank_name: 'ملی', account_number: '0102030405', sheba_number: 'IR120170000000102030405001', is_primary: true }
    ],
    documents: [
      { id: 10, doc_type: 'national_card', doc_type_display: 'کارت ملی', file: 'http://example.com/id.jpg' }
    ]
  };

  const sampleProfile2: PersonnelProfile = {
    id: 102,
    first_name: 'مریم',
    last_name: 'محمدی',
    national_code: '0987654321',
    phone_number: '09129876543',
    job_title: 'کمک انباردار',
    job_code: '654321',
    contract_type: 'monthly',
    daily_base_wage: 3000000,
    is_active: true,
    marital_status: 'married',
    children_count: 1,
    approval_status: 'pending_supervisor'
  };

  beforeEach(() => {
    wsSubject = new Subject<any>();

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'supervisor_user' }),
      userPermissions: vi.fn().mockReturnValue(['perm_approve_personnel_supervisor'])
    };

    mockState = {
      activeWarehouse: vi.fn().mockReturnValue({ id: 1, name: 'انبار مرکزی' })
    };

    mockToast = {
      showSuccess: vi.fn(),
      showError: vi.fn(),
      showWarning: vi.fn()
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([
        { id: 10, name: 'کارگاه مرکزی', project_name: 'پروژه الف' }
      ])),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getPersonnelProfilesPage: vi.fn().mockReturnValue(of({ count: 2, next: null, previous: null, results: [sampleProfile1, sampleProfile2] })),
      getDailyAttendance: vi.fn().mockReturnValue(of([])),
      getPersonnelChangeRequestsPage: vi.fn().mockReturnValue(of({ count: 1, next: null, previous: null, results: [mockCrPersonnel] })),
      approvePersonnelSupervisor: vi.fn().mockReturnValue(of({ success: true })),
      patchDailyAttendance: vi.fn().mockReturnValue(of({ success: true })),
      approvePersonnelChangeRequestSupervisor: vi.fn().mockReturnValue(of({ success: true })),
      rejectPersonnel: vi.fn().mockReturnValue(of({ success: true })),
      requestPersonnelRevision: vi.fn().mockReturnValue(of({ success: true })),
      getPersonnelDeleteImpact: vi.fn().mockReturnValue(of({
        impact: [],
        total_affected: 0,
        history: { has_history: false, can_delete: true, reasons: [] },
        can_delete: true,
        has_history: false,
        reasons: []
      })),
      batchApprovePersonnel: vi.fn().mockReturnValue(of({
        results: [
          { id: 101, full_name: 'احمد قاسمی', success: true },
          { id: 102, full_name: 'مریم محمدی', success: true }
        ]
      })),
      getWorkflowAuditLogs: vi.fn().mockReturnValue(of([
        { id: 501, action: 'submit', action_display: 'ارسال جهت بررسی', actor_name: 'کارمند انبار', created_at: '2026-09-25T11:00:00Z' }
      ]))
    };

    mockWs = {
      notifications$: wsSubject.asObservable()
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockRoute = {
      queryParams: of({ tab: 'new', section_id: '10' })
    };

    mockCdr = {
      markForCheck: vi.fn(),
      detectChanges: vi.fn()
    };

    component = new SupervisorPersonnelHubComponent(
      mockAuth,
      mockState,
      mockToast,
      mockPersonnelApi,
      mockWs,
      mockRouter,
      mockRoute,
      mockCdr
    );
  });

  describe('Task 8.2: Filter isolation (No draft leakage)', () => {
    it('should query getPersonnelProfilesPage with approval_status: pending_supervisor exclusively', () => {
      component.fetchData();
      expect(mockPersonnelApi.getPersonnelProfilesPage).toHaveBeenCalledWith(
        expect.objectContaining({ approval_status: 'pending_supervisor' })
      );
      // Ensure draft is NOT present in any call for new personnel
      const calls = mockPersonnelApi.getPersonnelProfilesPage.mock.calls;
      const newPersonnelCall = calls.find((c: any[]) => c[0]?.approval_status !== undefined);
      expect(newPersonnelCall[0].approval_status).toBe('pending_supervisor');
      expect(newPersonnelCall[0].approval_status).not.toContain('draft');
    });
  });

  describe('Task 8.3: Profile Viewer Modal & Diff Viewer with Audit Logs', () => {
    it('should open view profile modal with complete personnel profile data', () => {
      expect(component.isViewProfileModalOpen).toBe(false);
      component.openViewProfileModal(sampleProfile1);
      expect(component.isViewProfileModalOpen).toBe(true);
      expect(component.selectedViewProfile).toBe(sampleProfile1);
      expect(component.selectedViewProfile?.bank_accounts?.length).toBe(1);
      expect(component.selectedViewProfile?.documents?.length).toBe(1);

      component.closeViewProfileModal();
      expect(component.isViewProfileModalOpen).toBe(false);
      expect(component.selectedViewProfile).toBeNull();
    });

    it('should open diff modal, calculate changed field rows and load audit logs for change request', () => {
      component.openDiffModal(mockCrPersonnel);
      expect(component.isDiffModalOpen).toBe(true);
      expect(component.selectedDiffCR).toBe(mockCrPersonnel);
      expect(component.diffFieldRows.length).toBeGreaterThan(0);
      expect(mockPersonnelApi.getWorkflowAuditLogs).toHaveBeenCalledWith({
        content_type: 'personnelchangerequest',
        object_id: 301
      });
      expect(component.diffAuditLogs.length).toBe(1);
      expect(component.diffAuditLogs[0].action).toBe('submit');

      component.closeDiffModal();
      expect(component.isDiffModalOpen).toBe(false);
      expect(component.selectedDiffCR).toBeNull();
      expect(component.diffAuditLogs.length).toBe(0);
    });
  });

  describe('Task 8.4: Read-only personnel lists (approvals live in my-tasks)', () => {
    it('should page profiles from the server and expose paging state', () => {
      component.fetchData();
      expect(component.totals.new).toBe(2);
      expect(component.pageSize).toBe(20);
      component.goToPage('new', 1);
      expect(component.pages.new).toBe(1);
    });

    it('should not expose legacy approve / reject / batch actions for personnel', () => {
      const c: any = component;
      expect(c.submitReject).toBeUndefined();
      expect(c.openRejectModal).toBeUndefined();
      expect(c.submitBatchApproval).toBeUndefined();
      expect(c.toggleSelectAllPersonnel).toBeUndefined();
    });
  });

  describe('Task 8.6: Ergonomic Mobile & Quick Copy', () => {
    it('should copy field text to clipboard and provide temporary feedback', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

      component.copyField('09123456789', 'mob_101');
      expect(writeTextMock).toHaveBeenCalledWith('09123456789');
      await Promise.resolve();
      expect(mockToast.showSuccess).toHaveBeenCalledWith('کپی شد: 09123456789');
      expect(component.isFieldCopied('mob_101')).toBe(true);
      expect(component.isFieldCopied('other_key')).toBe(false);
    });
  });
});
