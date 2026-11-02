// 表示順の確認用：開始日から60日分の「日付・テーマ・テーマ内番号」を一覧表示
//   node scripts/preview-schedule.mjs 2026-11-01
import { buildSchedule } from '../lib/selector.mjs';

const start = process.argv[2] || '2026-11-01';
const THEMES = ['思考ノイズに気づく', '本当の望みを探る', '自分へのジャッジに気づく', '心と体の声を聴く', '小さな一歩を見つける', '自分を知る'];
const messages = THEMES.flatMap((theme, t) =>
  Array.from({ length: 10 }, (_, i) => ({ no: t * 10 + i + 1, theme, themeNo: i + 1, text: '' })));

buildSchedule(messages).forEach((m, i) => {
  const date = new Date(Date.parse(`${start}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10);
  console.log(`${String(i + 1).padStart(2)}日目 ${date}  No.${String(m.no).padStart(2)}  ${m.theme} ${m.themeNo}`);
});
