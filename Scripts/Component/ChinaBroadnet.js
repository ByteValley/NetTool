/* =====================================================================
 * 中国广电组件服务
 *
 * 模块分类 · 用途说明
 * - 抓取中国广电 10099 微信小程序 qryUserInfo 接口凭证
 * - 写入 BoxJS：ComponentService.ChinaBroadnet.Settings
 * - 供 Scripting / 小组件读取 Access 与 BodyData 使用
 *
 * 模块分类 · 抓取方式
 * - 启用模块/插件/重写并开启 MITM：wx.10099.com.cn
 * - 打开「中国广电 10099」微信小程序
 * - 进入首页 / 套餐 / 余量页面，触发 qryUserInfo 接口
 *
 * 模块分类 · 写入字段
 * - Session：请求头 Session，可选
 * - Access：请求头 access / Access，必需
 * - BodyData：请求体 JSON 中的 data 字段，必需
 * ===================================================================== */

const API_NAME = "ComponentService.ChinaBroadnet"
const ROOT_KEY = "#ComponentService"

if (typeof $request !== "undefined") capture()
else done()

function capture() {
  const headers = $request.headers || {}
  const session = String(getHeader(headers, "Session") || "").trim()
  const access = String(getHeader(headers, "access") || "").trim()
  const bodyData = String(parseBodyData($request.body) || "").trim()

  log(`抓取结果 | Session=${session ? "Y" : "N/可选"} | Access=${access ? "Y" : "N"} | data=${bodyData ? "Y" : "N"}`)

  if (!access || !bodyData) {
    notify(
      "中国广电",
      "未检测到完整凭证",
      `Access=${access ? "Y" : "N"} data=${bodyData ? "Y" : "N"} Session=${session ? "Y" : "N/可选"}`,
    )
    done()
    return
  }

  const root = readRoot()
  if (!root.ChinaBroadnet) root.ChinaBroadnet = {}
  if (!root.ChinaBroadnet.Settings) root.ChinaBroadnet.Settings = {}

  root.ChinaBroadnet.Settings.Session = session
  root.ChinaBroadnet.Settings.Access = access
  root.ChinaBroadnet.Settings.BodyData = bodyData
  root.ChinaBroadnet.Settings.UpdatedAt = new Date().toISOString()

  const ok = writeRoot(root)
  if (ok) {
    notify(
      "中国广电",
      "凭证写入成功",
      `Access=Y data=Y Session=${session ? "Y" : "N/可选"}`,
    )
  } else {
    notify(
      "中国广电",
      "凭证写入失败",
      "请检查持久化存储或 BoxJS 配置",
    )
  }

  done()
}

function getHeader(headers, name) {
  const target = String(name || "").toLowerCase()
  for (const key of Object.keys(headers || {})) {
    if (String(key).toLowerCase() === target) return headers[key]
  }
  return ""
}

function parseBodyData(body) {
  if (!body) return ""
  if (typeof body === "object") return String(body.data || "")

  const text = String(body || "")

  try {
    const json = JSON.parse(text)
    return String(json?.data || "")
  } catch { }

  try {
    const decoded = decodeURIComponent(text)
    const json = JSON.parse(decoded)
    return String(json?.data || "")
  } catch { }

  const jsonMatch = text.match(/"data"\s*:\s*"([^"]+)"/)
  if (jsonMatch) return jsonMatch[1]

  const formMatch = text.match(/(?:^|&)data=([^&]+)/)
  if (formMatch) {
    try {
      return decodeURIComponent(formMatch[1])
    } catch {
      return formMatch[1]
    }
  }

  return ""
}

function readRoot() {
  try {
    const raw = read(ROOT_KEY)
    if (!raw) return {}
    return typeof raw === "string" ? JSON.parse(raw) : raw
  } catch (e) {
    log(`读取 BoxJS 根配置失败：${err(e)}`)
    return {}
  }
}

function writeRoot(root) {
  try {
    return write(JSON.stringify(root), ROOT_KEY)
  } catch (e) {
    log(`写入 BoxJS 根配置失败：${err(e)}`)
    return false
  }
}

function read(key) {
  if (typeof $prefs !== "undefined") return $prefs.valueForKey(key)
  if (typeof $persistentStore !== "undefined") return $persistentStore.read(key)
  return null
}

function write(value, key) {
  if (typeof $prefs !== "undefined") return $prefs.setValueForKey(value, key)
  if (typeof $persistentStore !== "undefined") return $persistentStore.write(value, key)
  return false
}

function notify(title, subtitle, message) {
  if (typeof $notify !== "undefined") return $notify(title, subtitle, message)
  if (typeof $notification !== "undefined") return $notification.post(title, subtitle, message)
  console.log(`${title} | ${subtitle} | ${message}`)
}

function log(message) {
  console.log(`[${API_NAME}] ${message}`)
}

function err(e) {
  return e?.message || String(e)
}

function done(value = {}) {
  if (typeof $done !== "undefined") $done(value)
}
