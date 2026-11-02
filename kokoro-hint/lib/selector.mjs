// 日替わりメッセージの選択ロジック
//
// 1. メッセージをテーマごとにまとめ、テーマ内番号（C列）順に並べる
// 2. 「各テーマから1つずつ」を1ラウンドとし、ラウンドごとにテーマの順番を
//    固定シードで並べ替える（毎回同じ結果になる＝表示順は固定）
//    - 6日ごとに6テーマが必ず1回ずつ登場する
//    - 同じテーマが2日続かない（ラウンドの境目・一巡の境目も含む）
// 3. 開始日からの経過日数 % メッセージ数 で今日のメッセージを決める
//
// 日付はすべて日本時間（Asia/Tokyo）の「YYYY-MM-DD」で扱う。

export const DEFAULT_SEED = 20240707;

/** 日本時間の日付文字列（YYYY-MM-DD）を返す */
export function jstDateString(now = new Date()) {
  // 日本には夏時間がないため、UTC+9 固定で計算できる
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

/** 日本時間で次の午前0時までの秒数 */
export function secondsUntilJstMidnight(now = new Date()) {
  const jstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.ceil((dayMs - (jstMs % dayMs)) / 1000));
}

/** YYYY-MM-DD 形式かつ実在する日付か */
export function isValidDateString(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** 2つの日付（YYYY-MM-DD）の差（日数） */
export function daysBetween(fromDate, toDate) {
  const a = Date.parse(`${fromDate}T00:00:00Z`);
  const b = Date.parse(`${toDate}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

// 再現性のある疑似乱数（mulberry32）
function createRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, random) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 表示順（一巡分）を作る。
 * @param {Array<{no:number, theme:string, themeNo:number, text:string}>} messages
 * @param {number} seed
 * @returns 表示順に並んだメッセージ配列
 */
export function buildSchedule(messages, seed = DEFAULT_SEED) {
  // テーマの並び：通し番号順で最初に出てきた順
  const byNo = messages.slice().sort((a, b) => a.no - b.no);
  const themes = [];
  const queues = new Map();
  for (const m of byNo) {
    if (!queues.has(m.theme)) {
      themes.push(m.theme);
      queues.set(m.theme, []);
    }
    queues.get(m.theme).push(m);
  }
  for (const q of queues.values()) {
    q.sort((a, b) => a.themeNo - b.themeNo || a.no - b.no);
  }

  const random = createRandom(seed);
  const schedule = [];
  const firstTheme = () => (schedule.length ? schedule[0].theme : null);
  const lastTheme = () => (schedule.length ? schedule[schedule.length - 1].theme : null);

  while (true) {
    const available = themes.filter((t) => queues.get(t).length > 0);
    if (available.length === 0) break;
    const isLastRound = available.every((t) => queues.get(t).length === 1);

    // 条件を満たす並びが出るまで並べ替える（決定的なので毎回同じ結果）
    let order = shuffled(available, random);
    for (let tries = 0; tries < 200 && available.length > 1; tries++) {
      const okStart = order[0] !== lastTheme();
      const okEnd = !isLastRound || order[order.length - 1] !== firstTheme();
      if (okStart && okEnd) break;
      order = shuffled(available, random);
    }
    for (const t of order) schedule.push(queues.get(t).shift());
  }
  return schedule;
}

/**
 * 指定日のメッセージを返す。
 * @param {Array} messages スプレッドシートの全メッセージ
 * @param {string} date 表示する日（YYYY-MM-DD・日本時間）
 * @param {string} startDate 開始日（YYYY-MM-DD）。この日に表示順の1番目を出す
 */
export function pickMessage(messages, date, startDate, seed = DEFAULT_SEED) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('メッセージが0件です');
  }
  const schedule = buildSchedule(messages, seed);
  const n = schedule.length;
  const offset = daysBetween(startDate, date);
  const index = ((offset % n) + n) % n; // 開始日より前の日付でも破綻しない
  return { index, message: schedule[index] };
}
