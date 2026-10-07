# -*- coding: utf-8 -*-
"""
DBF Diskette Generator for Iranian Social Security Organization (Tamin Ejtemaei).
Generates `DSKWOR00.DBF` and `DSKKAR00.DBF` in exact binary dBase III/IV format with IranSystem encoding.
"""
import os
import struct
import datetime
from django.conf import settings
from .iransystem import to_iransystem_bytes, encode_dbf_string, encode_dbf_number


def _get_raw_template_bytes(filename: str) -> bytes:
    """Reads raw empty template header from package's data folder or fallback paths."""
    pkg_dir = os.path.join(os.path.dirname(__file__), 'data', 'insurance_templates')
    base_dirs = [
        pkg_dir,
        os.path.join(settings.BASE_DIR, 'personnel', 'data', 'insurance_templates'),
        os.path.join(settings.BASE_DIR, '..', 'Documents', 'SalaryCalculation', 'فایل خام بیمه'),
        os.path.join(settings.BASE_DIR, '..', 'فایل خام بیمه'),
        os.path.join(settings.BASE_DIR, 'فایل خام بیمه'),
    ]
    for d in base_dirs:
        p = os.path.join(d, filename)
        if os.path.exists(p):
            with open(p, 'rb') as f:
                return f.read()
    raise FileNotFoundError(f"Raw template {filename} not found in {base_dirs}")


def generate_dskkar_bytes(
    workshop_settings,
    fiscal_year_short: int,
    month_num: int,
    list_number: str,
    list_description: str,
    records_count: int,
    sum_insurance_days: int,
    sum_daily_wage: int,
    sum_base_salary: int,
    sum_insurable_allowances: int,
    sum_insurable_total: int,
    sum_gross_salary: int,
    sum_employee_insurance: int,
    sum_employer_insurance: int,
    sum_unemployment_insurance: int,
    sum_seniority: int,
    sum_spouse_allowance: int
) -> bytes:
    """
    Generates binary content for `DSKKAR00.DBF` (Workshop Summary).
    """
    raw_template = _get_raw_template_bytes('DSKKAR00.DBF')
    # Header is 833 bytes (including 0x0D field terminator)
    header_bytes = bytearray(raw_template[:833])
    
    # Update header: 1 record, today's date
    now = datetime.datetime.now()
    header_bytes[1] = now.year % 100
    header_bytes[2] = now.month
    header_bytes[3] = now.day
    struct.pack_into('<I', header_bytes, 4, 1) # 1 record

    # Build the 311-byte record (1 delete byte + 310 data bytes)
    rec = bytearray(b' ') # Valid record (not deleted)
    
    # 1. DSK_ID (C 10)
    rec.extend(encode_dbf_string(workshop_settings.workshop_code, 10, is_persian=False))
    # 2. DSK_NAME (C 30) - IranSystem
    rec.extend(encode_dbf_string(workshop_settings.workshop_name, 30, is_persian=True))
    # 3. DSK_FARM (C 30) - IranSystem
    rec.extend(encode_dbf_string(workshop_settings.employer_name, 30, is_persian=True))
    # 4. DSK_ADRS (C 40) - IranSystem
    rec.extend(encode_dbf_string(workshop_settings.workshop_address, 40, is_persian=True))
    # 5. DSK_KIND (N 1)
    rec.extend(encode_dbf_number(workshop_settings.list_type or 0, 1))
    # 6. DSK_YY (N 2)
    rec.extend(encode_dbf_number(fiscal_year_short, 2))
    # 7. DSK_MM (N 2)
    rec.extend(encode_dbf_number(month_num, 2))
    # 8. DSK_LISTNO (C 12)
    rec.extend(encode_dbf_string(list_number or '01', 12, is_persian=False))
    # 9. DSK_DISC (C 30) - IranSystem
    rec.extend(encode_dbf_string(list_description, 30, is_persian=True))
    # 10. DSK_NUM (N 5)
    rec.extend(encode_dbf_number(records_count, 5))
    # 11. DSK_TDD (N 6)
    rec.extend(encode_dbf_number(sum_insurance_days, 6))
    # 12. DSK_TROOZ (N 12)
    rec.extend(encode_dbf_number(sum_daily_wage, 12))
    # 13. DSK_TMAH (N 12)
    rec.extend(encode_dbf_number(sum_base_salary, 12))
    # 14. DSK_TMAZ (N 12)
    rec.extend(encode_dbf_number(sum_insurable_allowances, 12))
    # 15. DSK_TMASH (N 12)
    rec.extend(encode_dbf_number(sum_insurable_total, 12))
    # 16. DSK_TTOTL (N 12)
    rec.extend(encode_dbf_number(sum_gross_salary, 12))
    # 17. DSK_TBIME (N 12)
    rec.extend(encode_dbf_number(sum_employee_insurance, 12))
    # 18. DSK_TKOSO (N 12)
    rec.extend(encode_dbf_number(sum_employer_insurance, 12))
    # 19. DSK_BIC (N 12)
    rec.extend(encode_dbf_number(sum_unemployment_insurance, 12))
    # 20. DSK_RATE (N 5)
    rec.extend(encode_dbf_number(workshop_settings.default_dsk_rate or 27, 5))
    # 21. DSK_PRATE (N 2)
    rec.extend(encode_dbf_number(0, 2))
    # 22. DSK_BIMH (N 12)
    rec.extend(encode_dbf_number(0, 12))
    # 23. MON_PYM (C 3)
    rec.extend(encode_dbf_string(workshop_settings.default_mon_pym or '024', 3, is_persian=False))
    # 24. DSK_INC (N 12)
    rec.extend(encode_dbf_number(sum_seniority, 12))
    # 25. DSK_SPOUSE (N 12)
    rec.extend(encode_dbf_number(sum_spouse_allowance, 12))

    assert len(rec) == 311, f"Expected DSKKAR record len 311, got {len(rec)}"
    
    return bytes(header_bytes) + bytes(rec) + b'\x1A'


def generate_dskwor_bytes(
    workshop_code: str,
    fiscal_year_short: int,
    month_num: int,
    list_number: str,
    payroll_records
) -> bytes:
    """
    Generates binary content for `DSKWOR00.DBF` (Individual Insured Employees).
    """
    raw_template = _get_raw_template_bytes('DSKWOR00.DBF')
    # Header is 961 bytes (including 0x0D field terminator)
    header_bytes = bytearray(raw_template[:961])
    
    # Filter only insured records (`include_in_insurance == True`)
    insured_records = [r for r in payroll_records if getattr(r, 'include_in_insurance', True)]
    num_recs = len(insured_records)

    # Update header
    now = datetime.datetime.now()
    header_bytes[1] = now.year % 100
    header_bytes[2] = now.month
    header_bytes[3] = now.day
    struct.pack_into('<I', header_bytes, 4, num_recs)

    body = bytearray()
    for rec in insured_records:
        p = rec.personnel
        r_bytes = bytearray(b' ') # Valid record delete flag

        # 1. DSW_ID (C 10)
        r_bytes.extend(encode_dbf_string(workshop_code, 10, is_persian=False))
        # 2. DSW_YY (N 2)
        r_bytes.extend(encode_dbf_number(fiscal_year_short, 2))
        # 3. DSW_MM (N 2)
        r_bytes.extend(encode_dbf_number(month_num, 2))
        # 4. DSW_LISTNO (C 12)
        r_bytes.extend(encode_dbf_string(list_number or '01', 12, is_persian=False))
        # 5. DSW_ID1 (C 8) - Insurance Number
        ins_num = (p.insurance_number or '').strip()
        r_bytes.extend(encode_dbf_string(ins_num, 8, is_persian=False))
        # 6. DSW_FNAME (C 60) - IranSystem First Name
        r_bytes.extend(encode_dbf_string(p.first_name, 60, is_persian=True))
        # 7. DSW_LNAME (C 60) - IranSystem Last Name
        r_bytes.extend(encode_dbf_string(p.last_name, 60, is_persian=True))
        # 8. DSW_DNAME (C 60) - IranSystem Father Name
        r_bytes.extend(encode_dbf_string(p.father_name or '', 60, is_persian=True))
        # 9. DSW_IDNO (C 15) - ID Number
        r_bytes.extend(encode_dbf_string(p.id_number or p.national_code, 15, is_persian=False))
        # 10. DSW_IDPLC (C 30) - IranSystem Issue Place
        r_bytes.extend(encode_dbf_string(p.issue_place or p.birth_place or '', 30, is_persian=True))
        # 11. DSW_IDATE (C 8) - Issue Date
        r_bytes.extend(encode_dbf_string(p.issue_date or '0', 8, is_persian=False))
        # 12. DSW_BDATE (C 8) - Birth Date
        r_bytes.extend(encode_dbf_string(p.birth_date or '0', 8, is_persian=False))
        # 13. DSW_SEX (C 3) - IranSystem Gender
        gender_text = 'مرد' if p.gender in ('مرد', 'male', '1') else 'زن'
        r_bytes.extend(encode_dbf_string(gender_text, 3, is_persian=True))
        # 14. DSW_NAT (C 10) - IranSystem Nationality
        r_bytes.extend(encode_dbf_string('ایرانی', 10, is_persian=True))
        # 15. DSW_OCP (C 50) - IranSystem Job Title
        r_bytes.extend(encode_dbf_string(p.job_title or '', 50, is_persian=True))
        # 16. DSW_SDATE (C 8) - Start Date
        start_d = (p.start_date or '14040901').replace('/', '').replace('-', '').strip()[:8]
        r_bytes.extend(encode_dbf_string(start_d, 8, is_persian=False))
        # 17. DSW_EDATE (C 8) - End Date
        end_d = (p.end_date or '0').replace('/', '').replace('-', '').strip()[:8]
        r_bytes.extend(encode_dbf_string(end_d, 8, is_persian=False))
        # 18. DSW_DD (N 2) - Insurance Days
        r_bytes.extend(encode_dbf_number(rec.insurance_days, 2))
        # 19. DSW_ROOZ (N 12) - Daily Base Wage
        r_bytes.extend(encode_dbf_number(rec.daily_wage, 12))
        # 20. DSW_MAH (N 12) - Base Salary (حقوق پایه)
        r_bytes.extend(encode_dbf_number(rec.base_salary, 12))
        # 21. DSW_MAZ (N 12) - Insurable Allowances (مزایا مشمول)
        r_bytes.extend(encode_dbf_number(rec.total_taxable_allowances, 12))
        # 22. DSW_MASH (N 12) - Insurable Total (جمع حقوق و مزایا مشمول بیمه)
        r_bytes.extend(encode_dbf_number(rec.total_insurable_salary_allowances, 12))
        # 23. DSW_TOTL (N 12) - Gross Salary (حقوق ناخالص)
        r_bytes.extend(encode_dbf_number(rec.gross_salary, 12))
        # 24. DSW_BIME (N 12) - Employee Insurance (بیمه سهم کارگر ۷٪)
        r_bytes.extend(encode_dbf_number(rec.worker_insurance, 12))
        # 25. DSW_PRATE (N 2) - 0
        r_bytes.extend(encode_dbf_number(0, 2))
        # 26. DSW_JOB (C 6) - 6 digit Job Code
        job_code = (p.job_code or '000255').strip().zfill(6)
        r_bytes.extend(encode_dbf_string(job_code, 6, is_persian=False))
        # 27. PER_NATCOD (C 10) - National Code 10 digits
        r_bytes.extend(encode_dbf_string(p.national_code, 10, is_persian=False))
        # 28. DSW_INC (N 12) - Accumulated Seniority (جمع پایه سنواتی)
        r_bytes.extend(encode_dbf_number(rec.total_seniority_accumulated, 12))
        # 29. DSW_SPOUSE (C 10) - Marital Allowance
        spouse_val = str(int(rec.marital_allowance)) if rec.marital_allowance > 0 else '0'
        r_bytes.extend(encode_dbf_string(spouse_val, 10, is_persian=False))

        assert len(r_bytes) == 469, f"Expected DSKWOR record len 469, got {len(r_bytes)}"
        body.extend(r_bytes)

    return bytes(header_bytes) + bytes(body) + b'\x1A'
