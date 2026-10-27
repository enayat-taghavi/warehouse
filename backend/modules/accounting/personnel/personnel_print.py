"""
چاپ / PDF پروندهٔ پرسنلی (د۸ طرح ۴.۳) با قلاب `printable:personnel_profile` (الگوی چاپ تنخواه ۴.۲).

API هسته پیش از این قلاب `can_view` همان پرونده را می‌سنجد (قلمرو شرکت و بخش؛ نادیدنی = 404)؛ اینجا هم دوباره
سنجیده می‌شود. کد ملی، شناسنامه، حساب، کارت و شبا با همان قاعدهٔ د۶ (`can_view_personnel_sensitive`) و دستمزد با
`user_can_view_wages`. از مدرک‌ها فقط نام و نوع می‌آید، نه فایل.
"""
import os

from .workflows import PERSONNEL_PROFILE_WORKFLOW_SPEC, PERSONNEL_WORKFLOW


def _name(user):
    if user is None:
        return ''
    return f'{user.first_name} {user.last_name}'.strip() or user.username


def _signers(profile):
    """فرستنده و اقدام‌کنندگان هر مرحله از سابقهٔ گردش همین پرونده؛ بی گردش فقط ثبت‌کننده."""
    from reports.document_pdf import Signer
    from workflow import engine as wf_engine
    from workflow.models import WorkflowStep
    signers = []
    instance = wf_engine.instance_of(PERSONNEL_WORKFLOW, profile.pk)
    if instance is None:
        if profile.created_by is not None:
            signers.append(Signer(name=_name(profile.created_by), role='ثبت‌کننده', user_id=profile.created_by_id))
        return signers
    titles = {step.key: step.title_fa for step in PERSONNEL_PROFILE_WORKFLOW_SPEC.steps}
    rows = (WorkflowStep.objects.filter(instance=instance, action__in=(WorkflowStep.SUBMIT, WorkflowStep.ACT))
            .select_related('actor').order_by('at', 'pk'))
    latest = {}
    for row in rows:
        key = 'submit' if row.action == WorkflowStep.SUBMIT else row.from_step
        latest[key] = row  # آخرین اقدام هر مرحله (پس از عودت و ارسال دوباره)
    for key in ['submit'] + [step.key for step in PERSONNEL_PROFILE_WORKFLOW_SPEC.steps]:
        row = latest.get(key)
        if row is None or row.actor is None:
            continue
        role = 'ثبت‌کننده' if key == 'submit' else titles.get(key, key)
        signers.append(Signer(name=_name(row.actor), role=role, user_id=row.actor_id, signed=True))
    return signers


def printable_personnel_profile(user, entity_id):
    from reports.document_pdf import PrintableDocument, fa_digits
    from .lifecycle_services import can_view_personnel_sensitive, mask_sensitive_value, user_can_view_wages
    from .models import PersonnelProfile
    from .workflows import can_view_personnel
    profile = (PersonnelProfile.objects.select_related('company', 'section__project', 'project', 'created_by')
               .filter(pk=entity_id).first())
    if profile is None or not can_view_personnel(user, profile.pk):
        return None
    full = can_view_personnel_sensitive(user, profile)
    show_wages = user_can_view_wages(user)

    def guard(value):
        value = value or ''
        return fa_digits(value if full else mask_sensitive_value(value))

    paragraphs = [
        f'نام و نام خانوادگی: {profile.full_name or ""}',
        f'نام پدر: {profile.father_name or "—"}',
        f'کد ملی: {guard(profile.national_code) or "—"}',
        f'شمارهٔ شناسنامه: {guard(profile.id_number) or "—"}',
        f'سری و سریال شناسنامه: {guard(profile.id_series) or "—"} / {guard(profile.id_serial) or "—"}',
        f'تاریخ تولد: {fa_digits(profile.birth_date or "—")}',
        f'سمت: {profile.job_title or "—"}',
        f'وضعیت پرونده: {profile.get_approval_status_display()}',
    ]
    if show_wages:
        paragraphs.append(f'مزد روزانه: {fa_digits(f"{int(profile.daily_base_wage or 0):,}")} ریال')
    assignments = profile.section_assignments.select_related('section', 'project').order_by('pk')
    for a in assignments:
        place = ' / '.join(x for x in (a.project.name if a.project_id else '', a.section.name if a.section_id else '') if x)
        line = f'انتساب: {place or "—"} — {a.job_title or "—"} — {"فعال" if a.is_active else "غیرفعال"}'
        if show_wages and a.daily_base_wage:
            line += f' — مزد روزانه {fa_digits(f"{int(a.daily_base_wage):,}")} ریال'
        paragraphs.append(line)
    documents = list(profile.documents.order_by('created_at', 'pk'))
    # د۶: فهرست مدرک فقط برای دید کامل و بارگذارنده؛ بقیه فقط تعداد (attachments_count)
    for doc in (documents if full else [d for d in documents if d.uploaded_by_id == user.id]):
        file_name = os.path.basename(doc.file.name) if doc.file else ''
        paragraphs.append(f'مدرک: {doc.get_doc_type_display()} — {file_name}')

    rows = [[
        fa_digits(idx), acc.bank_name or '', guard(acc.account_number), guard(acc.card_number),
        guard(acc.sheba_number), 'اصلی' if acc.is_primary else '', 'فعال' if acc.is_active else 'غیرفعال',
    ] for idx, acc in enumerate(profile.bank_accounts.order_by('-is_primary', 'pk'), start=1)]
    return PrintableDocument(
        company_id=profile.company_id or (profile.section.project.company_id
                                          if profile.section_id and profile.section.project_id else None),
        title='پروندهٔ پرسنلی',
        number=str(profile.pk),
        date=profile.created_at,
        attachments_count=len(documents),
        paragraphs=paragraphs,
        table_headers=['ردیف', 'بانک', 'شمارهٔ حساب', 'شمارهٔ کارت', 'شبا', 'اصلی', 'وضعیت'],
        table_rows=rows,
        signers=_signers(profile),
    )
