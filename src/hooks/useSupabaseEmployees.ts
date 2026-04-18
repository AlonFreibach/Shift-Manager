import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { SupabaseEmployee } from '../lib/supabaseClient';
import type { Employee } from '../data/employees';

function supabaseToEmployee(emp: SupabaseEmployee): Employee {
  const fridayMap: Record<string, 'always' | 'never' | 'biweekly'> = {
    yes: 'always', always: 'always',
    no: 'never', never: 'never',
    biweekly: 'biweekly',
  };
  const shiftMap: Record<string, 'הכל' | 'בוקר' | 'ערב'> = {
    all: 'הכל', 'הכל': 'הכל',
    morning: 'בוקר', 'בוקר': 'בוקר',
    evening: 'ערב', 'ערב': 'ערב',
  };
  return {
    id: String(emp.id),
    name: emp.name,
    phone: emp.phone || '',
    email: emp.email || '',
    seniority: emp.seniority ?? 0,
    shiftsPerWeek: emp.shifts_per_week ?? 3,
    fridayAvailability: fridayMap[emp.friday] || 'never',
    shiftType: shiftMap[emp.shift_type] || 'הכל',
    isTrainee: false,
    availableFrom: '',
    availableTo: '',
    availableFromDate: emp.active_from || '',
    availableToDate: emp.active_until || '',
    fairnessHistory: [],
    flexibilityHistory: [],
    fixedShifts: Array.isArray(emp.fixed_shifts) ? emp.fixed_shifts : [],
    vacationPeriods: Array.isArray(emp.vacation_periods) ? emp.vacation_periods : [],
    birthday: emp.birthday || undefined,
    availabilityForecasts: Array.isArray(emp.availability_forecasts) ? emp.availability_forecasts : [],
    expectedDeparture: emp.expected_departure || '',
    employeeNote: emp.employee_note || '',
    trainingStart: emp.training_start || '',
    shiftsStart: emp.shifts_start || '',
    forecastOverrides: (emp.forecast_overrides as Record<string, { shifts: number; friday: boolean }>) || {},
  };
}

export function useSupabaseEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('created_at', { ascending: true });

    if (!error && data) {
      setEmployees(data.map(emp => supabaseToEmployee(emp as SupabaseEmployee)));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { employees, loading, refresh };
}
