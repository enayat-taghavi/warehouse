/**
 * Training-video helpers (plan §3.2). One fixture `tv` per test:
 *   tv.titleCard(), tv.say(id), tv.act.click/fill/fillSecret, tv.loginAs(user), tv.expectNoErrors(),
 *   tv.fillShamsiDate(), tv.fillAmount(), tv.download(), tv.print().
 * In VIDEO_MODE=test every pause and overlay is skipped; every check still runs.
 * Captions live in scenarios/<video>.captions.json so tools/make_audio.py can read them without a browser.
 */
import { test as base, expect, type Download, type Locator, type Page, type TestInfo } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export const TRAINING = process.env['VIDEO_MODE'] === 'training';
const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const CREDENTIALS = path.join(REPO, 'scratch', 'video_demo_credentials.json');
const MANIFEST = path.join(ROOT, 'audio', 'manifest.json');
const TIMELINE_DIR = path.join(ROOT, 'output', 'timeline');
const RAW_DIR = path.join(ROOT, 'output', 'raw');
const CAPTION_PAD_MS = 400;
const TYPE_DELAY_MS = 60;
const TITLE_MS = 3000;

export interface Captions {
  video: string;
  number: string;
  title: string;
  lines: Record<string, string>;
}

interface TimelineEvent {
  id: string;
  text: string;
  startMs: number;
  durMs: number;
}

type AudioManifest = Record<string, { file: string; ms: number }>;

function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
}

function password(username: string): string {
  const all = readJson<Record<string, string>>(CREDENTIALS, {});
  const value = all[username];
  if (!value) throw new Error(`No demo password for ${username}; run seed_video_demo first.`);
  return value;
}

/** Today's Shamsi date as yyyy/mm/dd with Latin digits. */
export function todayShamsi(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran',
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value.replace(/\D/g, '') ?? '';
  return `${get('year')}/${get('month').padStart(2, '0')}/${get('day').padStart(2, '0')}`;
}

/** Overlay script: caption bar, title card, cursor dot and click/tap ring (training only). */
const OVERLAY_SCRIPT = `(() => {
  if (window.__tv) return;
  const font = "Vazirmatn, Tahoma, sans-serif";
  const ensure = (id, css) => {
    let el = document.getElementById(id);
    if (!el && document.body) {
      el = document.createElement('div');
      el.id = id;
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = css;
      document.body.appendChild(el);
    }
    return el;
  };
  const cursorCss = 'position:fixed;z-index:2147483647;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;' +
    'background:rgba(239,68,68,.85);border:2px solid #fff;box-shadow:0 0 6px rgba(0,0,0,.4);pointer-events:none;' +
    'transition:transform .15s;left:-50px;top:-50px';
  const ring = (x, y, touch) => {
    if (!document.body) return;
    const r = document.createElement('div');
    r.setAttribute('aria-hidden', 'true');
    const size = touch ? 56 : 36;
    r.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border-radius:50%;' +
      'border:3px solid rgba(239,68,68,.9);background:rgba(239,68,68,' + (touch ? '.25' : '.1') + ');' +
      'width:' + size + 'px;height:' + size + 'px;left:' + (x - size / 2) + 'px;top:' + (y - size / 2) + 'px;' +
      'transition:transform .45s ease-out,opacity .45s ease-out;transform:scale(.6);opacity:1';
    document.body.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = 'scale(1.4)'; r.style.opacity = '0'; });
    setTimeout(() => r.remove(), 600);
  };
  window.__tv = {
    caption(text, top) {
      const el = ensure('__tv_caption', '');
      if (!el) return;
      el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);' + (top ? 'top:12px;' : 'bottom:18px;') +
        'z-index:2147483645;max-width:92vw;padding:10px 18px;border-radius:14px;background:rgba(15,23,42,.88);' +
        'color:#fff;font:600 ' + (top ? '15px' : '19px') + '/1.7 ' + font + ';direction:rtl;text-align:center;' +
        'pointer-events:none;box-shadow:0 6px 20px rgba(0,0,0,.35)';
      el.textContent = text;
      el.style.display = text ? 'block' : 'none';
    },
    captionRect() {
      const el = document.getElementById('__tv_caption');
      if (!el || el.style.display === 'none') return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    },
    title(text) {
      const el = ensure('__tv_title', '');
      if (!el) return;
      el.style.cssText = 'position:fixed;inset:0;z-index:2147483644;display:' + (text ? 'flex' : 'none') +
        ';align-items:center;justify-content:center;background:linear-gradient(135deg,#1e1b4b,#4f46e5);' +
        'color:#fff;font:800 34px/1.6 ' + font + ';direction:rtl;text-align:center;padding:24px;pointer-events:none';
      el.textContent = text;
    },
    tap(x, y) { ring(x, y, true); },
  };
  const hook = () => {
    document.addEventListener('mousemove', e => {
      const c = ensure('__tv_cursor', cursorCss);
      if (c) { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }
    }, true);
    document.addEventListener('mousedown', e => {
      const c = document.getElementById('__tv_cursor');
      if (c) { c.style.transform = 'scale(.7)'; setTimeout(() => c.style.transform = '', 160); }
      ring(e.clientX, e.clientY, false);
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
})();`;

/** window.print never opens the browser dialog; calls are counted instead. */
const PRINT_STUB = `(() => {
  window.__tvPrintCalls = 0;
  window.print = () => { window.__tvPrintCalls += 1; };
})();`;

export class TrainingVideo {
  readonly page: Page;
  readonly info: TestInfo;
  readonly captions: Captions;
  readonly mobile: boolean;
  private readonly t0 = Date.now();
  private readonly events: TimelineEvent[] = [];
  private readonly manifest: AudioManifest;
  readonly pageErrors: string[] = [];
  readonly consoleErrors: string[] = [];
  private captionTop: boolean;

  constructor(page: Page, info: TestInfo, captions: Captions) {
    this.page = page;
    this.info = info;
    this.captions = captions;
    this.mobile = info.project.name === 'mobile';
    this.captionTop = this.mobile;
    this.manifest = TRAINING ? readJson<AudioManifest>(MANIFEST, {}) : {};
    page.on('pageerror', err => this.pageErrors.push(String(err?.message ?? err)));
    page.on('console', msg => {
      if (msg.type() === 'error') this.consoleErrors.push(msg.text());
    });
  }

  private text(id: string): string {
    const value = this.captions.lines[id];
    if (value === undefined) throw new Error(`Caption ${this.captions.video}/${id} is missing`);
    return value;
  }

  private audioMs(id: string, text: string): number {
    const entry = this.manifest[`${this.captions.video}/${id}`];
    if (entry) return entry.ms;
    // without audio (make_audio not run yet): a reading-speed estimate
    return Math.max(1500, text.length * 70);
  }

  private async overlay<T>(fn: (tv: any) => T): Promise<T | undefined> {
    try {
      await this.page.evaluate(OVERLAY_SCRIPT);
      return await this.page.evaluate(fn as any);
    } catch {
      return undefined; // mid-navigation; the next call re-creates the overlay
    }
  }

  /** Caption + narration; waits for the narration length. No-op in test mode. */
  async say(id: string): Promise<void> {
    const text = this.text(id);
    if (!TRAINING) return;
    const durMs = this.audioMs(id, text);
    const top = this.captionTop;
    await this.page.evaluate(OVERLAY_SCRIPT).catch(() => undefined);
    await this.page.evaluate(([t, tp]) => (window as any).__tv?.caption(t, tp), [text, top] as const).catch(() => undefined);
    this.events.push({ id, text, startMs: Date.now() - this.t0, durMs });
    await this.page.waitForTimeout(durMs + CAPTION_PAD_MS);
    await this.page.evaluate(() => (window as any).__tv?.caption('', false)).catch(() => undefined);
  }

  /** Title card at the start of the video (caption id `title`). */
  async titleCard(): Promise<void> {
    if (!TRAINING) return;
    const label = `فیلم ${this.captions.number}: ${this.captions.title}`;
    await this.page.evaluate(OVERLAY_SCRIPT).catch(() => undefined);
    await this.page.evaluate(t => (window as any).__tv?.title(t), label).catch(() => undefined);
    const started = Date.now();
    await this.say('title');
    const rest = TITLE_MS - (Date.now() - started);
    if (rest > 0) await this.page.waitForTimeout(rest);
    await this.page.evaluate(() => (window as any).__tv?.title('')).catch(() => undefined);
  }

  /** Moves the caption away when it would cover the element about to be used. */
  private async keepCaptionOff(box: { x: number; y: number; width: number; height: number }): Promise<void> {
    const rect = await this.overlay(() => (window as any).__tv?.captionRect());
    if (!rect) return;
    const overlaps = box.x < rect.x + rect.width && box.x + box.width > rect.x &&
      box.y < rect.y + rect.height && box.y + box.height > rect.y;
    if (!overlaps) return;
    this.captionTop = !this.captionTop;
    const text = await this.page.evaluate(() => document.getElementById('__tv_caption')?.textContent ?? '');
    await this.page.evaluate(([t, tp]) => (window as any).__tv?.caption(t, tp), [text, this.captionTop] as const);
  }

  private async pointAt(target: Locator): Promise<void> {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) return;
    await this.keepCaptionOff(box);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    if (this.mobile) {
      await this.page.evaluate(([px, py]) => (window as any).__tv?.tap(px, py), [x, y] as const).catch(() => undefined);
    } else {
      await this.page.mouse.move(x, y, { steps: 20 });
      await this.page.waitForTimeout(150);
    }
  }

  readonly act = {
    click: async (target: Locator): Promise<void> => {
      if (TRAINING) await this.pointAt(target);
      if (this.mobile) await target.tap();
      else await target.click();
    },
    fill: async (target: Locator, value: string): Promise<void> => {
      if (!TRAINING) {
        await target.fill(value);
        return;
      }
      await this.act.click(target);
      await target.fill('');
      await target.pressSequentially(value, { delay: TYPE_DELAY_MS });
    },
    /** Passwords: never typed letter by letter, never logged. */
    fillSecret: async (target: Locator, value: string): Promise<void> => {
      if (TRAINING) await this.act.click(target);
      await target.fill(value);
    },
  };

  /** Clears the session and logs in with a demo user from scratch/video_demo_credentials.json. */
  async loginAs(username: string): Promise<void> {
    await this.page.context().clearCookies();
    await this.page.goto('/login');
    await this.page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await this.page.goto('/login');
    await this.act.fill(this.page.getByLabel('نام کاربری', { exact: true }), username);
    await this.act.fillSecret(this.page.getByLabel('رمز عبور', { exact: true }), password(username));
    await this.act.click(this.page.getByRole('button', { name: 'ورود به سامانه' }));
    await expect(this.page).not.toHaveURL(/\/login(\?|$)/, { timeout: 60_000 });
  }

  /** No red error toast and no uncaught page error (console errors are attached as a warning). */
  async expectNoErrors(): Promise<void> {
    await expect(this.page.locator('.toast.text-rose-400')).toHaveCount(0);
    expect(this.pageErrors, 'uncaught page errors').toEqual([]);
  }

  /** Shamsi date (yyyy/mm/dd) into an ng-persian-datepicker text input. */
  async fillShamsiDate(target: Locator, value: string): Promise<void> {
    await this.act.fill(target, value);
    await target.press('Tab');
    await this.page.keyboard.press('Escape');
  }

  /** Amount (rials) into the shared app-amount-input; the field groups digits itself. */
  async fillAmount(target: Locator, rials: number): Promise<void> {
    await this.act.fill(target, String(Math.round(rials)));
    await expect(target).toHaveValue(/\d/);
  }

  /** Runs the trigger, waits for the file and checks its name; caption id optional. */
  async download(trigger: () => Promise<void>, namePattern: RegExp = /\.xlsx?$/i, captionId?: string): Promise<Download> {
    const [file] = await Promise.all([this.page.waitForEvent('download', { timeout: 60_000 }), trigger()]);
    expect(file.suggestedFilename()).toMatch(namePattern);
    if (captionId) await this.say(captionId);
    return file;
  }

  /** Print: either a print page/window opens, or window.print is called (dialog never opens). */
  async print(trigger: () => Promise<void>): Promise<Page | null> {
    const popup = this.page.context().waitForEvent('page', { timeout: 15_000 }).catch(() => null);
    await trigger();
    const opened = await popup;
    if (opened) {
      await opened.waitForLoadState();
      return opened;
    }
    await expect.poll(() => this.page.evaluate(() => (window as any).__tvPrintCalls ?? 0)).toBeGreaterThan(0);
    return null;
  }

  /** Writes the caption timeline (for mux.py) and keeps the raw recording. */
  async finish(): Promise<void> {
    if (this.consoleErrors.length) {
      this.info.annotations.push({ type: 'warning', description: `console errors: ${this.consoleErrors.slice(0, 5).join(' | ')}` });
    }
    if (!TRAINING) return;
    const name = `${this.captions.video}-${this.info.project.name}`;
    fs.mkdirSync(TIMELINE_DIR, { recursive: true });
    fs.writeFileSync(path.join(TIMELINE_DIR, `${name}.json`), JSON.stringify({
      video: this.captions.video, number: this.captions.number, title: this.captions.title,
      profile: this.info.project.name, events: this.events,
    }, null, 2), 'utf-8');
  }

  async saveRecording(): Promise<void> {
    const video = this.page.video();
    if (!TRAINING || !video) return;
    fs.mkdirSync(RAW_DIR, { recursive: true });
    await video.saveAs(path.join(RAW_DIR, `${this.captions.video}-${this.info.project.name}.webm`));
  }
}

/** Builds the `test` object for one scenario; the fixture `tv` is bound to that scenario's captions. */
export function videoTest(captions: Captions) {
  return base.extend<{ tv: TrainingVideo }>({
    tv: async ({ page }, use, info) => {
      await page.addInitScript(PRINT_STUB);
      if (TRAINING) await page.addInitScript(OVERLAY_SCRIPT);
      const tv = new TrainingVideo(page, info, captions);
      await use(tv);
      await tv.finish();
      await page.close();
      await tv.saveRecording();
    },
  });
}

export { expect };
