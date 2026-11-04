import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SKIP_OFFLINE } from '../../../core/interceptors/offline.interceptor';
import { SKIP_GLOBAL_ERROR_TOAST } from '../../../core/error/error.interceptor';
import {
  LetterDetail, LetterFilters, LetterPage, LetterParty, LetterProject, LetterWritePayload, TAB_STATUS,
} from '../letters.models';

/** نشانی پایهٔ API ماژول؛ الگوی صف آفلاین ماژول (`/letters/`) روی همین می‌نشیند. */
export const LETTERS_API = `${environment.apiUrl}/letters`;

/**
 * فهرست و جزئیات نامه کش محلی نمی‌شوند (SKIP_OFFLINE): موضوع نامهٔ محرمانه و سری نباید روی دستگاه بماند (ن۱۱).
 * ذخیرهٔ پیش‌نویس هم از رهگیر آفلاین رد می‌شود، چون صف آن را `LettersOfflineService` خودش می‌سازد (بی‌ردیف دوگانه).
 */
const NO_CACHE = () => new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true);

@Injectable({ providedIn: 'root' })
export class LettersApiService {
  private readonly http = inject(HttpClient);

  list(filters: LetterFilters, company: number | null): Observable<LetterPage> {
    let params = new HttpParams().set('page', String(filters.page || 1));
    const status = filters.status || TAB_STATUS[filters.tab];
    if (status) params = params.set('status', status);
    if (filters.kind) params = params.set('kind', filters.kind);
    if (filters.confidentiality) params = params.set('confidentiality', filters.confidentiality);
    if (filters.q.trim()) params = params.set('q', filters.q.trim());
    if (filters.project) params = params.set('project', String(filters.project));
    if (filters.due) params = params.set('due', filters.due);
    if (company) params = params.set('company', String(company));
    return this.http.get<LetterPage>(`${LETTERS_API}/`, { params, context: NO_CACHE() });
  }

  get(id: number): Observable<LetterDetail> {
    return this.http.get<LetterDetail>(`${LETTERS_API}/${id}/`, { context: NO_CACHE() });
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
