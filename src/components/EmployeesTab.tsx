import { useState } from 'react';
import type { Employee, FixedShift } from '../data/employees';
import { CreateUserModal } from './CreateUserModal';
import { supabase } from '../lib/supabaseClient';
import type { SupabaseEmployee } from '../lib/supabaseClient';

interface EmployeesTabProps {
  employees: Employee[];
  onUpdate: (employees: Employee[]) => void;
}

const MIYA_ID = 1;

// ── SVG Icons (16px, currentColor) ──
const IconCalendar = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="12" height="11" rx="1.5" />
    <path d="M5 1.5v2M11 1.5v2M2 6.5h12" />
  </svg>
);
const IconClock = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.5V8l2.5 1.5" />
  </svg>
);
const IconStar = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
    <path d="M8 2l1.8 3.6L14 6.2l-3 2.9.7 4.1L8 11.3 4.3 13.2l.7-4.1-3-2.9 4.2-.6z" />
  </svg>
);
const IconPerson = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="5" r="2.5" />
    <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" />
  </svg>
);

// ── Add Modal Form State ──
interface AddFormData {
  name: string;
  phone: string;
  email: string;
  seniority: number;
  shiftType: 'all' | 'morning' | 'evening';
  friday: 'yes' | 'biweekly' | 'no';
  activeFrom: string;
  activeUntil: string;
}

const INITIAL_FORM: AddFormData = {
  name: '',
  phone: '',
  email: '',
  seniority: 0,
  shiftType: 'all',
  friday: 'no',
  activeFrom: '',
  activeUntil: '',
};

export function EmployeesTab({ employees, onUpdate }: EmployeesTabProps) {
  // Modal state — 3-step wizard
  const [showModal, setShowModal] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [formData, setFormData] = useState<AddFormData>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [magicLink, setMagicLink] = useState('');
  const [copyFeedback, setCopyFeedback] = useState('');

  // Create-user modal state (existing 🔑 flow)
  const [createUserTarget, setCreateUserTarget] = useState<Employee | null>(null);

  // Copy-link feedback per card
  const [cardCopyId, setCardCopyId] = useState<number | null>(null);

  // Inline card edit state
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [draftEmployee, setDraftEmployee] = useState<Partial<Employee> | null>(null);

  const shiftOptions = Array.from({ length: 13 }, (_, i) => i); // 0..12
  const dayOptions = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];
  const shiftTypeOptions = ['בוקר', 'ערב'];

  // ── Add Modal — 3-step wizard ──
  const openAddModal = () => {
    setFormData(INITIAL_FORM);
    setWizardStep(1);
    setMagicLink('');
    setCopyFeedback('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setWizardStep(1);
    setMagicLink('');
  };

  const handleSaveToSupabase = async () => {
    if (!formData.name.trim()) return;
    setSaving(true);

    // Map shiftType/friday for local Employee compatibility
    const localShiftType = formData.shiftType === 'all' ? 'הכל' : formData.shiftType === 'morning' ? 'בוקר' : 'ערב';
    const localFriday = formData.friday === 'yes' ? 'always' : formData.friday === 'biweekly' ? 'biweekly' : 'never';

    // Insert employee to Supabase
    const { data: newEmp, error } = await supabase
      .from('employees')
      .insert({
        name: formData.name.trim(),
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        seniority: formData.seniority,
        shift_type: formData.shiftType,
        friday: formData.friday,
        active_from: formData.activeFrom || null,
        active_until: formData.activeUntil || null,
        role: 'employee',
      })
      .select()
      .single();

    if (error || !newEmp) {
      alert('שגיאה בשמירת עובדת: ' + (error?.message || 'Unknown error'));
      setSaving(false);
      return;
    }

    // Create token
    const { data: tokenData } = await supabase
      .from('employee_tokens')
      .insert({ employee_id: newEmp.id })
      .select('token')
      .single();

    const link = tokenData
      ? `${window.location.origin}/join/${tokenData.token}`
      : '';
    setMagicLink(link);

    // Also add to local employees list for WeeklyBoard compatibility
    const newId = Math.max(...employees.map(e => e.id), 0) + 1;
    const localEmployee: Employee = {
      id: newId,
      name: formData.name.trim(),
      shiftsPerWeek: 3,
      fridayAvailability: localFriday as 'always' | 'never' | 'biweekly',
      shiftType: localShiftType as 'הכל' | 'בוקר' | 'ערב',
      isTrainee: false,
      availableFrom: '',
      availableTo: '',
      availableFromDate: formData.activeFrom,
      availableToDate: formData.activeUntil,
      fairnessHistory: [],
      flexibilityHistory: [],
      fixedShifts: [],
    };
    onUpdate([...employees, localEmployee]);

    setSaving(false);
    setWizardStep(3);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback('הועתק!');
      setTimeout(() => setCopyFeedback(''), 2000);
    } catch {
      setCopyFeedback('שגיאה בהעתקה');
    }
  };

  // ── Copy link for existing employee card ──
  const handleCopyLink = async (empId: number) => {
    // Employee IDs in Supabase are UUIDs but local IDs are numbers
    // We need to find the employee by name in Supabase first
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;

    const { data: supaEmp } = await supabase
      .from('employees')
      .select('id')
      .eq('name', emp.name)
      .single();

    if (!supaEmp) {
      setCardCopyId(empId);
      setTimeout(() => setCardCopyId(null), 2000);
      return;
    }

    // Check for existing active token
    let { data: tokenRow } = await supabase
      .from('employee_tokens')
      .select('token')
      .eq('employee_id', supaEmp.id)
      .eq('is_active', true)
      .single();

    // Create token if none exists
    if (!tokenRow) {
      const { data: newToken } = await supabase
        .from('employee_tokens')
        .insert({ employee_id: supaEmp.id })
        .select('token')
        .single();
      tokenRow = newToken;
    }

    if (tokenRow) {
      const link = `${window.location.origin}/join/${tokenRow.token}`;
      try {
        await navigator.clipboard.writeText(link);
      } catch { /* fallback below */ }
    }

    setCardCopyId(empId);
    setTimeout(() => setCardCopyId(null), 2000);
  };

  // ── Inline Card Edit ──
  const startCardEdit = (emp: Employee) => {
    setEditingCardId(emp.id);
    setDraftEmployee({
      name: emp.name,
      shiftsPerWeek: emp.shiftsPerWeek,
      fridayAvailability: emp.fridayAvailability,
      shiftType: emp.shiftType,
      isTrainee: emp.isTrainee,
      availableFromDate: emp.availableFromDate,
      availableToDate: emp.availableToDate,
      fixedShifts: emp.fixedShifts ? emp.fixedShifts.map(fs => ({ ...fs })) : [],
    });
  };

  const saveCardEdit = () => {
    if (!draftEmployee || editingCardId === null) return;
    if (!draftEmployee.name?.trim()) {
      alert('אנא הזן שם עובדת');
      return;
    }
    onUpdate(employees.map(emp =>
      emp.id === editingCardId ? {
        ...emp,
        name: draftEmployee.name!,
        shiftsPerWeek: draftEmployee.shiftsPerWeek ?? emp.shiftsPerWeek,
        fridayAvailability: draftEmployee.fridayAvailability ?? emp.fridayAvailability,
        shiftType: draftEmployee.shiftType ?? emp.shiftType,
        isTrainee: draftEmployee.isTrainee ?? emp.isTrainee,
        availableFromDate: draftEmployee.availableFromDate ?? emp.availableFromDate,
        availableToDate: draftEmployee.availableToDate ?? emp.availableToDate,
        fixedShifts: (draftEmployee.fixedShifts as FixedShift[]) ?? emp.fixedShifts ?? [],
      } : emp
    ));
    setEditingCardId(null);
    setDraftEmployee(null);
  };

  const cancelCardEdit = () => {
    setEditingCardId(null);
    setDraftEmployee(null);
  };

  const updateDraftFixedShift = (idx: number, field: keyof FixedShift, value: string) => {
    if (!draftEmployee) return;
    const shifts = [...((draftEmployee.fixedShifts as FixedShift[]) || [])];
    shifts[idx] = { ...shifts[idx], [field]: value };
    if (field === 'shift') {
      if (value === 'בוקר') { shifts[idx].arrivalTime = '07:00'; shifts[idx].departureTime = '14:00'; }
      else { shifts[idx].arrivalTime = '14:00'; shifts[idx].departureTime = '21:00'; }
    }
    if (field === 'day' && value === 'שישי') {
      shifts[idx].shift = 'בוקר'; shifts[idx].arrivalTime = '07:00'; shifts[idx].departureTime = '14:00';
    }
    setDraftEmployee({ ...draftEmployee, fixedShifts: shifts });
  };

  // ── Helpers ──
  const isInactive = (emp: Employee) => {
    if (!emp.availableToDate) return false;
    return new Date(emp.availableToDate + 'T23:59:59') < new Date();
  };

  const getSubtitle = (emp: Employee) => {
    if (emp.id === MIYA_ID && !emp.isTrainee) return 'מנהלת החנות';
    if (emp.isTrainee) return 'מתלמדת';
    return '';
  };

  const getAvailabilityText = (emp: Employee) => {
    const from = emp.availableFromDate;
    const to = emp.availableToDate;
    if (!from && !to) return null;
    const fmtDate = (d: string) => {
      const [y, m, dd] = d.split('-');
      return `${dd}.${m}.${y}`;
    };
    if (from && to) return `מ-${fmtDate(from)} עד ${fmtDate(to)}`;
    if (from) return `מ-${fmtDate(from)}`;
    return `עד ${fmtDate(to!)}`;
  };

  // Bridge local Employee to SupabaseEmployee shape for CreateUserModal
  const toSupabaseEmployee = (emp: Employee): SupabaseEmployee => ({
    id: String(emp.id),
    name: emp.name,
    seniority: 0,
    friday: emp.fridayAvailability,
    shift_type: emp.shiftType,
    active_from: emp.availableFromDate || undefined,
    active_until: emp.availableToDate || undefined,
    role: emp.id === MIYA_ID ? 'admin' : 'employee',
    created_at: '',
  });

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid #e8e0d4', borderRadius: 6 };
  const selectStyle: React.CSSProperties = { ...inputStyle };

  const infoRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 14 };
  const infoLabelStyle: React.CSSProperties = { minWidth: 90, fontSize: 13, color: '#6b7280', flexShrink: 0 };
  const iconWrapStyle: React.CSSProperties = { opacity: 0.5, flexShrink: 0, display: 'flex', alignItems: 'center' };
  const badgeStyle = (bg: string, color: string): React.CSSProperties => ({
    fontSize: 12, fontWeight: 500, padding: '2px 10px', borderRadius: 999, background: bg, color, whiteSpace: 'nowrap',
  });
  const dividerStyle: React.CSSProperties = { height: 0, borderTop: '0.5px solid #e8e0d4', margin: '10px 0' };

  // ── Toggle button helper ──
  const toggleBtn = (label: string, active: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8,
        border: active ? '2px solid #1a4a2e' : '1px solid #e8e0d4',
        background: active ? '#EAF3DE' : 'white',
        color: active ? '#1a4a2e' : '#64748b',
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );

  return (
    <div dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1a4a2e' }}>עובדות</h2>
        <button
          onClick={openAddModal}
          style={{
            padding: '8px 20px',
            fontSize: 14,
            fontWeight: 600,
            background: '#1a4a2e',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          + הוסף עובדת
        </button>
      </div>

      {/* Employees Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
        {employees.map((employee) => {
          const isEditing = editingCardId === employee.id;
          const draft = isEditing ? draftEmployee : null;
          const inactive = isInactive(employee);
          const subtitle = getSubtitle(employee);
          const availText = getAvailabilityText(employee);

          return (
            <div
              key={employee.id}
              style={{
                background: 'white',
                borderRadius: 12,
                border: isEditing ? '2px solid #3B6D11' : '0.5px solid #e0ddd8',
                padding: '1.25rem',
                direction: 'rtl',
                transition: 'box-shadow 0.15s',
                ...(isEditing ? { position: 'relative' as const, zIndex: 1 } : {}),
              }}
            >
              {isEditing && draft ? (
                /* ════════ EDIT MODE ════════ */
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Name */}
                    <div>
                      <label style={labelStyle}>שם:</label>
                      <input
                        type="text"
                        value={draft.name || ''}
                        onChange={(e) => setDraftEmployee({ ...draft, name: e.target.value })}
                        style={inputStyle}
                      />
                    </div>

                    {/* Shifts Per Week */}
                    <div>
                      <label style={labelStyle}>משמרות בשבוע:</label>
                      <select
                        value={draft.shiftsPerWeek ?? 3}
                        onChange={(e) => setDraftEmployee({ ...draft, shiftsPerWeek: parseInt(e.target.value) })}
                        style={selectStyle}
                      >
                        {shiftOptions.map(num => <option key={num} value={num}>{num}</option>)}
                      </select>
                    </div>

                    {/* Friday */}
                    <div>
                      <label style={labelStyle}>שישי:</label>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                          <input type="radio" name={`friday_${employee.id}`} value="always"
                            checked={draft.fridayAvailability === 'always'}
                            onChange={() => setDraftEmployee({ ...draft, fridayAvailability: 'always' })}
                          /> כל שישי
                        </label>
                        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                          <input type="radio" name={`friday_${employee.id}`} value="never"
                            checked={draft.fridayAvailability === 'never'}
                            onChange={() => setDraftEmployee({ ...draft, fridayAvailability: 'never' })}
                          /> לא
                        </label>
                        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                          <input type="radio" name={`friday_${employee.id}`} value="biweekly"
                            checked={draft.fridayAvailability === 'biweekly'}
                            onChange={() => setDraftEmployee({ ...draft, fridayAvailability: 'biweekly' })}
                          /> אחת לשבועיים
                        </label>
                      </div>
                    </div>

                    {/* Trainee */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={draft.isTrainee || false}
                        onChange={(e) => setDraftEmployee({ ...draft, isTrainee: e.target.checked })}
                        style={{ width: 16, height: 16, accentColor: '#c17f3b' }}
                      />
                      <label style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>מתלמדת (בהכשרה)</label>
                    </div>

                    {/* Shift Type */}
                    <div>
                      <label style={labelStyle}>סוג משמרת:</label>
                      <select
                        value={draft.shiftType || 'הכל'}
                        onChange={(e) => setDraftEmployee({ ...draft, shiftType: e.target.value as any })}
                        style={selectStyle}
                      >
                        <option>הכל</option>
                        <option>בוקר</option>
                        <option>ערב</option>
                      </select>
                    </div>

                    {/* Date Range */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={labelStyle}>זמין מ:</label>
                        <input type="date" value={draft.availableFromDate || ''} onChange={(e) => setDraftEmployee({ ...draft, availableFromDate: e.target.value })} style={{ ...inputStyle, fontSize: 11 }} />
                      </div>
                      <div>
                        <label style={labelStyle}>זמין עד:</label>
                        <input type="date" value={draft.availableToDate || ''} onChange={(e) => setDraftEmployee({ ...draft, availableToDate: e.target.value })} style={{ ...inputStyle, fontSize: 11 }} />
                      </div>
                    </div>
                  </div>

                  {/* Fixed Shifts (edit) */}
                  <div style={{ marginTop: 10, borderTop: '1px solid #f0ebe3', paddingTop: 10 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#0C447C', marginBottom: 6 }}>
                      משמרות קבועות {((draft.fixedShifts as FixedShift[])?.length || 0) > 0 && `(${(draft.fixedShifts as FixedShift[])!.length})`}
                    </label>
                    {((draft.fixedShifts as FixedShift[]) || []).map((fs, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', background: '#f8fafc', borderRadius: 6, padding: '6px 8px' }}>
                        <select value={fs.day} onChange={e => updateDraftFixedShift(idx, 'day', e.target.value)} style={{ fontSize: 11, padding: '3px 4px', borderRadius: 4, border: '1px solid #e8e0d4', width: 60 }}>
                          {dayOptions.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <select value={fs.shift} onChange={e => updateDraftFixedShift(idx, 'shift', e.target.value)} style={{ fontSize: 11, padding: '3px 4px', borderRadius: 4, border: '1px solid #e8e0d4', width: 50 }}>
                          {(fs.day === 'שישי' ? ['בוקר'] : shiftTypeOptions).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <input type="time" value={fs.arrivalTime} onChange={e => updateDraftFixedShift(idx, 'arrivalTime', e.target.value)} style={{ fontSize: 11, padding: '3px 2px', borderRadius: 4, border: '1px solid #e8e0d4', width: 70 }} />
                        <input type="time" value={fs.departureTime} onChange={e => updateDraftFixedShift(idx, 'departureTime', e.target.value)} style={{ fontSize: 11, padding: '3px 2px', borderRadius: 4, border: '1px solid #e8e0d4', width: 70 }} />
                        <button onClick={() => {
                          const arr = ((draft.fixedShifts as FixedShift[]) || []).filter((_, i) => i !== idx);
                          setDraftEmployee({ ...draft, fixedShifts: arr });
                        }} style={{ fontSize: 12, background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '0 4px', fontWeight: 700 }}>✕</button>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        const newFs: FixedShift = { day: 'ראשון', shift: 'בוקר', arrivalTime: '07:00', departureTime: '14:00' };
                        setDraftEmployee({ ...draft, fixedShifts: [...((draft.fixedShifts as FixedShift[]) || []), newFs] });
                      }}
                      style={{ width: '100%', marginTop: 4, padding: '6px 0', fontSize: 12, fontWeight: 600, background: 'transparent', color: '#1a4a2e', border: '1px solid #4a7c59', borderRadius: 6, cursor: 'pointer' }}
                    >
                      + הוסף משמרת קבועה
                    </button>
                  </div>

                  {/* Edit Buttons */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button
                      onClick={saveCardEdit}
                      style={{ padding: '6px 14px', fontSize: 12, background: '#1a4a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                    >
                      שמור
                    </button>
                    <button
                      onClick={cancelCardEdit}
                      style={{ padding: '6px 14px', fontSize: 12, background: '#f5f0e8', color: '#475569', border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                    >
                      בטל
                    </button>
                  </div>
                </>
              ) : (
                /* ════════ VIEW MODE ════════ */
                <>
                  {/* 1. HEADER */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Avatar */}
                    <div style={{
                      width: 42, height: 42, borderRadius: '50%',
                      background: '#EAF3DE', color: '#3B6D11',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, fontWeight: 600, flexShrink: 0,
                    }}>
                      {employee.name.charAt(0)}
                    </div>
                    {/* Name + subtitle */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontSize: 17, fontWeight: 500, color: '#1a1a1a', lineHeight: 1.2 }}>{employee.name}</span>
                      {subtitle && (
                        <span style={{ fontSize: 12, color: '#8b8b8b' }}>{subtitle}</span>
                      )}
                    </div>
                    {/* Status badge */}
                    <span style={{
                      marginRight: 'auto',
                      ...badgeStyle(
                        inactive ? '#FEE2E2' : '#DCFCE7',
                        inactive ? '#991B1B' : '#166534',
                      ),
                    }}>
                      {inactive ? 'לא פעילה' : 'פעילה'}
                    </span>
                  </div>

                  {/* 2. DIVIDER */}
                  <div style={dividerStyle} />

                  {/* 3. INFO ROWS */}
                  {/* Row 1 — Shifts per week */}
                  <div style={infoRowStyle}>
                    <span style={iconWrapStyle}><IconCalendar /></span>
                    <span style={infoLabelStyle}>משמרות בשבוע</span>
                    <span style={{ fontWeight: 500 }}>{employee.shiftsPerWeek}</span>
                  </div>

                  {/* Row 2 — Shift type */}
                  <div style={infoRowStyle}>
                    <span style={iconWrapStyle}><IconClock /></span>
                    <span style={infoLabelStyle}>סוג משמרת</span>
                    <span style={badgeStyle('#E6F1FB', '#185FA5')}>{employee.shiftType}</span>
                  </div>

                  {/* Row 3 — Friday */}
                  <div style={infoRowStyle}>
                    <span style={iconWrapStyle}><IconStar /></span>
                    <span style={infoLabelStyle}>שישי</span>
                    {employee.fridayAvailability === 'always' && (
                      <span style={badgeStyle('#FAEEDA', '#854F0B')}>כל שישי</span>
                    )}
                    {employee.fridayAvailability === 'never' && (
                      <span style={badgeStyle('#F1EFE8', '#5F5E5A')}>לא עובדת</span>
                    )}
                    {employee.fridayAvailability === 'biweekly' && (
                      <span style={badgeStyle('#E6F1FB', '#185FA5')}>שישי ס״ח</span>
                    )}
                  </div>

                  {/* Row 4 — Trainee */}
                  <div style={infoRowStyle}>
                    <span style={iconWrapStyle}><IconPerson /></span>
                    <span style={infoLabelStyle}>מתלמדת</span>
                    {employee.isTrainee ? (
                      <span style={badgeStyle('#EEEDFE', '#534AB7')}>כן</span>
                    ) : (
                      <span style={{ fontSize: 13, color: '#9ca3af' }}>לא</span>
                    )}
                  </div>

                  {/* Row 5 — Availability dates (conditional) */}
                  {(employee.availableFromDate || employee.availableToDate) && (
                    <div style={infoRowStyle}>
                      <span style={iconWrapStyle}><IconCalendar /></span>
                      <span style={infoLabelStyle}>זמינות</span>
                      <span style={{ fontSize: 13, color: '#475569' }}>{availText}</span>
                    </div>
                  )}
                  {!employee.availableFromDate && !employee.availableToDate && (
                    <div style={infoRowStyle}>
                      <span style={iconWrapStyle}><IconCalendar /></span>
                      <span style={infoLabelStyle}>זמינות</span>
                      <span style={{ fontSize: 13, color: '#9ca3af' }}>ללא הגבלה</span>
                    </div>
                  )}

                  {/* 4. DIVIDER */}
                  <div style={dividerStyle} />

                  {/* 5. FIXED SHIFTS */}
                  <div>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#6b7280', marginBottom: 6 }}>
                      משמרות קבועות
                    </span>
                    {(!employee.fixedShifts || employee.fixedShifts.length === 0) ? (
                      <span style={{ fontSize: 13, color: '#9ca3af' }}>אין</span>
                    ) : (
                      <div style={{ background: '#F8F7F4', borderRadius: 8, padding: '8px 12px' }}>
                        {employee.fixedShifts.map((fs, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 13 }}>
                            <span style={{ fontWeight: 500, color: '#1a4a2e' }}>{fs.day}</span>
                            <span style={{ color: '#6b7280' }}>{fs.shift}</span>
                            <span style={{ color: '#6b7280' }}>{fs.arrivalTime}—{fs.departureTime}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 6. ACTION BUTTONS */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button
                      onClick={() => startCardEdit(employee)}
                      style={{
                        flex: 1,
                        padding: '7px 14px',
                        fontSize: 13,
                        fontWeight: 500,
                        background: 'transparent',
                        color: '#374151',
                        border: '0.5px solid #d1cdc6',
                        borderRadius: 8,
                        cursor: 'pointer',
                      }}
                    >
                      ערוך
                    </button>
                    <button
                      onClick={() => handleCopyLink(employee.id)}
                      title="העתק קישור כניסה"
                      style={{
                        padding: '7px 12px',
                        fontSize: 13,
                        fontWeight: 500,
                        background: cardCopyId === employee.id ? '#DCFCE7' : 'transparent',
                        color: cardCopyId === employee.id ? '#166534' : '#2563EB',
                        border: `0.5px solid ${cardCopyId === employee.id ? '#86EFAC' : '#93C5FD'}`,
                        borderRadius: 8,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        transition: 'all 0.15s',
                      }}
                    >
                      {cardCopyId === employee.id ? '✓' : '🔗'}
                    </button>
                    <button
                      onClick={() => setCreateUserTarget(employee)}
                      title="הגדר כניסה"
                      style={{
                        padding: '7px 12px',
                        fontSize: 13,
                        fontWeight: 500,
                        background: 'transparent',
                        color: '#7c3aed',
                        border: '0.5px solid #c4b5fd',
                        borderRadius: 8,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      🔑
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`האם למחוק את ${employee.name}? פעולה זו אינה ניתנת לביטול.`)) {
                          onUpdate(employees.filter(e => e.id !== employee.id));
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '7px 14px',
                        fontSize: 13,
                        fontWeight: 500,
                        background: 'transparent',
                        color: '#A32D2D',
                        border: '0.5px solid #F7C1C1',
                        borderRadius: 8,
                        cursor: 'pointer',
                      }}
                    >
                      מחק
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* ═══ Add Employee Modal — 3-Step Wizard ═══ */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'white',
            borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            padding: 24,
            maxWidth: 460,
            width: '100%',
            position: 'relative',
            maxHeight: '90vh',
            overflowY: 'auto',
            direction: 'rtl',
          }}>
            <button
              onClick={closeModal}
              style={{
                position: 'absolute', right: 12, top: 12,
                width: 28, height: 28, borderRadius: '50%', background: '#f5f0e8',
                border: 'none', cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b',
              }}
            >
              ✕
            </button>

            {/* Step indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              {[1, 2, 3].map(step => (
                <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700,
                    background: wizardStep >= step ? '#1a4a2e' : '#e8e0d4',
                    color: wizardStep >= step ? 'white' : '#9ca3af',
                  }}>
                    {wizardStep > step ? '✓' : step}
                  </div>
                  {step < 3 && <div style={{ width: 24, height: 2, background: wizardStep > step ? '#1a4a2e' : '#e8e0d4' }} />}
                </div>
              ))}
            </div>

            {/* ═══ Step 1: Personal Details ═══ */}
            {wizardStep === 1 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a4a2e', marginBottom: 16, marginTop: 0 }}>
                  פרטים אישיים
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>שם מלא *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="הזן שם עובדת"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>מספר טלפון</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="050-1234567"
                      dir="ltr"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>אימייל</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      placeholder="example@email.com"
                      dir="ltr"
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
                  <button onClick={closeModal} style={{ padding: '8px 16px', fontSize: 14, fontWeight: 600, background: '#f5f0e8', color: '#475569', border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer' }}>
                    ביטול
                  </button>
                  <button
                    onClick={() => {
                      if (!formData.name.trim()) { alert('נא להזין שם'); return; }
                      setWizardStep(2);
                    }}
                    style={{ padding: '8px 20px', fontSize: 14, fontWeight: 600, background: '#1a4a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                  >
                    הבא &larr;
                  </button>
                </div>
              </>
            )}

            {/* ═══ Step 2: Shift Settings ═══ */}
            {wizardStep === 2 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a4a2e', marginBottom: 16, marginTop: 0 }}>
                  הגדרות משמרת
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Seniority */}
                  <div>
                    <label style={labelStyle}>ותק בחודשים</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.seniority}
                      onChange={e => setFormData({ ...formData, seniority: parseInt(e.target.value) || 0 })}
                      style={inputStyle}
                    />
                    <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, display: 'block' }}>
                      לדוגמה: שנתיים = 24 חודשים
                    </span>
                  </div>

                  {/* Shift Type toggle */}
                  <div>
                    <label style={labelStyle}>סוג משמרת</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {toggleBtn('הכל', formData.shiftType === 'all', () => setFormData({ ...formData, shiftType: 'all' }))}
                      {toggleBtn('בוקר בלבד', formData.shiftType === 'morning', () => setFormData({ ...formData, shiftType: 'morning' }))}
                      {toggleBtn('ערב בלבד', formData.shiftType === 'evening', () => setFormData({ ...formData, shiftType: 'evening' }))}
                    </div>
                  </div>

                  {/* Friday toggle */}
                  <div>
                    <label style={labelStyle}>עובדת בשישי</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {toggleBtn('כל שישי', formData.friday === 'yes', () => setFormData({ ...formData, friday: 'yes' }))}
                      {toggleBtn('אחת לשבועיים', formData.friday === 'biweekly', () => setFormData({ ...formData, friday: 'biweekly' }))}
                      {toggleBtn('בכלל לא', formData.friday === 'no', () => setFormData({ ...formData, friday: 'no' }))}
                    </div>
                  </div>

                  {/* Date Range */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={labelStyle}>תאריך התחלה</label>
                      <input
                        type="date"
                        value={formData.activeFrom}
                        onChange={e => setFormData({ ...formData, activeFrom: e.target.value })}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>תאריך סיום</label>
                      <input
                        type="date"
                        value={formData.activeUntil}
                        onChange={e => setFormData({ ...formData, activeUntil: e.target.value })}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'space-between' }}>
                  <button onClick={() => setWizardStep(1)} style={{ padding: '8px 16px', fontSize: 14, fontWeight: 600, background: '#f5f0e8', color: '#475569', border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer' }}>
                    &rarr; הקודם
                  </button>
                  <button
                    onClick={handleSaveToSupabase}
                    disabled={saving}
                    style={{
                      padding: '8px 20px', fontSize: 14, fontWeight: 600,
                      background: saving ? '#9ca3af' : '#1a4a2e', color: 'white',
                      border: 'none', borderRadius: 6, cursor: saving ? 'default' : 'pointer',
                      opacity: saving ? 0.7 : 1,
                    }}
                  >
                    {saving ? 'שומר...' : 'שמור וצור קישור'}
                  </button>
                </div>
              </>
            )}

            {/* ═══ Step 3: Success + Magic Link ═══ */}
            {wizardStep === 3 && (
              <>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a4a2e', margin: '0 0 4px' }}>
                    {formData.name} נוספה בהצלחה!
                  </h2>
                  <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
                    שלחי לה את הקישור הבא כדי שתוכל להגיש העדפות
                  </p>
                </div>

                {magicLink ? (
                  <div style={{ background: '#f8f7f4', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                    <label style={{ ...labelStyle, marginBottom: 6 }}>קישור כניסה:</label>
                    <div style={{
                      display: 'flex', gap: 8, alignItems: 'center',
                    }}>
                      <input
                        readOnly
                        value={magicLink}
                        dir="ltr"
                        style={{
                          ...inputStyle, flex: 1,
                          background: 'white', fontSize: 12, fontFamily: 'monospace',
                        }}
                        onClick={e => (e.target as HTMLInputElement).select()}
                      />
                      <button
                        onClick={() => copyToClipboard(magicLink)}
                        style={{
                          padding: '6px 14px', fontSize: 13, fontWeight: 600,
                          background: copyFeedback === 'הועתק!' ? '#DCFCE7' : '#1a4a2e',
                          color: copyFeedback === 'הועתק!' ? '#166534' : 'white',
                          border: 'none', borderRadius: 6, cursor: 'pointer',
                          whiteSpace: 'nowrap', transition: 'all 0.15s',
                        }}
                      >
                        {copyFeedback || 'העתק קישור'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: '#FEF3C7', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: '#92400E' }}>
                    לא הצלחנו ליצור קישור. נסי ליצור דרך כפתור 🔗 בכרטיס העובדת.
                  </div>
                )}

                <button
                  onClick={closeModal}
                  style={{
                    width: '100%', padding: '10px 16px', fontSize: 14, fontWeight: 600,
                    background: '#f5f0e8', color: '#475569',
                    border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer',
                  }}
                >
                  סגור
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {createUserTarget && (
        <CreateUserModal
          employee={toSupabaseEmployee(createUserTarget)}
          onClose={() => setCreateUserTarget(null)}
        />
      )}
    </div>
  );
}
