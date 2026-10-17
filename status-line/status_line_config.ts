export const TOKENS_YELLOW_AT = 75000;
export const TOKENS_ORANGE_AT = 100000;
export const TOKENS_RED_AT = 150000;
export const CONTEXT_YELLOW_AT = 15;
export const CONTEXT_ORANGE_AT = 20;
export const CONTEXT_RED_AT = 25;
export const TURNS_YELLOW_AT = 7;
export const TURNS_ORANGE_AT = 10;
export const TURNS_RED_AT = 13;
export const DAY_YELLOW_AT = 5;
export const DAY_ORANGE_AT = 6;
export const DAY_RED_AT = 7;
export const FIVE_HOUR_YELLOW_AT = 51;
export const FIVE_HOUR_ORANGE_AT = 76;
export const FIVE_HOUR_RED_AT = 91;

export const WEEKLY_RED_POINTS_LEFT = 2;
export const WEEKLY_ORANGE_POINTS_LEFT = 5;
export const WEEKLY_YELLOW_POINTS_LEFT = 8;

export const WEEKLY_RESET_SHOW_HOURS = 12;
export const WEEKLY_RESET_YELLOW_MINUTES = 180;
export const WEEKLY_RESET_ORANGE_MINUTES = 360;
export const WEEKLY_RESET_RED_MINUTES = 540;

// Usage % at which levels 2-6 begin, per minutes until reset. Longer wait, lower bar.
export const ANNOYANCE_ANCHORS: [number, number[]][] = [
  [0, [95, 99, 102, 102, 102]],
  [20, [85, 95, 98, 102, 102]],
  [45, [70, 74, 78, 82, 90]],
  [80, [66, 72, 78, 82, 90]],
  [150, [58, 64, 70, 74, 82]],
];
