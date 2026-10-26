// @vitest-environment jsdom
import '@angular/compiler';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of } from 'rxjs';
import { Router, ActivatedRoute } from '@angular/router';
import { Login } from './login';
import { AuthService } from '../../../../core/auth/auth.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { ConfigApiService } from '../../../../core/api/config-api.service';
import { ModuleRegistryService } from '../../../../core/modules/module-registry.service';

function createStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => {
      store[key] = String(val);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] || null,
  };
}

(globalThis as any).localStorage = createStorageMock();

describe('Login Destination Characterization Spec', () => {
  let mockAuth: {
    login: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    user: ReturnType<typeof vi.fn>;
    userPermissions: ReturnType<typeof vi.fn>;
  };
  let mockRouter: {
    url: string;
    navigate: ReturnType<typeof vi.fn>;
    navigateByUrl: ReturnType<typeof vi.fn>;
  };
  let mockToast: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let mockConfigApi: {
    getPublicConfig: ReturnType<typeof vi.fn>;
  };
  let mockRoute: {
    snapshot: {
      queryParams: Record<string, string>;
    };
  };

  beforeEach(async () => {
    localStorage.clear();

    mockAuth = {
      login: vi.fn().mockReturnValue(of({ access: 'fake-jwt', refresh: 'fake-refresh' })),
      logout: vi.fn(),
      user: vi.fn().mockReturnValue({ id: 1, username: 'testuser', is_superuser: false }),
      userPermissions: vi.fn().mockReturnValue([]),
    };

    mockRouter = {
      url: '/login',
      navigate: vi.fn().mockResolvedValue(true),
      navigateByUrl: vi.fn().mockResolvedValue(true),
    };

    mockToast = {
      success: vi.fn(),
      error: vi.fn(),
    };

    mockConfigApi = {
      getPublicConfig: vi.fn().mockReturnValue(of({ system_version: '1.0' })),
    };

    mockRoute = {
      snapshot: {
        queryParams: {},
      },
    };

    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: Router, useValue: mockRouter },
        { provide: ToastService, useValue: mockToast },
        { provide: ConfigApiService, useValue: mockConfigApi },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();

    const registry = TestBed.inject(ModuleRegistryService);
    registry.setInstalledModules(['warehouse', 'accounting']);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function submitLoginForm(
    perms: string[],
    userOverride?: Record<string, any>,
    queryParams?: Record<string, string>
  ): Promise<ComponentFixture<Login>> {
    if (queryParams) {
      mockRoute.snapshot.queryParams = queryParams;
    }
    mockAuth.userPermissions.mockReturnValue(perms);
    if (userOverride) {
      mockAuth.user.mockReturnValue({
        id: 1,
        username: 'testuser',
        is_superuser: false,
        ...userOverride,
      });
    }

    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.username = 'testuser';
    component.password = 'password123';
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 10));

    return fixture;
  }

  // =========================================================================
  // 1. Superuser
  // =========================================================================
  describe('1. Superuser destination', () => {
    it('redirects user with admin_all to launcher without setting active_app_module', async () => {
      await submitLoginForm(['admin_all']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/launcher');
      expect(localStorage.getItem('active_app_module')).toBeNull();
    });

    it('redirects user with is_superuser flag to launcher without setting active_app_module', async () => {
      await submitLoginForm(['some_perm'], { is_superuser: true });

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/launcher');
      expect(localStorage.getItem('active_app_module')).toBeNull();
    });
  });

  // =========================================================================
  // 2. Warehouse 12 login permissions alone (priority chain)
  // =========================================================================
  describe('2. Warehouse login permissions alone', () => {
    it('view_sys_dashboard lands on /app/warehouse/dashboard with active_app_module=warehouse', async () => {
      await submitLoginForm(['view_sys_dashboard']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/warehouse/dashboard');
      expect(localStorage.getItem('active_app_module')).toBe('warehouse');
    });

    it('view_wh_dashboard lands on /app/warehouse/dashboard with active_app_module=warehouse', async () => {
      await submitLoginForm(['view_wh_dashboard']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/warehouse/dashboard');
      expect(localStorage.getItem('active_app_module')).toBe('warehouse');
    });

    it('view_sys_counter lands on /app/warehouse/counter with active_app_module=warehouse', async () => {
      await submitLoginForm(['view_sys_counter']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/warehouse/counter');
      expect(localStorage.getItem('active_app_module')).toBe('warehouse');
    });

    it('view_sys_supervisor lands on /app/warehouse/supervisor with active_app_module=warehouse', async () => {
      await submitLoginForm(['view_sys_supervisor']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/warehouse/supervisor');
      expect(localStorage.getItem('active_app_module')).toBe('warehouse');
    });

    it('view_sys_manager_review lands on /app/warehouse/manager-review with active_app_module=warehouse', async () => {
      await submitLoginForm(['view_sys_manager_review']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/warehouse/manager-review');
      expect(localStorage.getItem('active_app_module')).toBe('warehouse');
    });

    it('view_wh_docs lands on /app/warehouse/docs with active_app_module=warehouse', async () => {
      await submitLoginForm(['view_wh_docs']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/warehouse/docs');
      expect(localStorage.getItem('active_app_module')).toBe('warehouse');
    });

    it('view_wh_dispatch lands on /app/warehouse/dispatch with active_app_module=warehouse', async () => {
      await submitLoginForm(['view_wh_dispatch']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/warehouse/dispatch');
      expect(localStorage.getItem('active_app_module')).toBe('warehouse');
    });

    it('view_wh_customs falls back to /app/warehouse/dashboard with active_app_module=warehouse', async () => {
      await submitLoginForm(['view_wh_customs']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/warehouse/dashboard');
      expect(localStorage.getItem('active_app_module')).toBe('warehouse');
    });

    it('view_wh_doc_approvals falls back to /app/warehouse/dashboard with active_app_module=warehouse', async () => {
      await submitLoginForm(['view_wh_doc_approvals']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/warehouse/dashboard');
      expect(localStorage.getItem('active_app_module')).toBe('warehouse');
    });

    it('view_wh_feeding falls back to /app/warehouse/dashboard with active_app_module=warehouse', async () => {
      await submitLoginForm(['view_wh_feeding']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/warehouse/dashboard');
      expect(localStorage.getItem('active_app_module')).toBe('warehouse');
    });

    it('view_wh_audit falls back to /app/warehouse/dashboard with active_app_module=warehouse', async () => {
      await submitLoginForm(['view_wh_audit']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/warehouse/dashboard');
      expect(localStorage.getItem('active_app_module')).toBe('warehouse');
    });

    it('view_wh_settings falls back to /app/warehouse/dashboard with active_app_module=warehouse', async () => {
      await submitLoginForm(['view_wh_settings']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/warehouse/dashboard');
      expect(localStorage.getItem('active_app_module')).toBe('warehouse');
    });
  });

  // =========================================================================
  // 3. Finance 10 login permissions alone
  // =========================================================================
  describe('3. Finance login permissions alone', () => {
    it('view_sys_personnel lands on /app/finance with active_app_module=personnel', async () => {
      await submitLoginForm(['view_sys_personnel']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/finance');
      expect(localStorage.getItem('active_app_module')).toBe('personnel');
    });

    it('view_sys_personnel_attendance lands on /app/finance with active_app_module=personnel', async () => {
      await submitLoginForm(['view_sys_personnel_attendance']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/finance');
      expect(localStorage.getItem('active_app_module')).toBe('personnel');
    });

    it('view_sys_fleet_attendance lands on /app/finance with active_app_module=personnel', async () => {
      await submitLoginForm(['view_sys_fleet_attendance']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/finance');
      expect(localStorage.getItem('active_app_module')).toBe('personnel');
    });

    it('view_sys_payroll lands on /app/finance with active_app_module=personnel', async () => {
      await submitLoginForm(['view_sys_payroll']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/finance');
      expect(localStorage.getItem('active_app_module')).toBe('personnel');
    });

    it('view_sys_fleet_settlement lands on /app/finance with active_app_module=personnel', async () => {
      await submitLoginForm(['view_sys_fleet_settlement']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/finance');
      expect(localStorage.getItem('active_app_module')).toBe('personnel');
    });

    it('perm_treasury_disburse_action lands on /app/finance with active_app_module=personnel', async () => {
      await submitLoginForm(['perm_treasury_disburse_action']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/finance');
      expect(localStorage.getItem('active_app_module')).toBe('personnel');
    });

    it('perm_approve_personnel_finance lands on /app/finance with active_app_module=personnel', async () => {
      await submitLoginForm(['perm_approve_personnel_finance']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/finance');
      expect(localStorage.getItem('active_app_module')).toBe('personnel');
    });

    it('perm_treasury_disburse_action lands on /app/finance with active_app_module=personnel', async () => {
      await submitLoginForm(['perm_treasury_disburse_action']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/finance');
      expect(localStorage.getItem('active_app_module')).toBe('personnel');
    });

    it('perm_approve_personnel_manager lands on /app/finance with active_app_module=personnel', async () => {
      await submitLoginForm(['perm_approve_personnel_manager']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/finance');
      expect(localStorage.getItem('active_app_module')).toBe('personnel');
    });
  });

  // =========================================================================
  // 4. One warehouse plus one finance permission (launcher)
  // =========================================================================
  describe('4. Both warehouse and finance permissions', () => {
    it('redirects to /app/launcher when user has both view_wh_docs and view_sys_payroll', async () => {
      await submitLoginForm(['view_wh_docs', 'view_sys_payroll']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/launcher');
      expect(localStorage.getItem('active_app_module')).toBeNull();
    });

    it('redirects to /app/launcher when user has view_sys_counter and perm_treasury_disburse_action', async () => {
      await submitLoginForm(['view_sys_counter', 'perm_treasury_disburse_action']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/launcher');
      expect(localStorage.getItem('active_app_module')).toBeNull();
    });
  });

  // =========================================================================
  // 5. No relevant permission
  // =========================================================================
  describe('5. No relevant permission', () => {
    it('redirects to /app/launcher when user has only view_sys_users', async () => {
      await submitLoginForm(['view_sys_users']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/launcher');
      expect(localStorage.getItem('active_app_module')).toBeNull();
    });

    it('redirects to /app/launcher when user has only view_sys_reports', async () => {
      await submitLoginForm(['view_sys_reports']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/launcher');
      expect(localStorage.getItem('active_app_module')).toBeNull();
    });
  });

  // =========================================================================
  // 6. Module markers that are not login permissions
  // =========================================================================
  describe('6. Module markers that are not login permissions', () => {
    it('view_wh_labels alone goes to /app/launcher without active_app_module', async () => {
      await submitLoginForm(['view_wh_labels']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/launcher');
      expect(localStorage.getItem('active_app_module')).toBeNull();
    });

    it('view_wh_feed_approvals alone goes to /app/launcher without active_app_module', async () => {
      await submitLoginForm(['view_wh_feed_approvals']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/launcher');
      expect(localStorage.getItem('active_app_module')).toBeNull();
    });

    it('view_sys_projects alone goes to /app/launcher without active_app_module', async () => {
      await submitLoginForm(['view_sys_projects']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/launcher');
      expect(localStorage.getItem('active_app_module')).toBeNull();
    });

    it('perm_invoice_approve alone goes to /app/launcher without active_app_module', async () => {
      await submitLoginForm(['perm_invoice_approve']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/launcher');
      expect(localStorage.getItem('active_app_module')).toBeNull();
    });

    it('perm_counterparty_manage alone goes to /app/launcher without active_app_module', async () => {
      await submitLoginForm(['perm_counterparty_manage']);

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/launcher');
      expect(localStorage.getItem('active_app_module')).toBeNull();
    });
  });

  // =========================================================================
  // 7. returnUrl override and validation
  // =========================================================================
  describe('7. returnUrl query parameter', () => {
    it('returnUrl=/app/finance/payroll overrides destination for a warehouse user', async () => {
      await submitLoginForm(['view_wh_docs'], undefined, { returnUrl: '/app/finance/payroll' });

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/finance/payroll');
      expect(localStorage.getItem('active_app_module')).toBe('warehouse');
    });

    it('returnUrl=/elsewhere outside /app/ is ignored', async () => {
      await submitLoginForm(['view_wh_docs'], undefined, { returnUrl: '/elsewhere' });

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/warehouse/docs');
      expect(localStorage.getItem('active_app_module')).toBe('warehouse');
    });

    it('returnUrl with full external url is ignored', async () => {
      await submitLoginForm(['view_wh_docs'], undefined, { returnUrl: 'https://evil.example.com' });

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/warehouse/docs');
      expect(localStorage.getItem('active_app_module')).toBe('warehouse');
    });
  });

  // =========================================================================
  // 8. requires_password_change
  // =========================================================================
  describe('8. Password change requirement', () => {
    it('navigates to /change-password using router.navigate when user requires_password_change', async () => {
      await submitLoginForm(['view_wh_docs'], { requires_password_change: true });

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/change-password']);
      expect(mockRouter.navigateByUrl).not.toHaveBeenCalled();
      expect(localStorage.getItem('active_app_module')).toBeNull();
    });
  });
});
