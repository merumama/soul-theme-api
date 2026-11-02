// Netlify Function: GET /api/today
//
// ブラウザ → (このFunction) → GAS → スプレッドシート
// GAS の URL と合言葉（トークン）は Netlify の環境変数にだけ置き、
// ブラウザには「今日のメッセージ本文」と「日付」だけを返す。
//
// 環境変数
//   GAS_URL     … GAS ウェブアプリの URL（https://script.google.com/macros/s/xxxx/exec）
//   GAS_TOKEN   … GAS のスクリプトプロパティ API_TOKEN と同じ値
//   START_DATE  … 開始日（YYYY-MM-DD）。この日に表示順の1番目が出る
//   SCHEDULE_SEED … 任意。表示順を作り直したいときだけ数値を変更

import { normalizeMessages } from '../../lib/messages.mjs';
import {
  DEFAULT_SEED,
  isValidDateString,
  jstDateString,
  pickMessage,
  secondsUntilJstMidnight,
} from '../../lib/selector.mjs';

const DEFAULT_START_DATE = '2026-11-01';
const FETCH_TIMEOUT_MS = 10000;
const CDN_CACHE_MAX_SECONDS = 300; // スプレッドシートの修正は最大5分で反映

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export default async function handler(req, _context, { now = new Date() } = {}) {
  const gasUrl = process.env.GAS_URL;
  const gasToken = process.env.GAS_TOKEN;
  const startDate = process.env.START_DATE || DEFAULT_START_DATE;
  const seed = Number(process.env.SCHEDULE_SEED) || DEFAULT_SEED;

  if (!gasUrl || !gasToken || !isValidDateString(startDate)) {
    console.error('[today] 環境変数が不足または不正です (GAS_URL / GAS_TOKEN / START_DATE)');
    return json(500, { ok: false, error: 'config' });
  }

  const date = jstDateString(now);

  let messages;
  try {
    const url = new URL(gasUrl);
    url.searchParams.set('token', gasToken);
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`GAS HTTP ${res.status}`);
    const text = await res.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error('GASの応答がJSONではありません（公開設定・URLを確認してください）');
    }
    messages = normalizeMessages(payload);
  } catch (err) {
    console.error('[today] メッセージ取得に失敗:', err && err.message);
    return json(502, { ok: false, error: 'fetch_failed' });
  }

  const { message } = pickMessage(messages, date, startDate, seed);

  // CDN に短時間キャッシュ（GASへのアクセスを減らす）。日付をまたがないよう上限を設ける
  const cdnSeconds = Math.min(CDN_CACHE_MAX_SECONDS, secondsUntilJstMidnight(now));
  return json(
    200,
    { ok: true, date, message: message.text },
    {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': `public, s-maxage=${cdnSeconds}`,
    },
  );
}

export const config = {
  path: '/api/today',
  method: 'GET',
};
