// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { ACCOUNTING_NOTIFICATION_HANDLERS } from './notification-handlers';
import { NotificationNavigationContext } from '../../core/modules/module-contract';
import { getPermissionAliases } from '../../core/modules/permission-aliases';

describe('ACCOUNTING_NOTIFICATION_HANDLERS', () => {
  let mockHttp: { get: ReturnType<typeof vi.fn> };
  let mockRouter: { navigate: ReturnType<typeof vi.fn> };

  const [fleetChangeHandler, fleetProfileHandler, personnelProfileHandler] = ACCOUNTING_NOTIFICATION_HANDLERS;

  beforeEach(() => {
    mockHttp = {
      get: vi.fn()
    };
    mockRouter = {
      navigate: vi.fn()
    };
  });

  function createContext(options: {
    item: any;
    userPerms?: string[];
    isSuperuser?: boolean;
  }): NotificationNavigationContext {
    return {
      item: options.item,
      http: mockHttp as unknown as HttpClient,
      router: mockRouter as unknown as Router,
      userPerms: options.userPerms || [],
      isSuperuser: !!options.isSuperuser,
      // همان تابعی که هستهٔ اعلان‌ها می‌دهد (alias مجوز از manifest ماژول‌های نصب‌شده)
      permissionAliases: (capability: string) => getPermissionAliases(capability)
    };
  }

  describe('Handler 1: fleet_change_request', () => {
    it('canHandle only matches fleet_change_request notification_type', () => {
      expect(fleetChangeHandler.canHandle({ notification_type: 'fleet_change_request' })).toBe(true);
      expect(fleetChangeHandler.canHandle({ notification_type: 'other' })).toBe(false);
      expect(fleetChangeHandler.canHandle({ target_model: 'VehicleDriverProfile' })).toBe(false);
    });

    it('navigates manager to manager-fleet with changes tab', () => {
      const ctx = createContext({
        item: { notification_type: 'fleet_change_request' },
        userPerms: ['perm_approve_fleet_manager']
      });
      fleetChangeHandler.navigate(ctx);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/manager-fleet'], { queryParams: { tab: 'changes' } });
    });

    it('navigates accountant to accountant-fleet with changes tab', () => {
      const ctx = createContext({
        item: { notification_type: 'fleet_change_request' },
        userPerms: ['perm_approve_fleet_finance']
      });
      fleetChangeHandler.navigate(ctx);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/accountant-fleet'], { queryParams: { tab: 'changes' } });
    });

    it('navigates supervisor to supervisor-fleet with changes tab', () => {
      const ctx = createContext({
        item: { notification_type: 'fleet_change_request' },
        userPerms: ['perm_approve_fleet_supervisor']
      });
      fleetChangeHandler.navigate(ctx);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/supervisor-fleet'], { queryParams: { tab: 'changes' } });
    });

    it('navigates plain employee to employee-new-vehicle', () => {
      const ctx = createContext({
        item: { notification_type: 'fleet_change_request' },
        userPerms: []
      });
      fleetChangeHandler.navigate(ctx);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/employee-new-vehicle']);
    });
  });

  describe('Handler 2: VehicleDriverProfile', () => {
    it('canHandle only matches VehicleDriverProfile target_model', () => {
      expect(fleetProfileHandler.canHandle({ target_model: 'VehicleDriverProfile' })).toBe(true);
      expect(fleetProfileHandler.canHandle({ target_model: 'PersonnelProfile' })).toBe(false);
      expect(fleetProfileHandler.canHandle({ notification_type: 'fleet_change_request' })).toBe(false);
    });

    describe('Invalid target_id fallback', () => {
      it('manager falls back to manager-fleet on invalid target_id', () => {
        const ctx = createContext({
          item: { target_model: 'VehicleDriverProfile', target_id: null },
          userPerms: ['can_act_as_manager']
        });
        fleetProfileHandler.navigate(ctx);
        expect(mockHttp.get).not.toHaveBeenCalled();
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/manager-fleet']);
      });

      it('accountant falls back to accountant-fleet on non-numeric target_id', () => {
        const ctx = createContext({
          item: { target_model: 'VehicleDriverProfile', target_id: 'invalid-id' },
          userPerms: ['can_act_as_accountant']
        });
        fleetProfileHandler.navigate(ctx);
        expect(mockHttp.get).not.toHaveBeenCalled();
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/accountant-fleet']);
      });

      it('supervisor falls back to supervisor-fleet on zero or negative target_id', () => {
        const ctx = createContext({
          item: { target_model: 'VehicleDriverProfile', target_id: '0' },
          userPerms: ['can_act_as_workshop_supervisor']
        });
        fleetProfileHandler.navigate(ctx);
        expect(mockHttp.get).not.toHaveBeenCalled();
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/supervisor-fleet']);
      });

      it('plain employee falls back to employee-new-vehicle on invalid target_id', () => {
        const ctx = createContext({
          item: { target_model: 'VehicleDriverProfile', target_id: '-5' },
          userPerms: []
        });
        fleetProfileHandler.navigate(ctx);
        expect(mockHttp.get).not.toHaveBeenCalled();
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/employee-new-vehicle']);
      });
    });

    describe('HTTP error fallback', () => {
      it('navigates manager to manager-fleet when HTTP lookup errors', () => {
        mockHttp.get.mockReturnValue(throwError(() => new Error('Server error')));
        const ctx = createContext({
          item: { target_model: 'VehicleDriverProfile', target_id: '12' },
          userPerms: ['perm_approve_fleet_manager']
        });
        fleetProfileHandler.navigate(ctx);
        expect(mockHttp.get).toHaveBeenCalled();
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/manager-fleet']);
      });

      it('navigates accountant to accountant-fleet when HTTP lookup errors', () => {
        mockHttp.get.mockReturnValue(throwError(() => new Error('404')));
        const ctx = createContext({
          item: { target_model: 'VehicleDriverProfile', target_id: '12' },
          userPerms: ['view_sys_fleet_settlement']
        });
        fleetProfileHandler.navigate(ctx);
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/accountant-fleet']);
      });

      it('navigates supervisor to supervisor-fleet when HTTP lookup errors', () => {
        mockHttp.get.mockReturnValue(throwError(() => new Error('403')));
        const ctx = createContext({
          item: { target_model: 'VehicleDriverProfile', target_id: '12' },
          userPerms: ['perm_approve_fleet_supervisor']
        });
        fleetProfileHandler.navigate(ctx);
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/supervisor-fleet']);
      });

      it('navigates plain employee to employee-new-vehicle when HTTP lookup errors', () => {
        mockHttp.get.mockReturnValue(throwError(() => new Error('Network error')));
        const ctx = createContext({
          item: { target_model: 'VehicleDriverProfile', target_id: '12' },
          userPerms: []
        });
        fleetProfileHandler.navigate(ctx);
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/employee-new-vehicle']);
      });
    });

    describe('HTTP success navigation with role permissions', () => {
      it('navigates manager to manager-fleet tab=new with plate search for pending_manager status', () => {
        mockHttp.get.mockReturnValue(of({ id: 12, plate_number: '12B345', approval_status: 'pending_manager' }));
        const ctx = createContext({
          item: { target_model: 'VehicleDriverProfile', target_id: '12' },
          userPerms: ['can_act_as_manager']
        });
        fleetProfileHandler.navigate(ctx);
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/manager-fleet'], {
          queryParams: { tab: 'new', q: '12B345' }
        });
      });

      it('navigates accountant to accountant-fleet tab=new with plate search for pending_accountant status', () => {
        mockHttp.get.mockReturnValue(of({ id: 12, plate_number: '12B345', approval_status: 'pending_accountant' }));
        const ctx = createContext({
          item: { target_model: 'VehicleDriverProfile', target_id: '12' },
          userPerms: ['perm_approve_fleet_finance']
        });
        fleetProfileHandler.navigate(ctx);
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/accountant-fleet'], {
          queryParams: { tab: 'new', q: '12B345' }
        });
      });

      it('navigates supervisor to supervisor-fleet tab=new with plate search for pending_supervisor status', () => {
        mockHttp.get.mockReturnValue(of({ id: 12, plate_number: '12B345', approval_status: 'pending_supervisor' }));
        const ctx = createContext({
          item: { target_model: 'VehicleDriverProfile', target_id: '12' },
          userPerms: ['perm_approve_fleet_supervisor']
        });
        fleetProfileHandler.navigate(ctx);
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/supervisor-fleet'], {
          queryParams: { tab: 'new', q: '12B345' }
        });
      });

      it('navigates approved vehicle to employee-fleet with section and search', () => {
        mockHttp.get.mockReturnValue(of({ id: 12, plate_number: '12B345', approval_status: 'approved', section: 9 }));
        const ctx = createContext({
          item: { target_model: 'VehicleDriverProfile', target_id: '12' },
          userPerms: []
        });
        fleetProfileHandler.navigate(ctx);
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/employee-fleet'], {
          queryParams: { section_id: 9, search: '12B345' }
        });
      });

      it('navigates draft/unapproved vehicle to employee-new-vehicle with section, search and id', () => {
        mockHttp.get.mockReturnValue(of({ id: 12, plate_number: '12B345', approval_status: 'draft', section: 9 }));
        const ctx = createContext({
          item: { target_model: 'VehicleDriverProfile', target_id: '12' },
          userPerms: []
        });
        fleetProfileHandler.navigate(ctx);
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/employee-new-vehicle'], {
          queryParams: { section_id: 9, search: '12B345', id: 12 }
        });
      });
    });
  });

  describe('Handler 3: PersonnelProfile', () => {
    it('canHandle only matches PersonnelProfile target_model', () => {
      expect(personnelProfileHandler.canHandle({ target_model: 'PersonnelProfile' })).toBe(true);
      expect(personnelProfileHandler.canHandle({ target_model: 'VehicleDriverProfile' })).toBe(false);
      expect(personnelProfileHandler.canHandle({ notification_type: 'fleet_change_request' })).toBe(false);
    });

    describe('Invalid target_id fallback', () => {
      it('manager falls back to manager-personnel on invalid target_id', () => {
        const ctx = createContext({
          item: { target_model: 'PersonnelProfile', target_id: null },
          userPerms: ['perm_approve_personnel_manager']
        });
        personnelProfileHandler.navigate(ctx);
        expect(mockHttp.get).not.toHaveBeenCalled();
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/manager-personnel']);
      });

      it('accountant falls back to accountant-personnel on non-numeric target_id', () => {
        const ctx = createContext({
          item: { target_model: 'PersonnelProfile', target_id: 'invalid-id' },
          userPerms: ['perm_approve_personnel_finance']
        });
        personnelProfileHandler.navigate(ctx);
        expect(mockHttp.get).not.toHaveBeenCalled();
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/accountant-personnel']);
      });

      it('supervisor falls back to supervisor-personnel on zero or negative target_id', () => {
        const ctx = createContext({
          item: { target_model: 'PersonnelProfile', target_id: '0' },
          userPerms: ['perm_approve_personnel_supervisor']
        });
        personnelProfileHandler.navigate(ctx);
        expect(mockHttp.get).not.toHaveBeenCalled();
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/supervisor-personnel']);
      });

      it('plain employee falls back to employee-new-personnel on invalid target_id', () => {
        const ctx = createContext({
          item: { target_model: 'PersonnelProfile', target_id: '-1' },
          userPerms: []
        });
        personnelProfileHandler.navigate(ctx);
        expect(mockHttp.get).not.toHaveBeenCalled();
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/employee-new-personnel']);
      });
    });

    describe('HTTP error fallback', () => {
      it('navigates manager to manager-personnel when HTTP lookup errors', () => {
        mockHttp.get.mockReturnValue(throwError(() => new Error('Server error')));
        const ctx = createContext({
          item: { target_model: 'PersonnelProfile', target_id: '88' },
          userPerms: ['can_act_as_manager']
        });
        personnelProfileHandler.navigate(ctx);
        expect(mockHttp.get).toHaveBeenCalled();
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/manager-personnel']);
      });

      it('navigates accountant to accountant-personnel when HTTP lookup errors', () => {
        mockHttp.get.mockReturnValue(throwError(() => new Error('404')));
        const ctx = createContext({
          item: { target_model: 'PersonnelProfile', target_id: '88' },
          userPerms: ['perm_approve_personnel_finance']
        });
        personnelProfileHandler.navigate(ctx);
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/accountant-personnel']);
      });

      it('navigates supervisor to supervisor-personnel when HTTP lookup errors', () => {
        mockHttp.get.mockReturnValue(throwError(() => new Error('500')));
        const ctx = createContext({
          item: { target_model: 'PersonnelProfile', target_id: '88' },
          userPerms: ['can_act_as_workshop_supervisor']
        });
        personnelProfileHandler.navigate(ctx);
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/supervisor-personnel']);
      });

      it('navigates plain employee to employee-new-personnel when HTTP lookup errors', () => {
        mockHttp.get.mockReturnValue(throwError(() => new Error('Timeout')));
        const ctx = createContext({
          item: { target_model: 'PersonnelProfile', target_id: '88' },
          userPerms: []
        });
        personnelProfileHandler.navigate(ctx);
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/employee-new-personnel']);
      });
    });

    describe('HTTP success navigation with role permissions', () => {
      it('navigates manager to manager-personnel tab=new with national_code search for pending_manager status', () => {
        mockHttp.get.mockReturnValue(of({ id: 88, national_code: '0012345678', approval_status: 'pending_manager' }));
        const ctx = createContext({
          item: { target_model: 'PersonnelProfile', target_id: '88' },
          userPerms: ['perm_approve_personnel_manager']
        });
        personnelProfileHandler.navigate(ctx);
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/manager-personnel'], {
          queryParams: { tab: 'new', q: '0012345678' }
        });
      });

      it('navigates accountant to accountant-personnel tab=new with national_code search for pending_accountant status', () => {
        mockHttp.get.mockReturnValue(of({ id: 88, national_code: '0012345678', approval_status: 'pending_accountant' }));
        const ctx = createContext({
          item: { target_model: 'PersonnelProfile', target_id: '88' },
          userPerms: ['perm_approve_personnel_finance']
        });
        personnelProfileHandler.navigate(ctx);
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/accountant-personnel'], {
          queryParams: { tab: 'new', q: '0012345678' }
        });
      });

      it('navigates supervisor to supervisor-personnel tab=new with national_code search for pending_supervisor status', () => {
        mockHttp.get.mockReturnValue(of({ id: 88, national_code: '0012345678', approval_status: 'pending_supervisor' }));
        const ctx = createContext({
          item: { target_model: 'PersonnelProfile', target_id: '88' },
          userPerms: ['perm_approve_personnel_supervisor']
        });
        personnelProfileHandler.navigate(ctx);
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/supervisor-personnel'], {
          queryParams: { tab: 'new', q: '0012345678' }
        });
      });

      it('navigates other status (approved/draft/rejected) to employee-new-personnel with section and search', () => {
        mockHttp.get.mockReturnValue(of({ id: 88, national_code: '0012345678', approval_status: 'approved', section: 4 }));
        const ctx = createContext({
          item: { target_model: 'PersonnelProfile', target_id: '88' },
          userPerms: []
        });
        personnelProfileHandler.navigate(ctx);
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/employee-new-personnel'], {
          queryParams: { section_id: 4, search: '0012345678' }
        });
      });
    });
  });
});
