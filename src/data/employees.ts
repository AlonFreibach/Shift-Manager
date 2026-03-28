export interface FixedShift {
  day: string;
  shift: string;
  arrivalTime: string;
  departureTime: string;
}

export interface Employee {
  id: string;
  name: string;
  shiftsPerWeek: number;
  fridayAvailability: 'always' | 'never' | 'biweekly';
  shiftType: "הכל" | "בוקר" | "ערב";
  isTrainee: boolean;
  availableFrom: string;
  availableTo: string;
  availableFromDate: string;
  availableToDate: string;
  fairnessHistory: { date: string; type: 1 | 2 }[];
  flexibilityHistory: { weekStart: string; submitted: number; committed: number }[];
  fixedShifts?: FixedShift[];
}

// Legacy hardcoded employee names for migrating old localStorage schedule data
// Maps old numeric IDs to employee names
export const LEGACY_ID_NAMES: Record<number, string> = {
  1: 'מיה', 2: 'תמר', 3: 'אלין', 4: 'דנה_ב', 5: 'דנה_ח',
  6: 'נטע', 7: 'איילת', 8: 'מיקי', 9: 'מוחמד', 10: 'נויה',
  11: 'אגם', 12: 'ליאל', 13: 'מעיין', 14: 'אלמוג',
};
