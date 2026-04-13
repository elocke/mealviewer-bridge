export interface MealViewerResponse {
  physicalLocation: PhysicalLocation;
  menuSchedules: MenuSchedule[];
}

export interface PhysicalLocation {
  id: number;
  name: string;
  address: string;
  city: string;
  state?: string;
  zip?: string;
  lat?: number;
  long?: number;
  schoolColor?: string;
}

export interface MenuSchedule {
  dateInformation: DateInformation;
  menuBlocks: MenuBlock[];
}

export interface DateInformation {
  dateKey: number;
  dateFull: string;
  weekDayName: string;
  monthName: string;
  monthDay: number;
  monthNumber: number;
  weekNumber: number;
}

export interface MenuBlock {
  id: number;
  blockName: string;
  scheduledDate: string;
  cafeteriaLineList: {
    data: CafeteriaLine[];
  };
}

export interface CafeteriaLine {
  id: number;
  name: string;
  foodItemList: {
    data: FoodItem[];
  };
}

export interface FoodItem {
  id: number;
  item_Name: string;
  item_AltName?: string;
  item_Name_Line_2?: string;
  description?: string;
  item_Type: string;
  portionQuantity?: string;
  portionSize?: string;
  portionUnit?: string;
  servingSizeId?: number;
  imageFileName?: string;
  nutritionals?: Nutritional[];
  allergens?: Allergen[];
  badges?: Badge[];
}

export interface Nutritional {
  name: string;
  value: string;
  nutrientCode?: string;
  servingSizeId?: number;
}

export interface Allergen {
  codeName: string;
  name: string;
  value: string;
}

export interface Badge {
  codeName: string;
  iconFileName?: string;
}

export type MealType = "Breakfast" | "Lunch";

export interface CleanMenu {
  school: {
    name: string;
    address: string;
    city: string;
    state?: string;
  };
  menus: CleanDayMenu[];
}

export interface CleanDayMenu {
  date: string;
  dayOfWeek: string;
  meals: Partial<Record<MealType, CleanMealBlock>>;
}

export interface CleanMealBlock {
  lines: CleanCafeteriaLine[];
}

export interface CleanCafeteriaLine {
  name: string;
  items: CleanFoodItem[];
}

export interface CleanFoodItem {
  name: string;
  calories?: number;
  servingSize?: string;
  allergens: string[];
  badges: string[];
}
