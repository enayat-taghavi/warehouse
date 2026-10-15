import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { PersonnelApiService } from '../../../api/personnel-api.service';
import { AccountsHttpService, User, ImportResult } from '../../../../../core/http/accounts-http.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import {
  FinancialProject,
  ProjectSection,
  UserSectionAssignment
} from '../../../../../core/models/personnel.model';
import { extractApiErrorMessage } from './projects-and-sections.helpers';

@Injectable()
export class ProjectsAndSectionsFacade {
  constructor(
    private api: PersonnelApiService,
    private accountsHttp: AccountsHttpService,
    private toast: ToastService
  ) {}

  triggerDownloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  // --- Excel Operations ---
  exportProjectsExcel(): Observable<Blob> {
    return this.api.exportFinancialProjectsExcel();
  }

  exportSectionsExcel(projectId?: number): Observable<Blob> {
    return this.api.exportProjectSectionsExcel(projectId);
  }

  exportAssignmentsExcel(projectId?: number, role?: string): Observable<Blob> {
    return this.api.exportUserSectionAssignmentsExcel(projectId, role);
  }

  downloadProjectsTemplate(): Observable<Blob> {
    return this.api.downloadFinancialProjectsTemplate();
  }

  downloadSectionsTemplate(): Observable<Blob> {
    return this.api.downloadProjectSectionsTemplate();
  }

  downloadAssignmentsTemplate(): Observable<Blob> {
    return this.api.downloadUserSectionAssignmentsTemplate();
  }

  importProjectsExcel(file: File, dryRun?: boolean): Observable<ImportResult> {
    return this.api.importFinancialProjectsExcel(file, dryRun);
  }

  importSectionsExcel(file: File, dryRun?: boolean): Observable<ImportResult> {
    return this.api.importProjectSectionsExcel(file, dryRun);
  }

  importAssignmentsExcel(file: File, dryRun?: boolean): Observable<ImportResult> {
    return this.api.importUserSectionAssignmentsExcel(file, dryRun);
  }

  // --- Projects CRUD ---
  loadProjects(): Observable<FinancialProject[]> {
    return this.api.getFinancialProjects();
  }

  createProject(payload: any): Observable<FinancialProject> {
    return this.api.createFinancialProject(payload);
  }

  updateProject(id: number, payload: any): Observable<FinancialProject> {
    return this.api.updateFinancialProject(id, payload);
  }

  deleteProject(id: number): Observable<any> {
    return this.api.deleteFinancialProject(id);
  }

  // --- Sections CRUD ---
  loadSections(): Observable<ProjectSection[]> {
    return this.api.getProjectSections();
  }

  createSection(payload: any): Observable<ProjectSection> {
    return this.api.createProjectSection(payload);
  }

  updateSection(id: number, payload: any): Observable<ProjectSection> {
    return this.api.updateProjectSection(id, payload);
  }

  deleteSection(id: number): Observable<any> {
    return this.api.deleteProjectSection(id);
  }

  // --- Assignments CRUD & Users ---
  loadAssignments(
    params?: { section_id?: number; project_id?: number; user_id?: number; role?: string },
    forceFresh?: boolean
  ): Observable<UserSectionAssignment[]> {
    return this.api.getUserSectionAssignments(params, forceFresh);
  }

  loadUsers(): Observable<User[]> {
    return this.accountsHttp.getUsers();
  }

  updateAssignment(id: number, payload: Partial<UserSectionAssignment>): Observable<UserSectionAssignment> {
    return this.api.updateUserSectionAssignment(id, payload);
  }

  deleteAssignment(id: number): Observable<any> {
    return this.api.deleteUserSectionAssignment(id);
  }

  bulkAssignUsers(payload: { section_id: number; user_ids: number[]; role: string }): Observable<UserSectionAssignment[]> {
    return this.api.bulkAssignUsersToSection(payload);
  }

  cloneSectionAssignments(targetSectionId: number, sourceSectionId: number): Observable<any> {
    return this.api.cloneSectionAssignments(targetSectionId, sourceSectionId);
  }
}
