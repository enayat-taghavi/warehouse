const fs = require('fs');
let content = fs.readFileSync('wh-settings.html', 'utf-8');

const pattern = /(<div class="flex items-center justify-between p-4 bg-white rounded-2xl border transition-colors shadow-sm" \[ngClass\]="settings\.require_supervisor_approval\.is_override \? 'border-amber-400 bg-amber-50\/30' : 'border-slate-200 hover:border-indigo-200'">[\s\S]*?<\/button>\s*<\/div>\s*<\/div>)/;

const newBlock = 
            <div class="flex items-center justify-between p-4 bg-white rounded-2xl border transition-colors shadow-sm" [ngClass]="settings.require_doc_supervisor_approval?.is_override ? 'border-amber-400 bg-amber-50/30' : 'border-slate-200 hover:border-indigo-200'">
              <div class="pl-4">
                <h5 class="text-xs font-black text-slate-800">تایید سرپرست اسناد</h5>
                <p class="text-[9px] text-slate-500 mt-1.5 leading-relaxed font-medium">عدم تایید اسناد نیاز به بررسی مدیر دارد یا سرپرست اسناد بررسی کند؟</p>
              </div>
              <div class="flex items-center gap-3">
                  <label class="toggle-switch shrink-0">
                    <input type="checkbox" [checked]="settings.require_doc_supervisor_approval?.value" (change)="settings.require_doc_supervisor_approval.value = !settings.require_doc_supervisor_approval.value">
                    <span class="toggle-slider"></span>
                  </label>
                  <button *ngIf="settings.require_doc_supervisor_approval?.is_override" (click)="resetSetting('require_doc_supervisor_approval')" class="p-2 bg-rose-50 text-rose-500 rounded-lg hover:bg-rose-100 transition-colors" title="حذف تنظیم اختصاصی">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
              </div>
            </div>
;

content = content.replace(pattern, $1\n);
fs.writeFileSync('wh-settings.html', content, 'utf-8');
