"""
گزارش فقط‌خواندنی پیش از انتشار طرح نبودن نفر (بند ۷ و ۸): برای هر شرکت فعال و هر گردش با کار باز، چند سند با
تنظیم مؤثر فعلی جلو می‌رود، چند کار منتظر می‌شود یا منتظر است، و سندهای باز مدیر کل. هیچ چیز نمی‌نویسد.
"""
from django.core.management.base import BaseCommand, CommandError

from workflow.policy_admin import policy_report, step_workflows


class Command(BaseCommand):
    help = 'گزارش فقط‌خواندنی اثر تنظیم «نبودن نفر در مرحله» روی سندهای باز هر شرکت'

    def add_arguments(self, parser):
        parser.add_argument('--company', type=int, action='append', dest='companies',
                            help='فقط این شرکت (تکرارپذیر)')
        parser.add_argument('--workflow', action='append', dest='workflows',
                            help='فقط این گردش (تکرارپذیر)')

    def _log(self, msg):
        try:
            self.stdout.write(msg)
        except Exception:
            self.stdout.write(msg.encode('ascii', errors='replace').decode('ascii'))

    def handle(self, *args, **options):
        unknown = sorted(set(options.get('workflows') or ()) - set(step_workflows()))
        if unknown:
            raise CommandError(f'Unknown workflow keys: {", ".join(unknown)}')
        rows = policy_report(company_ids=options.get('companies'), workflow_keys=options.get('workflows'))
        self._log(f'=== Workflow policy report (read-only): {len(rows)} companies with open tasks ===')
        totals = {'advance': 0, 'waiting': 0, 'recipients_changed': 0, 'waiting_now': 0}
        for row in rows:
            self._log(f"company #{row['company_id']} {row['company']}: "
                      f"superuser_created_open={row['superuser_created_open']} "
                      f"superuser_only_tasks={row['superuser_only_tasks']}")
            for key, counts in sorted(row['workflows'].items()):
                self._log(f"  {key}: would_advance={counts['advance']} would_wait={counts['waiting']} "
                          f"recipients_changed={counts['recipients_changed']} waiting_now={counts['waiting_now']}")
                for name in totals:
                    totals[name] += counts[name]
        self._log(f"TOTAL would_advance={totals['advance']} would_wait={totals['waiting']} "
                  f"recipients_changed={totals['recipients_changed']} waiting_now={totals['waiting_now']}")
