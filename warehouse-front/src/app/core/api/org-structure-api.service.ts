import { Injectable } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { SKIP_OFFLINE } from '../interceptors/offline.interceptor';
import type { ImportResult } from '../http/accounts-http.service';
import { OrgProject, OrgProjectSection, OrgSectionAssignment } from '../models/company.model';

/** اندپوینت‌های ساختار سازمانی هسته (شرکت ← پروژه ← بخش) */
export const ORG_PROJECTS_ENDPOINT = 'org/projects';
export const ORG_SECTIONS_ENDPOINT = 'org/project-sections';
export const ORG_ASSIGNMENTS_ENDPOINT = 'org/section-assignments';

export interface OrgAssignmentFilters {
  section_id?: number;
  project_id?: number;
  user_id?: number;
  role?: string;
}

/**
 * API پروژه‌ها، بخش‌ها و انتساب کاربر به بخش در هسته (/api/org/).
 * `companyId` شرکت مقصد را صریح می‌فرستد (company_id بر هدر X-Company-ID شرکت فعال مقدم است)،
 * تا استودیوی یک شرکت فقط دادهٔ همان شرکت را ببیند و بنویسد.
 */
@Injectable({ providedIn: 'root' })
export class OrgStructureApiService {
  constructor(private api: ApiService) {}

  private static withCompany(params: Record<string, unknown> | undefined, companyId?: number | null): Record<string, unknown> | undefined {
    if (!companyId) return params;
    return { ...(params || {}), company_id: companyId };
  }

  private static importForm(file: File, dryRun: boolean, companyId?: number | null): FormData {
    const formData = new FormData();
    formData.append('file', file);
    if (dryRun) formData.append('dry_run', 'true');
    if (companyId) formData.append('company_id', String(companyId));
    return formData;
  }

  // ─── پروژه ───
  getProjects(params?: { is_active?: boolean; search?: string }, companyId?: number | null): Observable<OrgProject[]> {
    return this.api.get<OrgProject[]>(ORG_PROJECTS_ENDPOINT, OrgStructureApiService.withCompany(params, companyId));
  }

  createProject(data: Partial<OrgProject>): Observable<OrgProject> {
    return this.api.post<OrgProject>(ORG_PROJECTS_ENDPOINT, data);
  }

  updateProject(id: number, data: Partial<OrgProject>): Observable<OrgProject> {
    return this.api.patch<OrgProject>(`${ORG_PROJECTS_ENDPOINT}/${id}`, data);
  }

  deleteProject(id: number): Observable<void> {
    return this.api.delete<void>(`${ORG_PROJECTS_ENDPOINT}/${id}`);
  }

  exportProjectsExcel(companyId?: number | null): Observable<Blob> {
    return this.api.download(`${ORG_PROJECTS_ENDPOINT}/export-excel/`, OrgStructureApiService.withCompany(undefined, companyId));
  }

  downloadProjectsTemplate(): Observable<Blob> {
    return this.api.download(`${ORG_PROJECTS_ENDPOINT}/download-template/`);
  }

  importProjectsExcel(file: File, dryRun: boolean = false, companyId?: number | null): Observable<ImportResult> {
    return this.api.post<ImportResult>(`${ORG_PROJECTS_ENDPOINT}/import-excel/`, OrgStructureApiService.importForm(file, dryRun, companyId));
  }

  // ─── بخش ───
  getSections(params?: { project_id?: number; is_active?: boolean; search?: string }, companyId?: number | null): Observable<OrgProjectSection[]> {
    return this.api.get<OrgProjectSection[]>(ORG_SECTIONS_ENDPOINT, OrgStructureApiService.withCompany(params, companyId));
  }

  createSection(data: Partial<OrgProjectSection>): Observable<OrgProjectSection> {
    return this.api.post<OrgProjectSection>(ORG_SECTIONS_ENDPOINT, data);
  }

  updateSection(id: number, data: Partial<OrgProjectSection>): Observable<OrgProjectSection> {
    return this.api.patch<OrgProjectSection>(`${ORG_SECTIONS_ENDPOINT}/${id}`, data);
  }

  deleteSection(id: number): Observable<void> {
    return this.api.delete<void>(`${ORG_SECTIONS_ENDPOINT}/${id}`);
  }

  exportSectionsExcel(projectId?: number | null, companyId?: number | null): Observable<Blob> {
    const params = projectId ? { project_id: projectId } : undefined;
    return this.api.download(`${ORG_SECTIONS_ENDPOINT}/export-excel/`, OrgStructureApiService.withCompany(params, companyId));
  }

  downloadSectionsTemplate(): Observable<Blob> {
    return this.api.download(`${ORG_SECTIONS_ENDPOINT}/download-template/`);
  }

  importSectionsExcel(file: File, dryRun: boolean = false, companyId?: number | null): Observable<ImportResult> {
    return this.api.post<ImportResult>(`${ORG_SECTIONS_ENDPOINT}/import-excel/`, OrgStructureApiService.importForm(file, dryRun, companyId));
  }

  cloneSectionAssignments(targetSectionId: number, sourceSectionId: number): Observable<{ message?: string }> {
    return this.api.post<{ message?: string }>(`${ORG_SECTIONS_ENDPOINT}/${targetSectionId}/clone-assignments/`, {
      source_section_id: sourceSectionId
    });
  }

  // ─── انتساب کاربر به بخش ───
  /** forceFresh: پاسخ تازهٔ سرور، بی کش آفلاین (پس از نوشتن) */
  getAssignments(filters?: OrgAssignmentFilters, forceFresh: boolean = false, companyId?: number | null): Observable<OrgSectionAssignment[]> {
    const context = forceFresh ? new HttpContext().set(SKIP_OFFLINE, true) : undefined;
    return this.api.get<OrgSectionAssignment[]>(
      ORG_ASSIGNMENTS_ENDPOINT,
      OrgStructureApiService.withCompany(filters as Record<string, unknown> | undefined, companyId),
      { context }
    );
  }

  bulkAssign(data: { section_id: number; user_ids: number[]; role: string }): Observable<OrgSectionAssignment[]> {
    return this.api.post<OrgSectionAssignment[]>(`${ORG_ASSIGNMENTS_ENDPOINT}/bulk-assign/`, data);
  }

  createAssignment(data: Partial<OrgSectionAssignment>): Observable<OrgSectionAssignment> {
    return this.api.post<OrgSectionAssignment>(ORG_ASSIGNMENTS_ENDPOINT, data);
  }

  updateAssignment(id: number, data: Partial<OrgSectionAssignment>): Observable<OrgSectionAssignment> {
    return this.api.patch<OrgSectionAssignment>(`${ORG_ASSIGNMENTS_ENDPOINT}/${id}`, data);
  }

  deleteAssignment(id: number): Observable<void> {
    return this.api.delete<void>(`${ORG_ASSIGNMENTS_ENDPOINT}/${id}`);
  }

  /** بخش‌های فعال منتسب به کاربر جاری (superuser: همهٔ بخش‌های فعال) */
  getMySections(): Observable<OrgProjectSection[]> {
    return this.api.get<OrgProjectSection[]>(`${ORG_ASSIGNMENTS_ENDPOINT}/my-sections/`);
  }

  exportAssignmentsExcel(projectId?: number | null, role?: string, companyId?: number | null): Observable<Blob> {
    const params: Record<string, unknown> = {};
    if (projectId) params['project_id'] = projectId;
    if (role && role !== 'all') params['role'] = role;
    return this.api.download(`${ORG_ASSIGNMENTS_ENDPOINT}/export-excel/`, OrgStructureApiService.withCompany(params, companyId));
  }

  downloadAssignmentsTemplate(): Observable<Blob> {
    return this.api.download(`${ORG_ASSIGNMENTS_ENDPOINT}/download-template/`);
  }

  importAssignmentsExcel(file: File, dryRun: boolean = false, companyId?: number | null): Observable<ImportResult> {
    return this.api.post<ImportResult>(`${ORG_ASSIGNMENTS_ENDPOINT}/import-excel/`, OrgStructureApiService.importForm(file, dryRun, companyId));
  }
}
