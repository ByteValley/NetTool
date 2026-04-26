import {
  Widget,
  VStack,
  HStack,
  Text,
  Spacer,
  WidgetReloadPolicy,
  Circle,
  Rectangle,
  RoundedRectangle,
  ZStack,
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
    return `${parts.slice(0, 2).join(":")}:...:${parts.slice(-1)[0]}`
  }
  const parts = raw.split(".")
  if (parts.length !== 4) return raw
  return `${parts[0]}.${parts[1]}.*.*`
}

function text(value?: string, fallback = "—") {
  const s = String(value ?? "").trim()
  return s || fallback
}

function ellipsis(value?: string, limit = 30) {
  const raw = text(value, "")
  if (!raw) return "—"
  return raw.length > limit ? `${raw.slice(0, limit - 1)}…` : raw
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

function pickReferenceSources(data: NetworkInfoData) {
  const ids = ["ipip", "bilibili", "cloudflare", "ipinfo"]
  const picked: IpSourceResult[] = []
  ids.forEach((id) => {
    const found = data.sources.find((item) => item.id === id && item.ok && item.ip)
    if (found) picked.push(found)
  })
  const seen = new Set(picked.map((item) => item.id))
  pickSources(data).forEach((item) => {
    if (!seen.has(item.id)) {
      picked.push(item)
      seen.add(item.id)
    }
  })
  return picked
}

function riskColor(risk?: Partial<RiskInfo>): any {
  if (risk?.level === "高") return "systemRed"
  if (risk?.level === "中") return "systemYellow"
  return "systemGreen"
}

function riskScore(risk?: Partial<RiskInfo>) {
  const score = Number(risk?.score)
  return Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 50
}

function riskLevel(risk?: Partial<RiskInfo>) {
  return risk?.level || "中"
}

function riskTitle(risk?: Partial<RiskInfo>) {
  return text(risk?.title, "需要留意")
}

function statusColor(ok: boolean, statusText?: string): any {
  if (ok && /仅自制|部分/i.test(String(statusText || ""))) return "systemYellow"
  return ok ? "systemGreen" : "systemRed"
}

function latencyText(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—"
  return `${Math.round(value)}ms`
}

function serviceLabel(item: ServiceResult) {
  if (item.region === "流媒体") return "流媒"
  return item.region
}

const UI = {
  rootBg: { light: "rgba(248,250,252,0.92)", dark: "rgba(27,38,49,0.86)" } as any,
  blockBg: { light: "rgba(255,255,255,0.48)", dark: "rgba(255,255,255,0.045)" } as any,
  cardBg: { light: "rgba(255,255,255,0.58)", dark: "rgba(255,255,255,0.07)" } as any,
  text: { light: "#1F2937", dark: "#F8FAFC" } as any,
  subtext: { light: "#6B7280", dark: "rgba(255,255,255,0.62)" } as any,
  green: { light: "#57D694", dark: "#63D98E" } as any,
  blue: { light: "#3B82F6", dark: "#58A6FF" } as any,
  teal: { light: "#38BDB2", dark: "#5DD6C9" } as any,
  orange: { light: "#F59E0B", dark: "#FDBA45" } as any,
  red: { light: "#EF4444", dark: "#FF6B6B" } as any,
}

function Root(props: { children: any; compact?: boolean }) {
  const pad = props.compact
    ? { top: 8, leading: 8, bottom: 8, trailing: 8 }
    : { top: 8, leading: 8, bottom: 8, trailing: 8 }

  return (
    <VStack
      frame={{ minWidth: 0, maxWidth: Infinity, minHeight: 0, maxHeight: Infinity }}
      padding={pad}
      spacing={6}
      widgetBackground={{
        style: UI.rootBg,
        shape: { type: "rect", cornerRadius: 22, style: "continuous" },
      }}
    >
      {props.children}
    </VStack>
  )
}

function Card(props: { children: any; padding?: number; spacing?: number }) {
  const pad = props.padding ?? 7
  return (
    <VStack
      alignment="leading"
      spacing={props.spacing ?? 5}
      padding={{ top: pad, leading: pad, bottom: pad, trailing: pad }}
      frame={{ minWidth: 0, maxWidth: Infinity }}
      widgetBackground={{
        style: UI.cardBg,
        shape: { type: "rect", cornerRadius: 10, style: "continuous" },
      }}
    >
      {props.children}
    </VStack>
  )
}

function ServicePanel(props: { children: any }) {
  return (
    <VStack
      alignment="leading"
      spacing={5}
      padding={{ top: 8, leading: 8, bottom: 8, trailing: 8 }}
      frame={{ minWidth: 0, maxWidth: Infinity }}
      widgetBackground={{
        style: UI.cardBg,
        shape: { type: "rect", cornerRadius: 10, style: "continuous" },
      }}
    >
      {props.children}
    </VStack>
  )
}

function OutlineBlock(props: {
  children: any
  tone: any
  padding?: number
  spacing?: number
  minHeight?: number
}) {
  const pad = props.padding ?? 6
  const frame = props.minHeight
    ? { minWidth: 0, maxWidth: Infinity, minHeight: props.minHeight }
    : { minWidth: 0, maxWidth: Infinity }
  return (
    <ZStack frame={{ minWidth: 0, maxWidth: Infinity }}>
      <RoundedRectangle cornerRadius={12} style="continuous" fill={UI.blockBg} />
      <RoundedRectangle
        cornerRadius={12}
        style="continuous"
        stroke={{ shapeStyle: props.tone, strokeStyle: { lineWidth: 1.35 } }}
      />
      <VStack
        zIndex={10 as any}
        alignment="leading"
        spacing={props.spacing ?? 4}
        padding={{ top: pad, leading: pad, bottom: pad, trailing: pad }}
        frame={frame}
      >
        {props.children}
      </VStack>
    </ZStack>
  )
}

function MainPanel(props: { children: any }) {
  return (
    <VStack
      alignment="leading"
      spacing={5}
      frame={{ minWidth: 0, maxWidth: Infinity, minHeight: 0, maxHeight: Infinity }}
    >
      {props.children}
    </VStack>
  )
}

function Badge(props: { text: string; tone: "domestic" | "international" | "risk" }) {
  const bg =
    props.tone === "domestic"
      ? "systemBlue"
      : props.tone === "risk"
        ? "systemYellow"
        : "systemGreen"
  const fg = props.tone === "risk" ? "#3E2A00" : "white"

  return (
    <VStack
      padding={{ top: 1, leading: 5, bottom: 1, trailing: 5 }}
      widgetBackground={{
        style: bg,
        shape: { type: "capsule", style: "continuous" },
      }}
    >
      <Text font={7.5} fontWeight="bold" foregroundStyle={fg} lineLimit={1} minScaleFactor={0.7}>
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
  return (
    <HStack alignment="center" spacing={6}>
      <RoundedRectangle
        cornerRadius={2}
        style="continuous"
        fill="systemGreen"
        frame={{ width: 4, height: 18 }}
      />
      <Text font={13} fontWeight="bold" lineLimit={1} minScaleFactor={0.72}>
        {props.title}
      </Text>
      <Spacer />
      <Text font={8.5} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.7}>
        {formatTime(props.updatedAt)}
        {props.fromCache ? " 缓存" : ""}
        {props.staleFallback ? " 兜底" : ""}
      </Text>
    </HStack>
  )
}

function InfoBlock(props: { label: string; value: string; strong?: boolean }) {
  return (
    <VStack spacing={1} alignment="leading" frame={{ maxWidth: Infinity }}>
      <Text font={8.2} foregroundStyle={UI.subtext} lineLimit={1}>
        {props.label}
      </Text>
      <Text
        font={props.strong ? 10.8 : 9.8}
        fontWeight={props.strong ? "semibold" : "regular"}
        foregroundStyle={UI.text}
        lineLimit={1}
        minScaleFactor={0.58}
      >
        {props.value}
      </Text>
    </VStack>
  )
}

function StatusPill(props: { text: string }) {
  return (
    <VStack
      padding={{ top: 2, leading: 5, bottom: 2, trailing: 5 }}
      widgetBackground={{
        style: { light: "rgba(0,0,0,0.04)", dark: "rgba(255,255,255,0.08)" } as any,
        shape: { type: "capsule", style: "continuous" },
      }}
    >
      <Text font={7.4} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.62}>
        {props.text}
      </Text>
    </VStack>
  )
}

function StatusStrip(props: {
  data: NetworkInfoData
  settings: SkkIpInfoSettings
  fromCache: boolean
  staleFallback?: boolean
}) {
  void props.settings
  const risk = props.data.risk || ({} as RiskInfo)
  return (
    <VStack
      padding={{ top: 5, leading: 7, bottom: 5, trailing: 7 }}
      frame={{ minWidth: 0, maxWidth: Infinity }}
      widgetBackground={{
        style: { light: "rgba(0,0,0,0.028)", dark: "rgba(255,255,255,0.07)" } as any,
        shape: { type: "rect", cornerRadius: 10, style: "continuous" },
      }}
    >
      <HStack alignment="center" spacing={6} frame={{ maxWidth: Infinity }}>
        <VStack
          frame={{ width: 13, height: 13 }}
          widgetBackground={{
            style: riskColor(risk),
            shape: { type: "capsule", style: "continuous" },
          }}
        >
          <Text font={8} fontWeight="bold" foregroundStyle="white" lineLimit={1}>
            i
          </Text>
        </VStack>
        <Text font={8.5} foregroundStyle="secondaryLabel" lineLimit={1}>
          风险值
        </Text>
        <Text font={12} fontWeight="bold" foregroundStyle={riskColor(risk)} lineLimit={1}>
          {String(riskScore(risk))}
        </Text>
        <Text font={8.4} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.66}>
          / 100 · {riskTitle(risk)}
        </Text>
        <Spacer />
        <StatusPill text={text(risk.lineType, "未知")} />
        <StatusPill text={text(risk.nativeHint, riskTitle(risk))} />
        <StatusPill text={text(risk.subtype, riskLevel(risk))} />
        <Text font={7.8} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.62}>
          {formatTime(props.data.updatedAt)}
          {props.fromCache ? " 缓存" : ""}
          {props.staleFallback ? " 兜底" : ""}
        </Text>
      </HStack>
    </VStack>
  )
}

function RiskStrip(props: { risk: RiskInfo }) {
  const reason = props.risk.items?.length ? props.risk.items.join(" · ") : "暂无异常信号"
  return (
    <VStack
      spacing={2}
      padding={{ top: 5, leading: 7, bottom: 5, trailing: 7 }}
      widgetBackground={{
        style: { light: "rgba(0,0,0,0.035)", dark: "rgba(255,255,255,0.07)" } as any,
        shape: { type: "rect", cornerRadius: 8, style: "continuous" },
      }}
    >
      <HStack alignment="center" spacing={5}>
        <Text font={8.5} fontWeight="semibold" foregroundStyle="secondaryLabel" lineLimit={1}>
          风险值
        </Text>
        <Spacer />
        <Badge text={riskLevel(props.risk)} tone="risk" />
      </HStack>
      <HStack alignment="lastTextBaseline" spacing={4}>
        <Text font={17} fontWeight="bold" foregroundStyle={riskColor(props.risk)} lineLimit={1}>
          {String(riskScore(props.risk))}
        </Text>
        <Text font={8.5} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.7}>
          / 100 · {riskTitle(props.risk)}
        </Text>
      </HStack>
      <Text font={7.6} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.62}>
        {reason}
      </Text>
    </VStack>
  )
}

function countryLabel(item?: IpSourceResult) {
  const cc = String(item?.countryCode || "").trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(cc)) return cc
  return item?.kind === "domestic" ? "国内" : "国际"
}

function sourceTone(item?: IpSourceResult): "domestic" | "international" {
  return item?.kind === "domestic" ? "domestic" : "international"
}

function PrimaryIpCard(props: { data: NetworkInfoData; settings: SkkIpInfoSettings }) {
  const primary =
    props.data.primaryInternational || props.data.primaryDomestic || props.data.primaryIPv6

  return (
    <Card padding={8} spacing={5}>
      <HStack alignment="center" spacing={6} frame={{ maxWidth: Infinity }}>
        <Text font={9} foregroundStyle="secondaryLabel" lineLimit={1}>
          IPv4
        </Text>
        <Spacer />
        <Badge text={countryLabel(primary)} tone={sourceTone(primary)} />
      </HStack>

      <Text font={14.5} fontWeight="semibold" lineLimit={1} minScaleFactor={0.48}>
        {displayIp(primary, props.settings)}
      </Text>

      <InfoBlock label="Location" value={displayLocation(primary, props.settings)} strong />
      <InfoBlock label="ISP" value={ellipsis(primary?.isp, 28)} />
      <InfoBlock label="ASN" value={ellipsis(primary?.asn || primary?.isp, 28)} />

      <Separator />

      <Text
        font={9.8}
        fontWeight="semibold"
        foregroundStyle="secondaryLabel"
        lineLimit={1}
        minScaleFactor={0.62}
        multilineTextAlignment="center"
        frame={{ maxWidth: Infinity }}
        padding={{ top: 28, bottom: 28 }}
      >
        {props.data.primaryIPv6
          ? `IPv6 ${displayIp(props.data.primaryIPv6, props.settings)}`
          : "你的网络可能不支持 IPv6"}
      </Text>
    </Card>
  )
}

function CompactIpCard(props: { data: NetworkInfoData; settings: SkkIpInfoSettings }) {
  const primary =
    props.data.primaryInternational || props.data.primaryDomestic || props.data.primaryIPv6

  return (
    <Card padding={8} spacing={5}>
      <HStack alignment="center" spacing={8} frame={{ maxWidth: Infinity }}>
        <VStack spacing={2} alignment="leading" frame={{ maxWidth: Infinity }}>
          <Text font={8.5} foregroundStyle="secondaryLabel" lineLimit={1}>
            IPv4
          </Text>
          <Text font={15.5} fontWeight="bold" lineLimit={1} minScaleFactor={0.5}>
            {displayIp(primary, props.settings)}
          </Text>
          <Text font={8.8} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.6}>
            {displayLocation(primary, props.settings)}
          </Text>
        </VStack>
        <VStack spacing={1} alignment="trailing">
          <Text font={8.5} foregroundStyle="secondaryLabel" lineLimit={1}>
            风险值
          </Text>
          <Text font={18} fontWeight="bold" foregroundStyle={riskColor(props.data.risk)} lineLimit={1}>
            {String(riskScore(props.data.risk))}
          </Text>
          <Text font={8.2} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.7}>
            {riskLevel(props.data.risk)} · {riskTitle(props.data.risk)}
          </Text>
        </VStack>
      </HStack>
    </Card>
  )
}

function SourceLine(props: { item: IpSourceResult; settings: SkkIpInfoSettings }) {
  const name = props.settings.showSourceName
    ? props.item.name
    : props.item.kind === "domestic"
      ? "国内探针"
      : "国际探针"

  return (
    <VStack spacing={1} frame={{ maxWidth: Infinity }}>
      <HStack alignment="center" spacing={5} frame={{ maxWidth: Infinity }}>
        <Text font={9.2} fontWeight="bold" lineLimit={1} minScaleFactor={0.68}>
          {name}
        </Text>
        <Spacer />
        <Badge text={props.item.kind === "domestic" ? "国内" : "国际"} tone={sourceTone(props.item)} />
      </HStack>
      <Text font={8.2} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.62}>
        IP: {displayIp(props.item, props.settings)}
      </Text>
      <Text font={8.2} lineLimit={1} minScaleFactor={0.58}>
        {ellipsis(`${displayLocation(props.item, props.settings)} ${text(props.item.isp || props.item.asn, "")}`, 34)}
      </Text>
    </VStack>
  )
}

function Separator() {
  return (
    <Rectangle
      fill="systemGray5"
      frame={{ maxWidth: Infinity, height: 1 }}
    />
  )
}

function SourceListCard(props: { data: NetworkInfoData; settings: SkkIpInfoSettings }) {
  const sources = pickReferenceSources(props.data).slice(0, 4)
  const rows: any[] = []
  sources.forEach((item, index) => {
    if (index > 0) rows.push(<Separator key={`${item.id}-separator`} />)
    rows.push(<SourceLine key={item.id} item={item} settings={props.settings} />)
  })
  return (
    <Card padding={8} spacing={4}>
      {rows}
    </Card>
  )
}

function CompactSourceLine(props: { item: IpSourceResult; settings: SkkIpInfoSettings }) {
  return (
    <VStack spacing={1} frame={{ maxWidth: Infinity }}>
      <HStack alignment="center" spacing={4} frame={{ maxWidth: Infinity }}>
        <Text font={7.8} fontWeight="bold" lineLimit={1} minScaleFactor={0.58} foregroundStyle={UI.text}>
          {props.item.name}
        </Text>
        <Spacer />
        <Badge text={props.item.kind === "domestic" ? "国内" : "国际"} tone={sourceTone(props.item)} />
      </HStack>
      <Text font={7.1} foregroundStyle={UI.subtext} lineLimit={1} minScaleFactor={0.55}>
        IP: {displayIp(props.item, props.settings)}
      </Text>
      <Text font={7.1} foregroundStyle={UI.text} lineLimit={1} minScaleFactor={0.5}>
        {ellipsis(`${displayLocation(props.item, props.settings)} ${text(props.item.isp || props.item.asn, "")}`, 42)}
      </Text>
    </VStack>
  )
}

function IpOverviewBlock(props: { data: NetworkInfoData; settings: SkkIpInfoSettings }) {
  const primary =
    props.data.primaryInternational || props.data.primaryDomestic || props.data.primaryIPv6
  return (
    <OutlineBlock tone={UI.green} padding={7} spacing={4} minHeight={128}>
      <HStack alignment="center" spacing={4} frame={{ maxWidth: Infinity }}>
        <Text font={8.2} foregroundStyle={UI.subtext} lineLimit={1}>
          IPv4
        </Text>
        <Spacer />
        <Badge text={countryLabel(primary)} tone={sourceTone(primary)} />
      </HStack>
      <Text font={15.5} fontWeight="bold" foregroundStyle={UI.text} lineLimit={1} minScaleFactor={0.5}>
        {displayIp(primary, props.settings)}
      </Text>
      <InfoBlock label="Location" value={displayLocation(primary, props.settings)} strong />
      <InfoBlock label="ISP" value={ellipsis(primary?.isp, 30)} />
      <InfoBlock label="ASN" value={ellipsis(primary?.asn || primary?.isp, 30)} />
      <Text font={8.4} fontWeight="semibold" foregroundStyle={UI.subtext} lineLimit={1} minScaleFactor={0.58}>
        {props.data.primaryIPv6
          ? `IPv6 ${displayIp(props.data.primaryIPv6, props.settings)}`
          : "你的网络可能不支持 IPv6"}
      </Text>
    </OutlineBlock>
  )
}

function ProbeBlock(props: { data: NetworkInfoData; settings: SkkIpInfoSettings }) {
  const sources = pickReferenceSources(props.data).slice(0, 4)
  const rows: any[] = []
  sources.forEach((item, index) => {
    if (index > 0) rows.push(<Separator key={`${item.id}-compact-separator`} />)
    rows.push(<CompactSourceLine key={item.id} item={item} settings={props.settings} />)
  })
  return (
    <OutlineBlock tone={UI.blue} padding={7} spacing={3} minHeight={128}>
      {rows}
    </OutlineBlock>
  )
}

function MiniInfoCell(props: { label: string; value: string; tone?: any }) {
  return (
    <VStack
      spacing={1}
      padding={{ top: 4, leading: 6, bottom: 4, trailing: 6 }}
      frame={{ minWidth: 0, maxWidth: Infinity }}
      widgetBackground={{
        style: { light: "rgba(255,255,255,0.50)", dark: "rgba(255,255,255,0.06)" } as any,
        shape: { type: "rect", cornerRadius: 8, style: "continuous" },
      }}
    >
      <Text font={7.2} foregroundStyle={UI.subtext} lineLimit={1}>
        {props.label}
      </Text>
      <Text
        font={8.2}
        fontWeight="bold"
        foregroundStyle={props.tone || UI.text}
        lineLimit={1}
        minScaleFactor={0.52}
      >
        {props.value}
      </Text>
    </VStack>
  )
}

function NetworkSummaryBlock(props: {
  data: NetworkInfoData
  settings: SkkIpInfoSettings
  fromCache: boolean
  staleFallback?: boolean
}) {
  const primary =
    props.data.primaryInternational || props.data.primaryDomestic || props.data.primaryIPv6
  const risk = props.data.risk || ({} as RiskInfo)
  return (
    <OutlineBlock tone={riskColor(risk)} padding={7} spacing={4}>
      <HStack alignment="center" spacing={5} frame={{ maxWidth: Infinity }}>
        <Text font={8.4} fontWeight="semibold" foregroundStyle={UI.subtext} lineLimit={1}>
          网络摘要
        </Text>
        <Spacer />
        <Text font={7.4} foregroundStyle={UI.subtext} lineLimit={1}>
          {formatTime(props.data.updatedAt)}
          {props.fromCache ? " 缓存" : ""}
          {props.staleFallback ? " 兜底" : ""}
        </Text>
      </HStack>
      <HStack spacing={5} frame={{ maxWidth: Infinity }}>
        <MiniInfoCell label="出口" value={`${countryLabel(primary)} / 国际`} tone={UI.blue} />
        <MiniInfoCell
          label="IPv6"
          value={props.data.primaryIPv6 ? "可用" : "不可用"}
          tone={props.data.primaryIPv6 ? UI.green : UI.orange}
        />
      </HStack>
      <HStack spacing={5} frame={{ maxWidth: Infinity }}>
        <MiniInfoCell label="ISP" value={ellipsis(primary?.isp || primary?.asn, 18)} />
        <MiniInfoCell
          label="风险"
          value={`${riskLevel(risk)} · ${text(risk.lineType, "未知")}`}
          tone={riskColor(risk)}
        />
      </HStack>
    </OutlineBlock>
  )
}

function dotColor(item: ServiceResult, index: number): any {
  if (!item.ok) return index < 2 ? "systemRed" : "systemGray4"
  const latency = item.latencyMs || 0
  if (/仅自制|部分/i.test(String(item.statusText || ""))) {
    return index % 3 === 0 ? "systemYellow" : "systemGreen"
  }
  if (latency <= 120) return index % 5 === 0 ? "systemGreen" : "#2F8D46"
  if (latency <= 350) return index % 3 === 0 ? "systemYellow" : "systemGreen"
  return index % 2 === 0 ? "systemOrange" : "systemYellow"
}

function DotStrip(props: { item: ServiceResult; count?: number }) {
  const count = props.count ?? 6
  return (
    <HStack spacing={2.4}>
      {Array.from({ length: count }).map((_, index) => (
        <Circle
          fill={dotColor(props.item, index)}
          key={index}
          frame={{ width: 4, height: 4 }}
        />
      ))}
    </HStack>
  )
}

function ServiceTile(props: { item: ServiceResult }) {
  return (
    <VStack
      alignment="leading"
      spacing={2.5}
      padding={{ top: 4, leading: 5, bottom: 4, trailing: 5 }}
      frame={{ minWidth: 0, maxWidth: Infinity }}
      widgetBackground={{
        style: { light: "rgba(0,0,0,0.03)", dark: "rgba(255,255,255,0.07)" } as any,
        shape: { type: "rect", cornerRadius: 8, style: "continuous" },
      }}
    >
      <HStack alignment="center" spacing={4} frame={{ maxWidth: Infinity }}>
        <Circle
          fill={statusColor(props.item.ok, props.item.statusText)}
          frame={{ width: 6.5, height: 6.5 }}
        />
        <Text font={8.4} fontWeight="bold" lineLimit={1} minScaleFactor={0.52}>
          {props.item.name}
        </Text>
        <Spacer />
        <Badge
          text={serviceLabel(props.item)}
          tone={props.item.region === "国内" ? "domestic" : "international"}
        />
      </HStack>
      <HStack alignment="center" spacing={4} frame={{ maxWidth: Infinity }}>
        <Text
          font={8.8}
          fontWeight="bold"
          foregroundStyle={statusColor(props.item.ok, props.item.statusText)}
          lineLimit={1}
          minScaleFactor={0.7}
        >
          {props.item.ok ? latencyText(props.item.latencyMs) : "失败"}
        </Text>
        <Spacer />
        <Text font={7.2} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.58}>
          {props.item.countryCode || props.item.statusText || ""}
        </Text>
      </HStack>
      <DotStrip item={props.item} />
    </VStack>
  )
}

function ServiceCompactTile(props: { item: ServiceResult }) {
  return (
    <VStack
      alignment="leading"
      spacing={2}
      padding={{ top: 4, leading: 5, bottom: 4, trailing: 5 }}
      frame={{ minWidth: 0, maxWidth: Infinity }}
      widgetBackground={{
        style: { light: "rgba(255,255,255,0.50)", dark: "rgba(255,255,255,0.06)" } as any,
        shape: { type: "rect", cornerRadius: 8, style: "continuous" },
      }}
    >
      <HStack alignment="center" spacing={4} frame={{ maxWidth: Infinity }}>
        <Circle
          fill={statusColor(props.item.ok, props.item.statusText)}
          frame={{ width: 5.5, height: 5.5 }}
        />
        <Text font={7.8} fontWeight="bold" foregroundStyle={UI.text} lineLimit={1} minScaleFactor={0.48}>
          {props.item.name}
        </Text>
        <Spacer />
        <Badge
          text={serviceLabel(props.item)}
          tone={props.item.region === "国内" ? "domestic" : "international"}
        />
      </HStack>
      <HStack alignment="center" spacing={4} frame={{ maxWidth: Infinity }}>
        <Text
          font={9.2}
          fontWeight="bold"
          foregroundStyle={statusColor(props.item.ok, props.item.statusText)}
          lineLimit={1}
          minScaleFactor={0.66}
        >
          {props.item.ok ? latencyText(props.item.latencyMs) : "失败"}
        </Text>
        <Spacer />
        <Text font={7.1} foregroundStyle={UI.subtext} lineLimit={1} minScaleFactor={0.52}>
          {props.item.countryCode || props.item.statusText || ""}
        </Text>
      </HStack>
      <DotStrip item={props.item} count={4} />
    </VStack>
  )
}

function servicePriority(item: ServiceResult) {
  const order = [
    "youtube",
    "chatgpt",
    "spotify",
    "netflix",
    "disney",
    "max",
    "openai_api",
    "github",
    "cloudflare",
    "jsdelivr",
    "bytedance",
    "bilibili",
    "wechat",
    "taobao",
  ]
  const index = order.indexOf(item.id)
  return index >= 0 ? index : 99
}

function pickServices(data: NetworkInfoData, limit: number) {
  return [...(data.services || data.connectivity || [])]
    .sort((a, b) => servicePriority(a) - servicePriority(b))
    .slice(0, limit)
}

function ServiceCompactGrid(props: { items: ServiceResult[] }) {
  const rows: ServiceResult[][] = []
  props.items.forEach((item, index) => {
    const row = Math.floor(index / 3)
    if (!rows[row]) rows[row] = []
    rows[row].push(item)
  })

  return (
    <VStack spacing={5} frame={{ maxWidth: Infinity }}>
      {rows.map((row, index) => (
        <HStack key={index} spacing={5} frame={{ maxWidth: Infinity }}>
          {row.map((item) => (
            <ServiceCompactTile key={item.id} item={item} />
          ))}
          {row.length < 3 ? <Spacer /> : null}
        </HStack>
      ))}
    </VStack>
  )
}

function ServiceGrid(props: { items: ServiceResult[]; columns: 2 | 3 | 4 }) {
  const rows: ServiceResult[][] = []
  props.items.forEach((item, index) => {
    const row = Math.floor(index / props.columns)
    if (!rows[row]) rows[row] = []
    rows[row].push(item)
  })

  return (
    <VStack spacing={5} frame={{ maxWidth: Infinity }}>
      {rows.map((row, index) => (
        <HStack key={index} spacing={5} frame={{ maxWidth: Infinity }}>
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
    props.data.primaryInternational || props.data.primaryDomestic || props.data.primaryIPv6

  return (
    <Root compact>
      <Header
        title={props.settings.title}
        updatedAt={props.data.updatedAt}
        fromCache={props.fromCache}
        staleFallback={props.staleFallback}
      />
      <Spacer minLength={2} />
      <VStack spacing={4} frame={{ maxWidth: Infinity }}>
        <Text font={16} fontWeight="bold" lineLimit={1} minScaleFactor={0.48}>
          {displayIp(primary, props.settings)}
        </Text>
        <Text font={9.5} foregroundStyle="secondaryLabel" lineLimit={2} minScaleFactor={0.62}>
          {displayLocation(primary, props.settings)}
        </Text>
        <Text font={8.5} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.62}>
          风险值 {riskScore(props.data.risk)} · {riskTitle(props.data.risk)}
        </Text>
      </VStack>
      <Spacer />
      <RiskStrip risk={props.data.risk} />
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
    <Root compact>
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
        <Text font={9} foregroundStyle="secondaryLabel">
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
  const services = pickServices(props.data, 8)
  return (
    <Root>
      <HStack alignment="top" spacing={7} frame={{ maxWidth: Infinity }}>
        <PrimaryIpCard data={props.data} settings={props.settings} />
        <SourceListCard data={props.data} settings={props.settings} />
      </HStack>

      <StatusStrip
        data={props.data}
        settings={props.settings}
        fromCache={props.fromCache}
        staleFallback={props.staleFallback}
      />

      {services.length ? (
        <ServicePanel>
          <Text font={9.5} fontWeight="semibold" foregroundStyle="secondaryLabel" lineLimit={1}>
            服务检测
          </Text>
          <ServiceGrid items={services} columns={4} />
        </ServicePanel>
      ) : (
        <Text font={9} foregroundStyle="secondaryLabel">
          完整检测缓存未刷新
        </Text>
      )}
    </Root>
  )
}

function ErrorView(props: { title: string; message: string }) {
  return (
    <Root compact>
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

function widgetSafeSettings(settings: SkkIpInfoSettings): SkkIpInfoSettings {
  return {
    ...settings,
    timeoutMs: Math.min(settings.timeoutMs || 3000, 1500),
    enableIPv6: false,
    enableConnectivity: false,
  }
}

async function render() {
  const settings = loadSkkIpInfoSettings()
  const refreshMinutes = clampRefreshMinutes(settings.refreshIntervalMinutes)
  const reloadPolicy: WidgetReloadPolicy = {
    policy: "after",
    date: new Date(Date.now() + refreshMinutes * 60 * 1000),
  }

  try {
    const result = await fetchNetworkInfoCached(widgetSafeSettings(settings), {
      preferAnyCache: true,
      lite: true,
    })
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
