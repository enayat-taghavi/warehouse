import { isIosDevice, preventIosInputZoom } from './ios-viewport';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const BASE = 'width=device-width, initial-scale=1, viewport-fit=cover';

function nav(userAgent: string, platform = '', maxTouchPoints = 0): Navigator {
  return { userAgent, platform, maxTouchPoints } as Navigator;
}

function docWithViewport(content: string): Document {
  const doc = document.implementation.createHTMLDocument('t');
  const meta = doc.createElement('meta');
  meta.setAttribute('name', 'viewport');
  meta.setAttribute('content', content);
  doc.head.appendChild(meta);
  return doc;
}

describe('ios-viewport — زوم خودکار آیفون', () => {
  it('detects iPhone and iPad-as-Mac, not Android or desktop Mac', () => {
    expect(isIosDevice(nav(IPHONE_UA))).toBe(true);
    expect(isIosDevice(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5))).toBe(true);
    expect(isIosDevice(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0))).toBe(false);
    expect(isIosDevice(nav(ANDROID_UA, 'Linux armv8l', 5))).toBe(false);
    expect(isIosDevice(undefined)).toBe(false);
  });

  it('adds maximum-scale=1 on iOS and keeps the rest of the viewport', () => {
    const doc = docWithViewport(BASE);
    expect(preventIosInputZoom(doc, nav(IPHONE_UA))).toBe(true);
    expect(doc.querySelector('meta[name="viewport"]')!.getAttribute('content')).toBe(`${BASE}, maximum-scale=1`);
  });

  it('is idempotent and leaves Android untouched (pinch zoom stays)', () => {
    const doc = docWithViewport(BASE);
    preventIosInputZoom(doc, nav(IPHONE_UA));
    expect(preventIosInputZoom(doc, nav(IPHONE_UA))).toBe(false);
    const android = docWithViewport(BASE);
    expect(preventIosInputZoom(android, nav(ANDROID_UA))).toBe(false);
    expect(android.querySelector('meta[name="viewport"]')!.getAttribute('content')).toBe(BASE);
  });
});
