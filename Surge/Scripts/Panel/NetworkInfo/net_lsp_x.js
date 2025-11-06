// == Network Info Panel ==
// Title: 代理策略: <policy> / fallback: 网络信息 𝕏
// Fields: IP / 位置 / 运营商 / 入口(位置¹/运营商¹/位置²/运营商²) / 落地 IP / 位置 / 运营商 / 执行时间
// Masking: 只对 IP、位置、入口、落地 IP 四列脱敏；其余不脱敏
// Args (via argument):
//   MASK=1|0
//   IPv6=1|0
//   DOMESTIC_IPv4=ipip|cip|163|bilibili|126|pingan   (default ipip)
//   LANDING_IPv4=ipapi|ipwhois|ipsb                  (default ipapi)
//
// 推荐与模块：type=generic 面板搭配；事件脚本可复用本文件

;(async () => {
  const arg = readArgument()
  const NEED_MASK = String(arg.MASK || '1') === '1'
  const SHOW_IPV6  = String(arg.IPv6 || '0') === '1'
  const DOMESTIC   = String(arg.DOMESTIC_IPv4 || 'ipip').toLowerCase()
  const LANDING    = String(arg.LANDING_IPv4 || 'ipapi').toLowerCase()

  // 1) 拉取直连侧 (CN)
  const cn = await getDirectInfoV4(DOMESTIC)
  const cn6 = SHOW_IPV6 ? await getIPv6Direct() : {}

  // 2) 拉取落地侧 (Proxy)
  const proxy = await getLandingInfoV4(LANDING)
  const proxy6 = SHOW_IPV6 ? await getIPv6Landing() : {}

  // 3) 从最近请求里回溯“策略与入口 IP”
  const { policyName, entranceIP } = await getPolicyAndEntrance()

  // 4) 如果拿到入口 IP，再查入口位置信息（直连侧、落地侧各一条作为¹/²）
  let entrance = {}
  if (entranceIP && isIP(entranceIP)) {
    const e1 = await queryLocByIP_Direct(entranceIP, DOMESTIC)
    const e2 = await queryLocByIP_Landing(entranceIP, LANDING)
    entrance = {
      ip: entranceIP,
      loc1: e1.loc, isp1: e1.isp,
      loc2: e2.loc, isp2: e2.isp
    }
  }

  // 5) 组装标题与正文（只对指定四列脱敏）
  const title = policyName ? `代理策略: ${policyName}` : '网络信息 𝕏'

  const cn_ip_line  = `IP: ${maskIPIfNeeded(cn.ip, NEED_MASK)}${cn6.ip ? `\n${maskIPIfNeeded(cn6.ip, NEED_MASK)}` : ''}`
  const cn_loc_line = cn.loc ? `位置: ${maskLocIfNeeded(cn.loc, NEED_MASK)}` : ''
  const cn_isp_line = cn.isp ? `运营商: ${cn.isp}` : ''

  const ent_lines = buildEntranceLines(entrance, NEED_MASK)

  const px_ip_line  =
    `落地 IP: ${maskIPIfNeeded(proxy.ip, NEED_MASK)}${proxy6.ip ? `\n${maskIPIfNeeded(proxy6.ip, NEED_MASK)}` : ''}`
  const px_loc_line = proxy.loc ? `位置: ${maskLocIfNeeded(proxy.loc, NEED_MASK)}` : ''
  const px_isp_line = proxy.isp ? `运营商: ${proxy.isp}` : ''

  const content = [
    cn_ip_line,
    cn_loc_line,
    cn_isp_line,
    '',                               // 空行
    ...ent_lines,
    ent_lines.length ? '' : null,     // 有入口时插空行
    px_ip_line,
    px_loc_line,
    px_isp_line,
    `\n执行时间: ${nowTime()}`
  ].filter(Boolean).join('\n')

  return $done({ title, content })

})().catch(err => {
  $notification.post('网络信息 𝕏', '脚本错误', String(err))
  $done({ title: '网络信息 𝕏', content: String(err) })
})

/* ================= Helpers ================= */

function readArgument() {
  try {
    if (typeof $argument === 'string' && $argument) {
      const kv = Object.fromEntries($argument.split('&').map(s => s.split('=')))
      return kv
    }
  } catch (_) {}
  return {}
}

function nowTime() {
  const d = new Date()
  return d.toTimeString().split(' ')[0]
}

/* ---------- Masking (仅针对 IP / 位置 / 入口 / 落地IP) ---------- */

function maskIPIfNeeded(ip, need) {
  if (!ip) return '-'
  if (!need) return ip
  return isIPv4(ip)
    ? ip.split('.').slice(0,2).concat(['*','*']).join('.')
    : ip.split(':').slice(0,4).concat(['*','*','*','*']).join(':')
}

function maskLocIfNeeded(loc, need) {
  if (!loc) return ''
  if (!need) return loc
  // 保留前缀国旗与第一个词，其余用 *
  const flagRe = /^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u
  const flag = (loc.match(flagRe) || [''])[0]
  const rest = loc.replace(flagRe, '').trim()
  const parts = rest.split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return flag + '*'
  return flag + parts[0] + ' *'
}

function buildEntranceLines(e = {}, needMask = true) {
  if (!e.ip && !e.loc1 && !e.loc2) return []
  const L = []
  if (e.ip)  L.push(`入口: ${maskIPIfNeeded(e.ip, needMask)}`)
  if (e.loc1) L.push(`位置¹: ${maskLocIfNeeded(e.loc1, needMask)}`)
  if (e.isp1) L.push(`运营商¹: ${e.isp1}`)
  if (e.loc2) L.push(`位置²: ${maskLocIfNeeded(e.loc2, needMask)}`)
  if (e.isp2) L.push(`运营商²: ${e.isp2}`)
  return L
}

/* ---------- Simple HTTP ---------- */

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    $httpClient.get({ url, headers }, (err, resp, body) => {
      if (err) return reject(err)
      resolve({ status: resp?.status || resp?.statusCode, body })
    })
  })
}

/* ---------- Providers: Direct (CN) ---------- */

async function getDirectInfoV4(provider = 'ipip') {
  // 统一返回 { ip, loc, isp }
  try {
    if (provider === 'cip')   return await _direct_cip()
    if (provider === '163')   return await _direct_163()
    if (provider === 'bilibili') return await _direct_bili()
    if (provider === '126')   return await _direct_126()
    if (provider === 'pingan')return await _direct_pingan()
    // default
    return await _direct_ipip()
  } catch (_) {
    // 逐级兜底
    try { return await _direct_ipip() } catch(e){}
    try { return await _direct_cip() } catch(e){}
    try { return await _direct_163() } catch(e){}
    try { return await _direct_bili() } catch(e){}
    try { return await _direct_126() } catch(e){}
    try { return await _direct_pingan() } catch(e){}
    return {}
  }
}

async function _direct_ipip() {
  const r = await httpGet('https://myip.ipip.net/json')
  const j = JSON.parse(r.body)
  const country = j?.data?.location?.[0] || ''
  const province= j?.data?.location?.[1] || ''
  const city    = j?.data?.location?.[2] || ''
  const isp     = j?.data?.location?.[4] || ''
  const flag    = flagOf(country)
  return {
    ip: j?.data?.ip || '',
    loc: [flag, country, province, city].filter(Boolean).join(' ').replace(/\s*中国\s*/g,''),
    isp: isp || ''
  }
}
async function _direct_cip() {
  const r = await httpGet('http://cip.cc/')
  const body = String(r.body || '')
  const ip  = (body.match(/IP.*?:\s*(\S+)/) || [])[1] || ''
  const addr= (body.match(/地址.*?:\s*(.+)/) || [])[1] || ''
  const isp = (body.match(/运营商.*?:\s*(.+)/) || [])[1] || ''
  const isCN= /中国/.test(addr)
  const flag= flagOf(isCN? '中国' : '')
  return {
    ip,
    loc: [flag, addr.replace(/中国\s*/,'')].filter(Boolean).join(' '),
    isp: isp.replace(/中国\s*/,'')
  }
}
async function _direct_163() {
  const r = await httpGet('https://dashi.163.com/fgw/mailsrv-ipdetail/detail')
  const j = JSON.parse(r.body)
  const d = j?.result || {}
  const flag = flagOf(d.countryCode)
  return {
    ip: d.ip || '',
    loc: [flag, d.country, d.province, d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''),
    isp: d.isp || d.org || ''
  }
}
async function _direct_bili() {
  const r = await httpGet('https://api.bilibili.com/x/web-interface/zone')
  const j = JSON.parse(r.body)
  const d = j?.data || {}
  const flag = flagOf(d.country === '中国' ? 'CN' : d.country)
  return {
    ip: d.addr || '',
    loc: [flag, d.country, d.province, d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''),
    isp: d.isp || ''
  }
}
async function _direct_126() {
  const r = await httpGet('https://ipservice.ws.126.net/locate/api/getLocByIp')
  const j = JSON.parse(r.body)
  const d = j?.result || {}
  const flag = flagOf(d.countrySymbol)
  return {
    ip: d.ip || '',
    loc: [flag, d.country, d.province, d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''),
    isp: d.operator || ''
  }
}
async function _direct_pingan() {
  const r = await httpGet('https://rmb.pingan.com.cn/itam/mas/linden/ip/request')
  const j = JSON.parse(r.body)
  const d = j?.data || {}
  const flag = flagOf(d.countryIsoCode)
  return {
    ip: d.ip || '',
    loc: [flag, d.country, d.region, d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''),
    isp: d.isp || ''
  }
}

/* ---------- Providers: Landing (Proxy) ---------- */

async function getLandingInfoV4(provider = 'ipapi') {
  try {
    if (provider === 'ipwhois') return await _landing_ipwhois()
    if (provider === 'ipsb')    return await _landing_ipsb()
    return await _landing_ipapi()
  } catch (_) {
    try { return await _landing_ipapi() } catch(e){}
    try { return await _landing_ipwhois() } catch(e){}
    try { return await _landing_ipsb() } catch(e){}
    return {}
  }
}

async function _landing_ipapi() {
  const r = await httpGet('http://ip-api.com/json?lang=zh-CN')
  const j = JSON.parse(r.body)
  const flag = flagOf(j.countryCode)
  return {
    ip: j.query || '',
    loc: [flag, j.country?.replace(/\s*中国\s*/,''), j.regionName?.split(/\s+or\s+/)[0], j.city].filter(Boolean).join(' '),
    isp: j.isp || j.org || j.as || ''
  }
}
async function _landing_ipwhois() {
  const r = await httpGet('https://ipwhois.app/widget.php?lang=zh-CN')
  const j = JSON.parse(r.body)
  const flag = flagOf(j.country_code)
  return {
    ip: j.ip || '',
    loc: [flag, j.country?.replace(/\s*中国\s*/,''), j.region, j.city].filter(Boolean).join(' '),
    isp: j?.connection?.isp || ''
  }
}
async function _landing_ipsb() {
  const r = await httpGet('https://api-ipv4.ip.sb/geoip')
  const j = JSON.parse(r.body)
  const flag = flagOf(j.country_code)
  return {
    ip: j.ip || '',
    loc: [flag, j.country, j.region, j.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''),
    isp: j.isp || j.organization || ''
  }
}

/* ---------- IPv6 (简易) ---------- */

async function getIPv6Direct() {
  try {
    const r = await httpGet('https://ipv6.ddnspod.com')
    return { ip: String(r.body || '').trim() }
  } catch (_) { return {} }
}
async function getIPv6Landing() {
  try {
    const r = await httpGet('https://api-ipv6.ip.sb/ip')
    return { ip: String(r.body || '').trim() }
  } catch (_) { return {} }
}

/* ---------- Recent Requests → Policy & Entrance ---------- */

function httpAPI(path = '/v1/requests/recent') {
  return new Promise(resolve => { $httpAPI('GET', path, null, resolve) })
}

async function getPolicyAndEntrance() {
  try {
    const data = await httpAPI('/v1/requests/recent')
    const requests = Array.isArray(data?.requests) ? data.requests : []
    // 选择我们可能调用过的 IP 查询域名
    const re = /(ip-api\.com|ipwhois\.app|ip\.sb|ipinfo\.io)/
    const hit = requests.slice(0, 15).find(i => re.test(i.URL))
    if (!hit) return {}
    const policyName = hit.policyName || ''
    let entranceIP = ''
    if (/\(Proxy\)/.test(hit.remoteAddress)) {
      entranceIP = hit.remoteAddress.replace(/\s*\(Proxy\)\s*/, '')
    }
    return { policyName, entranceIP }
  } catch (_) { return {} }
}

/* ---------- Lookup by IP for Entrance (Direct/Landing) ---------- */

async function queryLocByIP_Direct(ip, provider = 'ipip') {
  try {
    if (provider === 'cip') return await _loc_cip(ip)
    if (provider === '163') return await _loc_163(ip)
    if (provider === 'bilibili') return await _loc_bili(ip)
    if (provider === '126') return await _loc_126(ip)
    if (provider === 'pingan') return await _loc_pingan(ip)
    return await _loc_ipip(ip)
  } catch (_) { return {} }
}
async function queryLocByIP_Landing(ip, provider = 'ipapi') {
  try {
    if (provider === 'ipwhois') return await _loc_ipwhois(ip)
    if (provider === 'ipsb')    return await _loc_ipsb(ip)
    return await _loc_ipapi(ip)
  } catch (_) { return {} }
}

// —— Direct lookups (with ip param) ——
async function _loc_ipip(ip) {
  const r = await httpGet('https://myip.ipip.net/json')
  const j = JSON.parse(r.body)
  // ipip 不支持直接传 ip 查询，这里退化使用 ipwhois 以保证可用
  return await _loc_ipwhois(ip)
}
async function _loc_cip(ip) {
  const r = await httpGet(`http://cip.cc/${encodeURIComponent(ip)}`)
  const body = String(r.body || '')
  const addr= (body.match(/地址.*?:\s*(.+)/) || [])[1] || ''
  const isp = (body.match(/运营商.*?:\s*(.+)/) || [])[1] || ''
  const isCN= /中国/.test(addr)
  const flag= flagOf(isCN ? 'CN' : '')
  return { loc: [flag, addr.replace(/中国\s*/,'')].filter(Boolean).join(' '), isp: isp.replace(/中国\s*/,'') }
}
async function _loc_163(ip) {
  const r = await httpGet('https://dashi.163.com/fgw/mailsrv-ipdetail/detail')
  const j = JSON.parse(r.body)
  const d = j?.result || {}
  const flag = flagOf(d.countryCode)
  return { loc: [flag, d.country, d.province, d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp: d.isp || d.org || '' }
}
async function _loc_bili(ip) {
  // bilibili 无 ip 参数接口，改用 ipapi
  return await _loc_ipapi(ip)
}
async function _loc_126(ip) {
  // 126 无 ip 参数接口，改用 ipapi
  return await _loc_ipapi(ip)
}
async function _loc_pingan(ip) {
  const r = await httpGet('https://rmb.pingan.com.cn/itam/mas/linden/ip/request?ip=' + encodeURIComponent(ip))
  const j = JSON.parse(r.body)
  const d = j?.data || {}
  const flag = flagOf(d.countryIsoCode)
  return { loc: [flag, d.country, d.region, d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp: d.isp || '' }
}

// —— Landing lookups (with ip param) ——
async function _loc_ipapi(ip) {
  const r = await httpGet(`http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN`)
  const j = JSON.parse(r.body)
  const flag = flagOf(j.countryCode)
  return { loc: [flag, j.country?.replace(/\s*中国\s*/,''), j.regionName?.split(/\s+or\s+/)[0], j.city].filter(Boolean).join(' '), isp: j.isp || j.org || j.as || '' }
}
async function _loc_ipwhois(ip) {
  const r = await httpGet(`https://ipwhois.app/widget.php?lang=zh-CN&ip=${encodeURIComponent(ip)}`)
  const j = JSON.parse(r.body)
  const flag = flagOf(j.country_code)
  return { loc: [flag, j.country?.replace(/\s*中国\s*/,''), j.region, j.city].filter(Boolean).join(' '), isp: j?.connection?.isp || '' }
}
async function _loc_ipsb(ip) {
  const r = await httpGet(`https://api-ipv4.ip.sb/geoip/${encodeURIComponent(ip)}`)
  const j = JSON.parse(r.body)
  const flag = flagOf(j.country_code)
  return { loc: [flag, j.country, j.region, j.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp: j.isp || j.organization || '' }
}

/* ---------- Utils ---------- */

function flagOf(codeOrName) {
  // 输入可为 'CN' 或 '中国'
  let code = String(codeOrName || '').trim()
  if (!code) return ''
  if (/^中国$|^CN$/i.test(code)) code = 'CN'
  if (code.length !== 2) return '' // 非标准2字母代码，尽量不显示
  try {
    const up = code.toUpperCase()
    const pts = [...up].map(ch => 127397 + ch.charCodeAt())
    return String.fromCodePoint(...pts).replace(/🇹🇼/g, '🇼🇸') // 兼容你的旧习惯
  } catch (_) { return '' }
}

const IPV4 = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)(\.(?!$)|$)){4}$/
const IPV6 =
  /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/
function isIPv4(ip){ return IPV4.test(ip||'') }
function isIPv6(ip){ return IPV6.test(ip||'') }
function isIP(ip){ return isIPv4(ip)||isIPv6(ip) }
