import {
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../../../../core/api/api.service';
import { ModuleRegistryService } from '../../../../../../core/modules/module-registry.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { ToggleSwitchComponent } from '../../../../../../shared/components/toggle-switch/toggle-switch.component';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';

export type CompanySettingType = 'bool' | 'int' | 'float' | 'str';

export interface CompanySettingItem {
  module: string;
  key: string;
  type: CompanySettingType;
  title_fa: string;
  default: unknown;
  value: unknown;
  is_default: boolean;
  can_edit: boolean;
}

interface SettingRow extends CompanySettingItem {
  draft: string | boolean;
  saving: boolean;
  error: string;
}

interface SettingGroup {
  module: string;
  title: string;
  rows: SettingRow[];
}

/** تب «تنظیمات شرکت»: کلیدهای تنظیم اعلام‌شدهٔ ماژول‌ها برای شرکت، گروه‌بندی‌شده بر اساس ماژول */
@Component({
  selector: 'app-company-settings-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective, ToggleSwitchComponent],
  templateUrl: './company-settings-tab.component.html'
})
export class CompanySettingsTabComponent implements OnInit, OnChanges {
  @Input({ required: true }) companyId!: number;

  private api = inject(ApiService);
  private registry = inject(ModuleRegistryService, { optional: true });
  private toast = inject(ToastService, { optional: true });
  private cdr = inject(ChangeDetectorRef);

  loading = false;
  error = '';
  groups: SettingGroup[] = [];
  private loadSeq = 0;

  ngOnInit(): void {
    if (this.companyId) void this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['companyId'] && !changes['companyId'].firstChange) void this.load();
  }

  async load(): Promise<void> {
    const seq = ++this.loadSeq;
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
    try {
      const res = await firstValueFrom(
        this.api.get<{ company_id: number; results: CompanySettingItem[] }>(`settings/company/${this.companyId}`)
      );
      if (seq !== this.loadSeq) return;
      const byModule = new Map<string, SettingRow[]>();
      for (const item of res?.results ?? []) {
        const row: SettingRow = { ...item, draft: this.toDraft(item), saving: false, error: '' };
        const list = byModule.get(item.module) ?? [];
        list.push(row);
        byModule.set(item.module, list);
      }
      this.groups = [...byModule.entries()].map(([module, rows]) => ({
        module,
        title: this.registry?.getSpec(module)?.titleFa || module,
        rows
      }));
      this.loading = false;
    } catch (err) {
      if (seq !== this.loadSeq) return;
      this.loading = false;
      this.error = this.detailOf(err, 'خطا در بارگذاری تنظیمات شرکت');
    }
    this.cdr.markForCheck();
  }

  private toDraft(item: CompanySettingItem): string | boolean {
    if (item.type === 'bool') return item.value === true;
    return item.value == null ? '' : String(item.value);
  }

  private detailOf(err: unknown, fallback: string): string {
    const detail = (err as { error?: { detail?: string } })?.error?.detail;
    return detail || fallback;
  }

  onToggle(row: SettingRow, checked: boolean): void {
    if (!row.can_edit || row.saving) return;
    row.draft = checked;
    void this.save(row);
  }

  async save(row: SettingRow): Promise<void> {
    if (!row.can_edit || row.saving) return;
    let value: unknown = row.draft;
    row.error = '';
    if (row.type === 'int' || row.type === 'float') {
      const text = String(row.draft ?? '').trim().replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
      const num = Number(text);
      if (text === '' || !Number.isFinite(num) || (row.type === 'int' && !Number.isInteger(num))) {
        row.error = row.type === 'int' ? 'یک عدد صحیح وارد کنید' : 'یک عدد معتبر وارد کنید';
        this.cdr.markForCheck();
        return;
      }
      value = num;
    }
    row.saving = true;
    this.cdr.markForCheck();
    try {
      const updated = await firstValueFrom(
        this.api.patch<CompanySettingItem>(`settings/company/${this.companyId}`, {
          module: row.module,
          key: row.key,
          value
        })
      );
      Object.assign(row, updated, { draft: this.toDraft(updated) });
      this.toast?.success('تنظیم ذخیره شد');
    } catch (err) {
      row.error = this.detailOf(err, 'ذخیرهٔ تنظیم انجام نشد');
      if (row.type === 'bool') row.draft = row.value === true;
    } finally {
      row.saving = false;
      this.cdr.markForCheck();
    }
  }
}
