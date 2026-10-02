---
name: design-system
description: Design language and visual rules for the warehouse and accounting frontend (Angular + Tailwind, Persian and right-to-left). Use this when building or changing any template, style, component or UI page in warehouse-front, so the look stays consistent, accessible and offline-first. Invoke at most once per session; re-invoke only if it is no longer in context.
user-invocable: false
---

# Frontend design language

First rule: **find the existing pattern first and repeat it.** Templates were written by different agents, and consistency matters more than any new stylistic preference. After every visual change, use the `ui-reviewer` subagent and the `verification-before-completion` skill.

## Foundations
- Tailwind 3.4 (`tailwind.config.js`) and global styles in `src/styles.css`.
- `<html lang="fa" dir="rtl">`.
- The Vazirmatn font is **local** (`public/fonts/vazirmatn/`, cached in the Service Worker). Do not add any external font or CDN.

## Color
Semantic tokens (new code should use these):

| Use | Class | Equals |
|---|---|---|
| Card and modal | `bg-surface` | white |
| Soft panel, column header | `bg-surface-muted` | slate-50 |
| Page background | `bg-surface-canvas` | slate-100 |
| Main text | `text-fg` | slate-800 |
| Secondary text | `text-fg-muted` | slate-600 |
| Hint, placeholder | `text-fg-subtle` | slate-400 |
| Border | `border-line` | slate-200 |
| Faint divider | `border-line-subtle` | slate-100 |

- The values are defined in `:root` of `styles.css`. The old classes (`bg-white`, `text-slate-800`, etc.) are exactly these colors; do not change them for "standardization".
- **Primary action:** `bg-indigo-600 hover:bg-indigo-700 text-white` (the `brand-*` palette is the same indigo).
- **Status colors** (like the `btn-icon-*` classes): emerald for success, rose for danger and delete, amber for warning, blue for info, slate for neutral.
- Hard-coded colors (`#...`, `rgb()`) inside `style` are forbidden; the hook warns.

## Typography and spacing
- Main text `text-xs`, regular text `text-sm`, tiny metadata `text-[11px]` or `text-[10px]`.
- **Do not write new text smaller than 10px** (`text-[9px]` and `text-[8px]` are not legible).
- Weight: titles and labels `font-bold` or `font-black`; descriptive text with no extra weight.
- Spacing: `gap-1` to `gap-3` is common; `gap-4` for larger sections.
- Numeric table columns get `tabular-nums` automatically. For numbers outside tables (KPI, counter), add the `tabular-nums` class.

## Existing patterns (repeat these)
- **Card:** `bg-surface rounded-2xl border border-line shadow-xs p-4`
- **Button and input:** `rounded-xl`; icon-only button with `btn-icon-square` or `btn-icon-sm` plus one of `btn-icon-indigo|emerald|rose|blue|purple|amber|slate` (in `styles.css`)
- **Modal:**
  - Container: `fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5`
  - Backdrop: `absolute inset-0 bg-slate-900/60 backdrop-blur-sm`
  - Panel: `bg-surface rounded-3xl shadow-2xl w-full max-w-* max-h-[90vh] flex flex-col modal-enter`
  - Or the `shared/components/modal` component
- **Page header:** a `bg-surface rounded-2xl border border-line shadow-sm` bar; tabs on the right and action buttons on the left
- **Shared components** (use these before building new ones) in `src/app/shared/components/`:
  - `data-table`, `modal`, `confirm-dialog` (service `ConfirmDialogService`), `toast` (service `ToastService`)
  - `status-badge`, `loading-skeleton`, `offline-pending-badge`, `toggle-switch`, `file-upload`
  - `smart-delete-modal`, `barcode-scanner`, `cartable-header`, `cartable-card-base`, `warehouse-selector`
- **Pipes:** `PersianDatePipe` and `StatusLabelPipe` in `src/app/shared/pipes/`; date utilities in `core/utils/date-utils.ts`

## Icons
- Only from the shared registry: `<svg appIcon="trash-2" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"></svg>`
- Directive: `shared/icons/svg-icon.directive.ts` (`SvgIconDirective` in the component's `imports`). Registry: `shared/icons/icon-registry.ts`.
- Outer attributes (size, color, stroke) stay in the template. Icon color comes from `currentColor`, so it is set by the parent's `text-*` class.
- Names follow the Feather and Lucide style (`x`, `check`, `trash-2`, `search`, `chevron-down`); Heroicons variants have the `hero-` prefix.
- **New icon:** search the registry first. If it is not there, add only the inner content under a kebab-case name.
- New inline svg in templates is forbidden; guardian 52 (`scripts/e2e/guardian_52_icon_registry.py`) catches it and unknown names.
- An icon-only button must have a Persian `aria-label` or `title`.

## RTL and Persian
- New code should use logical classes: `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`, `text-end` (old code has physical classes; do not touch it).
- The "next" arrow points left in RTL (`chevron-left`) and "previous" points right.
- Persian numbers with `Intl.NumberFormat('fa-IR')` and Jalali dates with `PersianDatePipe`.
- Wrap code, IDs, emails or Latin text inside Persian text in `<bdi>` or `dir="ltr"`.
- Write the half-space (ZWNJ) correctly: «می‌شود», «داده‌ها».

## Accessibility (WCAG 2.2 AA)
- Text contrast at least 4.5:1 (large text and UI components 3:1).
- Visible focus indicator: if you add `outline-none`, also add `focus-visible:ring-2 focus-visible:ring-indigo-500` (the hook warns).
- Build clickable actions with `<button type="button">`, not `div`.
- Every form field should have a `label`.
- A meaningful image has a descriptive Persian `alt`, and a decorative image `alt=""` (the hook warns).
- Touch targets at least 24×24 px; preferably 44 on warehouse mobile pages.
- Reduced motion is global (`prefers-reduced-motion` in `styles.css`). New animations should be 150 to 300 ms.

## States (the app is offline-first)
Every data-driven list or page has these four states:
1. **Loading:** `loading-skeleton`
2. **Empty:** guidance text and, if possible, the next action
3. **Error:** a clear message and a way to retry
4. **Offline or stale:** an `isStale` indicator or `offline-pending-badge`

Detect server outages only with `isServerUnreachable()`.

## Images
- Server image in a fixed-size box: `NgOptimizedImage` with `[ngSrc]` and `width`/`height` equal to that box (CSS classes set the actual size).
- For `data:` or `blob:` previews (FileReader, cropper), use plain `src`; `NgOptimizedImage` does not accept them.
- **Print** templates (ID card, etc.) keep plain `src`, because lazy loading may leave the photo blank in print.

## Dark mode
`darkMode: 'selector'` is set and the `dark` class is never activated anywhere. Do not write new `dark:` classes, except in the "full dark theme" project, which is done only by redefining the token variables under `.dark`.

## Performance
- Lazy-load heavy parts (`chart.js` charts, PDF viewer, editor) with `@defer` or dynamic `import()`.
- Page transitions are global (`withViewTransitions` in `app.config.ts`); no new code is needed.

## Before declaring completion
- `npx tsc --noEmit -p tsconfig.app.json` in `warehouse-front`
- `python scripts/e2e/guardian_52_icon_registry.py`
- The `ui-reviewer` subagent to review appearance and accessibility
