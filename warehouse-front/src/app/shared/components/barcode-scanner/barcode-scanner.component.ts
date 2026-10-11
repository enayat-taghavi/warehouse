import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  ChangeDetectorRef,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../toast/toast.component';
import { SvgIconDirective } from '../../icons/svg-icon.directive';

export type ScannerCameraPreset = 'adaptive' | 'ultra' | 'high' | 'balanced' | 'lite' | 'custom';

export interface ScannerQualityConfig {
  preset: ScannerCameraPreset;
  resolution: '2k_1440p' | '1080p' | '720p' | '480p';
  roiSize: number; // پیکسل کادر کراپ
  intervalMs: number; // فرکانس حلقه اسکن
  tryHarder: boolean;
}

export const SCANNER_PRESET_CONFIGS: Record<Exclude<ScannerCameraPreset, 'custom'>, ScannerQualityConfig> = {
  adaptive: {
    preset: 'adaptive',
    resolution: '2k_1440p',
    roiSize: 850,
    intervalMs: 60,
    tryHarder: true,
  },
  ultra: {
    preset: 'ultra',
    resolution: '2k_1440p',
    roiSize: 850,
    intervalMs: 60,
    tryHarder: true,
  },
  high: {
    preset: 'high',
    resolution: '1080p',
    roiSize: 700,
    intervalMs: 80,
    tryHarder: true,
  },
  balanced: {
    preset: 'balanced',
    resolution: '720p',
    roiSize: 600,
    intervalMs: 100,
    tryHarder: false,
  },
  lite: {
    preset: 'lite',
    resolution: '480p',
    roiSize: 400,
    intervalMs: 150,
    tryHarder: false,
  },
};

/**
 * ورودی اسکنر بارکد پیشرفته (موتور کراپ هوشمند کادر هدف + سوییچ خودکار تطبیقی + مانیتورینگ زنده)
 */
@Component({
  selector: 'app-barcode-scanner',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective],
  template: `
    <div *ngIf="!headless" class="flex items-center gap-2">
      <!-- ورودی اسکن -->
      <div class="relative flex-1">
        <input
          #scanInput
          type="text"
          [(ngModel)]="value"
          (keydown.enter)="onEnter($event)"
          [placeholder]="placeholder"
          [disabled]="disabled"
          [attr.inputmode]="manualKeyboard ? 'text' : 'none'"
          dir="ltr"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          class="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-sm font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all shadow-sm disabled:bg-slate-50 disabled:cursor-not-allowed"
        />
        <!-- آیکون بارکد -->
        <svg class="absolute left-3 top-3 text-slate-400 pointer-events-none" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" appIcon="barcode"></svg>
      </div>

      <!-- دکمه کیبورد دستی (موبایل) -->
      <button
        type="button"
        (click)="toggleManualKeyboard()"
        [disabled]="disabled"
        class="p-2.5 rounded-xl transition-colors shadow-sm shrink-0 min-w-[40px] min-h-[40px] flex items-center justify-center tap-target"
        [ngClass]="manualKeyboard ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'"
        title="ورود دستی کد (باز شدن کیبورد)"
        aria-label="ورود دستی کد (باز شدن کیبورد)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" appIcon="keyboard-2"></svg>
      </button>

      <!-- دکمه دوربین -->
      <button
        type="button"
        (click)="openCamera()"
        [disabled]="disabled || cameraOpen"
        class="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors shadow-sm shrink-0 min-w-[40px] min-h-[40px] flex items-center justify-center tap-target"
        title="اسکن با دوربین"
        aria-label="اسکن با دوربین"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" appIcon="camera"></svg>
      </button>
    </div>

    <!-- Overlay دوربین پیشرفته -->
    <div
      *ngIf="cameraOpen"
      class="fixed inset-0 z-[100] bg-black flex flex-col select-none"
      style="height: 100dvh;"
      dir="rtl"
    >
      <!-- هدر کنترل‌های دوربین -->
      <div
        class="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 bg-gradient-to-b from-black/90 via-black/60 to-transparent"
        style="padding-top: calc(0.75rem + env(safe-area-inset-top));"
      >
        <div class="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <!-- دکمه چراغ‌قوه (Torch) -->
          <button
            *ngIf="torchAvailable"
            type="button"
            (click)="toggleTorch()"
            class="p-2 sm:p-2.5 rounded-full transition-all flex items-center justify-center shadow-md backdrop-blur-md min-w-[40px] min-h-[40px] tap-target"
            [ngClass]="torchActive ? 'bg-amber-400 text-slate-900 shadow-amber-400/30' : 'bg-white/20 text-white hover:bg-white/30'"
            title="روشن/خاموش کردن چراغ‌قوه"
            aria-label="روشن/خاموش کردن چراغ‌قوه"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" appIcon="zap"></svg>
          </button>

          <!-- دکمه‌های زوم سریع -->
          <div *ngIf="zoomAvailable && maxZoom >= 2" class="flex items-center bg-white/20 backdrop-blur-md rounded-full p-0.5 sm:p-1 border border-white/10">
            <button
              type="button"
              (click)="setZoom(1)"
              class="px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-bold rounded-full transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
              [ngClass]="currentZoom <= 1.2 ? 'bg-white text-slate-900 shadow-sm' : 'text-white/80 hover:text-white'"
              title="بزرگنمایی 1X"
              aria-label="بزرگنمایی 1X"
            >
              1X
            </button>
            <button
              type="button"
              (click)="setZoom(2)"
              class="px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-bold rounded-full transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
              [ngClass]="currentZoom > 1.2 ? 'bg-white text-slate-900 shadow-sm' : 'text-white/80 hover:text-white'"
              title="بزرگنمایی 2X"
              aria-label="بزرگنمایی 2X"
            >
              2X
            </button>
          </div>

          <!-- دکمه انتخاب کیفیت دوربین -->
          <div class="relative">
            <button
              type="button"
              (click)="toggleQualityMenu()"
              class="px-2.5 py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-all backdrop-blur-md border shadow-md flex items-center gap-1 min-h-[36px]"
              [ngClass]="hasLocalOverride ? 'bg-indigo-600/90 text-white border-indigo-400 shadow-indigo-500/30' : 'bg-white/20 text-white/95 border-white/20 hover:bg-white/30'"
              title="تنظیم کیفیت اسکنر"
              aria-label="تنظیم کیفیت اسکنر"
            >
              <span>{{ activePresetBadge }}</span>
              <svg class="w-3 h-3 transition-transform" [ngClass]="showQualityMenu ? 'rotate-180' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="chevron-down-path"></svg>
            </button>

            <!-- منوی کشویی انتخاب کیفیت دوربین -->
            <div
              *ngIf="showQualityMenu"
              class="absolute top-full right-0 mt-2 w-64 sm:w-72 bg-slate-900/95 border border-white/20 rounded-2xl p-2 shadow-2xl backdrop-blur-xl z-50 text-right animate-fadeIn"
            >
              <div class="px-2.5 py-1.5 border-b border-white/10 flex items-center justify-between">
                <span class="text-xs font-bold text-slate-200">کیفیت اسکنر دوربین</span>
                <span class="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  محافظ هوشمند فعال
                </span>
              </div>

              <div class="py-1 space-y-1">
                <!-- گزینه ۱: هوشمند خودکار -->
                <button
                  type="button"
                  (click)="selectPreset('adaptive')"
                  class="w-full px-2.5 py-2 rounded-xl text-right flex items-center justify-between transition-colors min-h-[40px]"
                  [ngClass]="activePreset === 'adaptive' ? 'bg-indigo-600 text-white' : 'hover:bg-white/10 text-slate-300'"
                >
                  <div class="flex flex-col">
                    <span class="text-xs font-bold flex items-center gap-1">
                      <span>هوشمند خودکار (Adaptive)</span>
                    </span>
                    <span class="text-[10px] opacity-80">شروع از 2K با تنظیم خودکار در صورت لگ</span>
                  </div>
                  <svg *ngIf="activePreset === 'adaptive'" class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" appIcon="check"></svg>
                </button>

                <!-- گزینه ۲: فوق‌العاده Ultra 2K -->
                <button
                  type="button"
                  (click)="selectPreset('ultra')"
                  class="w-full px-2.5 py-2 rounded-xl text-right flex items-center justify-between transition-colors min-h-[40px]"
                  [ngClass]="activePreset === 'ultra' ? 'bg-indigo-600 text-white' : 'hover:bg-white/10 text-slate-300'"
                >
                  <div class="flex flex-col">
                    <span class="text-xs font-bold flex items-center gap-1">
                      <span>فوق‌العاده / حداکثر دقت (Ultra 2K)</span>
                    </span>
                    <span class="text-[10px] opacity-80">1440p/2K + کدهای فوق‌العاده ریز و متراکم</span>
                  </div>
                  <svg *ngIf="activePreset === 'ultra'" class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" appIcon="check"></svg>
                </button>

                <!-- گزینه ۳: کیفیت بالا High 1080p -->
                <button
                  type="button"
                  (click)="selectPreset('high')"
                  class="w-full px-2.5 py-2 rounded-xl text-right flex items-center justify-between transition-colors min-h-[40px]"
                  [ngClass]="activePreset === 'high' ? 'bg-indigo-600 text-white' : 'hover:bg-white/10 text-slate-300'"
                >
                  <div class="flex flex-col">
                    <span class="text-xs font-bold">کیفیت بالا (High 1080p)</span>
                    <span class="text-[10px] opacity-80">رزولوشن 1080p برای گوشی‌های مدرن</span>
                  </div>
                  <svg *ngIf="activePreset === 'high'" class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" appIcon="check"></svg>
                </button>

                <!-- گزینه ۴: متعادل Balanced 720p -->
                <button
                  type="button"
                  (click)="selectPreset('balanced')"
                  class="w-full px-2.5 py-2 rounded-xl text-right flex items-center justify-between transition-colors min-h-[40px]"
                  [ngClass]="activePreset === 'balanced' ? 'bg-indigo-600 text-white' : 'hover:bg-white/10 text-slate-300'"
                >
                  <div class="flex flex-col">
                    <span class="text-xs font-bold">متعادل و روان (Balanced 720p)</span>
                    <span class="text-[10px] opacity-80">رزولوشن 720p سریع و سبک</span>
                  </div>
                  <svg *ngIf="activePreset === 'balanced'" class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" appIcon="check"></svg>
                </button>

                <!-- گزینه ۵: اقتصادی Lite 480p -->
                <button
                  type="button"
                  (click)="selectPreset('lite')"
                  class="w-full px-2.5 py-2 rounded-xl text-right flex items-center justify-between transition-colors min-h-[40px]"
                  [ngClass]="activePreset === 'lite' ? 'bg-indigo-600 text-white' : 'hover:bg-white/10 text-slate-300'"
                >
                  <div class="flex flex-col">
                    <span class="text-xs font-bold">سبک و اقتصادی (Lite 480p)</span>
                    <span class="text-[10px] opacity-80">مصرف حداقلی باتری برای گوشی‌های ضعیف</span>
                  </div>
                  <svg *ngIf="activePreset === 'lite'" class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" appIcon="check"></svg>
                </button>
              </div>

              <!-- بازگشت به پیش‌فرض دیتابیس -->
              <div *ngIf="hasLocalOverride" class="pt-2 mt-1 border-t border-white/10">
                <button
                  type="button"
                  (click)="resetToSystemDefault()"
                  class="w-full py-1.5 px-2 bg-white/10 hover:bg-white/20 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors min-h-[36px]"
                  title="بازگشت به پیش‌فرض انبار/سیستم"
                  aria-label="بازگشت به پیش‌فرض انبار/سیستم"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="rotate-ccw"></svg>
                  <span>بازگشت به پیش‌فرض انبار/سیستم</span>
                </button>
              </div>
            </div>
          </div>

          <!-- دکمه دیباگ HUD -->
          <button
            type="button"
            (click)="toggleDebugHud()"
            class="px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-mono font-bold transition-all backdrop-blur-md border shadow-md flex items-center gap-1 min-h-[36px]"
            [ngClass]="showDebugHud ? 'bg-emerald-500/90 text-white border-emerald-400 shadow-emerald-500/30' : 'bg-white/20 text-white/90 border-white/20 hover:bg-white/30'"
            title="نمایش/پنهان‌سازی HUD"
            aria-label="نمایش/پنهان‌سازی HUD"
          >
            <span class="w-1.5 h-1.5 rounded-full" [ngClass]="showDebugHud ? 'bg-white animate-ping' : 'bg-emerald-400'"></span>
            HUD
          </button>
        </div>

        <!-- دکمه ضربدر بستن بالا -->
        <button
          type="button"
          (click)="closeCamera()"
          class="p-2 sm:p-2.5 bg-white/20 text-white hover:bg-white/30 rounded-full transition-all backdrop-blur-md shadow-md shrink-0 mr-2 min-w-[40px] min-h-[40px] flex items-center justify-center tap-target"
          title="بستن"
          aria-label="بستن دوربین"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" appIcon="x"></svg>
        </button>
      </div>

      <!-- استریم ویدیو -->
      <video
        #video
        autoplay
        playsinline
        muted
        class="flex-1 w-full h-full object-cover min-h-0"
      ></video>

      <!-- کادر راهنمای هوشمند اسکنر با گوشه‌های هدف‌یاب -->
      <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div class="relative w-64 h-64 sm:w-72 sm:h-72 border-2 border-indigo-400/70 rounded-3xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] flex items-center justify-center">
          <!-- گوشه‌های برجسته هدف‌یاب -->
          <div class="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-2xl"></div>
          <div class="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-2xl"></div>
          <div class="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-2xl"></div>
          <div class="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-2xl"></div>

          <!-- خط نشانگر لیزری پویا -->
          <div class="w-full h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_8px_rgba(99,102,241,0.8)] animate-pulse"></div>
        </div>
      </div>

      <!-- بنر موقت سوییچ خودکار تطبیقی (Adaptive Feedback Toast) -->
      <div
        *ngIf="adaptiveNotification"
        class="absolute top-20 inset-x-4 z-40 bg-indigo-900/90 text-white border border-indigo-400/40 backdrop-blur-xl px-4 py-2.5 rounded-2xl shadow-2xl flex items-center justify-between text-xs font-semibold animate-fadeIn"
      >
        <div class="flex items-center gap-2">
          <span class="text-amber-300 text-base">⚡</span>
          <span>{{ adaptiveNotification }}</span>
        </div>
        <button
          type="button"
          (click)="adaptiveNotification = null"
          class="text-white/60 hover:text-white p-1 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg tap-target"
          title="بستن پیام"
          aria-label="بستن پیام"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="x"></svg>
        </button>
      </div>

      <!-- پنل مانیتورینگ و دیباگ زنده (HUD) -->
      <div
        *ngIf="showDebugHud"
        class="absolute top-16 inset-x-3 z-30 bg-slate-950/90 text-white rounded-2xl p-3 border border-emerald-500/40 backdrop-blur-xl shadow-2xl text-[11px] font-mono select-text"
        dir="ltr"
      >
        <div class="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
          <span class="font-bold text-emerald-400 flex items-center gap-1">
            <span>🔬 Precision Crop Scanner HUD</span>
          </span>
          <button
            type="button"
            (click)="copyDiagnosticReport()"
            class="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded-lg text-xs font-bold shadow transition-all active:scale-95 flex items-center gap-1 min-h-[36px]"
            title="کپی گزارش دیباگ"
            aria-label="کپی گزارش دیباگ"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="copy"></svg>
            <span>کپی گزارش</span>
          </button>
        </div>

        <div class="grid grid-cols-2 gap-x-2 gap-y-1">
          <div><span class="text-slate-400">Stream:</span> <span class="text-amber-300 font-bold">{{ debugInfo.videoRes }}</span></div>
          <div><span class="text-slate-400">Crop Area:</span> <span class="text-emerald-300 font-bold">{{ debugInfo.cropRes }}</span></div>
          <div><span class="text-slate-400">Preset:</span> <span class="text-indigo-300 font-bold">{{ activePreset }} ({{ currentEffectiveConfig.resolution }})</span></div>
          <div><span class="text-slate-400">FPS / Latency:</span> <span class="text-emerald-400 font-bold">{{ debugInfo.fps }} fps / {{ debugInfo.lastLatencyMs }}ms</span></div>
          <div><span class="text-slate-400">Native Pass:</span> <span class="text-sky-300">{{ debugInfo.nativeFrames }} frames</span></div>
          <div><span class="text-slate-400">ZXing Pass:</span> <span class="text-purple-300">{{ debugInfo.zxingFrames }} frames</span></div>
          <div><span class="text-slate-400">Adaptive:</span> <span class="text-amber-300">{{ debugInfo.adaptiveStatus }}</span></div>
          <div><span class="text-slate-400">Focus:</span> <span class="text-slate-300">{{ debugInfo.focusMode }}</span></div>
        </div>

        <div class="mt-2 pt-2 border-t border-white/10 text-[10px]">
          <div><span class="text-slate-400">Native Status:</span> <span class="text-sky-300 truncate inline-block max-w-[240px]">{{ debugInfo.lastNativeStatus }}</span></div>
          <div><span class="text-slate-400">ZXing Status:</span> <span class="text-purple-300 truncate inline-block max-w-[240px]">{{ debugInfo.lastZxingStatus }}</span></div>
        </div>
      </div>

      <!-- فوتر و راهنمای اسکن -->
      <div
        class="absolute bottom-0 inset-x-0 flex flex-col items-center gap-3 pb-6 px-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent"
        style="padding-bottom: calc(1.5rem + env(safe-area-inset-bottom));"
      >
        <p class="text-white/90 text-xs font-semibold bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-lg">
          کد دوبعدی (QR / DataMatrix) یا بارکد خطی را مقابل کادر بگیرید
        </p>
        <button
          type="button"
          (click)="closeCamera()"
          class="bg-white hover:bg-slate-100 text-slate-900 px-8 py-3 rounded-2xl text-sm font-bold shadow-xl transition-all active:scale-95 min-h-[44px]"
          title="بستن دوربین"
          aria-label="بستن دوربین"
        >
          بستن دوربین
        </button>
      </div>
    </div>
  `,
})
export class BarcodeScannerComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() placeholder = 'اسکن بارکد یا ورود کد کالا...';
  @Input() autofocus = false;
  @Input() disabled = false;
  /** حالت بدون اینپوت (فقط برای راه‌اندازی دوربین و هندل کردن اسکن‌ها) */
  @Input() headless = false;
  /** بازه نادیده‌گرفتن اسکن تکراری (میلی‌ثانیه) */
  @Input() duplicateWindowMs = 2000;

  /** تنظیمات سرور/انبار (در صورت ارائه) */
  @Input() serverPreset?: string;
  @Input() serverCustomResolution?: string;
  @Input() serverCustomIntervalMs?: number;
  @Input() serverCustomRoiSize?: number;
  @Input() serverCustomTryHarder?: boolean;

  /** کد نرمال‌شده اسکن/تایپ‌شده */
  @Output() scanned = new EventEmitter<string>();

  @ViewChild('scanInput') scanInput?: ElementRef<HTMLInputElement>;
  @ViewChild('video') videoRef?: ElementRef<HTMLVideoElement>;

  value = '';
  cameraOpen = false;
  manualKeyboard = false;
  showDebugHud = false;
  showQualityMenu = false;
  adaptiveNotification: string | null = null;
  private notifTimer: any = null;

  // وضعیت‌های سخت‌افزاری دوربین
  torchAvailable = false;
  torchActive = false;
  zoomAvailable = false;
  minZoom = 1;
  maxZoom = 1;
  currentZoom = 1;

  // کلیدهای حافظه محلی
  private static readonly STORAGE_KEY_PRESET = 'wh_scanner_camera_preset';

  // پروفایل فعال جاری و پیکربندی اجرایی
  activePreset: ScannerCameraPreset = 'adaptive';
  currentEffectiveConfig: ScannerQualityConfig = { ...SCANNER_PRESET_CONFIGS.adaptive };
  hasLocalOverride = false;

  // اطلاعات مانیتورینگ زنده (Debug Info)
  debugInfo = {
    videoRes: '0x0',
    cropRes: '0x0',
    readyState: 0,
    nativeSupported: false,
    nativeFormats: [] as string[],
    nativeFrames: 0,
    lastNativeStatus: 'Waiting...',
    zxingFrames: 0,
    lastZxingStatus: 'Initializing...',
    trackLabel: '',
    focusMode: 'N/A',
    zoomRange: '1x',
    fps: 0,
    lastLatencyMs: 0,
    adaptiveStatus: 'Always-On Guardian Active',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  };

  private lastCode = '';
  private lastAt = 0;

  // منابع دوربین و حلقه پردازش کادر هدف
  private mediaStream: MediaStream | null = null;
  private scanLoopTimer: any = null;
  private cropCanvas: HTMLCanvasElement | null = null;
  private cropCtx: CanvasRenderingContext2D | null = null;

  // دیکودرهای پیش‌بارگذاری‌شده
  private nativeDetector: any = null;
  private zxingQrReader: any = null;
  private zxingMultiReader: any = null;
  private frameCounter = 0;
  private fpsTimer: any = null;

  // ناظر تطبیقی افت فریم و تاخیر (Always-On Adaptive Performance Observer)
  private consecutiveSlowFrames = 0;
  private consecutiveLowFpsSeconds = 0;
  private adaptiveDowngradeStep = 0; // ۰: بدون سوییچ، ۱: فاز اول، ۲: فاز دوم
  private streamStartTime = 0; // زمان شروع استریم جهت محاسبه مهلت اولیه (Grace Period)

  constructor(private toast: ToastService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.initPresetFromStorageOrServer();
  }

  ngAfterViewInit(): void {
    if (this.autofocus) this.focusInput();
  }

  ngOnDestroy(): void {
    this.closeCamera();
    if (this.notifTimer) clearTimeout(this.notifTimer);
  }

  /** تبدیل ارقام فارسی/عربی به لاتین + حذف کاراکترهای اضافه */
  static normalize(raw: string): string {
    let s = (raw || '').replace(/[\r\n\t]/g, ' ');
    s = s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
    s = s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    return s.replace(/\s+/g, ' ').trim();
  }

  get activePresetBadge(): string {
    switch (this.activePreset) {
      case 'adaptive':
        return '⚡ هوشمند';
      case 'ultra':
        return '🎯 فوق‌العاده';
      case 'high':
        return '💎 بالا';
      case 'balanced':
        return '⚖️ متعادل';
      case 'lite':
        return '🔋 اقتصادی';
      default:
        return '⚙️ سفارشی';
    }
  }

  private initPresetFromStorageOrServer(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(BarcodeScannerComponent.STORAGE_KEY_PRESET) as ScannerCameraPreset;
        if (stored && ['adaptive', 'ultra', 'high', 'balanced', 'lite'].includes(stored)) {
          this.activePreset = stored;
          this.hasLocalOverride = true;
          this.currentEffectiveConfig = { ...SCANNER_PRESET_CONFIGS[stored as Exclude<ScannerCameraPreset, 'custom'>] };
          return;
        }
      }
    } catch {}

    const serverVal = (this.serverPreset as ScannerCameraPreset) || 'adaptive';
    this.activePreset = ['adaptive', 'ultra', 'high', 'balanced', 'lite'].includes(serverVal) ? serverVal : 'adaptive';
    this.hasLocalOverride = false;
    this.currentEffectiveConfig = { ...SCANNER_PRESET_CONFIGS[this.activePreset as Exclude<ScannerCameraPreset, 'custom'>] };
  }

  toggleQualityMenu(): void {
    this.showQualityMenu = !this.showQualityMenu;
    this.cdr.detectChanges();
  }

  selectPreset(preset: Exclude<ScannerCameraPreset, 'custom'>): void {
    this.activePreset = preset;
    this.hasLocalOverride = true;
    try {
      localStorage.setItem(BarcodeScannerComponent.STORAGE_KEY_PRESET, preset);
    } catch {}

    this.currentEffectiveConfig = { ...SCANNER_PRESET_CONFIGS[preset] };
    this.adaptiveDowngradeStep = 0;
    this.consecutiveSlowFrames = 0;
    this.consecutiveLowFpsSeconds = 0;
    this.showQualityMenu = false;
    this.showAdaptiveToast(`کیفیت اسکنر به حالت «${this.activePresetBadge}» تنظیم شد.`);

    if (this.cameraOpen) {
      // اعمال آنی روی کانواس و فرکانس اسکن
      this.reconfigureActiveSession();
    }
    this.cdr.detectChanges();
  }

  resetToSystemDefault(): void {
    try {
      localStorage.removeItem(BarcodeScannerComponent.STORAGE_KEY_PRESET);
    } catch {}
    this.hasLocalOverride = false;
    this.initPresetFromStorageOrServer();
    this.showQualityMenu = false;
    this.showAdaptiveToast(`تنظیمات کیفیت به پیش‌فرض سیستم/انبار (${this.activePresetBadge}) بازگشت.`);
    if (this.cameraOpen) {
      this.reconfigureActiveSession();
    }
    this.cdr.detectChanges();
  }

  private showAdaptiveToast(msg: string): void {
    this.adaptiveNotification = msg;
    if (this.notifTimer) clearTimeout(this.notifTimer);
    this.notifTimer = setTimeout(() => {
      this.adaptiveNotification = null;
      this.cdr.detectChanges();
    }, 3500);
  }

  focusInput(): void {
    setTimeout(() => this.scanInput?.nativeElement?.focus(), 0);
  }

  toggleManualKeyboard(): void {
    this.manualKeyboard = !this.manualKeyboard;
    this.focusInput();
  }

  toggleDebugHud(): void {
    this.showDebugHud = !this.showDebugHud;
    this.cdr.detectChanges();
  }

  onEnter(event: Event): void {
    event.preventDefault();
    this.handleCode(this.value);
    this.value = '';
    this.focusInput();
  }

  private handleCode(raw: string): void {
    const code = BarcodeScannerComponent.normalize(raw);
    if (!code) return;

    const now = Date.now();
    if (code === this.lastCode && now - this.lastAt < this.duplicateWindowMs) return;
    this.lastCode = code;
    this.lastAt = now;

    this.scanned.emit(code);
  }

  // ════════════════════════════════════════════
  //  موتور پردازش پیوسته کادر هدف (Precision Viewfinder Engine)
  // ════════════════════════════════════════════

  private static getMediaConstraints(resolution: string): MediaStreamConstraints {
    switch (resolution) {
      case '2k_1440p':
        return {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920, max: 2560 },
            height: { ideal: 1080, max: 1440 },
          },
          audio: false,
        };
      case '1080p':
        return {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        };
      case '720p':
        return {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        };
      case '480p':
      default:
        return {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        };
    }
  }

  async openCamera(): Promise<void> {
    if (this.cameraOpen) return;
    this.cameraOpen = true;
    this.torchActive = false;
    this.currentZoom = 1;
    this.debugInfo.nativeFrames = 0;
    this.debugInfo.zxingFrames = 0;
    this.debugInfo.fps = 0;
    this.debugInfo.lastNativeStatus = 'Starting...';
    this.debugInfo.lastZxingStatus = 'Starting...';
    this.debugInfo.adaptiveStatus = 'Always-On Guardian Active';
    this.consecutiveSlowFrames = 0;
    this.consecutiveLowFpsSeconds = 0;
    this.adaptiveDowngradeStep = 0;
    this.showQualityMenu = false;
    this.cdr.detectChanges();

    await Promise.resolve();

    const video = this.videoRef?.nativeElement;
    if (!video) {
      this.closeCamera();
      return;
    }

    try {
      // ۱. راه‌اندازی استریم ویدیو بر اساس رزولوشن پروفایل فعال
      const constraints = BarcodeScannerComponent.getMediaConstraints(this.currentEffectiveConfig.resolution);
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (constraintErr) {
        console.warn('[BarcodeScanner] قیدهای رزولوشن رد شد، فال‌بک به تنظیمات استاندارد:', constraintErr);
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      }

      await this.initCameraCapabilities(this.mediaStream);

      video.srcObject = this.mediaStream;
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      await video.play();

      this.streamStartTime = performance.now();

      // ۲. مقداردهی اولیه دیکودرها و کانواس کراپ متناسب با پروفایل
      await this.initDecoders();

      // ۳. راه‌اندازی حلقه اسکن و ناظر عملکرد تطبیقی
      this.startPrecisionScanLoop(video);
    } catch (err: any) {
      this.closeCamera();
      if (err?.name === 'NotAllowedError') {
        this.toast.error('دسترسی به دوربین رد شد. از تنظیمات مرورگر مجوز دوربین را فعال کنید');
      } else if (err?.name === 'NotFoundError') {
        this.toast.error('دوربینی روی این دستگاه یافت نشد');
      } else {
        console.error('[BarcodeScanner] خطای راه‌اندازی دوربین:', err);
        this.toast.error('خطا در راه‌اندازی دوربین');
      }
    }
  }

  closeCamera(): void {
    if (this.scanLoopTimer) {
      clearInterval(this.scanLoopTimer);
      this.scanLoopTimer = null;
    }
    if (this.fpsTimer) {
      clearInterval(this.fpsTimer);
      this.fpsTimer = null;
    }

    this.cropCanvas = null;
    this.cropCtx = null;
    this.nativeDetector = null;
    this.zxingQrReader = null;
    this.zxingMultiReader = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      this.mediaStream = null;
    }

    const video = this.videoRef?.nativeElement;
    if (video?.srcObject) {
      try {
        (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      } catch {}
      video.srcObject = null;
    }

    this.cameraOpen = false;
    this.torchAvailable = false;
    this.torchActive = false;
    this.zoomAvailable = false;
    this.showQualityMenu = false;
    this.cdr.detectChanges();
  }

  private async initDecoders(): Promise<void> {
    // الف) آماده‌سازی BarcodeDetector بومی
    try {
      if ('BarcodeDetector' in window) {
        const supported: string[] = await (window as any).BarcodeDetector.getSupportedFormats();
        this.debugInfo.nativeSupported = true;
        this.debugInfo.nativeFormats = supported;
        const formats = ['qr_code', 'data_matrix', 'aztec', 'pdf417', 'code_128', 'ean_13'].filter((f) =>
          supported.includes(f)
        );
        if (formats.length > 0) {
          this.nativeDetector = new (window as any).BarcodeDetector({ formats });
        }
      }
    } catch {
      this.debugInfo.nativeSupported = false;
    }

    // ب) آماده‌سازی موتورهای تخصصی ZXing متناسب با پروفایل
    try {
      const [{ BrowserQRCodeReader, BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] =
        await Promise.all([import('@zxing/browser'), import('@zxing/library')]);

      const qrHints = new Map<any, any>();
      if (this.currentEffectiveConfig.tryHarder) {
        qrHints.set(DecodeHintType.TRY_HARDER, true);
      }
      this.zxingQrReader = new BrowserQRCodeReader(qrHints);

      const multiHints = new Map<any, any>();
      if (this.currentEffectiveConfig.tryHarder) {
        multiHints.set(DecodeHintType.TRY_HARDER, true);
      }
      multiHints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.QR_CODE,
        BarcodeFormat.DATA_MATRIX,
        BarcodeFormat.AZTEC,
        BarcodeFormat.PDF_417,
        BarcodeFormat.CODE_128,
        BarcodeFormat.EAN_13,
      ]);
      this.zxingMultiReader = new BrowserMultiFormatReader(multiHints);
      this.debugInfo.lastZxingStatus = `Engine Ready (${this.currentEffectiveConfig.tryHarder ? 'TRY_HARDER Active' : 'Fast Mode'})`;
    } catch (e: any) {
      this.debugInfo.lastZxingStatus = `ZXing Load Error: ${e?.message || e}`;
    }

    // ج) ساخت بستر کانواس کراپ کادر هدف متناسب با ابعاد ROI پروفایل
    const roi = this.currentEffectiveConfig.roiSize || 850;
    this.cropCanvas = document.createElement('canvas');
    this.cropCanvas.width = roi;
    this.cropCanvas.height = roi;
    this.cropCtx = this.cropCanvas.getContext('2d', { willReadFrequently: true });
    this.debugInfo.cropRes = `${roi}x${roi} (ROI)`;
  }

  /** بازتنظیم پویای نشست اسکن فعال در صورت تغییر پروفایل یا سوییچ هوشمند */
  private reconfigureActiveSession(): void {
    const roi = this.currentEffectiveConfig.roiSize || 850;
    if (this.cropCanvas) {
      this.cropCanvas.width = roi;
      this.cropCanvas.height = roi;
      this.cropCtx = this.cropCanvas.getContext('2d', { willReadFrequently: true });
    }
    this.debugInfo.cropRes = `${roi}x${roi} (ROI)`;

    const video = this.videoRef?.nativeElement;
    if (video && this.scanLoopTimer) {
      clearInterval(this.scanLoopTimer);
      this.startPrecisionScanLoop(video);
    }
  }

  /**
   * موتور سوییچ هوشمند همواره‌فعال (Always-On Adaptive Auto-Degrade)
   * در صورت تشخیص لگ، فریز یا افت فریم شدید در هر گوشی، به کیفیت سبک‌تر شیفت می‌دهد
   */
  private triggerAdaptiveFallback(reason: string): void {
    if (this.currentEffectiveConfig.preset === 'lite') {
      // پایین‌ترین حالت ممکن رسیده است
      return;
    }

    this.adaptiveDowngradeStep++;
    let targetPreset: Exclude<ScannerCameraPreset, 'custom'> = 'balanced';

    if (this.activePreset === 'ultra' || this.activePreset === 'adaptive') {
      targetPreset = this.adaptiveDowngradeStep === 1 ? 'high' : 'balanced';
    } else if (this.activePreset === 'high') {
      targetPreset = 'balanced';
    } else if (this.activePreset === 'balanced') {
      targetPreset = 'lite';
    }

    console.warn(`[BarcodeScanner Adaptive Guardian] فعال‌سازی سوییچ هوشمند به دلیل: ${reason} -> شیفت به ${targetPreset}`);

    this.currentEffectiveConfig = { ...SCANNER_PRESET_CONFIGS[targetPreset] };
    this.debugInfo.adaptiveStatus = `Active Fallback -> ${targetPreset} (${reason})`;
    this.reconfigureActiveSession();

    this.showAdaptiveToast('⚡ بهینه‌سازی خودکار: کیفیت اسکنر جهت عملکرد روان‌تر بهینه شد.');

    // در صورتی که کاربر در حالت هوشمند بود، پروفایل پایدار در حافظه گوشی ذخیره شود
    if (this.activePreset === 'adaptive') {
      try {
        localStorage.setItem(BarcodeScannerComponent.STORAGE_KEY_PRESET, targetPreset);
        this.activePreset = targetPreset;
        this.hasLocalOverride = true;
      } catch {}
    }

    this.consecutiveSlowFrames = 0;
    this.consecutiveLowFpsSeconds = 0;
    this.cdr.detectChanges();
  }

  /** اجرای حلقه اسکن بلادرنگ با ناظر هوشمند عملکرد */
  private startPrecisionScanLoop(video: HTMLVideoElement): void {
    let busy = false;
    this.frameCounter = 0;
    const intervalMs = this.currentEffectiveConfig.intervalMs || 60;

    // تایمر محاسبه FPS و ناظر سلامت استریم
    if (this.fpsTimer) clearInterval(this.fpsTimer);
    this.fpsTimer = setInterval(() => {
      this.debugInfo.fps = this.frameCounter;
      const elapsedSinceStart = performance.now() - this.streamStartTime;
      const isWarmingUp = elapsedSinceStart < 4000; // ۴ ثانیه مهلت اولیه گرم‌شدن سنسور و کامپایل JIT

      if (this.cameraOpen && video) {
        this.debugInfo.videoRes = `${video.videoWidth || 0}x${video.videoHeight || 0}`;

        if (!isWarmingUp) {
          // ناظر FPS: اگر فریم‌ریت بیش از ۴ ثانیه متوالی زیر ۴ فریم در ثانیه بود
          if (this.frameCounter < 4 && video.readyState >= 2) {
            this.consecutiveLowFpsSeconds++;
            if (this.consecutiveLowFpsSeconds >= 4) {
              this.triggerAdaptiveFallback(`افت مداوم فریم‌ریت (${this.frameCounter} FPS)`);
            }
          } else {
            this.consecutiveLowFpsSeconds = 0;
          }
        } else {
          this.consecutiveLowFpsSeconds = 0;
        }
      }
      this.frameCounter = 0;
      this.cdr.detectChanges();
    }, 1000);

    // حلقه اسکن
    this.scanLoopTimer = setInterval(async () => {
      if (busy || !this.cameraOpen || video.readyState < 2 || !this.cropCanvas || !this.cropCtx) return;
      busy = true;
      const startTime = performance.now();
      this.frameCounter++;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw === 0 || vh === 0) {
        busy = false;
        return;
      }

      // محاسبه کادر هدف (۷۵٪ بعد کوچکتر)
      const cropSize = Math.round(Math.min(vw, vh) * 0.75);
      const sx = Math.round((vw - cropSize) / 2);
      const sy = Math.round((vh - cropSize) / 2);
      const targetRoi = this.cropCanvas.width;

      // رسم کادر هدف روی کانواس بهینه‌شده
      this.cropCtx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, targetRoi, targetRoi);

      // ۱. پاس اول: موتور بومی BarcodeDetector روی کانواس کراپ‌شده
      if (this.nativeDetector) {
        this.debugInfo.nativeFrames++;
        try {
          const codes = await this.nativeDetector.detect(this.cropCanvas);
          if (codes.length > 0 && codes[0].rawValue && this.cameraOpen) {
            this.debugInfo.lastNativeStatus = `SUCCESS: ${codes[0].rawValue}`;
            this.onCameraDecoded(codes[0].rawValue);
            busy = false;
            return;
          } else {
            this.debugInfo.lastNativeStatus = 'Active Search';
          }
        } catch (e: any) {
          this.debugInfo.lastNativeStatus = `Native Err: ${e?.message || e}`;
        }
      }

      // ۲. پاس دوم: موتور تخصصی QR کد ZXing با الگوریتم HybridBinarizer
      if (this.zxingQrReader && this.cameraOpen) {
        this.debugInfo.zxingFrames++;
        try {
          const result = await this.zxingQrReader.decodeFromCanvas(this.cropCanvas);
          if (result && result.getText() && this.cameraOpen) {
            this.debugInfo.lastZxingStatus = `SUCCESS: ${result.getText()}`;
            this.onCameraDecoded(result.getText());
            busy = false;
            return;
          }
        } catch (e: any) {
          this.debugInfo.lastZxingStatus = 'Searching (Refining Grid)';
        }
      }

      // ۳. پاس سوم (نوبتی): بررسی کدهای DataMatrix و بارکدهای خطی
      if (this.zxingMultiReader && this.frameCounter % 3 === 0 && this.cameraOpen) {
        try {
          const multiResult = await this.zxingMultiReader.decodeFromCanvas(this.cropCanvas);
          if (multiResult && multiResult.getText() && this.cameraOpen) {
            this.debugInfo.lastZxingStatus = `SUCCESS: ${multiResult.getText()}`;
            this.onCameraDecoded(multiResult.getText());
            busy = false;
            return;
          }
        } catch {}
      }

      // ناظر زمان پردازش فریم (Frame Processing Latency Observer)
      const frameDuration = performance.now() - startTime;
      this.debugInfo.lastLatencyMs = Math.round(frameDuration);
      const elapsedSinceStart = performance.now() - this.streamStartTime;
      const isWarmingUp = elapsedSinceStart < 4000;

      if (!isWarmingUp) {
        if (frameDuration > 170) {
          this.consecutiveSlowFrames++;
          if (this.consecutiveSlowFrames >= 18) {
            this.triggerAdaptiveFallback(`تاخیر مداوم پردازش (${Math.round(frameDuration)}ms)`);
          }
        } else {
          if (this.consecutiveSlowFrames > 0) this.consecutiveSlowFrames--;
        }
      } else {
        this.consecutiveSlowFrames = 0;
      }

      busy = false;
    }, intervalMs);
  }

  private onCameraDecoded(text: string): void {
    if (!this.cameraOpen) return;
    this.triggerScanFeedback();
    this.closeCamera();
    this.handleCode(text);
  }

  /** بازخورد هپتیک (لرزش ملایم) و بیپ صوتی آرام هنگام اسکن موفق */
  private triggerScanFeedback(): void {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([40]);
      }
    } catch {}

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1760, ctx.currentTime);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      }
    } catch {}
  }

  /** استخراج توانمندی‌های سخت‌افزاری دوربین (چراغ‌قوه، زوم و فوکوس پیوسته) */
  private async initCameraCapabilities(stream: MediaStream): Promise<void> {
    try {
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      this.debugInfo.trackLabel = track.label || 'Video Track';
      const caps: any = track.getCapabilities?.() || {};

      // ۱. فوکوس پیوسته و تراز نور
      const advancedConstraints: any = {};
      if (caps?.focusMode?.includes?.('continuous')) {
        advancedConstraints.focusMode = 'continuous';
        this.debugInfo.focusMode = 'continuous';
      } else {
        this.debugInfo.focusMode = caps?.focusMode?.[0] || 'auto';
      }
      if (caps?.exposureMode?.includes?.('continuous')) {
        advancedConstraints.exposureMode = 'continuous';
      }
      if (caps?.whiteBalanceMode?.includes?.('continuous')) {
        advancedConstraints.whiteBalanceMode = 'continuous';
      }
      if (Object.keys(advancedConstraints).length > 0) {
        try {
          await track.applyConstraints({ advanced: [advancedConstraints] });
        } catch {}
      }

      // ۲. شناسایی چراغ‌قوه (Torch)
      this.torchAvailable = Boolean(caps.torch);

      // ۳. شناسایی زوم سخت‌افزاری
      if (caps.zoom) {
        this.zoomAvailable = true;
        this.minZoom = caps.zoom.min || 1;
        this.maxZoom = caps.zoom.max || 1;
        this.currentZoom = track.getSettings?.()?.zoom || 1;
        this.debugInfo.zoomRange = `${this.minZoom}x - ${this.maxZoom}x`;
      }
      this.cdr.detectChanges();
    } catch {}
  }

  async toggleTorch(): Promise<void> {
    if (!this.torchAvailable) return;
    const track = this.mediaStream?.getVideoTracks()[0];
    if (!track) return;
    try {
      this.torchActive = !this.torchActive;
      await track.applyConstraints({ advanced: [{ torch: this.torchActive } as any] });
      this.cdr.detectChanges();
    } catch {
      this.torchActive = false;
      this.cdr.detectChanges();
    }
  }

  async setZoom(level: number): Promise<void> {
    if (!this.zoomAvailable) return;
    const track = this.mediaStream?.getVideoTracks()[0];
    if (!track) return;
    try {
      const targetZoom = Math.min(Math.max(level, this.minZoom), this.maxZoom);
      this.currentZoom = targetZoom;
      await track.applyConstraints({ advanced: [{ zoom: targetZoom } as any] });
      this.cdr.detectChanges();
    } catch {}
  }

  /** کپی گزارش جامع دیاگنوستیک در کلیپ‌بورد جهت ارسال در چت */
  copyDiagnosticReport(): void {
    const report = `
=== BARCODE SCANNER DIAGNOSTIC REPORT ===
Timestamp: ${new Date().toISOString()}
Active Preset: ${this.activePreset} (Effective: ${this.currentEffectiveConfig.resolution}, ROI: ${this.currentEffectiveConfig.roiSize}px, Interval: ${this.currentEffectiveConfig.intervalMs}ms)
Has Device Override: ${this.hasLocalOverride}
Adaptive Status: ${this.debugInfo.adaptiveStatus}
Video Resolution: ${this.debugInfo.videoRes}
Crop Area: ${this.debugInfo.cropRes}
FPS / Latency: ${this.debugInfo.fps} FPS / ${this.debugInfo.lastLatencyMs}ms
Track Label: ${this.debugInfo.trackLabel}
Focus Mode: ${this.debugInfo.focusMode}
Zoom: ${this.debugInfo.zoomRange} (Current: ${this.currentZoom}x)
Torch Available: ${this.torchAvailable}

Native BarcodeDetector:
- Supported: ${this.debugInfo.nativeSupported}
- Frames Processed: ${this.debugInfo.nativeFrames}
- Last Status: ${this.debugInfo.lastNativeStatus}

ZXing Engine:
- Frames Processed: ${this.debugInfo.zxingFrames}
- Last Status: ${this.debugInfo.lastZxingStatus}

User Agent: ${this.debugInfo.userAgent}
=========================================
`.trim();

    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(report).then(() => {
          this.toast.success('گزارش دیباگ کپی شد!');
        });
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = report;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        this.toast.success('گزارش دیباگ کپی شد!');
      }
    } catch {
      this.toast.error('خطا در کپی گزارش');
    }
  }
}
