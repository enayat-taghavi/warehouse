"""
Index page of the training videos (plan §3.5): Documents/Training_Videos/videos/index.html with each video's
title, length and a player (desktop and mobile side by side), subtitles attached as a track when present.

    tests/playwright/.venv-tools/Scripts/python tools/index.py
"""
import html
import json
from pathlib import Path

from media import duration_ms

ROOT = Path(__file__).resolve().parents[1]
VIDEOS = ROOT.parents[1] / 'Documents' / 'Training_Videos' / 'videos'
SCENARIOS = ROOT / 'scenarios'


def to_vtt(srt):
    vtt = srt.with_suffix('.vtt')
    lines = [line.replace(',', '.') if '-->' in line else line
             for line in srt.read_text(encoding='utf-8').splitlines()]
    vtt.write_text('WEBVTT\n\n' + '\n'.join(lines) + '\n', encoding='utf-8')
    return vtt


def length(ms):
    s = ms // 1000
    return f'{s // 60}:{s % 60:02d}'


def main():
    VIDEOS.mkdir(parents=True, exist_ok=True)
    rows = []
    for captions in sorted(SCENARIOS.glob('*.captions.json')):
        data = json.loads(captions.read_text(encoding='utf-8'))
        cells = []
        for profile, label in (('desktop', 'کامپیوتر'), ('mobile', 'گوشی')):
            mp4 = VIDEOS / f"{data['video']}-{profile}.mp4"
            if not mp4.exists():
                cells.append(f'<div class="cell"><h3>{label}</h3><p class="muted">هنوز ضبط نشده</p></div>')
                continue
            srt = mp4.with_suffix('.srt')
            track = (f'<track kind="subtitles" srclang="fa" label="فارسی" src="{to_vtt(srt).name}">'
                     if srt.exists() else '')
            cells.append(f'<div class="cell {profile}"><h3>{label} · {length(duration_ms(mp4))}</h3>'
                         f'<video controls preload="metadata" src="{mp4.name}">{track}</video></div>')
        rows.append(f"<section><h2>فیلم {html.escape(data['number'])}: {html.escape(data['title'])}</h2>"
                    f"<div class=\"row\">{''.join(cells)}</div></section>")
    page = f"""<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>فیلم‌های آموزشی</title>
<style>
body{{font-family:Vazirmatn,Tahoma,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:24px}}
h1{{font-size:22px}} h2{{font-size:17px;margin:0 0 12px}} h3{{font-size:13px;margin:0 0 6px;color:#475569}}
section{{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px;margin-bottom:18px}}
.row{{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start}} .cell{{flex:1 1 320px}}
.cell.mobile{{flex:0 1 280px}} video{{width:100%;border-radius:10px;background:#000}} .muted{{color:#94a3b8}}
</style></head><body><h1>فیلم‌های آموزشی سامانه</h1>{''.join(rows)}</body></html>"""
    (VIDEOS / 'index.html').write_text(page, encoding='utf-8')
    print(f'index: {len(rows)} videos -> {VIDEOS / "index.html"}')


if __name__ == '__main__':
    main()
