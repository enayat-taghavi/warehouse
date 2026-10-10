import { describe, it, expect } from 'vitest';
import { ICONS } from './icon-registry';
import {
  ACTION_ICONS,
  STATUS_ICONS,
  PLATFORM_ENTITY_ICONS,
  resolveSemanticIcon,
} from './semantic-icons';
import { WAREHOUSE_ENTITY_ICONS } from '../../modules/warehouse/entity-icons';
import { ACCOUNTING_ENTITY_ICONS } from '../../modules/accounting/entity-icons';

describe('فرهنگ آیکون یکسان (Semantic Icon Dictionary)', () => {
  const ALLOWED_SHARED_ICONS = new Set([
    'download',     // خروجی اکسل و دانلود
    'upload',       // ورود اکسل و بارگذاری
    'rotate-ccw',   // برگشت برای اصلاح، بازیابی، وضعیت اصلاح
    'check-circle', // تایید کارتابل، وضعیت تایید، کارتابل تایید مدیر
    'x-circle',     // رد کارتابل، وضعیت رد
    'lock',         // قفل دوره، وضعیت قفل، بستن دوره
    'cloud-upload', // همگام‌سازی، در صف ارسال
    'settings',     // تنظیمات کار و موجودیت
    'file-lines',   // تاریخچه کار و رهگیری تغییرات
    'bell',         // هشدار و اعلان‌ها
    'users',        // پرسنل در نقش‌های مختلف
    'calculator',   // بودجه و ماشین‌حساب
  ]);

  it('همه مقادیر ACTION_ICONS باید در رجیستری ICONS معتبر باشند', () => {
    for (const [actionKey, iconName] of Object.entries(ACTION_ICONS)) {
      expect(iconName in ICONS, `آیکون '${iconName}' برای کار '${actionKey}' در ICONS نیست`).toBe(true);
    }
  });

  it('همه مقادیر STATUS_ICONS باید در رجیستری ICONS معتبر باشند', () => {
    for (const [statusKey, iconName] of Object.entries(STATUS_ICONS)) {
      expect(iconName in ICONS, `آیکون '${iconName}' برای وضعیت '${statusKey}' در ICONS نیست`).toBe(true);
    }
  });

  it('همه مقادیر PLATFORM_ENTITY_ICONS باید در رجیستری ICONS معتبر باشند', () => {
    for (const [entityKey, iconName] of Object.entries(PLATFORM_ENTITY_ICONS)) {
      expect(iconName in ICONS, `آیکون '${iconName}' برای موجودیت پلتفرم '${entityKey}' در ICONS نیست`).toBe(true);
    }
  });

  it('همه مقادیر WAREHOUSE_ENTITY_ICONS باید در رجیستری ICONS معتبر باشند', () => {
    for (const [entityKey, iconName] of Object.entries(WAREHOUSE_ENTITY_ICONS)) {
      expect(iconName in ICONS, `آیکون '${iconName}' برای موجودیت انبار '${entityKey}' در ICONS نیست`).toBe(true);
    }
  });

  it('همه مقادیر ACCOUNTING_ENTITY_ICONS باید در رجیستری ICONS معتبر باشند', () => {
    for (const [entityKey, iconName] of Object.entries(ACCOUNTING_ENTITY_ICONS)) {
      expect(iconName in ICONS, `آیکون '${iconName}' برای موجودیت مالی '${entityKey}' در ICONS نیست`).toBe(true);
    }
  });

  it('نباید هیچ اشتراک آیکونی خارج از فهرست سفید بند ۳-۴ بین کارها، وضعیت‌ها و موجودیت‌ها وجود داشته باشد', () => {
    // نگاشت هر آیکون به مفاهیمی که از آن استفاده کرده‌اند
    const iconUsageMap = new Map<string, string[]>();

    const recordUsage = (dict: Record<string, string>, scope: string) => {
      for (const [key, icon] of Object.entries(dict)) {
        const fullConcept = `${scope}:${key}`;
        if (!iconUsageMap.has(icon)) {
          iconUsageMap.set(icon, []);
        }
        iconUsageMap.get(icon)!.push(fullConcept);
      }
    };

    recordUsage(ACTION_ICONS, 'action');
    recordUsage(STATUS_ICONS, 'status');
    recordUsage(PLATFORM_ENTITY_ICONS, 'platform-entity');
    recordUsage(WAREHOUSE_ENTITY_ICONS, 'warehouse-entity');
    recordUsage(ACCOUNTING_ENTITY_ICONS, 'accounting-entity');

    const unauthorizedSharing: string[] = [];
    for (const [icon, usages] of iconUsageMap.entries()) {
      if (usages.length > 1 && !ALLOWED_SHARED_ICONS.has(icon)) {
        unauthorizedSharing.push(`آیکون '${icon}' خارج از فهرست سفید به اشتراک گذاشته شده در: ${usages.join(', ')}`);
      }
    }

    expect(unauthorizedSharing, unauthorizedSharing.join('\n')).toEqual([]);
  });

  it('resolveSemanticIcon باید نام‌های action-* و status-* و رجیستری را حل کند', () => {
    expect(resolveSemanticIcon('action-create')).toBe('plus');
    expect(resolveSemanticIcon('action-edit')).toBe('edit');
    expect(resolveSemanticIcon('action-delete')).toBe('trash-2');
    expect(resolveSemanticIcon('action-refresh')).toBe('refresh-cw');
    expect(resolveSemanticIcon('action-approve')).toBe('check-circle');
    expect(resolveSemanticIcon('action-reject')).toBe('x-circle');

    expect(resolveSemanticIcon('status-pending')).toBe('clock');
    expect(resolveSemanticIcon('status-approved')).toBe('check-circle');
    expect(resolveSemanticIcon('status-rejected')).toBe('x-circle');
    expect(resolveSemanticIcon('status-draft')).toBe('file');

    // نام‌های مستقیم رجیستری
    expect(resolveSemanticIcon('trash-2')).toBe('trash-2');
    expect(resolveSemanticIcon('plus')).toBe('plus');

    // مقادیر نامعتبر یا خالی
    expect(resolveSemanticIcon('action-nonexistent-key')).toBeNull();
    expect(resolveSemanticIcon('status-unknown-status')).toBeNull();
    expect(resolveSemanticIcon('nonexistent-icon-xyz')).toBeNull();
    expect(resolveSemanticIcon(null)).toBeNull();
    expect(resolveSemanticIcon(undefined)).toBeNull();

    // کلیدهای prototype نباید نام معتبر حساب شوند
    expect(resolveSemanticIcon('constructor')).toBeNull();
    expect(resolveSemanticIcon('toString')).toBeNull();
    expect(resolveSemanticIcon('action-constructor')).toBeNull();
    expect(resolveSemanticIcon('status-__proto__')).toBeNull();
  });
});
