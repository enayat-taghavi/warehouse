import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from typing import Any, Optional

from django.conf import settings


VERSION_PATTERN = re.compile(r'^\d{1,4}\.\d{1,4}\.\d{1,4}$')
FILE_NAME_PATTERN = re.compile(r'^[A-Za-z0-9._-]+\.(zip|apk)$')


def is_valid_version(val: Any) -> bool:
    """
    اعتبارسنجی قالب نگارش به صورت X.Y.Z (هر بخش بین ۱ تا ۴ رقم).
    """
    if not isinstance(val, str):
        return False
    return bool(VERSION_PATTERN.match(val))


def validate_version(val: Any) -> None:
    """
    در صورت نامعتبر بودن نسخه، استثنای ValueError پرتاب می‌کند.
    """
    if not is_valid_version(val):
        raise ValueError(f"Invalid version format: '{val}'. Expected 'X.Y.Z'.")


def is_safe_filename(name: Any) -> bool:
    """
    بررسی نام فایل به طوری که فقط شامل حروف، ارقام، نقطه، زیرخط و خط تیره بوده
    و حتماً به پسوند .zip یا .apk ختم شود و حاوی کاراکترهای خطرناک یا پیمایش پوشه نباشد.
    """
    if not isinstance(name, str) or not name:
        return False
    if '..' in name or '/' in name or '\\' in name:
        return False
    return bool(FILE_NAME_PATTERN.match(name))


def get_mobile_dir() -> Path:
    return Path(settings.MEDIA_ROOT) / 'mobile'


def get_updates_dir() -> Path:
    return get_mobile_dir() / 'updates'


def get_apk_dir() -> Path:
    return get_mobile_dir() / 'apk'


def get_manifest_path() -> Path:
    return get_updates_dir() / 'manifest.json'


def compute_sha256(source: Any) -> str:
    """
    محاسبه هش SHA-256 برای یک فایل روی دیسک یا رشته بایتی به صورت هگزادسیمال حروف کوچک.
    """
    hasher = hashlib.sha256()
    if isinstance(source, (str, Path)):
        path = Path(source)
        with open(path, 'rb') as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
    elif isinstance(source, (bytes, bytearray)):
        hasher.update(source)
    else:
        raise TypeError(f"Expected file path or bytes, got {type(source).__name__}")
    return hasher.hexdigest().lower()


def read_manifest() -> Optional[dict]:
    """
    خواندن فایل manifest.json از مسیر MEDIA_ROOT/mobile/updates/manifest.json.
    در صورت نبود فایل، خرابی JSON یا نامعتبر بودن فیلدها، مقدار None برگردانده می‌شود.
    """
    manifest_path = get_manifest_path()
    if not manifest_path.is_file():
        return None

    try:
        with open(manifest_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception:
        return None

    if not isinstance(data, dict):
        return None

    required_keys = ('version', 'file', 'sha256', 'min_native_version', 'published_at')
    if not all(k in data and isinstance(data[k], str) and data[k].strip() for k in required_keys):
        return None

    if not is_valid_version(data['version']):
        return None

    if not is_valid_version(data['min_native_version']):
        return None

    filename = data['file']
    if not is_safe_filename(filename) or not filename.endswith('.zip'):
        return None

    sha = data['sha256']
    if len(sha) != 64 or not all(c in '0123456789abcdefABCDEF' for c in sha):
        return None

    return data


def write_manifest_atomically(manifest: dict) -> Path:
    """
    نوشتن مانیفست به صورت اتمیک در پوشه updates با استفاده از فایل موقت و جایگزینی (os.replace).
    """
    if not isinstance(manifest, dict):
        raise ValueError("Manifest must be a dictionary.")

    required_keys = ('version', 'file', 'sha256', 'min_native_version', 'published_at')
    for k in required_keys:
        if k not in manifest or not isinstance(manifest[k], str):
            raise ValueError(f"Manifest missing required string key: '{k}'")

    validate_version(manifest['version'])
    validate_version(manifest['min_native_version'])

    updates_dir = get_updates_dir()
    updates_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = get_manifest_path()

    temp_file = tempfile.NamedTemporaryFile(
        dir=updates_dir,
        prefix='manifest_',
        suffix='.tmp',
        delete=False,
        mode='w',
        encoding='utf-8',
    )
    temp_path = Path(temp_file.name)
    try:
        json.dump(manifest, temp_file, indent=2, ensure_ascii=False)
        temp_file.flush()
        os.fsync(temp_file.fileno())
        temp_file.close()
        os.replace(temp_path, manifest_path)
    except Exception:
        temp_file.close()
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass
        raise

    return manifest_path
