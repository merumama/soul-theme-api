
import json
from pathlib import Path
from fastapi.testclient import TestClient

import sys
sys.path.append(str(Path(__file__).resolve().parents[1] / "app"))
from main import app  # type: ignore

client = TestClient(app)

def _post(date_str: str):
    return client.post("/diagnose", json={"birthdate": date_str})

def test_health():
    r = client.get("/health")
    assert r.status_code == 200

def test_known_cases_master_ver1():
    cases = [
        ("1970-07-24", {"dragon_head_zodiac":"魚座","dragon_tail_zodiac":"乙女座","soul_theme":"4-3","reverse_theme":"2-2"}),
        ("1965-03-18", {"dragon_head_zodiac":"双子座","dragon_tail_zodiac":"射手座","soul_theme":"3-1","reverse_theme":"1-3"}),
        ("1940-04-07", {"dragon_head_zodiac":"天秤座","dragon_tail_zodiac":"牡羊座","soul_theme":"3-2","reverse_theme":"1-1"}),
        ("1966-04-29", {"dragon_head_zodiac":"牡牛座","dragon_tail_zodiac":"蠍座","soul_theme":"2-1","reverse_theme":"4-2"}),
        ("1971-01-11", {"dragon_head_zodiac":"水瓶座","dragon_tail_zodiac":"獅子座","soul_theme":"3-3","reverse_theme":"1-2"}),
    ]
    for bd, expected in cases:
        r = _post(bd)
        assert r.status_code == 200, (bd, r.status_code, r.text)
        out = r.json()
        for k, v in expected.items():
            assert out[k] == v, f"{bd}: expected {k}={v}, got {out[k]}"
