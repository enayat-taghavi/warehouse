"""Shared ffmpeg helpers for the training-video tools (ffmpeg comes from imageio-ffmpeg, i.e. PyPI)."""
import re
import subprocess


def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def run(args):
    result = subprocess.run([ffmpeg(), '-hide_banner', '-y', *args], capture_output=True, text=True,
                            encoding='utf-8', errors='replace')
    if result.returncode != 0:
        raise RuntimeError(f'ffmpeg failed ({result.returncode}): {result.stderr[-1500:]}')
    return result


def duration_ms(path):
    """Media length in ms, read from ffmpeg's header line (decodes the file when the header has no length)."""
    result = subprocess.run([ffmpeg(), '-hide_banner', '-i', str(path), '-f', 'null', '-'], capture_output=True,
                            text=True, encoding='utf-8', errors='replace')
    times = re.findall(r'time=(\d+):(\d+):(\d+(?:\.\d+)?)', result.stderr)
    found = times[-1] if times else re.search(r'Duration: (\d+):(\d+):(\d+(?:\.\d+)?)', result.stderr)
    if not found:
        raise RuntimeError(f'no duration for {path}')
    h, m, s = (found if isinstance(found, tuple) else found.groups())
    return int((int(h) * 3600 + int(m) * 60 + float(s)) * 1000)
