import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CompanyApiService } from '../../../../../core/api/company-api.service';
import { AccountsHttpService, User } from '../../../../../core/http/accounts-http.service';
import {
  CompanyDocument,
  CompanyFiscalPeriod,
} from '../../../../../core/models/company.model';

@Injectable()
export class CompaniesFacade {
  private api = inject(CompanyApiService);
  private accountsService = inject(AccountsHttpService);

  // ═════════════════════════════════════════════════════════════════════
  // ۱. مدیریت دوره‌های مالی (Fiscal Periods)
  // ═════════════════════════════════════════════════════════════════════
  getFiscalPeriods(companyId: number): Observable<CompanyFiscalPeriod[] | { results: CompanyFiscalPeriod[]; count: number }> {
    return this.api.getFiscalPeriods(companyId);
  }

  createFiscalPeriod(payload: Partial<CompanyFiscalPeriod>): Observable<CompanyFiscalPeriod> {
    return this.api.createFiscalPeriod(payload);
  }

  closeFiscalPeriod(id: number): Observable<{ detail: string }> {
    return this.api.closeFiscalPeriod(id);
  }

  freezeFiscalPeriod(id: number): Observable<{ detail: string }> {
    return this.api.freezeFiscalPeriod(id);
  }

  reopenFiscalPeriod(id: number): Observable<{ detail: string }> {
    return this.api.reopenFiscalPeriod(id);
  }

  // ═════════════════════════════════════════════════════════════════════
  // ۴. مدیریت و آرشیو مدارک حقوقی شرکت (Documents)
  // ═════════════════════════════════════════════════════════════════════
  getDocuments(params: { company_id: number; document_type?: string; search?: string }): Observable<CompanyDocument[] | { results: CompanyDocument[]; count: number }> {
    return this.api.getDocuments(params);
  }

  createDocument(formData: FormData): Observable<CompanyDocument> {
    return this.api.createDocument(formData);
  }

  deleteDocument(id: number): Observable<void> {
    return this.api.deleteDocument(id);
  }

  // ═════════════════════════════════════════════════════════════════════
  // ۵. مدیریت دسترسی‌های استودیو و کاربران سیستم (Studio Accesses)
  // ═════════════════════════════════════════════════════════════════════
  getUserAccesses(params: { company_id: number; user_id?: number }): Observable<any[]> {
    return this.api.getUserAccesses(params);
  }

  createUserAccess(payload: { user: number; company: number; access_level?: string; role_in_company?: string | null; is_default?: boolean }): Observable<any> {
    return this.api.createUserAccess(payload);
  }

  deleteUserAccess(id: number): Observable<void> {
    return this.api.deleteUserAccess(id);
  }

  loadSystemUsers(): Observable<User[]> {
    return this.accountsService.getUsers();
  }
}
