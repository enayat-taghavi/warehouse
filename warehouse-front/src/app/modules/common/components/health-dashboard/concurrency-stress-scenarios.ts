/**
 * مقادیر سناریوی API تست بار هم‌زمانی (`/api/accounts/concurrency-stress-test/`)؛ ابزار توسعه.
 * همان مقادیری که `accounts/concurrency_stress_service.py` می‌پذیرد.
 */
export const STRESS_SCENARIOS = {
  combined: 'combined',
  treasury: 'treasury',
  warehouseOnly: 'warehouse',
} as const;
