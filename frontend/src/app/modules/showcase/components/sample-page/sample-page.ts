import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../../../../core/api/api.service';
import { isServerUnreachable } from '../../../../core/services/server-reachability';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';

interface PingResponse {
  status: string;
  module: string;
  title: string;
}

@Component({
  selector: 'app-showcase-sample-page',
  standalone: true,
  imports: [CommonModule, ActionButtonComponent, LoadingSkeletonComponent, SvgIconDirective],
  templateUrl: './sample-page.html',
})
export class ShowcaseSamplePage implements OnInit {
  private api = inject(ApiService);

  title = 'ماژول نمایشی';
  readonly loading = signal(false);
  readonly status = signal<PingResponse | null>(null);
  /** null = بدون خطا؛ 'offline' = سرور در دسترس نیست؛ 'error' = پاسخ خطای سرور */
  readonly error = signal<'offline' | 'error' | null>(null);

  ngOnInit(): void {
    this.onRefresh();
  }

  onRefresh(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.get<PingResponse>('showcase/ping').subscribe({
      next: res => {
        this.status.set(res);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(isServerUnreachable(err.status) ? 'offline' : 'error');
        this.loading.set(false);
      },
    });
  }
}
