import {
  Widget,
  VStack,
  HStack,
  Text,
  Spacer,
  WidgetReloadPolicy,
  DynamicShapeStyle,
} from "scripting"

import {
  type IpSourceResult,
  type NetworkInfoData,
  type RiskInfo,
  type ServiceResult,
  fetchNetworkInfoCached,
} from "./api"
import { loadSkkIpInfoSettings, type SkkIpInfoSettings } from "./settings"

function clampRefreshMinutes(value: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 30
  return Math.min(1440, Math.max(5, Math.floor(n)))
}

function two(n: number) {
  return String(n).padStart(2, "0")
}

function formatTime(ts: number) {
  const date = new Date(ts)
  return `${two(date.getHours())}:${two(date.getMinutes())}`
}

function maskIp(ip?: string) {
  const raw = String(ip ?? "")
  if (!raw) return "—"
  if (raw.includes(":")) {
    const parts = raw.split(":").filter(Boolean)
    if (parts.length <= 2) return raw
    return `${parts.slice(0, 2).join(":")}:…:${parts.slice(-1)[0]}`
  }
  const parts = raw.split(".")
  if (parts.length !== 4) return raw
  return `${parts[0]}.${parts[1]}.*.*`
}

function text(value?: string, fallback = "—") {
  const s = String(value ?? "").trim()
  return s || fallback
}

function displayIp(item: IpSourceResult | undefined, settings: SkkIpInfoSettings) {
  if (!item?.ip) return "—"
  return settings.maskIp ? maskIp(item.ip) : item.ip
}

function displayLocation(item: IpSourceResult | undefined, settings: SkkIpInfoSettings) {
  if (!item) return "—"
  if (settings.maskLocation) return "已隐藏"
  return text(item.location || item.countryCode)
}

function pickSources(data: NetworkInfoData) {
  const preferred = [
    data.primaryDomestic,
    data.primaryInternational,
    data.primaryIPv6,
  ].filter(Boolean) as IpSourceResult[]

  const seen = new Set(preferred.map((item) => item.id))
  data.sources.forEach((item) => {
    if (item.ok && !seen.has(item.id)) {
      preferred.push(item)
      seen.add(item.id)
    }
  })
  return preferred
}

function statusColor(ok: boolean, statusText?: string): any {
  if (ok && /仅自制|部分/i.test(String(statusText || ""))) return "systemYellow"
  return ok ? "systemGreen" : "systemRed"
}

function latencyText(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—"
  return `${Math.round(value)}ms`
}

function Root(props: { children: any }) {
  const bg: DynamicShapeStyle = { light: "#FBFBFA", dark: "#111312" }
  return (
    <VStack
      frame={{ maxWidth: Infinity, maxHeight: Infinity }}
      padding={{ top: 12, leading: 12, bottom: 12, trailing: 12 }}
      spacing={10}
      widgetBackground={{
        style: bg,
        shape: { type: "rect", cornerRadius: 18, style: "continuous" },
      }}
    >
      {props.children}
    </VStack>
  )
}

function Card(props: { children: any; padding?: number }) {
  const pad = props.padding ?? 10
  return (
    <VStack
      spacing={8}
      padding={{ top: pad, leading: pad, bottom: pad, trailing: pad }}
      frame={{ maxWidth: Infinity }}
      widgetBackground={{
        style: { light: "#FFFFFF", dark: "#1B1D1C" } as any,
        shape: { type: "rect", cornerRadius: 10, style: "continuous" },
      }}
    >
      {props.children}
    </VStack>
  )
}

function Badge(props: { text: string; tone: "domestic" | "international" | "risk" }) {
  const style =
    props.tone === "domestic"
      ? ({ light: "#D9E5FF", dark: "#213A73" } as any)
      : props.tone === "risk"
        ? ({ light: "#FFF2CC", dark: "#523C12" } as any)
        : ({ light: "#D7F2EC", dark: "#1D4D45" } as any)
  const fg =
    props.tone === "domestic"
      ? ({ light: "#1F4AA8", dark: "#D8E5FF" } as any)
      : props.tone === "risk"
        ? ({ light: "#825A00", dark: "#FFE4A0" } as any)
        : ({ light: "#14675B", dark: "#BDEFE7" } as any)

  return (
    <VStack
      padding={{ top: 2, leading: 6, bottom: 2, trailing: 6 }}
      widgetBackground={{
        style,
        shape: { type: "capsule", style: "continuous" },
      }}
    >
      <Text font={8} fontWeight="bold" foregroundStyle={fg} lineLimit={1}>
        {props.text}
      </Text>
    </VStack>
  )
}

function Header(props: {
  title: string
  updatedAt: number
  fromCache: boolean
  staleFallback?: boolean
}) {
  const accent: DynamicShapeStyle = { light: "#0F8B8D", dark: "#5EE0CF" }
  return (
    <HStack alignment="center" spacing={8}>
      <VStack
        frame={{ width: 4, height: 22 }}
        widgetBackground={{
          style: accent,
          shape: { type: "capsule", style: "continuous" },
        }}
      />
      <Text font={14} fontWeight="bold" lineLimit={1} minScaleFactor={0.75}>
        {props.title}
      </Text>
      <Spacer />
      <Text font={9} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.7}>
        {formatTime(props.updatedAt)}{props.fromCache ? " 缓存" : ""}{props.staleFallback ? " 兜底" : ""}
      </Text>
    </HStack>
  )
}

function DetailRow(props: { label: string; value: string; strong?: boolean }) {
  return (
    <VStack spacing={2} alignment="leading">
      <Text font={9} foregroundStyle="secondaryLabel" lineLimit={1}>
        {props.label}
      </Text>
      <Text font={props.strong ? 13 : 11} fontWeight={props.strong ? "bold" : "medium"} lineLimit={1} minScaleFactor={0.65}>
        {props.value}
      </Text>
    </VStack>
  )
}

function RiskCard(props: { risk: RiskInfo }) {
  const riskColor: any =
    props.risk.level === "高" ? "systemRed" : props.risk.level === "中" ? "systemYellow" : "systemGreen"
  return (
    <VStack
      spacing={5}
      padding={{ top: 8, leading: 9, bottom: 8, trailing: 9 }}
      widgetBackground={{
        style: { light: "#F7F8F8", dark: "#242827" } as any,
        shape: { type: "rect", cornerRadius: 8, style: "continuous" },
      }}
    >
      <HStack alignment="center" spacing={6}>
        <Text font={9} fontWeight="semibold" foregroundStyle="secondaryLabel" lineLimit={1}>
          风险值
        </Text>
        <Spacer />
        <Badge text={props.risk.level} tone="risk" />
      </HStack>
      <HStack alignment="center" spacing={4}>
        <Text font={21} fontWeight="bold" foregroundStyle={riskColor} lineLimit={1}>
          {String(props.risk.score)}
        </Text>
        <Text font={9} foregroundStyle="secondaryLabel" lineLimit={1}>
          / 100 · {props.risk.title}
        </Text>
      </HStack>
      <Text font={9} foregroundStyle="secondaryLabel" lineLimit={2} minScaleFactor={0.7}>
        {props.risk.items.length ? props.risk.items.join(" · ") : "暂无异常信号"}
      </Text>
    </VStack>
  )
}

function PrimaryIpCard(props: { data: NetworkInfoData; settings: SkkIpInfoSettings }) {
  const primary =
    props.data.primaryInternational || props.data.primaryDomestic || props.data.primaryIPv6
  return (
    <Card>
      <HStack alignment="center" spacing={6}>
        <Text font={10} foregroundStyle="secondaryLabel" lineLimit={1}>
          IPv4
        </Text>
        <Spacer />
        <Badge text={countryLabel(primary)} tone="international" />
      </HStack>

      <Text font={18} fontWeight="bold" lineLimit={1} minScaleFactor={0.58}>
        {displayIp(primary, props.settings)}
      </Text>

      <DetailRow label="Location" value={displayLocation(primary, props.settings)} />
      <DetailRow label="ISP" value={text(primary?.isp)} />
      <DetailRow label="ASN" value={text(primary?.asn || primary?.isp)} />

      <RiskCard risk={props.data.risk} />

      <Text font={9} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.65}>
        {props.data.primaryIPv6 ? `IPv6 ${displayIp(props.data.primaryIPv6, props.settings)}` : "你的网络可能不支持 IPv6"}
      </Text>
    </Card>
  )
}

function CompactIpCard(props: { data: NetworkInfoData; settings: SkkIpInfoSettings }) {
  const primary =
    props.data.primaryInternational || props.data.primaryDomestic || props.data.primaryIPv6
  const riskColor: any =
    props.data.risk.level === "高" ? "systemRed" : props.data.risk.level === "中" ? "systemYellow" : "systemGreen"

  return (
    <Card padding={9}>
      <HStack alignment="center" spacing={8}>
        <VStack spacing={3} alignment="leading">
          <Text font={9} foregroundStyle="secondaryLabel" lineLimit={1}>
            IPv4
          </Text>
          <Text font={17} fontWeight="bold" lineLimit={1} minScaleFactor={0.58}>
            {displayIp(primary, props.settings)}
          </Text>
          <Text font={10} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.65}>
            {displayLocation(primary, props.settings)}
          </Text>
        </VStack>
        <Spacer />
        <VStack spacing={2} alignment="trailing">
          <Text font={9} foregroundStyle="secondaryLabel" lineLimit={1}>
            风险值
          </Text>
          <Text font={20} fontWeight="bold" foregroundStyle={riskColor} lineLimit={1}>
            {String(props.data.risk.score)}
          </Text>
          <Text font={9} foregroundStyle="secondaryLabel" lineLimit={1}>
            {props.data.risk.level} · {props.data.risk.title}
          </Text>
        </VStack>
      </HStack>
    </Card>
  )
}

function countryLabel(item?: IpSourceResult) {
  const cc = String(item?.countryCode || item?.location || "").trim()
  return cc ? cc.slice(0, 8) : "国际"
}

function sourceTone(item: IpSourceResult): "domestic" | "international" {
  return item.kind === "domestic" ? "domestic" : "international"
}

function SourceLine(props: { item: IpSourceResult; settings: SkkIpInfoSettings }) {
  return (
    <VStack spacing={5}>
      <HStack alignment="center" spacing={6}>
        <Text font={11} fontWeight="bold" lineLimit={1} minScaleFactor={0.7}>
          {props.item.name}
        </Text>
        <Spacer />
        <Badge text={props.item.kind === "domestic" ? "国内" : "国际"} tone={sourceTone(props.item)} />
      </HStack>
      <Text font={10} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.7}>
        IP: {displayIp(props.item, props.settings)}
      </Text>
      <Text font={10} lineLimit={1} minScaleFactor={0.65}>
        {displayLocation(props.item, props.settings)} {text(props.item.isp || props.item.asn, "")}
      </Text>
    </VStack>
  )
}

function SourceListCard(props: { data: NetworkInfoData; settings: SkkIpInfoSettings }) {
  const sources = pickSources(props.data).slice(0, 4)
  return (
    <Card>
      {sources.map((item, index) => (
        <VStack key={item.id} spacing={7}>
          {index > 0 ? (
            <VStack
              frame={{ maxWidth: Infinity, height: 1 }}
              widgetBackground={{
                style: "systemGray4",
                shape: { type: "rect", cornerRadius: 0, style: "continuous" },
              }}
            />
          ) : null}
          <SourceLine item={item} settings={props.settings} />
        </VStack>
      ))}
    </Card>
  )
}

function dotColor(item: ServiceResult, index: number): any {
  if (!item.ok) return index < 3 ? "systemRed" : "systemGray3"
  const latency = item.latencyMs || 0
  if (/仅自制|部分/i.test(String(item.statusText || ""))) {
    return index % 4 === 0 ? "systemYellow" : "systemGreen"
  }
  if (latency <= 80) return index % 5 === 0 ? "systemGreen" : "#2F8D46"
  if (latency <= 150) return index % 4 === 0 ? "systemYellow" : "systemGreen"
  if (latency <= 260) return index % 3 === 0 ? "systemYellow" : "systemGreen"
  return index % 3 === 0 ? "systemOrange" : "systemYellow"
}

function DotStrip(props: { item: ServiceResult; count?: number }) {
  const count = props.count ?? 8
  return (
    <HStack spacing={4}>
      {Array.from({ length: count }).map((_, index) => (
        <VStack
          key={index}
          frame={{ width: 5, height: 5 }}
          widgetBackground={{
            style: dotColor(props.item, index),
            shape: { type: "capsule", style: "continuous" },
          }}
        />
      ))}
    </HStack>
  )
}

function ServiceTile(props: { item: ServiceResult }) {
  return (
    <VStack
      spacing={5}
      padding={{ top: 7, leading: 7, bottom: 7, trailing: 7 }}
      frame={{ maxWidth: Infinity }}
      widgetBackground={{
        style: { light: "#FFFFFF", dark: "#1B1D1C" } as any,
        shape: { type: "rect", cornerRadius: 8, style: "continuous" },
      }}
    >
      <HStack alignment="center" spacing={4}>
        <VStack
          frame={{ width: 7, height: 7 }}
          widgetBackground={{
            style: statusColor(props.item.ok, props.item.statusText),
            shape: { type: "capsule", style: "continuous" },
          }}
        />
        <Text font={10} fontWeight="bold" lineLimit={1} minScaleFactor={0.65}>
          {props.item.name}
        </Text>
        <Spacer />
        <Badge text={props.item.region} tone={props.item.region === "国内" ? "domestic" : "international"} />
      </HStack>
      <HStack alignment="center" spacing={6}>
        <Text font={10} fontWeight="bold" foregroundStyle={statusColor(props.item.ok, props.item.statusText)} lineLimit={1}>
          {props.item.ok ? latencyText(props.item.latencyMs) : "失败"}
        </Text>
        <Text font={8} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.7}>
          {props.item.countryCode || props.item.statusText || ""}
        </Text>
      </HStack>
      <DotStrip item={props.item} />
    </VStack>
  )
}

function servicePriority(item: ServiceResult) {
  const order = [
    "bytedance",
    "bilibili",
    "github",
    "cloudflare",
    "youtube",
    "chatgpt",
    "netflix",
    "wechat",
    "taobao",
    "openai_api",
    "disney",
    "max",
    "spotify",
  ]
  const index = order.indexOf(item.id)
  return index >= 0 ? index : 99
}

function pickServices(data: NetworkInfoData, limit: number) {
  return [...(data.services || data.connectivity || [])]
    .sort((a, b) => servicePriority(a) - servicePriority(b))
    .slice(0, limit)
}

function ServiceGrid(props: { items: ServiceResult[]; columns: 2 | 3 }) {
  const rows: ServiceResult[][] = []
  props.items.forEach((item, index) => {
    const row = Math.floor(index / props.columns)
    if (!rows[row]) rows[row] = []
    rows[row].push(item)
  })

  return (
    <VStack spacing={6}>
      {rows.map((row, index) => (
        <HStack key={index} spacing={6}>
          {row.map((item) => (
            <ServiceTile key={item.id} item={item} />
          ))}
          {row.length < props.columns ? <Spacer /> : null}
        </HStack>
      ))}
    </VStack>
  )
}

function SmallView(props: {
  data: NetworkInfoData
  settings: SkkIpInfoSettings
  fromCache: boolean
  staleFallback?: boolean
}) {
  const primary =
    props.data.primaryDomestic || props.data.primaryInternational || props.data.primaryIPv6

  return (
    <Root>
      <Header
        title={props.settings.title}
        updatedAt={props.data.updatedAt}
        fromCache={props.fromCache}
        staleFallback={props.staleFallback}
      />
      <Spacer />
      <VStack spacing={4}>
        <Text font={18} fontWeight="bold" lineLimit={1} minScaleFactor={0.58}>
          {displayIp(primary, props.settings)}
        </Text>
        <Text font={11} foregroundStyle="secondaryLabel" lineLimit={2} minScaleFactor={0.7}>
          {displayLocation(primary, props.settings)}
        </Text>
        <Text font={10} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.7}>
          {text(primary?.isp || primary?.asn)}
        </Text>
      </VStack>
      <Spacer />
      {props.data.services.length ? (
        <ServiceGrid items={pickServices(props.data, 2)} columns={2} />
      ) : null}
    </Root>
  )
}

function MediumView(props: {
  data: NetworkInfoData
  settings: SkkIpInfoSettings
  fromCache: boolean
  staleFallback?: boolean
}) {
  const services = pickServices(props.data, 2)
  return (
    <Root>
      <Header
        title={props.settings.title}
        updatedAt={props.data.updatedAt}
        fromCache={props.fromCache}
        staleFallback={props.staleFallback}
      />

      <CompactIpCard data={props.data} settings={props.settings} />

      {services.length ? (
        <ServiceGrid items={services} columns={2} />
      ) : (
        <Text font={10} foregroundStyle="secondaryLabel">
          服务检测未开启
        </Text>
      )}
    </Root>
  )
}

function LargeView(props: {
  data: NetworkInfoData
  settings: SkkIpInfoSettings
  fromCache: boolean
  staleFallback?: boolean
}) {
  const services = pickServices(props.data, 9)
  return (
    <Root>
      <Header
        title={props.settings.title}
        updatedAt={props.data.updatedAt}
        fromCache={props.fromCache}
        staleFallback={props.staleFallback}
      />

      <HStack spacing={8}>
        <PrimaryIpCard data={props.data} settings={props.settings} />
        <SourceListCard data={props.data} settings={props.settings} />
      </HStack>

      {services.length ? (
        <VStack spacing={6}>
          <Text font={10} fontWeight="semibold" foregroundStyle="secondaryLabel">
            服务检测
          </Text>
          <ServiceGrid items={services} columns={3} />
        </VStack>
      ) : null}
    </Root>
  )
}

function ErrorView(props: { title: string; message: string }) {
  return (
    <Root>
      <Spacer />
      <VStack spacing={6} alignment="center">
        <Text font="headline" foregroundStyle="systemRed">
          {props.title}
        </Text>
        <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={4} multilineTextAlignment="center">
          {props.message}
        </Text>
      </VStack>
      <Spacer />
    </Root>
  )
}

async function render() {
  const settings = loadSkkIpInfoSettings()
  const refreshMinutes = clampRefreshMinutes(settings.refreshIntervalMinutes)
  const reloadPolicy: WidgetReloadPolicy = {
    policy: "after",
    date: new Date(Date.now() + refreshMinutes * 60 * 1000),
  }

  try {
    const result = await fetchNetworkInfoCached(settings)
    const props = {
      data: result.data,
      settings,
      fromCache: result.fromCache,
      staleFallback: result.staleFallback,
    }

    if (Widget.family === "systemSmall") {
      Widget.present(<SmallView {...props} />, reloadPolicy)
      return
    }

    if (Widget.family === "systemLarge" || Widget.family === "systemExtraLarge") {
      Widget.present(<LargeView {...props} />, reloadPolicy)
      return
    }

    Widget.present(<MediumView {...props} />, reloadPolicy)
  } catch (error: any) {
    const message = error?.message ? String(error.message) : String(error)
    Widget.present(<ErrorView title="加载失败" message={message} />, reloadPolicy)
  }
}

render()
