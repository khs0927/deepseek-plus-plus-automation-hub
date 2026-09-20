#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
khs0927 / deepseek-plus-plus-automation-hub
Module: seumter_native_host.py
Description: Chrome Extension (DeepSeek++)과 로컬 파이프라인 간의 Native Messaging Host
"""

import json, struct, sys, subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        return None
    length = struct.unpack('@I', raw_length)[0]
    return json.loads(sys.stdin.buffer.read(length).decode('utf-8'))

def send_message(msg):
    content = json.dumps(msg, ensure_ascii=False).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('@I', len(content)))
    sys.stdout.buffer.write(content)
    sys.stdout.buffer.flush()

def handle_request(req):
    action = req.get("action", "PING")
    if action == "PING":
        return {
            "status": "PONG",
            "host": "khs0927-deepseek-plus-plus-native-host",
            "architect": { "office": "건축사사무소 지음", "name": "이동희", "biz_no": "604-08-99164" },
            "ready": True
        }
    return {"status": "UNKNOWN_ACTION", "received": action}

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        print("=== Native Host Test Mode ===")
        print("Response:", handle_request({"action": "PING"}))
        return
    while True:
        try:
            req = read_message()
            if req is None: break
            send_message(handle_request(req))
        except Exception as e:
            send_message({"status": "EXCEPTION", "error": str(e)})
            break

if __name__ == "__main__":
    main()
