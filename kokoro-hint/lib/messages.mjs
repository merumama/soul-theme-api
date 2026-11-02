// GAS から受け取ったデータを検証・整形する

/**
 * @param {unknown} payload GAS の doGet が返した JSON
 * @returns {Array<{no:number, theme:string, themeNo:number, text:string}>}
 */
export function normalizeMessages(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('GASの応答がJSONオブジェクトではありません');
  }
  if (payload.ok !== true) {
    throw new Error(`GASがエラーを返しました: ${payload.error || 'unknown'}`);
  }
  if (!Array.isArray(payload.messages)) {
    throw new Error('GASの応答に messages 配列がありません');
  }

  const messages = [];
  for (const row of payload.messages) {
    if (!row || typeof row !== 'object') continue;
    const no = Number(row.no);
    const themeNo = Number(row.themeNo);
    const theme = String(row.theme ?? '').trim();
    const text = String(row.text ?? '').replace(/\r\n?/g, '\n').trim();
    // 空行・未記入の行は無視する
    if (!Number.isFinite(no) || !theme || !text) continue;
    messages.push({ no, theme, themeNo: Number.isFinite(themeNo) ? themeNo : no, text });
  }
  if (messages.length === 0) {
    throw new Error('有効なメッセージが1件もありません');
  }
  return messages;
}
