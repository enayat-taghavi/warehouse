import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import {
  ProjectSection,
  VehicleDriverProfile,
  VehicleBankAccount,
  VehicleDocument,
  WorkflowAuditLog
} from '../../../../../../core/models/personnel.model';
import { ImportResult } from '../../../../../../core/http/accounts-http.service';

@Injectable()
export class EmployeeNewVehicleFacade {
  constructor(
    private personnelApi: PersonnelApiService,
    private toast: ToastService
  ) {}

  getMySections(): Observable<ProjectSection[]> {
    return this.personnelApi.getMySections();
  }

  getProjectSections(params?: any): Observable<ProjectSection[]> {
    return this.personnelApi.getProjectSections(params);
  }

  loadVehicleProfiles(sectionId: number): Observable<VehicleDriverProfile[]> {
    return this.personnelApi.getVehicleProfiles({ section_id: sectionId });
  }

  getVehicleDriverProfile(id: number): Observable<VehicleDriverProfile> {
    return this.personnelApi.getVehicleDriverProfile(id);
  }

  createVehicleProfile(payload: Partial<VehicleDriverProfile>): Observable<VehicleDriverProfile> {
    return this.personnelApi.createVehicleProfile(payload);
  }

  updateVehicleProfile(id: number, payload: Partial<VehicleDriverProfile>): Observable<any> {
    return this.personnelApi.updateVehicleProfile(id, payload);
  }

  deleteVehicleProfile(id: number): Observable<any> {
    return this.personnelApi.deleteVehicleProfile(id);
  }

  submitVehicleProfile(id: number): Observable<any> {
    return this.personnelApi.submitVehicleProfile(id);
  }

  reopenVehicleProfile(id: number): Observable<any> {
    return this.personnelApi.reopenVehicleProfile(id);
  }

  cancelVehicleChangeRequest(crId: number): Observable<any> {
    return this.personnelApi.cancelVehicleChangeRequest(crId);
  }

  getWorkflowAuditLogs(params: { content_type: string; object_id: number }): Observable<WorkflowAuditLog[]> {
    return this.personnelApi.getWorkflowAuditLogs(params);
  }

  exportVehiclesExcel(sectionId: number): Observable<Blob> {
    return this.personnelApi.exportVehiclesExcel({ section_id: sectionId });
  }

  importVehicleExcelModal(file: File, sectionId: number, updateExisting: boolean, dryRun?: boolean): Observable<ImportResult> {
    return this.personnelApi.importVehicleExcelModal(file, sectionId, updateExisting, dryRun);
  }

  downloadVehicleTemplate(): Observable<Blob> {
    return this.personnelApi.downloadVehicleTemplate();
  }

  getVehicleBankAccounts(vehicleId: number): Observable<VehicleBankAccount[]> {
    return this.personnelApi.getVehicleBankAccounts(vehicleId);
  }

  addVehicleBankAccount(vehicleId: number, acc: VehicleBankAccount): Observable<VehicleBankAccount> {
    return this.personnelApi.addVehicleBankAccount(vehicleId, acc);
  }

  updateVehicleBankAccount(vehicleId: number, acc: VehicleBankAccount): Observable<any> {
    return this.personnelApi.updateVehicleBankAccount(vehicleId, acc);
  }

  deleteVehicleBankAccount(vehicleId: number, accountId: number): Observable<any> {
    return this.personnelApi.deleteVehicleBankAccount(vehicleId, accountId);
  }

  getVehicleDocuments(vehicleId: number): Observable<VehicleDocument[]> {
    if (typeof this.personnelApi?.getVehicleDocuments !== 'function') {
      return of([]);
    }
    return this.personnelApi.getVehicleDocuments(vehicleId);
  }

  uploadVehicleDocument(vehicleId: number, file: File, docType: string, title?: string, expiryDate?: string): Observable<VehicleDocument> {
    if (typeof this.personnelApi?.uploadVehicleDocument !== 'function') {
      return of({} as any);
    }
    return this.personnelApi.uploadVehicleDocument(vehicleId, file, docType, title, expiryDate);
  }

  deleteVehicleDocument(vehicleId: number, docId: number): Observable<any> {
    if (typeof this.personnelApi?.deleteVehicleDocument !== 'function') {
      return of({ success: true });
    }
    return this.personnelApi.deleteVehicleDocument(vehicleId, docId);
  }

  lookupPersonnelByNationalCode(code: string): Observable<any> {
    if (typeof this.personnelApi?.lookupPersonnelByNationalCode === 'function') {
      return this.personnelApi.lookupPersonnelByNationalCode(code);
    }
    if (typeof this.personnelApi?.getPersonnelProfiles === 'function') {
      return this.personnelApi.getPersonnelProfiles({ search: code });
    }
    return of({ found: false });
  }
}
