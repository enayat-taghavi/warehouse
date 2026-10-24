"""
خطاهای موتور گردش کار (طرح ۲.۳). هر خطا کد ماشینی، پیام فارسی و وضعیت HTTP پیشنهادی دارد تا لایهٔ API
(۲.۳-ب) و صف آفلاین آن را بی‌تفسیر به پاسخ تبدیل کنند (ت۱۳: 409 با کد task_already_done «رد صریح» است).
"""


class WorkflowError(Exception):
    """خطای عمومی گردش کار."""
    default_code = 'workflow_error'
    default_message = 'خطای گردش کار'
    default_status = 400

    def __init__(self, code=None, message_fa=None, status=None):
        self.code = code or self.default_code
        self.message_fa = message_fa or self.default_message
        self.status = status or self.default_status
        super().__init__(self.message_fa)

    def as_dict(self) -> dict:
        return {'code': self.code, 'detail': self.message_fa}


class TaskAlreadyDone(WorkflowError):
    """کار بسته شده یا نسخهٔ مرحله عوض شده است (ت۱۳)."""
    default_code = 'task_already_done'
    default_message = 'این کار را نفر دیگری انجام داده است'
    default_status = 409


class WorkflowPermissionDenied(WorkflowError):
    """کاربر اجازهٔ این اقدام را ندارد (ثبت‌کننده، نادریافت‌کننده یا اقدام نامجاز مرحله)."""
    default_code = 'not_recipient'
    default_message = 'شما دریافت‌کنندهٔ این کار نیستید'
    default_status = 403


class WorkflowStateError(WorkflowError):
    """وضعیت گردش اجازهٔ این اقدام را نمی‌دهد."""
    default_code = 'invalid_state'
    default_message = 'وضعیت گردش کار اجازهٔ این اقدام را نمی‌دهد'
    default_status = 409


class ReasonRequired(WorkflowError):
    """عودت و رد بی‌دلیل پذیرفته نیست (ت۸)."""
    default_code = 'reason_required'
    default_message = 'برای عودت یا رد، نوشتن دلیل الزامی است'
    default_status = 400
