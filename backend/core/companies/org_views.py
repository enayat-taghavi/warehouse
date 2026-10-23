"""
API هستهٔ پروژه، بخش و انتساب کاربر به بخش (طرح Project_Section_To_Core، گام ۲):
/api/org/projects/، /api/org/project-sections/ و /api/org/section-assignments/.

مجوز (ت۲): نوشتن با سطح «نوشتن» بخش `projects` در همان شرکت (`ensure_section`)؛ رکورد سراسری (بی‌شرکت)
وجود ندارد (طرح ۲.۱، ت۲). خواندن برای عضو شرکت (مصرف‌کنندگان ماژول‌ها، مثل فرم‌های کارکرد) یا دارندهٔ سطح «خواندن»
بخش `projects` (حالت محدود استودیو). انتساب بخش خودش عضویت شرکت می‌دهد، پس فقط برای کاربرِ پیوندخورده با
همان شرکت ممکن است و نویسنده خودش را منتسب نمی‌کند، مگر superuser یا نویسندهٔ قدیمی ساختار که از قبل عضو است.
انتساب در سه سطح شرکت، پروژه یا بخش است (طرح ۲.۱، ت۳)؛ شرکتِ هدف هر سطح همان قاعده‌ها را می‌گذراند.
"""
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from accounts.views import OptionalPageNumberPagination
from common.date_utils import normalize_digits

from .access import companies_with_section, ensure_section, get_request_company_id, get_user_allowed_companies
from .models import Company, Project, ProjectSection, SectionAssignment, section_role_choices
from .org_membership import user_belongs_to_company
from .org_roles import assignments_in_companies_q, covering_section_q, user_sections
from .org_serializers import (
    SINGLE_TARGET_MESSAGE,
    TARGET_FIELDS,
    ProjectSectionSerializer,
    ProjectSerializer,
    SectionAssignmentSerializer,
    assignment_target_company_id,
    final_assignment_target,
    validate_section_role,
)
from .permissions import has_structure_write_permission
from .realtime import broadcast_org_structure_updated

User = get_user_model()

SECTION = 'projects'
NO_COMPANY_MESSAGE = "هر پروژه، بخش و انتساب باید به یک شرکت تعلق داشته باشد."
READ_DENIED_MESSAGE = "شما به پروژه‌ها و بخش‌های این شرکت دسترسی ندارید."


# ─── قواعد دسترسی ─────────────────────────────────────────────────────────────

def readable_company_ids(user):
    """شرکت‌هایی که کاربر پروژه و بخششان را می‌خواند (عضو یا سطح «خواندن» بخش projects)؛ None یعنی همه."""
    if user.is_superuser:
        return None
    ids = set(get_user_allowed_companies(user).values_list('id', flat=True))
    ids |= set(companies_with_section(user, SECTION, 'read').values_list('id', flat=True))
    return ids


def _int_or_none(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def ensure_read(user, company_id):
    """شناسهٔ عددی شرکت قابل خواندن، یا PermissionDenied."""
    cid = _int_or_none(company_id)
    if cid is None:
        raise PermissionDenied("شناسهٔ شرکت نامعتبر است.")
    readable = readable_company_ids(user)
    if readable is not None and cid not in readable:
        raise PermissionDenied(READ_DENIED_MESSAGE)
    return cid


def ensure_write(user, company_id, message=None):
    """نوشتن پروژه، بخش یا انتساب در یک شرکت: سطح «نوشتن» بخش projects؛ رکورد بی‌شرکت برای هیچ‌کس."""
    if company_id is None:
        raise PermissionDenied(NO_COMPANY_MESSAGE)
    ensure_section(user, company_id, SECTION, 'write',
                   message or "مجوز نوشتن «پروژه‌ها و بخش‌ها» را در این شرکت ندارید.")


def _may_assign_self(actor, company_id):
    """
    انتساب خود به بخش، نقش ماژول‌ها و عضویت شرکت می‌سازد: فقط superuser، یا نویسندهٔ قدیمی ساختار
    (has_structure_write_permission) که از قبل عضو همان شرکت است.
    """
    if actor.is_superuser:
        return True
    return (has_structure_write_permission(actor)
            and get_user_allowed_companies(actor).filter(id=company_id).exists())


def _section_company_id(section):
    return section.project.company_id if section is not None and section.project_id else None


ASSIGN_WRITE_MESSAGE = "انتساب فقط در شرکت‌ها، پروژه‌ها و بخش‌هایی ممکن است که «پروژه‌ها و بخش‌ها»ی شرکتشان را می‌نویسید."


def ensure_assignment(actor, target_user_id, company_id, deactivating_existing=False):
    """
    انتساب در هر سطح (شرکت، پروژه یا بخش): نوشتن projects در شرکتِ هدف، و (برای غیرsuperuser) کاربر هدف
    پیوندخورده با همان شرکت و نه خودِ نویسنده. فقط غیرفعال‌سازی ردیف موجود بی‌تغییر کاربر و هدف این دو شرط را
    لازم ندارد؛ ردیف تازه، حتی غیرفعال، سنجیده می‌شود، چون انتساب غیرفعال هم کاربر را «پیوندخورده» می‌کند و
    فعال‌سازی بعدی عضویت می‌دهد.
    """
    ensure_write(actor, company_id, ASSIGN_WRITE_MESSAGE)
    if actor.is_superuser or deactivating_existing:
        return
    if target_user_id == actor.id and not _may_assign_self(actor, company_id):
        raise PermissionDenied("انتساب خودتان را مدیر کل سامانه انجام می‌دهد.")
    if not user_belongs_to_company(target_user_id, company_id):
        raise PermissionDenied("این کاربر با شرکتِ این انتساب پیوند ندارد. پیوند شرکت را تب «دسترسی» می‌دهد، نه انتساب.")


def resolve_import_company(request, required=False):
    """
    شرکت مقصد درون‌ریزی اکسل. غیرsuperuser: شرکت فعال درخواست (company_id یا X-Company-ID) با سطح «نوشتن»
    projects؛ بی‌شرکت فقط اگر تنها یک شرکت قابل نوشتن دارد. superuser: شرکت فعال اگر آمده، وگرنه کل جدول
    (required=True، مثل درون‌ریزی پروژه که شرکت لازم دارد: بی شرکت فعال رد می‌شود).
    """
    user = request.user
    raw = request.data.get('company_id') if hasattr(request.data, 'get') else None
    raw = raw or get_request_company_id(request)
    if user.is_superuser:
        cid = _int_or_none(raw)
        if cid is None and required:
            raise serializers.ValidationError({'error': 'شرکت فعال مشخص نیست؛ ابتدا شرکت را در سربرگ انتخاب کنید.'})
        return cid
    if raw:
        cid = _int_or_none(raw)
        if cid is None:
            raise serializers.ValidationError({'error': 'شناسهٔ شرکت نامعتبر است.'})
        ensure_write(user, cid, "شما اجازهٔ درون‌ریزی پروژه و بخش را در این شرکت ندارید.")
        return cid
    writable = list(companies_with_section(user, SECTION, 'write').values_list('id', flat=True))
    if len(writable) == 1:
        return writable[0]
    raise serializers.ValidationError({'error': 'شرکت فعال مشخص نیست؛ ابتدا شرکت را در سربرگ انتخاب کنید.'})


def _export_scope(request):
    """شرکت‌های خروجی اکسل: شرکت داده‌شده یا همهٔ شرکت‌های قابل خواندن (None یعنی همه، برای superuser)."""
    raw = request.query_params.get('company_id')
    if raw:
        return {ensure_read(request.user, raw)}
    return readable_company_ids(request.user)


def _has_outside_references(obj, skip_models=()):
    """
    آیا رکوردی بیرون از ساختار خود پروژه و بخش (مثلاً کارکرد، فاکتور یا پرسنل ماژول‌ها) به obj اشاره دارد؟
    بی‌نام بردن از هیچ ماژولی، از روی رابطه‌های معکوس مدل؛ چنین رکوردی حذف فیزیکی را به غیرفعال‌سازی نرم می‌برد.
    """
    for rel in obj._meta.related_objects:
        if rel.related_model in skip_models:
            continue
        if rel.related_model._base_manager.filter(**{rel.field.name: obj}).exists():
            return True
    return False


def _tab_id(request):
    data = request.data if hasattr(request.data, 'get') else {}
    return request.headers.get('X-Client-Tab-Id') or data.get('client_tab_id')


def _broadcast(request, entity_type, action_name, entity_id, name, project_id, company_id):
    broadcast_org_structure_updated(entity_type, action_name, entity_id, name, project_id,
                                    _tab_id(request), request.user.id, company_id)


def _import_response(result, dry_run, request, entity_type, label, company_id):
    if not dry_run:
        _broadcast(request, entity_type, 'import', None, label, None, company_id)
    return Response(result, status=status.HTTP_200_OK if result['success'] else status.HTTP_400_BAD_REQUEST)


def _bool_param(request, name):
    value = request.query_params.get(name)
    return None if value is None else value.lower() == 'true'


# ─── پروژه ─────────────────────────────────────────────────────────────────────

class ProjectViewSet(viewsets.ModelViewSet):
    """پروژه‌های زیر شرکت (شرکت ← پروژه ← بخش)."""
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = OptionalPageNumberPagination

    def get_queryset(self):
        user = self.request.user
        qs = Project.objects.select_related('company').annotate(sections_count=Count('sections'))
        company_param = get_request_company_id(self.request)
        if company_param and _int_or_none(company_param) is not None:
            qs = qs.filter(company_id=ensure_read(user, company_param))
        elif not user.is_superuser:
            qs = qs.filter(company_id__in=readable_company_ids(user))

        is_active = _bool_param(self.request, 'is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active)
        search = self.request.query_params.get('search')
        if search:
            search_clean = normalize_digits(str(search)).strip()
            qs = qs.filter(Q(name__icontains=search) | Q(code__icontains=search_clean))
        return qs.order_by('code')

    def perform_create(self, serializer):
        ensure_write(self.request.user, serializer.validated_data['company'].id)
        instance = serializer.save()
        _broadcast(self.request, 'project', 'create', instance.id, instance.name, None, instance.company_id)

    def perform_update(self, serializer):
        user = self.request.user
        current_company_id = serializer.instance.company_id
        ensure_write(user, current_company_id)
        if 'company' in serializer.validated_data:
            # جابه‌جایی پروژه بین شرکت‌ها اعضای پروژه و بخش‌هایش را عضو شرکت تازه می‌کند؛ فقط superuser
            if serializer.validated_data['company'].id != current_company_id and not user.is_superuser:
                raise PermissionDenied("انتقال پروژه به شرکت دیگر را فقط مدیر کل سامانه انجام می‌دهد.")
        instance = serializer.save()
        _broadcast(self.request, 'project', 'update', instance.id, instance.name, None, instance.company_id)

    def perform_destroy(self, instance):
        ensure_write(self.request.user, instance.company_id)
        # پروژه‌ای که خودش یا یکی از بخش‌هایش در داده‌های ماژول‌ها به کار رفته، حذف فیزیکی نمی‌شود (غیرفعال‌سازی نرم)
        in_use = _has_outside_references(instance, skip_models=(ProjectSection, SectionAssignment)) or any(
            _has_outside_references(sec, skip_models=(SectionAssignment,)) for sec in instance.sections.all()
        )
        if in_use:
            instance.is_active = False
            instance.save(update_fields=['is_active', 'updated_at'])
            _broadcast(self.request, 'project', 'update', instance.id, instance.name, None, instance.company_id)
            return
        instance_id, instance_name, company_id = instance.id, instance.name, instance.company_id
        instance.delete()
        _broadcast(self.request, 'project', 'delete', instance_id, instance_name, None, company_id)

    @action(detail=False, methods=['get'], url_path='export-excel')
    def export_excel(self, request):
        from .org_excel import export_projects_excel
        return export_projects_excel(company_ids=_export_scope(request))

    @action(detail=False, methods=['get'], url_path='download-template')
    def download_template(self, request):
        from .org_excel import download_org_template
        return download_org_template('projects')

    @action(detail=False, methods=['post'], url_path='import-excel')
    def import_excel(self, request):
        from .org_excel import import_projects_from_excel
        company_id = resolve_import_company(request, required=True)
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'فایل اکسل بارگذاری نشده است.'}, status=status.HTTP_400_BAD_REQUEST)
        dry_run = request.data.get('dry_run') in ['true', 'True', True]
        result = import_projects_from_excel(file_obj, dry_run=dry_run, company_id=company_id)
        return _import_response(result, dry_run, request, 'project', 'اکسل پروژه‌ها', company_id)


# ─── بخش ──────────────────────────────────────────────────────────────────────

class ProjectSectionViewSet(viewsets.ModelViewSet):
    """بخش‌ها و دپارتمان‌های تابعهٔ هر پروژه."""
    queryset = ProjectSection.objects.all()
    serializer_class = ProjectSectionSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = OptionalPageNumberPagination

    def get_queryset(self):
        user = self.request.user
        qs = ProjectSection.objects.select_related('project')
        company_param = get_request_company_id(self.request)
        if company_param and _int_or_none(company_param) is not None:
            qs = qs.filter(project__company_id=ensure_read(user, company_param))
        elif not user.is_superuser:
            qs = qs.filter(project__company_id__in=readable_company_ids(user))

        project_id = _int_or_none(self.request.query_params.get('project_id') or self.request.query_params.get('project'))
        if project_id is not None:
            qs = qs.filter(project_id=project_id)
        is_active = _bool_param(self.request, 'is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active)
        search = self.request.query_params.get('search')
        if search:
            search_clean = normalize_digits(str(search)).strip()
            qs = qs.filter(Q(name__icontains=search) | Q(code__icontains=search_clean))
        return qs.order_by('project__code', 'code')

    def perform_create(self, serializer):
        company_id = serializer.validated_data['project'].company_id
        ensure_write(self.request.user, company_id)
        instance = serializer.save()
        _broadcast(self.request, 'section', 'create', instance.id, instance.name, instance.project_id, company_id)

    def perform_update(self, serializer):
        user = self.request.user
        current_company_id = _section_company_id(serializer.instance)
        ensure_write(user, current_company_id)
        if 'project' in serializer.validated_data:
            new_company_id = serializer.validated_data['project'].company_id
            ensure_write(user, new_company_id, "انتقال بخش به پروژهٔ شرکتی که «پروژه‌ها و بخش‌ها»ی آن را نمی‌نویسید مجاز نیست.")
            # جابه‌جایی بخش بین شرکت‌ها اعضایش را عضو شرکت تازه می‌کند؛ فقط superuser
            if new_company_id != current_company_id and not user.is_superuser:
                raise PermissionDenied("انتقال بخش به پروژهٔ شرکت دیگر را فقط مدیر کل سامانه انجام می‌دهد.")
        instance = serializer.save()
        _broadcast(self.request, 'section', 'update', instance.id, instance.name, instance.project_id,
                   _section_company_id(instance))

    def perform_destroy(self, instance):
        company_id = _section_company_id(instance)
        ensure_write(self.request.user, company_id)
        instance_id, instance_name, project_id = instance.id, instance.name, instance.project_id
        # بخشِ به‌کاررفته در داده‌های ماژول‌ها حذف فیزیکی نمی‌شود (غیرفعال‌سازی نرم)
        if _has_outside_references(instance, skip_models=(SectionAssignment,)):
            instance.is_active = False
            instance.save(update_fields=['is_active', 'updated_at'])
            _broadcast(self.request, 'section', 'update', instance_id, instance_name, project_id, company_id)
            return
        instance.delete()
        _broadcast(self.request, 'section', 'delete', instance_id, instance_name, project_id, company_id)

    @action(detail=False, methods=['get'], url_path='export-excel')
    def export_excel(self, request):
        from .org_excel import export_sections_excel
        return export_sections_excel(request.query_params.get('project_id'), company_ids=_export_scope(request))

    @action(detail=False, methods=['get'], url_path='download-template')
    def download_template(self, request):
        from .org_excel import download_org_template
        return download_org_template('sections')

    @action(detail=False, methods=['post'], url_path='import-excel')
    def import_excel(self, request):
        from .org_excel import import_sections_from_excel
        company_id = resolve_import_company(request)
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'فایل اکسل بارگذاری نشده است.'}, status=status.HTTP_400_BAD_REQUEST)
        dry_run = request.data.get('dry_run') in ['true', 'True', True]
        result = import_sections_from_excel(file_obj, dry_run=dry_run, company_id=company_id)
        return _import_response(result, dry_run, request, 'section', 'اکسل بخش‌ها', company_id)

    @action(detail=True, methods=['post'], url_path='clone-assignments')
    def clone_assignments(self, request, pk=None):
        """
        کپی دسته‌جمعی انتساب‌های فعال مستقیم یک بخش مبدأ به این بخش (مقصد). انتساب‌های سطح شرکت و پروژه کپی
        نمی‌شوند، چون خودشان برای بخش مقصد هم (اگر در همان پروژه یا شرکت است) معتبرند.
        """
        target_section = self.get_object()
        source_sec_id = _int_or_none(request.data.get('source_section_id'))
        if request.data.get('source_section_id') in (None, ''):
            return Response({'error': 'شناسه بخش مبدأ الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)
        if source_sec_id is None:
            return Response({'error': 'شناسه بخش مبدأ نامعتبر است.'}, status=status.HTTP_400_BAD_REQUEST)
        if source_sec_id == target_section.id:
            return Response({'error': 'بخش مبدأ و مقصد نمی‌توانند یکسان باشند.'}, status=status.HTTP_400_BAD_REQUEST)

        source_section = ProjectSection.objects.select_related('project').filter(id=source_sec_id).first()
        if not source_section:
            return Response({'error': 'بخش مبدأ یافت نشد.'}, status=status.HTTP_404_NOT_FOUND)

        target_company_id = _section_company_id(target_section)
        ensure_write(request.user, target_company_id, "کپی انتساب فقط در بخش‌های شرکت‌هایی ممکن است که «پروژه‌ها و بخش‌ها»ی آن را می‌نویسید.")
        if not request.user.is_superuser and _section_company_id(source_section) != target_company_id:
            # مبدأ و مقصد در یک شرکت، تا کپی برای کسی دسترسی شرکت تازه نسازد
            raise PermissionDenied("کپی انتساب فقط بین بخش‌های یک شرکت مجاز است.")
        if not section_role_choices():
            from .org_serializers import NO_SECTION_ROLES_MESSAGE
            return Response({'error': NO_SECTION_ROLES_MESSAGE}, status=status.HTTP_400_BAD_REQUEST)

        source_assignments = SectionAssignment.objects.filter(section=source_section, is_active=True)
        if not source_assignments.exists():
            return Response({'error': 'هیچ انتساب فعالی در بخش مبدأ جهت کپی وجود ندارد.'}, status=status.HTTP_400_BAD_REQUEST)
        # نویسنده با کپی هم نقش تازه برای خودش نمی‌سازد
        if not _may_assign_self(request.user, target_company_id):
            source_assignments = source_assignments.exclude(user=request.user)

        copied_count = 0
        skipped_count = 0
        with transaction.atomic():
            for sa in source_assignments:
                existing = SectionAssignment.objects.filter(user=sa.user, section=target_section, role=sa.role).first()
                if not existing:
                    SectionAssignment.objects.create(user=sa.user, section=target_section, role=sa.role, is_active=True)
                    copied_count += 1
                elif not existing.is_active:
                    existing.is_active = True
                    existing.save(update_fields=['is_active', 'updated_at'])
                    copied_count += 1
                else:
                    skipped_count += 1

        _broadcast(request, 'assignment', 'clone', target_section.id,
                   f'کپی چارت از {source_section.name} به {target_section.name}',
                   target_section.project_id, target_company_id)
        return Response({
            'success': True,
            'message': f'ساختار پرسنلی با موفقیت کپی شد. ({copied_count} انتساب جدید/فعال‌شده، {skipped_count} بدون تغییر)',
            'copied_count': copied_count,
            'skipped_count': skipped_count
        }, status=status.HTTP_200_OK)


# ─── انتساب کاربر در سطح شرکت، پروژه یا بخش ─────────────────────────────────────

TARGET_MODELS = {'company': Company, 'project': Project, 'section': ProjectSection}
TARGET_LABELS = {'company': 'شرکت', 'project': 'پروژه', 'section': 'بخش'}


def _request_targets(data, accept_id_suffix=False):
    """[(فیلد هدف, مقدار خام)] از بدنهٔ درخواست؛ accept_id_suffix: کلیدهای section_id، project_id و company_id هم."""
    found = []
    for field in TARGET_FIELDS:
        raw = data.get(field)
        if raw in (None, '') and accept_id_suffix:
            raw = data.get(f'{field}_id')
        if raw not in (None, ''):
            found.append((field, raw))
    return found


def _load_target(field, target_id):
    qs = TARGET_MODELS[field].objects.all()
    if field == 'section':
        qs = qs.select_related('project')
    return qs.filter(id=target_id).first()


def _broadcast_assignment(request, action_name, instance, name):
    project = instance.target_project
    _broadcast(request, 'assignment', action_name, instance.id, name,
               project.id if project is not None else None, instance.target_company_id)


class SectionAssignmentViewSet(viewsets.ModelViewSet):
    """
    انتساب کاربران با نقش‌هایی که ماژول‌های نصب‌شده اعلام کرده‌اند، در سطح شرکت، پروژه یا بخش (طرح ۲.۱، ت۳).
    بدنهٔ ساخت: user، role و دقیقاً یکی از company، project یا section (بدنهٔ قدیمی فقط با section همان کار را می‌کند).
    """
    queryset = SectionAssignment.objects.all()
    serializer_class = SectionAssignmentSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = OptionalPageNumberPagination

    def get_queryset(self):
        user = self.request.user
        qs = SectionAssignment.objects.select_related(
            'user', 'company', 'project__company', 'section__project__company'
        )
        if not user.is_superuser:
            # انتساب‌های شرکت‌های دیگر دیده نمی‌شوند (انتساب‌های خود کاربر می‌مانند)
            qs = qs.filter(assignments_in_companies_q(readable_company_ids(user)) | Q(user=user))
        params = self.request.query_params
        company_id = params.get('company_id')
        if company_id:
            qs = qs.filter(assignments_in_companies_q([ensure_read(user, company_id)]))
        for param, field in (('section_id', 'section_id'), ('user_id', 'user_id')):
            value = _int_or_none(params.get(param))
            if value is not None:
                qs = qs.filter(**{field: value})
        project_id = _int_or_none(params.get('project_id'))
        if project_id is not None:
            qs = qs.filter(Q(project_id=project_id) | Q(section__project_id=project_id))
        # همهٔ انتساب‌هایی که برای یک بخش معتبرند (مستقیم، پروژهٔ آن و شرکت آن)
        covering = _int_or_none(params.get('covering_section_id'))
        if covering is not None:
            qs = qs.filter(covering_section_q(covering))
        level = params.get('level')
        if level in TARGET_FIELDS:
            qs = qs.filter(**{f'{level}__isnull': False})
        role = params.get('role')
        if role:
            qs = qs.filter(role=role)
        is_active = _bool_param(self.request, 'is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active)
        return qs.order_by('-created_at')

    @action(detail=False, methods=['get'], url_path='my-sections')
    def my_sections(self, request):
        """
        بخش‌های فعالی که کاربر جاری با انتساب فعال در هر سطح پوشش می‌دهد (انتساب شرکت یا پروژه همهٔ بخش‌های
        آن را می‌دهد). فقط superuser: همهٔ بخش‌های فعال.
        """
        user = request.user
        target_company_id = _int_or_none(get_request_company_id(request))
        if not user.is_superuser and target_company_id:
            if not get_user_allowed_companies(user).filter(id=target_company_id).exists():
                return Response([], status=status.HTTP_200_OK)

        if user.is_superuser:
            sections = ProjectSection.objects.filter(is_active=True, project__is_active=True)
            if target_company_id:
                sections = sections.filter(project__company_id=target_company_id)
        else:
            sections = user_sections(user, company_id=target_company_id)
        sections = sections.select_related('project').order_by('project__code', 'code')
        return Response(ProjectSectionSerializer(sections, many=True).data)

    def create(self, request, *args, **kwargs):
        """ایجاد انتساب یا فعال‌سازی دوبارهٔ رکورد غیرفعال قبلی، بدون خطای یکتایی."""
        role = request.data.get('role', 'employee')
        try:
            validate_section_role(role)
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({'role': exc.detail})
        user_id = _int_or_none(request.data.get('user'))
        targets = _request_targets(request.data)
        if user_id and len(targets) == 1:
            field, raw = targets[0]
            target_id = _int_or_none(raw)
            target = _load_target(field, target_id) if target_id is not None else None
            existing = (SectionAssignment.objects.filter(user_id=user_id, role=role, **{field: target}).first()
                        if target is not None else None)
            if existing is not None:
                # پیش از مسیر فعال‌سازی دوباره هم مجوز نوشتن و شرط عضویت سنجیده می‌شود
                ensure_assignment(request.user, user_id, assignment_target_company_id(field, target))
                if not existing.is_active:
                    existing.is_active = True
                    existing.save(update_fields=['is_active', 'updated_at'])
                    _broadcast_assignment(request, 'create', existing, str(existing.user))
                return Response(self.get_serializer(existing).data, status=status.HTTP_201_CREATED)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        target_user = serializer.validated_data.get('user')
        field, target = final_assignment_target(serializer.validated_data)
        # ردیف تازه، فعال یا غیرفعال، همیشه شرط پیوند و انتساب خود را می‌گذراند
        ensure_assignment(self.request.user, target_user.id if target_user else None,
                          assignment_target_company_id(field, target))
        instance = serializer.save()
        _broadcast_assignment(self.request, 'create', instance, str(instance.user))

    def perform_update(self, serializer):
        current = serializer.instance
        current_company_id = current.target_company_id
        ensure_write(self.request.user, current_company_id,
                     "فقط انتساب‌های شرکت‌هایی را که «پروژه‌ها و بخش‌ها»ی آن را می‌نویسید ویرایش می‌کنید.")
        field, target = final_assignment_target(serializer.validated_data, current)
        final_company_id = assignment_target_company_id(field, target)
        if not self.request.user.is_superuser and final_company_id != current_company_id:
            raise PermissionDenied("انتقال انتساب به شرکت دیگر را فقط مدیر کل سامانه انجام می‌دهد.")
        final_user = serializer.validated_data.get('user', current.user)
        final_active = serializer.validated_data.get('is_active', current.is_active)
        deactivating_existing = (
            not final_active and final_user.id == current.user_id
            and getattr(current, f'{field}_id') == target.pk
        )
        ensure_assignment(self.request.user, final_user.id, final_company_id,
                          deactivating_existing=deactivating_existing)
        instance = serializer.save()
        _broadcast_assignment(self.request, 'update', instance, str(instance.user))

    def perform_destroy(self, instance):
        ensure_write(self.request.user, instance.target_company_id,
                     "فقط انتساب‌های شرکت‌هایی را که «پروژه‌ها و بخش‌ها»ی آن را می‌نویسید حذف می‌کنید.")
        # غیرفعال‌سازی نرم برای حفظ ردپای حسابرسی و انتساب‌های تاریخی
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        _broadcast_assignment(self.request, 'delete', instance, None)

    @action(detail=False, methods=['get'], url_path='export-excel')
    def export_excel(self, request):
        from .org_excel import export_assignments_excel
        return export_assignments_excel(request.query_params.get('project_id'), request.query_params.get('role'),
                                        company_ids=_export_scope(request))

    @action(detail=False, methods=['get'], url_path='download-template')
    def download_template(self, request):
        from .org_excel import download_org_template
        return download_org_template('assignments')

    @action(detail=False, methods=['post'], url_path='import-excel')
    def import_excel(self, request):
        from .org_excel import import_assignments_from_excel
        # غیرsuperuser فقط شرکت فعالِ قابل نوشتن خودش (و پروژه‌ها و بخش‌هایش) و فقط برای کاربران پیوندخورده با آن
        company_id = resolve_import_company(request)
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'فایل اکسل بارگذاری نشده است.'}, status=status.HTTP_400_BAD_REQUEST)
        dry_run = request.data.get('dry_run') in ['true', 'True', True]
        actor = request.user
        forbidden_self = None if actor.is_superuser or company_id is None or _may_assign_self(actor, company_id) else actor.id
        result = import_assignments_from_excel(
            file_obj, dry_run=dry_run, company_id=company_id,
            member_check=None if actor.is_superuser else user_belongs_to_company,
            forbidden_user_id=forbidden_self
        )
        return _import_response(result, dry_run, request, 'assignment', 'اکسل انتساب‌ها', company_id)

    @action(detail=False, methods=['post'], url_path='bulk-assign')
    def bulk_assign(self, request):
        """
        انتساب هم‌زمان چند کاربر به یک هدف و نقش، همه یا هیچ. هدف: section_id، project_id یا company_id
        (یا section، project و company)، دقیقاً یکی.
        """
        targets = _request_targets(request.data, accept_id_suffix=True)
        user_ids = request.data.get('user_ids') or []
        role = request.data.get('role', 'employee')

        if not targets:
            return Response({'error': 'شناسهٔ بخش، پروژه یا شرکت الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(targets) > 1:
            return Response({'error': SINGLE_TARGET_MESSAGE}, status=status.HTTP_400_BAD_REQUEST)
        field, raw_target = targets[0]
        target_id = _int_or_none(raw_target)
        if target_id is None:
            return Response({'error': f'شناسهٔ {TARGET_LABELS[field]} باید عددی باشد.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_section_role(role)
        except serializers.ValidationError as exc:
            return Response({'error': ' '.join(str(m) for m in exc.detail)}, status=status.HTTP_400_BAD_REQUEST)
        if not user_ids or not isinstance(user_ids, list):
            return Response({'error': 'لیست شناسه‌های کاربران الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)
        valid_user_ids = [uid for uid in (_int_or_none(u) for u in user_ids) if uid is not None]
        if not valid_user_ids:
            return Response({'error': 'هیچ شناسه کاربری معتبری ارسال نشده است.'}, status=status.HTTP_400_BAD_REQUEST)

        target = _load_target(field, target_id)
        if target is None:
            return Response({'error': f'{TARGET_LABELS[field]} مورد نظر یافت نشد.'}, status=status.HTTP_404_NOT_FOUND)

        existing_users = set(User.objects.filter(id__in=valid_user_ids).values_list('id', flat=True))
        company_id = assignment_target_company_id(field, target)
        ensure_write(request.user, company_id, ASSIGN_WRITE_MESSAGE)
        if not request.user.is_superuser:
            # همه یا هیچ؛ کاربر ناموجود هم مثل کاربر بی‌پیوند گزارش می‌شود تا نام‌های کاربری بیرون از شرکت لو نرود
            rejected = []
            for uid in valid_user_ids:
                if uid not in existing_users:
                    rejected.append(uid)
                    continue
                try:
                    ensure_assignment(request.user, uid, company_id)
                except PermissionDenied:
                    rejected.append(uid)
            if rejected:
                # نام کاربری فقط برای کاربرانی که در شرکت‌های قابل خواندن نویسنده دیده می‌شوند (بقیه با شناسه)
                visible = readable_company_ids(request.user)
                visible_members = SectionAssignment.objects.filter(assignments_in_companies_q(visible)).values('user_id')
                names = dict(User.objects.filter(id__in=rejected).filter(
                    Q(company_accesses__company_id__in=visible) | Q(id__in=visible_members)
                ).distinct().values_list('id', 'username'))
                labels = '، '.join(names.get(uid, f'#{uid}') for uid in rejected)
                raise PermissionDenied(f"این کاربران را نمی‌توان در این {TARGET_LABELS[field]} منتسب کرد (با شرکت آن پیوند ندارند یا انتساب خود است): {labels}. آن‌ها را از انتخاب بردارید.")

        if not existing_users:
            return Response({'error': 'هیچ یک از کاربران ارسالی در سیستم یافت نشدند.'}, status=status.HTTP_404_NOT_FOUND)

        created_ids = []
        with transaction.atomic():
            for uid in valid_user_ids:
                if uid not in existing_users:
                    continue
                assignment, _ = SectionAssignment.objects.get_or_create(
                    user_id=uid, role=role, **{field: target}, defaults={'is_active': True}
                )
                if not assignment.is_active:
                    assignment.is_active = True
                    assignment.save(update_fields=['is_active', 'updated_at'])
                created_ids.append(assignment.id)

        project_id = target.id if field == 'project' else (target.project_id if field == 'section' else None)
        _broadcast(request, 'assignment', 'bulk_create', None, f"{len(created_ids)} کاربر", project_id, company_id)
        qs = SectionAssignment.objects.filter(id__in=created_ids).select_related(
            'user', 'company', 'project__company', 'section__project__company'
        )
        return Response(self.get_serializer(qs, many=True).data, status=status.HTTP_201_CREATED)
