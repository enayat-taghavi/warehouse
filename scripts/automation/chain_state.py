"""
State of the automatic sub-step chain (Release v1 2.4–2.8, memory `feedback_auto_chain_substeps`).

One recurring scheduled task (`release-v1-chain`, every 10 minutes) starts a fresh chat whose first action is `claim`
(a scheduled run can neither create nor start another scheduled task, so there is no immediate hand-off). Only one chat can hold the lock (`scratch/chain.lock`, created with
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
    python scripts/automation/chain_state.py peek   -> READY | STALE | BUSY | WAITING | DONE | NO_STATE (no lock taken)

`gate` is the UserPromptSubmit hook in .claude/settings.json: a scheduled `release-v1-chain` prompt is blocked (exit 2,
no model call, no tokens) unless peek says READY or STALE; every other prompt passes untouched.

Several chains (one per master-plan stage) each have their own task, state file and lock; pick one with
`--chain <task name>` before the command (default `release-v1-chain`, stage 2), e.g.
    python scripts/automation/chain_state.py --chain release-v1-stage3-chain claim
A chain whose state file does not exist yet is NO_STATE, so its task is gated before the model until seeded.
"""
import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHAINS = {  # scheduled task name -> (state file, lock file) under scratch/
    'release-v1-chain': ('chain_state.json', 'chain.lock'),
    'release-v1-stage3-chain': ('chain_state_stage3.json', 'chain_stage3.lock'),
    'release-v1-stage4-chain': ('chain_state_stage4.json', 'chain_stage4.lock'),
    'release-v1-stage5-chain': ('chain_state_stage5.json', 'chain_stage5.lock'),
    'training-videos-chain': ('chain_state_videos.json', 'chain_videos.lock'),
}
DEFAULT_CHAIN = 'release-v1-chain'
STATE = ROOT / 'scratch' / CHAINS[DEFAULT_CHAIN][0]
LOCK = ROOT / 'scratch' / CHAINS[DEFAULT_CHAIN][1]
STALE_HOURS = 4


def select_chain(name):
    global STATE, LOCK
    state_name, lock_name = CHAINS[name]
    STATE = ROOT / 'scratch' / state_name
    LOCK = ROOT / 'scratch' / lock_name


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


def peek():
    """Read-only twin of claim(): the word claim() would print first, without taking the lock."""
    state = read_state()
    if state is None:
        return 'NO_STATE'
    if state.get('status') == 'done':
        return 'DONE'
    if state.get('status') == 'waiting_user':
        return 'WAITING'
    try:
        since = datetime.fromisoformat(LOCK.read_text(encoding='utf-8').strip())
    except FileNotFoundError:
        return 'READY'
    except (OSError, ValueError):
        return 'STALE'
    return 'BUSY' if now() - since < timedelta(hours=STALE_HOURS) else 'STALE'


def gate():
    """UserPromptSubmit hook: stop a scheduled chain run before the model is called when there is nothing to do.

    Exit 2 blocks the prompt (no model call, no tokens). Any other prompt, READY/STALE, or any error passes (fail open).
    """
    try:
        prompt = json.load(sys.stdin).get('prompt') or ''
        name = next((n for n in CHAINS if f'<scheduled-task name="{n}"' in prompt), None)
        if name is None:
            return 0
        select_chain(name)
        word = peek()
    except Exception:
        return 0
    if word in ('READY', 'STALE'):
        return 0
    print(f'{name}: {word}; run skipped before the model (chain_state.py gate).', file=sys.stderr)
    return 2


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--chain', choices=sorted(CHAINS), default=DEFAULT_CHAIN)
    sub = parser.add_subparsers(dest='cmd', required=True)
    sub.add_parser('claim')
    p = sub.add_parser('release')
    p.add_argument('--next', required=True)
    p.add_argument('--brief', required=True)
    p = sub.add_parser('wait')
    p.add_argument('--note', required=True)
    sub.add_parser('done')
    sub.add_parser('show')
    sub.add_parser('peek')
    sub.add_parser('gate')
    args = parser.parse_args(argv)

    if args.cmd == 'gate':  # chain comes from the prompt's task name
        return gate()
    select_chain(args.chain)
    if args.cmd == 'peek':
        print(peek())
    elif args.cmd == 'claim':
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
