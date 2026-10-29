"""
Python 3.12's platform module asks WMI for the Windows version; when the WMI service hangs (seen on this machine,
29 Oct 2026), `import aiohttp` (edge-tts) hangs with it. Import this module first: platform then falls back to
sys.getwindowsversion().
"""
import platform


def _no_wmi(*args, **kwargs):
    raise OSError('WMI query skipped')


platform._wmi_query = _no_wmi
