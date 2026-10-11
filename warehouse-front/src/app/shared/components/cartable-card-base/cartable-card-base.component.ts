import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgIconDirective } from '../../icons/svg-icon.directive';

@Component({
  selector: 'app-cartable-card-base',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  template: `
    <div 
      class="bg-white rounded-3xl border transition-all duration-200 overflow-hidden shadow-sm relative"
      [ngClass]="{
        'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md': isSelected,
        'border-slate-200/80 hover:border-slate-300 hover:shadow-md': !isSelected,
        'bg-amber-50/40 ring-2 ring-amber-400': isUpdated
      }"
      dir="rtl"
    >
      <!-- Live WebSocket Update Flash Indicator -->
      <div 
        *ngIf="isUpdated" 
        class="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-amber-400 via-indigo-500 to-amber-400 animate-pulse"
      ></div>

      <div class="p-4 md:p-5 flex flex-col gap-3.5">
        
        <!-- ─── LAYER 1: CARD HEADER ─── -->
        <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <!-- Right: Checkbox & Identifiers -->
          <div class="flex items-center gap-2.5 min-w-0">
            <!-- Multi-Select Checkbox -->
            <button 
              *ngIf="selectable"
              type="button"
              (click)="$event.stopPropagation(); selectToggle.emit(!isSelected)"
              class="w-7 h-7 -m-1 rounded-lg border flex items-center justify-center transition-all shrink-0 tap-target"
              [ngClass]="isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-slate-50 hover:border-slate-400'"
              title="انتخاب کارت"
              aria-label="انتخاب کارت"
            >
              <svg *ngIf="isSelected" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" appIcon="check"></svg>
            </button>

            <!-- Main Code / Identifier -->
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="text-xs font-black text-slate-800 tracking-wider font-mono select-all truncate">
                {{ primaryCode }}
              </span>
              <span *ngIf="secondaryCode" class="text-[10px] text-slate-400 font-mono hidden sm:inline">
                ({{ secondaryCode }})
              </span>
            </div>
          </div>

          <!-- Left: Stage Badge & Status Chip -->
          <div class="flex items-center gap-1.5 shrink-0">
            <!-- Stage / Round Badge -->
            <span *ngIf="stageLabel" class="px-2 py-0.5 rounded-lg text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200">
              {{ stageLabel }}
            </span>

            <!-- Status Badge Slot or Default -->
            <span 
              *ngIf="statusLabel"
              class="px-2.5 py-0.5 rounded-lg text-[10px] font-black border"
              [ngClass]="statusBadgeClass"
            >
              {{ statusLabel }}
            </span>

            <!-- Offline Pending Tag -->
            <span *ngIf="isOfflinePending" class="px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1 animate-pulse">
              <span class="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
              <span>در صف همگام‌سازی</span>
            </span>
          </div>
        </div>

        <!-- ─── LAYER 2: CORE ITEM DETAILS ─── -->
        <div class="flex flex-col gap-1.5">
          <!-- Item Title / Description -->
          <h3 class="text-sm font-black text-slate-800 leading-snug line-clamp-2">
            {{ title }}
          </h3>

          <!-- Meta Pills Row (Location, Barcode, Unit) -->
          <div class="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-1">
            <!-- Location Pill -->
            <div *ngIf="location" class="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-xl font-bold text-slate-700">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-slate-500" appIcon="map-pin"></svg>
              <span class="truncate max-w-[150px]">{{ location }}</span>
            </div>

            <!-- Barcode Pill -->
            <div *ngIf="barcode" class="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-xl font-mono text-[11px] text-slate-600">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-slate-400" appIcon="barcode"></svg>
              <span>{{ barcode }}</span>
            </div>

            <!-- Unit Pill -->
            <div *ngIf="unit" class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg text-[11px] font-bold">
              {{ unit }}
            </div>
          </div>
        </div>

        <!-- ─── LAYER 3: ROLE-SPECIFIC CUSTOM CONTENT SLOT ─── -->
        <div class="bg-slate-50/80 rounded-2xl p-3 border border-slate-100/90 flex flex-col gap-2.5">
          <ng-content select="[slot=role-content]"></ng-content>
        </div>

        <!-- ─── LAYER 4: COMMON TOOLS & ACTIONS FOOTER ─── -->
        <div class="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 mt-1">
          <!-- Right: Audit, Dynamic Fields, Secondary Tools -->
          <div class="flex items-center gap-1.5">
            <button 
              *ngIf="showHistoryButton"
              type="button"
              (click)="historyClick.emit()"
              class="p-2 min-h-[36px] text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors flex items-center gap-1 text-xs font-bold tap-target"
              title="تاریخچه گردش کار"
              aria-label="تاریخچه گردش کار"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="clock"></svg>
              <span class="hidden sm:inline">تاریخچه</span>
            </button>

            <ng-content select="[slot=extra-tools]"></ng-content>
          </div>

          <!-- Left: Primary Role Actions (Buttons / Submit) -->
          <div class="flex items-center gap-2">
            <ng-content select="[slot=card-actions]"></ng-content>
          </div>
        </div>

      </div>
    </div>
  `
})
export class CartableCardBaseComponent {
  @Input() isSelected = false;
  @Input() selectable = false;
  @Input() isUpdated = false;
  @Input() isOfflinePending = false;

  @Input() primaryCode = '';
  @Input() secondaryCode = '';
  @Input() stageLabel = '';
  @Input() statusLabel = '';
  @Input() statusType: 'pending' | 'recount' | 'initial' | 'completed' | 'info' = 'pending';

  @Input() title = '';
  @Input() location = '';
  @Input() barcode = '';
  @Input() unit = '';

  @Input() showHistoryButton = true;

  @Output() selectToggle = new EventEmitter<boolean>();
  @Output() historyClick = new EventEmitter<void>();

  get statusBadgeClass(): string {
    switch (this.statusType) {
      case 'recount':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'initial':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'completed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'pending':
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  }
}
