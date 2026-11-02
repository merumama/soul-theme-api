(function () {
  'use strict';

  var API_URL = '/api/today';
  var TIMEOUT_MS = 15000;
  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];

  var els = {
    date: document.getElementById('date'),
    loading: document.getElementById('loading'),
    message: document.getElementById('message'),
    error: document.getElementById('error'),
    retry: document.getElementById('retry'),
    foot: document.getElementById('foot'),
  };
  var shownDate = null;

  function show(name) {
    els.loading.hidden = name !== 'loading';
    els.message.hidden = name !== 'message';
    els.error.hidden = name !== 'error';
    els.foot.hidden = name === 'error';
  }

  function formatDate(ymd) {
    var p = ymd.split('-').map(Number);
    var w = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
    return p[0] + '年' + p[1] + '月' + p[2] + '日（' + WEEK[w] + '）';
  }

  // 端末の時計から日本時間の日付を求める（日付変更の検知用）
  function jstToday() {
    return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  }

  // 前後の「」は画面側で付けるので、シートに入っていたら外す
  function cleanText(text) {
    return String(text).trim().replace(/^「([\s\S]*)」$/, '$1').trim();
  }

  function lengthClass(text) {
    var len = text.replace(/\s/g, '').length;
    if (len > 90) return 'is-very-long';
    if (len > 48) return 'is-long';
    return '';
  }

  function render(data) {
    var text = cleanText(data.message);
    els.message.className = 'message ' + lengthClass(text);
    els.message.textContent = '「' + text + '」';
    els.date.textContent = formatDate(data.date);
    shownDate = data.date;
    show('message');
  }

  function load() {
    show('loading');
    var controller = 'AbortController' in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, TIMEOUT_MS);

    fetch(API_URL, { cache: 'no-store', signal: controller ? controller.signal : undefined })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || data.ok !== true || typeof data.message !== 'string' || !data.message.trim()) {
          throw new Error('invalid response');
        }
        render(data);
      })
      .catch(function () {
        els.date.textContent = '';
        show('error');
      })
      .then(function () { clearTimeout(timer); });
  }

  els.retry.addEventListener('click', load);

  // 開いたまま日付をまたいだ場合、画面に戻ったときに読み込み直す
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && shownDate && shownDate !== jstToday()) {
      load();
    }
  });

  load();
})();
