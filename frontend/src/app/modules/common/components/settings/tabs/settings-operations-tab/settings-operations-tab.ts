import { Component, DestroyRef, Input, OnInit, Output, EventEmitter, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ConfigApiService } from '../../../../../../core/api/config-api.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToggleSwitchComponent } from '../../../../../../shared/components/toggle-switch/toggle-switch.component';
import { SystemSettingsConfig } from '../../../../../../core/models/system-settings.model';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { SectionToggleService } from '../../../../../../core/services/section-toggle.service';

@Component({
  selector: 'app-settings-operations-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, ToggleSwitchComponent, SvgIconDirective],
  templateUrl: './settings-operations-tab.html'
})
export class SettingsOperationsTabComponent implements OnInit {
  @Input({ required: true }) settings!: SystemSettingsConfig;
  @Input() scannerPreset: string = 'default';
  @Output() scannerPresetChange = new EventEmitter<string>();

  private auth = inject(AuthService);
  private sectionToggles = inject(SectionToggleService);
  private configApi = inject(ConfigApiService);
  private destroyRef = inject(DestroyRef);

  /** کلیدهای بخش (ص۱۲ طرح ۲.۶) فقط برای مدیر کل و فقط وقتی ماژولی بخشی اعلام کرده باشد */
  readonly toggleSections = computed(() => (this.auth.user()?.is_superuser ? this.sectionToggles.declared() : []));

  ngOnInit(): void {
    // فهرست بخش‌های اعلام‌شده را سرور فقط به درخواست با توکن مدیر کل می‌دهد؛ اگر بوت پیش از ورود بوده، تازه بگیر
    if (this.auth.user()?.is_superuser && this.sectionToggles.declared().length === 0) {
      this.configApi.getPublicConfig().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => {} });
    }
  }

  onScannerPresetChange(val: string) {
    this.scannerPresetChange.emit(val);
  }

  isSectionOn(code: string): boolean {
    const disabled = this.settings?.['disabled_sections'];
    return !(Array.isArray(disabled) && disabled.includes(code));
  }

  /** ذخیره با دکمهٔ ذخیرهٔ همین صفحه؛ خاموش کردن بخش داده‌ای را پاک نمی‌کند */
  setSectionOn(code: string, on: boolean): void {
    const current: string[] = Array.isArray(this.settings['disabled_sections']) ? this.settings['disabled_sections'] : [];
    const others = current.filter(c => c !== code);
    this.settings['disabled_sections'] = on ? others : [...others, code];
  }
}
