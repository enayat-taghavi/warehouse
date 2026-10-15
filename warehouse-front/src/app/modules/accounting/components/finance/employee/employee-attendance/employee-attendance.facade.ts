import { Injectable } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { WarehouseHttpService } from '../../../../../../core/http/warehouse-http.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import {
  AttendanceMatrixResponse,
  MonthlyGridResponse
} from '../../../../../../core/models/personnel.model';

@Injectable()
export class EmployeeAttendanceFacade {
  constructor(
    private personnelApi: PersonnelApiService,
    private warehouseService: WarehouseHttpService,
    private toast: ToastService
  ) {}

  loadAttendanceMatrix(
    warehouseId: number | null,
    dateShamsi: string,
    options?: { context?: HttpContext; section_id?: number }
  ): Observable<AttendanceMatrixResponse> {
    return this.personnelApi.getAttendanceMatrix(warehouseId, dateShamsi, options);
  }

  saveAttendanceBulk(payload: {
    warehouse_id?: number | null;
    section_id?: number | null;
    project_id?: number;
    date_shamsi: string;
    client_tab_id?: string;
    items: {
      personnel_id: number;
      warehouse_id?: number | null;
      status: string;
      effective_hours: number;
      overtime_hours: number;
      is_friday_work: boolean;
      is_mission: boolean;
      advance_payment: number;
      notes?: string;
    }[];
  }): Observable<any> {
    return this.personnelApi.saveAttendanceBulk(payload as any);
  }

  loadMonthlyGrid(
    warehouseId: number | null,
    yearMonth: string,
    options?: { context?: HttpContext; section_id?: number }
  ): Observable<MonthlyGridResponse> {
    return this.personnelApi.getMonthlyAttendanceGrid(warehouseId, yearMonth, options);
  }

  bulkSaveMonthlyGrid(payload: {
    warehouse_id?: number | null;
    section_id?: number | null;
    project_id?: number;
    year_month: string;
    client_tab_id?: string;
    items: {
      personnel_id: number;
      day: number;
      status: string;
      effective_hours: number;
      overtime_hours: number;
      is_friday_work: boolean;
      is_mission: boolean;
      advance_payment: number;
      notes?: string;
    }[];
  }): Observable<any> {
    return this.personnelApi.bulkSaveMonthlyGrid(payload as any);
  }

  exportMonthlyExcel(warehouseId: number | null | undefined, yearMonth: string, sectionId?: number | null): Observable<Blob> {
    return this.personnelApi.exportMonthlyAttendanceExcel(warehouseId, yearMonth, sectionId);
  }

  uploadMonthlyTimesheetExcel(formData: FormData): Observable<any> {
    return this.personnelApi.importMonthlyAttendanceExcel(formData);
  }

  periodWorkflowAction(payload: {
    warehouse_id?: number | null;
    section_id?: number | null;
    year_month: string;
    action: 'submit' | 'approve' | 'reject' | 'unlock';
    notes?: string;
  }): Observable<any> {
    return this.personnelApi.periodWorkflowAction(payload as any);
  }

  loadWarehouses(): Observable<any[]> {
    return this.warehouseService.getAll();
  }

  loadMySections(): Observable<any[]> {
    return this.personnelApi.getMySections();
  }
}
