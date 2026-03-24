export interface PrefShift {
  shift: string;
  customDeparture?: string;
  customArrival?: string;
}

export type EmployeePrefs = Record<string, PrefShift[]>; // key = day name
