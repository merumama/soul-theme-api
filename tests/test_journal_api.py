from datetime import datetime, timedelta
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.append(str(Path(__file__).resolve().parents[1] / "app"))
import journal_api  # type: ignore
from main import app  # type: ignore

client = TestClient(app)

COACH = "11111111-1111-1111-1111-111111111111"
CLIENT = "22222222-2222-2222-2222-222222222222"
ENTRY = "33333333-3333-3333-3333-333333333333"


class FakeBackend:
    """Supabase と Resend の代わり。届いたリクエストを記録して、それらしい応答を返す"""

    def __init__(self):
        self.calls = []
        self.mails = []
        self.tokens = {"Bearer coach": COACH, "Bearer client": CLIENT}
        self.members = [
            {"email": "coach@example.com", "user_id": COACH, "display_name": "コーチ", "role": "coach"},
            {"email": "hanako@example.com", "user_id": CLIENT, "display_name": "魂 花子", "role": "client"},
        ]
        self.entry = {"id": ENTRY, "client_id": CLIENT, "week_no": 2, "period_start": "2026-10-12",
                      "status": "plan_submitted", "plan_notified_at": None, "final_notified_at": None,
                      "reminder_sent_at": None}
        self.invite_status = 200

    def __call__(self, method, url, headers=None, body=None, timeout=20):
        self.calls.append((method, url, body))
        if url.endswith("/auth/v1/user"):
            uid = self.tokens.get(headers.get("Authorization"))
            return (200, {"id": uid}) if uid else (401, {"msg": "bad jwt"})
        if "/auth/v1/invite" in url:
            return self.invite_status, ({} if self.invite_status < 300 else {"msg": "A user with this email address has already been registered"})
        if "/auth/v1/otp" in url:
            return 200, {}
        if url == "https://api.resend.com/emails":
            self.mails.append(body)
            return 200, {"id": "mail"}
        if "/rest/v1/members" in url:
            rows = self.members
            if "user_id=eq." in url:
                rows = [m for m in rows if m["user_id"] == url.split("user_id=eq.")[1].split("&")[0]]
            if "email=eq." in url:
                rows = [m for m in rows if m["email"] == url.split("email=eq.")[1].split("&")[0].replace("%40", "@")]
            if "role=eq.coach" in url:
                rows = [m for m in rows if m["role"] == "coach"]
            return 200, rows
        if "/rest/v1/weekly_entries" in url:
            e = self.entry
            if method == "GET":
                if "status=eq.plan_submitted" in url:
                    lo = url.split("period_start=gte.")[1].split("&")[0]
                    hi = url.split("period_start=lte.")[1].split("&")[0]
                    ok = e["status"] == "plan_submitted" and e["reminder_sent_at"] is None and lo <= e["period_start"] <= hi
                    return 200, [e] if ok else []
                return 200, [e]
            if method == "PATCH":
                col = next(iter(body))
                if f"{col}=is.null" in url and e[col] is not None:
                    return 200, []
                e[col] = body[col]
                return 200, [e]
        raise AssertionError(f"unexpected call {method} {url}")


@pytest.fixture
def fake(monkeypatch):
    f = FakeBackend()
    monkeypatch.setattr(journal_api, "_http", f)
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_test")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    return f


# ---------- ① 招待 ----------
def test_invite_by_coach(fake):
    r = client.post("/journal/api/invite", json={"email": "Hanako@Example.com"}, headers={"Authorization": "Bearer coach"})
    assert r.status_code == 200 and r.json() == {"sent": "invite"}
    invite = next(c for c in fake.calls if "/auth/v1/invite" in c[1])
    assert invite[2] == {"email": "hanako@example.com"}
    assert "redirect_to=https%3A%2F%2Fsoul-theme-api.onrender.com%2Fjournal%2F" in invite[1]


def test_invite_existing_user_gets_login_mail(fake):
    fake.invite_status = 422
    r = client.post("/journal/api/invite", json={"email": "hanako@example.com"}, headers={"Authorization": "Bearer coach"})
    assert r.json() == {"sent": "login"}
    otp = next(c for c in fake.calls if "/auth/v1/otp" in c[1])
    assert otp[2] == {"email": "hanako@example.com", "create_user": False}


def test_invite_rejects_client_and_unknown_email(fake):
    assert client.post("/journal/api/invite", json={"email": "hanako@example.com"}, headers={"Authorization": "Bearer client"}).status_code == 403
    assert client.post("/journal/api/invite", json={"email": "x@example.com"}, headers={"Authorization": "Bearer coach"}).status_code == 404
    assert client.post("/journal/api/invite", json={"email": "x@example.com"}).status_code == 401


def test_invite_without_secret_key(fake, monkeypatch):
    monkeypatch.delenv("SUPABASE_SECRET_KEY")
    r = client.post("/journal/api/invite", json={"email": "hanako@example.com"}, headers={"Authorization": "Bearer coach"})
    assert r.status_code == 503


# ---------- ② 提出のお知らせ ----------
def test_notify_plan_once(fake):
    r = client.post("/journal/api/notify", json={"entry_id": ENTRY, "kind": "plan"}, headers={"Authorization": "Bearer client"})
    assert r.json() == {"sent": True}
    assert fake.mails[0]["to"] == ["coach@example.com"]
    assert "魂 花子さんが第2週のプランを提出しました" in fake.mails[0]["subject"]
    assert f"#/entry/{ENTRY}" in fake.mails[0]["html"]
    again = client.post("/journal/api/notify", json={"entry_id": ENTRY, "kind": "plan"}, headers={"Authorization": "Bearer client"})
    assert again.json() == {"sent": False} and len(fake.mails) == 1


def test_notify_final_requires_final_status(fake):
    r = client.post("/journal/api/notify", json={"entry_id": ENTRY, "kind": "final"}, headers={"Authorization": "Bearer client"})
    assert r.status_code == 409
    fake.entry["status"] = "submitted"
    r = client.post("/journal/api/notify", json={"entry_id": ENTRY, "kind": "final"}, headers={"Authorization": "Bearer client"})
    assert r.json() == {"sent": True} and "最終提出" in fake.mails[0]["subject"]


def test_notify_only_own_entry(fake):
    r = client.post("/journal/api/notify", json={"entry_id": ENTRY, "kind": "plan"}, headers={"Authorization": "Bearer coach"})
    assert r.status_code == 404 and not fake.mails
    assert client.post("/journal/api/notify", json={"entry_id": "1 or 1=1", "kind": "plan"}, headers={"Authorization": "Bearer client"}).status_code == 400


def test_notify_mail_failure_allows_retry(fake, monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY")
    r = client.post("/journal/api/notify", json={"entry_id": ENTRY, "kind": "plan"}, headers={"Authorization": "Bearer client"})
    assert r.status_code == 503 and fake.entry["plan_notified_at"] is None


# ---------- ③ リマインド ----------
def _start_days_ago(days):
    return (datetime.now(journal_api.JST).date() - timedelta(days=days)).isoformat()


def test_reminder_on_last_day_once(fake):
    fake.entry["period_start"] = _start_days_ago(6)
    assert client.get("/journal/api/cron/reminders").json()["sent"] == 1
    assert fake.mails[0]["to"] == ["hanako@example.com"]
    assert "第2週の振り返りと最終提出のお願い" in fake.mails[0]["subject"]
    assert client.post("/journal/api/cron/reminders").json()["sent"] == 0


@pytest.mark.parametrize("days_ago", [5, 9])
def test_reminder_not_before_last_day_or_too_late(fake, days_ago):
    fake.entry["period_start"] = _start_days_ago(days_ago)
    assert client.get("/journal/api/cron/reminders").json()["sent"] == 0


def test_reminder_skips_final_submitted(fake):
    fake.entry["period_start"] = _start_days_ago(6)
    fake.entry["status"] = "submitted"
    assert client.get("/journal/api/cron/reminders").json()["sent"] == 0
