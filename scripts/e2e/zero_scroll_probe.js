/**
 * سنجه عددی Zero-Scroll (Zero-Scroll Probe)
 * مرجع: بند ۵ و بخش ۲ در طرح جامع سازگاری عناصر کلیک‌پذیر با ارگونومی واکنش‌گرا
 *
 * ویژگی‌ها:
 * ۱) فقط‌خواندنی: هیچ تغییری در DOM یا استایل‌ها ایجاد نمی‌کند.
 * ۲) خروجی JSON ساختاریافته شامل:
 *    - innerWidth و بررسی اسکرول افقی صفحه (scrollWidth > innerWidth)
 *    - وضعیت هر نوار تب یا اکشن بار: fitsWithoutScroll، isSingleRow، و گزینشگر خوانا
 * ۳) قابل اجرا در مرورگر واقعی (DevTools Console / CDP / Puppeteer) و پشتیبانی از Node.js.
 */
(function (global) {
  'use strict';

  function generateReadableSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return `#${el.id}`;

    const tagName = el.tagName.toLowerCase();
    const meaningfulAttrs = ['cc-tabs', 'cc-actions', 'role', 'appAction'];
    for (const attr of meaningfulAttrs) {
      if (el.hasAttribute(attr)) {
        const val = el.getAttribute(attr);
        return val ? `${tagName}[${attr}="${val}"]` : `${tagName}[${attr}]`;
      }
    }

    const classes = Array.from(el.classList || [])
      .filter((c) => !c.startsWith('ng-') && !c.startsWith('hover:') && !c.startsWith('active:'))
      .slice(0, 3)
      .join('.');

    return classes ? `${tagName}.${classes}` : tagName;
  }

  function probeZeroScroll() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return {
        error: 'این سنجه باید در محیط مرورگر با دسترسی به شیء window و document اجرا شود.',
      };
    }

    const innerWidth = window.innerWidth;
    const docElem = document.documentElement;
    const pageScrollWidth = docElem.scrollWidth;
    const pageClientWidth = docElem.clientWidth;
    const hasPageHorizontalScroll = pageScrollWidth > innerWidth;

    const TARGET_SELECTORS = [
      '[role="tablist"]',
      'app-tab-bar',
      '[cc-tabs]',
      '[cc-actions]',
      '.overflow-x-auto',
    ];

    const queriedElements = new Set();
    const matchingBars = [];
    // ظرف اسکرول جدول‌ها نوار تب یا اکشن نیست و اسکرولش مجاز است؛ جدا شمرده می‌شود.
    let skippedTableScrollers = 0;

    for (const sel of TARGET_SELECTORS) {
      const found = document.querySelectorAll(sel);
      found.forEach((el) => {
        if (queriedElements.has(el)) return;
        queriedElements.add(el);
        if (sel === '.overflow-x-auto' && el.querySelector('table')) {
          skippedTableScrollers++;
          return;
        }
        matchingBars.push({ el, matchedBy: sel });
      });
    }

    // فرزندان display: contents (مثل app-overflow-menu در دسکتاپ) جعبه ندارند؛ فرزندان خودشان سنجیده می‌شوند.
    function visibleChildren(parent) {
      const out = [];
      for (const child of Array.from(parent.children)) {
        if (!(child instanceof HTMLElement)) continue;
        const style = window.getComputedStyle(child);
        if (style.display === 'contents') {
          out.push(...visibleChildren(child));
          continue;
        }
        if (style.display === 'none' || style.visibility === 'hidden' || child.offsetWidth === 0) continue;
        if (style.position === 'absolute' || style.position === 'fixed') continue;
        out.push(child);
      }
      return out;
    }

    const barsReport = matchingBars.map(({ el, matchedBy }) => {
      const scrollWidth = el.scrollWidth;
      const clientWidth = el.clientWidth;
      // تولرانس ۱ پیکسل برای گرد کردن اعشاری ساب‌پیکسل در نمایشگرهای رتینا
      const fitsWithoutScroll = scrollWidth <= clientWidth + 1;

      // بررسی فرزندان دیدنی نوار
      const children = visibleChildren(el);

      // سطر نشکسته یعنی همه فرزندان با فرزند اول هم‌پوشانی عمودی دارند؛
      // برابری دقیق offsetTop با items-center و ارتفاع‌های متفاوت (۴۰px و ۳۲px) شکست کاذب می‌سازد.
      const rects = children.map((c) => c.getBoundingClientRect());
      const offsetTops = rects.map((r) => Math.round(r.top));
      let isSingleRow = true;
      if (rects.length > 1) {
        const first = rects[0];
        isSingleRow = rects.every((r) => r.top < first.bottom - 1 && r.bottom > first.top + 1);
      }

      return {
        selector: generateReadableSelector(el),
        matchedBy,
        scrollWidth,
        clientWidth,
        fitsWithoutScroll,
        isSingleRow,
        visibleChildrenCount: children.length,
        offsetTops,
      };
    });

    const allBarsFit = barsReport.every((b) => b.fitsWithoutScroll);
    const allBarsSingleRow = barsReport.every((b) => b.isSingleRow);
    const zeroScrollPassed = !hasPageHorizontalScroll && allBarsFit && allBarsSingleRow;

    return {
      timestamp: new Date().toISOString(),
      innerWidth,
      pageScrollWidth,
      pageClientWidth,
      hasPageHorizontalScroll,
      barsCount: barsReport.length,
      skippedTableScrollers,
      allBarsFit,
      allBarsSingleRow,
      zeroScrollPassed,
      bars: barsReport,
    };
  }

  // اکسپورت برای ماژول‌ها و تعریف روی شیء گلوبال window
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { probeZeroScroll };
  }
  if (typeof window !== 'undefined') {
    window.probeZeroScroll = probeZeroScroll;
  }

  // اگر مستقیم ارزیابی شود، خروجی را بازمی‌گرداند
  return probeZeroScroll();
})(typeof globalThis !== 'undefined' ? globalThis : this);
