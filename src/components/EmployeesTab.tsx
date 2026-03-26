import { useState } from 'react';
import type { Employee, FixedShift } from '../data/employees';

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

export function EmployeesTab({ employees, onUpdate }: EmployeesTabProps) {
  // Modal state — add only
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Partial<Employee>>({
    name: '',
    shiftsPerWeek: 3,
    fridayAvailability: 'never',
    shiftType: 'הכל',
    isTrainee: false,
    availableFromDate: '',
    availableToDate: '',
    fixedShifts: [],
  });

  // Inline card edit state
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [draftEmployee, setDraftEmployee] = useState<Partial<Employee> | null>(null);

  const shiftOptions = Array.from({ length: 13 }, (_, i) => i); // 0..12
  const dayOptions = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];
  const shiftTypeOptions = ['בוקר', 'ערב'];

  // ── Add Modal ──
  const openAddModal = () => {
    setFormData({
      name: '',
      shiftsPerWeek: 3,
      fridayAvailability: 'never',
      shiftType: 'הכל',
      isTrainee: false,
      availableFromDate: '',
      availableToDate: '',
      fixedShifts: [],
    });
    setShowModal(true);
  };

  const closeModal = () => setShowModal(false);

  const handleAddSave = () => {
    if (!formData.name?.trim()) {
      alert('אנא הזן שם עובדת');
      return;
    }
    const newId = Math.max(...employees.map(e => e.id), 0) + 1;
    const employee: Employee = {
      id: newId,
      name: formData.name,
      shiftsPerWeek: formData.shiftsPerWeek || 3,
      fridayAvailability: formData.fridayAvailability || 'never',
      shiftType: formData.shiftType || 'הכל',
      isTrainee: formData.isTrainee || false,
      availableFrom: '',
      availableTo: '',
      availableFromDate: formData.availableFromDate || '',
      availableToDate: formData.availableToDate || '',
      fairnessHistory: [],
      flexibilityHistory: [],
      fixedShifts: (formData.fixedShifts as FixedShift[]) || [],
    };
    onUpdate([...employees, employee]);
    closeModal();
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

      {/* Add Employee Modal */}
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
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a4a2e', marginBottom: 20, marginTop: 0 }}>
              הוסף עובדת חדשה
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Name */}
              <div>
                <label style={labelStyle}>שם:</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="הזן שם עובדת"
                  style={inputStyle}
                />
              </div>

              {/* Shifts Per Week */}
              <div>
                <label style={labelStyle}>מספר משמרות בשבוע:</label>
                <select
                  value={formData.shiftsPerWeek ?? 3}
                  onChange={(e) => setFormData({...formData, shiftsPerWeek: parseInt(e.target.value)})}
                  style={selectStyle}
                >
                  {shiftOptions.map(num => (
                    <option key={num} value={num}>{num}</option>
                  ))}
                </select>
              </div>

              {/* Friday */}
              <div>
                <label style={labelStyle}>שישי:</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input type="radio" name="fridayAvailability" value="always"
                      checked={formData.fridayAvailability === 'always'}
                      onChange={() => setFormData({...formData, fridayAvailability: 'always'})}
                    /> כן — כל שישי
                  </label>
                  <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input type="radio" name="fridayAvailability" value="never"
                      checked={formData.fridayAvailability === 'never'}
                      onChange={() => setFormData({...formData, fridayAvailability: 'never'})}
                    /> לא — אף פעם
                  </label>
                  <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input type="radio" name="fridayAvailability" value="biweekly"
                      checked={formData.fridayAvailability === 'biweekly'}
                      onChange={() => setFormData({...formData, fridayAvailability: 'biweekly'})}
                    /> אחת לשבועיים
                  </label>
                </div>
              </div>

              {/* Trainee */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="modal-isTrainee"
                  checked={formData.isTrainee || false}
                  onChange={(e) => setFormData({...formData, isTrainee: e.target.checked})}
                  style={{ width: 18, height: 18, accentColor: '#c17f3b' }}
                />
                <label htmlFor="modal-isTrainee" style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>מתלמדת (בהכשרה)</label>
              </div>

              {/* Shift Type */}
              <div>
                <label style={labelStyle}>סוג משמרת:</label>
                <select
                  value={formData.shiftType || 'הכל'}
                  onChange={(e) => setFormData({...formData, shiftType: e.target.value as any})}
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
                  <input
                    type="date"
                    value={formData.availableFromDate || ''}
                    onChange={(e) => setFormData({...formData, availableFromDate: e.target.value})}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>זמין עד:</label>
                  <input
                    type="date"
                    value={formData.availableToDate || ''}
                    onChange={(e) => setFormData({...formData, availableToDate: e.target.value})}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* Fixed Shifts in Modal */}
            <div style={{ marginTop: 14, borderTop: '1px solid #f0ebe3', paddingTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#0C447C' }}>
                  משמרות קבועות {((formData.fixedShifts as FixedShift[])?.length || 0) > 0 && `(${(formData.fixedShifts as FixedShift[])!.length})`}
                </label>
                <button
                  onClick={() => {
                    const newFs: FixedShift = { day: 'ראשון', shift: 'בוקר', arrivalTime: '07:00', departureTime: '14:00' };
                    setFormData({ ...formData, fixedShifts: [...((formData.fixedShifts as FixedShift[]) || []), newFs] });
                  }}
                  style={{ fontSize: 11, padding: '2px 8px', background: '#E6F1FB', color: '#0C447C', border: '1px solid #B3D4F0', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                >
                  + הוסף
                </button>
              </div>
              {((formData.fixedShifts as FixedShift[]) || []).map((fs, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                  <select value={fs.day} onChange={e => {
                    const arr = [...((formData.fixedShifts as FixedShift[]) || [])];
                    arr[idx] = { ...arr[idx], day: e.target.value };
                    if (e.target.value === 'שישי') { arr[idx].shift = 'בוקר'; arr[idx].arrivalTime = '07:00'; arr[idx].departureTime = '14:00'; }
                    setFormData({ ...formData, fixedShifts: arr });
                  }} style={{ fontSize: 11, padding: '3px 4px', borderRadius: 4, border: '1px solid #e8e0d4', width: 60 }}>
                    {dayOptions.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select value={fs.shift} onChange={e => {
                    const arr = [...((formData.fixedShifts as FixedShift[]) || [])];
                    arr[idx] = { ...arr[idx], shift: e.target.value, arrivalTime: e.target.value === 'בוקר' ? '07:00' : '14:00', departureTime: e.target.value === 'בוקר' ? '14:00' : '21:00' };
                    setFormData({ ...formData, fixedShifts: arr });
                  }} style={{ fontSize: 11, padding: '3px 4px', borderRadius: 4, border: '1px solid #e8e0d4', width: 50 }}>
                    {(fs.day === 'שישי' ? ['בוקר'] : shiftTypeOptions).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input type="time" value={fs.arrivalTime} onChange={e => {
                    const arr = [...((formData.fixedShifts as FixedShift[]) || [])];
                    arr[idx] = { ...arr[idx], arrivalTime: e.target.value };
                    setFormData({ ...formData, fixedShifts: arr });
                  }} style={{ fontSize: 11, padding: '3px 2px', borderRadius: 4, border: '1px solid #e8e0d4', width: 70 }} />
                  <input type="time" value={fs.departureTime} onChange={e => {
                    const arr = [...((formData.fixedShifts as FixedShift[]) || [])];
                    arr[idx] = { ...arr[idx], departureTime: e.target.value };
                    setFormData({ ...formData, fixedShifts: arr });
                  }} style={{ fontSize: 11, padding: '3px 2px', borderRadius: 4, border: '1px solid #e8e0d4', width: 70 }} />
                  <button onClick={() => {
                    const arr = ((formData.fixedShifts as FixedShift[]) || []).filter((_, i) => i !== idx);
                    setFormData({ ...formData, fixedShifts: arr });
                  }} style={{ fontSize: 12, background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '0 4px', fontWeight: 700 }}>✕</button>
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button
                onClick={handleAddSave}
                style={{
                  flex: 1,
                  padding: '8px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  background: '#1a4a2e',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                שמור
              </button>
              <button
                onClick={closeModal}
                style={{
                  flex: 1,
                  padding: '8px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  background: '#f5f0e8',
                  color: '#475569',
                  border: '1px solid #e8e0d4',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
