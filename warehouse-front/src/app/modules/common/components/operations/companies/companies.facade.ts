import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { CompanyApiService } from '../../../../../core/api/company-api.service';
import { AccountsHttpService, User } from '../../../../../core/http/accounts-http.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import {
  CompanyBankAccount,
  CompanyBoardMember,
  CompanyDocument,
  CompanyFiscalPeriod,
} from '../../../../../core/models/company.model';
import {
  validateAccountNumber,
  generateShebaFromAccount,
  cleanShebaInput,
  extractShebaDigits,
  validateSheba,
  IRANIAN_BANKS
} from '../../../../../core/utils/sheba-utils';
import { resolveServerUrl } from '../../../../../core/platform/server-origin';

@Injectable()
export class CompaniesFacade {
  private api = inject(CompanyApiService);
  private accountsService = inject(AccountsHttpService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService, { optional: true });

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
  // ۲. مدیریت حساب‌های بانکی و اعتبارسنجی شبا (Bank Accounts & Sheba)
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

  generateSheba(accountNumber: string, bankName: string): { success: boolean; sheba?: string; formattedSheba?: string; error?: string } {
    if (!accountNumber || !bankName) {
      return { success: false, error: 'شماره حساب و نام بانک الزامی است' };
    }
    const bank = IRANIAN_BANKS.find(b => b.name === bankName);
    if (!bank) {
      return { success: false, error: 'بانک انتخاب‌شده نامعتبر است' };
    }
    const valRes = validateAccountNumber(accountNumber, bank.code);
    if (!valRes.isValid) {
      return { success: false, error: valRes.errorMessage || 'شماره حساب نامعتبر است' };
    }
    const generated = generateShebaFromAccount(accountNumber, bank.code);
    if (!generated) {
      return { success: false, error: 'تولید شماره شبا با خطا مواجه شد' };
    }
    const shebaVal = validateSheba(generated);
    return {
      success: true,
      sheba: shebaVal.rawSheba,
      formattedSheba: shebaVal.formattedDigits
    };
  }

  // ═════════════════════════════════════════════════════════════════════
  // ۳. مدیریت اعضای هیئت‌مدیره (Board Members)
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

  async fetchPdfBuffer(url: string): Promise<ArrayBuffer> {
    if (this.http) {
      return firstValueFrom(this.http.get(url, { responseType: 'arraybuffer' }));
    }
    const res = await fetch(resolveServerUrl(url));
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return res.arrayBuffer();
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
