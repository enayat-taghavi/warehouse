/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  // حالت تیره فقط با کلاس `dark` روی یک والد فعال می‌شود، نه خودکار با تنظیم سیستم‌عامل.
  // (پیش‌فرض Tailwind 3 یعنی 'media' فقط ۵ قالب را تیره می‌کرد و بقیه روشن می‌ماندند.)
  darkMode: 'selector',
  theme: {
    extend: {
      fontFamily: { vazir: ['Vazirmatn', 'Tahoma', 'system-ui', 'sans-serif'] },
      colors: {
        brand: { 50:'#eef2ff',100:'#e0e7ff',200:'#c7d2fe',300:'#a5b4fc',400:'#818cf8',500:'#6366f1',600:'#4f46e5',700:'#4338ca',800:'#3730a3',900:'#312e81',950:'#1e1b4b' },
        // توکن‌های معنایی رنگ؛ مقدارها در src/styles.css (:root) تعریف شده‌اند و
        // عیناً برابر رنگ‌های رایج فعلی‌اند. پایهٔ حالت تیرهٔ کامل در آینده.
        surface: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          muted: 'rgb(var(--color-surface-muted) / <alpha-value>)',
          canvas: 'rgb(var(--color-surface-canvas) / <alpha-value>)',
        },
        fg: {
          DEFAULT: 'rgb(var(--color-fg) / <alpha-value>)',
          muted: 'rgb(var(--color-fg-muted) / <alpha-value>)',
          subtle: 'rgb(var(--color-fg-subtle) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'rgb(var(--color-line) / <alpha-value>)',
          subtle: 'rgb(var(--color-line-subtle) / <alpha-value>)',
        },
      },
      zIndex: {
        '60': '60',
        '70': '70',
        '80': '80',
        '90': '90',
        '100': '100',
      }
    },
  },
  plugins: [],
}
