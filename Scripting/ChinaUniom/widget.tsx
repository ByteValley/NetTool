// widget.tsx
// 中国联通小组件配置面板（Scripting 版本）

import {
  Navigation,
  NavigationStack,
  Group,
  Button,
  Script,
  Text,
  useState,
  useEffect,
} from 'scripting'

// ======================
// 类型定义（对齐原脚本）
// ======================

type BaseSettings = {
  // 个性化
  avatar?: string
  nickname?: string
  homePageDesc?: string
  boxjsDomain?: string
}

type WidgetSettings = {
  // 基础设置
  refreshAfterDate: string
  lightColor: string
  darkColor: string
  lightBgColor: string
  darkBgColor: string
  lightOpacity: string
  darkOpacity: string

  // BoxJS / 其他
  boxjsDomain: string

  // 背景图缓存标记（原来是文件）
  hasDayBg?: boolean
  hasNightBg?: boolean
  hasTransparentBg?: boolean

  // 颜色设置
  gradient: boolean
  step1: string // 流量进度条
  step2: string // 语音进度条
  builtInColor: boolean
  logoColor: string
  flowIconColor: string
  voiceIconColor: string

  // 尺寸设置
  SCALE: string
  ringStackSize: string
  ringTextSize: string
  feeTextSize: string
  textSize: string
  smallPadding: string
  padding: string

  // Widget 样式 & 自定义容量
  widgetStyle: string
  flow?: string
  voice?: string

  // 账户 / cookie
  cookie?: string
}

// 用来在存储里区分
const STORAGE_KEY_WIDGET = 'ChinaUnicom_2024_widget_settings'
const STORAGE_KEY_BASE = 'ChinaUnicom_2024_base_settings'

// ======================
// 通用存储封装（用 userDefaults）
// ======================

const USER_DEFAULTS = Script.userDefaults.standard()

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = USER_DEFAULTS.get(key)
    if (!raw) return fallback
    return JSON.parse(String(raw)) as T
  } catch {
    return fallback
  }
}

function saveJSON<T>(key: string, value: T) {
  try {
    USER_DEFAULTS.set(key, JSON.stringify(value))
  } catch (e) {
    console.error('saveJSON failed', e)
  }
}

// 默认值完全按你原 init 里的逻辑来
const defaultWidgetSettings: WidgetSettings = {
  refreshAfterDate: '30',
  lightColor: '#000000',
  darkColor: '#ffffff',
  lightBgColor: '#ffffff',
  darkBgColor: '#000000',
  lightOpacity: '0.4',
  darkOpacity: '0.7',
  boxjsDomain: 'boxjs.net',

  gradient: false,
  step1: '#12A6E4',
  step2: '#F86527',
  builtInColor: false,
  logoColor: '#F86527',
  flowIconColor: '#1AB6F8',
  voiceIconColor: '#30D15B',

  SCALE: '1',
  ringStackSize: '65',
  ringTextSize: '14',
  feeTextSize: '21',
  textSize: '13',
  smallPadding: '12',
  padding: '10',

  widgetStyle: '1',
}

const defaultBaseSettings: BaseSettings = {
  avatar: '',
  nickname: '',
  homePageDesc: '',
  boxjsDomain: 'boxjs.net',
}

// ======================
// 通用 UI 组件
// ======================

type RowProps = {
  label: string
  detail?: string
  onPress?: () => void
}

function SettingRow({ label, detail, onPress }: RowProps) {
  return (
    <Button
      title={detail ? `${label}：${detail}` : label}
      // 关键：始终传一个函数，避免 Type 'undefined' not assignable to '() => void'
      action={onPress ?? (() => {})}
    />
  )
}

function Section({
  title,
  children,
}: {
  title?: string
  children: any // 避免使用 React.ReactNode 带来的命名空间错误
}) {
  return (
    <Group>
      {title ? (
        // Scripting 的 Text 不一定支持 style，这里先只用纯文本标题
        <Text>{title}</Text>
      ) : null}
      {children}
    </Group>
  )
}

// 简单文本输入页（点击某行后 push 进来）
// 这里先用 Text 做说明，后续你可以换成 Scripting 提供的 TextField / Form 组件
function TextInputScreen({
  title,
  value,
  placeholder,
  onDone,
}: {
  title: string
  value: string
  placeholder?: string
  onDone: (newValue: string | null) => void
}) {
  const dismiss = Navigation.useDismiss()
  const [text, setText] = useState(value)

  const done = () => {
    onDone(text)
    dismiss()
  }

  const cancel = () => {
    onDone(null)
    dismiss()
  }

  return (
    <NavigationStack>
      <Group
        navigationTitle={title}
        navigationBarTitleDisplayMode={'inline'}
        toolbar={{
          cancellationAction: (
            <Button title={'取消'} action={cancel} />
          ),
          confirmationAction: (
            <Button title={'完成'} action={done} />
          ),
        }}
      >
        <Text>{placeholder ?? ''}</Text>
        <Text>{`当前值：${text || '（空）'}`}</Text>
        {/* TODO: 这里你可以换成真实可编辑的输入组件，比如 TextField */}
      </Group>
    </NavigationStack>
  )
}

// 帮助方法：push 一个输入页
function pushTextInput(params: {
  title: string
  value: string
  placeholder?: string
  onDone: (v: string | null) => void
}) {
  Navigation.present({
    element: <TextInputScreen {...params} />,
    modalPresentationStyle: 'pageSheet',
  })
}

// ======================
// 主配置视图
// ======================

function ChinaUnicomConfigView() {
  const dismiss = Navigation.useDismiss()

  const [widgetSettings, setWidgetSettings] = useState<WidgetSettings>(() =>
    loadJSON(STORAGE_KEY_WIDGET, defaultWidgetSettings),
  )
  const [baseSettings, setBaseSettings] = useState<BaseSettings>(() =>
    loadJSON(STORAGE_KEY_BASE, defaultBaseSettings),
  )

  useEffect(() => {
    saveJSON(STORAGE_KEY_WIDGET, widgetSettings)
  }, [widgetSettings])

  useEffect(() => {
    saveJSON(STORAGE_KEY_BASE, baseSettings)
  }, [baseSettings])

  // 工具函数
  const updateWidget = (patch: Partial<WidgetSettings>) =>
    setWidgetSettings(prev => ({ ...prev, ...patch }))

  const updateBase = (patch: Partial<BaseSettings>) =>
    setBaseSettings(prev => ({ ...prev, ...patch }))

  const resetAll = () => {
    setWidgetSettings(defaultWidgetSettings)
    setBaseSettings(defaultBaseSettings)
  }

  const resetColor = () => {
    updateWidget({
      gradient: false,
      step1: '#12A6E4',
      step2: '#F86527',
      builtInColor: false,
      logoColor: '#F86527',
      flowIconColor: '#1AB6F8',
      voiceIconColor: '#30D15B',
    })
  }

  const resetSize = () => {
    updateWidget({
      SCALE: '1',
      ringStackSize: '65',
      ringTextSize: '14',
      feeTextSize: '21',
      textSize: '13',
      smallPadding: '12',
      padding: '10',
    })
  }

  // ========== 渲染 ==========

  return (
    <NavigationStack>
      <Group
        navigationTitle={'中国联通小组件配置'}
        navigationBarTitleDisplayMode={'inline'}
        toolbar={{
          cancellationAction: (
            <Button
              title={'完成'}
              action={dismiss}
            />
          ),
        }}
      >
        {/* 个性设置 / 账户 */}
        <Section title="个性设置">
          <SettingRow
            label="首页头像（仅记录标记）"
            detail={baseSettings.avatar ? '已设置' : '未设置'}
            onPress={() => {
              // 这里先简单切换标记，后续你可以接入 PhotoPicker / URL 下载真正实现头像
              updateBase({ avatar: baseSettings.avatar ? '' : 'set' })
            }}
          />
          <SettingRow
            label="首页昵称"
            detail={baseSettings.nickname || '未设置'}
            onPress={() =>
              pushTextInput({
                title: '首页昵称',
                value: baseSettings.nickname ?? '',
                placeholder: '👤 请输入头像昵称',
                onDone: v => v != null && updateBase({ nickname: v }),
              })
            }
          />
          <SettingRow
            label="首页昵称描述"
            detail={baseSettings.homePageDesc || '未设置'}
            onPress={() =>
              pushTextInput({
                title: '首页昵称描述',
                value: baseSettings.homePageDesc ?? '',
                placeholder: '请输入描述',
                onDone: v =>
                  v != null && updateBase({ homePageDesc: v }),
              })
            }
          />
          <SettingRow
            label="BoxJS 域名"
            detail={baseSettings.boxjsDomain || 'boxjs.net'}
            onPress={() =>
              pushTextInput({
                title: 'BoxJS 域名',
                value: baseSettings.boxjsDomain ?? 'boxjs.net',
                placeholder: '例如 boxjs.net / boxjs.com',
                onDone: v =>
                  v != null && updateBase({ boxjsDomain: v }),
              })
            }
          />
        </Section>

        {/* 基础设置（刷新 & 文字颜色） */}
        <Section title="基础设置">
          <SettingRow
            label="刷新时间（分钟）"
            detail={widgetSettings.refreshAfterDate}
            onPress={() =>
              pushTextInput({
                title: '刷新时间（分钟）',
                value: widgetSettings.refreshAfterDate,
                placeholder: '仅供参考，最终由系统决定',
                onDone: v =>
                  v != null &&
                  updateWidget({ refreshAfterDate: v || '30' }),
              })
            }
          />
          <SettingRow
            label="白天字体颜色"
            detail={widgetSettings.lightColor}
            onPress={() =>
              pushTextInput({
                title: '白天字体颜色',
                value: widgetSettings.lightColor,
                placeholder: 'Hex 颜色，例如 #000000',
                onDone: v =>
                  v != null &&
                  updateWidget({ lightColor: v || '#000000' }),
              })
            }
          />
          <SettingRow
            label="晚上字体颜色"
            detail={widgetSettings.darkColor}
            onPress={() =>
              pushTextInput({
                title: '晚上字体颜色',
                value: widgetSettings.darkColor,
                placeholder: 'Hex 颜色，例如 #ffffff',
                onDone: v =>
                  v != null &&
                  updateWidget({ darkColor: v || '#ffffff' }),
              })
            }
          />
        </Section>

        {/* 背景颜色 & 图片 & 蒙层 */}
        <Section title="背景设置">
          <SettingRow
            label="白天背景颜色"
            detail={widgetSettings.lightBgColor}
            onPress={() =>
              pushTextInput({
                title: '白天背景颜色',
                value: widgetSettings.lightBgColor,
                placeholder: '支持渐变，多个 Hex 用逗号分隔',
                onDone: v =>
                  v != null &&
                  updateWidget({ lightBgColor: v || '#ffffff' }),
              })
            }
          />
          <SettingRow
            label="夜间背景颜色"
            detail={widgetSettings.darkBgColor}
            onPress={() =>
              pushTextInput({
                title: '夜间背景颜色',
                value: widgetSettings.darkBgColor,
                placeholder: '支持渐变，多个 Hex 用逗号分隔',
                onDone: v =>
                  v != null &&
                  updateWidget({ darkBgColor: v || '#000000' }),
              })
            }
          />
          <SettingRow
            label="日间背景图标记"
            detail={widgetSettings.hasDayBg ? '已设置' : '未设置'}
            onPress={() => {
              updateWidget({ hasDayBg: !widgetSettings.hasDayBg })
            }}
          />
          <SettingRow
            label="夜间背景图标记"
            detail={widgetSettings.hasNightBg ? '已设置' : '未设置'}
            onPress={() => {
              updateWidget({ hasNightBg: !widgetSettings.hasNightBg })
            }}
          />
          <SettingRow
            label="透明背景标记"
            detail={widgetSettings.hasTransparentBg ? '已设置' : '未设置'}
            onPress={() => {
              updateWidget({
                hasTransparentBg: !widgetSettings.hasTransparentBg,
              })
            }}
          />
          <SettingRow
            label="日间蒙层（0~1）"
            detail={widgetSettings.lightOpacity}
            onPress={() =>
              pushTextInput({
                title: '日间蒙层透明度',
                value: widgetSettings.lightOpacity,
                placeholder: '0 完全透明，建议 0~1 小数',
                onDone: v =>
                  v != null &&
                  updateWidget({ lightOpacity: v || '0.4' }),
              })
            }
          />
          <SettingRow
            label="夜间蒙层（0~1）"
            detail={widgetSettings.darkOpacity}
            onPress={() =>
              pushTextInput({
                title: '夜间蒙层透明度',
                value: widgetSettings.darkOpacity,
                placeholder: '0 完全透明，建议 0~1 小数',
                onDone: v =>
                  v != null &&
                  updateWidget({ darkOpacity: v || '0.7' }),
              })
            }
          />
          <SettingRow
            label="清空背景图片标记"
            detail={'点击重置为未设置'}
            onPress={() => {
              updateWidget({
                hasDayBg: false,
                hasNightBg: false,
                hasTransparentBg: false,
              })
            }}
          />
        </Section>

        {/* 颜色设置（对齐原 setColorConfig） */}
        <Section title="颜色设置">
          <SettingRow
            label="渐变进度条"
            detail={widgetSettings.gradient ? '已开启' : '关闭'}
            onPress={() =>
              updateWidget({ gradient: !widgetSettings.gradient })
            }
          />
          <SettingRow
            label="流量进度条颜色"
            detail={widgetSettings.step1}
            onPress={() =>
              pushTextInput({
                title: '流量进度条颜色',
                value: widgetSettings.step1,
                placeholder: 'Hex 颜色，例如 #12A6E4',
                onDone: v =>
                  v != null &&
                  updateWidget({ step1: v || '#12A6E4' }),
              })
            }
          />
          <SettingRow
            label="语音进度条颜色"
            detail={widgetSettings.step2}
            onPress={() =>
              pushTextInput({
                title: '语音进度条颜色',
                value: widgetSettings.step2,
                placeholder: 'Hex 颜色，例如 #F86527',
                onDone: v =>
                  v != null &&
                  updateWidget({ step2: v || '#F86527' }),
              })
            }
          />
          <SettingRow
            label="内置图标颜色"
            detail={widgetSettings.builtInColor ? '已开启' : '关闭'}
            onPress={() =>
              updateWidget({ builtInColor: !widgetSettings.builtInColor })
            }
          />
          <SettingRow
            label="LOGO 图标颜色"
            detail={widgetSettings.logoColor}
            onPress={() =>
              pushTextInput({
                title: 'LOGO 图标颜色',
                value: widgetSettings.logoColor,
                placeholder: 'Hex 颜色，例如 #F86527',
                onDone: v =>
                  v != null &&
                  updateWidget({ logoColor: v || '#F86527' }),
              })
            }
          />
          <SettingRow
            label="流量图标颜色"
            detail={widgetSettings.flowIconColor}
            onPress={() =>
              pushTextInput({
                title: '流量图标颜色',
                value: widgetSettings.flowIconColor,
                placeholder: 'Hex 颜色，例如 #1AB6F8',
                onDone: v =>
                  v != null &&
                  updateWidget({
                    flowIconColor: v || '#1AB6F8',
                  }),
              })
            }
          />
          <SettingRow
            label="语音图标颜色"
            detail={widgetSettings.voiceIconColor}
            onPress={() =>
              pushTextInput({
                title: '语音图标颜色',
                value: widgetSettings.voiceIconColor,
                placeholder: 'Hex 颜色，例如 #30D15B',
                onDone: v =>
                  v != null &&
                  updateWidget({
                    voiceIconColor: v || '#30D15B',
                  }),
              })
            }
          />
          <SettingRow
            label="重置颜色配置"
            detail="点击恢复默认"
            onPress={resetColor}
          />
        </Section>

        {/* 尺寸设置（对齐原 setSizeConfig） */}
        <Section title="尺寸设置">
          <SettingRow
            label="小组件缩放比例"
            detail={widgetSettings.SCALE}
            onPress={() =>
              pushTextInput({
                title: '小组件缩放比例',
                value: widgetSettings.SCALE,
                placeholder: '建议 0.8~1.2 之间的小数',
                onDone: v =>
                  v != null &&
                  updateWidget({ SCALE: v || '1' }),
              })
            }
          />
          <SettingRow
            label="圆环大小"
            detail={widgetSettings.ringStackSize}
            onPress={() =>
              pushTextInput({
                title: '圆环大小',
                value: widgetSettings.ringStackSize,
                onDone: v =>
                  v != null &&
                  updateWidget({
                    ringStackSize: v || '65',
                  }),
              })
            }
          />
          <SettingRow
            label="圆环中心文字大小"
            detail={widgetSettings.ringTextSize}
            onPress={() =>
              pushTextInput({
                title: '圆环中心文字大小',
                value: widgetSettings.ringTextSize,
                onDone: v =>
                  v != null &&
                  updateWidget({
                    ringTextSize: v || '14',
                  }),
              })
            }
          />
          <SettingRow
            label="话费文字大小"
            detail={widgetSettings.feeTextSize}
            onPress={() =>
              pushTextInput({
                title: '话费文字大小',
                value: widgetSettings.feeTextSize,
                onDone: v =>
                  v != null &&
                  updateWidget({
                    feeTextSize: v || '21',
                  }),
              })
            }
          />
          <SettingRow
            label="文字模式文字大小"
            detail={widgetSettings.textSize}
            onPress={() =>
              pushTextInput({
                title: '文字模式文字大小',
                value: widgetSettings.textSize,
                onDone: v =>
                  v != null &&
                  updateWidget({ textSize: v || '13' }),
              })
            }
          />
          <SettingRow
            label="小尺寸组件边距"
            detail={widgetSettings.smallPadding}
            onPress={() =>
              pushTextInput({
                title: '小尺寸组件边距',
                value: widgetSettings.smallPadding,
                onDone: v =>
                  v != null &&
                  updateWidget({
                    smallPadding: v || '12',
                  }),
              })
            }
          />
          <SettingRow
            label="中尺寸组件边距"
            detail={widgetSettings.padding}
            onPress={() =>
              pushTextInput({
                title: '中尺寸组件边距',
                value: widgetSettings.padding,
                onDone: v =>
                  v != null &&
                  updateWidget({ padding: v || '10' }),
              })
            }
          />
          <SettingRow
            label="重置尺寸配置"
            detail="点击恢复默认"
            onPress={resetSize}
          />
        </Section>

        {/* 组件行为相关：样式 / 自定义容量 / cookie / 重置全局 */}
        <Section title="组件行为">
          <SettingRow
            label="组件样式（1~6）"
            detail={widgetSettings.widgetStyle}
            onPress={() =>
              pushTextInput({
                title: '组件样式',
                value: widgetSettings.widgetStyle,
                placeholder: '1 / 2 / 3 / 4 / 5 / 6',
                onDone: v =>
                  v != null &&
                  updateWidget({ widgetStyle: v || '1' }),
              })
            }
          />
          <SettingRow
            label="自定流量总量（GB）"
            detail={widgetSettings.flow || '未设置'}
            onPress={() =>
              pushTextInput({
                title: '自定流量总量（GB）',
                value: widgetSettings.flow ?? '',
                onDone: v => v != null && updateWidget({ flow: v }),
              })
            }
          />
          <SettingRow
            label="自定语音总量（分钟）"
            detail={widgetSettings.voice || '未设置'}
            onPress={() =>
              pushTextInput({
                title: '自定语音总量（分钟）',
                value: widgetSettings.voice ?? '',
                onDone: v => v != null && updateWidget({ voice: v }),
              })
            }
          />
          <SettingRow
            label="账户 Cookie（10010）"
            detail={widgetSettings.cookie ? '已配置' : '未配置'}
            onPress={() =>
              pushTextInput({
                title: '账户 Cookie',
                value: widgetSettings.cookie ?? '',
                placeholder: '@YaYa_10010.cookie 或 BoxJS 读取的值',
                onDone: v => v != null && updateWidget({ cookie: v }),
              })
            }
          />
          <SettingRow
            label="恢复全部配置为默认"
            detail="点击重置"
            onPress={resetAll}
          />
        </Section>

        {/* 脚本管理：这里只是说明入口，具体自动更新你可以按自己需求接入 */}
        <Section title="脚本管理">
          <SettingRow
            label="检查脚本更新"
            detail="请在 Scripting 中自定义更新逻辑"
            // 占位，不做任何操作，避免未知 API 报错
            onPress={() => {
              console.log('点击了“检查脚本更新”')
            }}
          />
          <SettingRow
            label="重载组件"
            detail="保存配置后 Widget 侧会重新读取"
            onPress={() => {
              console.log('点击了“重载组件”')
            }}
          />
        </Section>
      </Group>
    </NavigationStack>
  )
}

// ======================
// 入口：run
// ======================

async function run() {
  await Navigation.present({
    element: <ChinaUnicomConfigView />,
    modalPresentationStyle: 'pageSheet',
  })

  Script.exit()
}

run()