from django.core.management.base import BaseCommand
from personnel.models import (
    PayrollYearlySettings,
    JobGradeTier,
    WorkshopInsuranceSettings,
    TaxRuleSettings,
    BankExportSettings
)

class Command(BaseCommand):
    help = 'Seed default payroll yearly settings for 1405 from reference Excel'

    def handle(self, *args, **options):
        # 1. Create or get Yearly Settings 1405
        settings_1405, created = PayrollYearlySettings.objects.get_or_create(
            fiscal_year='1405',
            effective_from='1405/01',
            project=None,
            defaults={
                'title': 'تنظیمات پایه و قانون کار سال ۱۴۰۵',
                'version_title': 'احکام مصوب فروردین ۱۴۰۵',
                'is_active': True,
                'monthly_food_allowance': 22000000,
                'monthly_housing_allowance': 30000000,
                'monthly_spouse_allowance': 5000000,
                'monthly_child_allowance': 16625549,
                'shift_percent': 0.00,
                'transport_help_percent': 0.00,
                'transport_fixed_amount': 2388728,
                'specialist_attraction_percent': 0.00,
                'bad_weather_percent': 0.00,
                'remote_hardship_percent': 0.00,
                'south_pars_percent': 0.00,
                'travel_cost_per_day': 8736600,
                'worker_insurance_rate': 7.00,
                'employer_insurance_rate': 20.00,
                'unemployment_insurance_rate': 3.00,
            }
        )

        # 2. Table7 (20 Job Grades)
        job_grades_data = [
            (1, 5541850, 166667),
            (2, 5568282, 166867),
            (3, 5594714, 167067),
            (4, 5621146, 167267),
            (5, 5656388, 167467),
            (6, 5691631, 167667),
            (7, 5726874, 167867),
            (8, 5770927, 168067),
            (9, 5814980, 168267),
            (10, 5867844, 168467),
            (11, 5920708, 168667),
            (12, 5973572, 169067),
            (13, 6044057, 169467),
            (14, 6114542, 169867),
            (15, 6185027, 170267),
            (16, 6273134, 170667),
            (17, 6361240, 171067),
            (18, 6466968, 171467),
            (19, 6572696, 171867),
            (20, 6704856, 172267),
        ]

        for grade, wage, seniority in job_grades_data:
            JobGradeTier.objects.update_or_create(
                yearly_settings=settings_1405,
                grade_number=grade,
                defaults={
                    'daily_base_wage': wage,
                    'daily_seniority_bonus': seniority,
                }
            )

        # 3. Workshop Insurance Settings
        WorkshopInsuranceSettings.objects.get_or_create(
            yearly_settings=settings_1405,
            defaults={
                'workshop_code': '4894290013',
                'workshop_name': 'دفترشركت فارس عاليش',
                'employer_name': 'شرکت نفت و گاز پارس',
                'workshop_address': 'بوشهر شهرستان عسلویه',
                'list_type': '0',
                'list_number': '01',
                'default_dsk_rate': 27.00,
                'default_mon_pym': '024',
            }
        )

        # 4. Tax Rule Settings
        TaxRuleSettings.objects.get_or_create(
            yearly_settings=settings_1405,
            defaults={
                'payment_type': '1',
                'service_location': '1',
                'exceptions': '1',
                'currency_type': '84',
                'currency_exchange_rate': 1.00,
                'housing_benefit_type': '1',
                'vehicle_benefit_type': '1',
                'wh_file_prefix': 'WH',
                'wp_file_prefix': 'WP',
            }
        )

        # 5. Bank Export Settings
        BankExportSettings.objects.get_or_create(
            yearly_settings=settings_1405,
            defaults={
                'bank_name': 'بانک ملی',
                'source_account_number': '',
                'default_deposit_id': '',
                'deposit_description_template': 'انبارداری حقوق {month_name} {fiscal_year}',
            }
        )

        self.stdout.write(self.style.SUCCESS('Successfully seeded 1405 Payroll Settings, 20 Job Grades, Workshop, Tax and Bank configurations.'))
