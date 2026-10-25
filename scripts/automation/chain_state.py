"""
State of the automatic sub-step chain (Release v1 2.4–2.8, memory `feedback_auto_chain_substeps`).

One recurring scheduled task (`release-v1-chain`, every 30 minutes) and an immediate run at the end of each chat both
start a fresh chat whose first action is `claim`. Only one chat can hold the lock (`scratch/chain.lock`, created with
O_EXCL); a lock older than STALE_HOURS is taken over (the previous chat died).

    python scripts/automation/chain_state.py claim
        CLAIMED next=<sub-step> brief=<path>   -> do this sub-step
        STALE next=<sub-step> brief=<path>     -> previous chat died; check git status/log, then continue it
        BUSY since=<utc>                       -> another chat is working; stop
        WAITING note=<text>                    -> waiting for the user's answer; stop
        DONE                                   -> chain finished; stop
    python scripts/automation/chain_state.py release --next 2.4-c --brief scratch/brief_2.4_c.md
    python scripts/automation/chain_state.py wait --note "question for the user"
    python scripts/automation/chain_state.py done
    python scripts/automation/chain_state.py show
"""
import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / 'scratch' / 'chain_state.json'
LOCK = ROOT / 'scratch' / 'chain.lock'
STALE_HOURS = 4


def now():
    return datetime.now(timezone.utc).replace(microsecond=0)


def read_state():
    try:
        return json.loads(STATE.read_text(encoding='utf-8'))
    except FileNotFoundError:
        return None


def write_state(**changes):
    state = read_state() or {}
    state.update(changes, updated=now().isoformat())
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
    return state


def drop_lock():
    try:
        LOCK.unlink()
    except FileNotFoundError:
        pass


def claim():
    state = read_state()
    if state is None:
        return 'NO_STATE'
    if state.get('status') == 'done':
        return 'DONE'
    if state.get('status') == 'waiting_user':
        return f"WAITING note={state.get('note', '')}"
    stale = False
    try:
        fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        try:
            since = datetime.fromisoformat(LOCK.read_text(encoding='utf-8').strip())
        except (OSError, ValueError):
            since = now() - timedelta(hours=STALE_HOURS + 1)
        if now() - since < timedelta(hours=STALE_HOURS):
            return f'BUSY since={since.isoformat()}'
        stale = True
        LOCK.write_text(now().isoformat(), encoding='utf-8')
    else:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(now().isoformat())
    state = write_state(status='running', started=now().isoformat())
    word = 'STALE' if stale else 'CLAIMED'
    return f"{word} next={state.get('next', '')} brief={state.get('brief', '')}"


def main(argv=None):
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='cmd', required=True)
    sub.add_parser('claim')
    p = sub.add_parser('release')
    p.add_argument('--next', required=True)
    p.add_argument('--brief', required=True)
    p = sub.add_parser('wait')
    p.add_argument('--note', required=True)
    sub.add_parser('done')
    sub.add_parser('show')
    args = parser.parse_args(argv)

    if args.cmd == 'claim':
        print(claim())
    elif args.cmd == 'release':
        write_state(status='ready', next=args.next, brief=args.brief, note='')
        drop_lock()
        print(f'RELEASED next={args.next}')
    elif args.cmd == 'wait':
        write_state(status='waiting_user', note=args.note)
        drop_lock()
        print('WAITING')
    elif args.cmd == 'done':
        write_state(status='done', note='')
        drop_lock()
        print('DONE')
    else:
        print(json.dumps(read_state(), ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
