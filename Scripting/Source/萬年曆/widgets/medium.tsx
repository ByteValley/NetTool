import { GridItem, VStack, Widget, HStack, Spacer, Text, Button, Image, LazyVGrid, Divider, Capsule, Circle, Rectangle, Link, RoundedRectangle } from "scripting"
import { SELECT_KEY, BackToTodayIntent, SelectDayIntent, CompleteReminderIntent } from "../app_intents"
import { ParsedDayInfo } from "../type"
import { dateKey, pad2 } from "../util"

export function MediumWidgetView({
  days, events, reminders, selected }: {

    days: ParsedDayInfo[]
    events: Map<string, CalendarEvent[]>
    reminders: Map<string, Reminder[]>
    selected: {
      year: number
      month: number
      day: number
    } | null
  }
) {
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
  const selectedDay = selectedRaw
    ? days.find(dd => dd.year === selectedRaw.year && dd.month === selectedRaw.month && dd.day === selectedRaw.day)
    : days.find(dd => dd.isToday)

  const todayKey = dateKey(y, m, d)
  const dayEvents = events.get(selectedKey ?? todayKey) ?? []
  const dayReminders = reminders.get(selectedKey ?? todayKey) ?? []
  const isNotToday = !!selectedKey && selectedKey !== todayKey
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
      spacing={0}
    >
      <HStack
        padding={{
          vertical: 4
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
          农历{match?.lMonth ?? "-"}月{match?.lDate}
        </Text>

        {selectedKey != null
          && <Button
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
      <HStack
        padding={8}
        spacing={8}
      >
        <VStack
          spacing={4}
          frame={{
            width: 180,
          }}
        >

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

          {dayRowsToRender.map((dl) => (
            <>
              <Spacer
                minLength={0}
              />
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
                    padding={1}
                    background={
                      isToday
                        ? <Capsule
                          fill="accentColor"
                        />
                        : isSelected
                          ? <Capsule
                            fill="systemOrange"
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
                        font={12}
                        fontWeight="medium"
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

        <Divider />

        <VStack
          alignment="leading"
          spacing={2}
          frame={{
            maxWidth: 'infinity'
          }}
          font={12}
        >
          {match != null
            && <VStack
              spacing={2}
              alignment="leading"
            >
              {match.yjJumpUrl.length > 0
                ? <Link
                  buttonStyle="plain"
                  url={match.yjJumpUrl}
                  padding={{
                    bottom: 4
                  }}
                >
                  <HStack
                    foregroundStyle="link"
                    lineLimit={1}
                  >
                    <Text>查看更多</Text>
                    <Image
                      systemName="arrow.up.right.square"
                    />
                  </HStack>
                </Link>
                : null
              }

              {match.term != null && match.term.length > 0
                && <Text
                  foregroundStyle="systemPurple"
                >{match.term}</Text>
              }

              {(match.term != null &&
                match.term.length == 0
                && match.festivalList != null)
                && <Text
                  foregroundStyle="systemPurple"
                  lineLimit={1}
                >
                  {match.festivalList}
                </Text>}

              {match.suit.length > 0
                && <HStack
                  spacing={8}
                  alignment={'top'}
                  foregroundStyle="secondaryLabel"
                >
                  <Text
                    padding={2}
                    background={
                      <Circle
                        fill="systemRed"
                      />
                    }
                    foregroundStyle="white"
                  >
                    宜
                  </Text>
                  <Text
                    multilineTextAlignment={'leading'}
                    minScaleFactor={0.8}
                  >
                    {match.suit}
                  </Text>
                </HStack>
              }
              {match.avoid.length > 0
                && <HStack
                  spacing={8}
                  alignment={'top'}
                  foregroundStyle="secondaryLabel"
                >
                  <Text
                    padding={2}
                    background={
                      <Circle
                        fill={{
                          light: "black",
                          dark: "white"
                        }}
                      />
                    }
                    foregroundStyle={{
                      light: "white",
                      dark: "black"
                    }}
                  >
                    忌
                  </Text>
                  <Text
                    multilineTextAlignment={'leading'}
                    minScaleFactor={0.8}
                  >
                    {match.avoid}
                  </Text>
                </HStack>
              }
            </VStack>
          }

          {dayEvents.length > 0
            && dayEvents.slice(0, 2).map((ev: any, idx: number) => {
              const st = new Date(ev.startDate)
              const time = `${pad2(st.getHours())}:${pad2(st.getMinutes())}`
              return (
                <Text
                  key={idx}
                  foregroundStyle="systemTeal"
                  lineLimit={1}
                >
                  {time} · {ev.title || "（无标题）"}
                </Text>
              )
            })
          }

          {selectedDay != null
            && dayReminders.length > 0
            && dayReminders.slice(0, 2).map((ev: Reminder, idx: number) => {
              return (
                <Button
                  buttonStyle="plain"
                  intent={CompleteReminderIntent({
                    id: ev.identifier,
                    year: selectedDay.year,
                    month: selectedDay.month,
                  })}
                >
                  <HStack
                    spacing={2}
                    foregroundStyle="systemPink"
                    lineLimit={1}>
                    <Image
                      systemName="circle"
                      fontWeight="bold"
                    />
                    <Text>
                      {ev.title || "（无标题）"}
                    </Text>
                  </HStack>
                </Button>
              )
            })
          }
          <Spacer />
        </VStack>
      </HStack>
    </VStack>
  )
}