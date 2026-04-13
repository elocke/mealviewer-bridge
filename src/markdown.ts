import type { CleanMenu, CleanFoodItem, MealType } from "./types";

export function generateMarkdown(
  menu: CleanMenu,
  mealFilter?: MealType
): string {
  const lines: string[] = [];
  const mealLabel = mealFilter ?? "Meal";
  lines.push(`# ${menu.school.name} — ${mealLabel} Menu\n`);

  for (const day of menu.menus) {
    lines.push(`## ${day.dayOfWeek}, ${formatDateReadable(day.date)}\n`);

    const mealTypes = Object.keys(day.meals) as MealType[];
    for (const mealType of mealTypes) {
      const meal = day.meals[mealType];
      if (!meal) continue;

      if (mealTypes.length > 1) {
        lines.push(`### ${mealType}\n`);
      }

      for (const line of meal.lines) {
        lines.push(`**${line.name}**`);
        for (const item of line.items) {
          lines.push(`- ${formatItemMd(item)}`);
        }
        lines.push("");
      }
    }

    lines.push("---\n");
  }

  return lines.join("\n");
}

function formatItemMd(item: CleanFoodItem): string {
  let text = `**${item.name}**`;
  const parts: string[] = [];
  if (item.calories) parts.push(`${item.calories} cal`);
  if (item.servingSize) parts.push(item.servingSize);
  if (parts.length > 0) text += ` (${parts.join(", ")})`;
  if (item.allergens.length > 0) text += ` — Allergens: ${item.allergens.join(", ")}`;
  if (item.badges.length > 0) text += ` 🏷️ ${item.badges.join(", ")}`;
  return text;
}

function formatDateReadable(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[month - 1]} ${day}, ${year}`;
}
