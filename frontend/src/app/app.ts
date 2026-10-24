import { Component, signal, effect, inject, ApplicationRef } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { ToastContainerComponent, ToastService } from './shared/components/toast/toast.component';
import { ConfirmDialogComponent } from './shared/components/confirm-dialog/confirm-dialog.component';
import { DomainMigrationBannerComponent } from './shared/components/domain-migration-banner/domain-migration-banner.component';
import { AppVersionLockComponent } from './shared/components/app-version-lock/app-version-lock.component';
import { DomainMigrationService } from './core/services/domain-migration.service';
import { AuthService } from './core/auth/auth.service';
import { WebSocketService } from './core/http/websocket.service';
import { ClientTelemetryService } from './core/services/client-telemetry.service';
import { PermissionService } from './core/services/permission.service';
import { AppUpdateService } from './core/platform/app-update.service';
import { initNativeShell } from './core/platform/native-shell';
import { setFileOutputErrorNotifier } from './core/platform/file-output';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent, ConfirmDialogComponent, DomainMigrationBannerComponent, AppVersionLockComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('warehouse-app');
  private router = inject(Router);
  private auth = inject(AuthService);
  private ws = inject(WebSocketService);
  private telemetry = inject(ClientTelemetryService);
  private appUpdate = inject(AppUpdateService);
  private domainMigration = inject(DomainMigrationService);
  private appRef = inject(ApplicationRef);
  private toast = inject(ToastService);
  private permissions = inject(PermissionService);

  constructor() {
    setFileOutputErrorNotifier((m) => this.toast.error(m));
    // پشتیبانی از لینک‌های دارای هش استعلام
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash;
      const match = hash.match(/#\/?verify-card(?:\/([^/?#]+))?/);
      if (match) {
        const code = match[1];
        const targetUrl = code ? `/verify-card/${code}` : '/verify-card';
        this.router.navigateByUrl(targetUrl);
      }
    }

    effect(() => {
      if (this.auth.isLoggedIn()) {
        this.ws.connect();
        this.auth.sendDailyHeartbeat();
        this.telemetry.sendHeartbeat();
        this.permissions.start();
      } else {
        this.ws.disconnect();
      }
    });

    this.appUpdate.init();
    this.domainMigration.init();
    initNativeShell(this.appRef);
  }
}

