import { describe, it, expect } from 'vitest';
import { getModuleRegistry } from './module-registry.service';
import { expandPermissionAliases, getPermissionAliases, permissionAlias } from './permission-aliases';
import { hasRoutePermission } from '../auth/auth.guard';

// گام ۸: ارجاع بین‌ماژولی مجوز با alias؛ در بیلد کامل رفتار همان قبل است (رجیستری واقعی، بی ایمپورت از modules/*)
describe('permission aliases (step 8)', () => {
  it('هر توانایی در بیلد کامل همان کدهای قبلی را می‌دهد', () => {
    expect(getPermissionAliases('manager_approver')).toEqual(['can_act_as_manager']);
    expect(getPermissionAliases('attendance_entry')).toEqual(['view_wh_attendance']);
    expect(getPermissionAliases('attendance_supervisor')).toEqual(['can_act_as_supervisor']);
    expect(getPermissionAliases('count_supervisor_exclusion')).toEqual(['perm_approve_personnel_supervisor']);
    expect(getPermissionAliases('audit_viewer')).toEqual(['view_sys_payroll']);
    expect(getPermissionAliases('no_such_capability')).toEqual([]);
  });

  it('توکن ناشناخته حذف و کد عادی دست‌نخورده می‌ماند', () => {
    expect(expandPermissionAliases(['perm_x', permissionAlias('no_such_capability'), 'perm_x'])).toEqual(['perm_x']);
  });

  it('گارد مسیر توکن‌های alias را باز می‌کند (همان دسترسی‌های پیشین)', () => {
    expect(hasRoutePermission('manager-approvals', ['can_act_as_manager'])).toBe(true);
    expect(hasRoutePermission('attendance', ['view_wh_attendance'])).toBe(true);
    expect(hasRoutePermission('attendance', ['can_act_as_supervisor'])).toBe(true);
    expect(hasRoutePermission('fleet', ['view_wh_attendance'])).toBe(true);
    expect(hasRoutePermission('audit', ['view_sys_payroll'])).toBe(true);
    expect(hasRoutePermission('manager-approvals', ['view_sys_users'])).toBe(false);
  });

  it('سرپرست کارگاه سرپرست شمارش انبار حساب نمی‌شود', () => {
    const personas = getModuleRegistry().getSpec('warehouse')?.personas;
    expect(personas).toBeTruthy();
    const resolve = (perms: string[]) => personas!.resolveRoleCodes({ perms, userRoles: [], permissionAliases: c => getPermissionAliases(c) });
    expect(resolve(['view_sys_supervisor'])).toContain('warehouse_supervisor');
    expect(resolve(['view_sys_supervisor', 'perm_approve_personnel_supervisor'])).not.toContain('warehouse_supervisor');
  });
});
