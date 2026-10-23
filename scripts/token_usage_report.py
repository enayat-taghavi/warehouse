"""
Token usage report for one Claude Code session (master plan rule ق15).

Reads the session transcript and its subagent transcripts under
~/.claude/projects/<project>/ and prints one row per transcript:
API calls, input/cache/output tokens, total and peak context.

Usage (from the repo root):
    python -X utf8 -I scripts/token_usage_report.py                  # newest session
    python -X utf8 -I scripts/token_usage_report.py <session-id>
    python -X utf8 -I scripts/token_usage_report.py --since 2026-10-23T12:00
"""
import argparse
import json
from pathlib import Path

PROJECT_DIR = Path.home() / '.claude' / 'projects' / 'E--comanager'


def read_usage(path, since=None):
    """{requestId: (usage, model)}; a request spans several lines, the last one wins."""
    calls = {}
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            try:
                row = json.loads(line)
            except ValueError:
                continue
            if row.get('type') != 'assistant':
                continue
            if since and row.get('timestamp', '') < since:
                continue
            msg = row.get('message') or {}
            usage = msg.get('usage')
            if not usage:
                continue
            key = row.get('requestId') or row.get('uuid')
            calls[key] = (usage, msg.get('model', '?'))
    return calls


def summarize(calls):
    s = {'calls': len(calls), 'input': 0, 'cache_write': 0, 'cache_read': 0, 'output': 0, 'peak': 0}
    models = set()
    for usage, model in calls.values():
        inp = usage.get('input_tokens', 0)
        cw = usage.get('cache_creation_input_tokens', 0)
        cr = usage.get('cache_read_input_tokens', 0)
        s['input'] += inp
        s['cache_write'] += cw
        s['cache_read'] += cr
        s['output'] += usage.get('output_tokens', 0)
        s['peak'] = max(s['peak'], inp + cw + cr)
        models.add(model)
    s['total'] = s['input'] + s['cache_write'] + s['cache_read'] + s['output']
    s['models'] = ','.join(sorted(models))
    return s


def subagent_label(path):
    meta = path.with_suffix('.meta.json')
    if meta.exists():
        try:
            data = json.loads(meta.read_text(encoding='utf-8'))
            return data.get('description') or data.get('agentType') or path.stem
        except ValueError:
            pass
    return path.stem


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('session', nargs='?', help='session id (default: newest transcript)')
    parser.add_argument('--since', help='only count calls at or after this ISO timestamp (UTC)')
    args = parser.parse_args()

    if args.session:
        main_path = PROJECT_DIR / f'{args.session}.jsonl'
    else:
        main_path = max(PROJECT_DIR.glob('*.jsonl'), key=lambda p: p.stat().st_mtime)
    sub_dir = PROJECT_DIR / main_path.stem / 'subagents'

    rows = [('manager', summarize(read_usage(main_path, args.since)))]
    for sub in sorted(sub_dir.glob('*.jsonl')) if sub_dir.exists() else []:
        s = summarize(read_usage(sub, args.since))
        if s['calls']:
            rows.append((subagent_label(sub), s))

    head = f"{'transcript':<40}{'calls':>7}{'total':>14}{'cache_read':>14}{'output':>10}{'peak_ctx':>10}  models"
    print(f'session {main_path.stem}' + (f' since {args.since}' if args.since else ''))
    print(head)
    total = {'calls': 0, 'total': 0, 'cache_read': 0, 'output': 0}
    for label, s in rows:
        print(f"{label[:39]:<40}{s['calls']:>7}{s['total']:>14,}{s['cache_read']:>14,}{s['output']:>10,}{s['peak']:>10,}  {s['models']}")
        for k in total:
            total[k] += s[k]
    print(f"{'TOTAL':<40}{total['calls']:>7}{total['total']:>14,}{total['cache_read']:>14,}{total['output']:>10,}")


if __name__ == '__main__':
    main()
