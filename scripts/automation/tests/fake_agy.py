#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
agy ساختگی برای آزمون run_tasks_agy.py: همان رابط stream-json (یک خط NDJSON ورودی برای هر نوبت، رویداد result در پایان).
رفتار با خطوط دستوری داخل متن تسک تعیین می‌شود (متن نخستین پیام هر چت در FAKE_AGY_STATE نگه داشته می‌شود):

    FAKE-RUN: <فرمان>         در نوبت اول در cwd اجرا می‌شود
    FAKE-FIX: <فرمان>         در نوبت بعد از پیام «Verification failed»
    FAKE-ON-RESUME: <فرمان>   در نوبت بعد از پیام ادامهٔ runner
    FAKE-MAIN: <فرمان>        در نوبت اول در پوشهٔ FAKE_AGY_MAIN (شبیه‌سازی کار هم‌زمان روی پروژه)
    FAKE-SLEEP: <ثانیه>       پیش از result هر نوبت
    FAKE-FIRST: error-before | error-after | quota | stall | exit
                              نوبت اول: خطا بی‌کار، خطا پس از کار، خطای سهمیه، بی‌حرکتی، یا خروج فرایند
هر نوبت یک خط JSON در FAKE_AGY_STATE/turns.jsonl می‌نویسد (چت، cwd، نوع، زمان شروع و پایان).
"""

import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path

STATE = Path(os.environ.get("FAKE_AGY_STATE", "."))


def emit(event: dict):
    sys.stdout.write(json.dumps(event) + "\n")
    sys.stdout.flush()


def directives(text: str, key: str) -> list[str]:
    prefix = f"FAKE-{key}:"
    return [ln.strip()[len(prefix):].strip() for ln in text.splitlines() if ln.strip().startswith(prefix)]


def run_all(commands: list, cwd: str, step: list):
    for cmd in commands:
        r = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
        step[0] += 1
        emit({"event": "step_update", "step_update": {
            "step_index": step[0], "step_type": "tool", "state": "DONE",
            "tool_info": {"name": "run_command", "parameters": {"CommandLine": cmd},
                          **({"error": {"message": r.stderr[-200:]}} if r.returncode else {})}}})


def main() -> int:
    args = sys.argv[1:]
    if "--version" in args:
        print("fake-agy 0.0.1")
        return 0
    if args[:1] == ["models"]:
        print("gemini-3.8-flash-high\tGemini 3.8 Flash (High)\nfake-other\tFake")
        return 0

    conv = args[args.index("--conversation") + 1] if "--conversation" in args else f"fake-{uuid.uuid4().hex[:10]}"
    state_file = STATE / f"{conv}.json"
    state = json.loads(state_file.read_text(encoding="utf-8")) if state_file.exists() else {"turns": 0, "task": ""}
    emit({"event": "init", "conversation_id": conv, "cwd": os.getcwd()})
    step = [state.get("steps", 0)]

    for line in sys.stdin:
        if not line.strip():
            continue
        text = json.loads(line)["message"]["content"]
        state["turns"] += 1
        first = state["turns"] == 1
        if first:
            state["task"] = text
        task = state["task"]
        if first:
            kind = "first"
        elif "Verification failed" in text:
            kind = "fix"
        elif "previous turn ended" in text:
            kind = "resume"
        else:
            kind = "other"
        started = time.time()
        mode = (directives(task, "FIRST") or [""])[0] if first else ""
        status, error = "SUCCESS", ""

        if mode == "stall":
            state_file.write_text(json.dumps(state), encoding="utf-8")
            time.sleep(600)
        if mode == "exit":
            state_file.write_text(json.dumps(state), encoding="utf-8")
            return 3
        if first and mode != "error-before":
            run_all(directives(task, "RUN"), os.getcwd(), step)
            if os.environ.get("FAKE_AGY_MAIN"):
                run_all(directives(task, "MAIN"), os.environ["FAKE_AGY_MAIN"], step)
        elif kind == "fix":
            run_all(directives(task, "FIX"), os.getcwd(), step)
        elif kind == "resume":
            run_all(directives(task, "ON-RESUME"), os.getcwd(), step)
        if mode in ("error-before", "error-after"):
            status, error = "ERROR", "connection forcibly closed (fake)"
        elif mode == "quota":
            status, error = "ERROR", "RESOURCE_EXHAUSTED: quota exceeded (fake)"
        for value in directives(task, "SLEEP"):
            time.sleep(float(value))

        state["steps"] = step[0]
        state_file.write_text(json.dumps(state), encoding="utf-8")
        with open(STATE / "turns.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps({"conv": conv, "cwd": os.getcwd(), "kind": kind, "status": status,
                                "start": started, "end": time.time()}) + "\n")
        emit({"event": "result", "result": {"status": status, "response": f"fake reply {state['turns']}",
                                            "error": error, "conversation_id": conv,
                                            "usage": {"total_tokens": 100 * state["turns"]}}})
    return 0


if __name__ == "__main__":
    sys.exit(main())
