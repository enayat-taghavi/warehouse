import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SKIP_OFFLINE } from '../../../core/interceptors/offline.interceptor';
import { SKIP_GLOBAL_ERROR_TOAST } from '../../../core/error/error.interceptor';
import {
  AudienceEntry, CircularRow, LetterAction, LetterDetail, LetterFilters, LetterPage, LetterParty, LetterProject,
  LetterViewDetail, LetterWritePayload, ReferPayload, ReferralTree, RegisterRow, TAB_PARAMS, TAB_STATUS,
} from '../letters.models';

/** نشانی پایهٔ API ماژول؛ الگوی صف آفلاین ماژول (`/letters/`) روی همین می‌نشیند. */
export const LETTERS_API = `${environment.apiUrl}/letters`;

/**
 * فهرست و جزئیات نامه کش محلی نمی‌شوند (SKIP_OFFLINE): موضوع نامهٔ محرمانه و سری نباید روی دستگاه بماند (ن۱۱).
 * ذخیرهٔ پیش‌نویس هم از رهگیر آفلاین رد می‌شود، چون صف آن را `LettersOfflineService` خودش می‌سازد (بی‌ردیف دوگانه).
 */
const NO_CACHE = () => new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true);

/** کنش‌های چرخهٔ نامه که فقط آنلاین‌اند و هرگز در صف نمی‌روند (ل-ز) */
export type LetterLifecycleAction = Exclude<LetterAction, 'edit' | 'refer'>;

@Injectable({ providedIn: 'root' })
export class LettersApiService {
  private readonly http = inject(HttpClient);

  list(filters: LetterFilters, company: number | null): Observable<LetterPage> {
    let params = new HttpParams().set('page', String(filters.page || 1));
    const status = filters.status || TAB_STATUS[filters.tab];
    if (status) params = params.set('status', status);
    for (const [key, value] of Object.entries(TAB_PARAMS[filters.tab] || {})) params = params.set(key, value);
    if (filters.kind) params = params.set('kind', filters.kind);
    if (filters.confidentiality) params = params.set('confidentiality', filters.confidentiality);
    if (filters.q.trim()) params = params.set('q', filters.q.trim());
    if (filters.project) params = params.set('project', String(filters.project));
    if (filters.due) params = params.set('due', filters.due);
    if (company) params = params.set('company', String(company));
    return this.http.get<LetterPage>(`${LETTERS_API}/`, { params, context: NO_CACHE() });
  }

  get(id: number): Observable<LetterViewDetail> {
    return this.http.get<LetterViewDetail>(`${LETTERS_API}/${id}/`, { context: NO_CACHE() });
  }

  create(payload: LetterWritePayload): Observable<LetterDetail> {
    return this.http.post<LetterDetail>(`${LETTERS_API}/`, payload, { context: NO_CACHE() });
  }

  update(id: number, payload: LetterWritePayload): Observable<LetterDetail> {
    return this.http.patch<LetterDetail>(`${LETTERS_API}/${id}/`, payload, { context: NO_CACHE() });
  }

  /** کنش‌های فقط-آنلاین (قفل ویرایش، ارسال برای امضا، ثبت وارده)؛ هرگز در صف نمی‌روند. */
  action(id: number, action: 'lock' | 'unlock' | 'submit' | 'register', body: Record<string, unknown> = {}): Observable<LetterDetail> {
    return this.http.post<LetterDetail>(`${LETTERS_API}/${id}/${action}/`, body, { context: NO_CACHE() });
  }

  /** امضا، عودت، ثبت، ارسال، بایگانی، بازگردانی و ابطال (ل-ز)؛ فقط آنلاین. */
  lifecycle(id: number, action: LetterLifecycleAction, body: Record<string, unknown> = {}): Observable<LetterViewDetail> {
    return this.http.post<LetterViewDetail>(`${LETTERS_API}/${id}/${action}/`, body, { context: NO_CACHE() });
  }

  referrals(id: number): Observable<ReferralTree> {
    return this.http.get<ReferralTree>(`${LETTERS_API}/${id}/referrals/`, { context: NO_CACHE() });
  }

  refer(id: number, payload: ReferPayload): Observable<ReferralTree & { created: number[] }> {
    return this.http.post<ReferralTree & { created: number[] }>(`${LETTERS_API}/${id}/refer/`, payload, { context: NO_CACHE() });
  }

  /** «انجام شد» و «رؤیت شد» همان اقدام‌های کار ارجاع هسته‌اند (`/api/workflow/tasks/<id>/action/`). */
  closeReferral(taskId: number, action: 'done' | 'seen', reply = ''): Observable<unknown> {
    return this.http.post(`${environment.apiUrl}/workflow/tasks/${taskId}/action/`, { action, reply },
      { context: NO_CACHE() });
  }

  register(company: number): Observable<RegisterRow[]> {
    const params = new HttpParams().set('company', String(company));
    return this.http.get<RegisterRow[]>(`${LETTERS_API}/register/`, { params, context: NO_CACHE() });
  }

  registerExport(company: number): Observable<Blob> {
    const params = new HttpParams().set('company', String(company));
    return this.http.get(`${LETTERS_API}/register/export/`, { params, responseType: 'blob', context: NO_CACHE() });
  }

  circulars(company: number | null, unread = false): Observable<CircularRow[]> {
    let params = new HttpParams();
    if (company) params = params.set('company', String(company));
    if (unread) params = params.set('unread', '1');
    return this.http.get<CircularRow[]>(`${LETTERS_API}/circulars/`, { params, context: NO_CACHE() });
  }

  audience(id: number): Observable<{ audience: AudienceEntry[] }> {
    return this.http.get<{ audience: AudienceEntry[] }>(`${LETTERS_API}/${id}/audience/`, { context: NO_CACHE() });
  }

  setAudience(id: number, audience: AudienceEntry[]): Observable<{ audience: AudienceEntry[]; revision: number }> {
    return this.http.put<{ audience: AudienceEntry[]; revision: number }>(`${LETTERS_API}/${id}/audience/`, { audience },
      { context: NO_CACHE() });
  }

  viewers(id: number): Observable<{ viewers: { user: { id: number; name: string } | null; first_viewed_at: string; times: number }[]; audience_count?: number }> {
    return this.http.get<any>(`${LETTERS_API}/${id}/viewers/`, { context: NO_CACHE() });
  }

  /** پیوست اسکن وارده با API پیوست هسته (همان مسیر `app-attachments`). */
  uploadScan(letterId: number, file: File): Observable<unknown> {
    const form = new FormData();
    form.append('file', file);
    form.append('kind', 'letters_letter');
    form.append('id', String(letterId));
    return this.http.post(`${environment.apiUrl}/attachments/`, form, { context: NO_CACHE() });
  }

  projects(company: number | null): Observable<LetterProject[]> {
    const params = company ? new HttpParams().set('company', String(company)) : undefined;
    return this.http.get<LetterProject[]>(`${LETTERS_API}/projects/`, { params, context: NO_CACHE() });
  }

  parties(company: number, q: string): Observable<LetterParty[]> {
    const params = new HttpParams().set('company', String(company)).set('q', q.trim());
    return this.http.get<LetterParty[]>(`${LETTERS_API}/parties/`, { params, context: NO_CACHE() });
  }

  createParty(company: number, data: { name: string; kind: 'person' | 'legal'; national_id?: string }): Observable<LetterParty> {
    return this.http.post<LetterParty>(`${LETTERS_API}/parties/`, { company, ...data }, { context: NO_CACHE() });
  }
}
