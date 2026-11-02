// テスト用のダミーデータ（実際の文章はスプレッドシートにあります）
export const THEMES = [
  '思考ノイズに気づく',
  '本当の望みを探る',
  '自分へのジャッジに気づく',
  '心と体の声を聴く',
  '小さな一歩を見つける',
  '自分を知る',
];

export function sampleMessages() {
  const list = [];
  let no = 1;
  for (const theme of THEMES) {
    for (let i = 1; i <= 10; i++) {
      list.push({ no, theme, themeNo: i, text: `${theme}のメッセージ${i}` });
      no++;
    }
  }
  return list;
}
