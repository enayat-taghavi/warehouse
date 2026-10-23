# Dynamic Progress Bar Implementation

This plan details the implementation of a dynamic progress bar for the warehouse monitoring dashboard. Based on our discussion, the progress is calculated using the ratio of counted item rows (SKUs) to the total item rows.

> [!NOTE]
> During research, we discovered that the backend `WarehouseSerializer` already computes and exposes `total_quantity` and `counted_quantity` fields! This means we only need to implement the frontend logic without touching the backend code.

## Proposed Changes

### [MODIFY] [layout.ts](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.ts)
- Add a new getter method `progressStats` that:
  - Checks if the user is in the Warehouse Menu or Main Menu.
  - Aggregates `total_quantity` and `counted_quantity` across all projects (if in Main Menu) or fetches it for the specific warehouse.
  - Calculates the percentage and assigns a color class (`bg-slate-400`, `bg-amber-500`, `bg-indigo-500`, `bg-blue-500`, `bg-emerald-500`) based on the percentage.

### [MODIFY] [layout.html](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.html)
- Bind the header's progress section to the new `progressStats` object.
- Update the progress label to change between "پیشرفت کل پروژه:" and "پیشرفت انبار:".
- Bind the CSS width of the progress bar to the calculated `percent`.
- Apply dynamic background colors (`[ngClass]`) to the bar.
- Add a native `title` attribute to show a tooltip with the exact numbers (e.g., "شمارش شده: X از Y ردیف").

## Verification Plan
### Manual Verification
- Go to the main dashboard. Verify the tooltip shows the aggregate of all warehouses.
- Go to a specific warehouse. Verify the tooltip and percentage reflect only that warehouse.
- Ensure 0% handles gracefully without showing `NaN`.
