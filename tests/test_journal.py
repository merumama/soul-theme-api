from pathlib import Path
from fastapi.testclient import TestClient

import sys
sys.path.append(str(Path(__file__).resolve().parents[1] / "app"))
from main import app  # type: ignore

client = TestClient(app)

def test_journal_page_served():
    r = client.get("/journal/")
    assert r.status_code == 200
    assert "週次ダイエットプラン" in r.text

def test_journal_redirect():
    r = client.get("/journal", follow_redirects=False)
    assert r.status_code in (307, 308)
    assert r.headers["location"] == "/journal/"

def test_journal_config_from_env(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "sb_publishable_x")
    r = client.get("/journal/config.json")
    assert r.json() == {"supabaseUrl": "https://example.supabase.co", "supabaseAnonKey": "sb_publishable_x"}

def test_journal_config_default(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    cfg = client.get("/journal/config.json").json()
    assert cfg["supabaseUrl"].endswith(".supabase.co")
    assert cfg["supabaseAnonKey"].startswith("sb_publishable_")
