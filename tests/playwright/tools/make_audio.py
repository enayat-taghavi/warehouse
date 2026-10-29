"""
Narration audio for the training videos (plan §3.1).

Reads every scenarios/*.captions.json, makes one mp3 per caption line with Edge TTS (voice fa-IR-DilaraNeural,
or env TV_VOICE) and writes audio/manifest.json: {"<video>/<id>": {"file": ..., "ms": ..., "sha": ...}}.
Unchanged lines (same text and voice) are not fetched again.

    tests/playwright/.venv-tools/Scripts/python tools/make_audio.py [--only 00-intro]
"""
import nowmi  # noqa: F401  (first: WMI may hang)
import argparse
import asyncio
import hashlib
import json
import os
import sys
from pathlib import Path

from media import duration_ms

ROOT = Path(__file__).resolve().parents[1]
SCENARIOS = ROOT / 'scenarios'
AUDIO = ROOT / 'audio'
MANIFEST = AUDIO / 'manifest.json'
VOICE = os.environ.get('TV_VOICE', 'fa-IR-DilaraNeural')


async def synth(text, target):
    import edge_tts
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_suffix('.part')
    await edge_tts.Communicate(text, VOICE).save(str(temp))
    temp.replace(target)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', help='one video name, e.g. 00-intro')
    args = parser.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {}
    files = sorted(SCENARIOS.glob('*.captions.json'))
    if args.only:
        files = [f for f in files if f.name.startswith(args.only)]
    if not files:
        sys.exit('no captions file found')
    made = kept = 0
    for path in files:
        data = json.loads(path.read_text(encoding='utf-8'))
        video = data['video']
        for line_id, text in data['lines'].items():
            key = f'{video}/{line_id}'
            sha = hashlib.sha1(f'{VOICE}|{text}'.encode('utf-8')).hexdigest()
            target = AUDIO / video / f'{line_id}.mp3'
            entry = manifest.get(key)
            if entry and entry.get('sha') == sha and target.exists():
                kept += 1
                continue
            for attempt in range(3):
                try:
                    asyncio.run(synth(text, target))
                    break
                except Exception as exc:  # network hiccup: retry, then fail loudly
                    if attempt == 2:
                        sys.exit(f'TTS failed for {key}: {exc}')
            manifest[key] = {'file': f'{video}/{line_id}.mp3', 'ms': duration_ms(target), 'sha': sha}
            made += 1
    AUDIO.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'audio: {made} made, {kept} unchanged, manifest {MANIFEST}')


if __name__ == '__main__':
    main()
