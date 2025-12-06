{
  "id": "ByteValley.DataCollection",
  "name": "数据采集",
  "author": "@ByteValley",
  "description": "各类数据采集脚本（运营商、App Cookie 等）",
  "icon": "https://avatars.githubusercontent.com/u/100578089?v=4",
  "repo": "https://github.com/ByteValley/NetTool",
  "apps": [
    {
      "id": "DataCollection.ChinaUnicom",
      "name": "中国联通 · Cookie",
      "descs_html": [
        "用于保存中国联通 App 抓取到的 <code>Cookie</code>，供 Scriptable / 面板组件 / 其他脚本复用。",
        "<b>获取方式：</b><br/>1）打开 <b>中国联通 官方 App</b>；<br/>2）进入首页「流量查询」或其他会触发 <code>/smartwisdomCommon</code> 接口的页面；<br/>3）确保重写与脚本已启用，触发一次请求后，脚本会自动写入变量 <code>DataCollection.ChinaUnicome.Settings.Cookie</code>。",
        "<b>说明：</b><br/>• 本条仅存储 Cookie 完整字符串（包含 JSESSIONID 等），不拆分字段；<br/>• 推荐通过脚本自动抓取，手动填写仅用于调试或紧急情况。"
      ],
      "icons": [
        "https://raw.githubusercontent.com/lige47/QuanX-icon-rule/main/icon/Unicom.png",
        "https://raw.githubusercontent.com/lige47/QuanX-icon-rule/main/icon/Unicom.png"
      ],
      "keys": [
        "DataCollection"   // 🔴 这里改成真实存在的根 key
      ],
      "settings": [
        {
          "id": "DataCollection.ChinaUnicome.Settings.Cookie",  // 🔴 路径：根 key + 对象路径
          "name": "联通 Cookie（ChinaUnicom_cookie）",
          "type": "text",
          "val": "",
          "placeholder": "建议通过脚本自动抓取，无需手动填写",
          "desc": "脚本会自动写入完整的 Cookie 字符串。如需重置，可先清空此字段，再在联通 App 中重新触发抓取流程。"
        }
      ]
    }
  ]
}
