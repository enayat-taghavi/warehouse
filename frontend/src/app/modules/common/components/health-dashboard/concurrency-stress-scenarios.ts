/**
 * مقادیر سناریوی API تست بار هم‌زمانی (`/api/accounts/concurrency-stress-test/`)؛ ابزار توسعه.
 * مقدار ترکیبی همان است که `accounts/concurrency_stress_service.py` می‌پذیرد.
 */
export const STRESS_SCENARIOS = {
  combined: 'combined',
} as const;

// سناریوی تک‌ماژولی هر ماژول (مثل خزانه‌داری یا انبارداری) را خود ماژول در healthDashboard.panel.stressScenario اعلام می‌کند.
