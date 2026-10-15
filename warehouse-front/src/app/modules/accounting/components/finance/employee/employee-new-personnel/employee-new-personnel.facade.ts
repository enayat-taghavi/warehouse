import { Injectable } from '@angular/core';
import { Observable, concat, of } from 'rxjs';
import { catchError, map, switchMap, toArray } from 'rxjs/operators';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import {
  ProjectSection,
  PersonnelProfile,
  PersonnelBankAccount,
  PersonnelDocument,
  WorkflowAuditLog
} from '../../../../../../core/models/personnel.model';
import { ImportResult } from '../../../../../../core/http/accounts-http.service';
import { cleanShebaInput } from '../../../../../../core/utils/sheba-utils';

@Injectable()
export class EmployeeNewPersonnelFacade {
  constructor(
    private personnelApi: PersonnelApiService,
    private toast: ToastService
  ) {}

  getMySections(): Observable<ProjectSection[]> {
    return this.personnelApi.getMySections();
  }

  getProjectSections(params?: any): Observable<ProjectSection[]> {
    return this.personnelApi.getProjectSections(params);
  }

  loadPersonnelProfiles(sectionId: number): Observable<PersonnelProfile[]> {
    return this.personnelApi.getPersonnelProfiles({ section_id: sectionId });
  }

  getPersonnelProfile(id: number): Observable<PersonnelProfile> {
    return this.personnelApi.getPersonnelProfile(id);
  }

  createPersonnelProfile(payload: Partial<PersonnelProfile> | FormData): Observable<PersonnelProfile> {
    return this.personnelApi.createPersonnelProfile(payload as any);
  }

  updatePersonnelProfile(id: number, payload: Partial<PersonnelProfile> | FormData): Observable<any> {
    return this.personnelApi.updatePersonnelProfile(id, payload as any);
  }

  deletePersonnelProfile(id: number): Observable<any> {
    return this.personnelApi.deletePersonnelProfile(id);
  }

  submitPersonnelProfile(id: number): Observable<any> {
    return this.personnelApi.submitPersonnelProfile(id);
  }

  reopenPersonnelProfile(id: number): Observable<any> {
    return this.personnelApi.reopenPersonnelProfile(id);
  }

  cancelPersonnelChangeRequest(crId: number): Observable<any> {
    return this.personnelApi.cancelPersonnelChangeRequest(crId);
  }

  getWorkflowAuditLogs(params: { content_type: string; object_id?: number }): Observable<WorkflowAuditLog[]> {
    return this.personnelApi.getWorkflowAuditLogs(params);
  }

  exportPersonnelExcel(sectionId: number): Observable<Blob> {
    return this.personnelApi.exportPersonnelExcel({ section_id: sectionId });
  }

  importPersonnelExcelModal(file: File, sectionId: number, updateExisting: boolean, dryRun?: boolean): Observable<ImportResult> {
    return this.personnelApi.importPersonnelExcelModal(file, sectionId, updateExisting, dryRun);
  }

  downloadPersonnelTemplate(): Observable<Blob> {
    return this.personnelApi.downloadPersonnelTemplate();
  }

  getPersonnelBankAccounts(personnelId: number): Observable<PersonnelBankAccount[]> {
    return this.personnelApi.getPersonnelBankAccounts(personnelId);
  }

  addPersonnelBankAccount(personnelId: number, acc: PersonnelBankAccount): Observable<PersonnelBankAccount> {
    return this.personnelApi.addPersonnelBankAccount(personnelId, acc);
  }

  updatePersonnelBankAccount(personnelId: number, acc: PersonnelBankAccount): Observable<any> {
    return this.personnelApi.updatePersonnelBankAccount(personnelId, acc);
  }

  deletePersonnelBankAccount(personnelId: number, accountId: number): Observable<any> {
    return this.personnelApi.deletePersonnelBankAccount(personnelId, accountId);
  }

  getPersonnelDocuments(personnelId: number): Observable<PersonnelDocument[]> {
    if (typeof this.personnelApi?.getPersonnelDocuments !== 'function') return of([]);
    return this.personnelApi.getPersonnelDocuments(personnelId);
  }

  uploadPersonnelDocument(personnelId: number, file: File, docType: string = 'other'): Observable<PersonnelDocument> {
    if (typeof this.personnelApi?.uploadPersonnelDocument !== 'function') return of({} as any);
    return this.personnelApi.uploadPersonnelDocument(personnelId, file, docType);
  }

  deletePersonnelDocument(personnelId: number, docId: number): Observable<any> {
    if (typeof this.personnelApi?.deletePersonnelDocument !== 'function') return of({ success: true });
    return this.personnelApi.deletePersonnelDocument(personnelId, docId);
  }

  lookupPersonnelByNationalCode(code: string): Observable<any> {
    if (typeof this.personnelApi?.lookupPersonnelByNationalCode !== 'function') return of({ found: false });
    return this.personnelApi.lookupPersonnelByNationalCode(code);
  }

  getJobTitles(): Observable<any> {
    return this.personnelApi.getJobTitles();
  }

  assignPersonnelToSection(personnelId: number, data: any): Observable<any> {
    return this.personnelApi.assignPersonnelToSection(personnelId, data);
  }

  syncBankAccounts$(personnelId: number, desired: PersonnelBankAccount[], original: PersonnelBankAccount[]): Observable<string[]> {
    const snapshot = (list: PersonnelBankAccount[]) => JSON.stringify(list.map(a => [a.id ?? null, a.bank_name, a.account_number || '', cleanShebaInput(String(a.sheba_number || '')), a.card_number || '', !!a.is_primary]));
    if (snapshot(desired) === snapshot(original)) return of([]);

    const body = (a: PersonnelBankAccount) => ({
      bank_name: a.bank_name,
      account_number: a.account_number || '',
      sheba_number: cleanShebaInput(String(a.sheba_number || '')),
      card_number: a.card_number || '',
      description: a.description || ''
    });
    const ops: Array<{ label: string; obs: Observable<any> }> = [];
    const primary = desired.find(a => a.is_primary) || desired[0];
    const ordered = primary ? [primary, ...desired.filter(a => a !== primary)] : desired;
    for (const acc of ordered) {
      const isPrimary = acc === primary;
      if (!acc.id) {
        ops.push({ label: acc.bank_name, obs: this.personnelApi.addPersonnelBankAccount(personnelId, { ...body(acc), is_primary: isPrimary }) });
        continue;
      }
      const orig = original.find(o => o.id === acc.id);
      const changes: Record<string, any> = {};
      const fields: Array<keyof PersonnelBankAccount> = ['bank_name', 'account_number', 'sheba_number', 'card_number', 'description'];
      for (const f of fields) {
        const cur = f === 'sheba_number' ? cleanShebaInput(String(acc.sheba_number || '')) : acc[f];
        const origVal = f === 'sheba_number' ? cleanShebaInput(String(orig?.sheba_number || '')) : orig?.[f];
        if (String(cur ?? '').trim() !== String(origVal ?? '').trim()) changes[f as string] = cur ?? '';
      }
      if (isPrimary && !orig?.is_primary) changes['is_primary'] = true;
      if (Object.keys(changes).length) {
        ops.push({ label: acc.bank_name, obs: this.personnelApi.updatePersonnelBankAccount(personnelId, { id: acc.id, ...changes }) });
      }
    }
    const keptIds = new Set(desired.filter(a => a.id).map(a => a.id));
    const deletions: Array<{ label: string; obs: Observable<any> }> = [];
    for (const orig of original) {
      if (orig.id && !keptIds.has(orig.id)) {
        deletions.push({ label: orig.bank_name, obs: this.personnelApi.deletePersonnelBankAccount(personnelId, orig.id) });
      }
    }
    const extractErr = (err: any) => err?.error?.error || err?.error?.detail || err?.message || 'نامشخص';
    const runAll = (list: Array<{ label: string; obs: Observable<any> }>): Observable<string[]> => list.length
      ? concat(...list.map(op => op.obs.pipe(
          map(() => null as string | null),
          catchError(err => of(`حساب «${op.label}»: ${extractErr(err)}`))
        ))).pipe(toArray(), map(results => results.filter((r): r is string => !!r)))
      : of([]);

    return runAll(ops).pipe(switchMap(problems => {
      if (problems.length && deletions.length) {
        return of([...problems, `${deletions.length} حساب کنارگذاشته حذف نشد تا ابتدا حساب جایگزین با موفقیت ثبت شود`]);
      }
      return runAll(deletions).pipe(map(deleteProblems => [...problems, ...deleteProblems]));
    }));
  }

  uploadPendingDocuments$(personnelId: number, queue: Array<{ file: File; doc_type: string; previewUrl: string; name: string; size: number }>): Observable<{ problems: string[]; uploaded: PersonnelDocument[]; remaining: any[] }> {
    if (queue.length === 0) return of({ problems: [], uploaded: [], remaining: [] });
    const extractErr = (err: any) => err?.error?.error || err?.error?.detail || err?.message || 'نامشخص';
    const uploadedDocs: PersonnelDocument[] = [];
    const remaining = [...queue];
    return concat(...queue.map(doc => this.personnelApi.uploadPersonnelDocument(personnelId, doc.file, doc.doc_type).pipe(
      map((uploaded: PersonnelDocument) => {
        const idx = remaining.indexOf(doc);
        if (idx !== -1) remaining.splice(idx, 1);
        if (uploaded) uploadedDocs.push(uploaded);
        if (doc.previewUrl) {
          try { URL.revokeObjectURL(doc.previewUrl); } catch {}
        }
        return null as string | null;
      }),
      catchError(err => of(`مدرک «${doc.name}»: ${extractErr(err)}`))
    ))).pipe(toArray(), map(results => ({
      problems: results.filter((r): r is string => !!r),
      uploaded: uploadedDocs,
      remaining
    })));
  }

  addExtraAccountsAfterFormDataCreate$(personnelId: number, bankAccounts: PersonnelBankAccount[]): Observable<string[]> {
    const extras = bankAccounts.filter(a => !a.is_primary);
    if (!extras.length) return of([]);
    const extractErr = (err: any) => err?.error?.error || err?.error?.detail || err?.message || 'نامشخص';
    return concat(...extras.map(acc => this.personnelApi.addPersonnelBankAccount(personnelId, {
      bank_name: acc.bank_name,
      account_number: acc.account_number || '',
      sheba_number: cleanShebaInput(String(acc.sheba_number || '')),
      card_number: acc.card_number || '',
      is_primary: false
    }).pipe(
      map(() => null as string | null),
      catchError(err => of(`حساب «${acc.bank_name}»: ${extractErr(err)}`))
    ))).pipe(toArray(), map(results => results.filter((r): r is string => !!r)));
  }

  createPersonnelFull$(
    payload: Record<string, any> | FormData,
    isFormData: boolean,
    bankAccounts: PersonnelBankAccount[],
    pendingDocs: any[]
  ): Observable<{ created: any; problems: string[]; queued: boolean; uploadedDocs?: PersonnelDocument[]; remainingDocs?: any[] }> {
    return this.createPersonnelProfile(payload as any).pipe(
      switchMap((created: any) => {
        if (created?._offlinePending || !created?.id || created.id < 0) {
          return of({ created, problems: [] as string[], queued: true });
        }
        const extras$ = isFormData ? this.addExtraAccountsAfterFormDataCreate$(created.id, bankAccounts) : of([] as string[]);
        const uploadDocs$ = this.uploadPendingDocuments$(created.id, pendingDocs);
        return extras$.pipe(
          switchMap(accountProblems => uploadDocs$.pipe(
            map(docRes => ({
              created,
              problems: [...accountProblems, ...docRes.problems],
              queued: false,
              uploadedDocs: docRes.uploaded,
              remainingDocs: docRes.remaining
            }))
          ))
        );
      })
    );
  }

  updatePersonnelFull$(
    id: number,
    changes: Record<string, any>,
    attachment: File | null,
    isApproved: boolean,
    desiredAccounts: PersonnelBankAccount[],
    initialAccounts: PersonnelBankAccount[],
    pendingDocs: any[]
  ): Observable<{ res: any; problems: string[]; uploadedDocs?: PersonnelDocument[]; remainingDocs?: any[] }> {
    let patch$: Observable<any>;
    if (attachment) {
      const formData = new FormData();
      for (const [key, value] of Object.entries(changes)) {
        formData.append(key, value === null || value === undefined ? '' : String(value));
      }
      formData.append('attachment', attachment);
      patch$ = this.updatePersonnelProfile(id, formData);
    } else if (Object.keys(changes).length) {
      patch$ = this.updatePersonnelProfile(id, changes);
    } else {
      patch$ = of(null);
    }

    return patch$.pipe(
      switchMap((res: any) => {
        const bank$ = isApproved ? of([] as string[]) : this.syncBankAccounts$(id, desiredAccounts, initialAccounts);
        const uploadDocs$ = this.uploadPendingDocuments$(id, pendingDocs);
        return bank$.pipe(
          switchMap(accountProblems => uploadDocs$.pipe(
            map(docRes => ({
              res,
              problems: [...accountProblems, ...docRes.problems],
              uploadedDocs: docRes.uploaded,
              remainingDocs: docRes.remaining
            }))
          ))
        );
      })
    );
  }
}
