import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { ModuleRegistryService } from '../modules/module-registry.service';

export interface PublicConfig {
  system_version: string;
  system_name: string;
  canonical_domain?: string;
  installed_modules?: string[];
  offline_sync_interval_minutes?: number;
  offline_cache_ttl_minutes?: number;
  chat_enabled?: boolean;
  chat_file_sharing?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ConfigApiService {
  private apiService = inject(ApiService);
  private moduleRegistry = inject(ModuleRegistryService);

  getPublicConfig(): Observable<PublicConfig> {
    return this.apiService.get<PublicConfig>('public/config').pipe(
      tap((config) => {
        if (config?.installed_modules && Array.isArray(config.installed_modules)) {
          this.moduleRegistry.setInstalledModules(config.installed_modules);
        }
      })
    );
  }
}
