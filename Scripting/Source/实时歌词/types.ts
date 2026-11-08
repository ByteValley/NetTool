// 项目共享类型定义

/** 单行歌词（带时间戳） */
export type LyricLine = {
  // 该行歌词的起始时间，单位：秒
  time: number
  // 歌词文本
  text: string
}

/** 一首歌的完整歌词数据 */
export type LyricData = {
  // 歌曲名
  title: string
  // 歌手名
  artist: string
  // 专辑名（可能为空）
  albumTitle?: string
  // 按时间排序的歌词行，synced=false 时仅一行（纯歌词）
  lines: LyricLine[]
  // 是否为时间同步歌词（LRC）
  synced: boolean
}

/** 实时活动 / 灵动岛的内容状态（仅推送可见三行，避免 payload 过大被系统丢弃） */
export type LyricActivityState = {
  title: string
  artist: string
  // 上一行 / 当前行 / 下一行文本
  prevText: string
  currentText: string
  nextText: string
  // 当前高亮行索引，用于触发内容切换
  currentIndex: number
  // 播放进度 0~1
  progress: number
  // 是否正在播放
  isPlaying: boolean
  // 是否已有可用歌词
  hasLyric: boolean
  // 单调递增序号，强制 contentState 身份变化，避免系统合并未刷新
  seq: number
  // 本次推送时间戳（秒），供 UI 与诊断对照
  updatedAt: number
}

/** 写入 Storage 的快照，供小组件读取 */
export type LyricSnapshot = {
  title: string
  artist: string
  // Playback source, used by widget controls to target Spotify or Apple Music.
  source?: "apple_music" | "spotify"
  // 歌曲唯一标识，用于获取封面
  persistentID?: string
  // 封面 JPEG 文件路径（App Group），避免 Base64 脱胀小组件
  artworkPath?: string
  // 当前行文本
  currentText: string
  // 下一行文本
  nextText: string
  // 播放进度 0~1
  progress: number
  // 是否正在播放
  isPlaying: boolean
  // 是否已有可用歌词
  hasLyric: boolean
  // 快照写入时间戳（单位：秒）
  updatedAt: number
}
