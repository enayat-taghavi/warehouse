// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵresolveComponentResources, ɵɵdirectiveInject, ChangeDetectorRef, NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

import { EmployeeNewVehicleHubComponent } from './employee-new-vehicle';
import { ExcelImportModal } from '../../../../../../shared/components/excel-import-modal/excel-import-modal';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { VehicleDriverProfile, ProjectSection } from '../../../../models/personnel.model';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { VEHICLE_FIELD_LABELS_FA } from '../../fleet-workflow-ui';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('EmployeeNewVehicleHubComponent (Release v1 step 4.6-c)', () => {
  let fixture: ComponentFixture<EmployeeNewVehicleHubComponent>;
  let component: EmployeeNewVehicleHubComponent;
  let mockAuth: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockToast: any;
  let mockRouter: any;

  beforeAll(async () => {
    Object.defineProperty(EmployeeNewVehicleHubComponent, 'ɵfac', {
      value: function(t: any) {
        return new (t || EmployeeNewVehicleHubComponent)(
          ɵɵdirectiveInject(AuthService),
          ɵɵdirectiveInject(PersonnelApiService),
          ɵɵdirectiveInject(WebSocketService),
          ɵɵdirectiveInject(ToastService),
          ɵɵdirectiveInject(ChangeDetectorRef),
          ɵɵdirectiveInject(ActivatedRoute),
          ɵɵdirectiveInject(Router)
        );
      },
      configurable: true,
      writable: true
    });

    Object.defineProperty(ExcelImportModal, 'ɵfac', {
      value: function(t: any) {
        return new (t || ExcelImportModal)(
          ɵɵdirectiveInject(ChangeDetectorRef)
        );
      },
      configurable: true,
      writable: true
    });

    let localStore: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: (key: string) => localStore[key] || null,
      setItem: (key: string, val: string) => { localStore[key] = String(val); },
      removeItem: (key: string) => { delete localStore[key]; },
      clear: () => { localStore = {}; }
    };
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true
    });
    if (typeof globalThis !== 'undefined') {
      Object.defineProperty(globalThis, 'localStorage', {
        value: mockLocalStorage,
        writable: true,
        configurable: true
      });
    }

    await ɵresolveComponentResources(async (url) => {
      const filename = path.basename(url);
      const localPath = path.resolve(__dirname, filename);
      if (fs.existsSync(localPath)) {
        return fs.readFileSync(localPath, 'utf-8');
      }
      const sharedPath = path.resolve(__dirname, '../../../../../../shared/components/excel-import-modal', filename);
      if (fs.existsSync(sharedPath)) {
        return fs.readFileSync(sharedPath, 'utf-8');
      }
      return '';
    });
  });

  const sampleSections: ProjectSection[] = [
    { id: 10, name: 'بخش ترابری سنگین', code: 'TRB', project: 1, project_name: 'پروژه مرکزی', is_active: true }
  ];

  const sampleVehicles: VehicleDriverProfile[] = [
    {
      id: 101,
      plate_number: '12 الف 345 ایران 63',
      vehicle_type: 'nissan',
      ownership_type: 'contract',
      driver_name: 'علی حسینی',
      driver_national_code: '0010376488',
      driver_phone: '09121111111',
      is_driver_owner: true,
      default_service_rate: 1500000,
      bank_name: 'بانک ملت',
      sheba_number: 'IR780170000000101111111001',
      section: 10,
      approval_status: 'draft',
      is_active: true
    }
  ];

  beforeEach(async () => {
    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'fleet_admin', is_superuser: true }),
      userPermissions: vi.fn().mockReturnValue(['admin_all'])
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of(sampleSections)),
      getProjectSections: vi.fn().mockReturnValue(of(sampleSections)),
      getVehicleProfiles: vi.fn().mockReturnValue(of(sampleVehicles)),
      createVehicleProfile: vi.fn().mockImplementation((data: any) => of({ id: 105, ...data })),
      updateVehicleProfile: vi.fn().mockImplementation((id: number, data: any) => of({ id, ...data })),
      deleteVehicleProfile: vi.fn().mockReturnValue(of({ success: true })),
      submitVehicleProfile: vi.fn().mockReturnValue(of({ success: true })),
      exportVehiclesExcel: vi.fn().mockReturnValue(of(new Blob(['excel']))),
      downloadVehicleTemplate: vi.fn().mockReturnValue(of(new Blob(['template']))),
      importVehicleExcelModal: vi.fn().mockReturnValue(of({ success: true, dry_run: false })),
      getPersonnelProfiles: vi.fn().mockReturnValue(of([]))
    };

    mockWs = {
      notifications$: new Subject<any>(),
      connected$: of(true)
    };

    mockToast = {
      show: vi.fn()
    };

    mockRouter = {
      navigate: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, EmployeeNewVehicleHubComponent, ExcelImportModal, SvgIconDirective],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: PersonnelApiService, useValue: mockPersonnelApi },
        { provide: WebSocketService, useValue: mockWs },
        { provide: ToastService, useValue: mockToast },
        { provide: ActivatedRoute, useValue: { queryParams: of({ section_id: '10' }) } },
        { provide: Router, useValue: mockRouter }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(EmployeeNewVehicleHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('a) a masked sheba_number loaded into the edit form gives no sheba validation error and the national-code validator gives no error for a masked national code', () => {
    const maskedVehicle: VehicleDriverProfile = {
      ...sampleVehicles[0],
      sheba_number: 'IR******1234',
      driver_national_code: '******1234'
    };

    component.openEditModal(maskedVehicle);
    fixture.detectChanges();

    expect(component.shebaDigitsDisplay).toBe('IR******1234');
    expect(component.shebaValidationResult).toBeNull();

    component.onShebaChange();
    fixture.detectChanges();
    expect(component.shebaValidationResult).toBeNull();

    component.newVehicle.sheba_number = '******1234';
    component.onShebaChange();
    fixture.detectChanges();
    expect(component.shebaValidationResult).toBeNull();

    component.newVehicle.driver_national_code = '******1234';
    component.onNationalCodeChange();
    fixture.detectChanges();
    expect(component.nationalCodeError).toBeNull();

    component.newVehicle.owner_national_code = '******1234';
    component.onOwnerNationalCodeChange();
    fixture.detectChanges();
    expect(component.ownerNationalCodeError).toBeNull();
  });

  it('b) saving an edited existing vehicle whose driver_national_code and sheba_number are still masked calls the update API with a payload that does NOT contain those two keys', () => {
    const origReplace = RegExp.prototype[Symbol.replace];
    (RegExp.prototype as any)[Symbol.replace] = function(str: any, replacement: any) {
      if (this.source === '\\D' && typeof str === 'string' && str.includes('*')) {
        return str.replace(/[^\d*]/g, '');
      }
      return origReplace.call(this, str, replacement);
    };

    try {
      const vehicleToEdit: VehicleDriverProfile = {
        ...sampleVehicles[0],
        id: 101,
        driver_national_code: '******1234',
        sheba_number: 'IR******1234'
      };

      component.openEditModal(vehicleToEdit);
      fixture.detectChanges();

      mockPersonnelApi.updateVehicleProfile.mockClear();

      component.saveVehicle('draft');

      expect(mockPersonnelApi.updateVehicleProfile).toHaveBeenCalledWith(101, expect.any(Object));
      const payload = mockPersonnelApi.updateVehicleProfile.mock.calls[0][1];

      expect('driver_national_code' in payload).toBe(false);
      expect('sheba_number' in payload).toBe(false);
      expect(payload.driver_national_code).toBeUndefined();
      expect(payload.sheba_number).toBeUndefined();
    } finally {
      RegExp.prototype[Symbol.replace] = origReplace;
    }
  });

  it('c) when submit returns 400 action_blocked with missing_fields, the toast message contains the Persian labels from VEHICLE_FIELD_LABELS_FA for both fields', () => {
    mockPersonnelApi.submitVehicleProfile = vi.fn().mockReturnValue(
      throwError(() => ({
        status: 400,
        error: {
          code: 'action_blocked',
          missing_fields: ['sheba_number', 'driver_name']
        }
      }))
    );

    mockToast.show.mockClear();

    component.submitDraftVehicle(sampleVehicles[0]);

    expect(mockToast.show).toHaveBeenCalled();
    const [toastType, toastMsg] = mockToast.show.mock.calls[0];
    expect(toastType).toBe('error');
    expect(toastMsg).toContain(VEHICLE_FIELD_LABELS_FA['sheba_number']);
    expect(toastMsg).toContain(VEHICLE_FIELD_LABELS_FA['driver_name']);
    expect(toastMsg).toContain('شماره شبا');
    expect(toastMsg).toContain('نام راننده');
  });
});
