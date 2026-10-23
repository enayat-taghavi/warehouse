/**
 * نام سامانه و سازمان در رابط کاربری.
 * deploy.ps1 این فایل را در نسخهٔ build خودش از روی deploy_config.json بازنویسی می‌کند
 * (SystemName، AppShortName و OrganizationName). مقدار خالی یعنی همین مقدار پیش‌فرض بماند.
 */
export const BRANDING = {
  systemName: 'سامانه یکپارچه مدیریت شرکت ها',
  shortName: 'اتوماسیون هوشمند',
  organizationName: '',
} as const;
