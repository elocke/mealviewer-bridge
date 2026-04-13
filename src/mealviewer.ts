import type {
  MealViewerResponse,
  MenuSchedule,
  FoodItem,
  CleanMenu,
  CleanDayMenu,
  MealType,
} from "./types";

const API_BASE = "https://api.mealviewer.com/api/v4";

function formatDateForApi(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${mm}-${dd}-${yyyy}`;
}

function formatDateISO(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function fetchMealViewerRaw(
  schoolId: string,
  startDate: Date,
  endDate: Date
): Promise<MealViewerResponse> {
  const url = `${API_BASE}/school/${schoolId}/${formatDateForApi(startDate)}/${formatDateForApi(endDate)}/0`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`MealViewer API returned ${res.status}`);
  }
  return res.json() as Promise<MealViewerResponse>;
}

function getCalories(item: FoodItem): number | undefined {
  const cal = item.nutritionals?.find(
    (n) => n.name === "Calories" || n.nutrientCode === "KCAL"
  );
  return cal ? parseFloat(cal.value) : undefined;
}

function getActiveAllergens(item: FoodItem): string[] {
  return (
    item.allergens
      ?.filter((a) => a.value === "True")
      .map((a) => a.codeName) ?? []
  );
}

function getServingSize(item: FoodItem): string | undefined {
  if (!item.portionUnit) return undefined;
  return item.portionUnit.toLowerCase();
}

function parseMealType(blockName: string): MealType | null {
  const lower = blockName.toLowerCase();
  if (lower.includes("breakfast")) return "Breakfast";
  if (lower.includes("lunch")) return "Lunch";
  return null;
}

export function transformToClean(
  raw: MealViewerResponse,
  mealFilter?: MealType
): CleanMenu {
  const loc = raw.physicalLocation;

  const menus: CleanDayMenu[] = (raw.menuSchedules ?? [])
    .filter((s: MenuSchedule) => s.menuBlocks?.length > 0)
    .map((schedule: MenuSchedule) => {
      const info = schedule.dateInformation;
      const dk = String(info.dateKey);
      const dateStr = `${dk.slice(0, 4)}-${dk.slice(4, 6)}-${dk.slice(6, 8)}`;

      const meals: Partial<Record<MealType, { lines: { name: string; items: { name: string; calories?: number; servingSize?: string; allergens: string[]; badges: string[] }[] }[] }>> = {};

      for (const block of schedule.menuBlocks) {
        const mealType = parseMealType(block.blockName);
        if (!mealType) continue;
        if (mealFilter && mealType !== mealFilter) continue;

        const lineData = block.cafeteriaLineList?.data ?? [];
        const lines = lineData
          .map((line) => ({
            name: line.name,
            items: (line.foodItemList?.data ?? []).map((item: FoodItem) => ({
              name: item.item_Name + (item.item_Name_Line_2 ? ` ${item.item_Name_Line_2}` : ""),
              calories: getCalories(item),
              servingSize: getServingSize(item),
              allergens: getActiveAllergens(item),
              badges: item.badges?.map((b) => b.codeName) ?? [],
            })),
          }))
          .filter((line) => line.items.length > 0);

        if (lines.length > 0) {
          meals[mealType] = { lines };
        }
      }

      return {
        date: dateStr,
        dayOfWeek: info.weekDayName,
        meals,
      };
    })
    .filter((day: CleanDayMenu) => Object.keys(day.meals).length > 0);

  return {
    school: {
      name: loc.name,
      address: loc.address,
      city: loc.city,
      state: loc.state,
    },
    menus,
  };
}

export function getDefaultDateRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 1);
  const end = new Date(now);
  end.setDate(end.getDate() + 30);
  return { start, end };
}

export function getWeekDateRange(): { start: Date; end: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const start = new Date(now);
  start.setDate(start.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const end = new Date(start);
  end.setDate(end.getDate() + 4);
  return { start, end };
}

export { formatDateISO };
