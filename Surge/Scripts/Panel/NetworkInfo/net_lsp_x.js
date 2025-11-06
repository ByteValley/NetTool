// == Network Info Panel ==
// 版式：直连 → 空行 → 入口 → 空行 → 落地 → 执行时间
// 脱敏：仅对“位置”中的中文字符做替换（入口/落地），直连位置仅保留国旗；IP 如需脱敏可打开 MASK_IP。
// 旗帜：默认保留台湾旗；若设置 FLAG_TWFALLBACK=1，将 🇹🇼 替换为 🇼🇸。

;(async () => {
  const A = readArg()
  const SHOW_IPV6 = isOn(A.IPv6, 0)
  const MASK_POS  = isOn(A.MASK_POS, 1)   // 入口/落地位置中文脱敏
  const MASK_IP   = isOn(A.MASK_IP, 1)    // IP 脱敏（v4 保留前两段；v6 保留前四段）
  const DOMESTIC  = (A.DOMESTIC_IPv4 || 'ipip').toLowerCase()
  const LANDING   = (A.LANDING_IPv4  || 'ipapi').toLowerCase()
  const TWFALL    = isOn(A.FLAG_TWFALLBACK, 0)

  // 1) 直连（第一块：位置仅保留国旗）
  const cn  = await getDirectInfoV4(DOMESTIC)
  const cn6 = SHOW_IPV6 ? await getIPv6Direct() : {}

  // 2) 落地（第三块）
  const px  = await getLandingInfoV4(LANDING)
  const px6 = SHOW_IPV6 ? await getIPv6Landing() : {}

  // 3) 策略与入口
  const { policyName, entranceIP } = await getPolicyAndEntrance()
  let ent = {}
  if (entranceIP && isIP(entranceIP)) {
    const e1 = await queryLocByIP_Direct(entranceIP, DOMESTIC)
    const e2 = await queryLocByIP_Landing(entranceIP, LANDING)
    ent = { ip: entranceIP, loc1: e1.loc, isp1: e1.isp, loc2: e2.loc, isp2: e2.isp }
  }

  // ===== 标题 =====
  const title = policyName ? `代理策略: ${policyName}` : '网络信息 𝕏'

  // ===== 直连块（位置仅保留旗帜） =====
  const cnIPLine  = lineIP('IP', cn.ip, cn6.ip, MASK_IP)
  const cnLocFlag = onlyFlag(cn.loc, TWFALL) || '-'    // 只要旗帜
  const cnLocLine = `位置: ${cnLocFlag}`
  const cnIspLine = cn.isp ? `运营商: ${cn.isp}` : ''

  // ===== 入口块（位置中文脱敏） =====
  const entLines = []
  if (ent.ip)  entLines.push(lineIP('入口', ent.ip, '', MASK_IP))
  if (ent.loc1) entLines.push(`位置¹: ${maskZhKeep(flagFirst(ent.loc1, TWFALL), MASK_POS)}`)
  if (ent.isp1) entLines.push(`运营商¹: ${ent.isp1}`)
  if (ent.loc2) entLines.push(`位置²: ${maskZhKeep(flagFirst(ent.loc2, TWFALL), MASK_POS)}`)
  if (ent.isp2) entLines.push(`运营商²: ${ent.isp2}`)

  // ===== 落地块（位置中文脱敏） =====
  const pxIPLine  = lineIP('落地 IP', px.ip, px6.ip, MASK_IP)
  const pxLocLine = px.loc ? `位置: ${maskZhKeep(flagFirst(px.loc, TWFALL), MASK_POS)}` : ''
  const pxIspLine = px.isp ? `运营商: ${px.isp}` : ''

  // ===== 组装（强制留白换行） =====
  const parts = [
    cnIPLine,
    cnLocLine,
    cnIspLine,
    '',                // 空行 ①
    ...entLines,
    entLines.length ? '' : null,  // 空行 ②（仅当有入口时）
    pxIPLine,
    pxLocLine,
    pxIspLine,
    '',                // 空行 ③
    `执行时间: ${now()}`
  ].filter(v => v !== null)

  const content = parts.join('\n')

  return $done({ title, content })
})().catch(e => {
  $notification.post('网络信息 𝕏', '脚本错误', String(e))
  $done({ title: '网络信息 𝕏', content: String(e) })
})

/* ================= 工具函数 ================= */

function readArg(){
  try{
    if (typeof $argument === 'string' && $argument) {
      const kv = Object.fromEntries($argument.split('&').map(s=>s.split('=')))
      return kv
    }
  }catch(_){}
  return {}
}
function isOn(v, def=0){ return String(v ?? def) === '1' }
function now(){ return new Date().toTimeString().split(' ')[0] }

// —— 只保留国旗（若无则返回空串）
function onlyFlag(loc, twFallback){
  const { flag } = splitFlag(loc || '', twFallback)
  return flag
}

// —— “国旗 + 文本”，仅中文做脱敏
function maskZhKeep(loc, needMask){
  const { flag, text } = splitFlag(loc || '')
  if (!text) return flag
  if (!needMask) return flag + text
  // 仅替换中文字符，保留空格/数字/字母/标点
  const zhRe = /[\u3400-\u9FFF\uF900-\uFAFF]/g
  const masked = text.replace(zhRe, '＊')
  return flag + masked
}

// —— 提取国旗与后续文本；台湾旗可选替换为备用旗
function splitFlag(s, twFallback=false){
  const flagRe = /^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u
  const m = s.match(flagRe)
  let flag = m ? m[0] : ''
  let text = s.replace(flagRe, '')
  // 台湾旗控制（默认保留 🇹🇼；仅 twFallback==true 时替换）
  if (twFallback && flag.includes('🇹🇼')) flag = flag.replace('🇹🇼','🇼🇸')
  return { flag, text }
}

// —— IP 行
function lineIP(label, ip4, ip6, needMask){
  const a = ipLine(label, ip4, needMask)
  const b = ip6 ? `\n${maskIP(ip6, needMask)}` : ''
  return a + b
}
function ipLine(label, ip, needMask){
  const v = maskIP(ip, needMask) || '-'
  return `${label}: ${v}`
}
function maskIP(ip, need){
  if (!ip) return ''
  if (!need) return ip
  return isIPv4(ip)
    ? ip.split('.').slice(0,2).concat(['*','*']).join('.')
    : ip.split(':').slice(0,4).concat(['*','*','*','*']).join(':')
}
const IPV4=/^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)(\.(?!$)|$)){4}$/; const IPV6=/^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
function isIPv4(ip){return IPV4.test(ip||'')} function isIPv6(ip){return IPV6.test(ip||'')} function isIP(ip){return isIPv4(ip)||isIPv6(ip)}

// —— HTTP
function httpGet(url, headers = {}){
  return new Promise((resolve, reject) => {
    $httpClient.get({ url, headers }, (err, resp, body) => {
      if (err) return reject(err)
      resolve({ status: resp?.status || resp?.statusCode, body })
    })
  })
}

// —— 直连信息（V4）
async function getDirectInfoV4(p='ipip'){
  try{
    if (p==='cip') return await _d_cip()
    if (p==='163') return await _d_163()
    if (p==='bilibili') return await _d_bili()
    if (p==='126') return await _d_126()
    if (p==='pingan') return await _d_pingan()
    return await _d_ipip()
  }catch(_){
    try{return await _d_ipip()}catch(e){}
    try{return await _d_cip()}catch(e){}
    try{return await _d_163()}catch(e){}
    try{return await _d_bili()}catch(e){}
    try{return await _d_126()}catch(e){}
    try{return await _d_pingan()}catch(e){}
    return {}
  }
}
async function _d_ipip(){
  const r = await httpGet('https://myip.ipip.net/json')
  const j = JSON.parse(r.body||'{}')
  const loc = [flagOf(j?.data?.location?.[0]), j?.data?.location?.[0], j?.data?.location?.[1], j?.data?.location?.[2]]
               .filter(Boolean).join(' ').replace(/\s*中国\s*/g,'')
  return { ip:j?.data?.ip||'', loc, isp:j?.data?.location?.[4]||'' }
}
async function _d_cip(){
  const r = await httpGet('http://cip.cc/')
  const b = String(r.body||'')
  const ip  = (b.match(/IP.*?:\s*(\S+)/)||[])[1]||''
  const addr= (b.match(/地址.*?:\s*(.+)/)||[])[1]||''
  const isp = (b.match(/运营商.*?:\s*(.+)/)||[])[1]||''
  const isCN = /中国/.test(addr)
  return { ip, loc:[flagOf(isCN?'CN':''), addr.replace(/中国\s*/,'')].filter(Boolean).join(' '), isp:isp.replace(/中国\s*/,'') }
}
async function _d_163(){
  const r = await httpGet('https://dashi.163.com/fgw/mailsrv-ipdetail/detail')
  const d = (JSON.parse(r.body||'{}')||{}).result||{}
  return { ip:d.ip||'', loc:[flagOf(d.countryCode), d.country, d.province, d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||d.org||'' }
}
async function _d_bili(){
  const r = await httpGet('https://api.bilibili.com/x/web-interface/zone')
  const d = (JSON.parse(r.body||'{}')||{}).data||{}
  const flag = flagOf(d.country==='中国'?'CN':d.country)
  return { ip:d.addr||'', loc:[flag, d.country, d.province, d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||'' }
}
async function _d_126(){
  const r = await httpGet('https://ipservice.ws.126.net/locate/api/getLocByIp')
  const d = (JSON.parse(r.body||'{}')||{}).result||{}
  return { ip:d.ip||'', loc:[flagOf(d.countrySymbol), d.country, d.province, d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.operator||'' }
}
async function _d_pingan(){
  const r = await httpGet('https://rmb.pingan.com.cn/itam/mas/linden/ip/request')
  const d = (JSON.parse(r.body||'{}')||{}).data||{}
  return { ip:d.ip||'', loc:[flagOf(d.countryIsoCode), d.country, d.region, d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||'' }
}

// —— 落地信息（V4）
async function getLandingInfoV4(p='ipapi'){
  try{
    if (p==='ipwhois') return await _l_whois()
    if (p==='ipsb')    return await _l_ipsb()
    return await _l_ipapi()
  }catch(_){
    try{return await _l_ipapi()}catch(e){}
    try{return await _l_whois()}catch(e){}
    try{return await _l_ipsb()}catch(e){}
    return {}
  }
}
async function _l_ipapi(){
  const r = await httpGet('http://ip-api.com/json?lang=zh-CN')
  const j = JSON.parse(r.body||'{}')
  return { ip:j.query||'', loc:[flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/,''), j.regionName?.split(/\s+or\s+/)[0], j.city].filter(Boolean).join(' '), isp:j.isp||j.org||j.as||'' }
}
async function _l_whois(){
  const r = await httpGet('https://ipwhois.app/widget.php?lang=zh-CN')
  const j = JSON.parse(r.body||'{}')
  return { ip:j.ip||'', loc:[flagOf(j.country_code), j.country?.replace(/\s*中国\s*/,''), j.region, j.city].filter(Boolean).join(' '), isp:j?.connection?.isp||'' }
}
async function _l_ipsb(){
  const r = await httpGet('https://api-ipv4.ip.sb/geoip')
  const j = JSON.parse(r.body||'{}')
  return { ip:j.ip||'', loc:[flagOf(j.country_code), j.country, j.region, j.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:j.isp||j.organization||'' }
}

// —— IPv6
async function getIPv6Direct(){ try{ const r=await httpGet('https://ipv6.ddnspod.com'); return { ip:String(r.body||'').trim() } }catch(_){ return {} } }
async function getIPv6Landing(){ try{ const r=await httpGet('https://api-ipv6.ip.sb/ip');  return { ip:String(r.body||'').trim() } }catch(_){ return {} } }

// —— 最近请求获取策略 & 入口
function httpAPI(p='/v1/requests/recent'){ return new Promise(res=>{ $httpAPI('GET', p, null, res) }) }
async function getPolicyAndEntrance(){
  try{
    const data = await httpAPI('/v1/requests/recent')
    const reqs = Array.isArray(data?.requests)?data.requests:[]
    const re = /(ip-api\.com|ipwhois\.app|ip\.sb|ipinfo\.io)/
    const hit = reqs.slice(0,15).find(i=>re.test(i.URL))
    if (!hit) return {}
    const policyName = hit.policyName || ''
    let entranceIP = ''
    if (/\(Proxy\)/.test(hit.remoteAddress)) entranceIP = hit.remoteAddress.replace(/\s*\(Proxy\)\s*/,'')
    return { policyName, entranceIP }
  }catch(_){ return {} }
}

// —— 指定 IP 查位置（直连/落地）
async function queryLocByIP_Direct(ip, p='ipip'){
  try{
    if (p==='cip') return await _loc_cip(ip)
    if (p==='163') return await _loc_163(ip)
    if (p==='bilibili') return await _loc_bili(ip)
    if (p==='126') return await _loc_126(ip)
    if (p==='pingan') return await _loc_pingan(ip)
    return await _loc_ipwhois(ip) // ipip 没有直查接口，统一走 whois
  }catch(_){ return {} }
}
async function queryLocByIP_Landing(ip, p='ipapi'){
  try{
    if (p==='ipwhois') return await _loc_ipwhois(ip)
    if (p==='ipsb')    return await _loc_ipsb(ip)
    return await _loc_ipapi(ip)
  }catch(_){ return {} }
}
async function _loc_cip(ip){
  const r=await httpGet(`http://cip.cc/${encodeURIComponent(ip)}`); const b=String(r.body||'')
  const addr=(b.match(/地址.*?:\s*(.+)/)||[])[1]||''; const isp=(b.match(/运营商.*?:\s*(.+)/)||[])[1]||''
  const isCN=/中国/.test(addr)
  return { loc:[flagOf(isCN?'CN':''), addr.replace(/中国\s*/,'')].filter(Boolean).join(' '), isp:isp.replace(/中国\s*/,'') }
}
async function _loc_163(ip){
  const r=await httpGet('https://dashi.163.com/fgw/mailsrv-ipdetail/detail'); const d=(JSON.parse(r.body||'{}')||{}).result||{}
  return { loc:[flagOf(d.countryCode), d.country, d.province, d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||d.org||'' }
}
async function _loc_bili(ip){ return await _loc_ipapi(ip) }
async function _loc_126(ip){ return await _loc_ipapi(ip) }
async function _loc_pingan(ip){
  const r=await httpGet('https://rmb.pingan.com.cn/itam/mas/linden/ip/request?ip='+encodeURIComponent(ip))
  const d=(JSON.parse(r.body||'{}')||{}).data||{}
  return { loc:[flagOf(d.countryIsoCode), d.country, d.region, d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||'' }
}
async function _loc_ipapi(ip){
  const r=await httpGet(`http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN`); const j=JSON.parse(r.body||'{}')
  return { loc:[flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/,''), j.regionName?.split(/\s+or\s+/)[0], j.city].filter(Boolean).join(' '), isp:j.isp||j.org||j.as||'' }
}
async function _loc_ipwhois(ip){
  const r=await httpGet(`https://ipwhois.app/widget.php?lang=zh-CN&ip=${encodeURIComponent(ip)}`); const j=JSON.parse(r.body||'{}')
  return { loc:[flagOf(j.country_code), j.country?.replace(/\s*中国\s*/,''), j.region, j.city].filter(Boolean).join(' '), isp:j?.connection?.isp||'' }
}
async function _loc_ipsb(ip){
  const r=await httpGet(`https://api-ipv4.ip.sb/geoip/${encodeURIComponent(ip)}`); const j=JSON.parse(r.body||'{}')
  return { loc:[flagOf(j.country_code), j.country, j.region, j.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:j.isp||j.organization||'' }
}

// —— 旗帜（默认保留台湾旗；仅在 FLAG_TWFALLBACK=1 时替换）
function flagOf(codeOrName){
  let code = String(codeOrName || '').trim()
  if (!code) return ''
  if (/^中国$|^CN$/i.test(code)) code = 'CN'
  if (code.length !== 2 && !/^[A-Z]{2}$/i.test(code)) return ''
  try{
    const up = code.toUpperCase()
    const pts = [...up].map(ch => 127397 + ch.charCodeAt())
    return String.fromCodePoint(...pts)  // 不强制替换 🇹🇼
  }catch(_){ return '' }
}
