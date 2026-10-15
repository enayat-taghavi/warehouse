import { Component, OnInit, ChangeDetectorRef, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ItemApiService } from '../../api/item-api.service';
import { StateService } from '../../../../core/services/state.service';
import { AuthStore } from '../../../../core/stores/auth.store';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterLink, SvgIconDirective, ActionButtonComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard implements OnInit {
  weeklyData: any[] = [];
  overallMax = 750;

  todayStats: any = { count: 0, docs: 0, feed: 0 };
  yesterdayStats: any = { count: 0, docs: 0, feed: 0 };
  lastWeekStats: any = { count: 0, docs: 0, feed: 0 };
  overallStats: any = { total: 0, counted: 0, printed: 0, docs_approved: 0, conflicts: 0, done: 0, ready_to_feed: 0 };

  isDashboardRefreshing = false;
  hasError = false;
  errorMessage = '';

  dailyTarget = 1000; // پیش‌فرض تارگت روزانه

  private cdr = inject(ChangeDetectorRef);
  private itemApi = inject(ItemApiService);
  public state = inject(StateService);
  public authStore = inject(AuthStore);

  constructor() {
    // واکنش به تغییر انبار فعال در هدر برنامه
    effect(() => {
      const activeId = this.authStore.activeWarehouseId();
      // همگام‌سازی استیت سنتی در صورت نیاز
      if (activeId !== undefined) {
        this.state.appState.activeWarehouseId = activeId;
      }
      this.loadStats();
    });
  }

  ngOnInit() {
    // بارگذاری اولیه توسط effect مدیریت می‌شود
  }

  loadStats() {
    this.isDashboardRefreshing = true;
    this.hasError = false;
    this.errorMessage = '';

    const activeId = this.authStore.activeWarehouseId();
    const projectId = (activeId && activeId !== 'ALL') ? activeId.toString() : 'ALL';

    this.itemApi.getDashboardStats(projectId).subscribe({
      next: (res: any) => {
        this.weeklyData = res.weekly_data || [];
        this.overallMax = res.overallMax || 10;
        this.todayStats = res.today || { count: 0, docs: 0, feed: 0 };
        this.yesterdayStats = res.yesterday || { count: 0, docs: 0, feed: 0 };
        this.lastWeekStats = res.last_week_totals || { count: 0, docs: 0, feed: 0 };
        this.overallStats = res.overall || { total: 0, counted: 0, printed: 0, docs_approved: 0, conflicts: 0, done: 0, ready_to_feed: 0 };
        
        setTimeout(() => {
          this.isDashboardRefreshing = false;
          this.cdr.detectChanges();
        }, 300);
      },
      error: (err: any) => {
        this.hasError = true;
        this.errorMessage = 'خطا در برقراری ارتباط با سرور و دریافت اطلاعات داشبورد';
        setTimeout(() => {
          this.isDashboardRefreshing = false;
          this.cdr.detectChanges();
        }, 300);
      }
    });
  }

  get totalCounted(): number {
    if (this.overallStats.counted !== undefined && this.overallStats.counted !== null && this.overallStats.counted > 0) {
      return this.overallStats.counted;
    }
    const isWh = this.state.appState.activeWarehouseId && this.state.appState.activeWarehouseId !== 'ALL';
    const projects = this.state.appState.projects || [];
    if (isWh) {
      const p = projects.find((x: any) => x.id === Number(this.state.appState.activeWarehouseId));
      return p ? (p.counted_quantity || 0) : (this.overallStats.counted || 0);
    }
    const sumState = projects.reduce((sum: number, p: any) => sum + (p.counted_quantity || 0), 0);
    return sumState || this.overallStats.counted || 0;
  }

  get totalPercent(): number {
    if (!this.overallStats.total || this.overallStats.total === 0) return 0;
    return Math.min(100, Math.round((this.totalCounted / this.overallStats.total) * 100));
  }

  get donutDashArray(): string {
    return `${this.totalPercent}, 100`;
  }

  get todayTrend(): { val: number; dir: 'up' | 'down' | 'neutral' } {
    const today = this.todayStats.count || 0;
    const yesterday = this.yesterdayStats.count || 0;
    if (yesterday === 0) {
      if (today > 0) return { val: 100, dir: 'up' };
      return { val: 0, dir: 'neutral' };
    }
    const diff = today - yesterday;
    if (diff === 0) return { val: 0, dir: 'neutral' };
    return {
      val: Math.round(Math.abs(diff / yesterday) * 100),
      dir: diff > 0 ? 'up' : 'down'
    };
  }

  getHeight(val: number): string {
    const max = Math.max(this.overallMax, this.dailyTarget, 10);
    return Math.max(Math.round((val / max) * 100), 2) + '%';
  }
}
