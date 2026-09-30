"""آزمون هوک .claude/hooks/guard.py برای هر دو قرارداد (Claude Code و Antigravity).

اجرا: python scripts/test_guard_hooks.py  (کد خروج ۰ یعنی همه پاس)
"""
import json
import os
import subprocess
import sys

S = chr(92)
ROOT = 'E:' + S + 'warehouse project'
G = ROOT + S + '.claude' + S + 'hooks' + S + 'guard.py'
FA = ''.join(map(chr, [0x627, 0x646, 0x628, 0x627, 0x631]))
FRONT = ROOT + S + 'warehouse-front' + S + 'src' + S + 'app' + S
bad = 0


def run_raw(data):
    p = subprocess.run([sys.executable, G], input=data, capture_output=True)
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
ag('new root file -> deny', {'toolCall': {'name': 'write_to_file', 'args': {'TargetFile': 'E:/warehouse project/zz_new.txt', 'CodeContent': 'x'}}},
   lambda ls: len(ls) == 1 and ls[0]['decision'] == 'deny')
ag('status check -> warn + allow', {'toolCall': {'name': 'write_to_file', 'args': {'TargetFile': 'E:/warehouse project/warehouse-front/src/app/a.ts', 'CodeContent': 'status === 0'}}},
   lambda ls: len(ls) == 2 and ls[0]['hookSpecificOutput']['additionalContext'] and ls[1] == {'decision': 'allow'})
ag('plain replace -> allow', {'toolCall': {'name': 'replace_file_content', 'args': {'TargetFile': 'E:/warehouse project/warehouse-front/src/app/a.ts', 'ReplacementContent': 'x'}}},
   lambda ls: ls == [{'decision': 'allow'}])


# 2) Claude Code: خروجی خالی یا دقیقاً یک JSON معتبر، بدون فیلد decision
def claude(name, ev, tool, inp, expect):
    global bad
    code, out = run({'hook_event_name': ev, 'tool_name': tool, 'tool_input': inp})
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


LOGIN = FRONT + 'components' + S + 'login' + S + 'login.html'
TS = FRONT + 'components' + S + 'login' + S + 'login.ts'
claude('Write new root file', 'PreToolUse', 'Write', {'file_path': ROOT + S + 'zz.txt', 'content': 'x'}, 'deny')
claude('Write existing CLAUDE.md', 'PreToolUse', 'Write', {'file_path': ROOT + S + 'CLAUDE.md', 'content': 'x'}, 'pass')
claude('Write new file in scripts/', 'PreToolUse', 'Write', {'file_path': ROOT + S + 'scripts' + S + 'n.py', 'content': 'x'}, 'pass')
claude('Bash grep Persian', 'PreToolUse', 'Bash', {'command': 'grep -rn "' + FA + '" .'}, 'deny')
claude('Bash rg Persian in pipe', 'PreToolUse', 'Bash', {'command': 'cat a | rg ' + FA}, 'deny')
claude('Bash grep ASCII', 'PreToolUse', 'Bash', {'command': 'grep -rn warehouse .'}, 'pass')
claude('Bash echo Persian', 'PreToolUse', 'Bash', {'command': 'echo ' + FA}, 'pass')
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
claude('Post backend .py ignored', 'PostToolUse', 'Edit', {'file_path': ROOT + S + 'warehouse-backend' + S + 'x.py', 'new_string': 'status >= 500 <img src=a>'}, 'pass')
code, out = run_raw(b'not json')
ok = out.strip() == '' and code == 0
bad += not ok
print(('OK ' if ok else 'BAD'), 'malformed stdin -> no output, exit 0')
print('FAILURES:', bad)
sys.exit(1 if bad else 0)
