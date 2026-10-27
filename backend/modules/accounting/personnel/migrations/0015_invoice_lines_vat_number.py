# Plan 4.1 decisions d1, d3, d4 (sub-step 4.1-a): invoice body moves into lines.
# Order matters (no data may be lost):
#   1. new table ExpenseInvoiceLine + new invoice fields (subtotal, discount, VAT, invoice_number_norm,
#      duplicate flag/reason, internal number + IssuedNumber link);
#   2. RunPython: every existing invoice gets exactly one line (qty 1, unit_price = line_amount = amount,
#      head = invoice.expense_head, description = invoice description, with the old category text kept when it
#      is not just the head title); subtotal = amount; invoice_number_norm filled;
#   3. only then invoice.expense_head and invoice.category are dropped and the (counterparty, invoice_number)
#      index is swapped for (counterparty, invoice_number_norm).
# Reverse: the old columns come back and are refilled from each invoice's first line (best effort), then the
# lines table and the new fields are dropped.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

# Frozen copy of personnel.models_domains.treasury_audit.normalize_invoice_number (do not import live code).
_DIGITS = str.maketrans(
    '\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9'
    '\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669',
    '01234567890123456789',
)
_DROP = frozenset(
    '-\u2010\u2011\u2012\u2013\u2014\u2015\u2212\ufe58\ufe63\uff0d'
    '\u0640\u200c\u200d\u200e\u200f\ufeff'
)
BATCH = 500


def _normalize(value):
    if not value:
        return ''
    text = str(value).translate(_DIGITS)
    return ''.join(ch for ch in text if not ch.isspace() and ch not in _DROP)[:100]


def _line_description(description, category, head_title):
    desc = (description or '').strip()
    cat = (category or '').strip()
    if cat and cat != (head_title or '').strip() and cat not in desc:
        return f'{cat} - {desc}' if desc else cat
    return desc or cat or (head_title or '').strip() or '-'


def _immediate_constraints(schema_editor):
    if schema_editor.connection.vendor == 'postgresql':
        # FK checks fire now, not at commit, so the later ALTER TABLE / index ops on the same tables do not
        # hit "pending trigger events" (same as 0014).
        schema_editor.execute('SET CONSTRAINTS ALL IMMEDIATE')


def copy_invoices_into_lines(apps, schema_editor):
    _immediate_constraints(schema_editor)
    Invoice = apps.get_model('personnel', 'ExpenseInvoice')
    Line = apps.get_model('personnel', 'ExpenseInvoiceLine')
    has_line = set(Line.objects.values_list('invoice_id', flat=True).distinct())
    lines = []
    created = 0
    qs = (Invoice.objects.select_related('expense_head').order_by('id')
          .only('id', 'amount', 'category', 'description', 'invoice_number', 'expense_head__title'))
    for inv in qs.iterator(chunk_size=BATCH):
        amount = inv.amount or 0
        Invoice.objects.filter(pk=inv.pk).update(
            subtotal=amount, invoice_number_norm=_normalize(inv.invoice_number))
        if inv.pk in has_line:
            continue
        head = inv.expense_head
        lines.append(Line(
            invoice_id=inv.pk,
            position=1,
            description=_line_description(inv.description, inv.category, head.title if head else ''),
            quantity=1,
            unit='',
            unit_price=amount,
            line_amount=amount,
            expense_head_id=inv.expense_head_id,
        ))
        if len(lines) >= BATCH:
            Line.objects.bulk_create(lines)
            created += len(lines)
            lines = []
    if lines:
        Line.objects.bulk_create(lines)
        created += len(lines)
    if created:
        print(f'\n  personnel 0015: {created} invoice line(s) created from existing invoices.')


def restore_head_and_category(apps, schema_editor):
    _immediate_constraints(schema_editor)
    Invoice = apps.get_model('personnel', 'ExpenseInvoice')
    Line = apps.get_model('personnel', 'ExpenseInvoiceLine')
    first = {}
    for line in (Line.objects.select_related('expense_head').order_by('invoice_id', 'position', 'id')
                 .iterator(chunk_size=BATCH)):
        first.setdefault(line.invoice_id, line)
    for invoice_id, line in first.items():
        head = line.expense_head
        category = (head.title if head else (line.description or ''))[:100]
        Invoice.objects.filter(pk=invoice_id).update(expense_head_id=line.expense_head_id, category=category)


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0008_company_module_switch_and_cleanup'),
        ('numbering', '0001_initial'),
        ('personnel', '0014_petty_cash_company_level'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # 1. expand
        migrations.CreateModel(
            name='ExpenseInvoiceLine',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('position', models.PositiveIntegerField(default=1, verbose_name='ردیف')),
                ('description', models.TextField(verbose_name='شرح ردیف')),
                ('quantity', models.DecimalField(decimal_places=3, default=1, max_digits=12, verbose_name='تعداد / مقدار')),
                ('unit', models.CharField(blank=True, default='', max_length=30, verbose_name='واحد')),
                ('unit_price', models.DecimalField(decimal_places=0, default=0, max_digits=15, verbose_name='فی (ریال)')),
                ('line_amount', models.DecimalField(decimal_places=0, default=0, max_digits=15, verbose_name='مبلغ ردیف (ریال)')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('expense_head', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='invoice_lines', to='personnel.expensehead', verbose_name='سرفصل هزینه (کدینگ)')),
                ('invoice', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lines', to='personnel.expenseinvoice', verbose_name='فاکتور')),
            ],
            options={
                'verbose_name': 'ردیف فاکتور هزینه',
                'verbose_name_plural': 'ردیف‌های فاکتور هزینه',
                'ordering': ['invoice', 'position', 'id'],
            },
        ),
        migrations.AddField(
            model_name='expenseinvoice',
            name='subtotal',
            field=models.DecimalField(decimal_places=0, default=0, max_digits=15, verbose_name='جمع ردیف‌ها (ریال)'),
        ),
        migrations.AddField(
            model_name='expenseinvoice',
            name='discount_amount',
            field=models.DecimalField(decimal_places=0, default=0, max_digits=15, verbose_name='تخفیف (ریال)'),
        ),
        migrations.AddField(
            model_name='expenseinvoice',
            name='vat_applicable',
            field=models.BooleanField(default=False, verbose_name='مشمول مالیات بر ارزش افزوده'),
        ),
        migrations.AddField(
            model_name='expenseinvoice',
            name='vat_rate',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True, verbose_name='نرخ مالیات در لحظهٔ ثبت (درصد)'),
        ),
        migrations.AddField(
            model_name='expenseinvoice',
            name='vat_amount',
            field=models.DecimalField(decimal_places=0, default=0, max_digits=15, verbose_name='مالیات بر ارزش افزوده (ریال)'),
        ),
        migrations.AddField(
            model_name='expenseinvoice',
            name='vat_manual',
            field=models.BooleanField(default=False, verbose_name='مالیات دستی اصلاح شده'),
        ),
        migrations.AddField(
            model_name='expenseinvoice',
            name='invoice_number_norm',
            field=models.CharField(blank=True, default='', max_length=100, verbose_name='شمارهٔ فاکتور یکسان‌شده'),
        ),
        migrations.AddField(
            model_name='expenseinvoice',
            name='possible_duplicate',
            field=models.BooleanField(default=False, verbose_name='احتمال تکراری'),
        ),
        migrations.AddField(
            model_name='expenseinvoice',
            name='duplicate_reason',
            field=models.TextField(blank=True, default='', verbose_name='دلیل ارسال فاکتور تکراری'),
        ),
        migrations.AddField(
            model_name='expenseinvoice',
            name='number',
            field=models.CharField(blank=True, db_index=True, default='', max_length=150, verbose_name='شمارهٔ داخلی فاکتور'),
        ),
        migrations.AddField(
            model_name='expenseinvoice',
            name='issued_number',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='numbering.issuednumber', verbose_name='شمارهٔ صادرشده'),
        ),
        # 2. copy data (head + category survive in the line)
        migrations.RunPython(copy_invoices_into_lines, restore_head_and_category),
        # 3. contract
        migrations.RemoveIndex(
            model_name='expenseinvoice',
            name='personnel_e_counter_73503f_idx',
        ),
        # blank + default first, so the reverse can re-add the NOT NULL column on a non-empty table
        # (Django gives an effective default '' only to blank CharFields).
        migrations.AlterField(
            model_name='expenseinvoice',
            name='category',
            field=models.CharField(blank=True, default='', max_length=100, verbose_name='سرفصل هزینه'),
        ),
        migrations.RemoveField(
            model_name='expenseinvoice',
            name='category',
        ),
        migrations.RemoveField(
            model_name='expenseinvoice',
            name='expense_head',
        ),
        migrations.AddIndex(
            model_name='expenseinvoice',
            index=models.Index(fields=['counterparty', 'invoice_number_norm'], name='personnel_e_counter_f05cf8_idx'),
        ),
    ]
