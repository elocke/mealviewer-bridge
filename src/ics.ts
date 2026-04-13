import ical, { ICalCalendarMethod } from "ical-generator";
import type { CleanMenu, CleanFoodItem, MealType } from "./types";

export function generateICS(menu: CleanMenu, mealFilter?: MealType): string {
  const calendar = ical({
    name: `${menu.school.name} ${mealFilter ?? "Meal"} Menu`,
    prodId: {
      company: "mealviewer-bridge",
      product: "mealviewer-bridge",
      language: "EN",
    },
    timezone: "America/Denver",
  });

  calendar.method(ICalCalendarMethod.PUBLISH);
  calendar.ttl(60 * 60 * 6);

  for (const day of menu.menus) {
    const mealTypes = Object.keys(day.meals) as MealType[];

    for (const mealType of mealTypes) {
      const meal = day.meals[mealType];
      if (!meal) continue;

      const plainLines: string[] = [];
      const htmlParts: string[] = [];

      for (const line of meal.lines) {
        plainLines.push(`${line.name}:`);
        htmlParts.push(`<b>${escapeHtml(line.name)}</b>`);

        const itemHtmlParts: string[] = [];
        for (const item of line.items) {
          plainLines.push(`  ${formatItemPlain(item)}`);
          itemHtmlParts.push(`<li>${formatItemHtml(item)}</li>`);
        }
        htmlParts.push(`<ul>${itemHtmlParts.join("")}</ul>`);
      }

      const eventDate = new Date(day.date + "T00:00:00");

      calendar.createEvent({
        start: eventDate,
        allDay: true,
        summary: `${mealType} Menu`,
        description: {
          plain: plainLines.join("\n"),
          html: `<div>${htmlParts.join("")}</div>`,
        },
      });
    }
  }

  return calendar.toString();
}

function formatItemPlain(item: CleanFoodItem): string {
  let text = item.name;
  const parts: string[] = [];
  if (item.calories) parts.push(`${item.calories} cal`);
  if (item.servingSize) parts.push(item.servingSize);
  if (parts.length > 0) text += ` (${parts.join(", ")})`;
  if (item.allergens.length > 0) text += ` [${item.allergens.join(", ")}]`;
  return text;
}

function formatItemHtml(item: CleanFoodItem): string {
  let html = `<b>${escapeHtml(item.name)}</b>`;
  const parts: string[] = [];
  if (item.calories) parts.push(`${item.calories} cal`);
  if (item.servingSize) parts.push(escapeHtml(item.servingSize));
  if (parts.length > 0) html += ` (${parts.join(", ")})`;
  if (item.allergens.length > 0) {
    html += ` <em>[${item.allergens.map(escapeHtml).join(", ")}]</em>`;
  }
  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
