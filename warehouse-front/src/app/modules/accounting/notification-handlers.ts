import { HttpContext } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { SKIP_GLOBAL_ERROR_TOAST } from '../../core/error/error.interceptor';
import { NotificationHandler, NotificationNavigationContext } from '../../core/modules/module-contract';

function navigateToFleet(ctx: NotificationNavigationContext, v: any): void {
  const { userPerms: perms, isSuperuser: isSuper, router } = ctx;
  const has = (...codes: string[]) => isSuper || codes.some(c => perms.includes(c));
  const q = v?.plate_number || '';
  switch (v?.approval_status) {
    case 'pending_manager':
      if (has('perm_approve_fleet_manager', 'can_act_as_manager', 'can_act_as_company_manager')) {
        router.navigate(['/app/finance/manager-fleet'], { queryParams: { tab: 'new', q } });
        return;
      }
      break;
    case 'pending_accountant':
      if (has('perm_approve_fleet_finance', 'can_act_as_accountant', 'view_sys_fleet_settlement')) {
        router.navigate(['/app/finance/accountant-fleet'], { queryParams: { tab: 'new', q } });
        return;
      }
      break;
    case 'pending_supervisor':
      if (has('perm_approve_fleet_supervisor', 'can_act_as_workshop_supervisor', 'perm_approve_fleet_manager', 'can_act_as_manager')) {
        router.navigate(['/app/finance/supervisor-fleet'], { queryParams: { tab: 'new', q } });
        return;
      }
      break;
  }
  if (v?.approval_status === 'approved' || v?.approval_status === 'end_collaboration') {
    router.navigate(['/app/finance/employee-fleet'], {
      queryParams: { ...(v?.section ? { section_id: v.section } : {}), search: q || null }
    });
    return;
  }
  router.navigate(['/app/finance/employee-new-vehicle'], {
    queryParams: { ...(v?.section ? { section_id: v.section } : {}), search: q || null, id: v?.id || null }
  });
}

function navigateByRoleForFleet(ctx: NotificationNavigationContext): void {
  const { userPerms: perms, isSuperuser: isSuper, router } = ctx;
  if (isSuper || perms.includes('perm_approve_fleet_manager') || perms.includes('can_act_as_manager')) {
    router.navigate(['/app/finance/manager-fleet']);
  } else if (perms.includes('perm_approve_fleet_finance') || perms.includes('can_act_as_accountant') || perms.includes('view_sys_fleet_settlement')) {
    router.navigate(['/app/finance/accountant-fleet']);
  } else if (perms.includes('perm_approve_fleet_supervisor') || perms.includes('can_act_as_workshop_supervisor')) {
    router.navigate(['/app/finance/supervisor-fleet']);
  } else {
    router.navigate(['/app/finance/employee-new-vehicle']);
  }
}

function navigateToPersonnel(ctx: NotificationNavigationContext, p: any): void {
  const { userPerms: perms, isSuperuser: isSuper, router } = ctx;
  const has = (...codes: string[]) => isSuper || codes.some(c => perms.includes(c));
  const q = p?.national_code || '';
  switch (p?.approval_status) {
    case 'pending_manager':
      if (has('perm_approve_personnel_manager', 'can_act_as_manager', 'can_act_as_company_manager')) {
        router.navigate(['/app/finance/manager-personnel'], { queryParams: { tab: 'new', q } });
        return;
      }
      break;
    case 'pending_accountant':
      if (has('perm_approve_personnel_finance')) {
        router.navigate(['/app/finance/accountant-personnel'], { queryParams: { tab: 'new', q } });
        return;
      }
      break;
    case 'pending_supervisor':
      if (has('perm_approve_personnel_supervisor', 'can_act_as_workshop_supervisor', 'perm_approve_personnel_manager', 'can_act_as_manager')) {
        router.navigate(['/app/finance/supervisor-personnel'], { queryParams: { tab: 'new', q } });
        return;
      }
      break;
  }
  // پیش‌نویس، عودت‌شده، مصوب یا ردشده: صفحهٔ بخش پرونده
  router.navigate(['/app/finance/employee-new-personnel'], {
    queryParams: { ...(p?.section ? { section_id: p.section } : {}), search: q || null }
  });
}

function navigateByRole(ctx: NotificationNavigationContext): void {
  const { userPerms: perms, isSuperuser: isSuper, router } = ctx;
  if (isSuper || perms.includes('perm_approve_personnel_manager') || perms.includes('can_act_as_manager')) {
    router.navigate(['/app/finance/manager-personnel']);
  } else if (perms.includes('perm_approve_personnel_finance')) {
    router.navigate(['/app/finance/accountant-personnel']);
  } else if (perms.includes('perm_approve_personnel_supervisor') || perms.includes('can_act_as_workshop_supervisor')) {
    router.navigate(['/app/finance/supervisor-personnel']);
  } else {
    router.navigate(['/app/finance/employee-new-personnel']);
  }
}

export const ACCOUNTING_NOTIFICATION_HANDLERS: NotificationHandler[] = [
  // ناوبری هوشمند درخواست‌های تغییرات ناوگان (تسک ۱۱.۲۱ و ن-۱۰)
  {
    canHandle: (item: any) => item?.notification_type === 'fleet_change_request',
    navigate: (ctx: NotificationNavigationContext) => {
      const { userPerms: perms, isSuperuser: isSuper, router } = ctx;
      if (isSuper || perms.includes('perm_approve_fleet_manager') || perms.includes('can_act_as_manager')) {
        router.navigate(['/app/finance/manager-fleet'], { queryParams: { tab: 'changes' } });
      } else if (perms.includes('perm_approve_fleet_finance') || perms.includes('can_act_as_accountant') || perms.includes('view_sys_fleet_settlement')) {
        router.navigate(['/app/finance/accountant-fleet'], { queryParams: { tab: 'changes' } });
      } else if (perms.includes('perm_approve_fleet_supervisor') || perms.includes('can_act_as_workshop_supervisor')) {
        router.navigate(['/app/finance/supervisor-fleet'], { queryParams: { tab: 'changes' } });
      } else {
        router.navigate(['/app/finance/employee-new-vehicle']);
      }
    }
  },

  // ناوبری هوشمند برای پرونده‌های ناوگان و رانندگان (تسک ۴.۱ و ۴.۲)
  {
    canHandle: (item: any) => item?.target_model === 'VehicleDriverProfile',
    navigate: (ctx: NotificationNavigationContext) => {
      const targetId = Number(ctx.item?.target_id);
      if (!ctx.item?.target_id || !Number.isInteger(targetId) || targetId <= 0) {
        navigateByRoleForFleet(ctx);
        return;
      }
      const context = new HttpContext().set(SKIP_GLOBAL_ERROR_TOAST, true);
      ctx.http.get<any>(`${environment.apiUrl}/personnel/vehicles/${targetId}/`, { context }).subscribe({
        next: (v) => navigateToFleet(ctx, v),
        error: () => navigateByRoleForFleet(ctx)
      });
    }
  },

  // ناوبری هوشمند بر اساس مدل هدف و شناسهٔ آن: پرونده پرسنلی (تسک ۴.۴، تصمیم ۶.۷ و DEF-12)
  {
    canHandle: (item: any) => item?.target_model === 'PersonnelProfile',
    navigate: (ctx: NotificationNavigationContext) => {
      const targetId = Number(ctx.item?.target_id);
      if (!ctx.item?.target_id || !Number.isInteger(targetId) || targetId <= 0) {
        navigateByRole(ctx);
        return;
      }
      const context = new HttpContext().set(SKIP_GLOBAL_ERROR_TOAST, true);
      ctx.http.get<any>(`${environment.apiUrl}/personnel/profiles/${targetId}/`, { context }).subscribe({
        next: (p) => navigateToPersonnel(ctx, p),
        error: () => navigateByRole(ctx)
      });
    }
  }
];
