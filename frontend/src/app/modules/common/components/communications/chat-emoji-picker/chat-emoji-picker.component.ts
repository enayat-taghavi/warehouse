import { Component, signal, computed, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';

export interface EmojiCategory {
  id: string;
  name: string;
  icon: string;
  emojis: { char: string; keywords: string }[];
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    name: 'شکلک‌ها',
    icon: '😀',
    emojis: [
      { char: '😀', keywords: 'لبخند شاد خنده' },
      { char: '😃', keywords: 'خوشحال خندان' },
      { char: '😄', keywords: 'خنده شاد چشمان شاد' },
      { char: '😁', keywords: 'نیشخند دندان شاد' },
      { char: '😆', keywords: 'خنده چشم بسته' },
      { char: '😅', keywords: 'عرق شرم خنده کمرو' },
      { char: '😂', keywords: 'اشک شوق گریه خنده قهقهه' },
      { char: '🤣', keywords: 'خنده غش روده بر' },
      { char: '🥲', keywords: 'لبخند با اشک لبخند غمگین' },
      { char: '🥹', keywords: 'چشمان پر اشک ملتمس ذوق' },
      { char: '😊', keywords: 'لبخند آرام سرخ گونه شاد' },
      { char: '😇', keywords: 'فرشته پاک بی گناه' },
      { char: '🙂', keywords: 'لبخند ساده ملایم' },
      { char: '🙃', keywords: 'وارونه شوخی طنز' },
      { char: '😉', keywords: 'چشمک شوخی راز' },
      { char: '😌', keywords: 'آرامش آسوده خاطر' },
      { char: '😍', keywords: 'عاشق چشم قلبی عشق' },
      { char: '🥰', keywords: 'عشق محبت لبخند قلبی' },
      { char: '😘', keywords: 'بوسه قلب عشق بوس' },
      { char: '😋', keywords: 'خوشمزه لیس زبان غذا' },
      { char: '😛', keywords: 'زبان درازی شوخی' },
      { char: '😜', keywords: 'چشمک زبان شیطنت' },
      { char: '🤪', keywords: 'دیوانه خفن خل چل' },
      { char: '😎', keywords: 'عینک دودی باحال خفن مغرور' },
      { char: '🤓', keywords: 'عینکی دانشمند درس خوان' },
      { char: '🧐', keywords: 'ذره بین کنجکاو بررسی' },
      { char: '🥳', keywords: 'جشن تولد پارتی شادی کلاه بوقی' },
      { char: '🤩', keywords: 'ستاره چشم هیجان ذوق زده' },
      { char: '🤔', keywords: 'فکر اندیشه تامل تفکر' },
      { char: '🫡', keywords: 'احترام نظامی درود چشم' },
      { char: '🤫', keywords: 'هیس ساکت سکوت راز' },
      { char: '🤐', keywords: 'زیپ دهان سکوت بسته' },
      { char: '🤨', keywords: 'شک تردید ابرو بالا' },
      { char: '😐', keywords: 'خنثی بی تفاوت پوکربازی' },
      { char: '😑', keywords: 'بی احساس چشم بسته خسته' },
      { char: '😶', keywords: 'بی دهان سکوت ناپیدا' },
      { char: '😏', keywords: 'پوزخند موذی کنایه' },
      { char: '😒', keywords: 'ناراضی بی حوصله چشم غره' },
      { char: '🙄', keywords: 'چشم چرخاندن کلافه' },
      { char: '😬', keywords: 'دندان قروچه ضایع ترس' },
      { char: '😮‍💨', keywords: 'آه نفس راحت خستگی' },
      { char: '😴', keywords: 'خواب خوابالو بیهوش' },
      { char: '😷', keywords: 'ماسک بیمار کرونا پزشکی' },
      { char: '🤒', keywords: 'تب دماسنج مریض بیماری' },
      { char: '🤯', keywords: 'انفجار مغز شوکه شگفت زده' },
      { char: '🤠', keywords: 'کابوی کلاه چرمی' },
      { char: '🥺', keywords: 'خواهش التماس ناز مظلوم' },
      { char: '😮', keywords: 'دهان باز تعجب شگفت' },
      { char: '😯', keywords: 'شگفت زده متعجب' },
      { char: '😲', keywords: 'شگفت حیرت شوک' },
      { char: '😳', keywords: 'شرمنده خجالت سرخ شوکه' },
      { char: '😱', keywords: 'جیغ وحشت ترس مونک' },
      { char: '😨', keywords: 'ترس هراس وحشت' },
      { char: '😰', keywords: 'نگران مضطرب عرق سرد' },
      { char: '😥', keywords: 'غمگین ناراحت عرق' },
      { char: '😢', keywords: 'اشک غم گریه قطره' },
      { char: '😭', keywords: 'گریه زاری هق هق اشک سیل' },
      { char: '😤', keywords: 'پیروزی خشم غرور باد بینی' },
      { char: '😡', keywords: 'عصبانی خشمگین قرمز داد' },
      { char: '😠', keywords: 'عصبانی دلخور اخم' },
      { char: '🤬', keywords: 'فحش سانسور عصبانی شدید' },
      { char: '💀', keywords: 'جمجمه اسکلت مرگ خنده دار' },
      { char: '💩', keywords: 'پو خنده دار شکلات' },
      { char: '🤡', keywords: 'دلقک مسخره سیرک' },
      { char: '👻', keywords: 'روح شبح ترسناک' },
      { char: '🤖', keywords: 'ربات رباتی مکانیکی هوش مصنوعی' }
    ]
  },
  {
    id: 'gestures',
    name: 'دست‌ها',
    icon: '👍',
    emojis: [
      { char: '👍', keywords: 'لایک عالی تایید موافق خوب آفرین' },
      { char: '👎', keywords: 'دیسلایک بد مخالف رد منفی' },
      { char: '👌', keywords: 'اوکی بیست عالی درسته' },
      { char: '✌️', keywords: 'پیروزی صلح دو انگشت' },
      { char: '🤞', keywords: 'امید شانس آرزو انگشت ضربدر' },
      { char: '🫰', keywords: 'قلب کره ای محبت انگشت' },
      { char: '🤟', keywords: 'دوستت دارم راک علامت' },
      { char: '🤘', keywords: 'شاخ راک خفن' },
      { char: '🤙', keywords: 'تماس بگیر زنگ الو شاکا' },
      { char: '👈', keywords: 'اشاره چپ آنجا' },
      { char: '👉', keywords: 'اشاره راست اینجا' },
      { char: '👆', keywords: 'اشاره بالا نگاه کن' },
      { char: '👇', keywords: 'اشاره پایین اینجا' },
      { char: '☝️', keywords: 'اشاره یک توجه سوال' },
      { char: '✋', keywords: 'توقف ایست پنج دست باز' },
      { char: '🤚', keywords: 'پشت دست بالا سلام' },
      { char: '🖐', keywords: 'پنج دست باز سلام' },
      { char: '🖖', keywords: 'ولکان سلام پیشتازان فضا' },
      { char: '👋', keywords: 'خداحافظ درود سلام دست تکان دادن' },
      { char: '👏', keywords: 'دست تشویق آفرین براوو کف زدن' },
      { char: '🙌', keywords: 'هورا جشن هر دو دست بالا تکبیر' },
      { char: '🫶', keywords: 'قلب با دو دست عشق محبت' },
      { char: '👐', keywords: 'دو دست باز آغوش' },
      { char: '🤲', keywords: 'دعا قنوت مناجات خواهش' },
      { char: '🤝', keywords: 'دست دادن قرارداد توافق همکاری' },
      { char: '🙏', keywords: 'التماس تشکر سپاس خواهش دعا نماز ممنون' },
      { char: '✍️', keywords: 'نوشتن دست به قلم امضا' },
      { char: '💪', keywords: 'زور بازو قدرت قوی توانایی انگیزه' },
      { char: '👊', keywords: 'مشت محکم بزن ضربه' },
      { char: '✊', keywords: 'مشت گره کرده اتحاد همبستگی' }
    ]
  },
  {
    id: 'hearts',
    name: 'قلب و نماد',
    icon: '❤️',
    emojis: [
      { char: '❤️', keywords: 'قلب قرمز عشق دوست محبت دوست داشتن' },
      { char: '🧡', keywords: 'قلب نارنجی محبت پاییز' },
      { char: '💛', keywords: 'قلب زرد دوستی مهربانی آفتاب' },
      { char: '💚', keywords: 'قلب سبز طبیعت سلامتی امید' },
      { char: '💙', keywords: 'قلب آبی آرامش اعتماد آسمان' },
      { char: '💜', keywords: 'قلب بنفش سلطنتی وفاداری شکوه' },
      { char: '🖤', keywords: 'قلب مشکی تاریک سوگ غم' },
      { char: '🤍', keywords: 'قلب سفید پاکی صداقت نور' },
      { char: '🤎', keywords: 'قلب قهوه ای خاک صمیمیت' },
      { char: '💔', keywords: 'قلب شکسته جدایی دلشکسته ناراحتی' },
      { char: '❤️‍🔥', keywords: 'قلب آتشین عشق پرشور داغ' },
      { char: '❤️‍🩹', keywords: 'قلب درمان شده التیام پانسمان' },
      { char: '💖', keywords: 'قلب درخشان ستاره دار ذوق' },
      { char: '💗', keywords: 'قلب در حال تپش ضربان عشق' },
      { char: '💓', keywords: 'تپش قلب ضربان صدا' },
      { char: '💞', keywords: 'دو قلب چرخان عاشقی' },
      { char: '💕', keywords: 'دو قلب عشق کوچک' },
      { char: '✨', keywords: 'درخشش ستاره جرقه جادو تمیز نو' },
      { char: '⭐', keywords: 'ستاره طلایی امتیاز عالی برتر' },
      { char: '🌟', keywords: 'ستاره پرنور تابان درخشان' },
      { char: '🔥', keywords: 'آتش داغ ترند خفن حرارت فوق العاده' },
      { char: '💥', keywords: 'انفجار بمب برخورد برق' },
      { char: '💯', keywords: 'صد در صد بیست نمره کامل تایید' },
      { char: '✅', keywords: 'تیک سبز تایید صحیح درست اوکی' },
      { char: '❌', keywords: 'ضربدر قرمز غلط رد باطل خطا' },
      { char: '⚠️', keywords: 'هشدار احتیاط خطر اخطار توجه' },
      { char: '❗', keywords: 'علامت تعجب قرمز تاکید مهم' },
      { char: '❓', keywords: 'علامت سوال پرسش چرا نامعلوم' },
      { char: '🎉', keywords: 'جشن شادی تبریک مبارک فشفشه کادو' },
      { char: '🎯', keywords: 'هدف دارت سیبل دقیق نقطه زنی' }
    ]
  },
  {
    id: 'objects',
    name: 'اشیا و سرگرمی',
    icon: '🎉',
    emojis: [
      { char: '📦', keywords: 'بسته جعبه کارتن انبار پستی کالا' },
      { char: '📋', keywords: 'تخته شاسی گزارش لیست فهرست مدارک' },
      { char: '📁', keywords: 'پوشه پرونده مدارک فولدر اسناد' },
      { char: '📄', keywords: 'برگه کاغذ سند مدرک نامه' },
      { char: '📊', keywords: 'نمودار ستونی آمار گزارش رشد' },
      { char: '📈', keywords: 'نمودار صعودی پیشرفت مالی سود' },
      { char: '📉', keywords: 'نمودار نزولی افت کاهش' },
      { char: '💰', keywords: 'کیسه پول دلار سرمایه ثروت اسکناس' },
      { char: '💳', keywords: 'کارت بانکی شتاب خرید اعتباری' },
      { char: '🏷️', keywords: 'برچسب قیمت اتیکت کالا بارکد' },
      { char: '🔒', keywords: 'قفل بسته امنیت حفاظت رمز' },
      { char: '🔓', keywords: 'قفل باز دسترسی آزاد' },
      { char: '🔑', keywords: 'کلید رمز ورود راه‌حل گشایش' },
      { char: '🛠️', keywords: 'ابزار تعمیرات آچار چکش کارگاه' },
      { char: '⚙️', keywords: 'چرخ دنده تنظیمات سیستم فرآیند' },
      { char: '📱', keywords: 'موبایل گوشی تلفن همراه اپلیکیشن' },
      { char: '💻', keywords: 'لپ تاپ کامپیوتر سیستم فناوری' },
      { char: '⏰', keywords: 'ساعت زنگدار زمان وقت موعد' },
      { char: '⏳', keywords: 'ساعت شنی گذر زمان انتظار صبور' },
      { char: '🚀', keywords: 'موشک شلیک سرعت رشد پرتاب' },
      { char: '🚚', keywords: 'کامیون لجستیک باربری ترابری حمل' },
      { char: '🚗', keywords: 'خودرو ماشین سواری سفر' },
      { char: '☕', keywords: 'قهوه چای نوشیدنی استراحت کافه' },
      { char: '🍕', keywords: 'پیتزا غذا ناهار شام فست فود' },
      { char: '🎂', keywords: 'کیک تولد جشن شیرینی مبارک' }
    ]
  }
];

@Component({
  selector: 'app-chat-emoji-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective],
  template: `
    <div class="w-72 sm:w-80 bg-surface border border-line rounded-2xl shadow-xl overflow-hidden flex flex-col select-none"
         role="dialog"
         aria-label="انتخابگر ایموجی"
         data-testid="emoji-picker-container">
      <!-- هدر: جستجو و دکمه بستن -->
      <div class="p-2 border-b border-line flex items-center gap-1.5 bg-surface-muted/50">
        <div class="relative flex-1">
          <input type="text"
                 [(ngModel)]="searchQuery"
                 data-testid="emoji-search-input"
                 aria-label="جستجوی ایموجی"
                 placeholder="جستجوی ایموجی..."
                 class="w-full text-xs bg-surface border border-line rounded-lg px-2.5 py-1.5 pe-7 text-fg focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          <button *ngIf="searchQuery"
                  type="button"
                  (click)="searchQuery = ''"
                  title="پاک کردن جستجو"
                  aria-label="پاک کردن جستجو"
                  class="absolute end-1 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-fg-muted hover:text-fg cursor-pointer">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" appIcon="x"></svg>
          </button>
        </div>
        <button type="button"
                (click)="closePicker.emit()"
                data-testid="emoji-close-btn"
                title="بستن"
                aria-label="بستن"
                class="min-w-[40px] min-h-[40px] rounded-lg text-fg-muted hover:text-fg hover:bg-surface-muted flex items-center justify-center cursor-pointer tap-target">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" appIcon="x"></svg>
        </button>
      </div>

      <!-- تب‌های دسته‌بندی (اگر جستجو خالی است) -->
      <div *ngIf="!searchQuery" class="flex items-center px-1 py-1 border-b border-line/60 bg-surface gap-0.5 overflow-x-auto">
        <button *ngFor="let cat of categories"
                type="button"
                (click)="activeCategory.set(cat.id)"
                [attr.aria-selected]="activeCategory() === cat.id"
                [class.bg-indigo-50]="activeCategory() === cat.id"
                [class.text-indigo-600]="activeCategory() === cat.id"
                [class.text-fg-muted]="activeCategory() !== cat.id"
                [title]="cat.name"
                [attr.aria-label]="cat.name"
                class="flex-1 py-1 px-1.5 rounded-lg text-sm flex items-center justify-center hover:bg-surface-muted cursor-pointer transition-colors">
          <span class="text-base leading-none">{{ cat.icon }}</span>
        </button>
      </div>

      <!-- شبکهٔ ایموجی‌ها -->
      <div class="p-2 overflow-y-auto max-h-52 custom-scrollbar min-h-[140px]" data-testid="emoji-grid">
        <div *ngIf="displayedEmojis().length > 0; else noEmojis"
             class="grid grid-cols-7 sm:grid-cols-8 gap-1">
          <button *ngFor="let emo of displayedEmojis()"
                  type="button"
                  (click)="selectEmoji(emo.char)"
                  [title]="emo.keywords"
                  [attr.aria-label]="emo.char"
                  class="w-8 h-8 sm:w-9 sm:h-9 text-lg rounded-lg hover:bg-surface-muted active:scale-125 transition-transform flex items-center justify-center cursor-pointer">
            {{ emo.char }}
          </button>
        </div>
        <ng-template #noEmojis>
          <div class="py-8 text-center text-xs text-fg-muted">
            ایموجی یافت نشد
          </div>
        </ng-template>
      </div>
    </div>
  `
})
export class ChatEmojiPickerComponent {
  public readonly emojiSelect = output<string>();
  public readonly closePicker = output<void>();

  public readonly categories = EMOJI_CATEGORIES;
  public activeCategory = signal<string>('smileys');
  public searchQuery: string = '';

  public displayedEmojis = computed(() => {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) {
      const activeCat = this.categories.find(c => c.id === this.activeCategory());
      return activeCat ? activeCat.emojis : [];
    }
    // Search across all categories
    const results: { char: string; keywords: string }[] = [];
    for (const cat of this.categories) {
      for (const emo of cat.emojis) {
        if (emo.keywords.toLowerCase().includes(q) || emo.char.includes(q)) {
          results.push(emo);
        }
      }
    }
    return results;
  });

  public selectEmoji(char: string): void {
    this.emojiSelect.emit(char);
  }
}
