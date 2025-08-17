// json-mutate.js — Stash/Surge 兼容的响应改写脚本
// 用法：在覆写的 script 规则里通过 argument 传 mode 和参数
//   mode=tab_filter&blockers=AI帮唱,长相思2,K歌,小说,游戏
//   mode=stripadvert_prune

function safeParse(body) {
  try { return JSON.parse(body); } catch (e) { return null; }
}

function walk(node, visitor) {
  const seen = new WeakSet();
  function _w(n) {
    if (n && typeof n === 'object') {
      if (seen.has(n)) return n;
      seen.add(n);
      if (Array.isArray(n)) {
        for (let i = 0; i < n.length; i++) n[i] = _w(n[i]);
      } else {
        for (const k of Object.keys(n)) n[k] = _w(n[k]);
      }
      return visitor(n);
    }
    return n;
  }
  return _w(node);
}

function modeTabFilter(obj, blockers) {
  const set = new Set(blockers);
  return walk(obj, (n) => {
    if (Array.isArray(n)) {
      // 仅过滤数组项里 name 命中黑名单的对象，保留其它结构
      return n.filter(it => !(it && typeof it === 'object' && set.has(String(it.name || ''))));
    }
    return n;
  });
}

function modeStripAdvertPrune(obj) {
  return walk(obj, (n) => {
    if (n && !Array.isArray(n) && typeof n === 'object') {
      if (String(n.type || '') === 'stripAdvert') {
        // 只删除子节点，不动外层结构
        if ('child' in n) delete n.child;
      }
    }
    return n;
  });
}

(function () {
  const isStash = typeof $environment !== 'undefined' && $environment?.stash;
  const req = typeof $request !== 'undefined' ? $request : {};
  const resp = typeof $response !== 'undefined' ? $response : {};
  let body = resp && resp.body ? resp.body : '';

  const arg = (typeof $argument === 'string' ? $argument : '') || ''; // Stash/Surge 传参
  const params = {};
  for (const kv of arg.split('&')) {
    if (!kv) continue;
    const i = kv.indexOf('=');
    if (i === -1) { params[decodeURIComponent(kv)] = ''; continue; }
    const k = decodeURIComponent(kv.slice(0, i));
    const v = decodeURIComponent(kv.slice(i + 1));
    params[k] = v;
  }

  const mode = params.mode || '';
  const json = safeParse(body);
  if (!json) { $done({ body }); return; }

  let out = json;
  if (mode === 'tab_filter') {
    const blockers = (params.blockers || '').split(',').map(s => s.trim()).filter(Boolean);
    out = modeTabFilter(json, blockers);
  } else if (mode === 'stripadvert_prune') {
    out = modeStripAdvertPrune(json);
  } else {
    // 未指定模式，直接返回
  }

  $done({ body: JSON.stringify(out) });
})();
