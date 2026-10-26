import { createStore } from "./store.js";

// =====================================================================
// シートの構成（PDF「STEP3 ソウルダイエット 1週間アクションプラン＆フィードバック」に対応）
// =====================================================================
const SECTIONS = {
  s01: { no: "01", title: "私の望む方向", sub: "3か月〜半年後、どんな自分でいたい？（体重だけでなく、暮らし方・気持ちも）" },
  s02: { no: "02", title: "今週のテーマ・取り組みスタンス", sub: "今週は何を知りたい？" },
  s03: { no: "03", title: "食・動・休の基本プラン", sub: "各分野からまず1つ。数は自由。すでにできていることを続ける・観察するのも OK。" },
  s04: { no: "04", title: "7日間の実践と気づき", sub: "一言でも、空欄でも OK。うまくいった日も、思うようにできなかった日も大切な発見。" },
  s05: { no: "05", title: "1週間の振り返り", sub: "自分について分かったこと／心地よかったこと／やりにくかったこと／気になった思考や感情" },
  s06: { no: "06", title: "次週の選択", sub: "選び直すことも前進です。" },
};
const SECTION_KEYS = Object.keys(SECTIONS);
const STANCES = [["discover", "発見・お試し"], ["habit", "継続・習慣化"], ["adjust", "調整・バージョンアップ"]];
const CHOICES = [["continue", "続ける"], ["adjust", "調整する"], ["stop", "やめる"], ["new", "新しく試す"]];
const CATS = [["food", "食", "食事"], ["move", "動", "運動・体のケア"], ["rest", "休", "休息・睡眠"]];
const DAYTYPES = [
  ["weekday", "平日", "仕事がある日の生活に合わせて、各分野からまず1つ。"],
  ["holiday", "休日", "起きる時間や外出予定に合わせて、できそうなことを選ぶ。"],
];
const WD = ["日", "月", "火", "水", "木", "金", "土"];
const MAX_ROWS = 5;

function emptyRow() { return { what: "", when: "", why: "" }; }
function emptyPlan() { return { food: [emptyRow(), emptyRow()], move: [emptyRow(), emptyRow()], rest: [emptyRow(), emptyRow()] }; }
function emptyContent() {
  return {
    s01: { direction: "" },
    s02: { stance: [], theme: "" },
    s03: { weekday: emptyPlan(), holiday: emptyPlan() },
    s04: { days: Array.from({ length: 7 }, () => ({ practice: "", thought: "" })) },
    s05: { discovery: "" },
    s06: { choices: [], next: "" },
  };
}

function normalize(c) {
  c = c || {};
  const str = (v) => (typeof v === "string" ? v : "");
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  const plan = (p) => {
    const out = {};
    for (const [cat] of CATS) {
      const rows = Array.isArray(p && p[cat]) ? p[cat].map((r) => ({ what: str(r && r.what), when: str(r && r.when), why: str(r && r.why) })) : [];
      while (rows.length < 2) rows.push(emptyRow());
      out[cat] = rows;
    }
    return out;
  };
  const days = (c.s04 && c.s04.days) || [];
  return {
    s01: { direction: str(c.s01 && c.s01.direction) },
    s02: { stance: arr(c.s02 && c.s02.stance), theme: str(c.s02 && c.s02.theme) },
    s03: { weekday: plan(c.s03 && c.s03.weekday), holiday: plan(c.s03 && c.s03.holiday) },
    s04: { days: Array.from({ length: 7 }, (_, i) => ({ practice: str(days[i] && days[i].practice), thought: str(days[i] && days[i].thought) })) },
    s05: { discovery: str(c.s05 && c.s05.discovery) },
    s06: { choices: arr(c.s06 && c.s06.choices), next: str(c.s06 && c.s06.next) },
  };
}

// 次週用：アクションプラン（01〜03）を引き継ぎ、ジャーナル（04〜06）は白紙にする
function contentForNextWeek(prev) {
  const p = normalize(prev);
  const c = emptyContent();
  c.s01 = clone(p.s01);
  c.s02 = clone(p.s02);
  c.s03 = clone(p.s03);
  return c;
}

// =====================================================================
// 小さな道具
// =====================================================================
const $app = document.getElementById("app");
const $top = document.getElementById("top");

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function parseDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function thisMonday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return addDays(d, -((d.getDay() + 6) % 7));
}
function md(d) { return `${d.getMonth() + 1}/${d.getDate()}`; }
function periodText(iso) {
  const s = parseDate(iso);
  if (!s) return "期間未設定";
  const e = addDays(s, 6);
  return `${s.getFullYear()}年${s.getMonth() + 1}月${s.getDate()}日〜${e.getMonth() + 1}月${e.getDate()}日`;
}
function dayLabel(iso, i) {
  const s = parseDate(iso);
  if (!s) return { wd: ["月", "火", "水", "木", "金", "土", "日"][i], date: "" };
  const d = addDays(s, i);
  return { wd: WD[d.getDay()], date: md(d) };
}
function stamp(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function getPath(obj, path) { return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj); }
function setPath(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
}
function blank(s) { return !s || !String(s).trim(); }
function nl(s) { return esc(s); } // 改行は CSS の white-space: pre-wrap で表示

let toastTimer = null;
function toast(msg) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function autosize(root) {
  root.querySelectorAll("textarea").forEach((t) => {
    t.style.height = "auto";
    t.style.height = t.scrollHeight + 2 + "px";
  });
}

// =====================================================================
// 状態
// =====================================================================
let store = null;
let me = null;
let editing = null;      // 編集中のシート（下書き）
let dayIdx = 0;          // 04 で開いている曜日
let saveTimer = null;
let dirty = false;
let saveChain = Promise.resolve();
let lastSaveOk = true;
let prevCache = null;    // 記入画面に出す「先週のシート」

// =====================================================================
// 起動
// =====================================================================
async function boot() {
  $app.innerHTML = `<p class="muted center pad">読み込み中…</p>`;
  try {
    const config = await fetch("config.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    store = await createStore(config);
    if (store.mode === "supabase") {
      // ログインリンクから戻ってきたときの URL を整理する
      await store.sb.auth.getSession();
      const h = location.hash;
      if (/error_description=/.test(h)) {
        const p = new URLSearchParams(h.slice(1));
        history.replaceState(null, "", location.pathname + "#/");
        toast(/expired/i.test(p.get("error_description") || "") ? "リンクの有効期限が切れています。もう一度メールを送ってください。" : "ログインに失敗しました。もう一度お試しください。");
      } else if (/access_token=|type=magiclink/.test(h)) {
        history.replaceState(null, "", location.pathname + "#/");
      }
      store.sb.auth.onAuthStateChange((ev) => {
        if ((ev === "SIGNED_IN" && !me) || (ev === "SIGNED_OUT" && me)) setTimeout(render, 0);
      });
    }
    window.addEventListener("hashchange", render);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushSave(); });
    window.addEventListener("beforeunload", (e) => {
      if (dirty) { flushSave(); e.preventDefault(); e.returnValue = ""; }
    });
    $app.addEventListener("input", onFieldEvent);
    $app.addEventListener("change", onFieldEvent);
    $app.addEventListener("click", onClick);
    $top.addEventListener("click", onClick);
    await render();
  } catch (err) {
    console.error(err);
    $app.innerHTML = `<div class="card pad"><p>${esc(err.message || "読み込みに失敗しました。")}</p><button class="btn" onclick="location.reload()">再読み込み</button></div>`;
  }
}

async function render() {
  await flushSave();
  editing = null;
  try {
    me = await store.me();
    renderTop();
    if (!me) return renderLogin();
    if (me.role === "none") return renderNotMember();
    const h = location.hash.replace(/^#/, "") || "/";
    let m;
    if ((m = h.match(/^\/entry\/([\w-]+)$/))) return await renderEntry(m[1]);
    if (me.role === "coach") {
      if ((m = h.match(/^\/client\/([\w-]+)$/))) return await renderCoachClient(m[1]);
      return await renderCoachHome();
    }
    return await renderClientHome();
  } catch (err) {
    console.error(err);
    $app.innerHTML = `<div class="card pad"><p>読み込みに失敗しました：${esc(err.message || err)}</p><p class="muted">電波の良い場所で、もう一度お試しください。</p><button class="btn" data-act="reload">再読み込み</button></div>`;
  }
}

function renderTop() {
  const demo = store.mode === "demo";
  $top.innerHTML = `
    <div class="top-inner">
      <a class="brand" href="#/"><span class="brand-mark">Soul Diet</span><span class="brand-name">週次ダイエットプラン</span></a>
      ${me ? `<div class="who"><span class="who-name">${esc(me.display_name || me.email)}${me.role === "coach" ? '<span class="tag">コーチ</span>' : ""}</span><button class="link" data-act="logout">ログアウト</button></div>` : ""}
    </div>
    ${demo ? `<div class="demo-bar">お試しモード：データはこの端末だけに保存されます${me ? ` ・ <button class="link" data-act="demo-switch">${me.role === "coach" ? "クライアント画面に切り替え" : "コーチ画面に切り替え"}</button>` : ""}</div>` : ""}`;
}

// =====================================================================
// ログイン
// =====================================================================
function renderLogin() {
  if (store.mode === "demo") {
    $app.innerHTML = `
      <section class="card pad login">
        <h1>ソウルダイエット<br>週次ダイエットプラン</h1>
        <p class="lead">「守れたか」よりも、「自分に合う方法が見つかったか」。<br>試して、気づいて、選び直そう。</p>
        <p class="muted">お試しモードです。どちらの立場で使ってみますか？</p>
        <div class="stack">
          <button class="btn primary" data-act="demo-login" data-role="client">クライアント（魂 花子さん）として試す</button>
          <button class="btn" data-act="demo-login" data-role="coach">コーチとして試す</button>
        </div>
        <p class="small muted"><button class="link" data-act="demo-reset">お試しデータを最初の状態に戻す</button></p>
      </section>`;
    return;
  }
  let saved = "";
  try { saved = localStorage.getItem("soul-journal-email") || ""; } catch (e) { /* noop */ }
  const fromLink = new URLSearchParams(location.search).get("email");
  if (fromLink) saved = fromLink;
  $app.innerHTML = `
    <section class="card pad login">
      <h1>ソウルダイエット<br>週次ダイエットプラン</h1>
      <p class="lead">「守れたか」よりも、「自分に合う方法が見つかったか」。<br>試して、気づいて、選び直そう。</p>
      <form id="login-form" class="stack">
        <label class="field"><span>メールアドレス</span>
          <input type="email" name="email" required autocomplete="email" inputmode="email" value="${esc(saved)}" placeholder="example@mail.com"></label>
        <button class="btn primary" type="submit">ログイン用メールを送る</button>
      </form>
      <form id="code-form" class="stack" hidden>
        <p>メールを送りました。<br>件名「【ソウルダイエット】週次ダイエットプランログインのご案内」のメールの<b>「ログインする」ボタン</b>を押してください。</p>
        <p class="small muted">届かないときは、迷惑メールフォルダも確認してください。</p>
        <label class="field"><span>ボタンが押せないときは、メールに書かれた確認コードを入力してください</span>
          <input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" placeholder="123456"></label>
        <button class="btn primary" type="submit">ログイン</button>
        <button class="link" type="button" data-act="login-back">メールアドレスを入れ直す</button>
      </form>
      <p class="small muted">2回目からは、同じスマホ・パソコンならログインしたままになります。</p>
    </section>`;
  const f1 = document.getElementById("login-form");
  const f2 = document.getElementById("code-form");
  let email = "";
  f1.addEventListener("submit", async (e) => {
    e.preventDefault();
    email = f1.email.value.trim().toLowerCase();
    const btn = f1.querySelector("button");
    btn.disabled = true;
    btn.textContent = "送信中…";
    try {
      await store.sendLogin(email);
      try { localStorage.setItem("soul-journal-email", email); } catch (err) { /* noop */ }
      f1.hidden = true;
      f2.hidden = false;
      f2.code.focus();
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "ログイン用メールを送る";
    }
  });
  f2.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = f2.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      await store.verifyCode(email, f2.code.value.trim());
      go("#/");
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
    }
  });
}

function renderNotMember() {
  $app.innerHTML = `
    <section class="card pad">
      <h2>登録が見つかりません</h2>
      <p>${esc(me.email)} はまだ登録されていません。コーチに登録をお願いしてください。</p>
      <button class="btn" data-act="logout">ログアウト</button>
    </section>`;
}

// =====================================================================
// クライアント：ホーム
// =====================================================================
async function renderClientHome() {
  const entries = await store.listEntries(me.user_id);
  const fb = await store.listFeedback(entries.filter((e) => e.status === "submitted").map((e) => e.id));
  const latest = entries[0];
  let action = "";
  if (!latest) {
    action = `
      <p>はじめての1週間を書いてみましょう。</p>
      <button class="btn primary" data-act="new-week">第1週をはじめる</button>`;
  } else if (latest.status === "submitted") {
    action = `
      <p>第${latest.week_no}週を提出しました。次の1週間の準備をしましょう。</p>
      <div class="stack">
        <button class="btn primary" data-act="next-week" data-from="${esc(latest.id)}">第${latest.week_no}週をコピーして第${latest.week_no + 1}週を作る</button>
        <button class="btn" data-act="new-week" data-week="${latest.week_no + 1}" data-start="${esc(latest.period_start ? toISO(addDays(parseDate(latest.period_start), 7)) : "")}">白紙で第${latest.week_no + 1}週を作る</button>
      </div>
      <p class="small muted">コピーすると「01〜03 アクションプラン」を引き継ぎ、「04〜06 ジャーナル」は白紙になります。</p>`;
  } else if (latest.status === "plan_submitted") {
    action = `
      <p>第${latest.week_no}週のプランを提出しました。1週間の実践と気づきを記録して、最後に「最終提出」をしましょう。</p>
      <a class="btn primary" href="#/entry/${esc(latest.id)}">第${latest.week_no}週の記録をつける</a>`;
  } else {
    action = `
      <p>第${latest.week_no}週のアクションプランを記入中です。書けたら「プラン提出」をしましょう。</p>
      <a class="btn primary" href="#/entry/${esc(latest.id)}">第${latest.week_no}週の続きを書く</a>`;
  }
  $app.innerHTML = `
    <section class="card pad hero">${action}</section>
    <h2 class="list-title">これまでのシート</h2>
    ${entries.length ? `<div class="list">${entries.map((e) => entryCard(e, fb.filter((f) => f.entry_id === e.id).length, true)).join("")}</div>` : `<p class="muted pad">まだありません。</p>`}`;
}

function entryCard(e, fbCount, clickable) {
  const status = {
    submitted: `<span class="chip done">最終提出済み ${esc(stamp(e.submitted_at))}</span>`,
    plan_submitted: `<span class="chip plan">プラン提出済み ${esc(stamp(e.plan_submitted_at))}</span>`,
  }[e.status] || `<span class="chip draft">プラン記入中</span>`;
  const fbBadge = fbCount ? `<span class="chip fb">フィードバック ${fbCount}件</span>` : "";
  const inner = `
    <div class="entry-card-main">
      <div class="entry-week">第${esc(e.week_no)}週</div>
      <div class="muted small">${esc(periodText(e.period_start))}</div>
    </div>
    <div class="entry-card-side">${status}${fbBadge}</div>`;
  return clickable
    ? `<a class="entry-card" href="#/entry/${esc(e.id)}">${inner}</a>`
    : `<div class="entry-card disabled">${inner}</div>`;
}

async function createWeek({ week_no, period_start, content }) {
  const e = await store.createEntry({ week_no, period_start, content });
  go(`#/entry/${e.id}`);
}

// =====================================================================
// シート（記入 / 閲覧）
// =====================================================================
async function renderEntry(id) {
  const entry = await store.getEntry(id);
  if (!entry) {
    $app.innerHTML = `<section class="card pad"><p>シートが見つかりませんでした。</p><a class="btn" href="#/">戻る</a></section>`;
    return;
  }
  entry.content = normalize(entry.content);
  const siblings = await store.listEntries(entry.client_id);
  const prev = siblings.filter((e) => e.week_no < entry.week_no).sort((a, b) => b.week_no - a.week_no)[0] || null;
  const isOwner = entry.client_id === me.user_id;

  if (isOwner && entry.status !== "submitted") return renderEditor(entry, prev);

  if (!isOwner && entry.status === "draft") {
    $app.innerHTML = `<section class="card pad"><p>このシートはまだプラン提出されていません。提出されると読めるようになります。</p><a class="btn" href="#/client/${esc(entry.client_id)}">戻る</a></section>`;
    return;
  }
  const feedback = await store.listFeedback([entry.id]);
  let clientName = me.display_name;
  if (!isOwner) {
    const members = await store.listMembers();
    const m = members.find((x) => x.user_id === entry.client_id);
    clientName = m ? m.display_name || m.email : "";
  }
  renderView(entry, feedback, siblings, clientName, isOwner);
}

function sheetHead(entry, name, editable) {
  if (!editable) {
    return `
      <div class="sheet-head">
        <div class="sheet-week">第${esc(entry.week_no)}週</div>
        <div class="muted">${esc(periodText(entry.period_start))}</div>
        <div class="muted">名前：${esc(name)}</div>
      </div>`;
  }
  return `
    <div class="sheet-head edit">
      <label class="field inline"><span>第</span><input type="number" min="1" max="999" data-path="week_no" value="${esc(entry.week_no)}" class="num"><span>週</span></label>
      <label class="field inline"><span>開始日</span><input type="date" data-path="period_start" value="${esc(entry.period_start || "")}"></label>
      <div class="muted small" id="period-text">期間：${esc(periodText(entry.period_start))}</div>
      <div class="muted small">名前：${esc(name)}</div>
    </div>`;
}

function sectionShell(key, body, { clear = false, extra = "" } = {}) {
  const s = SECTIONS[key];
  return `
    <section class="card sec" id="sec-${key}">
      <header class="sec-head">
        <div class="sec-no">${s.no}</div>
        <div class="sec-titles"><h2>${esc(s.title)}</h2><p class="sec-sub">${esc(s.sub)}</p></div>
        ${clear ? `<button class="btn-clear" data-act="clear" data-sec="${key}" aria-label="${esc(s.title)}をクリア">クリア</button>` : ""}
      </header>
      <div class="sec-body">${body}</div>
      ${extra}
    </section>`;
}

// ---------- 記入画面 ----------
function renderEditor(entry, prev) {
  editing = entry;
  prevCache = prev;
  lastSaveOk = true;
  const today = toISO(new Date());
  const start = parseDate(entry.period_start);
  if (start) {
    const diff = Math.round((parseDate(today) - start) / 86400000);
    dayIdx = diff >= 0 && diff < 7 ? diff : 0;
  } else {
    dayIdx = 0;
  }
  drawEditor(prev);
}

function drawEditor(prev) {
  const entry = editing;
  const c = entry.content;
  const prevContent = prev ? normalize(prev.content) : null;
  const reminder = prevContent && (prevContent.s06.next || prevContent.s06.choices.length)
    ? `<aside class="card pad reminder">
        <div class="reminder-label">先週（第${esc(prev.week_no)}週）の「来週、どうしてみたい？」</div>
        ${prevContent.s06.choices.length ? `<div class="chips">${CHOICES.filter(([k]) => prevContent.s06.choices.includes(k)).map(([, l]) => `<span class="chip">${esc(l)}</span>`).join("")}</div>` : ""}
        <p class="pre">${nl(prevContent.s06.next)}</p>
      </aside>`
    : "";

  const s01 = `<textarea data-path="content.s01.direction" rows="3" placeholder="例：疲れた日も自分を責めず、体の声を聞いて食事や休み方を選べる私。">${esc(c.s01.direction)}</textarea>`;

  const s02 = `
    <div class="checks">${STANCES.map(([k, l]) => `
      <label class="check"><input type="checkbox" data-path="content.s02.stance" data-value="${k}" ${c.s02.stance.includes(k) ? "checked" : ""}><span>${esc(l)}</span></label>`).join("")}
    </div>
    <textarea data-path="content.s02.theme" rows="2" placeholder="例：仕事のある日と休日で、無理なく続けられる方法を探す。">${esc(c.s02.theme)}</textarea>`;

  const s03 = DAYTYPES.map(([dt, label, hint]) => `
    <div class="daytype">
      <h3>${esc(label)}</h3>
      <p class="hint">${esc(hint)}</p>
      ${CATS.map(([cat, kanji, catLabel]) => `
        <div class="cat">
          <div class="cat-head"><span class="cat-kanji cat-${cat}">${kanji}</span><span>${esc(catLabel)}</span></div>
          ${c.s03[dt][cat].map((row, i) => `
            <div class="plan-row">
              <span class="plan-no">${"①②③④⑤"[i] || i + 1}</span>
              <div class="plan-fields">
                <input data-path="content.s03.${dt}.${cat}.${i}.what" value="${esc(row.what)}" placeholder="何を試す・続ける？" aria-label="${esc(label + " " + catLabel)} ${i + 1} 何を試す・続ける？">
                <div class="plan-sub">
                  <input data-path="content.s03.${dt}.${cat}.${i}.when" value="${esc(row.when)}" placeholder="いつ／どのくらい" aria-label="いつ／どのくらい">
                  <input data-path="content.s03.${dt}.${cat}.${i}.why" value="${esc(row.why)}" placeholder="何のために？（目的・意図）" aria-label="何のために？">
                </div>
              </div>
            </div>`).join("")}
          ${c.s03[dt][cat].length < MAX_ROWS ? `<button class="link small" data-act="add-row" data-dt="${dt}" data-cat="${cat}">＋ 行を追加</button>` : ""}
        </div>`).join("")}
    </div>`).join("") + `<p class="hint">すでにできていることを続ける・観察するのも OK。週の途中で変更しても OK。</p>`;

  const day = c.s04.days[dayIdx];
  const dl = dayLabel(entry.period_start, dayIdx);
  const s04 = `
    <div class="day-tabs" role="tablist">
      ${c.s04.days.map((d, i) => {
        const l = dayLabel(entry.period_start, i);
        const filled = !blank(d.practice) || !blank(d.thought);
        return `<button role="tab" aria-selected="${i === dayIdx}" class="day-tab ${i === dayIdx ? "on" : ""}" data-act="day" data-i="${i}">
          <span class="dt-wd">${l.wd}</span><span class="dt-date">${l.date}</span>${filled ? '<span class="dt-dot" aria-label="記入あり"></span>' : ""}</button>`;
      }).join("")}
    </div>
    <div class="day-panel">
      <div class="day-title">${dl.wd}曜日 ${dl.date}</div>
      <label class="field"><span><b>食・動・休</b>：やってみたこと／体の反応</span>
        <textarea data-path="content.s04.days.${dayIdx}.practice" rows="3" placeholder="例：昼休み5分歩く。頭がすっきり">${esc(day.practice)}</textarea></label>
      <label class="field"><span><b>考</b>：思考・感情・気づき（ダイエット以外の出来事も OK）</span>
        <textarea data-path="content.s04.days.${dayIdx}.thought" rows="3" placeholder="例：同僚に頼れて、ほっとした">${esc(day.thought)}</textarea></label>
      <div class="day-nav">
        <button class="link" data-act="day" data-i="${dayIdx - 1}" ${dayIdx === 0 ? "disabled" : ""}>← 前の日</button>
        <button class="link" data-act="day" data-i="${dayIdx + 1}" ${dayIdx === 6 ? "disabled" : ""}>次の日 →</button>
      </div>
    </div>`;

  const s05 = `
    <label class="field"><span>今週の発見</span>
      <textarea data-path="content.s05.discovery" rows="4" placeholder="例：平日は短い行動が合いそう。">${esc(c.s05.discovery)}</textarea></label>`;

  const s06 = `
    <div class="checks">${CHOICES.map(([k, l]) => `
      <label class="check"><input type="checkbox" data-path="content.s06.choices" data-value="${k}" ${c.s06.choices.includes(k) ? "checked" : ""}><span>${esc(l)}</span></label>`).join("")}
    </div>
    <label class="field"><span>来週、どうしてみたい？</span>
      <textarea data-path="content.s06.next" rows="3" placeholder="例：昼休みの5分歩きを続ける。">${esc(c.s06.next)}</textarea></label>`;

  // プラン提出後は 01〜03 を固定し、04〜06 だけ記入する
  const planLocked = entry.status === "plan_submitted";
  const planView = planLocked ? viewSections(c) : null;
  const plan = planLocked
    ? `<div class="locked-note">プラン提出済み ${esc(stamp(entry.plan_submitted_at))}（01〜03は変更できません）</div>
       ${["s01", "s02", "s03"].map((k) => sectionShell(k, planView[k])).join("")}`
    : `${sectionShell("s01", s01, { clear: true })}
       ${sectionShell("s02", s02, { clear: true })}
       ${sectionShell("s03", s03, { clear: true })}`;
  const submitBtn = planLocked
    ? `<button class="btn primary" data-act="submit-final">最終提出</button>`
    : `<button class="btn primary" data-act="submit-plan">プラン提出</button>`;

  const scrollY = window.scrollY;
  $app.innerHTML = `
    <a class="back" href="#/">← 一覧へ</a>
    <div class="sheet-title">ソウルダイエット｜1週間アクションプラン ＆ フィードバック</div>
    ${sheetHead(entry, me.display_name, !planLocked)}
    ${reminder}
    <div class="part-label">アクションプラン</div>
    ${plan}
    <div class="part-label">実践・気づきジャーナル</div>
    ${planLocked ? "" : `<p class="hint journal-hint">04〜06は、プラン提出のあと1週間かけて記入します（先に書いておいてもOKです）。</p>`}
    ${sectionShell("s04", s04, { clear: true })}
    ${sectionShell("s05", s05, { clear: true })}
    ${sectionShell("s06", s06, { clear: true })}
    <p class="note">※セッションでは、気になる思考や感情を一緒に「事実・解釈・ジャッジ・感情」に分けてみましょう。</p>
    ${planLocked ? "" : `<div class="danger-zone"><button class="link danger" data-act="delete-draft">この下書きを削除する</button></div>`}
    <div class="submit-bar">
      <span id="save-state" class="save-state">${lastSaveOk ? "自動保存されます" : "保存できていません"}</span>
      ${submitBtn}
    </div>`;
  autosize($app);
  window.scrollTo(0, scrollY);
}

function onFieldEvent(e) {
  if (!editing) return;
  const el = e.target.closest("[data-path]");
  if (!el) return;
  const path = el.dataset.path;
  if (el.type === "checkbox") {
    if (e.type !== "change") return;
    const list = getPath(editing, path);
    const v = el.dataset.value;
    const i = list.indexOf(v);
    if (el.checked && i < 0) list.push(v);
    if (!el.checked && i >= 0) list.splice(i, 1);
  } else {
    if (e.type === "change" && el.tagName !== "INPUT") return;
    if (path === "week_no") {
      const n = parseInt(el.value, 10);
      if (!(n >= 1)) return;
      editing.week_no = n;
    } else {
      setPath(editing, path, el.value);
    }
    if (el.tagName === "TEXTAREA") {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + 2 + "px";
    }
    if (path === "period_start" && e.type === "change") {
      scheduleSave();
      return drawEditor(prevCache);
    }
  }
  scheduleSave();
}


function setSaveState(state, err) {
  const el = document.getElementById("save-state");
  if (!el) return;
  el.classList.toggle("err", state === "error");
  el.textContent = {
    dirty: "未保存の変更があります",
    saving: "保存中…",
    saved: `保存しました ${stamp(new Date().toISOString()).split(" ")[1]}`,
    error: "保存できませんでした。電波を確認してください",
  }[state];
  if (err) console.error(err);
}

function scheduleSave() {
  dirty = true;
  setSaveState("dirty");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 800);
}

function flushSave() {
  clearTimeout(saveTimer);
  if (!dirty || !editing) return saveChain;
  dirty = false;
  const id = editing.id;
  const snap = { week_no: editing.week_no, period_start: editing.period_start || null, content: clone(editing.content) };
  setSaveState("saving");
  saveChain = saveChain
    .then(() => store.saveEntry(id, snap))
    .then(() => { lastSaveOk = true; setSaveState("saved"); })
    .catch((err) => { lastSaveOk = false; dirty = true; setSaveState("error", err); });
  return saveChain;
}

// ---------- 閲覧画面（提出済み） ----------
function viewText(s) {
  return blank(s) ? `<p class="empty">（未記入）</p>` : `<p class="pre">${nl(s)}</p>`;
}

function viewSections(c) {
  const out = {};
  out.s01 = viewText(c.s01.direction);
  out.s02 = `
    <div class="chips">${STANCES.map(([k, l]) => `<span class="chip ${c.s02.stance.includes(k) ? "on" : "off"}">${c.s02.stance.includes(k) ? "☑" : "□"} ${esc(l)}</span>`).join("")}</div>
    ${viewText(c.s02.theme)}`;
  out.s03 = DAYTYPES.map(([dt, label]) => {
    const rows = CATS.map(([cat, kanji, catLabel]) => {
      const items = c.s03[dt][cat].filter((r) => !blank(r.what) || !blank(r.when) || !blank(r.why));
      return `
        <div class="cat">
          <div class="cat-head"><span class="cat-kanji cat-${cat}">${kanji}</span><span>${esc(catLabel)}</span></div>
          ${items.length ? items.map((r, i) => `
            <div class="plan-view">
              <span class="plan-no">${"①②③④⑤"[i] || i + 1}</span>
              <div><div class="pre">${nl(r.what) || '<span class="empty">（未記入）</span>'}</div>
              <div class="muted small">${!blank(r.when) ? `いつ：${nl(r.when)}` : ""}${!blank(r.when) && !blank(r.why) ? " ／ " : ""}${!blank(r.why) ? `目的：${nl(r.why)}` : ""}</div></div>
            </div>`).join("") : `<p class="empty">（未記入）</p>`}
        </div>`;
    }).join("");
    return `<div class="daytype"><h3>${esc(label)}</h3>${rows}</div>`;
  }).join("");
  out.s05 = `<div class="field-label">今週の発見</div>${viewText(c.s05.discovery)}`;
  out.s06 = `
    <div class="chips">${CHOICES.map(([k, l]) => `<span class="chip ${c.s06.choices.includes(k) ? "on" : "off"}">${c.s06.choices.includes(k) ? "☑" : "□"} ${esc(l)}</span>`).join("")}</div>
    <div class="field-label">来週、どうしてみたい？</div>${viewText(c.s06.next)}`;
  return out;
}

function viewDays(entry) {
  return `<div class="days-view">${entry.content.s04.days.map((d, i) => {
    const l = dayLabel(entry.period_start, i);
    return `
      <div class="day-view">
        <div class="day-view-label"><span class="dt-wd">${l.wd}</span><span class="dt-date">${l.date}</span></div>
        <div class="day-view-body">
          <div><span class="mini">食・動・休</span>${blank(d.practice) ? '<span class="empty">—</span>' : `<span class="pre">${nl(d.practice)}</span>`}</div>
          <div><span class="mini think">考</span>${blank(d.thought) ? '<span class="empty">—</span>' : `<span class="pre">${nl(d.thought)}</span>`}</div>
        </div>
      </div>`;
  }).join("")}</div>`;
}

function renderView(entry, feedback, siblings, clientName, isOwner) {
  const c = entry.content;
  const v = viewSections(c);
  v.s04 = viewDays(entry);
  const fbOf = (sec) => feedback.find((f) => f.section === sec);
  const coach = me.role === "coach" && !isOwner;
  const planOnly = entry.status === "plan_submitted";

  const fbBlock = (sec) => {
    const f = fbOf(sec);
    if (coach) {
      return `
        <div class="fb-edit">
          <label class="field"><span>${sec === "overall" ? "全体へのフィードバック" : "この項目へのコメント"}</span>
            <textarea data-fb="${sec}" rows="${sec === "overall" ? 4 : 2}" placeholder="${sec === "overall" ? "1週間を通してのフィードバック" : "コメント（空欄なら表示されません）"}">${esc(f ? f.body : "")}</textarea></label>
          <div class="fb-actions"><span class="small muted" data-fbstate="${sec}">${f ? `保存済み ${esc(stamp(f.updated_at))}` : ""}</span><button class="btn small-btn" data-act="save-fb" data-sec="${sec}">保存</button></div>
        </div>`;
    }
    if (!f) return "";
    return `<div class="fb"><div class="fb-label">コーチより</div><p class="pre">${nl(f.body)}</p></div>`;
  };

  const newer = siblings.filter((e) => e.week_no > entry.week_no).sort((a, b) => a.week_no - b.week_no)[0];
  let actions = "";
  if (isOwner) {
    actions = `
      <section class="card pad actions">
        ${newer
          ? `<a class="btn primary" href="#/entry/${esc(newer.id)}">第${esc(newer.week_no)}週を開く</a>`
          : `<button class="btn primary" data-act="next-week" data-from="${esc(entry.id)}">この内容をコピーして第${entry.week_no + 1}週を作る</button>`}
        <button class="btn" data-act="copy-text" data-id="${esc(entry.id)}">テキストとしてコピー</button>
        <p class="small muted">コピーすると「01〜03 アクションプラン」を引き継ぎ、「04〜06 ジャーナル」は白紙になります。</p>
      </section>`;
  } else {
    actions = `
      <section class="card pad actions">
        <button class="btn" data-act="copy-text" data-id="${esc(entry.id)}">テキストとしてコピー</button>
      </section>`;
  }

  const overall = fbOf("overall");
  $app.innerHTML = `
    <a class="back" href="${coach ? `#/client/${esc(entry.client_id)}` : "#/"}">← 一覧へ</a>
    <div class="sheet-title">ソウルダイエット｜1週間アクションプラン ＆ フィードバック</div>
    ${sheetHead(entry, clientName, false)}
    ${planOnly
      ? `<div class="locked-note">プラン提出済み ${esc(stamp(entry.plan_submitted_at))}・最終提出待ち</div>`
      : `<div class="submitted-note">最終提出済み ${esc(stamp(entry.submitted_at))}${coach ? "" : "（提出後は編集できません）"}</div>`}
    ${!coach && overall ? `<section class="card pad fb-overall"><div class="fb-label">コーチからのフィードバック</div><p class="pre">${nl(overall.body)}</p></section>` : ""}
    <div class="part-label">アクションプラン</div>
    ${["s01", "s02", "s03"].map((k) => sectionShell(k, v[k], { extra: planOnly ? "" : fbBlock(k) })).join("")}
    <div class="part-label">実践・気づきジャーナル</div>
    ${planOnly
      ? `<section class="card pad"><p class="muted">04〜06（実践・振り返り・次週の選択）は、クライアントが最終提出すると表示されます。コメントも最終提出のあとに書けます。</p></section>`
      : `${["s04", "s05", "s06"].map((k) => sectionShell(k, v[k], { extra: fbBlock(k) })).join("")}
         ${coach ? `<section class="card pad">${fbBlock("overall")}</section>` : ""}
         ${actions}`}`;
  $app.dataset.entryId = entry.id;
  autosize($app);
  window.scrollTo(0, 0);
}

function entryAsText(entry, name) {
  const c = normalize(entry.content);
  const L = [];
  const t = (s) => (blank(s) ? "（未記入）" : s.trim());
  L.push(`ソウルダイエット｜1週間アクションプラン＆フィードバック`);
  L.push(`第${entry.week_no}週　${periodText(entry.period_start)}　名前：${name}`);
  L.push("");
  L.push(`■01 ${SECTIONS.s01.title}`, t(c.s01.direction), "");
  L.push(`■02 ${SECTIONS.s02.title}`);
  L.push(STANCES.map(([k, l]) => `${c.s02.stance.includes(k) ? "☑" : "□"}${l}`).join("　"));
  L.push(t(c.s02.theme), "");
  L.push(`■03 ${SECTIONS.s03.title}`);
  for (const [dt, label] of DAYTYPES) {
    L.push(`・${label}`);
    for (const [cat, kanji, catLabel] of CATS) {
      const rows = c.s03[dt][cat].filter((r) => !blank(r.what) || !blank(r.when) || !blank(r.why));
      if (!rows.length) { L.push(`  ${kanji}（${catLabel}）：（未記入）`); continue; }
      rows.forEach((r, i) => {
        const extra = [!blank(r.when) ? `いつ：${r.when.trim()}` : "", !blank(r.why) ? `目的：${r.why.trim()}` : ""].filter(Boolean).join("／");
        L.push(`  ${kanji}${"①②③④⑤"[i] || i + 1} ${r.what.trim()}${extra ? `（${extra}）` : ""}`);
      });
    }
  }
  L.push("");
  L.push(`■04 ${SECTIONS.s04.title}`);
  c.s04.days.forEach((d, i) => {
    const l = dayLabel(entry.period_start, i);
    L.push(`${l.wd} ${l.date}　食・動・休：${blank(d.practice) ? "—" : d.practice.trim()}　／　考：${blank(d.thought) ? "—" : d.thought.trim()}`);
  });
  L.push("");
  L.push(`■05 ${SECTIONS.s05.title}`, t(c.s05.discovery), "");
  L.push(`■06 ${SECTIONS.s06.title}`);
  L.push(CHOICES.map(([k, l]) => `${c.s06.choices.includes(k) ? "☑" : "□"}${l}`).join("　"));
  L.push(`来週、どうしてみたい？：${t(c.s06.next)}`);
  return L.join("\n");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
    ta.remove();
    return ok;
  }
}

// =====================================================================
// コーチ
// =====================================================================
async function renderCoachHome() {
  const [members, entries] = await Promise.all([store.listMembers(), store.listAllEntries()]);
  const submittedIds = entries.filter((e) => e.status === "submitted").map((e) => e.id);
  const fb = await store.listFeedback(submittedIds);
  const hasFb = new Set(fb.map((f) => f.entry_id));
  const clients = members.filter((m) => m.role === "client");

  const rows = clients.map((m) => {
    const mine = m.user_id ? entries.filter((e) => e.client_id === m.user_id).sort((a, b) => b.week_no - a.week_no) : [];
    const lastSubmitted = mine.find((e) => e.status === "submitted");
    const draft = mine.find((e) => e.status === "draft");
    const planned = mine.find((e) => e.status === "plan_submitted");
    let status = "";
    let rank = 3;
    if (!m.user_id) { status = `<span class="chip off">まだログインしていません</span>`; rank = 4; }
    else if (lastSubmitted && !hasFb.has(lastSubmitted.id)) { status = `<span class="chip new">第${lastSubmitted.week_no}週 提出あり・未コメント</span>`; rank = 0; }
    else if (lastSubmitted) { status = `<span class="chip done">第${lastSubmitted.week_no}週 コメント済み</span>`; rank = 2; }
    if (planned) {
      status += `<span class="chip plan">第${planned.week_no}週 プラン提出済み</span>`;
      if (rank > 1) rank = 1;
    }
    if (draft) status += `<span class="chip draft">第${draft.week_no}週 プラン記入中</span>`;
    if (!status) status = `<span class="chip off">シートなし</span>`;
    const last = lastSubmitted ? `<div class="small muted">最終提出 ${esc(stamp(lastSubmitted.submitted_at))}</div>` : "";
    return {
      rank,
      html: m.user_id
        ? `<a class="entry-card" href="#/client/${esc(m.user_id)}"><div class="entry-card-main"><div class="entry-week">${esc(m.display_name || m.email)}</div><div class="small muted">${esc(m.email)}</div>${last}</div><div class="entry-card-side">${status}</div></a>`
        : `<div class="entry-card disabled"><div class="entry-card-main"><div class="entry-week">${esc(m.display_name || m.email)}</div><div class="small muted">${esc(m.email)}</div></div><div class="entry-card-side">${status}</div></div>`,
    };
  }).sort((a, b) => a.rank - b.rank);

  const url = location.origin + location.pathname;
  const inviteTo = clients.find((m) => m.email === inviteFor) || clients[clients.length - 1];
  $app.innerHTML = `
    <h1 class="page-title">クライアント</h1>
    ${rows.length ? `<div class="list">${rows.map((r) => r.html).join("")}</div>` : `<p class="muted pad">まだクライアントが登録されていません。下のフォームから追加してください。</p>`}
    <section class="card pad">
      <h2>クライアントを追加</h2>
      <form id="add-member" class="stack">
        <label class="field"><span>お名前</span><input name="name" required placeholder="魂 花子"></label>
        <label class="field"><span>メールアドレス</span><input name="email" type="email" required inputmode="email" placeholder="client@example.com"></label>
        <button class="btn primary" type="submit">追加する</button>
      </form>
      <p class="small muted">登録したメールアドレスだけがログインできます。</p>
    </section>
    <section class="card pad">
      <h2>クライアントさんへの案内文</h2>
      <p class="small muted">コピーして LINE やメールで送れます。URL にメールアドレスが入っているので、クライアントさんは入力しなくて済みます。</p>
      ${clients.length ? `<label class="field"><span>送る相手</span><select id="invite-to">${clients.map((m) => `<option value="${esc(m.email)}" ${inviteTo && m.email === inviteTo.email ? "selected" : ""}>${esc(m.display_name || m.email)}</option>`).join("")}</select></label>` : ""}
      <pre class="invite" id="invite">${esc(inviteText(url, inviteTo))}</pre>
      <button class="btn" data-act="copy-invite">案内文をコピー</button>
    </section>`;

  const sel = document.getElementById("invite-to");
  if (sel) sel.addEventListener("change", () => {
    inviteFor = sel.value;
    document.getElementById("invite").textContent = inviteText(url, clients.find((m) => m.email === sel.value));
  });

  document.getElementById("add-member").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await store.addMember(f.email.value, f.name.value.trim());
      inviteFor = f.email.value.trim().toLowerCase();
      toast("追加しました。下の案内文を送ってください");
      render();
    } catch (err) {
      toast(err.message);
    }
  });
}

let inviteFor = null;    // 案内文の宛先（クライアントのメールアドレス）

function inviteText(url, member) {
  const link = member ? `${url}?email=${encodeURIComponent(member.email)}` : url;
  return [
    member && member.display_name ? `${member.display_name}さん` : "",
    "【ソウルダイエット 週次ダイエットプランのご案内】",
    "毎週のアクションプランと振り返りは、こちらから記入・提出してください。",
    link,
    "",
    "▼はじめての方",
    "1. 上のURLを開き、「ログイン用メールを送る」を押す",
    "2. 届いたメール（件名「【ソウルダイエット】週次ダイエットプランログインのご案内」）の「ログインする」ボタンを押す",
    "3. 「第1週をはじめる」から記入できます",
    "",
    "▼2回目から",
    "同じスマホ・パソコンならログインしたままです。",
    "ホーム画面に追加しておくと便利です。",
    "",
    "入力は自動で保存されます。書き終えたら「提出する」を押してください。",
  ].filter((line, i) => i > 0 || line).join("\n");
}

async function renderCoachClient(userId) {
  const [members, entries] = await Promise.all([store.listMembers(), store.listEntries(userId)]);
  const m = members.find((x) => x.user_id === userId);
  const fb = await store.listFeedback(entries.filter((e) => e.status === "submitted").map((e) => e.id));
  $app.innerHTML = `
    <a class="back" href="#/">← クライアント一覧へ</a>
    <h1 class="page-title">${esc(m ? m.display_name || m.email : "クライアント")}</h1>
    ${m ? `<p class="muted small">${esc(m.email)}</p>` : ""}
    ${entries.length
      ? `<div class="list">${entries.map((e) => entryCard(e, fb.filter((f) => f.entry_id === e.id).length, e.status !== "draft")).join("")}</div>
         <p class="small muted">プラン記入中のシートは、プラン提出されると読めるようになります。04〜06とコメントは最終提出のあとです。</p>`
      : `<p class="muted pad">まだシートがありません。</p>`}`;
}

// =====================================================================
// クリック操作
// =====================================================================
async function onClick(e) {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  try {
    switch (act) {
      case "reload": location.reload(); break;
      case "logout":
        await flushSave();
        if (dirty) { toast("保存できていない変更があります。電波を確認してください。"); return; }
        await store.signOut();
        me = null;
        go("#/");
        break;
      case "demo-login": await store.demoLogin(el.dataset.role); go("#/"); break;
      case "demo-switch": await store.demoLogin(me.role === "coach" ? "client" : "coach"); go("#/"); break;
      case "demo-reset":
        if (confirm("お試しデータを最初の状態に戻しますか？")) { store.reset(); toast("戻しました"); render(); }
        break;
      case "login-back":
        document.getElementById("login-form").hidden = false;
        document.getElementById("code-form").hidden = true;
        break;
      case "new-week": {
        el.disabled = true;
        const week = parseInt(el.dataset.week || "1", 10);
        await createWeek({ week_no: week, period_start: el.dataset.start || toISO(thisMonday()), content: emptyContent() });
        break;
      }
      case "next-week": {
        el.disabled = true;
        const from = await store.getEntry(el.dataset.from);
        const start = from.period_start ? toISO(addDays(parseDate(from.period_start), 7)) : toISO(thisMonday());
        await createWeek({ week_no: from.week_no + 1, period_start: start, content: contentForNextWeek(from.content) });
        toast(`第${from.week_no + 1}週を作りました`);
        break;
      }
      case "clear": {
        const sec = el.dataset.sec;
        if (!editing) return;
        if (!confirm(`「${SECTIONS[sec].no} ${SECTIONS[sec].title}」の内容を消しますか？`)) return;
        editing.content[sec] = emptyContent()[sec];
        scheduleSave();
        drawEditor(prevCache);
        toast("クリアしました");
        break;
      }
      case "add-row": {
        const rows = editing.content.s03[el.dataset.dt][el.dataset.cat];
        if (rows.length < MAX_ROWS) rows.push(emptyRow());
        scheduleSave();
        drawEditor(prevCache);
        break;
      }
      case "day": {
        const i = parseInt(el.dataset.i, 10);
        if (i < 0 || i > 6) return;
        dayIdx = i;
        drawEditor(prevCache);
        break;
      }
      case "submit-plan":
      case "submit-final": {
        const final = act === "submit-final";
        await flushSave();
        if (dirty || !lastSaveOk) { toast("保存できていません。電波を確認してから、もう一度押してください。"); return; }
        const msg = final
          ? "最終提出しますか？\n提出すると、このシートは編集できなくなります。"
          : "プランを提出しますか？\n提出すると、01〜03（アクションプラン）は変更できなくなります。\n04〜06は、このあと1週間かけて記入できます。";
        if (!confirm(msg)) return;
        el.disabled = true;
        const id = editing.id;
        editing = null;
        if (final) await store.submitEntry(id);
        else await store.submitPlan(id);
        toast(final ? "最終提出しました。おつかれさまでした！" : "プランを提出しました。1週間の記録をつけていきましょう");
        go(`#/entry/${id}`);
        if (!final) window.scrollTo(0, 0);
        break;
      }
      case "delete-draft": {
        if (!confirm("この下書きを削除しますか？元に戻せません。")) return;
        const id = editing.id;
        editing = null;
        dirty = false;
        await store.deleteEntry(id);
        toast("削除しました");
        go("#/");
        break;
      }
      case "save-fb": {
        const sec = el.dataset.sec;
        const ta = $app.querySelector(`textarea[data-fb="${sec}"]`);
        const state = $app.querySelector(`[data-fbstate="${sec}"]`);
        el.disabled = true;
        state.textContent = "保存中…";
        await store.saveFeedback($app.dataset.entryId, sec, ta.value);
        state.textContent = ta.value.trim() ? `保存済み ${stamp(new Date().toISOString())}` : "削除しました";
        el.disabled = false;
        break;
      }
      case "copy-text": {
        const entry = await store.getEntry(el.dataset.id);
        let name = me.display_name;
        if (entry.client_id !== me.user_id) {
          const m = (await store.listMembers()).find((x) => x.user_id === entry.client_id);
          name = m ? m.display_name : "";
        }
        toast((await copyText(entryAsText(entry, name))) ? "コピーしました" : "コピーできませんでした");
        break;
      }
      case "copy-invite":
        toast((await copyText(document.getElementById("invite").textContent)) ? "コピーしました" : "コピーできませんでした");
        break;
    }
  } catch (err) {
    console.error(err);
    el.disabled = false;
    toast(err.message || "うまくいきませんでした。もう一度お試しください。");
  }
}

boot();
