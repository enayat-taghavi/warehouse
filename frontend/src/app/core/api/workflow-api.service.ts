import { Injectable } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { SKIP_OFFLINE } from '../interceptors/offline.interceptor';
import { SKIP_GLOBAL_ERROR_TOAST } from '../error/error.interceptor';
import {
  WorkflowCompanySettings,
  WorkflowDefinition,
  WorkflowHistory,
  WorkflowInstanceState,
  WorkflowPerson,
  WorkflowSubstitute,
  WorkflowSubstituteInput,
  WorkflowTaskAction,
  WorkflowTaskPage,
  WorkflowThreshold,
  WorkflowThresholdInput,
} from '../models/workflow.model';

const WF = 'workflow';

/**
 * API موتور گردش کار (طرح ۲.۳). خواندن و اقدام «کارهای من» با نگه‌داری آفلاین و صف کار
 * `WorkflowTasksService` است؛ صفحه‌ها کارها را از آن سرویس بگیرند، نه مستقیم از اینجا.
 * فراخوان‌های این کلاس از کش آفلاین interceptor نمی‌گذرند (`SKIP_OFFLINE`)؛ خطا را خود صفحه نشان می‌دهد.
 */
@Injectable({ providedIn: 'root' })
export class WorkflowApiService {
  constructor(private api: ApiService) {}

  private static direct(): { context: HttpContext } {
    return { context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true) };
  }

  // ─── کارها (فقط برای WorkflowTasksService) ───

  getMyTasks(params?: { company?: number; workflow?: string; page?: number; page_size?: number }): Observable<WorkflowTaskPage> {
    return this.api.get<WorkflowTaskPage>(`${WF}/tasks`, params, WorkflowApiService.direct());
  }

  getMyTaskCount(): Observable<{ count: number }> {
    return this.api.get<{ count: number }>(`${WF}/tasks/count`, undefined, WorkflowApiService.direct());
  }

  postTaskAction(taskId: number, body: { action: WorkflowTaskAction; revision: number; reason?: string }): Observable<WorkflowInstanceState> {
    return this.api.post<WorkflowInstanceState>(`${WF}/tasks/${taskId}/action`, body, WorkflowApiService.direct());
  }

  /** علامت خواندن کارت ارجاع؛ ناهمسان و تکرارپذیر */
  markTaskRead(taskId: number): Observable<{ read: boolean }> {
    return this.api.post<{ read: boolean }>(`${WF}/tasks/${taskId}/read`, {}, WorkflowApiService.direct());
  }

  /** «کارهای بی‌دریافت‌کننده»؛ فقط مدیر کل سامانه (برای بقیه 403) */
  getUnassignedTasks(params?: { company?: number; page?: number; page_size?: number }): Observable<WorkflowTaskPage> {
    return this.api.get<WorkflowTaskPage>(`${WF}/tasks/unassigned`, params, WorkflowApiService.direct());
  }

  // ─── سابقه و لغو ───

  /** سابقهٔ گردش یک سند (ت۱۴)؛ 404 = سابقه‌ای نیست یا دیدنش مجاز نیست */
  getHistory(kind: string, id: number): Observable<WorkflowHistory> {
    return this.api.get<WorkflowHistory>(`${WF}/history`, { kind, id }, WorkflowApiService.direct());
  }

  /** لغو گردش به دست ثبت‌کننده؛ 409 cancel_not_allowed پس از اقدام نفر دیگر */
  cancelInstance(instanceId: number, reason = ''): Observable<WorkflowInstanceState> {
    return this.api.post<WorkflowInstanceState>(`${WF}/instances/${instanceId}/cancel`, { reason }, WorkflowApiService.direct());
  }

  getDefinitions(): Observable<WorkflowDefinition[]> {
    return this.api.get<WorkflowDefinition[]>(`${WF}/definitions`, undefined, WorkflowApiService.direct());
  }

  // ─── سقف مبلغ و تنظیمات شرکت ───

  getThresholds(companyId: number): Observable<WorkflowThreshold[]> {
    return this.api.get<WorkflowThreshold[]>(`${WF}/thresholds`, { company: companyId }, WorkflowApiService.direct());
  }

  saveThreshold(input: WorkflowThresholdInput): Observable<WorkflowThreshold> {
    return this.api.post<WorkflowThreshold>(`${WF}/thresholds`, input, WorkflowApiService.direct());
  }

  deleteThreshold(id: number): Observable<void> {
    return this.api.delete<void>(`${WF}/thresholds/${id}`, WorkflowApiService.direct());
  }

  getCompanySettings(companyId: number): Observable<WorkflowCompanySettings> {
    return this.api.get<WorkflowCompanySettings>(`${WF}/settings/${companyId}`, undefined, WorkflowApiService.direct());
  }

  saveCompanySettings(companyId: number, body: { reminder_hours: number; escalation_hours: number }): Observable<WorkflowCompanySettings> {
    return this.api.put<WorkflowCompanySettings>(`${WF}/settings/${companyId}`, body, WorkflowApiService.direct());
  }

  // ─── جانشین موقت ───

  /** بی‌پارامتر: ردیف‌هایی که کاربر صاحب کار یا جانشین است؛ با principal: ردیف‌های آن کاربر (برای مدیر) */
  getSubstitutes(principal?: number): Observable<WorkflowSubstitute[]> {
    return this.api.get<WorkflowSubstitute[]>(
      `${WF}/substitutes`, principal != null ? { principal } : undefined, WorkflowApiService.direct());
  }

  /** هم‌شرکتی‌هایی که می‌توانند جانشین صاحب کار شوند (همان شرط ثبت؛ فقط شناسه و نام). */
  getSubstituteCandidates(principal?: number, company?: number | null): Observable<WorkflowPerson[]> {
    const params: Record<string, number> = {};
    if (principal != null) params['principal'] = principal;
    if (company != null) params['company'] = company;
    return this.api.get<WorkflowPerson[]>(`${WF}/substitutes/candidates`, params, WorkflowApiService.direct());
  }

  createSubstitute(input: WorkflowSubstituteInput): Observable<WorkflowSubstitute> {
    return this.api.post<WorkflowSubstitute>(`${WF}/substitutes`, input, WorkflowApiService.direct());
  }

  revokeSubstitute(id: number): Observable<WorkflowSubstitute> {
    return this.api.delete<WorkflowSubstitute>(`${WF}/substitutes/${id}`, WorkflowApiService.direct());
  }
}
