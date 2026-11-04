import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';
import { CommandCenterComponent } from '../../../../shared/components/command-center/command-center.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { PersonRolePickerComponent, PersonRoleValue } from '../../../../shared/components/person-role-picker/person-role-picker.component';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { ActiveCompanyService } from '../../../../core/services/active-company.service';
import { isServerUnreachable } from '../../../../core/services/server-reachability';
import {
  LETTER_CONFIDENTIALITY_LABELS, LETTER_KIND_LABELS, LETTER_SIGN_MODE_LABELS, LETTER_STATUS_LABELS, LetterBlock,
  LetterConfidentiality, LetterDetail, LetterDraftCopy, LetterKind, LetterProject, LetterSignMode, LetterStatus,
  LetterWritePayload,
} from '../../letters.models';
import { LettersApiService } from '../../services/letters-api.service';
import { LettersOfflineService, newClientTempId, serverErrorText } from '../../services/letters-offline';
import { LetterEditorComponent } from '../letter-editor/letter-editor';
import { PartyPickerComponent } from '../party-picker/party-picker';

interface PartyRecipient { id: number; name: string; role: 'to' | 'cc' }
type Notice = { tone: 'ok' | 'warn' | 'error'; text: string };

const emptyBody = (): LetterBlock[] => [{ type: 'paragraph', align: 'right', runs: [{ text: '' }] }];

/**
 * نوشتن و ویرایش پیش‌نویس نامه (`/app/letters/new`، `/app/letters/:id/edit`؛ ن۱۶ و ن۱۱).
 * ذخیره آفلاین هم کار می‌کند (صف هسته)؛ «ارسال برای امضا» و «ثبت» فقط آنلاین‌اند.
 */
@Component({
  selector: 'app-letter-compose',
  standalone: true,
  imports: [
    ReactiveFormsModule, ActionButtonComponent, CommandCenterComponent, LoadingSkeletonComponent, PersonRolePickerComponent,
    SvgIconDirective, LetterEditorComponent, PartyPickerComponent,
  ],
  templateUrl: './letter-compose.html',
})
export class LetterComposePage implements OnInit {
  readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly api = inject(LettersApiService);
  private readonly offline = inject(LettersOfflineService);
  private readonly companies = inject(ActiveCompanyService);

  readonly kindLabels = LETTER_KIND_LABELS;
  readonly statusLabels = LETTER_STATUS_LABELS;
  readonly confLabels = LETTER_CONFIDENTIALITY_LABELS;
  readonly signModeLabels = LETTER_SIGN_MODE_LABELS;
  readonly kinds = Object.keys(LETTER_KIND_LABELS) as LetterKind[];
  readonly confs = Object.keys(LETTER_CONFIDENTIALITY_LABELS) as LetterConfidentiality[];
  readonly signModes = Object.keys(LETTER_SIGN_MODE_LABELS) as LetterSignMode[];

  readonly online = this.offline.online;
  readonly letterId = signal<number | null>(null);
  readonly revision = signal<number | null>(null);
  readonly status = signal<LetterStatus>('draft');
  readonly canEdit = signal(true);
  readonly loading = signal(false);
  readonly loadError = signal<'offline' | 'error' | 'gone' | null>(null);
  readonly saving = signal(false);
  readonly acting = signal(false);
  readonly dirty = signal(false);
  readonly queued = signal(false);
  readonly gone = signal(false);
  readonly notice = signal<Notice | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});
  /** پاسخ 200 با conflict: true — متن محلی در فرم ماند، سرور آن را در نسخهٔ ناهمگام نگه داشت */
  readonly conflict = signal<{ revision: number } | null>(null);
  readonly copies = signal<LetterDraftCopy[]>([]);
  readonly projects = signal<LetterProject[]>([]);
  readonly body = signal<LetterBlock[]>(emptyBody());
  readonly parties = signal<PartyRecipient[]>([]);
  private clientTempId = newClientTempId();

  readonly form = new FormGroup({
    kind: new FormControl<LetterKind>('internal', { nonNullable: true }),
    subject: new FormControl('', { nonNullable: true }),
    confidentiality: new FormControl<LetterConfidentiality>('normal', { nonNullable: true }),
    sign_mode: new FormControl<LetterSignMode>('electronic', { nonNullable: true }),
    project: new FormControl<number | null>(null),
    toUsers: new FormControl<PersonRoleValue[]>([], { nonNullable: true }),
    ccUsers: new FormControl<PersonRoleValue[]>([], { nonNullable: true }),
    signers: new FormControl<PersonRoleValue[]>([], { nonNullable: true }),
  });

  readonly readOnly = computed(() => !this.canEdit() || this.status() !== 'draft' && this.status() !== 'received');
  readonly company = computed(() => this.companies.activeCompanySignal()?.id ?? null);
  /** کنش‌های فقط-آنلاین: نامهٔ ذخیره‌شده، بی‌تغییر ذخیره‌نشده */
  readonly submitBlocked = computed(() => this.actionBlockReason(() => this.status() === 'draft' && this.form.controls.kind.value !== 'incoming'));
  readonly registerBlocked = computed(() => this.actionBlockReason(() => this.status() === 'received' && this.form.controls.kind.value === 'incoming'));

  constructor() {
    this.form.valueChanges.subscribe(() => this.dirty.set(true));
  }

  private actionBlockReason(applies: () => boolean): string | null {
    if (!this.online()) return 'نیاز به اتصال';
    if (!this.letterId()) return 'اول ذخیره کنید';
    if (this.dirty() || this.queued()) return 'تغییرها هنوز ذخیره نشده‌اند';
    if (!applies()) return 'برای این نامه نیست';
    return null;
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (this.online()) {
      this.api.projects(this.company()).subscribe({ next: rows => this.projects.set(rows.filter(p => p.is_active)), error: () => {} });
    }
    if (id) {
      this.load(id);
    } else {
      const local = Number(this.route.snapshot.queryParamMap.get('local'));
      if (local) void this.loadLocal(local);
    }
  }

  hasUnsavedChanges(): boolean {
    return this.dirty();
  }

  /** بستن یا بارگذاری دوبارهٔ زبانه با متن ذخیره‌نشده هم هشدار می‌دهد (متن فقط در حافظهٔ صفحه است). */
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(ev: BeforeUnloadEvent): void {
    if (!this.dirty()) return;
    ev.preventDefault();
    ev.returnValue = '';
  }

  load(id: number): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.get(id).subscribe({
      next: letter => {
        this.applyServer(letter);
        this.loading.set(false);
      },
      error: err => {
        const status = err?.status ?? 0;
        this.loadError.set(isServerUnreachable(status) ? 'offline' : status === 404 ? 'gone' : 'error');
        this.loading.set(false);
      },
    });
  }

  private applyServer(letter: LetterDetail): void {
    this.letterId.set(letter.id);
    this.revision.set(letter.revision);
    this.status.set(letter.status);
    this.canEdit.set(letter.can_edit !== false);
    const users = (role: 'to' | 'cc'): PersonRoleValue[] => (letter.recipients || [])
      .filter(r => r.role === role && r.target_type === 'user' && r.user)
      .map(r => ({ type: 'user', id: r.user as number, label: r.name_text || `کاربر ${r.user}` }));
    this.form.patchValue({
      kind: letter.kind,
      subject: letter.subject || '',
      confidentiality: letter.confidentiality,
      sign_mode: letter.sign_mode || 'electronic',
      project: letter.project,
      toUsers: users('to'),
      ccUsers: users('cc'),
      signers: (letter.signers || []).map(s => ({ type: 'user' as const, id: s.user.id, label: s.user.name })),
    }, { emitEvent: false });
    this.parties.set((letter.recipients || []).filter(r => r.target_type === 'party' && r.party)
      .map(r => ({ id: r.party as number, name: r.party_name || '', role: r.role })));
    this.body.set(letter.body?.length ? letter.body : emptyBody());
    this.copies.set(letter.draft_copies || []);
    this.dirty.set(false);
  }

  private async loadLocal(errorId: number): Promise<void> {
    const rows = await this.offline.localDrafts();
    const row = rows.find(r => r.state === 'failed' && r.id === errorId);
    if (!row) return;
    this.useText(row.body.subject, row.body.body, true);
    if (row.body.kind) this.form.controls.kind.setValue(row.body.kind);
    this.notice.set({ tone: 'warn', text: 'متن پیش‌نویس ردشده در فرم آمد؛ به‌صورت نامهٔ تازه ذخیره کنید.' });
  }

  onBody(blocks: LetterBlock[]): void {
    this.body.set(blocks);
    this.dirty.set(true);
  }

  addParty(p: { id: number; name: string }, role: 'to' | 'cc' = 'to'): void {
    if (this.parties().some(x => x.id === p.id)) return;
    this.parties.update(list => [...list, { id: p.id, name: p.name, role }]);
    this.dirty.set(true);
  }

  setPartyRole(id: number, role: string): void {
    this.parties.update(list => list.map(x => (x.id === id ? { ...x, role: role === 'cc' ? 'cc' : 'to' } : x)));
    this.dirty.set(true);
  }

  removeParty(id: number): void {
    this.parties.update(list => list.filter(x => x.id !== id));
    this.dirty.set(true);
  }

  buildPayload(): LetterWritePayload {
    const v = this.form.getRawValue();
    const users = (list: PersonRoleValue[], role: 'to' | 'cc') => list.filter(u => u.type === 'user')
      .map(u => ({ role, target_type: 'user' as const, user: Number(u.id) }));
    const base: LetterWritePayload = {
      subject: v.subject.trim(),
      body: this.body(),
      confidentiality: v.confidentiality,
      sign_mode: v.sign_mode,
      project: v.project ? Number(v.project) : null,
      recipients: [
        ...users(v.toUsers, 'to'),
        ...users(v.ccUsers, 'cc'),
        ...this.parties().map(p => ({ role: p.role, target_type: 'party' as const, party: p.id })),
      ],
      signers: v.signers.filter(u => u.type === 'user').map(u => ({ user: Number(u.id) })),
    };
    const id = this.letterId();
    if (id) return { ...base, revision: this.revision() ?? undefined };
    return { ...base, kind: v.kind, client_temp_id: this.clientTempId, ...(this.company() ? { company: this.company()! } : {}) };
  }

  async save(): Promise<void> {
    if (this.saving() || this.readOnly()) return;
    if (!this.form.controls.subject.value.trim()) {
      this.fieldErrors.set({ subject: 'موضوع نامه لازم است.' });
      return;
    }
    this.fieldErrors.set({});
    this.saving.set(true);
    try {
      const out = await this.offline.saveDraft({ letterId: this.letterId(), payload: this.buildPayload() });
      switch (out.kind) {
        case 'saved': {
          const wasNew = !this.letterId();
          this.letterId.set(out.letter.id);
          this.revision.set(out.letter.revision);
          this.status.set(out.letter.status);
          this.copies.set(out.letter.draft_copies || []);
          this.conflict.set(null);
          this.queued.set(false);
          this.dirty.set(false);
          if (wasNew) this.location.replaceState(`/app/letters/${out.letter.id}/edit`);
          this.notice.set({ tone: 'ok', text: 'ذخیره شد.' });
          break;
        }
        case 'conflict':
          this.conflict.set({ revision: out.letter.revision });
          this.copies.set(out.letter.draft_copies || []);
          this.status.set(out.letter.status);
          this.notice.set({ tone: 'warn', text: 'نسخهٔ ناهمگام: متن شما در فرم مانده و روی سرور هم نگه داشته شد.' });
          break;
        case 'queued':
          if (out.newTempId) this.clientTempId = out.newTempId;
          this.queued.set(true);
          this.dirty.set(false);
          this.notice.set({ tone: 'warn', text: 'در صف ارسال؛ پس از اتصال فرستاده می‌شود.' });
          break;
        case 'rejected':
          this.fieldErrors.set(out.fieldErrors);
          this.notice.set({ tone: 'error', text: out.message });
          break;
        case 'gone':
          this.gone.set(true);
          this.notice.set({ tone: 'error', text: out.message });
          break;
        case 'not-queueable':
          this.notice.set({ tone: 'error', text: out.message });
          break;
      }
    } finally {
      this.saving.set(false);
    }
  }

  /** «جایگزین کن»: متن فرم روی نسخهٔ فعلی سرور ذخیره شود */
  async replaceServer(): Promise<void> {
    const c = this.conflict();
    if (!c) return;
    this.revision.set(c.revision);
    this.conflict.set(null);
    await this.save();
  }

  /** «نامهٔ تازه از آن بساز»: متن فرم پیش‌نویس تازه می‌شود (نامهٔ قبلی دست نمی‌خورد) */
  asNewLetter(): void {
    this.letterId.set(null);
    this.revision.set(null);
    this.status.set('draft');
    this.canEdit.set(true);
    this.clientTempId = newClientTempId();
    this.conflict.set(null);
    this.gone.set(false);
    this.copies.set([]);
    this.queued.set(false);
    this.dirty.set(true);
    this.location.replaceState('/app/letters/new');
    this.notice.set({ tone: 'warn', text: 'نامهٔ تازه؛ برای ساختن آن «ذخیره» را بزنید.' });
  }

  useCopy(copy: LetterDraftCopy, asNew: boolean): void {
    this.useText(copy.subject, copy.body, asNew);
  }

  private useText(subject: string, body: LetterBlock[], asNew: boolean): void {
    this.form.controls.subject.setValue(subject || '');
    this.body.set(body?.length ? body : emptyBody());
    this.dirty.set(true);
    if (asNew) this.asNewLetter();
  }

  async act(action: 'submit' | 'register'): Promise<void> {
    const id = this.letterId();
    const blocked = action === 'submit' ? this.submitBlocked() : this.registerBlocked();
    if (!id || blocked || this.acting()) return;
    this.acting.set(true);
    try {
      const letter = await firstValueFrom(this.api.action(id, action));
      this.applyServer(letter);
      this.notice.set({ tone: 'ok', text: action === 'submit' ? 'برای امضا فرستاده شد.' : 'نامه ثبت شد.' });
    } catch (err: any) {
      const text = isServerUnreachable(err?.status ?? 0) ? 'اتصال برقرار نیست؛ دوباره تلاش کنید.' : serverErrorText(err?.error).message;
      this.notice.set({ tone: 'error', text });
    } finally {
      this.acting.set(false);
    }
  }

  back(): void {
    void this.router.navigate(['/app/letters']);
  }
}
