import { HStack, Text, Button, Image, Circle, VStack, GeometryReader, Widget, Link, Spacer, FlowLayout } from "scripting"
import { pad2 } from "../util"
import { BackToTodayIntent, CompleteReminderIntent } from "../app_intents"
import { ParsedDayInfo } from "../type"

export function DateDetails({
  selectedDay,
  isNotToday,
  dayEvents,
  dayReminders
}: {
  selectedDay: ParsedDayInfo | undefined
  isNotToday: boolean
  dayEvents: CalendarEvent[]
  dayReminders: Reminder[]
}) {

  const match = selectedDay?.match

  return <VStack
    alignment="leading"
    padding={12}
    spacing={8}
    frame={Widget.displaySize}
    transition={Transition.flipFromBottom()}
    overlay={{
      alignment: "bottomTrailing",
      content: <Button
        intent={BackToTodayIntent()}
        buttonStyle={'plain'}
      >
        <Image
          systemName="arrow.uturn.backward.square"
          font={'title2'}
          foregroundStyle="link"
          padding
        />
      </Button>
    }}
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
              <Image
                systemName="arrow.up.right.square"
              />
              <Text>农历{match.lMonth}月{match.lDate}</Text>
            </HStack>
          </Link>
          : <Text
            foregroundStyle="#9A9A9A"
            lineLimit={1}
          >
            农历{match.lMonth}月{match.lDate}
          </Text>
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
}