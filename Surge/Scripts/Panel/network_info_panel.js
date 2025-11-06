// 功能：直连/入口/落地 IP 与位置；直连位置仅旗帜；入口/落地完整显示；中国境内 ISP 规范为“中国移动/联通/电信/广电”
// 图标：脚本接管（支持 $argument 传入 icon / icon-color）；支持台湾旗备用（FLAG_TWFALLBACK=1 用 🇼🇸 代替）
// 视觉：区块之间留一空行；“执行时间”之前不留空行；在“IP:” 上方新增一行网络类型（Wi-Fi | SSID / 蜂窝数据 | 代际-制式）

/* ===================== 参数解析 ===================== */
function parseArgs() {
  try {
    if (typeof $argument === 'string' && $argument) {
      const map = Object.fromEntries($argument.split('&').map(s => {
        const [k, ...rest] = s.split('=')
        return [decodeURIComponent(k), decodeURIComponent(rest.join('='))]
      }))
      return map
    }
  } catch (_) {}
  return {}
}
const ARG = parseArgs()
const getArg = (k, d='') => (ARG[k] ?? d)

/* —— 图标（脚本控制卡片系统图标） —— */
const ICON_NAME  = getArg('icon', 'globe.asia.australia') // 有效 SF Symbols，如：globe / globe.asia.australia / network ...
const ICON_COLOR = getArg('icon-color', '#1E90FF')        // #RRGGBB

/* —— 行为参数 —— */
const IPv6_ON          = getArg('IPv6', '0') === '1'               // 是否查询 IPv6
const MASK_IP          = getArg('MASK_IP', '1') === '1'            // IP 是否脱敏（v4 前两段保留；v6 保留前 4 段）
const FLAG_TWFALLBACK  = getArg('FLAG_TWFALLBACK', '0') === '1'    // 台湾旗不可用时用 🇼🇸
const DOMESTIC_IPv4    = getArg('DOMESTIC_IPv4', 'ipip')           // 直连 v4 源：ipip|cip|163|bilibili|126|pingan
const DOMESTIC_IPv6    = getArg('DOMESTIC_IPv6', 'ddnspod')        // 直连 v6 源：ddnspod|neu6
const LANDING_IPv4     = getArg('LANDING_IPv4', 'ipapi')           // 落地 v4 源：ipapi|ipwhois|ipsb
const LANDING_IPv6     = getArg('LANDING_IPv6', 'ipsb')            // 落地 v6 源：ipsb|ident|ipify

/* ===================== 主流程 ===================== */
;(async () => {
  // 直连
  const cn  = await getDirectV4(DOMESTIC_IPv4).catch(()=>({}))
  const cn6 = IPv6_ON ? await getDirectV6(DOMESTIC_IPv6).catch(()=>({})) : {}

  // 最近请求：策略名 & 入口 IP
  const { policyName, entranceIP } = await getPolicyAndEntrance().catch(()=>({}))

  // 入口：用两个来源补全（¹ 国内，² 国际）
  const ent = isIP(entranceIP || '') ? await getEntranceBundle(entranceIP).catch(()=>({ ip: entranceIP })) : {}

  // 落地
  const px  = await getLandingV4(LANDING_IPv4).catch(()=>({}))
  const px6 = IPv6_ON ? await getLandingV6(LANDING_IPv6).catch(()=>({})) : {}

  /* ===== 组装输出 ===== */
  const title = policyName ? `代理策略: ${policyName}` : `网络信息 𝕏`

  // —— 直连（位置仅旗帜；ISP 若在中国境内，规范化为“中国移动/联通/电信/广电”）
  const directLines = [
    lineIP('IP', cn.ip, cn6.ip),
    `位置: ${onlyFlag(cn.loc) || '-'}`
  ]
  if (cn.isp) directLines.push(`运营商: ${fmtISP(cn.isp, cn.loc)}`)

  // —— 入口（完整显示；¹ 国内源、² 国际源）
  const entranceLines = []
  if (ent && (ent.ip || ent.loc1 || ent.loc2)) {
    entranceLines.push(lineIP('入口', ent.ip, ''))
    if (ent.loc1) entranceLines.push(`位置¹: ${flagFirst(ent.loc1)}`)
    if (ent.isp1) entranceLines.push(`运营商¹: ${fmtISP(ent.isp1, ent.loc1)}`)
    if (ent.loc2) entranceLines.push(`位置²: ${flagFirst(ent.loc2)}`)
    if (ent.isp2) entranceLines.push(`运营商²: ${fmtISP(ent.isp2, ent.loc2)}`)
  }

  // —— 落地（完整显示）
  const landingLines = [
    lineIP('落地 IP', px.ip, px6.ip),
    px.loc ? `位置: ${flagFirst(px.loc)}` : undefined,
    px.isp ? `运营商: ${fmtISP(px.isp, px.loc)}` : undefined
  ].filter(Boolean)

  // —— 拼接文本（顶部增加“网络类型”行；区块间留一空行；执行时间前不留空行）
  const parts = []
  parts.push(netTypeLine())               // 仅新增这一行，其余保持不变
  parts.push(...directLines)
  if (entranceLines.length) parts.push('', ...entranceLines)
  if (landingLines.length)  parts.push('', ...landingLines)
  parts.push(`执行时间: ${now()}`)
  const content = parts.join('\n')

  $done({
    title,
    content,
    icon: ICON_NAME,
    'icon-color': ICON_COLOR
  })
})().catch(err => {
  $notification.post('网络信息 𝕏', '脚本错误', String(err))
  $done({
    title: '网络信息 𝕏',
    content: String(err),
    icon: ICON_NAME,
    'icon-color': ICON_COLOR
  })
})

/* ===================== 工具 & 渲染 ===================== */
function now(){ return new Date().toTimeString().split(' ')[0] }
function isIPv4(ip){ return /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)(\.(?!$)|$)){4}$/.test(ip||'') }
function isIPv6(ip){ return /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/.test(ip||'') }
function isIP(ip){ return isIPv4(ip)||isIPv6(ip) }

function maskIP(ip){
  if (!ip || !MASK_IP) return ip || ''
  if (isIPv4(ip)) {
    const p = ip.split('.'); return [p[0], p[1], '*', '*'].join('.')
  } else if (isIPv6(ip)) {
    const p = ip.split(':'); return [...p.slice(0,4), '*','*','*','*'].join(':')
  }
  return ip
}

function splitFlagRaw(s) {
  const re=/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u
  const m=String(s||'').match(re)
  let flag=m?m[0]:''
  let text=String(s||'').replace(re,'')
  if (FLAG_TWFALLBACK && flag.includes('🇹🇼')) flag = flag.replace('🇹🇼','🇼🇸')
  return { flag, text }
}
function onlyFlag(loc){ return splitFlagRaw(loc).flag }
function flagFirst(loc){ const {flag,text}=splitFlagRaw(loc); return (flag||'') + (text||'') }

function lineIP(label, ip4, ip6){
  const a = `${label}: ${maskIP(ip4) || '-'}`
  const b = ip6 ? `\n${maskIP(ip6)}` : ''
  return a + b
}

function flagOf(code){
  let cc = String(code || '').trim()
  if (!cc) return ''
  if (/^中国$|^CN$/i.test(cc)) cc = 'CN'
  if (cc.length !== 2 || !/^[A-Za-z]{2}$/.test(cc)) return ''
  try { return String.fromCodePoint(...[...cc.toUpperCase()].map(ch => 127397 + ch.charCodeAt())) } catch(_) { return '' }
}

/* —— 规范中国境内运营商名称 —— */
function fmtISP(isp, locStr){
  const s0 = String(isp || '').trim()
  if (!s0) return ''
  const isCN = /^🇨🇳/.test(String(locStr||'')) || /(^|\s)中国/.test(String(locStr||''))
  if (!isCN) return s0

  let s = s0.replace(/^中国\s*/,'').replace(/\s*\(中国\)\s*/,'').replace(/\s+/g,' ')
  if (/^(移动|CMCC|China Mobile.*)$/i.test(s)) return '中国移动'
  if (/^(联通|China Unicom.*)$/i.test(s))     return '中国联通'
  if (/^(电信|China Telecom.*)$/i.test(s))    return '中国电信'
  if (/^(广电|CBN|China Broadcasting.*)$/i.test(s)) return '中国广电'

  if (/^China\s*Mobile.*communications.*$/i.test(s)) return '中国移动'
  if (/^China\s*Telecom.*$/i.test(s)) return '中国电信'
  if (/^China\s*Unicom.*$/i.test(s))  return '中国联通'
  return '中国' + s
}

/* —— 网络类型行（Wi-Fi / 蜂窝 + 代际-制式） —— */
function radioToGen(r){
  const MAP = { GPRS:'2.5G', EDGE:'2.75G', CDMA1x:'2.5G', WCDMA:'3G', HSDPA:'3.5G', HSUPA:'3.75G',
    CDMAEVDORev0:'3.5G', CDMAEVDORevA:'3.5G', CDMAEVDORevB:'3.75G', eHRPD:'3.9G', LTE:'4G', NRNSA:'5G', NR:'5G' }
  return MAP[r] || ''
}
function netTypeLine(){
  try{
    const ssid = $network?.wifi?.ssid
    const radio = $network?.['cellular-data']?.radio
    if (ssid) return `Wi-Fi | ${ssid}`
    if (radio) {
      const g = radioToGen(radio)
      return `蜂窝数据 | ${g ? `${g} - ${radio}` : radio}`
    }
  }catch(_){}
  return '网络 | 未知'
}

/* ===================== HTTP 基础 ===================== */
function httpGet(url, headers={}){
  return new Promise((resolve,reject)=>{
    $httpClient.get({url,headers},(err,resp,body)=>{
      if (err) return reject(err)
      resolve({ status: resp?.status || resp?.statusCode, body })
    })
  })
}
function httpAPI(path='/v1/requests/recent'){
  return new Promise(res=>{ $httpAPI('GET', path, null, res) })
}

/* ===================== 数据源：直连/落地/入口 ===================== */
// —— 直连 v4
async function getDirectV4(p){
  try{
    if (p==='cip')      return await d_cip()
    if (p==='163')      return await d_163()
    if (p==='bilibili') return await d_bili()
    if (p==='126')      return await d_126()
    if (p==='pingan')   return await d_pingan()
    return await d_ipip()
  }catch(_){ try{return await d_ipip()}catch(e){} return {} }
}
async function d_ipip(){ const r=await httpGet('https://myip.ipip.net/json'); const j=JSON.parse(r.body||'{}'); const c0=j?.data?.location?.[0]; const flag=flagOf(c0==='中国'?'CN':c0); return { ip:j?.data?.ip||'', loc:[flag, j?.data?.location?.[0], j?.data?.location?.[1], j?.data?.location?.[2]].filter(Boolean).join(' ').replace(/\s*中国\s*/,'') , isp:j?.data?.location?.[4]||'' } }
async function d_cip(){ const r=await httpGet('http://cip.cc/'); const b=String(r.body||''); const ip=(b.match(/IP.*?:\s*(\S+)/)||[])[1]||''; const addr=(b.match(/地址.*?:\s*(.+)/)||[])[1]||''; const isp=(b.match(/运营商.*?:\s*(.+)/)||[])[1]||''; const isCN=/中国/.test(addr); return { ip, loc:[flagOf(isCN?'CN':''), addr.replace(/中国\s*/,'')].filter(Boolean).join(' '), isp:isp.replace(/中国\s*/,'') } }
async function d_163(){ const r=await httpGet('https://dashi.163.com/fgw/mailsrv-ipdetail/detail'); const d=(JSON.parse(r.body||'{}')||{}).result||{}; return { ip:d.ip||'', loc:[flagOf(d.countryCode), d.country,d.province,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||d.org||'' } }
async function d_bili(){ const r=await httpGet('https://api.bilibili.com/x/web-interface/zone'); const d=(JSON.parse(r.body||'{}')||{}).data||{}; const flag=flagOf(d.country==='中国'?'CN':d.country); return { ip:d.addr||'', loc:[flag,d.country,d.province,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||'' } }
async function d_126(){ const r=await httpGet('https://ipservice.ws.126.net/locate/api/getLocByIp'); const d=(JSON.parse(r.body||'{}')||{}).result||{}; return { ip:d.ip||'', loc:[flagOf(d.countrySymbol), d.country,d.province,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.operator||'' } }
async function d_pingan(){ const r=await httpGet('https://rmb.pingan.com.cn/itam/mas/linden/ip/request'); const d=(JSON.parse(r.body||'{}')||{}).data||{}; return { ip:d.ip||'', loc:[flagOf(d.countryIsoCode), d.country,d.region,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||'' } }

// —— 直连 v6
async function getDirectV6(p){
  try{
    if (p==='neu6'){ const r=await httpGet('https://speed.neu6.edu.cn/getIP.php'); return { ip:String(r.body||'').trim() } }
    const r=await httpGet('https://ipv6.ddnspod.com'); return { ip:String(r.body||'').trim() }
  }catch(_){ return {} }
}

// —— 落地 v4
async function getLandingV4(p){
  try{
    if (p==='ipwhois') return await l_whois()
    if (p==='ipsb')    return await l_ipsb()
    return await l_ipapi()
  }catch(_){ try{return await l_ipapi()}catch(e){} return {} }
}
async function l_ipapi(){ const r=await httpGet('http://ip-api.com/json?lang=zh-CN'); const j=JSON.parse(r.body||'{}'); return { ip:j.query||'', loc:[flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/,''), j.regionName?.split(/\s+or\s+/)[0], j.city].filter(Boolean).join(' '), isp:j.isp||j.org||j.as||'' } }
async function l_whois(){ const r=await httpGet('https://ipwhois.app/widget.php?lang=zh-CN'); const j=JSON.parse(r.body||'{}'); return { ip:j.ip||'',    loc:[flagOf(j.country_code), j.country?.replace(/\s*中国\s*/,''), j.region, j.city].filter(Boolean).join(' '), isp:j?.connection?.isp||'' } }
async function l_ipsb(){  const r=await httpGet('https://api-ipv4.ip.sb/geoip');            const j=JSON.parse(r.body||'{}'); return { ip:j.ip||'',     loc:[flagOf(j.country_code), j.country, j.region, j.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:j.isp||j.organization||'' } }

// —— 落地 v6
async function getLandingV6(p){
  try{
    if (p==='ident'){ const r=await httpGet('https://v6.ident.me'); return { ip:String(r.body||'').trim() } }
    if (p==='ipify'){ const r=await httpGet('https://api6.ipify.org'); return { ip:String(r.body||'').trim() } }
    const r=await httpGet('https://api-ipv6.ip.sb/ip'); return { ip:String(r.body||'').trim() }
  }catch(_){ return {} }
}

// —— 最近请求：策略名 & 入口 IP（Surge 内置接口）
async function getPolicyAndEntrance(){
  const data = await httpAPI('/v1/requests/recent')
  const reqs = Array.isArray(data?.requests) ? data.requests : []
  const hit  = reqs.slice(0, 20).find(i => /(ip-api\.com|ipwhois\.app|ip\.sb|ipinfo\.io)/.test(i.URL))
  if (!hit) return {}
  return {
    policyName: hit.policyName || '',
    entranceIP: /\(Proxy\)/.test(hit.remoteAddress) ? hit.remoteAddress.replace(/\s*\(Proxy\)\s*/,'') : ''
  }
}

// —— 入口位置：国内 & 国际 查询
async function getEntranceBundle(ip){
  const a = await loc_pingan(ip).catch(()=>({}))
  const b = await loc_ipapi(ip).catch(()=>({}))
  return { ip, loc1: a.loc || '', isp1: a.isp || '', loc2: b.loc || '', isp2: b.isp || '' }
}
async function loc_pingan(ip){ const r=await httpGet('https://rmb.pingan.com.cn/itam/mas/linden/ip/request?ip='+encodeURIComponent(ip)); const d=(JSON.parse(r.body||'{}')||{}).data||{}; return { loc:[flagOf(d.countryIsoCode), d.country,d.region,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||'' } }
async function loc_ipapi(ip){ const r=await httpGet(`http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN`); const j=JSON.parse(r.body||'{}'); return { loc:[flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/,''), j.regionName?.split(/\s+or\s+/)[0], j.city].filter(Boolean).join(' '), isp:j.isp||j.org||j.as||'' } }
