// メッセージを文節に区切る（BudouX）
// 画面側は文節の切れ目でだけ改行するので、iPhone（Safari）でも
// 「あなたの普 / 通とは」のような単語の途中での改行が起きにくくなる。
import { loadDefaultJapaneseParser } from 'budoux';

const parser = loadDefaultJapaneseParser();
const MERGE_MAX = 8;
const PUNCT_END = /[、。，．！？!?」』）)\s]$/;

/** @returns {string[]} 文節の配列。セル内改行は "\n" の要素になる */
export function splitPhrases(text) {
  const out = [];
  String(text).split('\n').forEach((line, i) => {
    if (i > 0) out.push('\n');
    const parts = parser.parse(line);
    // 2文字以下の短い文節（「その」など）は、つないでも長くなりすぎない場合だけ
    // 次の文節とつなげて、細切れの改行を防ぐ
    for (let k = 0; k < parts.length; k++) {
      let p = parts[k];
      while (p.length <= 2 && !PUNCT_END.test(p) && k + 1 < parts.length && p.length + parts[k + 1].length <= MERGE_MAX) {
        p += parts[++k];
      }
      out.push(p);
    }
  });
  return out.filter((p) => p !== '');
}
