# Plan 3.1 s7, step 2: every Counterparty gets an ExternalParty in its own company, and a primary
# PartyBankAccount when it had a sheba. Counterparty ids never change, so offline-queue records that
# carry a counterparty id stay valid. A global (company-less) counterparty keeps its row for the first
# company that used it; each other company gets its own copy with that company's invoices and petty-cash
# rows repointed; an unused global counterparty is deleted (rule q2: current data has no value).
# Reverse is a noop (q2).
from django.db import migrations

_FA_DIGITS = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')


def _digits(value):
    return ''.join(ch for ch in str(value or '').translate(_FA_DIGITS) if ch.isdigit())


def _normalize_sheba(value):
    digits = _digits(value)
    if len(digits) == 24:
        return 'IR' + digits
    return str(value or '').strip().upper()[:34]


def _usage_companies(cp_id, ExpenseInvoice, PettyCashTransaction):
    """Companies that used the counterparty, in order of first use."""
    first_use = {}
    for model in (ExpenseInvoice, PettyCashTransaction):
        rows = model.objects.filter(counterparty_id=cp_id).values_list('section__project__company_id', 'created_at')
        for company_id, created_at in rows:
            if company_id is None:
                continue
            if company_id not in first_use or created_at < first_use[company_id]:
                first_use[company_id] = created_at
    return sorted(first_use, key=lambda cid: (first_use[cid], cid))


def _attach_party(cp, company_id, ExternalParty, PartyBankAccount, used_ids):
    notes = []
    raw_id = (cp.national_id or '').strip()
    national_id = _digits(raw_id) or None
    if national_id and (len(national_id) not in (10, 11) or national_id != raw_id.translate(_FA_DIGITS).strip()
                        or (company_id, national_id) in used_ids):
        notes.append(f'national_id: {raw_id}')
        national_id = None
    if national_id:
        used_ids.add((company_id, national_id))
    kind = 'legal' if national_id and len(national_id) == 11 else 'person'
    sheba = _normalize_sheba(cp.sheba_number) if cp.sheba_number else ''
    if not sheba and (cp.bank_name or cp.account_number):
        notes.append(f'bank: {cp.bank_name or ""} {cp.account_number or ""}'.strip())
    party = ExternalParty.objects.create(
        company_id=company_id, kind=kind, name=cp.name, national_id=national_id,
        phone=(cp.phone or '').strip(), notes='\n'.join(notes), is_active=cp.is_active,
    )
    cp.party_id = party.id
    cp.save(update_fields=['party'])
    if sheba:
        PartyBankAccount.objects.create(
            party_id=party.id, bank_name=cp.bank_name or '', account_number=cp.account_number or '',
            sheba_number=sheba, is_primary=True, is_active=True,
        )


def forwards(apps, schema_editor):
    Counterparty = apps.get_model('personnel', 'Counterparty')
    ExpenseInvoice = apps.get_model('personnel', 'ExpenseInvoice')
    PettyCashTransaction = apps.get_model('personnel', 'PettyCashTransaction')
    ExternalParty = apps.get_model('contacts', 'ExternalParty')
    PartyBankAccount = apps.get_model('personnel', 'PartyBankAccount')
    used_ids = set()

    for cp in list(Counterparty.objects.filter(party__isnull=True).order_by('id')):
        if cp.company_id:
            _attach_party(cp, cp.company_id, ExternalParty, PartyBankAccount, used_ids)
            continue
        companies = _usage_companies(cp.id, ExpenseInvoice, PettyCashTransaction)
        if not companies:
            cp.delete()
            continue
        first, *others = companies
        for company_id in others:
            copy = Counterparty.objects.create(
                company_id=company_id, name=cp.name, counterparty_type=cp.counterparty_type,
                national_id=cp.national_id, phone=cp.phone, bank_name=cp.bank_name,
                account_number=cp.account_number, sheba_number=cp.sheba_number,
                account_code=cp.account_code, is_active=cp.is_active,
            )
            for model in (ExpenseInvoice, PettyCashTransaction):
                model.objects.filter(counterparty_id=cp.id, section__project__company_id=company_id).update(
                    counterparty_id=copy.id)
            _attach_party(copy, company_id, ExternalParty, PartyBankAccount, used_ids)
        cp.company_id = first
        cp.save(update_fields=['company'])
        _attach_party(cp, first, ExternalParty, PartyBankAccount, used_ids)


class Migration(migrations.Migration):

    dependencies = [
        ('contacts', '0001_initial'),
        ('personnel', '0007_counterparty_party_expand'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
