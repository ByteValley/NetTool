/**
 * 京东比价 · 去重哨兵 + 秒显占位
 * 作用：
 *  1) 在页面注入哨兵 __JD_PRICE_SENTINEL__，防止多脚本重复注入
 *  2) 先放一个轻量占位，保证页面秒开不空白
 *  3) 监听 DOM 变化，若第三方脚本渲染出多份表格/趋势，仅保留一份
 */
(function () {
  if (typeof $response === 'undefined' || !$response.body) {
    return $done({});
  }
  let body = $response.body;
  if (typeof body !== 'string') return $done({});

  // 若已存在哨兵或容器，直接放行（避免重复注入）
  if (body.includes('__JD_PRICE_SENTINEL__') || body.includes('id="jd-price-box"')) {
    return $done({});
  }

  const injector = `
<script>
(function(){
  if (window.__JD_PRICE_SENTINEL__) return;
  window.__JD_PRICE_SENTINEL__ = true;

  // 轻量占位：不阻塞页面
  try{
    var box = document.createElement('div');
    box.id = 'jd-price-box';
    box.style.cssText = 'margin:12px 12px 0;padding:10px;border:1px solid #eee;border-radius:8px;font-size:14px;background:#fff';
    box.innerHTML = '<div style="opacity:.85">💴 价格趋势 · 正在获取…（不影响页面）</div>';
    document.addEventListener('DOMContentLoaded', function(){
      var mount = document.querySelector('#app') || document.body;
      (mount||document.body).insertBefore(box, mount.firstChild);
    });
  }catch(e){}

  // 去重规则：常见的第三方脚本渲染类名
  var SELECTORS = ['#jd-price-box', '.history_price', '.price_trend', '.price-box'];

  function dedupe(){
    try{
      var nodes = [];
      SELECTORS.forEach(function(sel){
        nodes = nodes.concat(Array.from(document.querySelectorAll(sel)));
      });
      // 去重：保留第一份，移除其余
      if (nodes.length > 1) {
        // 找到第一份作为保留对象
        var keep = nodes[0];
        for (var i = 1; i < nodes.length; i++) {
          var n = nodes[i];
          if (!n || n === keep) continue;
          if (n.parentNode) n.parentNode.removeChild(n);
        }
      }
    }catch(e){}
  }

  // DOM 就绪后做一次；后续监听变化
  document.addEventListener('DOMContentLoaded', function(){
    setTimeout(dedupe, 500);
    var mo = new MutationObserver(function(){ setTimeout(dedupe, 200); });
    try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch(e){}
  });

})();
</script>`;

  if (body.includes('</body>')) {
    body = body.replace('</body>', injector + '\n</body>');
  } else {
    body += injector;
  }
  return $done({ body });
})();
