"""آزمون هوک .claude/hooks/guard.py برای هر دو قرارداد (Claude Code و Antigravity).

اجرا: python scripts/test_guard_hooks.py  (کد خروج ۰ یعنی همه پاس)
"""
import json
import os
import shutil
import os
import subprocess
import sys
import tempfile
import uuid

S = chr(92)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
G = ROOT + S + '.claude' + S + 'hooks' + S + 'guard.py'
FA = ''.join(map(chr, [0x627, 0x646, 0x628, 0x627, 0x631]))
FRONT = ROOT + S + 'frontend' + S + 'src' + S + 'app' + S
bad = 0
test_backup_dir = tempfile.mkdtemp(prefix='guard_test_bkp_')
os.environ['TEST_GUARD_BACKUP_DIR'] = test_backup_dir


def run_raw(data):
    p = subprocess.run([sys.executable, G], input=data, capture_output=True, env=os.environ.copy())
    return p.returncode, p.stdout.decode()


def run(payload):
    return run_raw(json.dumps(payload).encode())


# 1) Antigravity: قرارداد خروجی (قالبی که Antigravity از .agents/hooks.json می‌گیرد)
def ag(name, payload, check):
    global bad
    out = run(payload)[1]
    lines = [json.loads(line) for line in out.strip().splitlines()]
    ok = check(lines)
    bad += not ok
    print(('OK ' if ok else 'BAD'), f'antigravity {name:34s} -> {[sorted(x) for x in lines]}')


ag('grep Persian -> deny', {'toolCall': {'name': 'run_command', 'args': {'CommandLine': 'grep ' + FA + ' x'}}},
   lambda ls: len(ls) == 1 and ls[0]['decision'] == 'deny' and ls[0]['reason'] and ls[0]['hookSpecificOutput']['permissionDecision'] == 'deny')
ag('grep ASCII -> allow', {'toolCall': {'name': 'run_command', 'args': {'CommandLine': 'grep abc x'}}},
   lambda ls: ls == [{'decision': 'allow'}])
ag('new root file -> deny', {'toolCall': {'name': 'write_to_file', 'args': {'TargetFile': ROOT + S + 'zz_new.txt', 'CodeContent': 'x'}}},
   lambda ls: len(ls) == 1 and ls[0]['decision'] == 'deny')
ag('status check -> warn + allow', {'toolCall': {'name': 'write_to_file', 'args': {'TargetFile': ROOT + S + 'frontend' + S + 'src' + S + 'app' + S + 'a.ts', 'CodeContent': 'status === 0'}}},
   lambda ls: len(ls) == 2 and ls[0]['hookSpecificOutput']['additionalContext'] and ls[1] == {'decision': 'allow'})
ag('plain replace -> allow', {'toolCall': {'name': 'replace_file_content', 'args': {'TargetFile': ROOT + S + 'frontend' + S + 'src' + S + 'app' + S + 'a.ts', 'ReplacementContent': 'x'}}},
   lambda ls: ls == [{'decision': 'allow'}])
ag('migrate without backup -> deny', {'toolCall': {'name': 'run_command', 'args': {'CommandLine': 'python manage.py migrate'}}},
   lambda ls: len(ls) == 1 and ls[0]['decision'] == 'deny' and 'safe-migration' in ls[0]['reason'])
ag('migrate --plan -> allow', {'toolCall': {'name': 'run_command', 'args': {'CommandLine': 'python manage.py migrate --plan'}}},
   lambda ls: ls == [{'decision': 'allow'}])
ag('showmigrations -> allow', {'toolCall': {'name': 'run_command', 'args': {'CommandLine': 'python manage.py showmigrations'}}},
   lambda ls: ls == [{'decision': 'allow'}])
ag('manage.py test -> allow', {'toolCall': {'name': 'run_command', 'args': {'CommandLine': 'python manage.py test personnel'}}},
   lambda ls: ls == [{'decision': 'allow'}])



# 2) Claude Code: خروجی خالی یا دقیقاً یک JSON معتبر، بدون فیلد decision
def claude(name, ev, tool, inp, expect, extra=None):
    global bad
    code, out = run({'hook_event_name': ev, 'tool_name': tool, 'tool_input': inp, **(extra or {})})
    out = out.strip()
    if not out:
        got = 'pass'
    else:
        try:
            obj = json.loads(out)
        except Exception:
            obj, got = None, 'INVALID-JSON'
        if obj is not None:
            if 'decision' in obj:
                got = 'HAS-DECISION'
            else:
                h = obj.get('hookSpecificOutput', {})
                ctx = h.get('additionalContext', '')
                got = h.get('permissionDecision') or (('warn%d' % (ctx.count('\n') + 1)) if ctx else '?')
    ok = got == expect and code == 0
    bad += not ok
    print(('OK ' if ok else 'BAD'), f'{name:44s} got={got} expect={expect}')


LOGIN = FRONT + 'modules' + S + 'common' + S + 'components' + S + 'login' + S + 'login.html'
TS = FRONT + 'modules' + S + 'common' + S + 'components' + S + 'login' + S + 'login.ts'
claude('Write new root file', 'PreToolUse', 'Write', {'file_path': ROOT + S + 'zz.txt', 'content': 'x'}, 'deny')
claude('Write existing CLAUDE.md', 'PreToolUse', 'Write', {'file_path': ROOT + S + 'CLAUDE.md', 'content': 'x'}, 'pass')
claude('Write new file in scripts/', 'PreToolUse', 'Write', {'file_path': ROOT + S + 'scripts' + S + 'n.py', 'content': 'x'}, 'pass')
claude('Bash grep Persian', 'PreToolUse', 'Bash', {'command': 'grep -rn "' + FA + '" .'}, 'deny')
claude('Bash rg Persian in pipe', 'PreToolUse', 'Bash', {'command': 'cat a | rg ' + FA}, 'deny')
claude('Bash grep ASCII', 'PreToolUse', 'Bash', {'command': 'grep -rn warehouse .'}, 'pass')
claude('Bash sleep 60 -> deny', 'PreToolUse', 'Bash', {'command': 'sleep 60 && tail -5 x.log'}, 'deny')
claude('Bash sleep 2m -> deny', 'PreToolUse', 'Bash', {'command': 'ls; sleep 2m'}, 'deny')
claude('Bash Start-Sleep 30 -> deny', 'PreToolUse', 'Bash', {'command': 'powershell Start-Sleep -Seconds 30'}, 'deny')
claude('Bash sleep 3 -> pass', 'PreToolUse', 'Bash', {'command': 'sleep 3; curl -s localhost:8000'}, 'pass')
claude('Bash sleepy word -> pass', 'PreToolUse', 'Bash', {'command': 'echo nosleep 99'}, 'pass')
claude('Bash echo Persian', 'PreToolUse', 'Bash', {'command': 'echo ' + FA}, 'pass')
claude('Bash migrate without backup', 'PreToolUse', 'Bash', {'command': 'python manage.py migrate'}, 'deny')
claude('Bash migrate --plan', 'PreToolUse', 'Bash', {'command': 'python manage.py migrate --plan'}, 'pass')
claude('Bash manage.py test', 'PreToolUse', 'Bash', {'command': 'python manage.py test personnel'}, 'pass')

dummy_dump = os.path.join(test_backup_dir, 'test_dummy_fresh.dump')
dummy_meta = dummy_dump + '.meta.json'
try:
    with open(dummy_dump, 'w') as f:
        f.write('dummy')
    with open(dummy_meta, 'w') as f:
        f.write('{}')
    ag('migrate with fresh backup -> allow', {'toolCall': {'name': 'run_command', 'args': {'CommandLine': 'python manage.py migrate'}}},
       lambda ls: ls == [{'decision': 'allow'}])
    claude('Bash migrate with fresh backup', 'PreToolUse', 'Bash', {'command': 'python manage.py migrate'}, 'pass')
finally:
    if os.path.exists(dummy_dump):
        os.remove(dummy_dump)
    if os.path.exists(dummy_meta):
        os.remove(dummy_meta)

claude('Post .ts status === 530', 'PostToolUse', 'Edit', {'file_path': TS, 'new_string': 'if (status === 530) {'}, 'warn1')
claude('Post .ts isServerUnreachable', 'PostToolUse', 'Edit', {'file_path': TS, 'new_string': 'if (isServerUnreachable(s)) {'}, 'pass')
claude('Post server-reachability.ts', 'PostToolUse', 'Edit', {'file_path': FRONT + 'core' + S + 'services' + S + 'server-reachability.ts', 'new_string': 'status === 0'}, 'pass')
claude('Post .html img without alt', 'PostToolUse', 'Edit', {'file_path': LOGIN, 'new_string': '<img [src]="x" class="w-8">'}, 'warn1')
claude('Post .html img with alt=""', 'PostToolUse', 'Edit', {'file_path': LOGIN, 'new_string': '<img [src]="x" alt="">'}, 'pass')
claude('Post .html img with [alt]', 'PostToolUse', 'Edit', {'file_path': LOGIN, 'new_string': '<img [ngSrc]="x" [alt]="name" width="4" height="4">'}, 'pass')
claude('Post .html img *ngIf with > in attr', 'PostToolUse', 'Edit', {'file_path': LOGIN, 'new_string': '<img *ngIf="a > 0" [src]="x" alt="t">'}, 'pass')
claude('Post .html style hex color', 'PostToolUse', 'Edit', {'file_path': LOGIN, 'new_string': '<div style="padding:4px; color:#ff0000">'}, 'warn1')
claude('Post .html style rgb background', 'PostToolUse', 'Edit', {'file_path': LOGIN, 'new_string': "<div style='background: rgb(1,2,3)'>"}, 'warn1')
claude('Post .html style no color', 'PostToolUse', 'Edit', {'file_path': LOGIN, 'new_string': '<div style="font-size:8px;">'}, 'pass')
claude('Post .html outline-none alone', 'PostToolUse', 'Edit', {'file_path': LOGIN, 'new_string': '<input class="border focus:outline-none">'}, 'warn1')
claude('Post .html outline-none + focus:ring', 'PostToolUse', 'Edit', {'file_path': LOGIN, 'new_string': '<input class="focus:outline-none focus:ring-2 focus:ring-indigo-500">'}, 'pass')
claude('Post .html outline-none + focus-visible', 'PostToolUse', 'Edit', {'file_path': LOGIN, 'new_string': '<button class="outline-none focus-visible:ring-2">'}, 'pass')
claude('Post .ts status + img no alt = one JSON', 'PostToolUse', 'Edit', {'file_path': TS, 'new_string': 'status === 0; t = `<img src="a">`'}, 'warn2')
claude('Post .spec.ts ignored', 'PostToolUse', 'Write', {'file_path': FRONT + 'x.spec.ts', 'content': '<img src=a> status === 0'}, 'pass')
claude('Post icon-registry.ts ignored', 'PostToolUse', 'Write', {'file_path': FRONT + 'shared' + S + 'icons' + S + 'icon-registry.ts', 'content': '<img src=a>'}, 'pass')
claude('Post backend .py ignored', 'PostToolUse', 'Edit', {'file_path': ROOT + S + 'backend' + S + 'x.py', 'new_string': 'status >= 500 <img src=a>'}, 'pass')


# 3) نگهبان اندازهٔ context: transcript موقت و session یکتا
TMP = tempfile.mkdtemp()
SID = 'test-' + uuid.uuid4().hex
STATE = ROOT + S + '.claude' + S + 'tmp' + S + 'context-watch' + S + SID


def transcript(ctx, sidechain_ctx=None):
    path = os.path.join(TMP, 't.jsonl')
    rows = [{'type': 'user', 'message': {'content': 'x'}},
            {'type': 'assistant', 'message': {'usage': {
                'input_tokens': 1, 'cache_read_input_tokens': ctx - 1, 'cache_creation_input_tokens': 0}}}]
    if sidechain_ctx:
        rows.append({'type': 'assistant', 'isSidechain': True, 'message': {'usage': {'input_tokens': sidechain_ctx}}})
    rows.append({'type': 'assistant', 'message': {'model': '<synthetic>', 'usage': {'input_tokens': 0}}})
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(json.dumps(r) for r in rows) + '\n')
    return {'transcript_path': path, 'session_id': SID}


READ = {'file_path': ROOT + S + 'CLAUDE.md'}
claude('ctx 170K -> silent', 'PostToolUse', 'Read', READ, 'pass', transcript(170_000))
claude('ctx 210K -> warn', 'PostToolUse', 'Read', READ, 'warn1', transcript(210_000))
claude('ctx 210K again -> no repeat', 'PostToolUse', 'Read', READ, 'pass', transcript(210_000))
claude('ctx 260K -> warn', 'PostToolUse', 'Read', READ, 'warn1', transcript(260_000))
claude('ctx 50K (compact) -> silent reset', 'PostToolUse', 'Read', READ, 'pass', transcript(50_000))
claude('ctx 210K after reset -> warn', 'PostToolUse', 'Read', READ, 'warn1', transcript(210_000))
claude('sidechain 900K ignored', 'PostToolUse', 'Read', READ, 'pass', transcript(210_000, 900_000))
claude('subagent (agent_id) silent', 'PostToolUse', 'Read', READ, 'pass', {**transcript(900_000), 'agent_id': 'a1'})
claude('Edit UI warn + ctx warn = one JSON', 'PostToolUse', 'Edit', {'file_path': TS, 'new_string': 'status === 0'}, 'warn2', transcript(570_000))
claude('missing transcript -> silent', 'PostToolUse', 'Read', READ, 'pass', {'transcript_path': os.path.join(TMP, 'none.jsonl'), 'session_id': SID})
claude('Bash post 680K -> warn', 'PostToolUse', 'Bash', {'command': 'ls'}, 'warn1', transcript(680_000))
claude('PreToolUse never checks ctx', 'PreToolUse', 'Bash', {'command': 'ls'}, 'pass', transcript(990_000))
shutil.rmtree(TMP, ignore_errors=True)
shutil.rmtree(test_backup_dir, ignore_errors=True)
if os.path.exists(STATE):
    os.remove(STATE)
code, out = run_raw(b'not json')
ok = out.strip() == '' and code == 0
bad += not ok
print(('OK ' if ok else 'BAD'), 'malformed stdin -> no output, exit 0')
print('FAILURES:', bad)
sys.exit(1 if bad else 0)
