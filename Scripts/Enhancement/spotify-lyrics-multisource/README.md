# 独立多源歌词 v3.0

Spotify.Lyrics.Independent.js 是独立的 Egern 响应脚本，不读取 DualSubs 配置或缓存，不调用 Spotify Web API。歌曲资料来自 Spotify 公开嵌入页，按歌曲 ID 校验并写入独立缓存。并发检索网易云、QQ 音乐、LRCLIB，按歌名、歌手、时长、专辑和时间轴质量选择歌词。OpenCC 字符数据用于简繁匹配，不改动实际歌词。

Spotify.Lyrics.Pipeline.js 将独立补词引擎与后续 DualSubs 翻译串行打包，避免依赖多个响应规则执行顺序。主模块只注册两个响应处理器，不再加载 DualSubs 请求脚本或歌曲缓存脚本。Translate=false 可关闭翻译。独立脚本单独部署无需 DualSubs。

支持 JSON 和 Protobuf。无匹配或请求失败保留原响应；成功时改为 HTTP 200。逐字歌词目前转换为逐行时间轴。翻译认证故障不属于补词引擎。公开页面与各歌词接口可能不可用，无法保证所有歌曲有歌词。

OpenCC 字符表许可见 OpenCC-LICENSE；DualSubs 翻译代码保留原 Apache-2.0 许可。
