"""
週次ダイエットプラン（static/journal）のメール送信まわり。

- POST /journal/api/invite         コーチがクライアントに招待メールを送る
- POST /journal/api/notify         クライアントの提出をコーチにメールで知らせる
- GET|POST /journal/api/cron/reminders  最終提出がまだの人にリマインドを送る（毎朝 pg_cron から呼ぶ）

秘密の値は環境変数で渡す（Render → Environment）。コードやチャットには書かないこと。
- SUPABASE_SECRET_KEY : Supabase の Secret key（sb_secret_...）または service_role key
- RESEND_API_KEY      : Resend の API キー（re_...）
"""
import html
import json
import os
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

# 公開してよい値（publishable key はブラウザにも渡している）
DEFAULT_SUPABASE_URL = "https://foydbpxdrjkogxezgsax.supabase.co"
DEFAULT_SUPABASE_KEY = "sb_publishable_Wh1Dx9P76saUyewrx34Otw_3VIgCDXy"
DEFAULT_APP_URL = "https://soul-theme-api.onrender.com/journal/"
DEFAULT_MAIL_FROM = "ソウルダイエット <noreply@be-quem.com>"
JST = timezone(timedelta(hours=9))

router = APIRouter(prefix="/journal/api", include_in_schema=False)


def supabase_url() -> str:
    return os.environ.get("SUPABASE_URL", DEFAULT_SUPABASE_URL)


def supabase_anon_key() -> str:
    return os.environ.get("SUPABASE_ANON_KEY", DEFAULT_SUPABASE_KEY)


def app_url() -> str:
    return os.environ.get("JOURNAL_APP_URL", DEFAULT_APP_URL)


# -------------------------
# HTTP（テストでは差し替える）
# -------------------------
def _http(method: str, url: str, headers=None, body=None, timeout: int = 20):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json", "User-Agent": "soul-theme-api/1.0", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw.decode("utf-8", errors="replace")


def _service_headers() -> dict:
    key = os.environ.get("SUPABASE_SECRET_KEY", "")
    if not key:
        raise HTTPException(503, "メール送信の設定（SUPABASE_SECRET_KEY）がまだです。")
    headers = {"apikey": key}
    if key.startswith("eyJ"):  # 旧形式の service_role key（JWT）
        headers["Authorization"] = f"Bearer {key}"
    return headers


def _rest(method: str, path: str, body=None, prefer: str = ""):
    headers = _service_headers()
    if prefer:
        headers["Prefer"] = prefer
    status, res = _http(method, f"{supabase_url()}/rest/v1/{path}", headers, body)
    if status >= 300:
        raise HTTPException(502, f"データベースの操作に失敗しました: {res}")
    return res


def _q(value: str) -> str:
    return urllib.parse.quote(str(value), safe="")


def _current_user(authorization: str) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "ログインしてください。")
    status, user = _http(
        "GET", f"{supabase_url()}/auth/v1/user",
        {"apikey": supabase_anon_key(), "Authorization": authorization},
    )
    if status != 200 or not isinstance(user, dict) or not user.get("id"):
        raise HTTPException(401, "ログインの有効期限が切れています。ログインし直してください。")
    return user


def _member_by_user(user_id: str):
    rows = _rest("GET", f"members?user_id=eq.{_q(user_id)}&select=email,display_name,role")
    return rows[0] if rows else None


def _coach_emails() -> list:
    return [r["email"] for r in _rest("GET", "members?role=eq.coach&select=email")]


def _mark_once(entry_id: str, column: str):
    """column が空のときだけ今の時刻を入れる。入れられたら True（二重送信を防ぐ）"""
    now = datetime.now(timezone.utc).isoformat()
    rows = _rest(
        "PATCH", f"weekly_entries?id=eq.{_q(entry_id)}&{column}=is.null",
        {column: now}, prefer="return=representation",
    )
    return bool(rows)


def _unmark(entry_id: str, column: str):
    _rest("PATCH", f"weekly_entries?id=eq.{_q(entry_id)}", {column: None})


# -------------------------
# メール
# -------------------------
def _send_mail(to: list, subject: str, html_body: str):
    key = os.environ.get("RESEND_API_KEY", "")
    if not key:
        raise HTTPException(503, "メール送信の設定（RESEND_API_KEY）がまだです。")
    status, res = _http(
        "POST", "https://api.resend.com/emails", {"Authorization": f"Bearer {key}"},
        {"from": os.environ.get("JOURNAL_MAIL_FROM", DEFAULT_MAIL_FROM), "to": to, "subject": subject, "html": html_body},
    )
    if status >= 300:
        raise HTTPException(502, f"メール送信に失敗しました: {res}")


def _mail_html(paragraphs: list, button_label: str, url: str) -> str:
    body = "".join(f"<p>{html.escape(p)}</p>" for p in paragraphs)
    return (
        f'<div style="font-family:sans-serif;line-height:1.7;color:#3a332b;">{body}'
        f'<p><a href="{html.escape(url)}" style="display:inline-block;padding:12px 24px;background:#8a6d4a;'
        f'color:#ffffff;text-decoration:none;border-radius:8px;">{html.escape(button_label)}</a></p>'
        f'<p style="color:#888888;font-size:12px;">ソウルダイエット 週次ダイエットプラン</p></div>'
    )


def _period(period_start) -> str:
    if not period_start:
        return ""
    s = datetime.strptime(period_start, "%Y-%m-%d").date()
    e = s + timedelta(days=6)
    return f"（{s.month}/{s.day}〜{e.month}/{e.day}）"


# -------------------------
# ① 招待メール
# -------------------------
class InviteIn(BaseModel):
    email: str


@router.post("/invite")
def invite(payload: InviteIn, authorization: str = Header(default="")):
    user = _current_user(authorization)
    me = _member_by_user(user["id"])
    if not me or me["role"] != "coach":
        raise HTTPException(403, "コーチだけが招待できます。")
    email = payload.email.strip().lower()
    if not _rest("GET", f"members?email=eq.{_q(email)}&select=email"):
        raise HTTPException(404, "先にクライアントとして登録してください。")

    redirect = _q(app_url())
    status, res = _http("POST", f"{supabase_url()}/auth/v1/invite?redirect_to={redirect}", _service_headers(), {"email": email})
    if status < 300:
        return {"sent": "invite"}
    # すでにアカウントがある人には、ログイン用メールを送り直す
    if status in (400, 409, 422) and "already" in json.dumps(res).lower():
        status, res = _http(
            "POST", f"{supabase_url()}/auth/v1/otp?redirect_to={redirect}",
            {"apikey": supabase_anon_key()}, {"email": email, "create_user": False},
        )
        if status < 300:
            return {"sent": "login"}
    if status == 429:
        raise HTTPException(429, "短い時間にメールを送りすぎました。少し時間をおいてください。")
    raise HTTPException(502, f"招待メールを送れませんでした: {res}")


# -------------------------
# ② 提出のお知らせ（コーチ宛て）
# -------------------------
class NotifyIn(BaseModel):
    entry_id: str
    kind: str  # "plan" | "final"


@router.post("/notify")
def notify(payload: NotifyIn, authorization: str = Header(default="")):
    user = _current_user(authorization)
    try:
        entry_id = str(uuid.UUID(payload.entry_id))
    except ValueError:
        raise HTTPException(400, "entry_id が正しくありません。")
    if payload.kind not in ("plan", "final"):
        raise HTTPException(400, "kind が正しくありません。")

    rows = _rest("GET", f"weekly_entries?id=eq.{entry_id}&select=id,client_id,week_no,period_start,status")
    if not rows or rows[0]["client_id"] != user["id"]:
        raise HTTPException(404, "シートが見つかりません。")
    entry = rows[0]
    ok_status = ("plan_submitted", "submitted") if payload.kind == "plan" else ("submitted",)
    if entry["status"] not in ok_status:
        raise HTTPException(409, "まだ提出されていません。")

    column = "plan_notified_at" if payload.kind == "plan" else "final_notified_at"
    if not _mark_once(entry_id, column):
        return {"sent": False}

    client = _member_by_user(user["id"]) or {}
    name = client.get("display_name") or client.get("email") or "クライアント"
    what = "プラン" if payload.kind == "plan" else "シート（最終提出）"
    subject = f"【週次ダイエットプラン】{name}さんが第{entry['week_no']}週の{what}を提出しました"
    lines = [f"{name}さんが、第{entry['week_no']}週{_period(entry['period_start'])}の{what}を提出しました。"]
    lines.append("01〜03（アクションプラン）を確認できます。" if payload.kind == "plan" else "フィードバックを書いてあげてください。")
    try:
        _send_mail(_coach_emails(), subject, _mail_html(lines, "シートを見る", f"{app_url()}#/entry/{entry_id}"))
    except HTTPException:
        _unmark(entry_id, column)
        raise
    return {"sent": True}


# -------------------------
# ③ リマインド（クライアント宛て）
# -------------------------
REMIND_CATCH_UP_DAYS = 2  # 送りそびれた日があっても、この日数までは後から送る


@router.api_route("/cron/reminders", methods=["GET", "POST"])
def reminders():
    """週の最終日（開始日 + 6日）になっても最終提出していない人に1回だけ送る。
    何度呼ばれても同じ人に二重には送らないので、呼び出しに鍵は付けていない。"""
    today = datetime.now(JST).date()
    last = today - timedelta(days=6)
    first = last - timedelta(days=REMIND_CATCH_UP_DAYS)
    rows = _rest(
        "GET",
        "weekly_entries?status=eq.plan_submitted&reminder_sent_at=is.null"
        f"&period_start=gte.{first.isoformat()}&period_start=lte.{last.isoformat()}"
        "&select=id,client_id,week_no,period_start",
    )
    sent = 0
    for entry in rows:
        client = _member_by_user(entry["client_id"])
        if not client or not _mark_once(entry["id"], "reminder_sent_at"):
            continue
        name = client.get("display_name") or ""
        subject = f"【週次ダイエットプラン】第{entry['week_no']}週の振り返りと最終提出のお願い"
        lines = [
            f"{name}さん" if name else "こんにちは",
            f"第{entry['week_no']}週{_period(entry['period_start'])}の1週間、おつかれさまでした。",
            "04〜06（実践と気づき・1週間の振り返り・次週の選択）を書いて、「最終提出」をお願いします。",
            "一言でも、空欄があっても大丈夫です。",
        ]
        try:
            _send_mail([client["email"]], subject, _mail_html(lines, "シートを開く", f"{app_url()}#/entry/{entry['id']}"))
            sent += 1
        except HTTPException:
            _unmark(entry["id"], "reminder_sent_at")
    return {"date": today.isoformat(), "candidates": len(rows), "sent": sent}
