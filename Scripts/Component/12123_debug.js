// 交管 12123 · Surge 触发调试脚本

if (typeof $request === "undefined") {
  console.log("不是 http-request 环境，直接退出")
  $done({})
} else {
  const url = $request.url
  const body = $request.body

  console.log("【12123 调试】命中一条请求：")
  console.log("URL:", url)
  console.log("Body:", body)

  $notification.post(
    "交管12123 调试",
    "命中一条请求",
    url
  )

  $done({})
}
