# Spotify / DualSubs 多源补词

模块：Egern/Module/Enhancement/spotify-lyrics.yaml

保留 DualSubs Spotify v1.9.12 的请求/元数据处理，以及原翻译流程；修改 Universal External.Lyrics v1.7.5 的外部歌词选择。原作者 DualSubs / VirgilClyne，Apache-2.0（见随附许可证），修改日期 2026-09-20。

网易云、QQ 音乐、LRCLIB 并行检索。先校验歌名、歌手及版本，有时长时校验时长；专辑匹配优先，同分时逐字 > 逐句 > 纯文本，有现成译文加分。每源最多取两个匹配候选。单源失败不会使其他来源失效。无可靠结果时保留原响应。多源日志前缀 [MultiLyrics]。

更新此模块并刷新脚本缓存；停用旧 Fallback/Metadata Collector 或其他重复处理 Spotify 歌词的模块，避免同一请求被多次改写。翻译仍使用 DualSubs 的配置，外部补词增强不解决翻译接口认证故障。

真实网络验证：QQ 返回《错季花开》袁小葳/林亦 180 秒版本的带时间轴歌词。模拟测试验证选源、错误隔离、错歌过滤及 DualSubs 原始逐字转换器。尚未在用户 Egern 中完成更新后的端到端验证。

限制：不保证全曲库有词；缓存无时长时多版本区分有限；繁简体及别名可能漏匹配。平台接口可能变化。本模块不会下载音频。未改变 DualSubs 的歌曲信息获取方式。

文件：External.Lyrics.MultiSource.js 为可执行完整 bundle；multisource-core.js 为新增选源源码。上游 https://github.com/DualSubs/Universal 和 https://github.com/DualSubs/Spotify。
