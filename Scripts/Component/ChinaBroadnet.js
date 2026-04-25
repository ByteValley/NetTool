/*
获取方式：
1. 启用本模块/插件/重写，并打开 MITM：wx.10099.com.cn
2. 打开【中国广电 10099】微信小程序
3. 进入套餐/余量相关页面，触发 qryUserInfo 接口
4. 脚本会自动写入 BoxJS：
   ComponentService.ChinaBroadnet.Settings.Session
   ComponentService.ChinaBroadnet.Settings.Access
   ComponentService.ChinaBroadnet.Settings.BodyData

===================
【MITM】
hostname = wx.10099.com.cn
*/

const API_NAME = "ComponentService.ChinaBroadnet"
const ROOT_KEY = "#ComponentService"

if (typeof $request !== "undefined") capture()
else done()

function getHeader(headers, name) {
  const lower = String(name).toLowerCase()
  for (const key of Object.keys(headers || {})) {
    if (String(key).toLowerCase() === lower) return headers[key]
  }
  return ""
}

function readRoot() {
  try {
    const raw = read(ROOT_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeRoot(root) {
  write(JSON.stringify(root), ROOT_KEY)
}

function parseBodyData(body) {
  if (!body) return ""
  if (typeof body === "object") return String(body.data || "")

  const text = String(body)
  try {
    const json = JSON.parse(text)
    return String(json?.data || "")
  } catch { }

  const match = text.match(/"data"\s*:\s*"([^"]+)"/)
  return match ? match[1] : ""
}

function capture() {
  const headers = $request.headers || {}
  const session = String(getHeader(headers, "Session") || "").trim()
  const access = String(getHeader(headers, "Access") || "").trim()
  const bodyData = parseBodyData($request.body).trim()

  if (session && access && bodyData) {
    const root = readRoot()
    if (!root.ChinaBroadnet) root.ChinaBroadnet = {}
    if (!root.ChinaBroadnet.Settings) root.ChinaBroadnet.Settings = {}

    root.ChinaBroadnet.Settings.Session = session
    root.ChinaBroadnet.Settings.Access = access
    root.ChinaBroadnet.Settings.BodyData = bodyData

    writeRoot(root)
    notify("中国广电", "凭证写入成功", "ComponentService.ChinaBroadnet.Settings")
  } else {
    notify(
      "中国广电",
      "未检测到完整凭证",
      `Session=${session ? "Y" : "N"} Access=${access ? "Y" : "N"} data=${bodyData ? "Y" : "N"}`,
    )
  }

  done()
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
  console.log(`${title} ${subtitle} ${message}`)
}

function done(value = {}) {
  if (typeof $done !== "undefined") $done(value)
}
