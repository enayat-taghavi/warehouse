"""
اعمال تنظیم مؤثر «نبودن نفر در مرحله» روی کارهای باز (طرح نبودن نفر بند ۷): همان recompute_open_tasks که پس از
ذخیرهٔ تنظیم اجرا می‌شود، برای شرکت‌ها و گردش‌های انتخاب‌شده. --dry-run فقط گزارش workflow_policy_report است.
"""
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

from workflow.policy_admin import step_workflows
from workflow.recompute import recompute_open_tasks


class Command(BaseCommand):
    help = 'محاسبهٔ دوبارهٔ کارهای باز با تنظیم مؤثر فعلی (رد شدن، انتظار و دریافت‌کنندگان تازه)'

    def add_arguments(self, parser):
        parser.add_argument('--company', type=int, action='append', dest='companies',
                            help='فقط این شرکت (تکرارپذیر)')
        parser.add_argument('--workflow', action='append', dest='workflows',
                            help='فقط این گردش (تکرارپذیر)')
        parser.add_argument('--all-companies', action='store_true',
                            help='همهٔ شرکت‌ها (بدون --company لازم است)')
        parser.add_argument('--dry-run', action='store_true', help='فقط گزارش، بی هیچ نوشتن')

    def handle(self, *args, **options):
        companies = options.get('companies') or []
        workflows = options.get('workflows') or None
        if not companies and not options['all_companies']:
            raise CommandError('Pass --company <id> (repeatable) or --all-companies.')
        if companies and options['all_companies']:
            raise CommandError('Pass either --company or --all-companies, not both.')
        if workflows:
            unknown = sorted(set(workflows) - set(step_workflows()))
            if unknown:
                raise CommandError(f'Unknown workflow keys: {", ".join(unknown)}')
        if options['dry_run']:
            kwargs = {'companies': companies or None, 'workflows': workflows, 'stdout': self.stdout}
            call_command('workflow_policy_report', **kwargs)
            return
        keys = workflows or sorted(step_workflows())
        if companies:
            stats = recompute_open_tasks(company_ids=companies, workflow_keys=keys)
        else:
            stats = recompute_open_tasks(all_tasks=True, workflow_keys=keys)
        self.stdout.write('=== apply_workflow_policies: ' + ' '.join(f'{k}={v}' for k, v in sorted(stats.items())))
