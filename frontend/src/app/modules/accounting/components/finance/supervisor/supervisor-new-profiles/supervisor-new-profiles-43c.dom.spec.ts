// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵresolveComponentResources, ɵɵdirectiveInject, ChangeDetectorRef, Directive, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { of, Subject } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

import { SupervisorNewProfilesHubComponent } from './supervisor-new-profiles';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { VehicleChangeRequest } from '../../../../models/personnel.model';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

@Directive({ selector: 'a[routerLink]', standalone: true })
class RouterLinkStub {
  @Input() routerLink: any;
  @Input() queryParams: any;
}

describe('SupervisorNewProfilesHubComponent 4.3-c DOM Specs (Reason Dialog & Prompt Spy)', () => {
  let fixture: ComponentFixture<SupervisorNewProfilesHubComponent>;
  let component: SupervisorNewProfilesHubComponent;

  let mockAuth: any;
  let mockState: any;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockRouter: any;
  let mockRoute: any;
  let wsSubject: Subject<any>;

  const mockCrVehicle: VehicleChangeRequest = {
    id: 222,
    vehicle: 12,
    driver_name: 'رضا کمالی',
    plate_number: '12-345-67',
    status: 'pending_supervisor',
    status_display: 'در انتظار تایید سرپرست',
    proposed_changes: { default_service_rate: 1800000 },
    previous_values: { default_service_rate: 1500000 },
    requested_by_name: 'کارمند ترابری',
    created_at: '2026-09-21T11:00:00Z',
    updated_at: '2026-09-21T11:00:00Z'
  };

  beforeAll(async () => {
    Object.defineProperty(SupervisorNewProfilesHubComponent, 'ɵfac', {
      value: function (t: any) {
        return new (t || SupervisorNewProfilesHubComponent)(
          ɵɵdirectiveInject(AuthService),
          ɵɵdirectiveInject(StateService),
          ɵɵdirectiveInject(ToastService),
          ɵɵdirectiveInject(PersonnelApiService),
          ɵɵdirectiveInject(WebSocketService),
          ɵɵdirectiveInject(Router),
          ɵɵdirectiveInject(ActivatedRoute),
          ɵɵdirectiveInject(ChangeDetectorRef)
        );
      },
      configurable: true,
      writable: true
    });

    await ɵresolveComponentResources(async (url) => {
      const filename = path.basename(url);
      const localPath = path.resolve(__dirname, filename);
      if (fs.existsSync(localPath)) {
        return fs.readFileSync(localPath, 'utf-8');
      }
      return '';
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    wsSubject = new Subject<any>();

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'supervisor_user' }),
      userPermissions: vi.fn().mockReturnValue(['perm_approve_personnel_supervisor'])
    };

    mockState = {
      activeWarehouse: vi.fn().mockReturnValue({ id: 1, name: 'انبار مرکزی' })
    };

    mockToast = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([{ id: 10, name: 'بخش دریافت', project: 1, is_active: true }])),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getPersonnelProfilesPage: vi.fn().mockReturnValue(of({ count: 0, next: null, previous: null, results: [] })),
      getVehicleProfiles: vi.fn().mockReturnValue(of([])),
      getPersonnelChangeRequestsPage: vi.fn().mockReturnValue(of({ count: 0, next: null, previous: null, results: [] })),
      getVehicleChangeRequests: vi.fn().mockReturnValue(of([mockCrVehicle])),
      approvePersonnelSupervisor: vi.fn().mockReturnValue(of({ message: 'تایید شد' })),
      requestPersonnelRevision: vi.fn().mockReturnValue(of({ message: 'عودت شد' })),
      approveVehicleSupervisor: vi.fn().mockReturnValue(of({ message: 'تایید شد' })),
      requestVehicleRevision: vi.fn().mockReturnValue(of({ message: 'عودت شد' })),
      approvePersonnelChangeRequestSupervisor: vi.fn().mockReturnValue(of({ message: 'تایید شد' })),
      rejectPersonnelChangeRequest: vi.fn().mockReturnValue(of({ message: 'رد شد' })),
      approveVehicleChangeRequestSupervisor: vi.fn().mockReturnValue(of({ message: 'تایید شد' })),
      rejectVehicleChangeRequest: vi.fn().mockReturnValue(of({ message: 'درخواست تغییرات ناوگان رد شد.' })),
      getWorkflowAuditLogs: vi.fn().mockReturnValue(of([]))
    };

    mockWs = {
      notifications$: wsSubject.asObservable(),
      skipLiveEvent: vi.fn().mockReturnValue(false)
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockRoute = {
      queryParams: of({ tab: 'change_requests', section_id: '10' }),
      snapshot: { queryParams: { tab: 'change_requests', section_id: '10' } }
    };

    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, ReactiveFormsModule, SupervisorNewProfilesHubComponent],
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: StateService, useValue: mockState },
        { provide: ToastService, useValue: mockToast },
        { provide: PersonnelApiService, useValue: mockPersonnelApi },
        { provide: WebSocketService, useValue: mockWs },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockRoute }
      ]
    })
      .overrideComponent(SupervisorNewProfilesHubComponent, {
        remove: { imports: [RouterLink] },
        add: { imports: [RouterLinkStub] }
      })
      .compileComponents();

    fixture = TestBed.createComponent(SupervisorNewProfilesHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('f) window.prompt is never called: spy on it, open the vehicle reject flow, and assert the spy was not called and an app-workflow-reason-dialog element is present', () => {
    const promptSpy = vi.spyOn(window, 'prompt');

    component.rejectVehicleChange(mockCrVehicle);
    fixture.detectChanges();

    expect(promptSpy).not.toHaveBeenCalled();
    expect(component.isReasonDialogOpen).toBe(true);
    expect(component.reasonTarget).toEqual(mockCrVehicle);

    const dialogEl = fixture.nativeElement.querySelector('app-workflow-reason-dialog');
    expect(dialogEl).not.toBeNull();
    // Verify dialog is opened in DOM
    const dialogModal = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialogModal).not.toBeNull();
    expect(dialogModal?.getAttribute('aria-label')).toBe('علت رد تغییرات خودرو');
  });

  it('g) confirming the reason dialog with a reason calls the vehicle reject API once with that reason', () => {
    component.rejectVehicleChange(mockCrVehicle);
    fixture.detectChanges();

    const reason = 'نرخ پیشنهادی بالاتر از مصوبه شرکت است';
    component.onReasonConfirmed(reason);

    expect(mockPersonnelApi.rejectVehicleChangeRequest).toHaveBeenCalledTimes(1);
    expect(mockPersonnelApi.rejectVehicleChangeRequest).toHaveBeenCalledWith(222, reason);
    expect(component.isReasonDialogOpen).toBe(false);
    expect(component.reasonTarget).toBeNull();
  });

  it('h) cancelling the dialog calls no API', () => {
    component.rejectVehicleChange(mockCrVehicle);
    fixture.detectChanges();

    mockPersonnelApi.rejectVehicleChangeRequest.mockClear();
    mockPersonnelApi.requestVehicleRevision.mockClear();

    component.onReasonCancelled();

    expect(mockPersonnelApi.rejectVehicleChangeRequest).not.toHaveBeenCalled();
    expect(mockPersonnelApi.requestVehicleRevision).not.toHaveBeenCalled();
    expect(component.isReasonDialogOpen).toBe(false);
    expect(component.reasonTarget).toBeNull();
  });
});
