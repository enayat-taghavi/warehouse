import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { preventIosInputZoom } from './app/core/utils/ios-viewport';

// آیفون روی ورودی‌های ریز زوم می‌کند و صفحه زوم‌شده می‌ماند (اسکرول اضافه)
preventIosInputZoom(typeof document !== 'undefined' ? document : undefined,
                    typeof navigator !== 'undefined' ? navigator : undefined);

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
