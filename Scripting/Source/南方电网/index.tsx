// index.tsx（南方电网 / CSG）
// Author: ByteValley
// Data source: 95598.csg.cn

import {
  Widget,
  VStack,
  HStack,
  Text,
  Spacer,
  Button,
  TextField,
  List,
  Section,
  Navigation,
  NavigationStack,
  useState,
  fetch,
  WidgetReloadPolicy,
} from "scripting"

declare const Storage: any

type CSGSettings = {
  token: string
  accountIndex: number
  refreshInterval: number
  barCount: number
  cacheEnabled: boolean
  cacheTtlMinutes: number
}

type CachePayload = {
  updatedAt: number
  data: any[]
}

const VERSION = "1.0.0"
const BUILD_DATE = "2026-05-15"

const SETTINGS_KEY = "csg_settings.v1"
const CACHE_KEY = "csg_cache.data.v1"

// 兼容 BoxJs / 重写脚本常用写入键
const TOKEN_KEYS = [
  "csg_token",
  "@csg.token",
  "CSG_TOKEN",
  "95598_csg_token",
]

const CSG_BIND_URL =
  "https://95598.csg.cn/ucs/ma/zt/eleCustNumber/queryBindEleUsers"
const CSG_BALANCE_URL =
  "https://95598.csg.cn/ucs/ma/zt/charge/queryUserAccountNumberSurplus"
const CSG_POWER_URL =
  "https://95598.csg.cn/ucs/ma/zt/charge/queryDayElectricByMPoint"

const defaultSettings: CSGSettings = {
  token: "",
  accountIndex: 0,
  refreshInterval: 180,
  barCount: 7,
  cacheEnabled: true,
  cacheTtlMinutes: 180,
}

function storageGet(key: string): any {
  try {
    return Storage.get(key)
  } catch {
    return null
  }
}

function storageSet(key: string, value: any) {
  try {
    Storage.set(key, value)
  } catch {}
}

function loadSettings(): CSGSettings {
  const raw = storageGet(SETTINGS_KEY)
  let obj: any = null

  if (raw && typeof raw === "object") obj = raw
  if (!obj && typeof raw === "string") {
    try {
      obj = JSON.parse(raw)
    } catch {}
  }

  const merged = {
    ...defaultSettings,
    ...(obj && typeof obj === "object" ? obj : {}),
  }

  merged.token = String(merged.token || "")
  merged.accountIndex = Math.max(0, Number(merged.accountIndex) || 0)
  merged.refreshInterval = Math.max(60, Number(merged.refreshInterval) || 180)
  merged.barCount = Math.max(3, Math.min(30, Number(merged.barCount) || 7))
  merged.cacheEnabled = merged.cacheEnabled !== false
  merged.cacheTtlMinutes = Math.max(60, Number(merged.cacheTtlMinutes) || 180)

  return merged
}

function saveSettings(settings: CSGSettings) {
  storageSet(SETTINGS_KEY, settings)
}

function getTokenFromStorage(): string {
  const settings = loadSettings()
  if (settings.token.trim()) return settings.token.trim()

  for (const key of TOKEN_KEYS) {
    const v = storageGet(key)
    if (typeof v === "string" && v.trim()) return v.trim()
  }

  return ""
}

function readCache(): CachePayload | null {
  const raw = storageGet(CACHE_KEY)
  if (!raw || typeof raw !== "object") return null
  if (typeof raw.updatedAt !== "number") return null
  if (!Array.isArray(raw.data)) return null
  return raw as CachePayload
}

function writeCache(data: any[]) {
  storageSet(CACHE_KEY, {
    updatedAt: Date.now(),
    data,
  })
}

function toHM(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

function toMDHM(d: Date) {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${toHM(d)}`
}

function currentYearMonth() {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`
}

function withTimeout<T>(p: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${tag} timeout after ${ms}ms`)), ms)
    p.then(
      v => {
        clearTimeout(timer)
        resolve(v)
      },
      e => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

async function postCsg(url: string, body: any, token: string): Promise<any | null> {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "x-auth-token": token,
      "Content-Type": "application/json;charset=UTF-8",
      Accept: "application/json, text/plain, */*",
      Origin: "https://95598.csg.cn",
      Referer: "https://95598.csg.cn/",
    },
    body: JSON.stringify(body || {}),
  })

  if (!resp || !resp.ok) return null
  return await resp.json()
}

function arr(v: any): any[] {
  if (Array.isArray(v)) return v
  if (Array.isArray(v?.data)) return v.data
  if (Array.isArray(v?.data?.result)) return v.data.result
  if (Array.isArray(v?.result)) return v.result
  return []
}

function pickFirst(obj: any, keys: string[], fallback = "") {
  for (const k of keys) {
    const v = obj?.[k]
    if (v !== undefined && v !== null && String(v) !== "") return String(v)
  }
  return fallback
}

async function fetchFromNetwork(): Promise<any[] | null> {
  const token = getTokenFromStorage()
  if (!token) throw new Error("缺少 x-auth-token，请先打开南方电网 App/小程序让重写脚本写入，或在设置里手动填写。")

  const bindRes = await withTimeout(postCsg(CSG_BIND_URL, {}, token), 7000, "CSG(bind)")
  const users = arr(bindRes)

  if (!users.length) throw new Error("未获取到绑定户号，可能是 Token 失效或接口字段变化。")

  const result: any[] = []

  for (const user of users) {
    const areaCode = pickFirst(user, ["areaCode", "orgNo", "areaNo"])
    const eleCustId = pickFirst(user, ["eleCustId", "bindingId", "consNo", "eleCustNumber", "custNo"])
    const meteringPointId = pickFirst(user, ["meteringPointId", "meterAssetNo", "mpId", "meterId"])
    const userName = pickFirst(user, ["eleCustName", "consName", "userName", "custName"], "南方电网")

    const [balanceRes, powerRes] = await Promise.all([
      withTimeout(postCsg(CSG_BALANCE_URL, { areaCode, eleCustId }, token), 7000, "CSG(balance)"),
      withTimeout(
        postCsg(CSG_POWER_URL, { areaCode, eleCustId, meteringPointId, yearMonth: currentYearMonth() }, token),
        7000,
        "CSG(power)",
      ),
    ])

    const balanceList = arr(balanceRes)
    const balanceObj = balanceList[0] || balanceRes?.data || {}
    const powerObj = powerRes?.data || powerRes || {}
    const dayList = arr(powerObj)

    const normalizedDayList = dayList.map((item: any) => ({
      day: pickFirst(item, ["day", "date", "dataDate", "statDate"]),
      dayElePq: pickFirst(item, ["power", "dayElePq", "electricity", "pq", "elePq"], "0"),
    }))

    const totalPower = pickFirst(powerObj, ["totalPower", "totalPq", "monthPower"], "") ||
      String(normalizedDayList.reduce((s: number, x: any) => s + Number(x.dayElePq || 0), 0).toFixed(2))

    const balance = pickFirst(balanceObj, ["balance", "surplus", "acctBalance", "sumMoney", "availableBalance"], "0.00")

    result.push({
      userName,
      eleCustId,
      balance,
      totalPower,
      dayList: normalizedDayList,
      updatedAt: Date.now(),
    })
  }

  writeCache(result)
  return result
}

async function getData(forceRefresh = false): Promise<{ data: any[]; fromCache: boolean; updatedAt: number }> {
  const settings = loadSettings()
  const cache = readCache()
  const ttlMs = settings.cacheTtlMinutes * 60 * 1000

  if (!forceRefresh && settings.cacheEnabled && cache && Date.now() - cache.updatedAt <= ttlMs) {
    return { data: cache.data, fromCache: true, updatedAt: cache.updatedAt }
  }

  try {
    const data = await fetchFromNetwork()
    return { data: data || [], fromCache: false, updatedAt: Date.now() }
  } catch (e) {
    if (settings.cacheEnabled && cache) {
      return { data: cache.data, fromCache: true, updatedAt: cache.updatedAt }
    }
    throw e
  }
}

function lastNonZeroDay(dayList: any[]) {
  const list = [...(dayList || [])].reverse()
  return list.find(x => Number(x.dayElePq || 0) > 0) || list[0] || null
}

function BarChart({ dayList, count }: { dayList: any[]; count: number }) {
  const list = (dayList || []).slice(-count)
  const max = Math.max(...list.map(x => Number(x.dayElePq || 0)), 1)

  return (
    <HStack spacing={3} frame={{ height: 38 }}>
      {list.map((item, idx) => {
        const n = Number(item.dayElePq || 0)
        const h = Math.max(4, Math.round((n / max) * 34))
        return (
          <VStack key={String(idx)} alignment="bottom">
            <Spacer />
            <VStack frame={{ width: 6, height: h }} background="#36CFC9" cornerRadius={3} />
          </VStack>
        )
      })}
    </HStack>
  )
}

function Card({ account, fromCache, updatedAt, settings }: any) {
  const latest = lastNonZeroDay(account.dayList || [])
  const latestPower = latest ? String(latest.dayElePq || "0") : "0"

  return (
    <VStack padding={12} spacing={8} background="#F7FFFE">
      <HStack>
        <VStack spacing={2}>
          <Text font={15} fontWeight="semibold" foregroundStyle="#0F766E">南方电网</Text>
          <Text font={10} foregroundStyle="#64748B">{account.userName || "用电账户"}</Text>
        </VStack>
        <Spacer />
        <Text font={10} foregroundStyle="#94A3B8">{toMDHM(new Date(updatedAt))}{fromCache ? " 缓存" : ""}</Text>
      </HStack>

      <HStack spacing={12}>
        <VStack>
          <Text font={10} foregroundStyle="#64748B">账户余额</Text>
          <Text font={21} fontWeight="bold" foregroundStyle="#0F172A">¥{account.balance || "0.00"}</Text>
        </VStack>
        <Spacer />
        <VStack>
          <Text font={10} foregroundStyle="#64748B">本月用电</Text>
          <Text font={21} fontWeight="bold" foregroundStyle="#0F172A">{account.totalPower || "0.00"}°</Text>
        </VStack>
        <Spacer />
        <VStack>
          <Text font={10} foregroundStyle="#64748B">最近日用电</Text>
          <Text font={21} fontWeight="bold" foregroundStyle="#0F172A">{latestPower}°</Text>
        </VStack>
      </HStack>

      <BarChart dayList={account.dayList || []} count={settings.barCount} />
    </VStack>
  )
}

async function renderWidget() {
  const settings = loadSettings()
  const res = await getData(false)
  const list = res.data || []
  const index = Math.min(Math.max(0, settings.accountIndex), Math.max(0, list.length - 1))
  const account = list[index] || {}

  const reloadPolicy: WidgetReloadPolicy = {
    policy: "after",
    date: new Date(Date.now() + settings.refreshInterval * 60 * 1000),
  }

  Widget.present(<Card account={account} fromCache={res.fromCache} updatedAt={res.updatedAt} settings={settings} />, reloadPolicy)
}

function SettingsView() {
  const dismiss = Navigation.useDismiss()
  const initial = loadSettings()

  const [token, setToken] = useState(initial.token)
  const [accountIndex, setAccountIndex] = useState(String(initial.accountIndex))
  const [refreshInterval, setRefreshInterval] = useState(String(initial.refreshInterval))
  const [barCount, setBarCount] = useState(String(initial.barCount))
  const [cacheTtlMinutes, setCacheTtlMinutes] = useState(String(initial.cacheTtlMinutes))

  const handleSave = () => {
    saveSettings({
      ...initial,
      token: String(token || "").trim(),
      accountIndex: Math.max(0, Number(accountIndex) || 0),
      refreshInterval: Math.max(60, Number(refreshInterval) || 180),
      barCount: Math.max(3, Math.min(30, Number(barCount) || 7)),
      cacheEnabled: true,
      cacheTtlMinutes: Math.max(60, Number(cacheTtlMinutes) || 180),
    })
    dismiss()
  }

  return (
    <NavigationStack>
      <List navigationTitle="南方电网组件" navigationBarTitleDisplayMode="inline" toolbar={{
        topBarLeading: [<Button title="关闭" action={dismiss} />],
        topBarTrailing: [<Button title="保存" action={handleSave} />],
      }}>
        <Section header="认证">
          <TextField title="x-auth-token" value={token} onChangeText={setToken} placeholder="可留空，优先读取 BoxJs 写入值" />
          <Text font={12} foregroundStyle="#888888">优先读取 csg_token / @csg.token；这里填写后会覆盖 BoxJs Token。</Text>
        </Section>
        <Section header="显示">
          <TextField title="户号序号" value={accountIndex} onChangeText={setAccountIndex} keyboardType="numberPad" />
          <TextField title="刷新间隔/分钟" value={refreshInterval} onChangeText={setRefreshInterval} keyboardType="numberPad" />
          <TextField title="柱状图条数" value={barCount} onChangeText={setBarCount} keyboardType="numberPad" />
          <TextField title="缓存时间/分钟" value={cacheTtlMinutes} onChangeText={setCacheTtlMinutes} keyboardType="numberPad" />
        </Section>
        <Section header="关于">
          <Text>版本：{VERSION}（{BUILD_DATE}）</Text>
          <Text>数据源：南方电网 95598</Text>
        </Section>
      </List>
    </NavigationStack>
  )
}

async function main() {
  try {
    await renderWidget()
  } catch (e) {
    Widget.present(
      <VStack padding={12} spacing={6}>
        <Text font={15} fontWeight="semibold">南方电网</Text>
        <Text font={11} foregroundStyle="#EF4444">加载失败</Text>
        <Text font={10} foregroundStyle="#64748B">{String(e)}</Text>
      </VStack>,
    )
  }
}

// 在 App 内运行时展示设置页；作为桌面小组件时直接渲染
try {
  Widget.present ? main() : Navigation.present(<SettingsView />)
} catch {
  main()
}
