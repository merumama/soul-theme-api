/**
 * 今日のココロのヒント — スプレッドシート読み出し用 GAS
 *
 * このスクリプトは「メッセージ一覧」シートがあるスプレッドシートの
 * 拡張機能 → Apps Script に貼り付けて使います（スプレッドシートに紐づくスクリプト）。
 *
 * ・合言葉（API_TOKEN）が一致したリクエストにだけデータを返します
 * ・API_TOKEN は「プロジェクトの設定 → スクリプト プロパティ」に登録します
 * ・同じ値を Netlify の環境変数 GAS_TOKEN に登録します
 */

var SHEET_NAME = 'メッセージ一覧';

function doGet(e) {
  var expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  var given = e && e.parameter ? e.parameter.token : '';
  if (!expected || given !== expected) {
    return toJson_({ ok: false, error: 'unauthorized' });
  }

  try {
    return toJson_({ ok: true, messages: readMessages_() });
  } catch (err) {
    console.error(err);
    return toJson_({ ok: false, error: 'read_failed' });
  }
}

function readMessages_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('シート「' + SHEET_NAME + '」が見つかりません');

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // 1行目は見出し。A:通し番号 / B:テーマ / C:テーマ内番号 / D:メッセージ
  var rows = sheet.getRange(2, 1, lastRow - 1, 4).getDisplayValues();
  var messages = [];
  for (var i = 0; i < rows.length; i++) {
    var no = Number(rows[i][0]);
    var theme = String(rows[i][1]).trim();
    var themeNo = Number(rows[i][2]);
    var text = String(rows[i][3]).trim();
    if (!no || !theme || !text) continue; // 空行はスキップ
    messages.push({ no: no, theme: theme, themeNo: themeNo, text: text });
  }
  return messages;
}

function toJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 動作確認用：Apps Script エディタでこの関数を実行すると件数とテーマ別件数がログに出ます */
function checkMessages() {
  var messages = readMessages_();
  var counts = {};
  messages.forEach(function (m) { counts[m.theme] = (counts[m.theme] || 0) + 1; });
  console.log('件数: ' + messages.length);
  console.log(JSON.stringify(counts, null, 2));
}

/** 初回設定用：ランダムな合言葉を作って API_TOKEN に保存し、ログに表示します */
function setupToken() {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('API_TOKEN', token);
  console.log('API_TOKEN を設定しました。Netlify の GAS_TOKEN に次の値を登録してください:\n' + token);
}
