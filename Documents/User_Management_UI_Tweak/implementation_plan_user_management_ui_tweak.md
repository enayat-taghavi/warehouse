# User Management UI Tweak

This plan addresses minor UI adjustments in the User Management system:
1. Renaming the page title in the sidebar navigation from "کاربران وگیت پاس" to "کاربران و نقش ها".
2. Replacing the native Windows `confirm()` message box with the application's `ConfirmDialogService` custom modal for resetting user passwords.

## Proposed Changes

### Navigation (Sidebar)

#### [MODIFY] [layout.ts](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.ts)
- Change the `label` for the `users` route in `SYSTEM_NAV_ITEMS` from "کاربران و گیت‌پاس" to "کاربران و نقش ها".

### Users Component

#### [MODIFY] [users.ts](file:///e:/warehouse%20project/frontend/src/app/components/users/users.ts)
- Inject `ConfirmDialogService` into the `Users` component.
- Refactor the `resetPassword(id: number)` method to be `async` and use `await this.confirmDialog.open({...})` instead of the native `confirm()` dialog.

## Verification Plan
### Manual Verification
- Verify the sidebar displays the new title "کاربران و نقش ها".
- Trigger a password reset from the users' list and verify that the custom modal is displayed.
- Confirm the reset to ensure the API call is successfully dispatched.
