/*
 * Training videos + fast end-to-end test (plan: Documents/Training_Videos/plan_training_videos.md).
 *
 * One scenario, two modes (env VIDEO_MODE):
 *   test      fast, no video, no pauses; every check still runs (default).
 *   training  video on, slowMo 250 ms, captions + cursor overlay, 30 min per video.
 * Two profiles (projects): desktop 1440x900, mobile 412x915 (touch).
 * BASE_URL defaults to https://app.farsalish.ir. Never point it at soft.
 *
 * Order for one video (from tests/playwright):
 *   1. demo data (backend):  WH_ALLOW_SCENARIO_SEED=1 manage.py seed_video_demo --purge, then --admin or --base
 *   2. npx playwright test --project=desktop scenarios/00-intro.spec.ts      (VIDEO_MODE=test)
 *   3. .venv-tools/Scripts/python tools/make_audio.py                              (captions -> audio/manifest.json)
 *   4. reseed, then VIDEO_MODE=training npx playwright test --project=desktop scenarios/00-intro.spec.ts
 *   5. reseed, then the same with --project=mobile
 *   6. .venv-tools/Scripts/python tools/mux.py; tools/frames.py; tools/index.py
 * Raw recordings and timelines go to output/; finished mp4/srt to Documents/Training_Videos/videos/.
 * Passwords are read from scratch/video_demo_credentials.json (written by seed_video_demo; never printed).
 */
import { defineConfig } from '@playwright/test';

const training = process.env['VIDEO_MODE'] === 'training';
const baseURL = process.env['BASE_URL'] || 'https://app.farsalish.ir';
if (/soft\./i.test(baseURL)) {
  throw new Error('Training videos never run against soft.');
}

const desktop = { width: 1440, height: 900 };
const mobile = { width: 412, height: 915 };

export default defineConfig({
  testDir: './scenarios',
  outputDir: './output/test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: training ? 30 * 60_000 : 5 * 60_000,
  expect: { timeout: training ? 20_000 : 15_000 },
  reporter: [['list']],
  use: {
    baseURL,
    channel: 'chrome',
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    serviceWorkers: 'block',
    trace: 'off',
    screenshot: training ? 'off' : 'only-on-failure',
    launchOptions: { slowMo: training ? 250 : 0 },
  },
  projects: [
    {
      name: 'desktop',
      use: {
        viewport: desktop,
        video: training ? { mode: 'on', size: desktop } : 'off',
      },
    },
    {
      name: 'mobile',
      use: {
        viewport: mobile,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
        userAgent:
          'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
        video: training ? { mode: 'on', size: mobile } : 'off',
      },
    },
  ],
});
