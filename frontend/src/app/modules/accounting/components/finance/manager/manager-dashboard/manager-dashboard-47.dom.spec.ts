// @vitest-environment jsdom
import '@angular/compiler';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of, BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';

import { ManagerDashboardComponent } from './manager-dashboard';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { NetworkStatusService } from '../../../../../../core/services/network-status.service';
import { WorkflowTasksService } from '../../../../../../core/services/workflow-tasks.service';
import { DashboardSummary } from '../../../../models/accounting-reports.model';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('ManagerDashboardComponent (Release v1 step 4.7-c)', () => {
  let fixture: ComponentFixture<ManagerDashboardComponent>;
  let component: ManagerDashboardComponent;
  let mockPersonnelApi: any;
  let mockNetwork: any;
  let mockRouter: any;
  let mockTasks: any;
  let networkSubject: BehaviorSubject<string>;

  const summaryData: DashboardSummary = {
    report: 'dashboard-summary',
    date_from: '1405/08/01',
    date_to: '1405/08/30',
    filters: { company_id: null, section_id: null, project_id: null },
    rows: [
      { section_id: 1, section_name: 'SecA', month_expense: 1500000, personnel_count: 8, vehicle_count: 2 },
      { section_id: 2, section_name: 'SecB', month_expense: 2500000, personnel_count: 14, vehicle_count: 5 },
    ],
    totals: { month_expense: 4000000, personnel_count: 22, vehicle_count: 7 },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    networkSubject = new BehaviorSubject<string>('online');
    mockNetwork = {
      isOnline: true,
      state$: networkSubject.asObservable(),
    };
    mockPersonnelApi = {
      getAccountingReport: vi.fn().mockReturnValue(of(summaryData)),
    };
    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true),
    };
    mockTasks = {
      refresh: vi.fn().mockResolvedValue(undefined),
      loaded: vi.fn().mockReturnValue(true),
      count: vi.fn().mockReturnValue(3),
      isStale: vi.fn().mockReturnValue(false),
    };

    await TestBed.configureTestingModule({
      imports: [ManagerDashboardComponent],
      providers: [
        { provide: PersonnelApiService, useValue: mockPersonnelApi },
        { provide: NetworkStatusService, useValue: mockNetwork },
        { provide: Router, useValue: mockRouter },
        { provide: WorkflowTasksService, useValue: mockTasks },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ManagerDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('a) getAccountingReport is called with dashboard-summary; with two rows (section_name SecA/SecB, month_expense, personnel_count, vehicle_count), the rendered text contains SecA and SecB', () => {
    expect(mockPersonnelApi.getAccountingReport).toHaveBeenCalledWith('dashboard-summary');
    expect(fixture.nativeElement.textContent).toContain('SecA');
    expect(fixture.nativeElement.textContent).toContain('SecB');
  });

  it('b) no budget column: the rendered table header text does not contain the Persian words for budget or variance used by the old page (assert the template contains no budget binding: fixture.nativeElement.innerHTML does not contain budget and variance)', () => {
    const html = fixture.nativeElement.innerHTML.toLowerCase();
    expect(html).not.toContain('budget');
    expect(html).not.toContain('variance');

    const text = fixture.nativeElement.textContent;
    expect(text).not.toContain('بودجه');
    expect(text).not.toContain('انحراف');
  });

  it('c) my-tasks: a mock WorkflowTasksService with loaded() true and count() 3 -> refresh was called and the rendered text contains the Persian digit 3 (۳); calling component.goToMyTasks() navigates to /app/my-tasks', () => {
    expect(mockTasks.refresh).toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('۳');

    component.goToMyTasks();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/my-tasks']);
  });
});
