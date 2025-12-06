import {
  Navigation,
  Form,
  Section,
  Button,
  Text,
  VStack,
  Spacer,
  HStack,
  Link,
} from "scripting"

const VERSION = "1.0.0"
const REWRITE_RULE_URL = "https://raw.githubusercontent.com/Nanako718/Scripting/refs/heads/main/Quantumult%20X/scripting.qx.conf"

function SettingsPage() {
  const dismiss = Navigation.useDismiss()
  
  // 复制链接并打开 Quantumult X
  const handleInstallRewrite = async () => {
    // 复制重写规则链接到剪贴板
    await Pasteboard.setString(REWRITE_RULE_URL)
    
    // 打开 Quantumult X
    const qxAppUrl = "quantumult-x:///"
    await Safari.openURL(qxAppUrl)
    
    // 显示提示
    await Dialog.alert({
      title: "链接已复制",
      message: "重写规则链接已复制到剪贴板，请在 Quantumult X 中手动添加：\n设置 → 重写 → + → 从 URL 添加",
      buttonLabel: "确定"
    })
  }

  return (
    <VStack>
      <Form>
        <Section title="重写规则安装">
          <Text font="body" padding={{ bottom: 8 }}>
            本脚本需要通过 Quantumult X 重写规则来获取数据。点击下方按钮直接安装：
          </Text>
          <Button 
            title="📥 点击安装重写规则" 
            action={handleInstallRewrite}
          />
          <Text font="caption2" foregroundStyle="secondaryLabel" padding={{ top: 8 }}>
            • 点击按钮将复制重写规则链接并打开 Quantumult X{'\n'}
            • 请在 Quantumult X 中手动添加：设置 → 重写 → + → 从 URL 添加{'\n'}
            • 链接已复制到剪贴板，可直接粘贴{'\n'}
            • 确保已启用 MitM 并安装证书
          </Text>
          <Text 
            font="caption" 
            foregroundStyle="secondaryLabel" 
            padding={{ top: 8 }}
          >
            重写规则地址：{REWRITE_RULE_URL}
          </Text>
        </Section>

        <Section title="缓存管理">
          <Button 
            title="🗑️ 清除缓存" 
            action={async () => {
              try {
                const path = FileManager.appGroupDocumentsDirectory + "/cm_data_cache.json"
                if (FileManager.existsSync(path)) {
                  FileManager.removeSync(path)
                  // 显示成功提示
                  await Dialog.alert({
                    title: "清除成功",
                    message: "缓存已清除",
                    buttonLabel: "确定"
                  })
                } else {
                  await Dialog.alert({
                    title: "提示",
                    message: "缓存文件不存在",
                    buttonLabel: "确定"
                  })
                }
              } catch (e) {
                await Dialog.alert({
                  title: "清除失败",
                  message: String(e),
                  buttonLabel: "确定"
                })
              }
            }}
          />
          <Text font="caption2" foregroundStyle="secondaryLabel" padding={{ top: 4 }}>
            清除缓存数据，下次将重新获取最新数据。
          </Text>
        </Section>
      </Form>
      <Spacer />
      <VStack alignment="center" spacing={4} padding={{ bottom: 10 }}>
        <HStack alignment="center" spacing={4}>
          <Text font="caption2" foregroundStyle="secondaryLabel">
            数据来源：Quantumult X 重写规则
          </Text>
        </HStack>
        <HStack alignment="center" spacing={4}>
          <Text font="caption2" foregroundStyle="secondaryLabel">
            开发：
          </Text>
          <Text font="caption2" foregroundStyle="accentColor">@DTZSGHNR</Text>
        </HStack>
        <Text font="caption2" foregroundStyle="secondaryLabel">
          Version {VERSION}
        </Text>
      </VStack>
    </VStack>
  )
}

Navigation.present(<SettingsPage />)

