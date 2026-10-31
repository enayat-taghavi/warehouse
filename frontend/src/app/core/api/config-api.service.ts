import { Injectable, inject } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { SKIP_OFFLINE } from '../interceptors/offline.interceptor';
import { SKIP_GLOBAL_ERROR_TOAST } from '../error/error.interceptor';
import { ApiService } from './api.service';
import { ModuleRegistryService } from '../modules/module-registry.service';
import { SectionToggleService, ToggleSection } from '../services/section-toggle.service';

export interface PublicConfig {
  system_version: string;
  system_name: string;
  canonical_domain?: string;
  installed_modules?: string[];
  offline_sync_interval_minutes?: number;
  offline_cache_ttl_minutes?: number;
  chat_enabled?: boolean;
  chat_file_sharing?: boolean;
  chat_max_upload_mb?: number;
  disabled_sections?: string[];
  toggle_sections?: ToggleSection[];
  app_min_version?: string;
  app_recommended_version?: string;
  app_download_urls?: {
    direct?: string;
    bazaar?: string;
    myket?: string;
    [key: string]: string | undefined;
  };
}

@Injectable({ providedIn: 'root' })
export class ConfigApiService {
  private apiService = inject(ApiService);
  private moduleRegistry = inject(ModuleRegistryService);
  private sectionToggles = inject(SectionToggleService);

  getPublicConfig(): Observable<PublicConfig> {
    return this.apiService.get<PublicConfig>('public/config').pipe(
      tap((config) => {
        if (config?.installed_modules && Array.isArray(config.installed_modules)) {
          this.moduleRegistry.setInstalledModules(config.installed_modules);
        }
        this.sectionToggles.applyConfig(config);
      })
    );
  }

  /**
   * سنجش واقعی دسترسی به سرور: از کش SWR آفلاین و toast سراسری خطا عبور نمی‌کند،
   * پس پاسخ کش‌شده هرگز «سرور در دسترس است» تعبیر نمی‌شود.
   */
  probePublicConfig(): Observable<PublicConfig> {
    return this.apiService.get<PublicConfig>('public/config', { _probe: Date.now() }, {
      context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true),
    });
  }
}
