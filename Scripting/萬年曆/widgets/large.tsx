import { GridItem, VStack, Widget, HStack, Spacer, Text, Button, Image, LazyVGrid, Divider } from "scripting"
import { SELECT_KEY, BackToTodayIntent } from "../app_intents"
import { DateDetails } from "../components/date_details"
import { DateGrid } from "../components/dates_grid"
import { ParsedDayInfo } from "../type"
import { dateKey } from "../util"

export function LargeWidgetView({ days, events, reminders, selected }: {
  days: ParsedDayInfo[]
  events: Map<string, CalendarEvent[]>
  reminders: Map<string, Reminder[]>
  selected: {
    year: number
    month: number
    day: number
  } | null
}) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const d = now.getDate()
  const columns: GridItem[] = new Array(7).fill({
    size: {
      type: "flexible"
    }
  })
  const weekNames = ["日", "一", "二", "三", "四", "五", "六"]

  const selectedRaw = selected ?? (Storage.get<string>(SELECT_KEY) ? JSON.parse(Storage.get<string>(SELECT_KEY)!) : null)

  const selectedKey = selectedRaw ? dateKey(selectedRaw.year, selectedRaw.month, selectedRaw.day) : null
  let selectedDay = selectedRaw
    ? days.find(dd => dd.year === selectedRaw.year && dd.month === selectedRaw.month && dd.day === selectedRaw.day)
    : null
  // : days.find(dd => dd.isToday)

  const todayKey = dateKey(y, m, d)
  const dayEvents = events.get(selectedKey ?? todayKey) ?? []
  const dayReminders = reminders.get(selectedKey ?? todayKey) ?? []
  const isNotToday = !!selectedKey && selectedKey !== todayKey

  if (selectedDay != null) {
    return <DateDetails
      frame={{
        maxHeight: 'infinity'
      }}
      selectedDay={selectedDay}
      isNotToday={isNotToday}
      dayEvents={dayEvents}
      dayReminders={dayReminders}
    />
  }

  selectedDay ??= days.find(dd => dd.isToday)

  return (
    <VStack
      frame={Widget.displaySize}
      spacing={4}
      transition={Transition.flipFromTop()}
    >
      <HStack
        padding={{
          vertical: 8
        }}
        alignment="center"
        spacing={4}
        background={"#F04A4A"}
      >
        <Spacer />
        <Text
          // font={12}
          bold
          foregroundStyle="white"
        >
          {selectedDay?.year}年{selectedDay?.month}月
        </Text>

        {isNotToday && <Button
          buttonStyle="plain"
          intent={BackToTodayIntent()}
        >
          <Image
            systemName="arrow.uturn.backward.square.fill"
            imageScale="small"
            foregroundStyle="white"
          />
        </Button>}
        <Spacer />
      </HStack>

      {/* 星期标题 */}
      <LazyVGrid
        columns={columns}
        spacing={2}
      >
        {weekNames.map((w, idx) => (
          <Text
            key={idx}
            fontWeight="bold"
            // font={12}
            multilineTextAlignment="center"
            foregroundStyle={
              (idx === 0 || idx === 6) ? "#F04A4A" : "label"
            }
          >
            {w}
          </Text>
        ))}
      </LazyVGrid>

      <Divider />

      {/* 日期网格 */}
      <DateGrid
        days={days}
        columns={columns}
        selectedKey={selectedKey}
      />
      <Spacer />
    </VStack>
  )
}