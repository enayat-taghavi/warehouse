"""
Final videos (plan §3.1, §3.5): puts each narration line on the raw Playwright recording at the time the caption
appeared (adelay), encodes mp4 (H.264 + AAC) and writes the matching .srt.

Input:  output/timeline/<video>-<profile>.json (written by helpers/video.ts), output/raw/<video>-<profile>.webm,
        audio/manifest.json (make_audio.py).
Output: Documents/Training_Videos/videos/<video>-<profile>.mp4 and .srt

    tests/playwright/.venv-tools/Scripts/python tools/mux.py [--only 00-intro]
"""
import argparse
import json
import sys
from pathlib import Path

from media import run

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
TIMELINE = ROOT / 'output' / 'timeline'
RAW = ROOT / 'output' / 'raw'
AUDIO = ROOT / 'audio'
OUT = REPO / 'Documents' / 'Training_Videos' / 'videos'


def srt_time(ms):
    h, rest = divmod(int(ms), 3_600_000)
    m, rest = divmod(rest, 60_000)
    s, ms = divmod(rest, 1000)
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'


def write_srt(events, target):
    blocks = []
    for n, event in enumerate(events, start=1):
        start, end = event['startMs'], event['startMs'] + event['durMs']
        blocks.append(f"{n}\n{srt_time(start)} --> {srt_time(end)}\n{event['text']}\n")
    target.write_text('\n'.join(blocks), encoding='utf-8')


def mux(timeline_file, manifest):
    data = json.loads(timeline_file.read_text(encoding='utf-8'))
    name = timeline_file.stem
    raw = RAW / f'{name}.webm'
    if not raw.exists():
        raise SystemExit(f'missing raw recording {raw}')
    events = data['events']
    inputs, filters, labels = ['-i', str(raw)], [], []
    for event in events:
        entry = manifest.get(f"{data['video']}/{event['id']}")
        if not entry:
            raise SystemExit(f"no audio for {data['video']}/{event['id']}; run make_audio.py first")
        inputs += ['-i', str(AUDIO / entry['file'])]
        k = len(labels) + 1
        delay = max(0, int(event['startMs']))
        filters.append(f'[{k}:a]adelay={delay}|{delay},aresample=44100[a{k}]')
        labels.append(f'[a{k}]')
    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / f'{name}.mp4'
    video_codec = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '23',
                   '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-movflags', '+faststart']
    if labels:
        graph = ';'.join(filters) + f";{''.join(labels)}amix=inputs={len(labels)}:normalize=0:dropout_transition=0[aout]"
        args = [*inputs, '-filter_complex', graph, '-map', '0:v', '-map', '[aout]', *video_codec,
                '-c:a', 'aac', '-b:a', '128k', str(target)]
    else:
        args = ['-i', str(raw), *video_codec, '-an', str(target)]
    run(args)
    write_srt(events, OUT / f'{name}.srt')
    print(f'{target.name}: {target.stat().st_size // 1024} KB, {len(events)} captions')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', help='one video name, e.g. 00-intro')
    args = parser.parse_args()
    manifest_file = AUDIO / 'manifest.json'
    manifest = json.loads(manifest_file.read_text(encoding='utf-8')) if manifest_file.exists() else {}
    files = sorted(TIMELINE.glob('*.json'))
    if args.only:
        files = [f for f in files if f.name.startswith(args.only)]
    if not files:
        sys.exit('no timeline found; record in VIDEO_MODE=training first')
    for timeline_file in files:
        mux(timeline_file, manifest)


if __name__ == '__main__':
    main()
