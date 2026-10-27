"""
چاپ / PDF صورت‌حساب تنخواه (د۱۳ طرح ۴.۲) با قلاب `printable:petty_cash_statement` (الگوی چاپ فاکتور ۴.۱).

API هسته پیش از این قلاب `can_view` همان صورت‌حساب را می‌سنجد (تنخواه‌گردان، جانشین فعال، بیننده‌های سطح شرکت
یا کار باز گردش)؛ نادیدنی = 404. کارت و شبا در چاپ نمی‌آید.
"""
from decimal import Decimal

from .workflows import PETTY_STATEMENT_WORKFLOW, PETTY_STATEMENT_WORKFLOW_SPEC


def _money(value) -> str:
    from reports.document_pdf import fa_digits
    return fa_digits(f'{Decimal(str(value or 0)):,.0f}') + ' ریال'


def _name(user):
    if user is None:
        return ''
    return f'{user.first_name} {user.last_name}'.strip() or user.username


def _signers(statement):
    """فرستنده (ارسال) و اقدام‌کنندگان هر مرحله از سابقهٔ گردش همین صورت‌حساب؛ بی گردش فقط ثبت‌کننده."""
    from reports.document_pdf import Signer
    from workflow import engine as wf_engine
    from workflow.models import WorkflowStep
    signers = []
    instance = wf_engine.instance_of(PETTY_STATEMENT_WORKFLOW, statement.pk)
    if instance is None:
        if statement.created_by is not None:
            signers.append(Signer(name=_name(statement.created_by), role='ثبت‌کننده', user_id=statement.created_by_id))
        return signers
    titles = {step.key: step.title_fa for step in PETTY_STATEMENT_WORKFLOW_SPEC.steps}
    rows = (WorkflowStep.objects.filter(instance=instance, action__in=(WorkflowStep.SUBMIT, WorkflowStep.ACT))
            .select_related('actor').order_by('at', 'pk'))
    latest = {}
    for row in rows:
        key = 'submit' if row.action == WorkflowStep.SUBMIT else row.from_step
        latest[key] = row  # آخرین اقدام هر مرحله (پس از عودت و ارسال دوباره)
    for key in ['submit'] + [step.key for step in PETTY_STATEMENT_WORKFLOW_SPEC.steps]:
        row = latest.get(key)
        if row is None or row.actor is None:
            continue
        role = 'ثبت‌کننده' if key == 'submit' else titles.get(key, key)
        signers.append(Signer(name=_name(row.actor), role=role, user_id=row.actor_id, signed=True))
    return signers


def _place(line):
    project = line.project.name if line.project_id else (
        line.section.project.name if line.section_id and line.section.project_id else '')
    section = line.section.name if line.section_id else ''
    return ' / '.join(part for part in (project, section) if part)


def printable_petty_statement(user, entity_id):
    from reports.document_pdf import PrintableDocument, fa_digits
    from .models import PettyCashStatement, PettyCashTransaction
    statement = (PettyCashStatement.objects.select_related('company', 'custodian', 'created_by')
                 .filter(pk=entity_id).first())
    if statement is None:
        return None
    lines = list(statement.lines.select_related('expense_head', 'section__project', 'project')
                 .order_by('transaction_date_shamsi', 'pk'))
    rows = [[
        fa_digits(idx), fa_digits(line.transaction_date_shamsi or ''), line.title or '',
        line.expense_head.title if line.expense_head_id else (line.category or ''), _place(line),
        _money(line.amount), line.get_line_status_display(), line.line_reject_reason or '',
    ] for idx, line in enumerate(lines, start=1)]
    rejected_total = sum((l.amount for l in lines if l.line_status == 'rejected'), Decimal('0'))
    paragraphs = [
        f'شمارهٔ صورت‌حساب: {fa_digits(statement.document_number) if statement.document_number else "—"}',
        f'تاریخ: {fa_digits(statement.statement_date_shamsi)}',
        f'تنخواه‌گردان: {_name(statement.custodian)}',
        f'وضعیت: {statement.get_status_display()}',
        f'جمع ردیف‌ها: {_money(statement.total_amount)}',
        f'جمع تأییدشده: {_money(statement.approved_amount)}',
        f'جمع ردشده: {_money(rejected_total)}',
    ]
    refills = PettyCashTransaction.objects.filter(source_statement=statement, transaction_type='allocation') \
        .order_by('pk')
    for refill in refills:
        paragraphs.append(f'شارژ دوباره: {_money(refill.amount)} — شمارهٔ پیگیری '
                          f'{fa_digits(refill.receipt_number or "")} — {fa_digits(refill.transaction_date_shamsi)}')
    return PrintableDocument(
        company_id=statement.company_id,
        title='صورت‌حساب تنخواه',
        number=statement.document_number or str(statement.pk),
        date=statement.statement_date_shamsi,
        attachments_count=0,
        paragraphs=paragraphs,
        table_headers=['ردیف', 'تاریخ', 'شرح', 'سرفصل هزینه', 'پروژه / بخش', 'مبلغ', 'وضعیت', 'دلیل رد'],
        table_rows=rows,
        signers=_signers(statement),
    )
