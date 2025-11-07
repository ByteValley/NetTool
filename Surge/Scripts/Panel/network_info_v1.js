/* =========================================================
 * 网络信息 + 服务检测（兼容版：Egern / 旧版引擎）
 * by ByteValley (compat by ChatGPT)
 * 说明：
 * - 保留原有功能与参数；移除易不兼容语法（?. / ?? / \u{} / 正则u标志）
 * - Surge 专属的 $httpAPI 段落做了存在性判断；无则降级为 “-”
 * - 在 Egern 下可渲染直连/落地/服务检测；策略/入口需 Egern 提供等价 API 才能还原
 * =======================================================*/

/* ===================== 参数解析 ===================== */
function parseArgs() {
  try {
    if (typeof $argument === 'string' && $argument) {
      var obj = {};
      var arr = $argument.split('&');
      for (var i=0;i<arr.length;i++){
        var s = arr[i];
        var p = s.indexOf('=');
        var k = decodeURIComponent(p>=0 ? s.slice(0,p) : s);
        var v = decodeURIComponent(p>=0 ? s.slice(p+1) : '');
        obj[k] = v;
      }
      return obj;
    }
  } catch (_) {}
  return {};
}
var ARG = parseArgs();
function GET(k, d){ return Object.prototype.hasOwnProperty.call(ARG,k) ? ARG[k] : d; }

/* —— 图标 —— */
var ICON_NAME  = GET('icon', 'globe.asia.australia');
var ICON_COLOR = GET('icon-color', '#1E90FF');

/* —— 行为参数 —— */
var IPv6_ON   = GET('IPv6','0') === '1';
var MASK_IP   = GET('MASK_IP','1') === '1';
// 直连“位置”脱敏：未显式传入 MASK_POS 时，默认跟随 MASK_IP
var MASK_POS  = Object.prototype.hasOwnProperty.call(ARG,'MASK_POS')
  ? (GET('MASK_POS','1') === '1')
  : (GET('MASK_IP','1') === '1');

// 台湾旗：0=🇨🇳(默认) / 1=🇹🇼 / 2=🇼🇸
var TW_FLAG_MODE  = (function(){
  var v = GET('TW_FLAG_MODE','0');
  return (v==='0'||v==='1'||v==='2') ? v : '0';
})();

var DOMESTIC_IPv4 = GET('DOMESTIC_IPv4','ipip');     // ipip|cip|163|bilibili|126|pingan
var DOMESTIC_IPv6 = GET('DOMESTIC_IPv6','ddnspod');  // ddnspod|neu6
var LANDING_IPv4  = GET('LANDING_IPv4','ipapi');     // ipapi|ipwhois|ipsb
var LANDING_IPv6  = GET('LANDING_IPv6','ipsb');      // ipsb|ident|ipify

/* —— 服务检测参数 —— */
var SD_STYLE      = (String(GET('SD_STYLE','icon')).toLowerCase()==='text') ? 'text' : 'icon';
var SD_SHOW_LAT   = /^true$/i.test(GET('SD_SHOW_LAT','true'));
var SD_SHOW_HTTP  = /^true$/i.test(GET('SD_SHOW_HTTP','true'));
var _langRaw      = GET('SD_LANG','zh-Hans');
var SD_LANG       = /^zh-hant$/i.test(_langRaw) ? 'zh-Hant' : 'zh-Hans';
var SD_TIMEOUT_MS = (function(){
  var ms = GET('SD_TIMEOUT_MS','');
  if (ms && /^\d+$/.test(ms)) return parseInt(ms,10);
  var sec = parseInt(GET('Timeout','8'),10);
  return isFinite(sec) ? Math.max(2000, sec*1000) : 5000;
})();

// —— 新增：图标主题 & 地区显示样式 & 箭头共用开关 —— //
function pickTheme(){
  var v = String(GET('SD_ICON_THEME','check')||'').toLowerCase();
  return (v==='lock'||v==='circle'||v==='check') ? v : 'check';
}
var SD_ICON_THEME = pickTheme();

function pickRegionMode(){
  var v = String(GET('SD_REGION_MODE','full')||'').toLowerCase();
  return (v==='full'||v==='abbr'||v==='flag') ? v : 'full';
}
var SD_REGION_MODE = pickRegionMode();
var SD_ARROW = /^true$/i.test(GET('SD_ARROW','true')); // 共用：icon/text 是否使用“➟”

/* ===================== 主流程 ===================== */
;(function(){
  main().then(function(){}, function(err){
    try{ $notification.post('网络信息 𝕏','脚本错误', String(err)); }catch(_){}
    $done({ title: '网络信息 𝕏', content: String(err), icon: ICON_NAME, 'icon-color': ICON_COLOR });
  });
})();

async function main(){
  // —— 轻触发一次落地以写日志（不阻塞，短超时）
  var preTouch = touchLandingOnceQuick()["catch"](function(){});

  // —— 直连
  var cnPromise  = getDirectV4(DOMESTIC_IPv4)["catch"](function(){ return {}; });
  var cn6Promise = IPv6_ON ? getDirectV6(DOMESTIC_IPv6)["catch"](function(){ return {}; }) : Promise.resolve({});

  var cn  = await cnPromise;
  var cn6 = await cn6Promise;

  // —— 最近请求：策略名 & 入口 IP（带重试/兜底；仅 Surge 可用）
  await preTouch;
  var policyName = '';
  var entranceIP = '';
  if (typeof $httpAPI === 'function') {
    var pe = await getPolicyAndEntranceRetry(4, 220)["catch"](function(){ return {}; });
    policyName = pe && pe.policyName ? pe.policyName : '';
    entranceIP = pe && pe.entranceIP ? pe.entranceIP : '';
  }

  // —— 入口：国内/国际双源（仅当拿到 IP）
  var ent = {};
  if (isIP(entranceIP||'')) {
    ent = await getEntranceBundle(entranceIP)["catch"](function(){ return { ip: entranceIP }; });
  }

  // —— 落地
  var pxPromise  = getLandingV4(LANDING_IPv4)["catch"](function(){ return {}; });
  var px6Promise = IPv6_ON ? getLandingV6(LANDING_IPv6)["catch"](function(){ return {}; }) : Promise.resolve({});
  var px  = await pxPromise;
  var px6 = await px6Promise;

  /* ===== 组装上半部分（标题=网络类型；第一行=代理策略） ===== */
  var nt = netTypeLine();
  var title = nt || '网络信息 𝕏';

  var parts = [];

  // 第一行：代理策略（若无 $httpAPI 则为 '-'）
  parts.push('代理策略: ' + (policyName || '-'));

  parts.push(lineIP('IP', cn.ip, cn6.ip));

  // 直连位置：脱敏仅旗帜 or 完整
  var directLoc = cn.loc ? (MASK_POS ? onlyFlag(cn.loc) : flagFirst(cn.loc)) : '-';
  parts.push('位置: ' + directLoc);
  if (cn.isp) parts.push('运营商: ' + fmtISP(cn.isp, cn.loc));

  // 入口（若拿不到入口 IP，则跳过整块）
  var entranceLines = [];
  if (ent && (ent.ip || ent.loc1 || ent.loc2)) {
    entranceLines.push(lineIP('入口', ent.ip, ''));
    if (ent.loc1) entranceLines.push('位置¹: ' + flagFirst(ent.loc1));
    if (ent.isp1) entranceLines.push('运营商¹: ' + fmtISP(ent.isp1, ent.loc1));
    if (ent.loc2) entranceLines.push('位置²: ' + flagFirst(ent.loc2));
    if (ent.isp2) entranceLines.push('运营商²: ' + String(ent.isp2).trim());
  }
  if (entranceLines.length) { parts.push(''); for (var i=0;i<entranceLines.length;i++) parts.push(entranceLines[i]); }

  // 落地
  var landingLines = [];
  landingLines.push(lineIP('落地 IP', px.ip, px6.ip));
  if (px.loc) landingLines.push('位置: ' + flagFirst(px.loc));
  if (px.isp) landingLines.push('运营商: ' + fmtISP(px.isp, px.loc));
  if (landingLines.length){ parts.push(''); for (var j=0;j<landingLines.length;j++) parts.push(landingLines[j]); }

  parts.push('执行时间: ' + now());

  /* ===== 服务检测（并发） ===== */
  var sdLines = await runServiceChecks();
  if (sdLines.length) {
    parts.push('');
    for (var k=0;k<sdLines.length;k++) parts.push(sdLines[k]);
  }

  var content = parts.join('\n');
  $done({ title: title, content: content, icon: ICON_NAME, 'icon-color': ICON_COLOR });
}

/* ===================== 工具 & 渲染 ===================== */
function now(){
  try { return new Date().toTimeString().split(' ')[0]; } catch(_){ return ''; }
}
function isIPv4(ip){
  return /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)(\.(?!$)|$)){4}$/.test(String(ip||''));
}
function isIPv6(ip){
  return /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,6}:[0-9a-fA-F]{1,4}){1}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/.test(String(ip||''));
}
function isIP(ip){ return isIPv4(ip) || isIPv6(ip); }

function maskIP(ip){
  if (!ip || !MASK_IP) return ip || '';
  if (isIPv4(ip)) {
    var p = String(ip).split('.');
    return [p[0], p[1], '*', '*'].join('.');
  } else if (isIPv6(ip)) {
    var p6 = String(ip).split(':');
    return [].concat(p6.slice(0,4), ['*','*','*','*']).join(':');
  }
  return ip;
}

// —— 旗帜解析（避免 \u{} 与 /u 正则）——
function rawFlagAndText(s){
  s = String(s||'');
  if (!s) return {flag:'', text:''};
  // 若前两个 code point 是区域指示符（U+1F1E6 ~ U+1F1FF），当作旗帜
  var cp0 = s.codePointAt(0), len0 = cp0>0xFFFF ? 2 : 1;
  var cp1 = s.codePointAt(len0), len1 = cp1>0xFFFF ? 2 : 1;
  var isFlag = (cp0>=0x1F1E6 && cp0<=0x1F1FF && cp1>=0x1F1E6 && cp1<=0x1F1FF);
  var flag = isFlag ? s.slice(0, len0+len1) : '';
  var text = isFlag ? s.slice(len0+len1) : s;
  // 统一处理台湾旗显示方案：0=🇨🇳, 1=🇹🇼, 2=🇼🇸（仅当原始是 🇹🇼 时替换）
  if (flag.indexOf('🇹🇼')>=0) {
    if (TW_FLAG_MODE==='0') flag='🇨🇳';
    else if (TW_FLAG_MODE==='2') flag='🇼🇸';
  }
  return {flag:flag, text:text};
}
function onlyFlag(loc){ var rt=rawFlagAndText(loc); return rt.flag || '-'; }
function flagFirst(loc){ var rt=rawFlagAndText(loc); return (rt.flag||'') + (rt.text||''); }

function lineIP(label, ip4, ip6){
  var a = label + ': ' + (maskIP(ip4) || '-');
  var b = ip6 ? ('\n' + maskIP(ip6)) : '';
  return a + b;
}

function flagOf(code){
  var cc = String(code||'').trim();
  if (!cc) return '';
  if (/^中国$|^CN$/i.test(cc)) cc = 'CN';
  if (cc.length !== 2 || !/^[A-Za-z]{2}$/.test(cc)) return '';
  try {
    var A = cc.toUpperCase().charCodeAt(0);
    var B = cc.toUpperCase().charCodeAt(1);
    var cps = [0x1F1E6 + (A-65), 0x1F1E6 + (B-65)];
    var raw = String.fromCodePoint(cps[0]) + String.fromCodePoint(cps[1]);
    if (cc.toUpperCase()==='TW') {
      if (TW_FLAG_MODE==='0') return '🇨🇳';
      if (TW_FLAG_MODE==='2') return '🇼🇸';
    }
    return raw;
  } catch(_){ return ''; }
}

/* —— 规范中国境内运营商名称 —— */
function fmtISP(isp, locStr){
  var raw = String(isp || '').trim();
  if (!raw) return '';

  // 仅大陆（非港澳台）才做归一化
  var txt = String(locStr || '');
  var isMainland = (/^🇨🇳/.test(txt)) || (/(^|\s)中国(?!香港|澳门|台湾)/.test(txt));
  if (!isMainland) return raw;

  var norm = raw.replace(/\s*\(中国\)\s*/,'').replace(/\s+/g,' ').trim();
  var s = norm.toLowerCase();

  if (/(^|[\s-])(cmcc|cmnet|cmi)\b/.test(s) || /china\s*mobile/.test(s) || /移动/.test(norm))
    return '中国移动';
  if (/(^|[\s-])(chinanet|china\s*telecom|ctcc|ct)\b/.test(s) || /电信/.test(norm))
    return '中国电信';
  if (/(^|[\s-])(china\s*unicom|cncgroup|netcom)\b/.test(s) || /联通/.test(norm))
    return '中国联通';
  if (/(^|[\s-])(cbn|china\s*broadcast)/.test(s) || /广电/.test(norm))
    return '中国广电';
  if (/(cernet|china\s*education)/.test(s) || /教育网/.test(norm))
    return '中国教育网';

  if (/^中国(移动|联通|电信|广电)$/.test(norm)) return norm;
  return raw;
}

/* —— 网络类型行（Wi-Fi / 蜂窝数据） —— */
function radioToGen(r){
  var MAP = {
    GPRS:'2.5G', EDGE:'2.75G', CDMA1x:'2.5G', WCDMA:'3G', HSDPA:'3.5G', HSUPA:'3.75G',
    CDMAEVDORev0:'3.5G', CDMAEVDORevA:'3.5G', CDMAEVDORevB:'3.75G',
    eHRPD:'3.9G', LTE:'4G', NRNSA:'5G', NR:'5G'
  };
  return MAP[r] || '';
}
function netTypeLine(){
  try{
    var ssid  = ($network && $network.wifi && $network.wifi.ssid) ? $network.wifi.ssid : '';
    var radio = ($network && $network['cellular-data'] && $network['cellular-data'].radio) ? $network['cellular-data'].radio : '';
    if (ssid) return 'Wi-Fi | ' + ssid;
    if (radio){
      var g = radioToGen(radio);
      return '蜂窝数据 | ' + (g ? (g + ' - ' + radio) : radio);
    }
  }catch(_){}
  return '网络 | 未知';
}

/* ===================== HTTP 基础 ===================== */
function httpGet(url, headers, timeoutMs, followRedirect){
  headers = headers || {};
  return new Promise(function(resolve,reject){
    var req = { url:url, headers:headers };
    if (timeoutMs != null) req.timeout = timeoutMs;
    if (followRedirect) req.followRedirect = true;
    $httpClient.get(req,function(err,resp,body){
      if (err) return reject(err);
      resolve({ status: (resp && (resp.status||resp.statusCode)) || 0, headers: (resp && resp.headers)||{}, body: body });
    });
  });
}
function httpAPI(path){
  return new Promise(function(res){ 
    try{ $httpAPI('GET', path, null, res); }catch(_){ res(null); }
  });
}

/* ===================== 数据源：直连/落地/入口 ===================== */
// —— 直连 v4
async function getDirectV4(p){
  try{
    if (p==='cip')      return await d_cip();
    if (p==='163')      return await d_163();
    if (p==='bilibili') return await d_bili();
    if (p==='126')      return await d_126();
    if (p==='pingan')   return await d_pingan();
    return await d_ipip();
  }catch(_){ try{return await d_ipip();}catch(e){} return {}; }
}
async function d_ipip(){ var r=await httpGet('https://myip.ipip.net/json'); var j=JSON.parse(r.body||'{}'); var c0=j&&j.data&&j.data.location && j.data.location[0]; var flag=flagOf(c0==='中国'?'CN':c0); return { ip:(j&&j.data&&j.data.ip)||'', loc:[flag, c0, j&&j.data&&j.data.location && j.data.location[1], j&&j.data&&j.data.location && j.data.location[2]].filter(Boolean).join(' ').replace(/\s*中国\s*/,'') , isp:(j&&j.data&&j.data.location && j.data.location[4])||'' }; }
async function d_cip(){ var r=await httpGet('http://cip.cc/'); var b=String(r.body||''); var ip=(b.match(/IP.*?:\s*(\S+)/)||[])[1]||''; var addr=(b.match(/地址.*?:\s*(.+)/)||[])[1]||''; var isp=(b.match(/运营商.*?:\s*(.+)/)||[])[1]||''; var isCN=/中国/.test(addr); return { ip:ip, loc:[flagOf(isCN?'CN':''), addr.replace(/中国\s*/,'')].filter(Boolean).join(' '), isp: (isp||'').replace(/中国\s*/,'') }; }
async function d_163(){ var r=await httpGet('https://dashi.163.com/fgw/mailsrv-ipdetail/detail'); var d=(JSON.parse(r.body||'{}')||{}).result||{}; return { ip:d.ip||'', loc:[flagOf(d.countryCode), d.country,d.province,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||d.org||'' }; }
async function d_bili(){ var r=await httpGet('https://api.bilibili.com/x/web-interface/zone'); var d=(JSON.parse(r.body||'{}')||{}).data||{}; var flag=flagOf(d.country==='中国'?'CN':d.country); return { ip:d.addr||'', loc:[flag,d.country,d.province,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||'' }; }
async function d_126(){ var r=await httpGet('https://ipservice.ws.126.net/locate/api/getLocByIp'); var d=(JSON.parse(r.body||'{}')||{}).result||{}; return { ip:d.ip||'', loc:[flagOf(d.countrySymbol), d.country,d.province,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.operator||'' }; }
async function d_pingan(){ var r=await httpGet('https://rmb.pingan.com.cn/itam/mas/linden/ip/request'); var d=(JSON.parse(r.body||'{}')||{}).data||{}; return { ip:d.ip||'', loc:[flagOf(d.countryIsoCode), d.country,d.region,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||'' }; }

// —— 直连 v6
async function getDirectV6(p){
  try{
    if (p==='neu6'){ var r=await httpGet('https://speed.neu6.edu.cn/getIP.php'); return { ip:String(r.body||'').trim() }; }
    var r6=await httpGet('https://ipv6.ddnspod.com'); return { ip:String(r6.body||'').trim() };
  }catch(_){ return {}; }
}

// —— 落地 v4
async function getLandingV4(p){
  try{
    if (p==='ipwhois') return await l_whois();
    if (p==='ipsb')    return await l_ipsb();
    return await l_ipapi();
  }catch(_){ try{return await l_ipapi();}catch(e){} return {}; }
}
async function l_ipapi(){ var r=await httpGet('http://ip-api.com/json?lang=zh-CN'); var j=JSON.parse(r.body||'{}'); return { ip:j.query||'', loc:[flagOf(j.countryCode), (j.country||'').replace(/\s*中国\s*/,''), (j.regionName||'').split(/\s+or\s+/)[0], j.city].filter(Boolean).join(' '), isp:j.isp||j.org||j.as||'' }; }
async function l_whois(){ var r=await httpGet('https://ipwhois.app/widget.php?lang=zh-CN'); var j=JSON.parse(r.body||'{}'); return { ip:j.ip||'',    loc:[flagOf(j.country_code), (j.country||'').replace(/\s*中国\s*/,''), j.region, j.city].filter(Boolean).join(' '), isp:j && j.connection ? (j.connection.isp||'') : '' }; }
async function l_ipsb(){  var r=await httpGet('https://api-ipv4.ip.sb/geoip');            var j=JSON.parse(r.body||'{}'); return { ip:j.ip||'',     loc:[flagOf(j.country_code), j.country, j.region, j.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:j.isp||j.organization||'' }; }

// —— 落地 v6
async function getLandingV6(p){
  try{
    if (p==='ident'){ var r=await httpGet('https://v6.ident.me'); return { ip:String(r.body||'').trim() }; }
    if (p==='ipify'){ var r2=await httpGet('https://api6.ipify.org'); return { ip:String(r2.body||'').trim() }; }
    var r3=await httpGet('https://api-ipv6.ip.sb/ip'); return { ip:String(r3.body||'').trim() };
  }catch(_){ return {}; }
}

/* ===================== 入口/策略（仅 Surge 可用） ===================== */
var ENT_SOURCES_RE = /(ip-api\.com|ipwhois\.app|ip\.sb|ipinfo\.io|ident\.me|ipify\.org)/i;
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

function extractIP(str){
  var s = String(str||'').replace(/\(Proxy\)/i,'').trim();
  var m = s.match(/\[([0-9a-fA-F:]+)\]/);
  if (m && isIPv6(m[1])) return m[1];
  m = s.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
  if (m && isIPv4(m[1])) return m[1];
  m = s.match(/([0-9a-fA-F:]{2,})/);
  if (m && isIPv6(m[1])) return m[1];
  return '';
}

async function touchLandingOnceQuick(){
  try { await httpGet('http://ip-api.com/json?lang=zh-CN', {}, 700, true); } catch(_) {}
}

async function getPolicyAndEntranceOnce(){
  var data = await httpAPI('/v1/requests/recent');
  var reqs = (data && data.requests && Array.isArray(data.requests)) ? data.requests : [];
  var hit  = reqs.slice(0,120).find(function(i){ return ENT_SOURCES_RE.test(i && i.URL ? i.URL : ''); });
  if (!hit) return {};
  var ip = extractIP(hit.remoteAddress || '');
  return { policyName: hit.policyName || '', entranceIP: ip || '' };
}
async function getAnyProxyPolicyFromRecent(){
  var data = await httpAPI('/v1/requests/recent');
  var reqs = (data && data.requests && Array.isArray(data.requests)) ? data.requests : [];
  var hit  = reqs.find(function(i){ return /\(Proxy\)/.test(i && i.remoteAddress ? i.remoteAddress : '') && i.policyName; });
  if (!hit) return {};
  return { policyName: hit.policyName, entranceIP: extractIP(hit.remoteAddress) };
}
async function getPolicyAndEntranceRetry(times, baseDelay){
  if (typeof $httpAPI !== 'function') return {};
  times = times || 4; baseDelay = baseDelay || 200;
  for (var i=0;i<times;i++){
    var r = await getPolicyAndEntranceOnce()["catch"](function(){ return {}; });
    if ((r && r.entranceIP && isIP(r.entranceIP)) || (r && r.policyName)) return r;
    if (i === Math.floor(times/2)) await touchLandingOnceQuick();
    if (i < times - 1) await sleep(baseDelay * Math.pow(1.6, i));
  }
  var any = await getAnyProxyPolicyFromRecent()["catch"](function(){ return {}; });
  return any || {};
}

/* —— 入口位置（国内/国际） —— */
async function getEntranceBundle(ip){
  var a = await loc_pingan(ip)["catch"](function(){ return {}; });
  var b = await loc_ipapi(ip)["catch"](function(){ return {}; });
  return { ip: ip, loc1: a.loc || '', isp1: a.isp || '', loc2: b.loc || '', isp2: b.isp || '' };
}
async function loc_pingan(ip){ var r=await httpGet('https://rmb.pingan.com.cn/itam/mas/linden/ip/request?ip='+encodeURIComponent(ip)); var d=(JSON.parse(r.body||'{}')||{}).data||{}; return { loc:[flagOf(d.countryIsoCode), d.country,d.region,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||'' }; }
async function loc_ipapi(ip){ var r=await httpGet('http://ip-api.com/json/'+encodeURIComponent(ip)+'?lang=zh-CN'); var j=JSON.parse(r.body||'{}'); return { loc:[flagOf(j.countryCode), (j.country||'').replace(/\s*中国\s*/,''), (j.regionName||'').split(/\s+or\s+/)[0], j.city].filter(Boolean).join(' '), isp:j.isp||j.org||j.as||'' }; }

/* ===================== 服务检测（并发） ===================== */
function sd_now(){ return Date.now(); }
var SD_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var SD_BASE_HEADERS = { "User-Agent": SD_UA, "Accept-Language": "en" };

function sd_httpGet(url, headers, followRedirect) {
  headers = headers || {};
  return new Promise(function(resolve){
    var start = sd_now();
    $httpClient.get(
      { url:url, headers: mergeObj(SD_BASE_HEADERS, headers), timeout: SD_TIMEOUT_MS, followRedirect: !!followRedirect },
      function(err, resp, data) {
        var cost = sd_now() - start;
        if (err || !resp) return resolve({ ok:false, status:0, cost:cost, headers:{}, data:"" });
        resolve({ ok:true, status: (resp.status||resp.statusCode||0), cost:cost, headers: (resp.headers||{}), data: (data||"") });
      }
    );
  });
}
function sd_httpPost(url, headers, body) {
  headers = headers || {};
  body = body || "";
  return new Promise(function(resolve){
    var start = sd_now();
    $httpClient.post(
      { url:url, headers: mergeObj(SD_BASE_HEADERS, headers), timeout: SD_TIMEOUT_MS, body: body },
      function(err, resp, data) {
        var cost = sd_now() - start;
        if (err || !resp) return resolve({ ok:false, status:0, cost:cost, headers:{}, data:"" });
        resolve({ ok:true, status: (resp.status||resp.statusCode||0), cost:cost, headers: (resp.headers||{}), data: (data||"") });
      }
    );
  });
}
function mergeObj(a,b){
  var o={}, k;
  for(k in a){ if(Object.prototype.hasOwnProperty.call(a,k)) o[k]=a[k]; }
  for(k in (b||{})){ if(Object.prototype.hasOwnProperty.call(b,k)) o[k]=b[k]; }
  return o;
}

// —— 台湾旗模式（服务检测用）
function sd_flagFromCC(cc){
  cc = String(cc||'').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  if (cc==='TW') {
    if (TW_FLAG_MODE==='0') return '🇨🇳';
    if (TW_FLAG_MODE==='2') return '🇼🇸';
  }
  try {
    var A = cc.charCodeAt(0), B = cc.charCodeAt(1);
    return String.fromCodePoint(0x1F1E6+(A-65)) + String.fromCodePoint(0x1F1E6+(B-65));
  } catch(_){ return ''; }
}

var SD_CC_NAME = (function(){
  var hans = { CN:"中国", TW:"台湾", HK:"中国香港", MO:"中国澳门", JP:"日本", KR:"韩国", US:"美国",
    SG:"新加坡", MY:"马来西亚", TH:"泰国", VN:"越南", PH:"菲律宾", ID:"印度尼西亚",
    IN:"印度", AU:"澳大利亚", NZ:"新西兰", CA:"加拿大", GB:"英国", DE:"德国", FR:"法国",
    NL:"荷兰", ES:"西班牙", IT:"意大利", BR:"巴西", AR:"阿根廷", MX:"墨西哥", RU:"俄罗斯" };
  var hant = { CN:"中國", TW:"台灣", HK:"中國香港", MO:"中國澳門", JP:"日本", KR:"南韓", US:"美國",
    SG:"新加坡", MY:"馬來西亞", TH:"泰國", VN:"越南", PH:"菲律賓", ID:"印尼",
    IN:"印度", AU:"澳洲", NZ:"紐西蘭", CA:"加拿大", GB:"英國", DE:"德國", FR:"法國",
    NL:"荷蘭", ES:"西班牙", IT:"義大利", BR:"巴西", AR:"阿根廷", MX:"墨西哥", RU:"俄羅斯" };
  return SD_LANG==='zh-Hant' ? hant : hans;
})();

function sd_ccPretty(cc){
  cc = String(cc||'').toUpperCase();
  if (!cc) return '—';
  var flag = sd_flagFromCC(cc);
  var name = SD_CC_NAME[cc];
  if (SD_REGION_MODE==='flag') return flag || '—';
  if (SD_REGION_MODE==='abbr') return (flag||'') + cc;
  if (flag && name) return flag + ' ' + cc + ' | ' + name;
  if (flag) return flag + ' ' + cc;
  return cc;
}

// —— 三态图标主题 —— //
function sd_pickIcons(theme){
  if (theme==='lock')   return { full:'🔓', partial:'🔐', blocked:'🔒' };
  if (theme==='circle') return { full:'⭕️', partial:'⛔️', blocked:'🚫' };
  return { full:'✅', partial:'❇️', blocked:'❎' };
}
var SD_ICONS = sd_pickIcons(SD_ICON_THEME);
function sd_isPartial(tag){ return /自制|自製|original/i.test(String(tag||'')) || /部分/.test(String(tag||'')); }

/* —— 统一渲染 —— */
function sd_renderLine(opt) {
  var name  = opt.name;
  var ok    = !!opt.ok;
  var cc    = opt.cc || '';
  var cost  = (opt.cost!=null ? opt.cost : null);
  var status= opt.status || 0;
  var tag   = opt.tag || '';
  var state = opt.state || (ok ? (sd_isPartial(tag) ? 'partial' : 'full') : 'blocked');

  var icon = SD_ICONS[state];
  var regionChunk = cc ? sd_ccPretty(cc) : '';
  var regionText  = regionChunk || '-';

  var stateText;
  if (SD_LANG==='zh-Hant'){
    stateText = (state==='full') ? '已解鎖' : (state==='partial' ? '部分解鎖' : '不可達');
  } else {
    stateText = (state==='full') ? '已解锁' : (state==='partial' ? '部分解锁' : '不可达');
  }

  if (SD_STYLE === 'text') {
    var left  = name + ': ' + stateText;
    var head  = SD_ARROW ? (left + ' ➟ ' + regionText) : (left + ' ｜ ' + regionText);
    var tail = [];
    if (tag) tail.push('标注：' + tag);
    if (SD_SHOW_LAT && cost!=null) tail.push(cost + 'ms');
    if (SD_SHOW_HTTP && status>0) tail.push('HTTP ' + status);
    return tail.length ? (head + ' ｜ ' + tail.join(' ｜ ')) : head;
  }

  var head2 = SD_ARROW ? (icon + ' ' + name + ' ➟ ' + regionText) : (icon + ' ' + name + ' ｜ ' + regionText);
  var tail2 = [];
  if (tag) tail2.push(tag);
  if (SD_SHOW_LAT && cost!=null) tail2.push(cost + 'ms');
  if (SD_SHOW_HTTP && status>0) tail2.push('HTTP ' + status);
  return tail2.length ? (head2 + ' ｜ ' + tail2.join(' ｜ ')) : head2;
}

async function sd_queryLandingCC() {
  var r = await sd_httpGet('http://ip-api.com/json', {}, true);
  if (r.ok && r.status === 200) {
    try { var j = JSON.parse(r.data || '{}'); return String(j.countryCode||'').toUpperCase(); }
    catch(_){ return ''; }
  }
  return '';
}
async function sd_queryLandingCCMulti(){
  var cc = await sd_queryLandingCC();
  if (cc) return cc;

  var r = await sd_httpGet('https://api.ip.sb/geoip', {}, true);
  if (r.ok && r.status===200) { try{ var j=JSON.parse(r.data||'{}'); if(j.country_code) return String(j.country_code).toUpperCase(); }catch(_){} }

  r = await sd_httpGet('https://ipinfo.io/json', {}, true);
  if (r.ok && r.status===200)  { try{ var j2=JSON.parse(r.data||'{}'); if(j2.country) return String(j2.country).toUpperCase(); }catch(_){} }

  r = await sd_httpGet('https://ifconfig.co/json', {"Accept-Language":"en"}, true);
  if (r.ok && r.status===200)  { try{ var j3=JSON.parse(r.data||'{}'); if(j3.country_iso) return String(j3.country_iso).toUpperCase(); }catch(_){} }

  return '';
}

/* —— 各服务 —— */
var SD_I18N = (function(){
  var H = {
    youTube:"YouTube", chatgpt:"ChatGPT", chatgpt_app:"ChatGPT App(API)",
    netflix:"Netflix", disney:"Disney+", huluUS:"Hulu(美)", huluJP:"Hulu(日)", hbo:"Max(HBO)",
    unreachable:"不可达", timeout:"超时", fail:"检测失败", regionBlocked:"区域受限", originals:"自制", full:"完整"
  };
  var T = {
    youTube:"YouTube", chatgpt:"ChatGPT", chatgpt_app:"ChatGPT App(API)",
    netflix:"Netflix", disney:"Disney+", huluUS:"Hulu(美)", huluJP:"Hulu(日)", hbo:"Max(HBO)",
    unreachable:"不可達", timeout:"逾時", fail:"檢測失敗", regionBlocked:"區域受限", originals:"自製", full:"完整"
  };
  return SD_LANG==='zh-Hant' ? T : H;
})();

function sd_parseNFRegion(resp) {
  try {
    var x = (resp.headers && (resp.headers["x-originating-url"]||resp.headers["X-Origining-URL"]||resp.headers["X-Originating-URL"])) || '';
    if (x) {
      var seg = String(x).split('/');
      if (seg.length >= 4) {
        var cc = seg[3].split('-')[0];
        if (/^[A-Z]{2}$/i.test(cc)) return cc.toUpperCase();
      }
    }
    var m = String(resp.data||"").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i);
    if (m) return m[1].toUpperCase();
  } catch(_){}
  return '';
}

async function sd_testYouTube() {
  var r = await sd_httpGet('https://www.youtube.com/premium?hl=en', {}, true);
  if (!r.ok) return sd_renderLine({name:SD_I18N.youTube, ok:false, cc:'', cost:r.cost, status:r.status, tag:SD_I18N.unreachable});
  var cc = 'US';
  try {
    var m = r.data && r.data.match(/"countryCode":"([A-Z]{2})"/);
    if (!m && r.data) m = r.data.match(/["']INNERTUBE_CONTEXT_GL["']\s*:\s*["']([A-Z]{2})["']/);
    if (m) cc = m[1];
  } catch(_){}
  return sd_renderLine({name:SD_I18N.youTube, ok:true, cc:cc, cost:r.cost, status:r.status, tag:''});
}
async function sd_testChatGPTWeb() {
  var r = await sd_httpGet('https://chatgpt.com/cdn-cgi/trace', {}, true);
  if (!r.ok) return sd_renderLine({name:SD_I18N.chatgpt, ok:false, cc:'', cost:r.cost, status:r.status, tag:SD_I18N.unreachable});
  var cc = ''; try { var m = String(r.data||'').match(/loc=([A-Z]{2})/); if (m) cc = m[1]; } catch(_){}
  return sd_renderLine({name:SD_I18N.chatgpt, ok:true, cc:cc, cost:r.cost, status:r.status, tag:''});
}
async function sd_testChatGPTAppAPI() {
  var r = await sd_httpGet('https://api.openai.com/v1/models', {}, true);
  if (!r.ok) return sd_renderLine({name:SD_I18N.chatgpt_app, ok:false, cc:'', cost:r.cost, status:r.status, tag:SD_I18N.unreachable});
  var cc = '';
  try {
    var h = r.headers || {};
    cc = String(h['cf-ipcountry'] || h['CF-IPCountry'] || h['Cf-IpCountry'] || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) cc = '';
  } catch(_){}
  if (!cc) cc = await sd_queryLandingCCMulti();
  return sd_renderLine({name:SD_I18N.chatgpt_app, ok:true, cc:cc, cost:r.cost, status:r.status, tag:''});
}

var SD_NF_ORIGINAL = '80018499';
var SD_NF_NONORIG  = '81280792';
async function sd_nfGet(id){ return await sd_httpGet('https://www.netflix.com/title/'+id, {}, true); }
async function sd_testNetflix() {
  try {
    var r1 = await sd_nfGet(SD_NF_NONORIG);
    if (!r1.ok) return sd_renderLine({name:SD_I18N.netflix, ok:false, cc:'', cost:r1.cost, status:r1.status, tag:SD_I18N.fail});
    if (r1.status === 403) return sd_renderLine({name:SD_I18N.netflix, ok:false, cc:'', cost:r1.cost, status:r1.status, tag:SD_I18N.regionBlocked});
    if (r1.status === 404) {
      var r2 = await sd_nfGet(SD_NF_ORIGINAL);
      if (!r2.ok) return sd_renderLine({name:SD_I18N.netflix, ok:false, cc:'', cost:r2.cost, status:r2.status, tag:SD_I18N.fail});
      if (r2.status === 404) return sd_renderLine({name:SD_I18N.netflix, ok:false, cc:'', cost:r2.cost, status:r2.status, tag:SD_I18N.regionBlocked});
      var cc = sd_parseNFRegion(r2) || '';
      return sd_renderLine({name:SD_I18N.netflix, ok:true, cc:cc, cost:r2.cost, status:r2.status, tag:SD_I18N.originals, state:'partial'});
    }
    if (r1.status === 200) {
      var cc2 = sd_parseNFRegion(r1) || '';
      return sd_renderLine({name:SD_I18N.netflix, ok:true, cc:cc2, cost:r1.cost, status:r1.status, tag:SD_I18N.full, state:'full'});
    }
    return sd_renderLine({name:SD_I18N.netflix, ok:false, cc:'', cost:r1.cost, status:r1.status, tag:'HTTP '+r1.status});
  } catch(_){
    return sd_renderLine({name:SD_I18N.netflix, ok:false, cc:'', cost:null, status:0, tag:SD_I18N.fail});
  }
}

async function sd_testDisney() {
  async function home() {
    var r = await sd_httpGet('https://www.disneyplus.com/', { 'Accept-Language':'en' }, true);
    if (!r.ok || r.status !== 200 || /Sorry,\s*Disney\+\s*is\s*not\s*available/i.test(r.data||'')) throw 'NA';
    var cc=''; try {
      var m = r.data && (r.data.match(/"countryCode"\s*:\s*"([A-Z]{2})"/i) || r.data.match(/data-country=["']([A-Z]{2})["']/i));
      if (m) cc = m[1];
    } catch(_){}
    return { cc:cc, cost:r.cost, status:r.status };
  }
  async function bam() {
    var headers = {
      'Accept-Language':'en',
      'Authorization':'ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84',
      'Content-Type':'application/json',
      'User-Agent': SD_UA
    };
    var body = JSON.stringify({
      query:'mutation registerDevice($input: RegisterDeviceInput!) { registerDevice(registerDevice: $input) { grant { grantType assertion } } }',
      variables:{ input:{ applicationRuntime:'chrome', attributes:{ browserName:'chrome', browserVersion:'120.0.0.0', manufacturer:'apple', model:null, operatingSystem:'macintosh', operatingSystemVersion:'10.15.7', osDeviceIds:[] }, deviceFamily:'browser', deviceLanguage:'en', deviceProfile:'macosx' } }
    });
    var r = await sd_httpPost('https://disney.api.edge.bamgrid.com/graph/v1/device/graphql', headers, body);
    if (!r.ok || r.status !== 200) throw 'NA';
    var d = JSON.parse(r.data || '{}');
    if (d && d.errors) throw 'NA';
    var inLoc = d && d.extensions && d.extensions.sdk && d.extensions.sdk.session ? d.extensions.sdk.session.inSupportedLocation : undefined;
    var cc    = d && d.extensions && d.extensions.sdk && d.extensions.sdk.session && d.extensions.sdk.session.location ? d.extensions.sdk.session.location.countryCode : undefined;
    return { inLoc:inLoc, cc:cc, cost:r.cost, status:r.status };
  }
  function timeout(ms, code){ return new Promise(function(_,rej){ setTimeout(function(){ rej(code); }, ms); }); }

  try {
    var h = await Promise.race([home(), timeout(7000,'TO')]);
    var b = await Promise.race([bam(),  timeout(7000,'TO')])["catch"](function(){ return {}; });
    var blocked = (b && b.inLoc === false);
    var cc = blocked ? '' : ((b && b.cc) || (h && h.cc) || (await sd_queryLandingCCMulti()) || '');
    return sd_renderLine({name:SD_I18N.disney, ok:!blocked, cc:cc, cost:(b&&b.cost)|| (h&&h.cost)||0, status:(b&&b.status)||(h&&h.status)||0, tag: blocked ? SD_I18N.regionBlocked : ''});
  } catch(e){
    var tag = (e==='TO') ? SD_I18N.timeout : SD_I18N.fail;
    return sd_renderLine({name:SD_I18N.disney, ok:false, cc:'', cost:null, status:0, tag:tag});
  }
}

async function sd_testHuluUS() {
  var r = await sd_httpGet('https://www.hulu.com/', {}, true);
  if (!r.ok) return sd_renderLine({name:SD_I18N.huluUS, ok:false, cc:'', cost:r.cost, status:r.status, tag:SD_I18N.unreachable});
  var blocked = /not\s+available\s+in\s+your\s+region/i.test(String(r.data||''));
  return sd_renderLine({name:SD_I18N.huluUS, ok:!blocked, cc: blocked?'': 'US', cost:r.cost, status:r.status, tag: blocked ? SD_I18N.regionBlocked : ''});
}
async function sd_testHuluJP() {
  var r = await sd_httpGet('https://www.hulu.jp/', { 'Accept-Language':'ja' }, true);
  if (!r.ok) return sd_renderLine({name:SD_I18N.huluJP, ok:false, cc:'', cost:r.cost, status:r.status, tag:SD_I18N.unreachable});
  var blocked = /ご利用いただけません|サービスをご利用いただけません|not available/i.test(String(r.data||''));
  return sd_renderLine({name:SD_I18N.huluJP, ok:!blocked, cc: blocked?'': 'JP', cost:r.cost, status:r.status, tag: blocked ? SD_I18N.regionBlocked : ''});
}
async function sd_testHBO() {
  var r = await sd_httpGet('https://www.max.com/', {}, true);
  if (!r.ok) return sd_renderLine({name:SD_I18N.hbo, ok:false, cc:'', cost:r.cost, status:r.status, tag:SD_I18N.unreachable});
  var blocked = /not\s+available\s+in\s+your\s+region|country\s+not\s+supported/i.test(String(r.data||''));
  var cc=''; try { var m = String(r.data||'').match(/"countryCode"\s*:\s*"([A-Z]{2})"/i); if (m) cc = m[1].toUpperCase(); } catch(_){}
  if (!cc) cc = await sd_queryLandingCCMulti();
  return sd_renderLine({name:SD_I18N.hbo, ok:!blocked, cc: blocked?'': cc, cost:r.cost, status:r.status, tag: blocked ? SD_I18N.regionBlocked : ''});
}

async function runServiceChecks(){
  try{
    var res = await Promise.all([
      sd_testYouTube(),
      sd_testNetflix(),
      sd_testDisney(),
      sd_testChatGPTWeb(),
      sd_testChatGPTAppAPI(),
      sd_testHuluUS(),
      sd_testHuluJP(),
      sd_testHBO()
    ]);
    return res;
  }catch(_){
    return [];
  }
}
