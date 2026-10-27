"""Notify only after AlertManager.should_notify is True."""
from __future__ import annotations
import os, json, urllib.request
from typing import Optional

def notify_webhook(sector_id: str, status: str, message: str, webhook_url: Optional[str] = None) -> bool:
    url = webhook_url or os.getenv("ALERT_WEBHOOK_URL")
    if not url:
        print(f"[notify] no ALERT_WEBHOOK_URL – would send: {sector_id} {status} {message}")
        return False
    payload = json.dumps({"sector_id": sector_id, "status": status, "message": message}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return 200 <= resp.status < 300
    except Exception as e:
        print(f"[notify] failed: {e}")
        return False
