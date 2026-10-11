import {
  Component,
  Input,
  Output,
  EventEmitter,
  ContentChildren,
  QueryList,
  TemplateRef,
  Directive,
  ContentChild,
  OnInit,
  OnDestroy,
  HostListener,
  ViewChildren,
  ElementRef,
  AfterViewInit,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { TableViewApiService, TableViewState } from '../../../core/api/table-view-api.service';
import { OfflinePendingBadgeComponent } from '../offline-pending-badge/offline-pending-badge.component';
import { SvgIconDirective } from '../../icons/svg-icon.directive';

// ══════════════════════════════════════════════════
//  Column Definition Directive
// ══════════════════════════════════════════════════

@Directive({
  selector: '[appTableCol]',
  standalone: true,
})
export class TableColumnDirective {
  @Input('appTableCol') key = '';
  @Input() label = '';
  @Input() sortable = true;
  @Input() filterable = true;
  @Input() width = '';
  @Input() filterType: 'text' | 'checkbox' | 'checkbox_text' | 'date' | 'range' | 'number' | 'date_range' = 'text';
  @Input() filterOptions: {label: string, value: string}[] = [];
  
  // Inline editing properties
  @Input() editable = false;
  @Input() inputType = 'text';

  constructor(public template: TemplateRef<unknown>) {}
}

// ══════════════════════════════════════════════════
//  DataTable Component
// ══════════════════════════════════════════════════

export interface SortState {
  key: string | null;
  direction: 'asc' | 'desc';
}

export interface PageEvent {
  page: number;
  pageSize: number;
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgPersianDatepickerModule, OfflinePendingBadgeComponent, SvgIconDirective],
  template: `
    <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <!-- Header Actions -->
      @if (showHeader) {
        <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-4">
            <!-- Global Search -->
            <div class="relative flex items-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="absolute right-2.5 text-slate-400" appIcon="search"></svg>
              <input type="text" [value]="globalSearch" (input)="onGlobalSearch($event)" placeholder="جستجو (کد، شرح، PO، PL، PK، تگ)..." title="جستجو در فیلدهای: کد یکتا، کد ترکیبی، شرح کالا، سفارش خرید (PO)، پکینگ لیست (PL)، پکیج (PK) و تگ" class="w-72 text-xs py-1.5 pl-2 pr-8 rounded-lg border border-slate-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none placeholder:text-slate-400 transition-shadow">
              @if (isLoading) {
                <svg class="animate-spin absolute left-2.5 w-3.5 h-3.5 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" appIcon="spinner"></svg>
              }
            </div>

            <ng-content select="[table-actions]"></ng-content>

            <div class="flex items-center gap-1.5 text-xs text-slate-500 border-r border-slate-200 pr-4">
              <span class="font-bold text-slate-700">{{ totalCount | number }}</span>
              <span>{{ itemLabel }}</span>
              @if (selectionMode === 'all') {
                <span class="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-black text-[10px] mr-1 flex items-center gap-1.5 shadow-sm">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  تمامی {{ totalCount | number }} رکورد فیلترشده (کل دیتابیس)
                </span>
              } @else if (selectionMode === 'page' || selectedCount > 0) {
                <span class="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 rounded-full font-black text-[10px] mr-1 shadow-sm">
                  {{ selectedCount | number }} رکورد (صفحه جاری)
                </span>
              }
            </div>
          </div>

          <div class="flex items-center gap-2">
            <!-- Zoom Controls -->
            <div class="flex items-center bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
              <button (click)="zoomOut()" title="کوچک‌نمایی (Zoom Out)" class="px-2 py-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="zoom-out"></svg>
              </button>
              <button (click)="resetZoom()" title="اندازه اصلی (100%)" class="px-2 py-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors border-x border-slate-100 min-w-[36px] text-center">
                {{ (zoomScale * 100) | number:'1.0-0' }}%
              </button>
              <button (click)="zoomIn()" title="بزرگ‌نمایی (Zoom In)" class="px-2 py-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="zoom-in"></svg>
              </button>
            </div>

            @if (showColumnToggle) {
              <div class="relative">
                <button (click)="isColumnToggleOpen = !isColumnToggleOpen" class="text-[10px] font-bold text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors bg-white border border-slate-200 px-2 py-1.5 rounded-lg shadow-sm">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="list"></svg>
                  انتخاب ستون‌ها
                </button>
                @if (isColumnToggleOpen) {
                  <!-- Backdrop to close dropdown on outside click -->
                  <div class="fixed inset-0 z-[45]" (click)="isColumnToggleOpen = false"></div>
                  <div class="absolute top-full left-0 mt-1 w-48 bg-white border border-slate-200 shadow-xl rounded-xl z-50 p-2 text-right">
                    <div class="text-[10px] font-black text-slate-400 mb-2 px-1 border-b border-slate-100 pb-2">مدیریت نمایش ستون‌ها</div>
                    <label class="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded cursor-pointer border-b border-slate-100 mb-1">
                      <input type="checkbox" [checked]="visibleColumns?.length === allColumns.length" (change)="toggleAllColumns($event)" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500">
                      <span class="text-xs font-bold text-slate-800">انتخاب همه / هیچ‌کدام</span>
                    </label>
                    <div class="max-h-[60vh] overflow-y-auto space-y-1">
                      @for (col of allColumns; track col.key) {
                        <label class="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded cursor-pointer">
                          <input type="checkbox" [checked]="isColumnVisible(col.key)" (change)="toggleColumnVisibility(col.key)" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500">
                          <span class="text-xs font-bold text-slate-700">{{ col.label }}</span>
                        </label>
                      }
                    </div>
                  </div>
                }
              </div>

              <!-- View Manager Popup -->
              @if (tableName) {
                <div class="relative ml-1">
                  <button (click)="isViewManagerOpen = !isViewManagerOpen" class="text-[10px] font-bold text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors bg-white border border-slate-200 px-2 py-1.5 rounded-lg shadow-sm">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="eye"></svg>
                    مدیریت نماها
                  </button>
                  @if (isViewManagerOpen) {
                    <!-- Backdrop -->
                    <div class="fixed inset-0 z-[45]" (click)="isViewManagerOpen = false"></div>
                    <div class="absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 shadow-xl rounded-xl z-50 p-3 text-right">
                      <div class="text-[10px] font-black text-slate-400 mb-2 border-b border-slate-100 pb-2">مدیریت وضعیت ستون‌ها</div>
                      
                      <!-- Save Current View -->
                      <div class="flex items-center gap-1 mb-1">
                        <input type="text" [(ngModel)]="newViewName" (ngModelChange)="saveError = null" placeholder="نام نمای جدید..." class="flex-1 text-[10px] px-2 py-1.5 rounded border border-slate-200 focus:border-indigo-400 outline-none">
                        <button (click)="saveCurrentView()" [disabled]="!newViewName || isSavingView" class="px-2 py-1.5 bg-indigo-600 text-white text-[10px] font-bold rounded hover:bg-indigo-700 disabled:opacity-50">ذخیره</button>
                      </div>
                      @if (saveError) {
                        <div class="text-[9px] text-rose-500 mb-2 font-bold px-1">{{ saveError }}</div>
                      }
                      
                      <!-- Saved Views List -->
                      <div class="max-h-[40vh] overflow-y-auto space-y-1 mt-2">
                        @for (v of savedViews; track v.id) {
                          <div (click)="applyView(v)" class="flex items-center justify-between p-1.5 hover:bg-slate-50 rounded border border-transparent hover:border-slate-100 cursor-pointer group">
                            <span class="text-xs font-bold text-slate-700 flex-1 truncate" [class.text-indigo-600]="v.is_last_selected">{{ v.view_name }}</span>
                            
                            @if (viewToDelete === v.id) {
                              <div class="flex items-center gap-1" (click)="$event.stopPropagation()">
                                <span class="text-[9px] text-slate-500 ml-1">حذف شود؟</span>
                                <button (click)="deleteView(v.id!); $event.stopPropagation()" class="text-[9px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-1.5 py-0.5 rounded border border-rose-200">بله</button>
                                <button (click)="viewToDelete = null; $event.stopPropagation()" class="text-[9px] font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">خیر</button>
                              </div>
                            } @else {
                              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button (click)="viewToDelete = v.id!; $event.stopPropagation()" class="text-rose-500 hover:text-rose-700 p-0.5 rounded hover:bg-rose-50" title="حذف نما">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" appIcon="trash-2"></svg>
                                </button>
                              </div>
                            }
                          </div>
                        }
                        @if (savedViews.length === 0) {
                          <div class="text-center text-[10px] text-slate-400 py-2">هیچ نمایی ذخیره نشده است</div>
                        }
                      </div>
                    </div>
                  }
                </div>
              }
            }
            @if (showClearFilters && hasActiveFilters) {
              <button
                (click)="clearAllFilters()"
                class="text-[10px] font-bold text-rose-500 hover:text-rose-600 flex items-center gap-1 transition-colors bg-rose-50 px-2 py-1.5 rounded-lg"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="x"></svg>
                پاک کردن فیلترها
              </button>
            }

            <!-- Update Button -->
            @if (editHistory.length > 0) {
              <div class="relative flex items-center gap-1 bg-indigo-50 border border-indigo-100 rounded-lg overflow-hidden ml-2 transition-all p-1">
                <button (click)="undo()" [disabled]="historyIndex < 0" title="بازگشت تغییرات (Ctrl+Z)" class="flex items-center justify-center p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-indigo-100 text-indigo-700 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" appIcon="undo"></svg>
                </button>
                <button (click)="redo()" [disabled]="historyIndex >= editHistory.length - 1" title="اعمال مجدد (Ctrl+Y)" class="flex items-center justify-center p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-indigo-100 text-indigo-700 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" appIcon="redo"></svg>
                </button>
                <div class="w-px h-5 bg-indigo-200 mx-0.5"></div>
                <button (click)="showConfirm()" [disabled]="pendingChanges.size === 0" class="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-indigo-700 bg-white rounded-md shadow-sm border border-indigo-100 hover:bg-indigo-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="save"></svg>
                  ذخیره تغییرات ({{pendingChanges.size}})
                </button>
                <button (click)="showRevertConfirm()" title="لغو تغییرات" class="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-rose-700 bg-white rounded-md shadow-sm border border-rose-100 hover:bg-rose-50 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="undo-2"></svg>
                  لغو تغییرات
                </button>
              </div>
            }
          </div>
        </div>
      }

      <!-- Table -->
      <div class="overflow-auto relative border-b border-slate-200" [ngClass]="tableHeightClass">
        <table class="w-full text-xs" [style.zoom]="zoomScale">
          <thead class="sticky top-0 z-10 bg-white shadow-sm">
            <tr>
              @if (selectable) {
                <th class="px-3 py-3 w-10 text-center">
                  <button
                    type="button"
                    (click)="cycleMasterSelection($event)"
                    class="w-4 h-4 rounded border flex items-center justify-center transition-all cursor-pointer mx-auto shadow-sm active:scale-95"
                    [ngClass]="{
                      'bg-white border-slate-300 hover:border-slate-400': selectionMode === 'none' && !isAllSelected,
                      'bg-indigo-600 border-indigo-600 text-white': selectionMode === 'page' || (selectionMode === 'none' && isAllSelected),
                      'bg-emerald-600 border-emerald-600 text-white ring-2 ring-emerald-400 ring-offset-1': selectionMode === 'all'
                    }"
                    [title]="selectionMode === 'none' ? 'کلیک ۱: انتخاب این صفحه' : selectionMode === 'page' ? 'کلیک ۲: انتخاب تمام رکوردهای فیلترشده (کل دیتابیس)' : 'کلیک ۳: لغو کامل انتخاب'">
                    <svg *ngIf="selectionMode === 'page' || (selectionMode === 'none' && isAllSelected)" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" appIcon="check"></svg>
                    <svg *ngIf="selectionMode === 'all'" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" appIcon="check-check"></svg>
                  </button>
                </th>
              }
              @if (showRowNumber) {
                <th class="px-3 py-3 w-12 text-center font-bold text-slate-600">ردیف</th>
              }
              @for (col of columns; track col.key; let idx = $index) {
                <th
                  draggable="true"
                  (dragstart)="onDragStart($event, idx)"
                  (dragover)="onDragOver($event, idx)"
                  (drop)="onDrop($event, idx)"
                  (dragend)="onDragEnd()"
                  class="px-3 py-3 text-right font-bold text-slate-600 whitespace-nowrap group relative cursor-grab active:cursor-grabbing"
                  [class.opacity-50]="draggedColumnIndex === idx"
                  [class.border-r-2]="dragOverColumnIndex === idx && dragOverColumnIndex > draggedColumnIndex"
                  [class.border-l-2]="dragOverColumnIndex === idx && dragOverColumnIndex < draggedColumnIndex"
                  [class.border-indigo-500]="dragOverColumnIndex === idx"
                  [style.width]="col.width || 'auto'"
                >
                  <div class="flex items-center gap-1.5 bg-white pointer-events-none">
                    <span>{{ col.label }}</span>
                    @if (showColumnToggle) {
                      <button
                        (click)="toggleColumnVisibility(col.key); $event.stopPropagation()"
                        class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 mr-auto pointer-events-auto"
                        title="مخفی کردن ستون"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="x"></svg>
                      </button>
                    }
                    @if (col.sortable) {
                      <button
                        (click)="handleSort(col.key); $event.stopPropagation()"
                        class="p-0.5 rounded hover:bg-slate-200 transition-colors pointer-events-auto"
                        [class.text-indigo-600]="sort.key === col.key"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                          @if (sort.key === col.key && sort.direction === 'desc') {
                            <polyline points="6 15 12 9 18 15"/>
                          } @else {
                            <polyline points="6 9 12 15 18 9"/>
                          }
                        </svg>
                      </button>
                    }
                  </div>
                </th>
              }
              @if (hasActions) {
                <th class="px-3 py-3 text-center font-bold text-slate-600 whitespace-nowrap">عملیات</th>
              }
            </tr>
            @if (showFilters) {
              <tr class="bg-slate-50/50">
                @if (selectable) { <th class="border-t border-slate-100"></th> }
                @if (showRowNumber) { <th class="border-t border-slate-100"></th> }
                
                @for (col of columns; track col.key) {
                  <th class="px-3 py-2 border-t border-slate-100">
                   @if (col.filterable !== false) {
                    <div class="flex items-center gap-1">
                      @if (col.filterType === 'checkbox' || col.filterType === 'checkbox_text') {
                        <div class="relative text-right" [class.w-full]="col.filterType === 'checkbox'" [class.flex-1]="col.filterType === 'checkbox_text'">
                          <button (click)="toggleFilterDropdown(col.key)" class="text-[10px] px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 focus:border-indigo-400 flex items-center justify-center text-slate-500 w-full">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="calendar"></svg>
                          </button>
                          @if (activeFilterDropdown === col.key) {
                            <div class="absolute top-full right-0 mt-1 w-48 bg-white border border-slate-200 shadow-xl rounded-xl z-[60] p-2 text-right flex flex-col gap-1 max-h-48 overflow-y-auto">
                              @for (opt of col.filterOptions; track opt.value) {
                                <label class="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded cursor-pointer">
                                  <input type="checkbox" [checked]="isFilterOptionSelected(col.key, opt.value)" (change)="toggleFilterOption(col.key, opt.value)" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500">
                                  <span class="text-xs font-bold text-slate-700">{{ opt.label }}</span>
                                </label>
                              }
                            </div>
                            <div class="fixed inset-0 z-[55]" (click)="activeFilterDropdown = null"></div>
                          }
                        </div>
                      }
                      
                      @if (col.filterType === 'date' || col.filterType === 'date_range') {
                        <div class="relative text-right w-full min-w-[120px]">
                          <button (click)="toggleFilterDropdown(col.key)" class="w-full text-[10px] px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 focus:border-indigo-400 flex items-center justify-between text-slate-500 whitespace-nowrap">
                            <span class="truncate">{{ filters[col.key] || 'همه زمان‌ها' }}</span>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="flex-shrink-0 mr-1" appIcon="calendar"></svg>
                          </button>
                          @if (activeFilterDropdown === col.key) {
                            <div class="absolute top-full right-0 mt-1 w-64 bg-white border border-slate-200 shadow-2xl rounded-2xl z-[70] p-3 text-right flex flex-col gap-1.5 overflow-visible">
                              @if (!showCustomDateRange) {
                                <div class="flex flex-wrap gap-1 mb-2 pb-2 border-b border-slate-100">
                                  <button (click)="applyDateFilter(col.key, '', 'همه')" class="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors" [class.bg-indigo-50]="!filters[col.key]" [class.text-indigo-600]="!filters[col.key]" [class.text-slate-600]="filters[col.key]">همه</button>
                                  <button (click)="applyDateFilter(col.key, '1h', '۱ ساعت')" class="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors" [class.bg-indigo-50]="filters[col.key] === '۱ ساعت'" [class.text-indigo-600]="filters[col.key] === '۱ ساعت'" [class.text-slate-600]="filters[col.key] !== '۱ ساعت'">۱ ساعت</button>
                                  <button (click)="applyDateFilter(col.key, '3h', '۳ ساعت')" class="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors" [class.bg-indigo-50]="filters[col.key] === '۳ ساعت'" [class.text-indigo-600]="filters[col.key] === '۳ ساعت'" [class.text-slate-600]="filters[col.key] !== '۳ ساعت'">۳ ساعت</button>
                                  <button (click)="applyDateFilter(col.key, '6h', '۶ ساعت')" class="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors" [class.bg-indigo-50]="filters[col.key] === '۶ ساعت'" [class.text-indigo-600]="filters[col.key] === '۶ ساعت'" [class.text-slate-600]="filters[col.key] !== '۶ ساعت'">۶ ساعت</button>
                                  <button (click)="applyDateFilter(col.key, 'today', 'امروز')" class="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors" [class.bg-indigo-50]="filters[col.key] === 'امروز'" [class.text-indigo-600]="filters[col.key] === 'امروز'" [class.text-slate-600]="filters[col.key] !== 'امروز'">امروز</button>
                                  <button (click)="applyDateFilter(col.key, 'yesterday', 'دیروز')" class="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors" [class.bg-indigo-50]="filters[col.key] === 'دیروز'" [class.text-indigo-600]="filters[col.key] === 'دیروز'" [class.text-slate-600]="filters[col.key] !== 'دیروز'">دیروز</button>
                                </div>
                                <div class="text-[10px] font-bold text-slate-500 mb-1">یا بازه دلخواه:</div>
                              }
                              <div class="text-[10px] font-bold text-slate-600 mb-1">از تاریخ:</div>
                              <ng-persian-datepicker [dateInitValue]="false" (dateOnSelect)="customDateStart = $event.gregorian" class="w-full relative block">
                                <input type="text" [formControl]="customDateStartControl" class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 focus:border-indigo-400 outline-none mb-1 shadow-2xs" placeholder="انتخاب تاریخ">
                              </ng-persian-datepicker>
                              <div class="text-[10px] font-bold text-slate-600 mb-1">تا تاریخ:</div>
                              <ng-persian-datepicker [dateInitValue]="false" (dateOnSelect)="customDateEnd = $event.gregorian" class="w-full relative block">
                                <input type="text" [formControl]="customDateEndControl" class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 focus:border-indigo-400 outline-none mb-2 shadow-2xs" placeholder="انتخاب تاریخ">
                              </ng-persian-datepicker>
                              <div class="flex items-center gap-1.5 pt-1">
                                <button (click)="applyCustomDateRange(col.key)" class="flex-1 bg-indigo-600 text-white text-xs font-bold py-1.5 rounded-lg hover:bg-indigo-700 transition-colors shadow-xs">اعمال</button>
                                <button (click)="clearCustomDateRange(col.key)" class="flex-1 bg-slate-100 text-rose-600 text-xs font-bold py-1.5 rounded-lg hover:bg-rose-50 transition-colors">پاک کردن</button>
                              </div>
                            </div>
                            <div class="fixed inset-0 z-[55]" (click)="activeFilterDropdown = null; showCustomDateRange = false"></div>
                          }
                        </div>
                      }
                      
                      @if (col.filterType === 'range') {
                        <div class="relative text-right w-full min-w-[120px]">
                          <button (click)="toggleFilterDropdown(col.key)" class="w-full text-[10px] px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 focus:border-indigo-400 flex items-center justify-between text-slate-500 whitespace-nowrap">
                            <span class="truncate">{{ filters[col.key] || 'همه مقادیر' }}</span>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="flex-shrink-0 mr-1" appIcon="calendar"></svg>
                          </button>
                          @if (activeFilterDropdown === col.key) {
                            <div class="absolute top-full right-0 mt-1 w-48 bg-white border border-slate-200 shadow-xl rounded-xl z-[60] p-2 text-right flex flex-col gap-1">
                              <div class="text-[10px] font-bold text-slate-600 mb-1">از مقدار:</div>
                              <input type="number" [(ngModel)]="customRangeStart" class="w-full text-[10px] px-2 py-1 rounded border border-slate-200 focus:border-indigo-400 outline-none mb-1">
                              <div class="text-[10px] font-bold text-slate-600 mb-1">تا مقدار:</div>
                              <input type="number" [(ngModel)]="customRangeEnd" class="w-full text-[10px] px-2 py-1 rounded border border-slate-200 focus:border-indigo-400 outline-none mb-2">
                              <div class="flex items-center gap-1">
                                <button (click)="applyCustomRange(col.key)" class="flex-1 bg-indigo-600 text-white text-[10px] font-bold py-1 rounded hover:bg-indigo-700">اعمال</button>
                                <button (click)="clearCustomRange(col.key)" class="flex-1 bg-slate-100 text-slate-600 text-[10px] font-bold py-1 rounded hover:bg-slate-200">پاک کردن</button>
                              </div>
                            </div>
                            <div class="fixed inset-0 z-[55]" (click)="activeFilterDropdown = null"></div>
                          }
                        </div>
                      }
                      
                      @if (!col.filterType || col.filterType === 'text' || col.filterType === 'checkbox_text' || col.filterType === 'number') {
                        <input
                          [type]="col.filterType === 'number' ? 'number' : 'text'"
                          class="text-[10px] px-2 py-1 rounded-lg border border-slate-200 focus:border-indigo-400 outline-none placeholder:text-slate-300"
                          [class.w-full]="!col.filterType || col.filterType === 'text'"
                          [class.flex-[2]]="col.filterType === 'checkbox_text'"
                          [class.w-0]="col.filterType === 'checkbox_text'"
                          placeholder="جستجو..."
                          [value]="col.filterType === 'checkbox_text' ? (filters[col.key + '_search'] || '') : (filters[col.key] || '')"
                          (input)="onFilter(col.filterType === 'checkbox_text' ? col.key + '_search' : col.key, $any($event.target).value)"
                        />
                      }
                    </div>
                   }
                  </th>
                }
                
                @if (hasActions) { <th class="border-t border-slate-100"></th> }
              </tr>
            }
          </thead>

          <tbody class="divide-y divide-slate-100 bg-white transition-opacity duration-300" [class.opacity-50]="isLoading" [class.pointer-events-none]="isLoading">
            @for (row of data; track trackByFn(row); let i = $index) {
              <tr
                class="transition-colors group"
                [ngClass]="rowClasses(row)"
                [class.bg-indigo-50/50]="isRowSelected(row)"
                (click)="onRowClicked(row, $event)"
              >
                @if (selectable) {
                  <td class="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      [checked]="isRowSelected(row)"
                      (change)="toggleRowSelection(row, $event)"
                      class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </td>
                }
                @if (showRowNumber) {
                  <td class="px-3 py-2.5 text-center text-[10px] text-slate-400 font-bold">
                    {{ (currentPage - 1) * pageSize + i + 1 }}
                  </td>
                }
                @for (col of columns; track col.key; let firstCol = $first) {
                  <td class="px-3 py-2.5 text-slate-700 relative group/cell" [class.bg-yellow-50]="pendingChanges.has(row)">
                    @if (col.editable) {
                      @if (isEditing(row, col.key)) {
                        <input
                          #editInput
                          [type]="col.inputType"
                          [value]="getCellValue(row, col.key)"
                          (blur)="onEditCommit(row, col.key, editInput.value)"
                          (keydown)="handleKeyDown($event, row, col.key, editInput)"
                          class="editing-cell-input w-full min-w-[80px] text-xs px-2 py-1 rounded border border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none bg-white shadow-sm"
                        />
                      } @else {
                        <div (click)="startEditing(row, col.key, $event)" class="cursor-text hover:bg-indigo-50/50 p-1 -m-1 rounded transition-colors border border-transparent hover:border-indigo-100 flex items-center min-h-[28px]" title="کلیک برای ویرایش سریع">
                          <ng-container
                            [ngTemplateOutlet]="col.template"
                            [ngTemplateOutletContext]="{ $implicit: row, row: row, value: row[col.key], index: i }"
                          ></ng-container>
                        </div>
                      }
                    } @else {
                      <ng-container
                        [ngTemplateOutlet]="col.template"
                        [ngTemplateOutletContext]="{ $implicit: row, row: row, value: row[col.key], index: i }"
                      ></ng-container>
                    }
                    @if (firstCol && row._offlinePending) {
                      <app-offline-pending-badge class="block mt-1" />
                    }
                  </td>
                }
                @if (hasActions) {
                  <td class="px-3 py-2.5 text-center">
                    <ng-content select="[table-row-actions]"></ng-content>
                  </td>
                }
              </tr>
            } @empty {
              <tr>
                <td [attr.colspan]="totalColumns" class="px-6 py-12 text-center">
                  @if (isLoading) {
                    <div class="text-slate-400 flex flex-col items-center justify-center">
                      <svg class="animate-spin mb-3 text-indigo-500" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="spinner"></svg>
                      <p class="text-xs font-bold">در حال بارگذاری...</p>
                    </div>
                  } @else {
                    <div class="text-slate-400">
                      <svg class="mx-auto mb-3" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" appIcon="search"></svg>
                      <p class="text-xs font-bold">{{ emptyMessage }}</p>
                    </div>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      @if (showPagination && totalCount > pageSize) {
        <div class="px-4 py-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div class="text-[10px] sm:text-xs text-slate-500 font-medium">
            نمایش {{ startIndex }}–{{ endIndex }} از {{ totalCount }}
          </div>
          <div class="flex items-center gap-1">
            <button
              (click)="goToPage(currentPage - 1)"
              [disabled]="currentPage === 1"
              title="صفحه قبل"
              aria-label="صفحه قبل"
              class="min-w-[40px] sm:min-w-[36px] min-h-[40px] sm:min-h-[36px] p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="action-back"></svg>
            </button>
            @for (p of visiblePages; track p) {
              <button
                (click)="goToPage(p)"
                class="min-w-[32px] min-h-[32px] w-8 h-8 rounded-lg text-[10px] sm:text-xs font-bold transition-colors flex items-center justify-center cursor-pointer"
                [attr.title]="'صفحه ' + p"
                [attr.aria-label]="'صفحه ' + p"
                [ngClass]="p === currentPage ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'"
              >
                {{ p }}
              </button>
            }
            <button
              (click)="goToPage(currentPage + 1)"
              [disabled]="currentPage === totalPages"
              title="صفحه بعد"
              aria-label="صفحه بعد"
              class="min-w-[40px] sm:min-w-[36px] min-h-[40px] sm:min-h-[36px] p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="action-forward"></svg>
            </button>
          </div>
        </div>
      }

      <!-- Confirmation Modal -->
      @if (isConfirming) {
        <div class="fixed inset-0 z-[100] flex items-center justify-center">
          <!-- Backdrop -->
          <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" (click)="cancelUpdate()"></div>
          
          <!-- Modal Content -->
          <div class="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-[90%] max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div class="p-5 text-center">
              <div class="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="save"></svg>
              </div>
              <h3 class="text-base font-black text-slate-800 mb-2">ذخیره تغییرات؟</h3>
              <p class="text-xs text-slate-500 leading-relaxed font-medium">شما تغییراتی در {{pendingChanges.size}} رکورد ایجاد کرده‌اید. آیا مایل به ذخیره این تغییرات در سیستم هستید؟</p>
            </div>
            
            <div class="p-3 bg-slate-50 border-t border-slate-100 flex gap-2">
              <button (click)="confirmUpdate()" class="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex justify-center items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="check"></svg>
                تایید
              </button>
              <button (click)="cancelUpdate()" class="flex-1 py-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors">
                لغو
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Revert Confirmation Modal -->
      @if (isRevertConfirming) {
        <div class="fixed inset-0 z-[100] flex items-center justify-center">
          <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" (click)="cancelRevert()"></div>
          
          <div class="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-[90%] max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div class="p-5 text-center">
              <div class="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="trash-2"></svg>
              </div>
              <h3 class="text-base font-black text-slate-800 mb-2">لغو تغییرات؟</h3>
              <p class="text-xs text-slate-500 leading-relaxed font-medium">آیا از لغو تمام تغییرات خود مطمئن هستید؟ این کار غیرقابل بازگشت است.</p>
            </div>
            
            <div class="p-3 bg-slate-50 border-t border-slate-100 flex gap-2">
              <button (click)="confirmRevertAll()" class="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex justify-center items-center gap-2">
                تایید
              </button>
              <button (click)="cancelRevert()" class="flex-1 py-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors">
                لغو
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class DataTableComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() data: any[] = [];
  @Input() totalCount = 0;
  @Input() pageSize = 20;
  @Input() currentPage = 1;
  @Input() itemLabel = 'مورد';
  @Input() emptyMessage = 'موردی یافت نشد';
  @Input() selectable = false;
  @Input() showRowNumber = false;
  @Input() showHeader = true;
  @Input() showFilters = true;
  @Input() showPagination = true;
  @Input() showClearFilters = true;
  @Input() showColumnToggle = false;
  @Input() hasActions = false;
  @Input() trackByKey = 'id';
  @Input() selectedIds: Set<any> = new Set();
  @Input() selectionMode: 'none' | 'page' | 'all' = 'none';
  @Input() visibleColumns: string[] | null = null; // If null, all columns are visible
  @Input() filters: Record<string, string> = {};
  @Input() isLoading = false;
  @Input() globalSearch: string = '';
  @Input() tableHeightClass: string = 'max-h-[60vh]';
  @Input() rowClass: (row: any) => string = () => '';

  /**
   * `rowClass` متعلق به مصرف‌کننده است، پس بازنویسی نمی‌شود؛ کلاس رکوردهای
   * در صف آفلاین روی خروجی آن سوار می‌شود.
   */
  rowClasses = (row: any) => [
    this.rowClass(row) || 'hover:bg-indigo-50/30',
    this.rowClick.observed ? 'cursor-pointer hover:bg-indigo-50/40' : '',
    row?._offlinePending ? 'bg-sky-50 ring-1 ring-inset ring-sky-200' : '',
  ];

  @Output() rowClick = new EventEmitter<any>();
  @Output() sortChanged = new EventEmitter<SortState>();
  @Output() filterChanged = new EventEmitter<Record<string, string>>();
  @Output() searchChanged = new EventEmitter<string>();
  @Output() pageChanged = new EventEmitter<PageEvent>();
  @Output() selectionChanged = new EventEmitter<Set<any>>();
  @Output() selectionModeChange = new EventEmitter<'none' | 'page' | 'all'>();
  @Output() filtersCleared = new EventEmitter<void>();
  @Output() visibleColumnsChanged = new EventEmitter<string[]>();
  @Output() bulkUpdate = new EventEmitter<any[]>();

  @ContentChildren(TableColumnDirective) columnDefs!: QueryList<TableColumnDirective>;
  @ViewChildren('editInput') editInputs!: QueryList<ElementRef>;

  sort: SortState = { key: null, direction: 'asc' };
  isColumnToggleOpen = false;
  activeFilterDropdown: string | null = null;
  showCustomDateRange: boolean = false;
  customDateStart: string = '';
  customDateEnd: string = '';
  customDateStartControl = new FormControl('');
  customDateEndControl = new FormControl('');
  customRangeStart: number | null = null;
  customRangeEnd: number | null = null;

  private filterTimeout: any;

  // Zoom feature
  zoomScale: number = 1.0;

  // Drag and drop feature
  draggedColumnIndex = -1;
  dragOverColumnIndex = -1;

  // Inline editing history & state
  editHistory: { row: any; field: string; oldVal: any; newVal: any }[] = [];
  historyIndex = -1;
  pendingChanges = new Set<any>(); 
  editingCell: { row: any; field: string; value?: any } | null = null;
  isConfirming = false;
  isRevertConfirming = false;
  isCancelling = false;
  moveToAfterCommit: { rowDelta: number, colDelta: number } | null = null;
  selectAllOnFocus = false;

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    const isInsideInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      if (event.code === 'KeyZ' && !event.shiftKey) {
        event.preventDefault();
        this.undo();
      } else if (event.code === 'KeyY' || (event.code === 'KeyZ' && event.shiftKey)) {
        event.preventDefault();
        this.redo();
      } else if (event.code === 'KeyS') {
        if (this.pendingChanges.size > 0) {
          event.preventDefault();
          this.confirmUpdate();
        }
      } else if (event.code === 'KeyA' && !isInsideInput && this.selectable) {
        event.preventDefault();
        this.selectAllRows(!this.isAllSelected);
      }
    }

    if (event.key === 'Escape') {
      if (this.editingCell) {
        this.cancelEditing();
      } else if (this.isConfirming) {
        this.isConfirming = false;
      } else if (this.isRevertConfirming) {
        this.isRevertConfirming = false;
      } else if (this.isViewManagerOpen) {
        this.isViewManagerOpen = false;
      } else if (this.isColumnToggleOpen) {
        this.isColumnToggleOpen = false;
      } else if (this.activeFilterDropdown) {
        this.activeFilterDropdown = null;
      }
    }
  }

  selectAllRows(select: boolean = true) {
    if (!this.selectable) return;
    const newSet = new Set(this.selectedIds);
    if (select) {
      this.data.forEach(r => newSet.add(this.getRowKey(r)));
    } else {
      this.data.forEach(r => newSet.delete(this.getRowKey(r)));
    }
    this.selectedIds = newSet;
    this.selectionChanged.emit(newSet);
    this.cdr.detectChanges();
  }

  @HostListener('window:beforeunload', ['$event'])
  unloadNotification($event: any) {
    if (this.pendingChanges.size > 0) {
      $event.returnValue = true;
    }
  }

  // View Manager State
  @Input() tableName: string = '';
  isViewManagerOpen = false;
  savedViews: TableViewState[] = [];
  newViewName = '';
  isSavingView = false;
  viewToDelete: number | null = null;
  saveError: string | null = null;

  constructor(private cdr: ChangeDetectorRef, private tableViewApi: TableViewApiService) {}

  ngOnInit() {
    if (this.tableName) {
      this.loadSavedViews();
    }
  }

  loadSavedViews() {
    this.tableViewApi.getAll(this.tableName).subscribe(views => {
      this.savedViews = views;
      const defaultView = views.find(v => v.is_last_selected);
      if (defaultView) {
        this.applyView(defaultView, true); // true = silent apply
      }
      this.cdr.detectChanges();
    });
  }

  saveCurrentView() {
    if (!this.newViewName) return;
    this.saveError = null;
    
    // Check for duplicate name
    if (this.savedViews.some(v => v.view_name.trim() === this.newViewName.trim())) {
      this.saveError = 'این نام تکراری است. لطفاً نام دیگری انتخاب کنید.';
      return;
    }
    
    this.isSavingView = true;
    
    // Ensure allColumns exist so we save their keys
    const currentCols = this.visibleColumns ? this.visibleColumns : this.allColumns.map(c => c.key);
    
    const payload: TableViewState = {
      table_name: this.tableName,
      view_name: this.newViewName,
      columns_state: currentCols
    };
    
    this.tableViewApi.create(payload).subscribe({
      next: (res) => {
        this.newViewName = '';
        this.isSavingView = false;
        this.isViewManagerOpen = false;
        this.saveError = null;
        this.cdr.detectChanges();
        this.loadSavedViews(); // Reload list to get the new view with ID
      },
      error: () => {
        this.isSavingView = false;
      }
    });
  }

  applyView(view: TableViewState, silent = false) {
    if (view.columns_state && view.columns_state.length > 0) {
      this.visibleColumns = [...view.columns_state];
      if (!silent) {
        this.visibleColumnsChanged.emit(this.visibleColumns);
        this.isViewManagerOpen = false;
        
        // Tell backend this is the last selected
        if (view.id) {
          this.tableViewApi.setLastSelected(view.id).subscribe(() => {
            this.savedViews.forEach(v => v.is_last_selected = (v.id === view.id));
          });
        }
      }
    }
  }

  deleteView(id: number) {
    // Optimistic UI update
    this.savedViews = this.savedViews.filter(v => v.id !== id);
    this.viewToDelete = null;
    this.cdr.detectChanges();
    
    this.tableViewApi.delete(id).subscribe({
      next: () => {
        this.loadSavedViews();
      },
      error: () => {
        this.loadSavedViews(); // reload on error to restore the deleted view
      }
    });
  }

  ngAfterViewInit() {
    this.editInputs.changes.subscribe((inputs: QueryList<ElementRef>) => {
      if (inputs.length > 0) {
        setTimeout(() => {
          const input = inputs.first.nativeElement as HTMLInputElement;
          input.focus();
          
          if (this.selectAllOnFocus) {
            input.select();
            this.selectAllOnFocus = false;
          } else if (input.type === 'text' && this.lastClickOffset !== -1) {
            const safeOffset = Math.min(this.lastClickOffset, input.value.length);
            input.setSelectionRange(safeOffset, safeOffset);
          }
        }, 10);
      }
    });
  }

  ngOnDestroy() {
    if (this.filterTimeout) {
      clearTimeout(this.filterTimeout);
    }
  }

  onRowClicked(row: any, event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target && target.closest('button, input, select, textarea, a, label, [table-row-actions], .no-row-click, .editing-cell-input')) {
      return;
    }
    this.rowClick.emit(row);
  }

  zoomIn() {
    this.zoomScale = Math.min(this.zoomScale + 0.1, 2.0);
  }

  zoomOut() {
    this.zoomScale = Math.max(this.zoomScale - 0.1, 0.5);
  }

  resetZoom() {
    this.zoomScale = 1.0;
  }

  onDragStart(event: DragEvent, index: number) {
    this.draggedColumnIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onDragOver(event: DragEvent, index: number) {
    event.preventDefault(); // Necessary to allow dropping
    this.dragOverColumnIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onDrop(event: DragEvent, index: number) {
    event.preventDefault();
    if (this.draggedColumnIndex > -1 && this.draggedColumnIndex !== index) {
      const cols = [...this.columns];
      const draggedCol = cols[this.draggedColumnIndex];
      
      if (!this.visibleColumns) {
        this.visibleColumns = this.allColumns.map(c => c.key);
      }
      
      const draggedKey = draggedCol.key;
      const targetKey = cols[index].key;
      
      const currentKeys = [...this.visibleColumns];
      const fromIdx = currentKeys.indexOf(draggedKey);
      const toIdx = currentKeys.indexOf(targetKey);
      
      if (fromIdx > -1 && toIdx > -1) {
        currentKeys.splice(fromIdx, 1);
        currentKeys.splice(toIdx, 0, draggedKey);
        this.visibleColumns = currentKeys;
        this.visibleColumnsChanged.emit(this.visibleColumns);
      }
    }
    this.draggedColumnIndex = -1;
    this.dragOverColumnIndex = -1;
  }

  onDragEnd() {
    this.draggedColumnIndex = -1;
    this.dragOverColumnIndex = -1;
  }

  onGlobalSearch(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    if (this.filterTimeout) {
      clearTimeout(this.filterTimeout);
    }
    this.filterTimeout = setTimeout(() => {
      this.searchChanged.emit(value);
    }, 400);
  }

  applyCustomRange(key: string) {
    if (this.customRangeStart !== null || this.customRangeEnd !== null) {
      let label = '';
      if (this.customRangeStart !== null && this.customRangeEnd !== null) {
        label = `از ${this.customRangeStart} تا ${this.customRangeEnd}`;
      } else if (this.customRangeStart !== null) {
        label = `بیشتر از ${this.customRangeStart}`;
      } else if (this.customRangeEnd !== null) {
        label = `کمتر از ${this.customRangeEnd}`;
      }
      this.filters = { ...this.filters, [key]: label };
      
      if (this.customRangeStart !== null) {
        this.filters[key + '_min'] = this.customRangeStart.toString();
      } else {
        delete this.filters[key + '_min'];
      }
      if (this.customRangeEnd !== null) {
        this.filters[key + '_max'] = this.customRangeEnd.toString();
      } else {
        delete this.filters[key + '_max'];
      }
      this.filterChanged.emit({ ...this.filters });
    }
    this.activeFilterDropdown = null;
    this.cdr.detectChanges();
  }

  clearCustomDateRange(key: string) {
    this.customDateStartControl.setValue('');
    this.customDateEndControl.setValue('');
    this.customDateStart = '';
    this.customDateEnd = '';
    
    const newFilters = { ...this.filters };
    delete newFilters[key];
    delete newFilters[key + '_after'];
    delete newFilters[key + '_before'];
    this.filters = newFilters;
    this.filterChanged.emit({ ...this.filters });
    this.activeFilterDropdown = null;
    this.cdr.detectChanges();
  }

  clearCustomRange(key: string) {
    const newFilters = { ...this.filters };
    delete newFilters[key];
    delete newFilters[key + '_min'];
    delete newFilters[key + '_max'];
    this.filters = newFilters;
    this.customRangeStart = null;
    this.customRangeEnd = null;
    this.activeFilterDropdown = null;
    this.filterChanged.emit({ ...this.filters });
    this.cdr.detectChanges();
  }

  dateFilterOptions = [
    { label: 'همه زمان‌ها', value: '' },
    { label: 'یک ساعت قبل', value: '1h' },
    { label: 'سه ساعت قبل', value: '3h' },
    { label: 'شش ساعت قبل', value: '6h' },
    { label: 'امروز', value: 'today' },
    { label: 'دیروز', value: 'yesterday' },
    { label: 'یک هفته قبل', value: '1w' },
    { label: 'انتخاب بازه', value: 'custom' }
  ];

  toggleFilterDropdown(key: string) {
    if (this.activeFilterDropdown === key) {
      this.activeFilterDropdown = null;
      this.showCustomDateRange = false;
    } else {
      this.activeFilterDropdown = key;
      this.showCustomDateRange = false;
    }
    this.cdr.detectChanges();
  }

  hasFilter(key: string): boolean {
    const val = this.filters[key];
    return typeof val === 'string' ? val.trim().length > 0 : !!val;
  }

  isFilterOptionSelected(key: string, value: string): boolean {
    const current = this.filters[key];
    if (!current) return false;
    return current.split(',').includes(value);
  }

  toggleFilterOption(key: string, value: string): void {
    const current = this.filters[key];
    let selected = current ? current.split(',') : [];
    if (selected.includes(value)) {
      selected = selected.filter(v => v !== value);
    } else {
      selected.push(value);
    }
    
    if (selected.length > 0) {
      this.filters = { ...this.filters, [key]: selected.join(',') };
    } else {
      const newFilters = { ...this.filters };
      delete newFilters[key];
      this.filters = newFilters;
    }
    this.filterChanged.emit({ ...this.filters });
  }

  applyCustomDateRange(key: string) {
    if (this.customDateStart || this.customDateEnd) {
      let label = 'بازه انتخابی';
      this.filters = { ...this.filters, [key]: label };
      if (this.customDateStart) {
        this.filters[key + '_after'] = new Date(this.customDateStart).toISOString();
      } else {
        delete this.filters[key + '_after'];
      }
      if (this.customDateEnd) {
        const end = new Date(this.customDateEnd);
        end.setHours(23, 59, 59, 999);
        this.filters[key + '_before'] = end.toISOString();
      } else {
        delete this.filters[key + '_before'];
      }
      this.filterChanged.emit({ ...this.filters });
    }
    this.activeFilterDropdown = null;
    this.showCustomDateRange = false;
    this.cdr.detectChanges();
  }

  applyDateFilter(key: string, value: string, label: string) {
    if (value === 'custom') {
      this.showCustomDateRange = true;
      return;
    }
    
    if (!value) {
      const newFilters = { ...this.filters };
      delete newFilters[key];
      delete newFilters[key + '_after'];
      delete newFilters[key + '_before'];
      this.filters = newFilters;
      this.customDateStartControl.setValue('');
      this.customDateEndControl.setValue('');
      this.customDateStart = '';
      this.customDateEnd = '';
    } else {
      this.filters = { ...this.filters, [key]: label };
      const now = new Date();
      let afterDate = new Date();
      let beforeDate: Date | null = null;

      if (value === '1h') {
        afterDate.setHours(now.getHours() - 1);
      } else if (value === '3h') {
        afterDate.setHours(now.getHours() - 3);
      } else if (value === '6h') {
        afterDate.setHours(now.getHours() - 6);
      } else if (value === 'today') {
        afterDate.setHours(0, 0, 0, 0);
      } else if (value === 'yesterday') {
        afterDate.setDate(now.getDate() - 1);
        afterDate.setHours(0, 0, 0, 0);
        beforeDate = new Date(now);
        beforeDate.setHours(0, 0, 0, 0);
      } else if (value === '1w') {
        afterDate.setDate(now.getDate() - 7);
      }

      this.filters[key + '_after'] = afterDate.toISOString();
      if (beforeDate) {
        this.filters[key + '_before'] = beforeDate.toISOString();
      } else {
        delete this.filters[key + '_before'];
      }
    }
    this.activeFilterDropdown = null;
    this.showCustomDateRange = false;
    this.filterChanged.emit({ ...this.filters });
  }

  get allColumns(): TableColumnDirective[] {
    return this.columnDefs?.toArray() ?? [];
  }

  get columns(): TableColumnDirective[] {
    const all = this.allColumns;
    if (!this.visibleColumns) return all;
    return this.visibleColumns
      .map(key => all.find(c => c.key === key))
      .filter((c): c is TableColumnDirective => c !== undefined);
  }

  isColumnVisible(key: string): boolean {
    if (!this.visibleColumns) return true;
    return this.visibleColumns.includes(key);
  }

  toggleColumnVisibility(key: string): void {
    if (!this.visibleColumns) {
      this.visibleColumns = this.allColumns.map(c => c.key);
    }
    const idx = this.visibleColumns.indexOf(key);
    if (idx >= 0) {
      this.visibleColumns.splice(idx, 1);
    } else {
      this.visibleColumns.push(key);
    }
    this.visibleColumnsChanged.emit([...this.visibleColumns]);
  }

  toggleAllColumns(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      this.visibleColumns = this.allColumns.map(c => c.key);
    } else {
      this.visibleColumns = [];
    }
    this.visibleColumnsChanged.emit([...this.visibleColumns]);
  }

  get totalColumns(): number {
    let count = this.columns.length;
    if (this.selectable) count++;
    if (this.showRowNumber) count++;
    if (this.hasActions) count++;
    return count;
  }

  get isAllSelected(): boolean {
    return this.data.length > 0 && this.data.every((row) => this.selectedIds.has(this.getRowKey(row)));
  }

  get selectedCount(): number {
    return this.selectedIds.size;
  }

  get hasActiveFilters(): boolean {
    if (!this.filters) return false;
    return Object.values(this.filters).some((v) => {
      return typeof v === 'string' ? v.trim().length > 0 : !!v;
    });
  }

  get totalPages(): number {
    return Math.ceil(this.totalCount / this.pageSize) || 1;
  }

  get startIndex(): number {
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  get endIndex(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalCount);
  }

  get visiblePages(): number[] {
    const pages: number[] = [];
    const start = Math.max(1, this.currentPage - 2);
    const end = Math.min(this.totalPages, this.currentPage + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  /**
   * رکوردهای ساخته‌شده در حالت آفلاین هنوز `id` سرور را ندارند و فقط
   * `_offlineId` دارند. بازگشت خود شیء به‌عنوان آخرین fallback تضمین می‌کند
   * کلید هرگز تکراری نشود (وگرنه @for خطای NG0955 می‌دهد).
   */
  getRowKey = (row: any) => row?.[this.trackByKey] ?? row?.['_offlineId'] ?? row;

  trackByFn = (row: any) => this.getRowKey(row);

  handleSort(key: string): void {
    if (this.sort.key === key) {
      this.sort = { key, direction: this.sort.direction === 'asc' ? 'desc' : 'asc' };
    } else {
      this.sort = { key, direction: 'asc' };
    }
    this.sortChanged.emit({ ...this.sort });
  }

  onFilter(key: string, value: string): void {
    if (this.filterTimeout) {
      clearTimeout(this.filterTimeout);
    }
    
    if (value.trim() === '') {
      const newFilters = { ...this.filters };
      delete newFilters[key];
      this.filters = newFilters;
    } else {
      this.filters = { ...this.filters, [key]: value };
    }
    
    this.filterTimeout = setTimeout(() => {
      this.filterChanged.emit({ ...this.filters });
    }, 400);
  }

  clearAllFilters(emitEvent: boolean = true): void {
    if (this.filterTimeout) {
      clearTimeout(this.filterTimeout);
      this.filterTimeout = null;
    }
    this.filters = {};
    this.sort = { key: null, direction: 'asc' };
    this.customDateStartControl.setValue('');
    this.customDateEndControl.setValue('');
    this.customDateStart = '';
    this.customDateEnd = '';
    this.globalSearch = '';
    if (emitEvent) {
      this.filtersCleared.emit();
    }
  }

  cycleMasterSelection(event?: Event): void {
    if (event) event.preventDefault();
    if (!this.selectable) return;

    if (this.selectionMode === 'none') {
      // کلیک اول: انتخاب رکوردهای صفحه جاری
      this.selectionMode = 'page';
      const newSet = new Set(this.selectedIds);
      this.data.forEach((row) => newSet.add(this.getRowKey(row)));
      this.selectedIds = newSet;
      this.selectionModeChange.emit('page');
      this.selectionChanged.emit(newSet);
    } else if (this.selectionMode === 'page') {
      // کلیک دوم: انتخاب تمام رکوردهای فیلترشده در کل دیتابیس
      this.selectionMode = 'all';
      const newSet = new Set(this.selectedIds);
      this.data.forEach((row) => newSet.add(this.getRowKey(row)));
      this.selectedIds = newSet;
      this.selectionModeChange.emit('all');
      this.selectionChanged.emit(newSet);
    } else {
      // کلیک سوم: لغو کامل انتخاب‌ها
      this.selectionMode = 'none';
      this.selectedIds = new Set();
      this.selectionModeChange.emit('none');
      this.selectionChanged.emit(this.selectedIds);
    }
  }

  toggleSelectAll(event: Event): void {
    this.cycleMasterSelection(event);
  }

  toggleRowSelection(row: any, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const newSet = new Set(this.selectedIds);
    if (checked) {
      newSet.add(this.getRowKey(row));
    } else {
      newSet.delete(this.getRowKey(row));
      if (this.selectionMode === 'all') {
        this.selectionMode = 'page';
        this.selectionModeChange.emit('page');
      }
    }
    this.selectedIds = newSet;
    this.selectionChanged.emit(newSet);
  }

  isRowSelected(row: any): boolean {
    return this.selectedIds.has(this.getRowKey(row));
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.pageChanged.emit({ page, pageSize: this.pageSize });
  }

  // ══════════════════════════════════════════════════
  //  Inline Editing & History
  // ══════════════════════════════════════════════════

  isEditing(row: any, field: string): boolean {
    if (!this.editingCell) return false;
    return this.editingCell.row === row && this.editingCell.field === field;
  }

  private lastClickOffset = -1;

  startEditing(row: any, field: string, event?: MouseEvent) {
    this.editingCell = { row, field };
    
    this.lastClickOffset = -1;
    if (event) {
      if ((document as any).caretRangeFromPoint) {
        const range = (document as any).caretRangeFromPoint(event.clientX, event.clientY);
        if (range) this.lastClickOffset = range.startOffset;
      } else if ((document as any).caretPositionFromPoint) {
        const pos = (document as any).caretPositionFromPoint(event.clientX, event.clientY);
        if (pos) this.lastClickOffset = pos.offset;
      }
    }
  }

  cancelEditing() {
    this.isCancelling = true;
    this.editingCell = null;
    setTimeout(() => this.isCancelling = false, 100);
  }

  handleKeyDown(event: KeyboardEvent, row: any, field: string, input: HTMLInputElement) {
    if (event.key === 'Escape') {
      this.cancelEditing();
      return;
    }
    
    let rowDelta = 0;
    let colDelta = 0;

    if (event.key === 'Enter') {
      rowDelta = event.shiftKey ? -1 : 1;
    } else if (event.key === 'ArrowDown') {
      rowDelta = 1;
      event.preventDefault();
    } else if (event.key === 'ArrowUp') {
      rowDelta = -1;
      event.preventDefault();
    } else if (event.key === 'Tab') {
      colDelta = event.shiftKey ? -1 : 1;
      event.preventDefault();
    }

    if (rowDelta !== 0 || colDelta !== 0) {
      this.moveToAfterCommit = { rowDelta, colDelta };
      input.blur();
    }
  }

  moveFocus(currentRow: any, currentField: string, rowDelta: number, colDelta: number) {
    let rowIdx = this.data.findIndex(r => r === currentRow);
    if (rowIdx === -1) return;

    const editableCols = this.columns.filter(c => c.editable && this.isColumnVisible(c.key));
    if (editableCols.length === 0) return;

    let colIdx = editableCols.findIndex(c => c.key === currentField);
    if (colIdx === -1) colIdx = 0;

    if (colDelta !== 0) {
      colIdx += colDelta;
      if (colIdx >= editableCols.length) {
        colIdx = 0;
        rowIdx += 1;
      } else if (colIdx < 0) {
        colIdx = editableCols.length - 1;
        rowIdx -= 1;
      }
    } else if (rowDelta !== 0) {
      rowIdx += rowDelta;
    }

    if (rowIdx < 0 || rowIdx >= this.data.length) return;

    const nextRow = this.data[rowIdx];
    const nextField = editableCols[colIdx].key;

    this.selectAllOnFocus = true;
    this.startEditing(nextRow, nextField);
  }

  onEditCommit(row: any, field: string, newVal: any) {
    if (this.isCancelling) return;
    
    if (this.editingCell && this.editingCell.row === row && this.editingCell.field === field) {
      this.editingCell = null;
    }
    
    this.onCellChange(row, field, newVal);

    if (this.moveToAfterCommit) {
      const move = this.moveToAfterCommit;
      this.moveToAfterCommit = null;
      this.moveFocus(row, field, move.rowDelta, move.colDelta);
    }
  }

  getTrackByKey(row: any): string {
    return row[this.trackByKey]?.toString() || JSON.stringify(row);
  }

  getCellValue(row: any, field: string) {
    return row[field];
  }

  onCellChange(row: any, field: string, newVal: any) {
    const oldVal = row[field];
    if (oldVal == newVal) return;
    
    if (this.historyIndex < this.editHistory.length - 1) {
      this.editHistory = this.editHistory.slice(0, this.historyIndex + 1);
    }
    
    this.editHistory.push({ row, field, oldVal, newVal });
    this.historyIndex++;
    
    this.applyEdit(row, field, newVal);
  }

  private applyEdit(row: any, field: string, value: any) {
    row[field] = value;
    this.pendingChanges.add(row);
  }

  undo() {
    if (this.historyIndex >= 0) {
      const edit = this.editHistory[this.historyIndex];
      this.applyEdit(edit.row, edit.field, edit.oldVal);
      this.historyIndex--;
      
      if (this.historyIndex === -1) {
        this.pendingChanges.clear();
        this.isConfirming = false;
      }
    }
  }

  redo() {
    if (this.historyIndex < this.editHistory.length - 1) {
      this.historyIndex++;
      const edit = this.editHistory[this.historyIndex];
      this.applyEdit(edit.row, edit.field, edit.newVal);
    }
  }

  showConfirm() {
    this.isConfirming = true;
  }

  cancelUpdate() {
    this.isConfirming = false;
  }

  revertAll() {
    while (this.historyIndex >= 0) {
      this.undo();
    }
    this.editHistory = [];
    this.historyIndex = -1;
    this.pendingChanges.clear();
    this.isConfirming = false;
    this.isRevertConfirming = false;
  }

  showRevertConfirm() {
    this.isRevertConfirming = true;
  }

  cancelRevert() {
    this.isRevertConfirming = false;
  }

  confirmRevertAll() {
    this.revertAll();
  }

  confirmUpdate() {
    const changedRows = Array.from(this.pendingChanges);
    this.bulkUpdate.emit(changedRows);
    this.isConfirming = false;
    this.pendingChanges.clear();
    this.editHistory = [];
    this.historyIndex = -1;
  }
}
