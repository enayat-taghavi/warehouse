"""
Quality check frames (plan §3.1): N evenly spaced PNG frames from each finished mp4, for Claude to look at.

Output: output/frames/<video>-<profile>-NN.png

    tests/playwright/.venv-tools/Scripts/python tools/frames.py [--only 00-intro] [--count 10]
"""
import argparse
from pathlib import Path

from media import duration_ms, run

ROOT = Path(__file__).resolve().parents[1]
VIDEOS = ROOT.parents[1] / 'Documents' / 'Training_Videos' / 'videos'
FRAMES = ROOT / 'output' / 'frames'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', help='one video name, e.g. 00-intro')
    parser.add_argument('--count', type=int, default=10)
    args = parser.parse_args()
    FRAMES.mkdir(parents=True, exist_ok=True)
    videos = sorted(VIDEOS.glob('*.mp4'))
    if args.only:
        videos = [v for v in videos if v.name.startswith(args.only)]
    for video in videos:
        total = duration_ms(video)
        for n in range(args.count):
            at = total * (n + 0.5) / args.count / 1000
            target = FRAMES / f'{video.stem}-{n + 1:02d}.png'
            run(['-ss', f'{at:.2f}', '-i', str(video), '-frames:v', '1', '-vf', 'scale=960:-2', str(target)])
        print(f'{video.name}: {args.count} frames, {total / 1000:.0f} s')


if __name__ == '__main__':
    main()
