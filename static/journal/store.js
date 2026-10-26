// データの保存先。Supabase の設定があれば Supabase、無ければこの端末だけに保存する「お試しモード」。
// どちらも同じ関数名・同じ形のデータを返すので、画面側は保存先を気にしなくてよい。

const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/dist/umd/supabase.js";

export async function createStore(config) {
  if (config && config.supabaseUrl && config.supabaseAnonKey) {
    await loadScript(SUPABASE_JS);
    return new SupabaseStore(config);
  }
  return new DemoStore();
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("通信エラーで読み込めませんでした。電波の良い場所で再読み込みしてください。"));
    document.head.appendChild(s);
  });
}

// =====================================================================
// Supabase
// =====================================================================
class SupabaseStore {
  constructor(config) {
    this.mode = "supabase";
    this.sb = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }

  async me() {
    const { data } = await this.sb.auth.getSession();
    const user = data.session && data.session.user;
    if (!user) return null;
    const { data: m, error } = await this.sb.from("members").select("*").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    if (!m) return { user_id: user.id, email: user.email, display_name: "", role: "none" };
    return m;
  }

  async sendLogin(email) {
    const { error } = await this.sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    if (error) throw friendlyAuthError(error);
  }

  async verifyCode(email, code) {
    const { error } = await this.sb.auth.verifyOtp({ email, token: code, type: "email" });
    if (error) throw friendlyAuthError(error);
  }

  async signOut() {
    await this.sb.auth.signOut();
  }

  async listEntries(clientId) {
    const { data, error } = await this.sb
      .from("weekly_entries").select("*").eq("client_id", clientId)
      .order("week_no", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  async getEntry(id) {
    const { data, error } = await this.sb.from("weekly_entries").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async createEntry({ week_no, period_start, content }) {
    const { data, error } = await this.sb
      .from("weekly_entries").insert({ week_no, period_start, content }).select().single();
    if (error) throw error;
    return data;
  }

  async saveEntry(id, { week_no, period_start, content }) {
    const { error } = await this.sb
      .from("weekly_entries").update({ week_no, period_start, content }).eq("id", id);
    if (error) throw error;
  }

  async submitPlan(id) {
    const { data, error } = await this.sb
      .from("weekly_entries").update({ status: "plan_submitted" }).eq("id", id).select().single();
    if (error) throw error;
    return data;
  }

  async submitEntry(id) {
    const { data, error } = await this.sb
      .from("weekly_entries").update({ status: "submitted" }).eq("id", id).select().single();
    if (error) throw error;
    return data;
  }

  async deleteEntry(id) {
    const { error } = await this.sb.from("weekly_entries").delete().eq("id", id);
    if (error) throw error;
  }

  async listFeedback(entryIds) {
    if (!entryIds.length) return [];
    const { data, error } = await this.sb.from("feedback").select("*").in("entry_id", entryIds);
    if (error) throw error;
    return data;
  }

  async saveFeedback(entryId, section, body) {
    if (!body.trim()) {
      const { error } = await this.sb.from("feedback").delete().eq("entry_id", entryId).eq("section", section);
      if (error) throw error;
      return;
    }
    const { error } = await this.sb
      .from("feedback").upsert({ entry_id: entryId, section, body }, { onConflict: "entry_id,section" });
    if (error) throw error;
  }

  async listMembers() {
    const { data, error } = await this.sb.from("members").select("*").order("created_at");
    if (error) throw error;
    return data;
  }

  async listAllEntries() {
    const { data, error } = await this.sb
      .from("weekly_entries").select("id, client_id, week_no, period_start, status, plan_submitted_at, submitted_at, updated_at")
      .order("week_no", { ascending: false });
    if (error) throw error;
    return data;
  }

  async addMember(email, displayName) {
    const { error } = await this.sb.from("members").insert({ email: email.trim().toLowerCase(), display_name: displayName });
    if (error) {
      if (error.code === "23505") throw new Error("このメールアドレスはすでに登録されています。");
      throw error;
    }
  }

  async updateMemberName(email, displayName) {
    const { error } = await this.sb.from("members").update({ display_name: displayName }).eq("email", email);
    if (error) throw error;
  }
}

function friendlyAuthError(error) {
  const msg = String(error.message || "");
  if (/database error|not_a_member/i.test(msg)) {
    return new Error("このメールアドレスは登録されていません。コーチに登録をお願いしてください。");
  }
  if (/rate limit|too many|security purposes/i.test(msg)) {
    return new Error("短い時間に何度も送信されました。少し時間をおいてからもう一度お試しください。");
  }
  if (/expired|invalid/i.test(msg)) {
    return new Error("コードが正しくないか、有効期限が切れています。もう一度メールを送ってください。");
  }
  return new Error(msg || "ログインに失敗しました。");
}

// =====================================================================
// お試しモード（この端末の localStorage に保存）
// =====================================================================
const DEMO_KEY = "soul-journal-demo-v1";
const DEMO_COACH = { email: "coach@example.com", user_id: "demo-coach", display_name: "コーチ", role: "coach" };
const DEMO_CLIENT = { email: "hanako@example.com", user_id: "demo-hanako", display_name: "魂 花子", role: "client" };

class DemoStore {
  constructor() {
    this.mode = "demo";
    this.memory = null;
    this.db = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* 保存できない環境ではメモリだけで動かす */ }
    return demoSeed();
  }

  _save() {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(this.db)); } catch (e) { /* noop */ }
  }

  reset() {
    this.db = demoSeed();
    this._save();
  }

  async me() {
    return this.db.members.find((m) => m.user_id === this.db.current) || null;
  }

  async demoLogin(role) {
    this.db.current = role === "coach" ? DEMO_COACH.user_id : DEMO_CLIENT.user_id;
    this._save();
  }

  async signOut() {
    this.db.current = null;
    this._save();
  }

  async listEntries(clientId) {
    return this.db.entries
      .filter((e) => e.client_id === clientId)
      .sort((a, b) => b.week_no - a.week_no || b.created_at.localeCompare(a.created_at))
      .map(clone);
  }

  async getEntry(id) {
    return clone(this.db.entries.find((e) => e.id === id) || null);
  }

  async createEntry({ week_no, period_start, content }) {
    const now = new Date().toISOString();
    const e = {
      id: uid(), client_id: this.db.current, week_no, period_start, content,
      status: "draft", plan_submitted_at: null, submitted_at: null, created_at: now, updated_at: now,
    };
    this.db.entries.push(e);
    this._save();
    return clone(e);
  }

  _ownDraft(id) {
    const e = this.db.entries.find((x) => x.id === id);
    if (!e || e.client_id !== this.db.current) throw new Error("シートが見つかりません。");
    if (e.status === "submitted") throw new Error("最終提出済みのシートは編集できません。");
    return e;
  }

  async saveEntry(id, { week_no, period_start, content }) {
    const e = this._ownDraft(id);
    content = clone(content);
    // Supabase 側のトリガーと同じく、プラン提出後は 01〜03 と週・期間を変えない
    if (e.status === "plan_submitted") {
      ({ week_no, period_start } = e);
      for (const k of ["s01", "s02", "s03"]) content[k] = clone(e.content[k]);
    }
    Object.assign(e, { week_no, period_start, content, updated_at: new Date().toISOString() });
    this._save();
  }

  async submitPlan(id) {
    const e = this._ownDraft(id);
    if (e.status !== "draft") throw new Error("プランは提出済みです。");
    e.status = "plan_submitted";
    e.plan_submitted_at = e.updated_at = new Date().toISOString();
    this._save();
    return clone(e);
  }

  async submitEntry(id) {
    const e = this._ownDraft(id);
    e.status = "submitted";
    e.submitted_at = e.updated_at = new Date().toISOString();
    if (!e.plan_submitted_at) e.plan_submitted_at = e.submitted_at;
    this._save();
    return clone(e);
  }

  async deleteEntry(id) {
    if (this._ownDraft(id).status !== "draft") throw new Error("プラン提出済みのシートは削除できません。");
    this.db.entries = this.db.entries.filter((e) => e.id !== id);
    this._save();
  }

  async listFeedback(entryIds) {
    return this.db.feedback.filter((f) => entryIds.includes(f.entry_id)).map(clone);
  }

  async saveFeedback(entryId, section, body) {
    this.db.feedback = this.db.feedback.filter((f) => !(f.entry_id === entryId && f.section === section));
    if (body.trim()) {
      const now = new Date().toISOString();
      this.db.feedback.push({ id: uid(), entry_id: entryId, section, body, created_at: now, updated_at: now });
    }
    this._save();
  }

  async listMembers() {
    return this.db.members.map(clone);
  }

  async listAllEntries() {
    return this.db.entries.map(clone);
  }

  async addMember(email, displayName) {
    email = email.trim().toLowerCase();
    if (this.db.members.some((m) => m.email === email)) throw new Error("このメールアドレスはすでに登録されています。");
    this.db.members.push({ email, user_id: null, display_name: displayName, role: "client" });
    this._save();
  }

  async updateMemberName(email, displayName) {
    const m = this.db.members.find((x) => x.email === email);
    if (m) m.display_name = displayName;
    this._save();
  }
}

function demoSeed() {
  const plan = (rows) => rows.map(([what, when, why]) => ({ what, when, why }));
  const content = {
    s01: { direction: "疲れた日も自分を責めず、体の声を聞いて食事や休み方を選べる私。" },
    s02: { stance: ["discover"], theme: "仕事のある日と休日で、無理なく続けられる方法を探す。" },
    s03: {
      weekday: {
        food: plan([["一口10〜15回、よく噛んで食べる", "昼食", "満腹感の確認"], ["夕食前に空腹を確認", "帰宅後", "疲れに任せず選ぶため"]]),
        move: plan([["昼休みに5分歩く", "昼休み", "気分転換できるか試す"], ["", "", ""]]),
        rest: plan([["寝る前に深呼吸を3回", "就寝前", "頭を休ませるため"], ["", "", ""]]),
      },
      holiday: {
        food: plan([["生野菜を食事前に食べる・お味噌汁を飲む", "毎食", "満足感を観察する"], ["昼食をゆっくり味わう", "昼食", "満足感を観察する"]]),
        move: plan([["好きな音楽で10分動く", "午前中", "楽しく動けるか試す"], ["", "", ""]]),
        rest: plan([["午後に15分のんびりする", "午後", "休んだ後の体調を知る"], ["", "", ""]]),
      },
    },
    s04: {
      days: [
        ["夕食前に空腹を確認。食後が軽い", "「ちゃんと作らなきゃ」と焦った"],
        ["昼休み5分歩く。頭がすっきり", "同僚に頼れて、ほっとした"],
        ["残業で散歩なし。肩が重い", "「またできなかった」と自分を責めた"],
        ["寝る前の深呼吸で落ち着いた", "昨日の「また」は事実かな？"],
        ["夕食は買って帰った。楽だった", "手を抜くのは悪い、と思っていた"],
        ["音楽で10分動いた。楽しい", "好きなことなら自然に動ける"],
        ["15分休憩。午後は元気", "休むことにも意味があると感じた"],
      ].map(([practice, thought]) => ({ practice, thought })),
    },
    s05: { discovery: "平日は短い行動が合いそう。水曜の「またできなかった」は気になる思考。\n休むと体が楽になる日もあった。" },
    s06: { choices: ["continue", "adjust"], next: "昼休みの5分歩きを続ける。残業の日は休息を優先してみる。" },
  };
  return {
    current: null,
    members: [clone(DEMO_COACH), clone(DEMO_CLIENT)],
    entries: [{
      id: "demo-week1", client_id: DEMO_CLIENT.user_id, week_no: 1, period_start: "2026-10-05", content,
      status: "submitted", plan_submitted_at: "2026-10-05T21:00:00.000Z", submitted_at: "2026-10-11T21:00:00.000Z", created_at: "2026-10-05T09:00:00.000Z",
      updated_at: "2026-10-11T21:00:00.000Z",
    }],
    feedback: [],
  };
}

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function clone(x) {
  return x == null ? x : JSON.parse(JSON.stringify(x));
}
