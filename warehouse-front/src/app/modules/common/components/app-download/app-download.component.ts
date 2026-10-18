import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ConfigApiService, PublicConfig } from '../../../../core/api/config-api.service';
import { openExternal } from '../../../../core/platform/external-link';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { BRANDING } from '../../../../core/branding';

@Component({
  selector: 'app-download',
  standalone: true,
  imports: [CommonModule, RouterLink, SvgIconDirective],
  templateUrl: './app-download.component.html',
  styleUrl: './app-download.component.css'
})
export class AppDownloadComponent implements OnInit, OnDestroy {
  readonly appName = 'CoManage';
  readonly branding = BRANDING;

  private configApi = inject(ConfigApiService);
  private cdr = inject(ChangeDetectorRef);
  private configSub?: Subscription;

  systemName = '';
  recommendedVersion = '';
  directUrl: string | null = null;
  isLoading = true;

  ngOnInit(): void {
    this.configSub = this.configApi.getPublicConfig().subscribe({
      next: (config: PublicConfig) => {
        if (config) {
          this.directUrl = config.app_download_urls?.direct || null;
          this.recommendedVersion = config.app_recommended_version || '';
          this.systemName = config.system_name || '';
        }
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  ngOnDestroy(): void {
    this.configSub?.unsubscribe();
  }

  downloadApk(): void {
    if (!this.directUrl) return;
    openExternal(this.directUrl);
  }
}
