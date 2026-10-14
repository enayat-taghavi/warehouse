import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Company,
  CompanyDocument,
  CompanyBankAccount,
  CompanyBoardMember,
  CompanyFiscalPeriod,
  ExpiringDocumentsResponse,
  UserAvailableCompaniesResponse
} from '../models/company.model';
import { ModuleRegistryService } from '../modules/module-registry.service';

@Injectable({
  providedIn: 'root'
})
export class CompanyApiService {
  private http = inject(HttpClient);
  private moduleRegistry = inject(ModuleRegistryService);
  private documentsEndpoint = `${environment.apiUrl}/personnel/company-documents`;
  private bankAccountsEndpoint = `${environment.apiUrl}/personnel/company-bank-accounts`;
  private boardMembersEndpoint = `${environment.apiUrl}/personnel/company-board-members`;

  /**
   * شرکت‌ها در هسته‌اند (/org/companies). اگر حسابداری نصب باشد، نسخهٔ حسابداری همان منبع
   * (/personnel/companies) شمار پروژه‌ها، مدارک، حساب‌های بانکی و هیئت‌مدیره را هم برمی‌گرداند.
   */
  private get endpoint(): string {
    const ep = this.moduleRegistry.getExtensions('companyApiEndpoints')[0]?.extension;
    return ep?.companiesEndpoint
      ? `${environment.apiUrl}${ep.companiesEndpoint}`
      : `${environment.apiUrl}/org/companies`;
  }

  /**
   * دسترسی کاربر به شرکت هم در هسته است. با نصب حسابداری همان مسیر قبلی (نام مستعار همان ویوست هسته)
   * نگه داشته می‌شود تا کلید کش آفلاین و نشانیِ درخواست‌های صف‌شدهٔ قبلی عوض نشود.
   */
  private get accessEndpoint(): string {
    const ep = this.moduleRegistry.getExtensions('companyApiEndpoints')[0]?.extension;
    return ep?.accessEndpoint
      ? `${environment.apiUrl}${ep.accessEndpoint}`
      : `${environment.apiUrl}/org/user-company-access`;
  }

  getAll(filters?: { search?: string; is_active?: boolean }): Observable<Company[] | { results: Company[]; count: number }> {
    let params = new HttpParams();
    if (filters?.search) {
      params = params.set('search', filters.search);
    }
    if (filters?.is_active !== undefined) {
      params = params.set('is_active', String(filters.is_active));
    }
    return this.http.get<Company[] | { results: Company[]; count: number }>(`${this.endpoint}/`, { params });
  }

  getById(id: number): Observable<Company> {
    return this.http.get<Company>(`${this.endpoint}/${id}/`);
  }

  create(payload: Partial<Company>): Observable<Company> {
    return this.http.post<Company>(`${this.endpoint}/`, payload);
  }

  update(id: number, payload: Partial<Company>): Observable<Company> {
    return this.http.put<Company>(`${this.endpoint}/${id}/`, payload);
  }

  patch(id: number, payload: Partial<Company>): Observable<Company> {
    return this.http.patch<Company>(`${this.endpoint}/${id}/`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.endpoint}/${id}/`);
  }

  getUserAvailable(scope?: 'workspace' | 'documents' | 'all'): Observable<UserAvailableCompaniesResponse> {
    let params = new HttpParams();
    if (scope) {
      params = params.set('scope', scope);
    }
    return this.http.get<UserAvailableCompaniesResponse>(`${this.endpoint}/user-available/`, { params });
  }

  exportExcel(): Observable<Blob> {
    return this.http.get(`${this.endpoint}/export-excel/`, { responseType: 'blob' });
  }

  uploadLogo(id: number, file: File): Observable<Company> {
    const formData = new FormData();
    formData.append('logo', file);
    return this.http.patch<Company>(`${this.endpoint}/${id}/`, formData);
  }

  deleteLogo(id: number): Observable<Company> {
    return this.http.patch<Company>(`${this.endpoint}/${id}/`, { logo: null });
  }

  uploadCoreDoc(id: number, docType: 'articles_of_association' | 'latest_gazette', file: File): Observable<Company> {
    const formData = new FormData();
    formData.append(docType, file);
    return this.http.patch<Company>(`${this.endpoint}/${id}/`, formData);
  }

  // مدیریت اسناد و آرشیو مدارک شرکت
  getDocuments(params?: { company_id?: number; document_type?: string; search?: string }): Observable<CompanyDocument[] | { results: CompanyDocument[]; count: number }> {
    let httpParams = new HttpParams();
    if (params?.company_id) httpParams = httpParams.set('company_id', String(params.company_id));
    if (params?.document_type) httpParams = httpParams.set('document_type', params.document_type);
    if (params?.search) httpParams = httpParams.set('search', params.search);
    return this.http.get<CompanyDocument[] | { results: CompanyDocument[]; count: number }>(`${this.documentsEndpoint}/`, { params: httpParams });
  }

  createDocument(formData: FormData): Observable<CompanyDocument> {
    return this.http.post<CompanyDocument>(`${this.documentsEndpoint}/`, formData);
  }

  deleteDocument(id: number): Observable<void> {
    return this.http.delete<void>(`${this.documentsEndpoint}/${id}/`);
  }

  downloadDocument(id: number): Observable<Blob> {
    return this.http.get(`${this.documentsEndpoint}/${id}/download/`, { responseType: 'blob' });
  }

  getExpiringDocuments(): Observable<ExpiringDocumentsResponse> {
    return this.http.get<ExpiringDocumentsResponse>(`${this.endpoint}/expiring-documents/`);
  }

  getUserAccesses(params?: { user_id?: number; company_id?: number }): Observable<any[]> {
    let httpParams = new HttpParams();
    if (params?.user_id) httpParams = httpParams.set('user_id', String(params.user_id));
    if (params?.company_id) httpParams = httpParams.set('company_id', String(params.company_id));
    return this.http.get<any[]>(`${this.accessEndpoint}/`, { params: httpParams });
  }

  createUserAccess(payload: {
    user: number;
    company: number;
    access_level?: string;
    role_in_company?: string | null;
    is_default?: boolean;
  }): Observable<any> {
    return this.http.post<any>(`${this.accessEndpoint}/`, payload);
  }

  updateUserAccess(id: number, payload: any): Observable<any> {
    return this.http.patch<any>(`${this.accessEndpoint}/${id}/`, payload);
  }

  deleteUserAccess(id: number): Observable<void> {
    return this.http.delete<void>(`${this.accessEndpoint}/${id}/`);
  }

  // مدیریت حساب‌های بانکی و شبای رسمی شرکت
  getBankAccounts(companyId?: number): Observable<CompanyBankAccount[] | { results: CompanyBankAccount[]; count: number }> {
    let params = new HttpParams();
    if (companyId) {
      params = params.set('company_id', String(companyId));
    }
    return this.http.get<CompanyBankAccount[] | { results: CompanyBankAccount[]; count: number }>(`${this.bankAccountsEndpoint}/`, { params });
  }

  createBankAccount(payload: Partial<CompanyBankAccount>): Observable<CompanyBankAccount> {
    return this.http.post<CompanyBankAccount>(`${this.bankAccountsEndpoint}/`, payload);
  }

  updateBankAccount(id: number, payload: Partial<CompanyBankAccount>): Observable<CompanyBankAccount> {
    return this.http.put<CompanyBankAccount>(`${this.bankAccountsEndpoint}/${id}/`, payload);
  }

  deleteBankAccount(id: number): Observable<void> {
    return this.http.delete<void>(`${this.bankAccountsEndpoint}/${id}/`);
  }

  setPrimaryBankAccount(id: number): Observable<CompanyBankAccount> {
    return this.http.post<CompanyBankAccount>(`${this.bankAccountsEndpoint}/${id}/set-primary/`, {});
  }

  // مدیریت اعضای هیئت‌مدیره و ارکان قانونی شرکت
  getBoardMembers(companyId?: number, search?: string): Observable<CompanyBoardMember[] | { results: CompanyBoardMember[]; count: number }> {
    let params = new HttpParams();
    if (companyId) {
      params = params.set('company_id', String(companyId));
    }
    if (search) {
      params = params.set('search', search);
    }
    return this.http.get<CompanyBoardMember[] | { results: CompanyBoardMember[]; count: number }>(`${this.boardMembersEndpoint}/`, { params });
  }

  createBoardMember(payload: FormData | Partial<CompanyBoardMember>): Observable<CompanyBoardMember> {
    return this.http.post<CompanyBoardMember>(`${this.boardMembersEndpoint}/`, payload);
  }

  updateBoardMember(id: number, payload: FormData | Partial<CompanyBoardMember>): Observable<CompanyBoardMember> {
    return this.http.patch<CompanyBoardMember>(`${this.boardMembersEndpoint}/${id}/`, payload);
  }

  deleteBoardMember(id: number): Observable<void> {
    return this.http.delete<void>(`${this.boardMembersEndpoint}/${id}/`);
  }

  // مدیریت سال‌ها و دوره‌های مالی رسمی شرکت
  private fiscalPeriodsEndpoint = `${environment.apiUrl}/personnel/company-fiscal-periods`;

  getFiscalPeriods(companyId?: number, fiscalYear?: string): Observable<CompanyFiscalPeriod[] | { results: CompanyFiscalPeriod[]; count: number }> {
    let params = new HttpParams();
    if (companyId) {
      params = params.set('company_id', String(companyId));
    }
    if (fiscalYear) {
      params = params.set('fiscal_year', fiscalYear);
    }
    return this.http.get<CompanyFiscalPeriod[] | { results: CompanyFiscalPeriod[]; count: number }>(`${this.fiscalPeriodsEndpoint}/`, { params });
  }

  createFiscalPeriod(payload: Partial<CompanyFiscalPeriod>): Observable<CompanyFiscalPeriod> {
    return this.http.post<CompanyFiscalPeriod>(`${this.fiscalPeriodsEndpoint}/`, payload);
  }

  closeFiscalPeriod(id: number, notes?: string): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(`${this.fiscalPeriodsEndpoint}/${id}/close-period/`, { notes });
  }

  freezeFiscalPeriod(id: number): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(`${this.fiscalPeriodsEndpoint}/${id}/freeze-period/`, {});
  }

  reopenFiscalPeriod(id: number): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(`${this.fiscalPeriodsEndpoint}/${id}/reopen-period/`, {});
  }
}

