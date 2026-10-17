// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionTabService } from './session-tab.service';
import { getModuleRegistry } from '../modules/module-registry.service';

function createStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = String(val); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] || null,
  };
}

if (!(globalThis as any).localStorage) {
  (globalThis as any).localStorage = createStorageMock();
}
if (!(globalThis as any).sessionStorage) {
  (globalThis as any).sessionStorage = createStorageMock();
}

describe('SessionTabService: getActiveApp', () => {
  let service: SessionTabService;
  let origInstalledCodes: string[] = [];
  let origSessionActiveApp: string | null = null;
  let origLocalActiveApp: string | null = null;
  let origWhInstalledModules: string | null = null;

  beforeEach(() => {
    origInstalledCodes = getModuleRegistry().getInstalledCodes();
    try {
      origSessionActiveApp = sessionStorage.getItem('active_app_module');
    } catch {
      origSessionActiveApp = null;
    }
    try {
      origLocalActiveApp = localStorage.getItem('active_app_module');
      origWhInstalledModules = localStorage.getItem('wh_installed_modules');
    } catch {
      origLocalActiveApp = null;
      origWhInstalledModules = null;
    }

    try {
      sessionStorage.removeItem('active_app_module');
      sessionStorage.clear();
    } catch {}
    try {
      localStorage.removeItem('active_app_module');
      localStorage.removeItem('wh_installed_modules');
      localStorage.clear();
    } catch {}

    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage?.removeItem('active_app_module');
        window.sessionStorage?.clear();
      } catch {}
      try {
        window.localStorage?.removeItem('active_app_module');
        window.localStorage?.removeItem('wh_installed_modules');
        window.localStorage?.clear();
      } catch {}
    }

    getModuleRegistry().setInstalledModules(['warehouse', 'accounting']);
    service = new SessionTabService();
  });

  afterEach(() => {
    try {
      sessionStorage.clear();
    } catch {}
    try {
      localStorage.clear();
    } catch {}

    if (typeof sessionStorage !== 'undefined') {
      if (origSessionActiveApp !== null) {
        try { sessionStorage.setItem('active_app_module', origSessionActiveApp); } catch {}
      } else {
        try { sessionStorage.removeItem('active_app_module'); } catch {}
      }
    }

    if (typeof localStorage !== 'undefined') {
      if (origLocalActiveApp !== null) {
        try { localStorage.setItem('active_app_module', origLocalActiveApp); } catch {}
      } else {
        try { localStorage.removeItem('active_app_module'); } catch {}
      }
      if (origWhInstalledModules !== null) {
        try { localStorage.setItem('wh_installed_modules', origWhInstalledModules); } catch {}
      } else {
        try { localStorage.removeItem('wh_installed_modules'); } catch {}
      }
    }

    if (typeof window !== 'undefined') {
      try { window.sessionStorage?.clear(); } catch {}
      try { window.localStorage?.clear(); } catch {}

      if (window.sessionStorage) {
        if (origSessionActiveApp !== null) {
          try { window.sessionStorage.setItem('active_app_module', origSessionActiveApp); } catch {}
        } else {
          try { window.sessionStorage.removeItem('active_app_module'); } catch {}
        }
      }

      if (window.localStorage) {
        if (origLocalActiveApp !== null) {
          try { window.localStorage.setItem('active_app_module', origLocalActiveApp); } catch {}
        } else {
          try { window.localStorage.removeItem('active_app_module'); } catch {}
        }
        if (origWhInstalledModules !== null) {
          try { window.localStorage.setItem('wh_installed_modules', origWhInstalledModules); } catch {}
        } else {
          try { window.localStorage.removeItem('wh_installed_modules'); } catch {}
        }
      }

      window.history.pushState({}, '', '/');
    }

    if (origInstalledCodes && origInstalledCodes.length > 0) {
      getModuleRegistry().setInstalledModules(origInstalledCodes);
    }
  });

  it('/app/warehouse/counter gives warehouse', () => {
    window.history.pushState({}, '', '/app/warehouse/counter');
    expect(service.getActiveApp()).toBe('warehouse');
  });

  it('/app/finance/x gives personnel', () => {
    window.history.pushState({}, '', '/app/finance/x');
    expect(service.getActiveApp()).toBe('personnel');
  });

  it('/app/operations/cockpit gives operations', () => {
    window.history.pushState({}, '', '/app/operations/cockpit');
    expect(service.getActiveApp()).toBe('operations');
  });
});
