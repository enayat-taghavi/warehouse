import { Component, Input, OnChanges, OnInit, SimpleChanges, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';
import { AttachmentsComponent } from '../../../../shared/components/attachments/attachments.component';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { CompanySettingRow, errorText } from '../../letters.models';
import { LettersApiService } from '../../services/letters-api.service';
import { LettersOfflineService } from '../../services/letters-offline';

export const LETTERS_ASSET_KIND = 'letters_secretariat';

@Component({
  selector: 'app-letters-settings-tab',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule, ActionButtonComponent, AttachmentsComponent, SvgIconDirective],
  templateUrl: './letters-settings-tab.html',
})
export class LettersSettingsTabComponent implements OnInit, OnChanges {
  @Input() companyId: number | null = null;

  private readonly api = inject(LettersApiService);
  private readonly offline = inject(LettersOfflineService);

  readonly assetKind = LETTERS_ASSET_KIND;
  readonly online = this.offline.online;

  readonly settings = signal<CompanySettingRow[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal(false);
  readonly saving = signal(false);
  readonly saveSuccess = signal(false);
  readonly saveError = signal('');

  readonly dueDaysControl = new FormControl<number>(7, {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.min(0),
      Validators.max(365),
      Validators.pattern(/^[0-9]+$/),
    ],
  });

  readonly initialDueDays = signal<number>(7);
  readonly dueDaysValue = signal<number>(7);
  readonly isControlInvalid = signal(false);
  private loadSeq = 0;

  constructor() {
    this.dueDaysControl.valueChanges.subscribe(val => {
      this.dueDaysValue.set(Number(val));
      this.isControlInvalid.set(this.dueDaysControl.invalid);
    });
    this.dueDaysControl.statusChanges.subscribe(() => {
      this.isControlInvalid.set(this.dueDaysControl.invalid);
    });
  }

  readonly settingsMap = computed(() => {
    const map = new Map<string, CompanySettingRow>();
    for (const s of this.settings()) {
      map.set(s.key, s);
    }
    return map;
  });

  readonly canEditImages = computed(() => {
    const a4 = this.settingsMap().get('letterhead_a4');
    const a5 = this.settingsMap().get('letterhead_a5');
    const stamp = this.settingsMap().get('secretariat_stamp');
    return Boolean(a4?.can_edit && a5?.can_edit && stamp?.can_edit);
  });

  readonly canEditDueDays = computed(() => {
    return Boolean(this.settingsMap().get('default_due_days')?.can_edit);
  });

  readonly isUnchanged = computed(() => {
    return this.dueDaysValue() === this.initialDueDays();
  });

  readonly isSaveDisabled = computed(() => {
    return (
      !this.online() ||
      this.isControlInvalid() ||
      this.isUnchanged() ||
      this.saving() ||
      !this.canEditDueDays()
    );
  });

  ngOnInit(): void {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['companyId']) {
      if (this.companyId) {
        this.load();
      } else {
        this.settings.set([]);
        this.loading.set(false);
        this.loadError.set(false);
      }
    }
  }

  load(): void {
    if (!this.companyId) return;
    const seq = ++this.loadSeq;
    this.loading.set(true);
    this.loadError.set(false);
    this.saveSuccess.set(false);
    this.saveError.set('');

    this.api.companySettings(this.companyId).subscribe({
      next: res => {
        if (seq !== this.loadSeq) return;
        const rows = res?.results || [];
        this.settings.set(rows);
        this.loading.set(false);
        this.loadError.set(false);

        const dueRow = rows.find(r => r.key === 'default_due_days');
        const dueVal = typeof dueRow?.value === 'number' ? dueRow.value : 7;
        this.initialDueDays.set(dueVal);
        this.dueDaysValue.set(dueVal);
        this.dueDaysControl.setValue(dueVal);

        if (dueRow && !dueRow.can_edit) {
          this.dueDaysControl.disable();
        } else {
          this.dueDaysControl.enable();
        }
      },
      error: () => {
        if (seq !== this.loadSeq) return;
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }

  canEdit(key: string): boolean {
    return Boolean(this.settingsMap().get(key)?.can_edit);
  }

  saveDueDays(): void {
    if (!this.companyId || this.isSaveDisabled()) return;
    this.saving.set(true);
    this.saveSuccess.set(false);
    this.saveError.set('');
    const val = Number(this.dueDaysControl.value);

    this.api.saveCompanySetting(this.companyId, 'default_due_days', val).subscribe({
      next: row => {
        this.saving.set(false);
        const savedVal = typeof row?.value === 'number' ? row.value : val;
        this.initialDueDays.set(savedVal);
        this.dueDaysValue.set(savedVal);
        this.dueDaysControl.setValue(savedVal);
        this.saveSuccess.set(true);
      },
      error: err => {
        this.saving.set(false);
        this.saveError.set(errorText(err?.error) || 'ذخیره نشد.');
      },
    });
  }
}
