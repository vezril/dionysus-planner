"use client";

/**
 * openspec: planner-day-click-and-calories — the client shell owning the
 * selected day: click a day card to target it, the add form follows.
 * Defaults to today when the displayed week contains it, else Monday.
 */
import { useState } from "react";
import type { PlanEntryRow } from "@/data/planner";
import { AddPlanEntryForm } from "./AddPlanEntryForm";
import { PlanDayColumn } from "./PlanDayColumn";

export function PlannerBoard({
  dates,
  dayLabels,
  today,
  entriesByDate,
  recipeOptions,
  batchOptions,
}: {
  dates: string[];
  dayLabels: string[];
  today: string;
  entriesByDate: Record<string, PlanEntryRow[]>;
  recipeOptions: Array<{ id: number; name: string; servings: number }>;
  batchOptions: Array<{ batchId: number; label: string; availablePortions: number }>;
}) {
  const [selectedDate, setSelectedDate] = useState(dates.includes(today) ? today : dates[0]);
  const selectedIndex = dates.indexOf(selectedDate);

  return (
    <>
      <AddPlanEntryForm
        selectedDate={selectedDate}
        selectedLabel={`${dayLabels[selectedIndex]} ${selectedDate.slice(5)}`}
        recipeOptions={recipeOptions}
        batchOptions={batchOptions}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {dates.map((date, index) => (
          <PlanDayColumn
            key={date}
            date={date}
            label={dayLabels[index]}
            isToday={date === today}
            isSelected={date === selectedDate}
            onSelect={() => setSelectedDate(date)}
            entries={entriesByDate[date] ?? []}
          />
        ))}
      </div>
    </>
  );
}
