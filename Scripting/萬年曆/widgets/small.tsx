import { GridItem, VStack, Widget, HStack, Spacer, Text, Button, Image, LazyVGrid, Divider, Capsule, Rectangle, RoundedRectangle } from "scripting"
import { SELECT_KEY, BackToTodayIntent, SelectDayIntent } from "../app_intents"
import { DateDetails } from "../components/date_details"
import { DateGrid } from "../components/dates_grid"
import { ParsedDayInfo } from "../type"
import { dateKey } from "../util"

export function SmallWidgetView({ days, events, reminders, selected }: {
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
      font={12}
      selectedDay={selectedDay}
      isNotToday={isNotToday}
      dayEvents={dayEvents}
      dayReminders={dayReminders}
    />
  }

  selectedDay ??= days.find(dd => dd.isToday)

  const match = selectedDay?.match

  const dayList: ParsedDayInfo[][] = []

  for (let i = 0; i < 6; i++) {
    const start = i * 7
    const end = start + 7
    dayList.push(days.slice(start, end))
  }

  let dayRowsToRender: ParsedDayInfo[][] = []

  // 找出今天所在的行，以及上下两行
  const todayRow = dayList.findIndex(dl => dl.find(d => d.isToday))
  if (todayRow === 0) {
    dayRowsToRender = dayList.slice(0, 3)
  } else if (todayRow === dayList.length - 1) {
    dayRowsToRender = dayList.slice(-3)
  } else {
    dayRowsToRender = dayList.slice(todayRow - 1, todayRow + 2)
  }

  return (
    <VStack
      frame={Widget.displaySize}
      spacing={4}
      transition={Transition.flipFromTop()}
    >
      <HStack
        padding={{
          vertical: 2
        }}
        font={12}
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
            font={12}
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

      {dayRowsToRender.map((dl) => (
        <>
          <Spacer />
          <HStack>
            {dl.map((d) => {
              const key = dateKey(d.year, d.month, d.day)
              const isSelected = selectedKey === key
              const isToday = d.isToday
              const hasEvents = d.hasEvents
              const hasTerm = d.hasTerm
              const hasReminders = d.hasReminders

              const buttonLabel = d.showHoliday ? '休' : d.showWorkDay ? '班' : d.match?.lDate

              return <VStack
                spacing={0}
                alignment="center"
                // padding={1}
                frame={{
                  maxWidth: 'infinity'
                }}
                background={
                  isToday
                    ? <Capsule
                      fill="accentColor"
                    />
                    : undefined
                }
              >
                <Button
                  buttonStyle="plain"
                  intent={
                    isSelected || isToday ? BackToTodayIntent()
                      : SelectDayIntent({
                        year: d.year,
                        month: d.month,
                        day: d.day
                      })
                  }
                >
                  <Text
                    font={10}
                    // fontWeight="medium"
                    minScaleFactor={0.8}
                    multilineTextAlignment="center"
                    foregroundStyle={{
                      light: isToday
                        ? "white"
                        : isSelected
                          ? "white"
                          : d.isHolidayDisplay
                            ? "#F04A4A"
                            : d.isOtherMonth
                              ? "#555555"
                              : "label",
                      dark: isToday
                        ? "white"
                        : isSelected
                          ? "white"
                          : d.isHolidayDisplay
                            ? "#F04A4A"
                            : d.isOtherMonth
                              ? "#555555"
                              : "#E6E6E6",
                    }}
                  >
                    {d.day || " "}
                  </Text>
                </Button>

                <Text
                  font={6}
                  multilineTextAlignment="center"
                  foregroundStyle={
                    isToday || isSelected ? "white" : "#7D7D7D"
                  }
                >
                  {buttonLabel ?? ' '}
                </Text>
                {
                 !isSelected && !isToday && (hasTerm || hasEvents || hasReminders)
                    ? <HStack
                      spacing={1}
                      frame={{
                        height: 2,
                        width: 16
                      }}>
                      <Spacer />
                      {hasTerm ?
                        <RoundedRectangle
                          cornerRadius={2}
                          frame={{ width: 4, height: 2 }}
                          fill="systemPurple"
                        /> : null}
                      {hasEvents ?
                        <RoundedRectangle
                          cornerRadius={2}
                          frame={{ width: 4, height: 2 }}
                          fill="systemTeal"
                        />
                        : null}
                      {hasReminders ?
                        <RoundedRectangle
                          cornerRadius={2}
                          frame={{ width: 4, height: 2 }}
                          fill="systemPink"
                        />
                        : null}
                      <Spacer />
                    </HStack>
                    : <Rectangle
                      frame={{
                        height: 2
                      }}
                      fill={"rgba(0,0,0,0)"}
                    />
                }
              </VStack>
            })}
          </HStack>
        </>
      ))}
      <Spacer />
    </VStack>
  )
}