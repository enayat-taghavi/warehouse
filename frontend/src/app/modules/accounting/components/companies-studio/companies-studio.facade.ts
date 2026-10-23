import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CompanyApiService } from '../../../../core/api/company-api.service';
import { CompanyBankAccount, CompanyBoardMember, CompanyDocument, CompanyFiscalPeriod } from '../../../../core/models/company.model';

/**
 * دسترسی دادهٔ تب‌ها و بخش‌های حسابداری استودیوی شرکت (C3).
 * نشانی‌ها از افزونهٔ `companyApiEndpoints` همین ماژول در CompanyApiService ساخته می‌شوند.
 */
@Injectable()
export class CompaniesStudioFacade {
  private api = inject(CompanyApiService);

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

  freezeFiscalPeriod(id: number): Observable<{ detail: string }> {
    return this.api.freezeFiscalPeriod(id);
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
