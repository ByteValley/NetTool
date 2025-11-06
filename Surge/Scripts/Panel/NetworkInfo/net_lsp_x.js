/*
 * 网络信息
 * - 直连(CN) / 落地(PROXY) IP 与地区、ISP
 * - 可选 IPv6、入口与落地对比、国旗、ORG/ASN、隐私标签
 * - 事件通知（event-network）与面板(generic)
 * - “按字段”脱敏：通过参数 MASK 精确控制
 *
 * 参数要点（与 Surge 模块占位 {{{KEY}}} 对应）：
 * MASK=1|0|all|none|<列表>   列表示例：CN_IP,PROXY_IP,CN_ADDR,PROXY_ADDR,SSID,LAN_IPv4,LAN_IPv6,CN_POLICY,PROXY_POLICY
 * IPv6=0|1
 * SSID=0|1
 * LAN=0|1
 * PRIVACY=0|1               开 ipwhois 的 security 标签（仅落地、不带 IP 时）
 * FLAG=0|1
 * ORG=0|1                   展示组织
 * ASN=0|1                   展示 ASN
 * TIMEOUT=5                 单项超时（秒）
 * RETRIES=1                 重试次数
 * RETRY_DELAY=1             重试间隔（秒）
 * ENTRANCE_DELAY=0          入口落地不一致时，延迟再查入口（秒）
 * DNS=ali|google|cf|tencent  入口域名解析
 * DOMESTIC_IPv4=ipim|cip|baidu|163|bilibili|126|ipip|ip233|spcn|ali（默认 ipim）
 * LANDING_IPv4=ipapi|ipinfo|ipscore|ipsb|ipwhois（默认 ipapi）
 * DOMESTIC_IPv6=ddnspod|neu6（默认 ddnspod）
 * LANDING_IPv6=ipsb|ident|ipify（默认 ipsb）
 *
 * 返回：
 * - 面板：$.done({ title, content })
 * - 事件：通知；若未变化则不打扰
 */

const NAME = 'network-info';
const $ = new Env(NAME);

// ------------------------- 参数处理 -------------------------
let arg = {};
try {
  if (typeof $argument !== 'undefined') {
    arg = Object.fromEntries(
      String($argument)
        .split('&')
        .map(kv => kv.split('='))
    );
  }
} catch (_) {
  arg = {};
}

// 合并持久化参数
arg = { ...$.getjson(NAME, {}), ...arg };

// QX 事件脚本修正
if (typeof $environment !== 'undefined' && $.lodash_get($environment, 'executor') === 'event-network') {
  $.lodash_set(arg, 'TYPE', 'EVENT');
}

// 无交互/请求/面板时，视作事件
if (!isInteraction() && !isRequest() && !isPanel()) {
  $.lodash_set(arg, 'TYPE', 'EVENT');
}

// 请求注入参数
if (isRequest()) {
  try {
    arg = { ...arg, ...parseQueryString($request.url || '') };
  } catch (_) {}
}

$.log(`参数: ${$.toStr(arg)}`);

// ---------------------- 脱敏/国旗工具 ----------------------
function useMask(key) {
  const raw = String($.lodash_get(arg, 'MASK') ?? '1').trim();
  if (raw === '1' || /^all$/i.test(raw)) return true;
  if (raw === '0' || /^none$/i.test(raw)) return false;
  const set = new Set(
    raw
      .split(/[,|+]/)
      .map(s => s.trim().toUpperCase())
      .filter(Boolean)
  );
  return set.has(String(key).toUpperCase());
}

function maskAddr(addr, key) {
  if (!addr) return '';
  if (!useMask(key)) return addr;
  const s = String(addr);
  if (s.includes(' ')) {
    const parts = s.split(' ');
    if (parts.length >= 3) return [parts[0], '*', parts[parts.length - 1]].join(' ');
  }
  const third = Math.floor(s.length / 3);
  return s.substring(0, third) + '*'.repeat(third) + s.substring(2 * third);
}

function maskIP(ip, key) {
  if (!ip) return '';
  if (!useMask(key)) return ip;
  const s = String(ip);
  if (s.includes('.')) {
    const p = s.split('.');
    return [p[0], p[1], '*', '*'].join('.');
  } else {
    const p = s.split(':');
    return [...p.slice(0, 4), '*', '*', '*', '*'].join(':');
  }
}

function getflag(code) {
  if ($.lodash_get(arg, 'FLAG', 1) != 1) return '';
  try {
    const t = String(code || '')
      .toUpperCase()
      .split('')
      .map(c => 127397 + c.charCodeAt(0));
    // 特殊替换：示例（如需）
    return String.fromCodePoint(...t).replace(/🇹🇼/g, '🇼🇸');
  } catch {
    return '';
  }
}

function simplifyAddr(addr) {
  if (!addr) return '';
  return String(addr)
    .split(/\n/)
    .map(line => Array.from(new Set(line.split(/\s+/))).join(' '))
    .join('\n');
}

// ------------------------- 网络信息 -------------------------
(async () => {
  try {
    // 事件延迟
    if ($.lodash_get(arg, 'TYPE') === 'EVENT') {
      const d = Number($.lodash_get(arg, 'EVENT_DELAY') || 3);
      if (d > 0) await $.wait(d * 1000);
    }

    // SSID / LAN
    let SSID = '';
    let LAN_IPv4 = '';
    let LAN_IPv6 = '';

    if (typeof $network !== 'undefined') {
      if ($.lodash_get(arg, 'SSID') == 1) SSID = $.lodash_get($network, 'wifi.ssid') || '';
      const v4 = $.lodash_get($network, 'v4.primaryAddress');
      const v6 = $.lodash_get($network, 'v6.primaryAddress');
      if ($.lodash_get(arg, 'LAN') == 1) {
        if (v4) LAN_IPv4 = v4;
        if (v6 && $.lodash_get(arg, 'IPv6') == 1) LAN_IPv6 = v6;
      }
    } else if (typeof $config !== 'undefined') {
      try {
        const conf = JSON.parse($config.getConfig() || '{}');
        if ($.lodash_get(arg, 'SSID') == 1) SSID = $.lodash_get(conf, 'ssid') || '';
      } catch (_) {}
    } else if (typeof $environment !== 'undefined') {
      try {
        const os = ($.lodash_get($environment, 'version') || '').split(' ')[0];
        if (os !== 'macOS' && $.lodash_get(arg, 'SSID') == 1) {
          SSID = $.lodash_get($environment, 'ssid') || '';
        }
      } catch (_) {}
    }

    const LANLine = (() => {
      const parts = [];
      if (LAN_IPv4) parts.push(LAN_IPv4);
      if (LAN_IPv6) parts.push(maskIP(LAN_IPv6, 'LAN_IPv6'));
      return parts.length ? `LAN: ${parts.join(' ')}\n\n` : '';
    })();

    const SSIDLine = SSID ? `SSID: ${maskAddr(SSID, 'SSID')}\n\n` : '';

    // Proxies（Stash）
    const { PROXIES } = await getProxies();

    // IPv4 直连与落地
    const [
      { CN_IP = '', CN_INFO = '', CN_POLICY = '' } = {},
      { PROXY_IP = '', PROXY_INFO = '', PROXY_PRIVACY = '', PROXY_POLICY = '', ENTRANCE_IP = '' } = {},
      v6Direct,
      v6Proxy
    ] = await Promise.all([
      getDirectRequestInfo({ PROXIES }),
      getProxyRequestInfo({ PROXIES }),
      $.lodash_get(arg, 'IPv6') == 1 ? getDirectInfoIPv6() : Promise.resolve({}),
      $.lodash_get(arg, 'IPv6') == 1 ? getProxyInfoIPv6() : Promise.resolve({})
    ]);

    let { CN_IPv6 = '' } = v6Direct || {};
    let { PROXY_IPv6 = '' } = v6Proxy || {};

    // 事件去抖：未变化则不提示
    if ($.lodash_get(arg, 'TYPE') === 'EVENT') {
      const last = $.getjson('lastNetworkInfoEvent') || {};
      const changed =
        CN_IP !== last.CN_IP ||
        CN_IPv6 !== last.CN_IPv6 ||
        PROXY_IP !== last.PROXY_IP ||
        PROXY_IPv6 !== last.PROXY_IPv6;
      if (!changed) {
        $.log('网络信息未发生变化，事件结束');
        return $.done({});
      }
      $.setjson({ CN_IP, CN_IPv6, PROXY_IP, PROXY_IPv6 }, 'lastNetworkInfoEvent');
    }

    // 入口查询：当入口域与落地 IP 不一致时，可延迟查入口
    let ENTRANCE = '';
    if (ENTRANCE_IP && ENTRANCE_IP !== PROXY_IP) {
      const delay = Number($.lodash_get(arg, 'ENTRANCE_DELAY') || 0);
      if (delay > 0) await $.wait(delay * 1000);

      const resolved = await resolveDomain(ENTRANCE_IP);
      const realIP = resolved.IP || ENTRANCE_IP;

      const [{ CN_INFO: E1 = '', isCN = false } = {}, { PROXY_INFO: E2 = '' } = {}] = await Promise.all([
        getDirectInfo(realIP, $.lodash_get(arg, 'DOMESTIC_IPv4')),
        getProxyInfo(realIP, $.lodash_get(arg, 'LANDING_IPv4'))
      ]);

      if (E1 && isCN) {
        ENTRANCE = `入口: ${maskIP(realIP, 'CN_IP')}\n${maskAddr(E1, 'CN_ADDR')}`;
      }
      if (E2) {
        ENTRANCE = ENTRANCE
          ? `${ENTRANCE.replace(/^入口:/, '入口¹:')}\n${maskAddr(E2, 'PROXY_ADDR').replace(/^位置:/, '位置²:')}`
          : `入口: ${maskIP(realIP, 'PROXY_IP')}\n${maskAddr(E2, 'PROXY_ADDR')}`;
      }
      if (ENTRANCE) ENTRANCE += `\n\n`;
    }

    // IPv6 行
    CN_IPv6 = CN_IPv6 && isIPv6(CN_IPv6) && $.lodash_get(arg, 'IPv6') == 1 ? `\n${maskIP(CN_IPv6, 'CN_IPv6')}` : '';
    PROXY_IPv6 =
      PROXY_IPv6 && isIPv6(PROXY_IPv6) && $.lodash_get(arg, 'IPv6') == 1 ? `\n${maskIP(PROXY_IPv6, 'PROXY_IPv6')}` : '';

    // 策略名（Surge/Stash）
    let CN_POLICY_LINE = '';
    if ($.isSurge() || $.isStash()) {
      if (CN_POLICY && CN_POLICY !== 'DIRECT') {
        CN_POLICY_LINE = `策略: ${maskAddr(CN_POLICY, 'CN_POLICY') || '-'}\n`;
      }
    }

    let PROXY_POLICY_LINE = '';
    const policyPrefix = $.isQuanX() || $.isLoon() ? '节点: ' : '代理策略: ';
    if (PROXY_POLICY === 'DIRECT') {
      PROXY_POLICY_LINE = `${policyPrefix}直连`;
    } else if (PROXY_POLICY) {
      PROXY_POLICY_LINE = `${policyPrefix}${maskAddr(PROXY_POLICY, 'PROXY_POLICY') || '-'}`;
    }

    // 信息块
    const CN_INFO_LINE = CN_INFO ? `\n${simplifyAddr(CN_INFO)}` : '';
    const PROXY_INFO_LINE = PROXY_INFO ? `\n${simplifyAddr(PROXY_INFO)}` : '';
    const PRIVACY_LINE = $.lodash_get(arg, 'PRIVACY') == 1 && PROXY_PRIVACY ? `\n${PROXY_PRIVACY}` : '';

    const title = PROXY_POLICY_LINE || '网络信息 𝕏';
    const content =
      `${SSIDLine}${LANLine}${CN_POLICY_LINE}` +
      `IP: ${maskIP(CN_IP, 'CN_IP') || '-'}${CN_IPv6}${maskAddr(CN_INFO_LINE, 'CN_ADDR')}\n\n` +
      `${ENTRANCE}` +
      `落地 IP: ${maskIP(PROXY_IP, 'PROXY_IP') || '-'}${PROXY_IPv6}${maskAddr(PROXY_INFO_LINE, 'PROXY_ADDR')}${PRIVACY_LINE}` +
      `${!isInteraction() ? `\n执行时间: ${new Date().toTimeString().split(' ')[0]}` : ''}`;

    if ($.lodash_get(arg, 'TYPE') === 'EVENT') {
      await notify(
        `🄳 ${maskIP(CN_IP, 'CN_IP') || '-'} 🅿 ${maskIP(PROXY_IP, 'PROXY_IP') || '-'}`,
        `${simplifyAddr(String(CN_INFO).replace(/(位置|运营商).*?:/g, '').replace(/\n/g, ' ')).trim()}`,
        `${simplifyAddr(String(PROXY_INFO).replace(/(位置|运营商).*?:/g, '').replace(/\n/g, ' ')).trim()}${
          CN_IPv6 ? `\n🄳 ${CN_IPv6.replace(/\n+/g, '')}` : ''
        }${PROXY_IPv6 ? `\n🅿 ${PROXY_IPv6.replace(/\n+/g, '')}` : ''}${SSID ? `\nSSID: ${maskAddr(SSID, 'SSID')}` : ''}${
          LANLine ? `\n${LANLine.trim()}` : ''
        }`
      );
      return $.done({});
    }

    // 面板输出
    return $.done({ title: '网络信息 𝕏', content });
  } catch (e) {
    $.logErr(e);
    await notify('网络信息 𝕏', '❌', String(e && (e.message || e.error) ? e.message || e.error : e));
    return $.done({ title: '❌', content: String(e && (e.message || e.error) ? e.message || e.error : e) });
  }
})();

// ------------------------ 请求/入口/落地 ------------------------
async function getDirectRequestInfo({ PROXIES = [] } = {}) {
  const { CN_IP, CN_INFO } = await getDirectInfo(undefined, $.lodash_get(arg, 'DOMESTIC_IPv4'));
  const { POLICY } = await getRequestInfo(/cip\.cc|ipservice\.ws\.126\.net|api\.bilibili\.com|myip\.ipip\.net|ip\.ip233\.cn|ip\.im|qifu-api\.baidubce\.com|dashi\.163\.com/, PROXIES);
  return { CN_IP, CN_INFO, CN_POLICY: POLICY };
}

async function getProxyRequestInfo({ PROXIES = [] } = {}) {
  const { PROXY_IP, PROXY_INFO, PROXY_PRIVACY } = await getProxyInfo(undefined, $.lodash_get(arg, 'LANDING_IPv4'));
  let result;
  if ($.isSurge() || $.isStash()) {
    result = await getRequestInfo(/ipinfo\.io|ip-score\.com|ipwhois\.app|ip-api\.com|api-ipv4\.ip\.sb/, PROXIES);
  } else if ($.isQuanX() || $.isLoon()) {
    result = await getEntranceInfo();
  }
  return {
    PROXY_IP,
    PROXY_INFO,
    PROXY_PRIVACY,
    PROXY_POLICY: $.lodash_get(result, 'POLICY'),
    ENTRANCE_IP: $.lodash_get(result, 'IP')
  };
}

async function getEntranceInfo() {
  let IP = '';
  let POLICY = '';
  if (isInteraction()) {
    try {
      if ($.isQuanX()) {
        const nodeName = $environment.params;
        const { ret, error } = await $configuration.sendMessage({ action: 'get_server_description', content: nodeName });
        if (error) throw new Error(error);
        const proxy = Object.values(ret)[0];
        IP = proxy.match(/.+?\s*?=\s*?(.+?):\d+\s*?,.+/)[1];
        POLICY = nodeName;
      } else if ($.isLoon()) {
        IP = $.lodash_get($environment, 'params.nodeInfo.address');
        POLICY = $.lodash_get($environment, 'params.node');
      }
    } catch (e) {
      $.logErr(`获取入口信息失败: ${e.message || e}`);
    }
  }
  return { IP, POLICY };
}

async function getRequestInfo(regexp, PROXIES = []) {
  let POLICY = '';
  let IP = '';
  try {
    if ($.isSurge()) {
      const { requests } = await httpAPI('/v1/requests/recent', 'GET');
      const request = (requests || []).slice(0, 10).find(i => regexp.test(i.URL));
      if (request) {
        POLICY = request.policyName || '';
        if (/\(Proxy\)/.test(request.remoteAddress || '')) {
          IP = String(request.remoteAddress).replace(/\s*\(Proxy\)\s*/, '');
        }
      }
    } else if ($.isStash()) {
      const res = await $.http.get({ url: `http://127.0.0.1:9090/connections` });
      let body = String($.lodash_get(res, 'body') || $.lodash_get(res, 'rawBody'));
      try {
        body = JSON.parse(body);
      } catch (_) {}
      const connections = $.lodash_get(body, 'connections') || [];
      const connection =
        connections.slice(0, 10).find(i => {
          const dest = $.lodash_get(i, 'metadata.host') || $.lodash_get(i, 'metadata.destinationIP') || '';
          return regexp.test(dest);
        }) || {};
      const chain = $.lodash_get(connection, 'metadata.chain') || [];
      const proxy = chain[0];
      POLICY = proxy || '';
      IP = PROXIES?.[proxy]?.match(/^(.*?):\d+$/)?.[1] || '';
    }
  } catch (e) {
    $.logErr(`从最近请求获取策略失败: ${e.message || e}`);
  }
  return { POLICY, IP };
}

// -------------------------- 直连信息 --------------------------
async function getDirectInfo(ip, provider) {
  const p = provider || 'ipim';
  const msg = `直连信息源: ${p}${ip ? ` (IP=${ip})` : ''}`;

  try {
    if (p === 'cip') {
      const res = await http({
        url: `http://cip.cc/${ip ? encodeURIComponent(ip) : ''}`,
        headers: { 'User-Agent': 'curl/7.16.3' }
      });
      const body = String($.lodash_get(res, 'body') || '');
      const addr = body.match(/地址\s*(:|：)\s*(.*)/)?.[2] || '';
      const isCN = addr.includes('中国');
      const CN_IP = ip || body.match(/IP\s*(:|：)\s*(.*?)\s/)?.[2] || '';
      const CN_INFO = [
        ['位置:', isCN ? getflag('CN') : '', addr.replace(/中国\s*/, '')].filter(Boolean).join(' '),
        ['运营商:', (body.match(/运营商\s*(:|：)\s*(.*)/)?.[2] || '').replace(/中国\s*/, '')].filter(Boolean).join(' ')
      ]
        .filter(Boolean)
        .join('\n');
      return { CN_IP, CN_INFO: simplifyAddr(CN_INFO), isCN };
    }

    if (p === 'baidu') {
      const res = await http({
        url: `https://qifu-api.baidubce.com/ip/local/geo/v1/district`,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      let body = String($.lodash_get(res, 'body') || '');
      try {
        body = JSON.parse(body);
      } catch (_) {}
      const data = body?.data || {};
      const CN_IP = body?.ip || ip || '';
      const isCN = data?.country === '中国';
      const CN_INFO = [
        ['位置:', isCN ? getflag('CN') : '', data?.prov, data?.city, data?.district].filter(Boolean).join(' '),
        ['运营商:', data?.isp || data?.owner].filter(Boolean).join(' ')
      ]
        .filter(Boolean)
        .join('\n');
      return { CN_IP, CN_INFO: simplifyAddr(CN_INFO), isCN };
    }

    if (p === '163') {
      const res = await http({
        url: `https://dashi.163.com/fgw/mailsrv-ipdetail/detail`,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      let body = String($.lodash_get(res, 'body') || '');
      try {
        body = JSON.parse(body);
      } catch (_) {}
      const data = body?.result || {};
      const CN_IP = data?.ip || ip || '';
      const code = data?.countryCode || '';
      const isCN = code === 'CN';
      const CN_INFO = [
        ['位置:', getflag(code), data?.province, data?.city].filter(Boolean).join(' '),
        ['运营商:', data?.isp || data?.org].filter(Boolean).join(' ')
      ]
        .filter(Boolean)
        .join('\n');
      return { CN_IP, CN_INFO: simplifyAddr(CN_INFO), isCN };
    }

    if (p === 'bilibili') {
      const res = await http({
        url: `https://api.bilibili.com/x/web-interface/zone`,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      let body = String($.lodash_get(res, 'body') || '');
      try {
        body = JSON.parse(body);
      } catch (_) {}
      const isCN = $.lodash_get(body, 'data.country') === '中国';
      const CN_IP = $.lodash_get(body, 'data.addr') || ip || '';
      const CN_INFO = [
        [
          '位置:',
          isCN ? getflag('CN') : '',
          $.lodash_get(body, 'data.country'),
          $.lodash_get(body, 'data.province'),
          $.lodash_get(body, 'data.city')
        ]
          .filter(Boolean)
          .join(' '),
        ['运营商:', $.lodash_get(body, 'data.isp')].filter(Boolean).join(' ')
      ]
        .filter(Boolean)
        .join('\n');
      return { CN_IP, CN_INFO: simplifyAddr(CN_INFO), isCN };
    }

    if (p === '126') {
      const res = await http({
        url: `https://ipservice.ws.126.net/locate/api/getLocByIp`,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      let body = String($.lodash_get(res, 'body') || '');
      try {
        body = JSON.parse(body);
      } catch (_) {}
      const code = $.lodash_get(body, 'result.countrySymbol') || '';
      const isCN = code === 'CN';
      const CN_IP = $.lodash_get(body, 'result.ip') || ip || '';
      const CN_INFO = [
        [
          '位置:',
          getflag(code),
          $.lodash_get(body, 'result.country'),
          $.lodash_get(body, 'result.province'),
          $.lodash_get(body, 'result.city')
        ]
          .filter(Boolean)
          .join(' '),
        ['运营商:', $.lodash_get(body, 'result.operator')].filter(Boolean).join(' ')
      ]
        .filter(Boolean)
        .join('\n');
      return { CN_IP, CN_INFO: simplifyAddr(CN_INFO), isCN };
    }

    if (p === 'ipip') {
      const res = await http({
        url: `https://myip.ipip.net/json`,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      let body = String($.lodash_get(res, 'body') || '');
      try {
        body = JSON.parse(body);
      } catch (_) {}
      const isCN = $.lodash_get(body, 'data.location.0') === '中国';
      const CN_IP = $.lodash_get(body, 'data.ip') || ip || '';
      const CN_INFO = [
        [
          '位置:',
          isCN ? getflag('CN') : '',
          $.lodash_get(body, 'data.location.0'),
          $.lodash_get(body, 'data.location.1'),
          $.lodash_get(body, 'data.location.2')
        ]
          .filter(Boolean)
          .join(' '),
        ['运营商:', $.lodash_get(body, 'data.location.4')].filter(Boolean).join(' ')
      ]
        .filter(Boolean)
        .join('\n');
      return { CN_IP, CN_INFO: simplifyAddr(CN_INFO), isCN };
    }

    if (p === 'ip233') {
      const res = await http({
        url: `https://ip.ip233.cn/ip`,
        headers: { Referer: 'https://ip233.cn/', 'User-Agent': 'Mozilla/5.0' }
      });
      let body = String($.lodash_get(res, 'body') || '');
      try {
        body = JSON.parse(body);
      } catch (_) {}
      const code = $.lodash_get(body, 'country') || '';
      const isCN = code === 'CN';
      const CN_IP = $.lodash_get(body, 'ip') || ip || '';
      const CN_INFO = [
        ['位置:', getflag(code), ($.lodash_get(body, 'desc') || '').replace(/中国\s*/, '')].filter(Boolean).join(' '),
        $.lodash_get(arg, 'ORG') == 1 ? ['组织:', $.lodash_get(body, 'org') || '-'].filter(Boolean).join(' ') : undefined
      ]
        .filter(Boolean)
        .join('\n');
      return { CN_IP, CN_INFO: simplifyAddr(CN_INFO), isCN };
    }

    if (p === 'spcn') {
      const res = await http({
        url: `https://api-v3.spe.cn/ip`,
        params: { ip },
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      let body = String($.lodash_get(res, 'body') || '');
      try {
        body = JSON.parse(body);
      } catch (_) {}
      const code = $.lodash_get(body, 'data.countryCode') || '';
      const isCN = code === 'CN';
      const CN_IP = ip || $.lodash_get(body, 'data.ip') || '';
      const CN_INFO = [
        [
          '位置:',
          getflag(code),
          ($.lodash_get(body, 'data.country') || '').replace(/\s*中国\s*/, ''),
          $.lodash_get(body, 'data.province'),
          $.lodash_get(body, 'data.city'),
          $.lodash_get(body, 'data.district')
        ]
          .filter(Boolean)
          .join(' '),
        ['运营商:', $.lodash_get(body, 'data.operator') || $.lodash_get(body, 'data.isp') || '-']
          .filter(Boolean)
          .join(' ')
      ]
        .filter(Boolean)
        .join('\n');
      return { CN_IP, CN_INFO: simplifyAddr(CN_INFO), isCN };
    }

    if (p === 'ali') {
      let APPCODE = $.lodash_get(arg, 'DOMESTIC_IPv4_KEY');
      if (!APPCODE) throw new Error('缺少 DOMESTIC_IPv4_KEY（阿里云 APPCODE）');
      const keys = APPCODE.split(/,|，/).map(s => s.trim()).filter(Boolean);
      const key = keys[Math.floor(Math.random() * keys.length)];
      return await ali(ip, key);
    }

    // 默认 ip.im
    return await ipim(ip);
  } catch (e) {
    $.logErr(`${msg} 失败: ${e.message || e}`);
    return { CN_IP: ip || '', CN_INFO: '', isCN: false };
  }
}

async function getDirectInfoIPv6() {
  try {
    const p = $.lodash_get(arg, 'DOMESTIC_IPv6') || 'ddnspod';
    if (p === 'neu6') {
      const res = await http({ url: `https://speed.neu6.edu.cn/getIP.php`, headers: { 'User-Agent': 'Mozilla/5.0' } });
      return { CN_IPv6: String($.lodash_get(res, 'body') || '').trim() };
    }
    const res = await http({ url: `https://ipv6.ddnspod.com`, headers: { 'User-Agent': 'Mozilla/5.0' } });
    return { CN_IPv6: String($.lodash_get(res, 'body') || '').trim() };
  } catch (e) {
    $.logErr(`IPv6 直连失败: ${e.message || e}`);
    return {};
  }
}

// -------------------------- 落地信息 --------------------------
async function getProxyInfo(ip, provider) {
  const p = provider || 'ipapi';
  try {
    if (p === 'ipinfo') {
      let token = $.lodash_get(arg, 'LANDING_IPv4_KEY');
      if (!token) throw new Error('缺少 LANDING_IPv4_KEY（ipinfo token）');
      const arr = token.split(/,|，/).map(s => s.trim()).filter(Boolean);
      const key = arr[Math.floor(Math.random() * arr.length)];
      const url = ip
        ? `https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${encodeURIComponent(key)}`
        : `https://ipinfo.io/json?token=${encodeURIComponent(key)}`;
      const res = await http({ ...(ip ? {} : getNodeOpt()), url, headers: { 'User-Agent': 'Mozilla/5.0' } });
      let body = String($.lodash_get(res, 'body') || '');
      try {
        body = JSON.parse(body);
      } catch (_) {}
      const PROXY_IP = ip || $.lodash_get(body, 'ip') || '';
      const PROXY_INFO = [
        ['位置:', getflag(body.country), (body.country || '').replace(/\s*中国\s*/, ''), body.region, body.city]
          .filter(Boolean)
          .join(' '),
        ['运营商:', $.lodash_get(body, 'org') || '-'].filter(Boolean).join(' ')
      ]
        .filter(Boolean)
        .join('\n');
      return { PROXY_IP, PROXY_INFO: simplifyAddr(PROXY_INFO) };
    }

    if (p === 'ipscore') {
      const res = await http({
        ...(ip ? {} : getNodeOpt()),
        url: `https://ip-score.com/json`,
        params: { ip },
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      let body = String($.lodash_get(res, 'body') || '');
      try {
        body = JSON.parse(body);
      } catch (_) {}
      const PROXY_IP = ip || $.lodash_get(body, 'ip') || '';
      const PROXY_INFO = [
        [
          '位置¹:',
          getflag($.lodash_get(body, 'geoip1.countrycode')),
          $.lodash_get(body, 'geoip1.country'),
          $.lodash_get(body, 'geoip1.region'),
          $.lodash_get(body, 'geoip1.city')
        ]
          .filter(Boolean)
          .join(' '),
        [
          '位置²:',
          getflag($.lodash_get(body, 'geoip2.countrycode')),
          $.lodash_get(body, 'geoip2.country'),
          $.lodash_get(body, 'geoip2.region'),
          $.lodash_get(body, 'geoip2.city')
        ]
          .filter(Boolean)
          .join(' '),
        ['运营商:', body.isp || body.org || body.asn].filter(Boolean).join(' ')
      ]
        .filter(Boolean)
        .join('\n');
      return { PROXY_IP, PROXY_INFO: simplifyAddr(PROXY_INFO) };
    }

    if (p === 'ipsb') {
      const res = await http({
        ...(ip ? {} : getNodeOpt()),
        url: `https://api-ipv4.ip.sb/geoip${ip ? `/${encodeURIComponent(ip)}` : ''}`,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      let body = String($.lodash_get(res, 'body') || '');
      try {
        body = JSON.parse(body);
      } catch (_) {}
      const PROXY_IP = ip || $.lodash_get(body, 'ip') || '';
      const PROXY_INFO = [
        ['位置:', getflag($.lodash_get(body, 'country_code')), body.country, body.region, body.city]
          .filter(Boolean)
          .join(' '),
        ['运营商:', body.isp || body.organization].filter(Boolean).join(' '),
        $.lodash_get(arg, 'ORG') == 1
          ? ['组织:', $.lodash_get(body, 'asn_organization') || '-'].filter(Boolean).join(' ')
          : undefined,
        $.lodash_get(arg, 'ASN') == 1 ? ['ASN:', $.lodash_get(body, 'asn') || '-'].filter(Boolean).join(' ') : undefined
      ]
        .filter(Boolean)
        .join('\n');
      return { PROXY_IP, PROXY_INFO: simplifyAddr(PROXY_INFO) };
    }

    if (p === 'ipwhois') {
      const res = await http({
        ...(ip ? {} : getNodeOpt()),
        url: `https://ipwhois.app/widget.php`,
        params: { lang: 'zh-CN', ip },
        headers: {
          Host: 'ipwhois.app',
          'User-Agent': 'Mozilla/5.0',
          Accept: '*/*',
          Origin: 'https://ipwhois.io',
          Referer: 'https://ipwhois.io/'
        }
      });
      let body = String($.lodash_get(res, 'body') || '');
      try {
        body = JSON.parse(body);
      } catch (_) {}
      const PROXY_IP = ip || $.lodash_get(body, 'ip') || '';
      const PROXY_INFO = [
        ['位置:', getflag(body.country_code), (body.country || '').replace(/\s*中国\s*/, ''), body.region, body.city]
          .filter(Boolean)
          .join(' '),
        ['运营商:', $.lodash_get(body, 'connection.isp') || '-'].filter(Boolean).join(' '),
        $.lodash_get(arg, 'ORG') == 1
          ? ['组织:', $.lodash_get(body, 'connection.org') || '-'].filter(Boolean).join(' ')
          : undefined,
        $.lodash_get(arg, 'ASN') == 1
          ? ['ASN:', $.lodash_get(body, 'connection.asn') || '-'].filter(Boolean).join(' ')
          : undefined
      ]
        .filter(Boolean)
        .join('\n');

      let PROXY_PRIVACY = '';
      if (!ip && $.lodash_get(arg, 'PRIVACY') == 1) {
        const map = { true: '✓', false: '✗' };
        const sec = $.lodash_get(body, 'security') || {};
        const lines = Object.keys(sec).map(k => `${k.toUpperCase()}: ${map[String(sec[k])] || '-'}`);
        PROXY_PRIVACY = lines.length ? `隐私安全:\n${lines.join('\n')}` : '隐私安全: -';
      }
      return { PROXY_IP, PROXY_INFO: simplifyAddr(PROXY_INFO), PROXY_PRIVACY };
    }

    // 默认 ip-api
    {
      const pth = ip ? `/${encodeURIComponent(ip)}` : '';
      const res = await http({
        ...(ip ? {} : getNodeOpt()),
        url: `http://ip-api.com/json${pth}?lang=zh-CN`,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      let body = String($.lodash_get(res, 'body') || '');
      try {
        body = JSON.parse(body);
      } catch (_) {}
      const PROXY_IP = ip || body.query || '';
      const PROXY_INFO = [
        [
          '位置:',
          getflag(body.countryCode || ''),
          (body.country || '').replace(/\s*中国\s*/, ''),
          body.regionName ? body.regionName.split(/\s+or\s+/)[0] : body.regionName,
          body.city
        ]
          .filter(Boolean)
          .join(' '),
        ['运营商:', body.isp || body.org || body.as].filter(Boolean).join(' '),
        $.lodash_get(arg, 'ORG') == 1 ? ['组织:', body.org || '-'].filter(Boolean).join(' ') : undefined,
        $.lodash_get(arg, 'ASN') == 1 ? ['ASN:', body.as || '-'].filter(Boolean).join(' ') : undefined
      ]
        .filter(Boolean)
        .join('\n');
      return { PROXY_IP, PROXY_INFO: simplifyAddr(PROXY_INFO) };
    }
  } catch (e) {
    $.logErr(`落地信息失败: ${e.message || e}`);
    return { PROXY_IP: ip || '', PROXY_INFO: '', PROXY_PRIVACY: '' };
  }
}

async function getProxyInfoIPv6(ip) {
  try {
    const p = $.lodash_get(arg, 'LANDING_IPv6') || 'ipsb';
    if (p === 'ident') {
      const res = await http({ ...(ip ? {} : getNodeOpt()), url: `https://v6.ident.me`, headers: { 'User-Agent': 'Mozilla/5.0' } });
      return { PROXY_IPv6: String($.lodash_get(res, 'body') || '').trim() };
    }
    if (p === 'ipify') {
      const res = await http({ ...(ip ? {} : getNodeOpt()), url: `https://api6.ipify.org`, headers: { 'User-Agent': 'Mozilla/5.0' } });
      return { PROXY_IPv6: String($.lodash_get(res, 'body') || '').trim() };
    }
    const res = await http({ ...(ip ? {} : getNodeOpt()), url: `https://api-ipv6.ip.sb/ip`, headers: { 'User-Agent': 'Mozilla/5.0' } });
    return { PROXY_IPv6: String($.lodash_get(res, 'body') || '').trim() };
  } catch (e) {
    $.logErr(`IPv6 落地失败: ${e.message || e}`);
    return {};
  }
}

// -------------------------- 外部服务封装 --------------------------
async function ipim(ip) {
  const res = await http({ url: `https://ip.im/${ip ? encodeURIComponent(ip) : 'info'}`, headers: { 'User-Agent': 'curl/7.16.3' } });
  const body = String($.lodash_get(res, 'body') || '');
  const IP = body.match(/(^|\s+)Ip\s*(:|：)\s*(.*)/m)?.[3] || ip || '';
  const country = body.match(/(^|\s+)Country\s*(:|：)\s*(.*)/m)?.[3] || '';
  const province = body.match(/(^|\s+)Province\s*(:|：)\s*(.*)/m)?.[3] || body.match(/(^|\s+)Region\s*(:|：)\s*(.*)/m)?.[3] || '';
  const city = body.match(/(^|\s+)City\s*(:|：)\s*(.*)/m)?.[3] || '';
  const district = body.match(/(^|\s+)Districts\s*(:|：)\s*(.*)/m)?.[3] || '';
  const isp = body.match(/(^|\s+)Isp\s*(:|：)\s*(.*)/m)?.[3] || '';
  const org = body.match(/(^|\s+)Org\s*(:|：)\s*(.*)/m)?.[3] || '';
  const isCN = country.includes('中国');
  const INFO = [
    ['位置:', isCN ? getflag('CN') : getflag(country), country, province, city, district].filter(Boolean).join(' '),
    ['运营商:', isp || '-'].filter(Boolean).join(' '),
    $.lodash_get(arg, 'ORG') == 1 ? ['组织:', org || '-'].filter(Boolean).join(' ') : undefined
  ]
    .filter(Boolean)
    .join('\n');
  return { CN_IP: IP, CN_INFO: simplifyAddr(INFO), isCN };
}

async function ali(ip, key) {
  const res = await http({
    url: `https://ips.market.alicloudapi.com/iplocaltion`,
    params: { ip },
    headers: { authorization: `APPCODE ${key}` }
  });
  let body = String($.lodash_get(res, 'body') || '');
  try {
    body = JSON.parse(body);
  } catch (_) {}
  const code = $.lodash_get(body, 'result.en_short') || '';
  const isCN = code === 'CN';
  const INFO = [
    [
      '位置:',
      getflag(code),
      ($.lodash_get(body, 'result.nation') || '').replace(/中国\s*/, ''),
      $.lodash_get(body, 'result.province'),
      $.lodash_get(body, 'result.city'),
      $.lodash_get(body, 'result.district')
    ]
      .filter(Boolean)
      .join(' ')
  ]
    .filter(Boolean)
    .join('\n');
  return { CN_IP: $.lodash_get(body, 'ip') || ip || '', CN_INFO: simplifyAddr(INFO), isCN };
}

// ------------------------------ DNS 解析 ------------------------------
const DOMAIN_RESOLVERS = {
  google: async (domain, type) => {
    const resp = await http({
      url: `https://8.8.4.4/resolve`,
      params: { name: domain, type: type === 'IPv6' ? 'AAAA' : 'A' },
      headers: { accept: 'application/dns-json' }
    });
    const body = JSON.parse(resp.body || '{}');
    if (body.Status !== 0) throw new Error(`DNS status=${body.Status}`);
    const ans = body.Answer || [];
    if (!ans.length) throw new Error('无解析结果');
    return ans[ans.length - 1].data;
  },
  cf: async (domain, type) => {
    const resp = await http({
      url: `https://1.0.0.1/dns-query`,
      params: { name: domain, type: type === 'IPv6' ? 'AAAA' : 'A' },
      headers: { accept: 'application/dns-json' }
    });
    const body = JSON.parse(resp.body || '{}');
    if (body.Status !== 0) throw new Error(`DNS status=${body.Status}`);
    const ans = body.Answer || [];
    if (!ans.length) throw new Error('无解析结果');
    return ans[ans.length - 1].data;
  },
  ali: async (domain, type) => {
    const resp = await http({
      url: `http://223.6.6.6/resolve`,
      params: { edns_client_subnet: '223.6.6.6/24', name: domain, short: 1, type: type === 'IPv6' ? 'AAAA' : 'A' },
      headers: { accept: 'application/dns-json' }
    });
    const ans = JSON.parse(resp.body || '[]');
    if (!ans.length) throw new Error('无解析结果');
    return ans[ans.length - 1];
  },
  tencent: async (domain, type) => {
    const resp = await http({
      url: `http://119.28.28.28/d`,
      params: { ip: '119.28.28.28', dn: domain, type: type === 'IPv6' ? 'AAAA' : 'A' },
      headers: { accept: 'application/dns-json' }
    });
    const parts = String(resp.body || '')
      .split(';')
      .map(i => i.split(',')[0]);
    if (!parts.length || String(parts) === '0') throw new Error('无解析结果');
    return parts[parts.length - 1];
  }
};

async function resolveDomain(domain) {
  if (isIPv4(domain)) return { IP: domain, IPv4: domain };
  if (isIPv6(domain)) return { IP: domain, IPv6: domain };
  const name = $.lodash_get(arg, 'DNS') || 'ali';
  const resolver = DOMAIN_RESOLVERS[name] || DOMAIN_RESOLVERS.ali;
  const [v4, v6] = await Promise.all([
    resolver(domain, 'IPv4').catch(() => ''),
    resolver(domain, 'IPv6').catch(() => '')
  ]);
  const IPv4 = isIPv4(v4) ? v4 : '';
  const IPv6 = isIPv6(v6) ? v6 : '';
  return { IP: IPv4 || IPv6 || '', IPv4, IPv6 };
}

// ------------------------- 环境与 HTTP 工具 --------------------------
const IPV4_REGEX = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)(\.(?!$)|$)){4}$/;
const IPV6_REGEX =
  /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

function isIPv4(ip) {
  return IPV4_REGEX.test(String(ip || ''));
}
function isIPv6(ip) {
  return IPV6_REGEX.test(String(ip || ''));
}
function isRequest() {
  return typeof $request !== 'undefined';
}
function isPanel() {
  return $.isSurge() && typeof $input != 'undefined' && $.lodash_get($input, 'purpose') === 'panel';
}
function isInteraction() {
  return (
    ($.isQuanX() && typeof $environment != 'undefined' && $.lodash_get($environment, 'executor') === 'event-interaction') ||
    ($.isLoon() && typeof $environment != 'undefined' && $.lodash_get($environment, 'params.node'))
  );
}

async function getProxies() {
  let PROXIES = {};
  if ($.isStash()) {
    try {
      const res = await $.http.get({ url: `http://127.0.0.1:9090/providers/proxies` });
      let body = String($.lodash_get(res, 'body') || $.lodash_get(res, 'rawBody') || '');
      try {
        body = JSON.parse(body);
      } catch (_) {}
      PROXIES = Object.values(body.providers || {})
        .map(i => i.proxies || [])
        .flat()
        .reduce((obj, i) => {
          obj[i.name] = i.address;
          return obj;
        }, {});
    } catch (e) {
      $.logErr(e);
    }
  }
  return { PROXIES };
}

async function httpAPI(path = '/v1/requests/recent', method = 'GET', body = null) {
  return new Promise(resolve => {
    $httpAPI(method, path, body, result => resolve(result || {}));
  });
}

function getNodeOpt() {
  if (!isInteraction()) return {};
  if ($.isQuanX()) return { opts: { policy: $environment.params } };
  if ($.isLoon()) return { node: $environment.params.node };
  return {};
}

async function http(opt = {}) {
  const TIMEOUT = Number(opt.timeout || $.lodash_get(arg, 'TIMEOUT') || 5);
  const RETRIES = Number(opt.retries || $.lodash_get(arg, 'RETRIES') || 1);
  const RETRY_DELAY = Number(opt.retry_delay || $.lodash_get(arg, 'RETRY_DELAY') || 1);

  // Surge/Loon/Stash 单位差异处理
  let timeout = TIMEOUT + 1;
  timeout = $.isSurge() ? timeout : timeout * 1000;

  let count = 0;
  const run = async () => {
    try {
      if (TIMEOUT) {
        return await Promise.race([
          $.http.get({ ...opt, timeout }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('HTTP TIMEOUT')), TIMEOUT * 1000))
        ]);
      }
      return await $.http.get(opt);
    } catch (e) {
      if (count < RETRIES) {
        count++;
        $.log(`第 ${count} 次请求失败: ${e.message || e}, ${RETRY_DELAY}s 后重试`);
        await $.wait(RETRY_DELAY * 1000);
        return await run();
      }
      throw e;
    }
  };
  return await run();
}

async function notify(title, subt, desc, opts) {
  if ($.lodash_get(arg, 'TYPE') === 'EVENT' || $.lodash_get(arg, 'notify') == 1) {
    $.msg(title, subt, desc, opts);
  } else {
    $.log('🔕', title, subt, desc, opts);
  }
}

// ------------------------------ QueryString ------------------------------
function parseQueryString(url) {
  const query = (String(url).split('?')[1] || '').trim();
  const regex = /([^=&]+)=([^&]*)/g;
  const params = {};
  let m;
  while ((m = regex.exec(query))) {
    params[decodeURIComponent(m[1])] = decodeURIComponent(m[2]);
  }
  return params;
}

// ------------------------------ Env Helper ------------------------------
// 原样保留（稳定性优先），仅补全分号与缩进
function Env(t, e) {
  class s {
    constructor(t) {
      this.env = t;
    }
    send(t, e = 'GET') {
      t = 'string' == typeof t ? { url: t } : t;
      let s = this.get;
      return 'POST' === e && (s = this.post), new Promise((e, a) => {
        s.call(this, t, (t, s, r) => {
          t ? a(t) : e(s);
        });
      });
    }
    get(t) {
      return this.send.call(this.env, t);
    }
    post(t) {
      return this.send.call(this.env, t, 'POST');
    }
  }
  return new (class {
    constructor(t, e) {
      this.name = t;
      this.http = new s(this);
      this.data = null;
      this.dataFile = 'box.dat';
      this.logs = [];
      this.isMute = !1;
      this.isNeedRewrite = !1;
      this.logSeparator = '\n';
      this.encoding = 'utf-8';
      this.startTime = new Date().getTime();
      Object.assign(this, e);
      this.log('', `🔔${this.name}, 开始!`);
    }
    getEnv() {
      return 'undefined' != typeof $environment && $environment['surge-version']
        ? 'Surge'
        : 'undefined' != typeof $environment && $environment['stash-version']
        ? 'Stash'
        : 'undefined' != typeof module && module.exports
        ? 'Node.js'
        : 'undefined' != typeof $task
        ? 'Quantumult X'
        : 'undefined' != typeof $loon
        ? 'Loon'
        : 'undefined' != typeof $rocket
        ? 'Shadowrocket'
        : void 0;
    }
    isNode() {
      return 'Node.js' === this.getEnv();
    }
    isQuanX() {
      return 'Quantumult X' === this.getEnv();
    }
    isSurge() {
      return 'Surge' === this.getEnv();
    }
    isLoon() {
      return 'Loon' === this.getEnv();
    }
    isShadowrocket() {
      return 'Shadowrocket' === this.getEnv();
    }
    isStash() {
      return 'Stash' === this.getEnv();
    }
    toObj(t, e = null) {
      try {
        return JSON.parse(t);
      } catch {
        return e;
      }
    }
    toStr(t, e = null) {
      try {
        return JSON.stringify(t);
      } catch {
        return e;
      }
    }
    getjson(t, e) {
      let s = e;
      const a = this.getdata(t);
      if (a) try { s = JSON.parse(this.getdata(t)); } catch {}
      return s;
    }
    setjson(t, e) {
      try {
        return this.setdata(JSON.stringify(t), e);
      } catch {
        return !1;
      }
    }
    lodash_get(t, e, s) {
      const a = e.replace(/\[(\d+)\]/g, '.$1').split('.');
      let r = t;
      for (const t of a) if ((r = Object(r)[t]) === void 0) return s;
      return r;
    }
    lodash_set(t, e, s) {
      return Object(t) !== t
        ? t
        : ((Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || [])),
          e.slice(0, -1).reduce((t, s, a) => (Object(t[s]) === t[s] ? t[s] : (t[s] = Math.abs(e[a + 1]) >> 0 == +e[a + 1] ? [] : {}), t), t)[e[e.length - 1]] = s,
          t);
    }
    getdata(t) {
      let e = this.getval(t);
      if (/^@/.test(t)) {
        const [, s, a] = /^@(.*?)\.(.*?)$/.exec(t);
        const r = s ? this.getval(s) : '';
        if (r) try {
          const t = JSON.parse(r);
          e = t ? this.lodash_get(t, a, '') : e;
        } catch { e = ''; }
      }
      return e;
    }
    setdata(t, e) {
      let s = !1;
      if (/^@/.test(e)) {
        const [, a, r] = /^@(.*?)\.(.*?)$/.exec(e);
        const i = this.getval(a);
        const o = a ? ('null' === i ? null : i || '{}') : '{}';
        try {
          const e = JSON.parse(o);
          this.lodash_set(e, r, t), s = this.setval(JSON.stringify(e), a);
        } catch {
          const i = {};
          this.lodash_set(i, r, t), s = this.setval(JSON.stringify(i), a);
        }
      } else s = this.setval(t, e);
      return s;
    }
    getval(t) {
      switch (this.getEnv()) {
        case 'Surge':
        case 'Loon':
        case 'Stash':
        case 'Shadowrocket':
          return $persistentStore.read(t);
        case 'Quantumult X':
          return $prefs.valueForKey(t);
        case 'Node.js':
          return (this.data = this.loaddata()), this.data[t];
        default:
          return (this.data && this.data[t]) || null;
      }
    }
    setval(t, e) {
      switch (this.getEnv()) {
        case 'Surge':
        case 'Loon':
        case 'Stash':
        case 'Shadowrocket':
          return $persistentStore.write(t, e);
        case 'Quantumult X':
          return $prefs.setValueForKey(t, e);
        case 'Node.js':
          return (this.data = this.loaddata()), (this.data[e] = t), this.writedata(), !0;
        default:
          return (this.data && this.data[e]) || null;
      }
    }
    get(t, e = () => {}) {
      if (t.headers) {
        delete t.headers['Content-Type'];
        delete t.headers['Content-Length'];
        delete t.headers['content-type'];
        delete t.headers['content-length'];
      }
      if (t.params) t.url += '?' + this.queryStr(t.params);
      if (this.isSurge() && this.isNeedRewrite) {
        t.headers = t.headers || {};
        Object.assign(t.headers, { 'X-Surge-Skip-Scripting': !1 });
      }
      $httpClient.get(t, (t, s, a) => {
        !t && s && ((s.body = a), (s.statusCode = s.status ? s.status : s.statusCode), (s.status = s.statusCode));
        e(t, s, a);
      });
    }
    queryStr(t) {
      let e = '';
      for (const s in t) {
        let a = t[s];
        null != a && '' !== a && ('object' == typeof a && (a = JSON.stringify(a)), (e += `${s}=${a}&`));
      }
      return (e = e.substring(0, e.length - 1)), e;
    }
    msg(e = t, s = '', a = '', r) {
      if (!this.isMute) {
        const toSurge = (r => (r && r.url) ? { url: r.url } : r);
        $notification.post(e, s, a, toSurge(r || {}));
      }
      if (!this.isMuteLog) {
        const n = ['', '==============📣系统通知📣=============='];
        n.push(e), s && n.push(s), a && n.push(a), console.log(n.join('\n'));
        this.logs = this.logs.concat(n);
      }
    }
    log(...t) {
      t.length > 0 && (this.logs = [...this.logs, ...t]);
      console.log(t.join(this.logSeparator));
    }
    logErr(t) {
      this.log('', `❗️${this.name}, 错误!`, t && (t.stack || t));
    }
    wait(t) {
      return new Promise(e => setTimeout(e, t));
    }
    done(t = {}) {
      const e = (new Date()).getTime();
      const s = (e - this.startTime) / 1000;
      this.log('', `🔔${this.name}, 结束! 🕛 ${s} 秒`);
      this.log();
      $done(t);
    }
  })(t, e);
}
