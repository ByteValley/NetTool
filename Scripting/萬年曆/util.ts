import { fetch } from "scripting"
import { SELECT_KEY } from "./app_intents"
import { AlmanacItem, DataResponse, ParsedDayInfo } from "./type"

export function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`
}

export function dateKey(y: number, m: number, d: number) {
  return `${y}-${m}-${d}`
}

export async function loadCalendarData(): Promise<{
  days: ParsedDayInfo[],
  events: Map<string, CalendarEvent[]>,
  reminders: Map<string, Reminder[]>
  selected: { year: number; month: number; day: number } | null
}> {
  const now = new Date()//new Date('2025-10-10')
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const todayDate = now.toLocaleDateString()
  const cacheKey = `calendar.cache`
  const cached = Storage.get<string>(cacheKey)
  let parsed: {
    days: ParsedDayInfo[]
  } | null = null

  if (cached) {
    try {
      const res = JSON.parse(cached)
      if (res.date == todayDate && res.content) {
        parsed = res.content
      }
    } catch {

    }
  }

  const url = `https://opendata.baidu.com/api.php?tn=wisetpl&format=json&resource_id=39043&query=${y}年${m}月`
  if (!parsed) {
    const response = await fetch(url)
    const d = await response.data()
    const text = d.toRawString(response.textEncodingName as Encoding)
    if (text == null) throw new Error("Failed to decode data")
    const json = JSON.parse(text) as DataResponse
    const almanac = json?.data?.[0]?.almanac ?? []
    parsed = {
      days: buildCalendar(almanac, now)
    }
    Storage.set(cacheKey, JSON.stringify({
      date: todayDate,
      content: parsed
    }))
  }

  const events = await fetchMonthEvents(y, m)
  const reminders = await fetchMonthReminders(y, m)

  parsed.days.forEach((day: any) => {
    if (!day.isOtherMonth && day.day) {
      day.hasEvents = (events.get(dateKey(day.year, day.month, day.day)) ?? []).length > 0
      day.hasReminders = (reminders.get(dateKey(day.year, day.month, day.day)) ?? []).length > 0
    }
  })

  const selectedRaw = Storage.get<string>(SELECT_KEY)
  const selected: {
    year: number
    month: number
    day: number
  } | null = selectedRaw ? JSON.parse(selectedRaw) : null

  return {
    days: parsed.days,
    events,
    reminders,
    selected,
  }
}

// 构造日历
export function buildCalendar(almanac: AlmanacItem[], now: Date) {
  const today = now.getDate()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const lastDay = new Date(year, month, 0).getDate()
  const firstDayWeek = new Date(year, now.getMonth(), 1).getDay()
  const pick = (m: number, d: number) => {
    return almanac.find((a: any) => Number(a.month) === m && Number(a.day) === d)
  }
  const arr: ParsedDayInfo[] = []

  for (let i = 0; i < firstDayWeek; i++) {
    arr.push({ day: 0, isOtherMonth: true } as any)
  }

  for (let d = 1; d <= lastDay; d++) {
    const match = pick(month, d)
    const showHoliday = match?.status === "1"
    const showWorkDay = match?.status === "2"
    const isWeekend = match?.cnDay === "六" || match?.cnDay === "日"
    const isHolidayDisplay = (isWeekend && !showWorkDay) || showHoliday
    // const lText = match?.lDate || ""
    arr.push({
      day: d,
      year, month,
      isToday: d === today,
      isOtherMonth: false,
      isHolidayDisplay,
      showHoliday,
      showWorkDay,
      hasTerm: !!(match?.term || match?.festivalList),
      match,
      hasEvents: false,
      hasReminders: false,
    })
  }

  while (arr.length < 42)
    arr.push({ day: 0, isOtherMonth: true } as any)
  return arr
}

// =============================================================
// 拉取当月事件
export async function fetchMonthEvents(year: number, month: number) {
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59)
  const events = await CalendarEvent.getAll(start, end)
  const map = new Map<string, CalendarEvent[]>()

  for (const ev of events) {
    const base = new Date(ev.startDate)
    addToMap(map, base, ev)
  }

  return map
}

// 拉取当月待办事项
export async function fetchMonthReminders(year: number, month: number) {
  const start = new Date(year, month - 1, 0)
  const end = new Date(year, month, 0, 23, 59, 59)
  const reminders = await Reminder.getIncompletes({
    startDate: start,
    endDate: end
  })
  const map = new Map<string, Reminder[]>()

  for (const ev of reminders) {
    const base = ev.dueDateComponents?.date
    if (base) {
      addToMap(map, base, ev)
    }
  }

  return map
}

export function addToMap(map: Map<string, any[]>, date: Date, ev: any) {
  const key = dateKey(date.getFullYear(), date.getMonth() + 1, date.getDate())
  if (!map.has(key)) map.set(key, [])
  map.get(key)!.push(ev)
}
