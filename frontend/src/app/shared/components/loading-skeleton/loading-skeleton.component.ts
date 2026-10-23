import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Skeleton Loader — نمایش در زمان لود از API
 *
 * استفاده:
 *   <app-loading-skeleton type="table" [rows]="5" />
 *   <app-loading-skeleton type="card" [count]="4" />
 *   <app-loading-skeleton type="text" [lines]="3" />
 */
@Component({
  selector: 'app-loading-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    @switch (type) {
      @case ('table') {
        <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <!-- Table header skeleton -->
          <div class="px-4 py-3 border-b border-slate-100 flex items-center gap-4">
            <div class="skeleton h-4 w-20 rounded"></div>
            <div class="skeleton h-4 w-32 rounded"></div>
          </div>
          <!-- Table rows -->
          @for (_ of rowArray; track $index) {
            <div class="px-4 py-3 flex items-center gap-4 border-b border-slate-50">
              <div class="skeleton h-3 w-8 rounded"></div>
              <div class="skeleton h-3 w-24 rounded"></div>
              <div class="skeleton h-3 flex-1 rounded"></div>
              <div class="skeleton h-3 w-16 rounded"></div>
              <div class="skeleton h-5 w-14 rounded-full"></div>
            </div>
          }
        </div>
      }

      @case ('card') {
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          @for (_ of countArray; track $index) {
            <div class="bg-white rounded-2xl border border-slate-200 p-5">
              <div class="flex items-center gap-3 mb-4">
                <div class="skeleton w-10 h-10 rounded-xl"></div>
                <div class="flex-1">
                  <div class="skeleton h-3 w-20 rounded mb-2"></div>
                  <div class="skeleton h-5 w-14 rounded"></div>
                </div>
              </div>
              <div class="skeleton h-2 w-full rounded-full"></div>
            </div>
          }
        </div>
      }

      @case ('text') {
        <div class="space-y-3">
          @for (_ of lineArray; track $index; let last = $last) {
            <div class="skeleton h-3 rounded" [style.width]="last ? '60%' : '100%'"></div>
          }
        </div>
      }

      @case ('form') {
        <div class="space-y-4">
          @for (_ of rowArray; track $index) {
            <div>
              <div class="skeleton h-3 w-24 rounded mb-2"></div>
              <div class="skeleton h-9 w-full rounded-xl"></div>
            </div>
          }
        </div>
      }
    }
  `,
  styles: [`
    .skeleton {
      background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
    }
    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `],
})
export class LoadingSkeletonComponent {
  @Input() type: 'table' | 'card' | 'text' | 'form' = 'table';
  @Input() rows = 5;
  @Input() count = 4;
  @Input() lines = 3;

  get rowArray(): number[] { return Array(this.rows).fill(0); }
  get countArray(): number[] { return Array(this.count).fill(0); }
  get lineArray(): number[] { return Array(this.lines).fill(0); }
}
