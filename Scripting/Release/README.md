# 📌 NetTool — 中国运营商话费/流量查询组件

> ✨ 基于 **Scripting App** 的电信运营商账户信息展示脚本  
> 支持中国移动 / 中国联通 / 中国电信 / 中国广电  
> 显示话费、流量、语音剩余等关键信息  
> 支持自定义样式、自动刷新、BoxJS 同步配置  
> iOS 主屏幕小组件一键查看剩余资源

---

## 🚀 一键导入脚本（建议从 Safari 打开）

| 运营商 | 一键导入 |
|-------|---------|
| 🇨🇳 中国移动 | [点我导入](https://bytevalley.github.io/NetTool/Scripting/Release/ChinaMobile/) |
| 🇨🇳 中国联通 | [点我导入](https://bytevalley.github.io/NetTool/Scripting/Release/ChinaUnicom/) |
| 🇨🇳 中国电信 | [点我导入](https://bytevalley.github.io/NetTool/Scripting/Release/ChinaTelecom/) |
| 🇨🇳 中国广电 | [点我导入](https://bytevalley.github.io/NetTool/Scripting/Release/ChinaBroadnet/) |
> 如脚本未自动启动，请确保已安装 Scripting App  
> App Store: https://apps.apple.com/tw/app/scripting/id6479691128

---

## 🧰 组件服务模块导入

> 用于自动抓取 Cookie / Token / Session 等配置，并写入 BoxJS，供小组件读取。

| 组件服务 | Surge | Loon | Quantumult X | Stash |
|---------|-------|------|--------------|-------|
| 中国移动 | [模块](https://raw.githubusercontent.com/ByteValley/NetTool/main/Surge/Module/Component/ChinaMobile.module) | [插件](https://raw.githubusercontent.com/ByteValley/NetTool/main/Loon/Plugin/Component/ChinaMobile.lpx) | [重写](https://raw.githubusercontent.com/ByteValley/NetTool/main/QuantumultX/Rewrite/Component/ChinaMobile.conf) | - |
| 中国联通 | [模块](https://raw.githubusercontent.com/ByteValley/NetTool/main/Surge/Module/Component/ChinaUnicom.module) | [插件](https://raw.githubusercontent.com/ByteValley/NetTool/main/Loon/Plugin/Component/ChinaUnicom.lpx) | [重写](https://raw.githubusercontent.com/ByteValley/NetTool/main/QuantumultX/Rewrite/Component/ChinaUnicom.conf) | - |
| 中国广电 | [模块](https://raw.githubusercontent.com/ByteValley/NetTool/main/Surge/Module/Component/ChinaBroadnet.module) | [插件](https://raw.githubusercontent.com/ByteValley/NetTool/main/Loon/Plugin/Component/ChinaBroadnet.lpx) | [重写](https://raw.githubusercontent.com/ByteValley/NetTool/main/QuantumultX/Rewrite/Component/ChinaBroadnet.conf) | [覆写](https://raw.githubusercontent.com/ByteValley/NetTool/main/Stash/Stoverride/Component/ChinaBroadnet.stoverride) |
| 交管12123 | [模块](https://raw.githubusercontent.com/ByteValley/NetTool/main/Surge/Module/Component/12123.module) | [插件](https://raw.githubusercontent.com/ByteValley/NetTool/main/Loon/Plugin/Component/12123.lpx) | [重写](https://raw.githubusercontent.com/ByteValley/NetTool/main/QuantumultX/Rewrite/Component/12123.conf) | - |
| 网上国网 | [模块](https://raw.githubusercontent.com/ByteValley/NetTool/main/Surge/Module/Component/WSGW.module) | [插件](https://raw.githubusercontent.com/ByteValley/NetTool/main/Loon/Plugin/Component/WSGW.lpx) | [重写](https://raw.githubusercontent.com/ByteValley/NetTool/main/QuantumultX/Rewrite/Component/WSGW.conf) | - |
| BoxJS Bridge | [模块](https://raw.githubusercontent.com/ByteValley/NetTool/main/Surge/Module/Component/BoxJsBridge.module) | - | - | - |

---

## 📊 看板/工具脚本导入

| 名称 | Scripting | Surge | Egern | Stash |
|-----|-----------|-------|-------|-------|
| IP 信息 / 网络信息 | [脚本](https://raw.githubusercontent.com/ByteValley/NetTool/main/Scripting/Release/IP%20%E4%BF%A1%E6%81%AF.scripting) | [模块](https://raw.githubusercontent.com/ByteValley/NetTool/main/Surge/Module/Dashboard/NetworkInfo.module) | [模块](https://raw.githubusercontent.com/ByteValley/NetTool/main/Egern/Module/Dashboard/NetworkInfo.yaml) | [覆写](https://raw.githubusercontent.com/ByteValley/NetTool/main/Stash/Stoverride/Dashboard/NetworkInfo.stoverride) |
| 订阅信息 | [脚本](https://raw.githubusercontent.com/ByteValley/NetTool/main/Scripting/Release/%E8%AE%A2%E9%98%85%E4%BF%A1%E6%81%AF.scripting) | [模块](https://raw.githubusercontent.com/ByteValley/NetTool/main/Surge/Module/Dashboard/SubscribeInfo.module) | [模块](https://raw.githubusercontent.com/ByteValley/NetTool/main/Egern/Module/Dashboard/SubscribeInfo.yaml) | - |
| 今日黄历 | - | [模块](https://raw.githubusercontent.com/ByteValley/NetTool/main/Surge/Module/Dashboard/TodayAlmanac.module) | [模块](https://raw.githubusercontent.com/ByteValley/NetTool/main/Egern/Module/Dashboard/TodayAlmanac.yaml) | - |
| 交管12123 | [脚本](https://raw.githubusercontent.com/ByteValley/NetTool/main/Scripting/Release/%E4%BA%A4%E7%AE%A112123.scripting) | - | - | - |
| 网上国网 | [脚本](https://raw.githubusercontent.com/ByteValley/NetTool/main/Scripting/Release/%E7%B6%B2%E4%B8%8A%E5%9C%8B%E7%B6%B2.scripting) | - | - | - |
| 模块元信息重写 | [脚本](https://raw.githubusercontent.com/ByteValley/NetTool/main/Scripting/Release/%E6%A8%A1%E5%9D%97%E5%85%83%E4%BF%A1%E6%81%AF%E9%87%8D%E5%86%99.scripting) | - | - | - |
| 模块元信息重写 Lite | [脚本](https://raw.githubusercontent.com/ByteValley/NetTool/main/Scripting/Release/%E6%A8%A1%E5%9D%97%E5%85%83%E4%BF%A1%E6%81%AF%E9%87%8D%E5%86%99Lite.scripting) | - | - | - |

---

## 🧩 使用步骤

1. 点击上方链接导入到 Scripting
2. 首次打开脚本 → 配置账号（或通过 BoxJS 自动同步）
3. 添加为 iOS 小组件（选择对应运营商脚本）
4. 若不显示数据，请点击组件刷新或重新登录

---

## ✨ 功能特点

| 特性 | 说明 |
|------|------|
| 📡 实时查询 | 话费 / 流量 / 语音剩余一目了然 |
| 🔐 多账户支持 | 可同时管理多个手机号数据 |
| 🔄 自动刷新缓存 | 避免频繁请求导致风控 |
| 🎨 多组件样式 | 小号/中号布局切换，自适应展示 |
| 📦 BoxJS 同步 | 保存账号及设置，换设备无压力 |
| 🧱 API 可拓展 | 支持自定义接口源  

---

## 🔑 BoxJS 配置（可选）

> 若未使用 BoxJS，可直接在脚本内登录运营商账号

---

## 🧱 项目结构
/Scripting
/Release     # 发布版本（.scripting 打包文件）
/Source      # 源码目录（IDEA / VSCode 开发推荐）
源码与发布包分离：  
日常开发修改 `Source`，完成后导出 `.scripting` 发布到 `Release`。

---

## 📜 更新日志

### 2025-12-09
- 增加中国移动 / 中国联通 / 中国电信 / 中国广电脚本导入通道
- 支持 BoxJS Cookie 同步功能
- 优化缓存与刷新体验

更多历史版本见 Release 页面。

---

## ❤️ 支持项目

如果脚本对你有帮助，欢迎点亮 Star ⭐  
也欢迎贡献代码、提交 Issue 或反馈建议！

---

## 📬 联系作者

如需协助或商务合作，请在 Issue 区留言。

---

## 🔮 计划中

- 更多布局样式与主题
- 账单详情展示
- 智能流量/话费到期提醒
- 脚本框架模块化抽象与多运营商统一结构
