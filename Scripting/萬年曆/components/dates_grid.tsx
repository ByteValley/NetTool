import { Button, HStack, Circle, LazyVGrid, VStack, Text, Rectangle, GridItem, Capsule, RoundedRectangle, Spacer } from "scripting"
import { dateKey } from "../util"
import { BackToTodayIntent, SelectDayIntent } from "../app_intents"
import { AlmanacItem, ParsedDayInfo } from "../type"

export function DateGrid({
  days,
  columns,
  selectedKey,
}: {
  days: ParsedDayInfo[]
  columns: GridItem[]
  selectedKey: string | null
}) {

  return <LazyVGrid
    columns={columns}
    spacing={2}
  >
    {days.map((d) => {
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
        padding={2}
        // font={12}
        frame={{
          maxHeight: 'infinity'
        }}
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
            isSelected ? BackToTodayIntent()
              : isToday && selectedKey != null ? BackToTodayIntent()
                : SelectDayIntent({
                  year: d.year,
                  month: d.month,
                  day: d.day
                })
          }
        >
          <Text
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
          font={10}
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
              spacing={4}
              frame={{
                height: 4,
                width: 18
              }}>
              <Spacer />
              {hasTerm ?
                <Circle
                  frame={{ width: 4, height: 4 }}
                  fill="systemPurple"
                /> : null}
              {hasEvents ?
                <Circle
                  frame={{ width: 4, height: 4 }}
                  fill="systemTeal"
                />
                : null}
              {hasReminders
                ? <Circle
                  frame={{ width: 4, height: 4 }}
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
  </LazyVGrid >
}