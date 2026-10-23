import { Injectable } from '@angular/core';

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  mimeType?: string;
}

export interface CompressedImageResult {
  file: File;
  previewUrl: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
}

/**
 * شکست در خواندن یا فشرده‌سازی تصویر
 *
 * `isHeif` جدا نگه داشته می‌شود چون تنها حالتی است که پیام مفیدی برای کاربر
 * دارد: سرور هم HEIC را نمی‌پذیرد، پس باید همان لحظه گفته شود نه پس از یک
 * رفت‌وبرگشت شبکه که در انبار بی‌آنتن ممکن است ساعت‌ها بعد رخ دهد.
 */
export class ImageDecodeError extends Error {
  readonly isHeif: boolean;

  constructor(message: string, isHeif = false) {
    super(message);
    this.name = 'ImageDecodeError';
    this.isHeif = isHeif;
  }
}

/** تصویر خوانده‌شده، همراه با راه آزادسازی منابعش */
interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/** برندهای ftyp که فایل HEIC/HEIF را لو می‌دهند — هم‌خوان با اعتبارسنجی سرور */
const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'mif1', 'msf1'];

@Injectable({
  providedIn: 'root'
})
export class ImageCompressorService {
  private readonly DEFAULT_MAX_WIDTH = 1920;
  private readonly DEFAULT_MAX_HEIGHT = 1920;
  private readonly DEFAULT_QUALITY = 0.88;

  /**
   * فشرده‌سازی و تغییر مقیاس یک تصویر در مرورگر
   *
   * در صورت شکست، ImageDecodeError پرتاب می‌شود. فراخوان باید فایل *اصلی* را
   * نگه دارد و بفرستد، نه دور بیندازد: تنها نسخه آن عکس همان است.
   */
  async compressImage(file: File, options?: CompressionOptions): Promise<CompressedImageResult> {
    // `??` نه `||`: با `||` مقدار صریح 0 برای quality بی‌صدا به 0.88 تبدیل می‌شد
    const maxWidth = options?.maxWidth ?? this.DEFAULT_MAX_WIDTH;
    const maxHeight = options?.maxHeight ?? this.DEFAULT_MAX_HEIGHT;
    const quality = options?.quality ?? this.DEFAULT_QUALITY;
    const mimeType = options?.mimeType ?? 'image/webp';

    const decoded = await this.decode(file);
    try {
      const { width, height } = this.fitInside(decoded.width, decoded.height, maxWidth, maxHeight);
      const blob = await this.render(decoded.source, width, height, mimeType, quality);

      // نوع واقعی خروجی از خودِ blob خوانده می‌شود، نه از چیزی که خواستیم:
      // سافاری قدیم `image/webp` را نمی‌شناسد و بی‌صدا PNG می‌دهد. اگر نام و
      // type را webp بگذاریم، فایلی با محتوای PNG و پسوند webp به سرور می‌رود و
      // اعتبارسنجیِ محتوامحورِ سرور آن را رد می‌کند — عکس کاربر بی‌دلیل می‌سوخت.
      const actualType = blob.type || mimeType;
      const baseName = file.name.replace(/\.[^/.]+$/, '') || 'photo';
      const compressedFile = new File([blob], `${baseName}.${this.extensionFor(actualType)}`, {
        type: actualType,
        lastModified: Date.now()
      });

      return {
        file: compressedFile,
        previewUrl: URL.createObjectURL(blob),
        originalSize: file.size,
        compressedSize: compressedFile.size,
        width,
        height
      };
    } finally {
      // منابع تصویر مبدأ همان‌جا آزاد می‌شوند، نه در نوبت نامعلوم GC
      decoded.release();
    }
  }

  /**
   * فشرده‌سازی دسته‌ای چندین تصویر
   *
   * فایل‌هایی که فشرده نشدند در خروجی نیستند؛ فراخوان باید خودش سراغ اصلشان
   * برود (خروجی این متد هم‌اندازه ورودی نیست).
   */
  async compressMultiple(files: File[], options?: CompressionOptions): Promise<CompressedImageResult[]> {
    const results: CompressedImageResult[] = [];
    for (const file of files) {
      try {
        const res = await this.compressImage(file, options);
        results.push(res);
      } catch (err) {
        console.error('Error compressing file:', file.name, err);
      }
    }
    return results;
  }

  /** تشخیص HEIC/HEIF از ۱۲ بایت اول — همان معیاری که سرور به کار می‌برد */
  async looksLikeHeif(file: Blob): Promise<boolean> {
    try {
      const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      if (head.length < 12) return false;
      const ascii = (from: number, to: number) =>
        String.fromCharCode(...Array.from(head.subarray(from, to)));
      return ascii(4, 8) === 'ftyp' && HEIF_BRANDS.includes(ascii(8, 12));
    } catch {
      return false;
    }
  }

  // ════════════════════════════════════════════
  //  خواندن تصویر
  // ════════════════════════════════════════════

  /**
   * خواندن تصویر با کمترین مصرف حافظه
   *
   * پیش از این فایل با `readAsDataURL` به رشته base64 تبدیل می‌شد و همان رشته
   * به `img.src` می‌رفت: برای عکس ۸ مگابایتی گوشی حدود ۱۱ مگابایت رشته در
   * حافظه، به‌علاوه نسخه decode‌شده — و برای دسته چند عکسی، چند برابر آن. روی
   * گوشی‌های ارزانِ انبار همین باعث بسته شدن تب و از دست رفتن عکس می‌شد.
   * `createObjectURL` فقط یک اشاره‌گر به همان Blob می‌سازد و کپی نمی‌کند.
   *
   * چرا `createImageBitmap` (که سریع‌تر هم بود) انتخاب نشد: جهت EXIF را در
   * سافاری قدیم بی‌صدا نادیده می‌گیرد و عکس پرتره افقی ذخیره می‌شد؛ مسیر `<img>`
   * در همه مرورگرها خودش جهت را اعمال می‌کند و مسئله حافظه هم اینجا حل شده است.
   */
  private async decode(file: File): Promise<DecodedImage> {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('decode failed'));
        el.src = url;
      });
      return {
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        // بدون revoke، فایل تا بسته شدن تب در حافظه می‌ماند
        release: () => URL.revokeObjectURL(url)
      };
    } catch {
      URL.revokeObjectURL(url);
      const heif = await this.looksLikeHeif(file);
      throw new ImageDecodeError(
        heif
          ? 'این عکس با قالب HEIC آیفون گرفته شده و در مرورگر باز نمی‌شود. در تنظیمات دوربین گزینه «Most Compatible» را فعال کنید.'
          : `قالب فایل «${file.name}» قابل خواندن نیست.`,
        heif
      );
    }
  }

  // ════════════════════════════════════════════
  //  ترسیم و تبدیل
  // ════════════════════════════════════════════

  /** ابعاد نهایی با حفظ نسبت؛ تصویر کوچک‌تر از سقف بزرگ‌نمایی نمی‌شود */
  private fitInside(
    width: number,
    height: number,
    maxWidth: number,
    maxHeight: number
  ): { width: number; height: number } {
    if (width <= maxWidth && height <= maxHeight) return { width, height };
    const scale = Math.min(maxWidth / width, maxHeight / height);
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale))
    };
  }

  private render(
    source: CanvasImageSource,
    width: number,
    height: number,
    mimeType: string,
    quality: number
  ): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.releaseCanvas(canvas);
      return Promise.reject(new ImageDecodeError('محیط Canvas در دسترس نیست.'));
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // پس‌زمینه سفید برای تصاویر شفاف (وگرنه شفافیت در JPEG سیاه می‌شود)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          // بوم بلافاصله آزاد می‌شود؛ در دسته ۱۰ عکسی، نگه‌داشتن آن تا GC یعنی
          // چند ده مگابایت پیکسل معلق روی گوشی انبارگردان
          this.releaseCanvas(canvas);
          if (!blob) {
            return reject(new ImageDecodeError('خطا در فشرده‌سازی تصویر.'));
          }
          resolve(blob);
        },
        mimeType,
        quality
      );
    });
  }

  private releaseCanvas(canvas: HTMLCanvasElement): void {
    canvas.width = 0;
    canvas.height = 0;
  }

  private extensionFor(mimeType: string): string {
    const known: Record<string, string> = {
      'image/webp': 'webp',
      'image/jpeg': 'jpg',
      'image/png': 'png'
    };
    const mapped = known[mimeType];
    if (mapped) return mapped;
    const subtype = mimeType.split('/')[1];
    return subtype ? subtype.replace(/[^a-z0-9]/gi, '') || 'img' : 'img';
  }
}
