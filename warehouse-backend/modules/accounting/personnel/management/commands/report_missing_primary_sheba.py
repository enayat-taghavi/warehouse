import os
import sys
from pathlib import Path
from django.core.management.base import BaseCommand

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

from personnel.lifecycle_services import (
    get_personnel_missing_primary_sheba,
    generate_missing_primary_sheba_excel,
)


class Command(BaseCommand):
    help = "DEF-23: تولید گزارش اکسل فقط‌خواندنی پرونده‌های دارای حساب اصلی بدون شبای معتبر (Mod 97)"

    def add_arguments(self, parser):
        parser.add_argument(
            '--output',
            type=str,
            default=None,
            help='مسیر ذخیره فایل اکسل خروجی (پیش‌فرض: scratch/missing_primary_sheba_report.xlsx)'
        )

    def handle(self, *args, **options):
        self.stdout.write("در حال واکشی اطلاعات پرونده‌های پرسنل با حساب اصلی فاقد شبا...")

        records = get_personnel_missing_primary_sheba()
        total_count = len(records)
        active_count = sum(1 for r in records if r.get('is_active'))
        approved_count = sum(1 for r in records if r.get('approval_status') == 'approved')

        self.stdout.write(
            self.style.SUCCESS(
                f"تعداد {total_count} پرونده با حساب اصلی فاقد شبای معتبر شناسایی شد "
                f"(فعال: {active_count}، مصوب: {approved_count})."
            )
        )

        excel_bytes = generate_missing_primary_sheba_excel()

        out_path = options.get('output')
        if not out_path:
            # ذخیره در پوشه scratch ریشه پروژه
            root_dir = Path(__file__).resolve().parents[4]
            scratch_dir = root_dir / 'scratch'
            scratch_dir.mkdir(parents=True, exist_ok=True)
            out_path = str(scratch_dir / 'missing_primary_sheba_report.xlsx')

        with open(out_path, 'wb') as f:
            f.write(excel_bytes)

        self.stdout.write(
            self.style.SUCCESS(
                f"فایل اکسل گزارش با موفقیت در مسیر زیر ایجاد شد:\n{out_path}"
            )
        )
