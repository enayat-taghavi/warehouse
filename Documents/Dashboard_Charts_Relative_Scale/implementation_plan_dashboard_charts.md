# Dashboard Charts Relative Scale

Based on your feedback, all progress bars and charts in the dashboards (both overall and warehouse-specific) will now use the **Total Records** (کل ردیف‌ها) as their scale denominator, rather than scaling relative to the busiest day of the week.

> [!IMPORTANT]
> This means that if a warehouse has 10,000 items and 100 items were counted today, the daily chart bar will only fill up **1%**, visually showing how much of the *entire* warehouse was processed today. This accurately reflects absolute progress but will make the daily bars appear much smaller than before. (A minimum width/height of 4% is kept so the bar remains visible).

## Proposed Changes

### [MODIFY] [dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/dashboard/dashboard.ts)
- Update the `getHeight` function to use `this.overallStats.total` as the denominator instead of `this.overallMax`.
- Add a fallback to `1` to avoid division by zero.
- Ensure tooltips dynamically display the exact ratio.

### [MODIFY] [dashboard.html](file:///e:/warehouse%20project/frontend/src/app/components/dashboard/dashboard.html)
- Add hover titles (`title="..."`) to the horizontal progress bars for Today, Yesterday, and Last Week, displaying the ratio of "counted out of total", to provide exact context for the shorter bars.

## Verification Plan
### Manual Verification
- Check the dashboard charts. The bars should visually represent the proportion of the day's work compared to the entire project's size.
- Hovering over a bar should display the exact count compared to the total.
