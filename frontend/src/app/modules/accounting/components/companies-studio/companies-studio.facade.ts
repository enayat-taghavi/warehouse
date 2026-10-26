import { Injectable, Injector, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CompanyApiService } from '../../../../core/api/company-api.service';
import { ApiService } from '../../../../core/api/api.service';
import { CompanyBankAccount, CompanyBankOpeningBalancePayload, CompanyBankOpeningHistoryEntry, CompanyBoardMember, CompanyDocument, CompanyFiscalPeriod } from '../../../../core/models/company.model';

/**
 * دسترسی دادهٔ تب‌ها و بخش‌های حسابداری استودیوی شرکت (C3).
 * نشانی‌ها از افزونهٔ `companyApiEndpoints` همین ماژول در CompanyApiService ساخته می‌شوند.
 */
/** پروندهٔ بیمه و مالیات شرکت برای دیسکت حقوق (مدل حسابداری `CompanyPayrollProfile`؛ پیش از نخستین ذخیره همه null) */
export interface CompanyPayrollProfile {
  company?: number;
  workshop_code: string | null;
  social_security_branch_code: string | null;
  social_security_branch_name: string | null;
  contract_row: string | null;
  employer_name: string | null;
  tax_memory_id: string | null;
  tax_economic_code: string | null;
  updated_at?: string | null;
  /** false = کاربر سطح «خواندن» حوزهٔ insurance_tax را ندارد و شناسه‌ها null آمده‌اند (ت۱۲ طرح ۲.۲) */
  identifiers_visible?: boolean;
  /** پاسخ خوش‌بینانهٔ صف آفلاین */
  _offlinePending?: boolean;
}

export const PAYROLL_PROFILE_FIELDS = [
  'workshop_code', 'social_security_branch_code', 'social_security_branch_name', 'contract_row',
  'employer_name', 'tax_memory_id', 'tax_economic_code'
] as const;

export type PayrollProfileField = typeof PAYROLL_PROFILE_FIELDS[number];

@Injectable()
export class CompaniesStudioFacade {
  private api = inject(CompanyApiService);
  private injector = inject(Injector);
  /** تنبل: specهای تب‌های دیگر که فقط CompanyApiService را جایگزین می‌کنند به HttpClient نیاز پیدا نکنند */
  private get http(): ApiService {
    return this.injector.get(ApiService);
  }

  // ═════════════════════════════════════════════════════════════════════
  // بیمه و مالیات (پروندهٔ دیسکت حقوق؛ حوزهٔ insurance_tax)
  // ═════════════════════════════════════════════════════════════════════
  getPayrollProfile(companyId: number): Observable<CompanyPayrollProfile> {
    return this.http.get<CompanyPayrollProfile>(`personnel/companies/${companyId}/payroll-profile`);
  }

  updatePayrollProfile(companyId: number, payload: Partial<CompanyPayrollProfile>): Observable<CompanyPayrollProfile> {
    return this.http.patch<CompanyPayrollProfile>(`personnel/companies/${companyId}/payroll-profile`, payload);
  }

  // ═════════════════════════════════════════════════════════════════════
  // حساب‌های بانکی و شبا (Bank Accounts & Sheba)
  // ═════════════════════════════════════════════════════════════════════
  getBankAccounts(companyId: number): Observable<CompanyBankAccount[] | { results: CompanyBankAccount[]; count: number }> {
    return this.api.getBankAccounts(companyId);
  }

  createBankAccount(payload: Partial<CompanyBankAccount>): Observable<CompanyBankAccount> {
    return this.api.createBankAccount(payload);
  }

  updateBankAccount(id: number, payload: Partial<CompanyBankAccount>): Observable<CompanyBankAccount> {
    return this.api.updateBankAccount(id, payload);
  }

  deleteBankAccount(id: number): Observable<void> {
    return this.api.deleteBankAccount(id);
  }

  setPrimaryBankAccount(id: number): Observable<CompanyBankAccount> {
    return this.api.setPrimaryBankAccount(id);
  }

  setOpeningBalance(id: number, body: CompanyBankOpeningBalancePayload): Observable<CompanyBankAccount> {
    return this.api.setOpeningBalance(id, body);
  }

  getOpeningHistory(id: number): Observable<{ count: number; results: CompanyBankOpeningHistoryEntry[] }> {
    return this.api.getOpeningHistory(id);
  }

  // ═════════════════════════════════════════════════════════════════════
  // اعضای هیئت‌مدیره (Board Members)
  // ═════════════════════════════════════════════════════════════════════
  getBoardMembers(companyId: number): Observable<CompanyBoardMember[] | { results: CompanyBoardMember[]; count: number }> {
    return this.api.getBoardMembers(companyId);
  }

  createBoardMember(payload: FormData | Partial<CompanyBoardMember>): Observable<CompanyBoardMember> {
    return this.api.createBoardMember(payload);
  }

  updateBoardMember(id: number, payload: FormData | Partial<CompanyBoardMember>): Observable<CompanyBoardMember> {
    return this.api.updateBoardMember(id, payload);
  }

  deleteBoardMember(id: number): Observable<void> {
    return this.api.deleteBoardMember(id);
  }

  // ═════════════════════════════════════════════════════════════════════
  // دوره‌های مالی (Fiscal Periods)
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

  reopenFiscalPeriod(id: number): Observable<{ detail: string }> {
    return this.api.reopenFiscalPeriod(id);
  }

  // ═════════════════════════════════════════════════════════════════════
  // بایگانی جامع مدارک شرکت (Documents)
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
}
