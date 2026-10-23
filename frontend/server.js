const express = require('express');
const path = require('path');
const compression = require('compression');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// فعال‌سازی فشرده‌سازی Gzip برای کاهش چشمگیر حجم انتقال
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// ایجاد پروکسی یکپارچه برای API و WebSocket با فیلتر دقیق مسیر
const backendProxy = createProxyMiddleware({
  target: 'http://127.0.0.1:8000',
  changeOrigin: true,
  ws: true, // فعال‌سازی WebSocket
  pathFilter: (pathname, req) => {
    // فقط درخواست‌هایی که با /api یا /ws یا /media شروع می‌شوند را پروکسی کن
    return pathname.startsWith('/api') || pathname.startsWith('/ws') || pathname.startsWith('/media');
  }
});

// استفاده از پروکسی به عنوان Middleware بدون بریدن مسیر (بدون mount path)
app.use(backendProxy);

// سرو کردن فایل‌های استاتیک فرانت‌اند با هدرهای بهینه کش
app.use(express.static(path.join(__dirname, 'dist/warehouse-app/browser'), {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html') || filePath.endsWith('ngsw.json') || filePath.endsWith('manifest.webmanifest')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (filePath.match(/\.[0-9a-fA-Z]{8,}\.(js|css)$/) || filePath.match(/chunk-[a-zA-Z0-9_-]+\.js$/)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// ریدایرکت بقیه مسیرها به index.html (برای روتینگ انگولار)
app.use((req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'dist/warehouse-app/browser/index.html'));
});

// گوش دادن روی تمام کارت‌های شبکه (0.0.0.0) برای دسترسی گوشی و لپ‌تاپ‌های دیگر
const server = app.listen(4200, '0.0.0.0', () => {
  console.log('Production server with proxy and compression running on http://0.0.0.0:4200');
});

// هندل کردن اتصال‌های WebSocket فقط برای مسیر مجاز
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/ws')) {
    backendProxy.upgrade(req, socket, head);
  } else {
    socket.destroy();
  }
});

