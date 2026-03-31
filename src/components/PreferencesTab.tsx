import { useState, useEffect } from 'react';
import type { Employee } from '../data/employees';
import type { PrefShift, EmployeePrefs } from '../types';
import { updateFlexibility, removeFlexibility } from '../utils/fairnessAccumulator';

interface PreferencesTabProps {
  employees: Employee[];
  onAutoSchedule?: (targetWeekKey: string) => void;
}

const WEEK_STRUCTURE = [
  { day: 'ראשון', shifts: ['בוקר', 'ערב'] },
  { day: 'שני',   shifts: ['בוקר', 'ערב'] },
  { day: 'שלישי', shifts: ['בוקר', 'ערב'] },
  { day: 'רביעי', shifts: ['בוקר', 'ערב'] },
  { day: 'חמישי', shifts: ['בוקר', 'ערב'] },
  { day: 'שישי',  shifts: ['בוקר'] },
];

function getWeekStart(offset = 0): Date {
  const d = new Date();
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - d.getDay() + offset * 7);
  sunday.setHours(0, 0, 0, 0);
  return sunday;
}

function formatDate(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

function formatDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekSundayOf(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function loadDateRange(): { from: string; to: string } | null {
  try {
    const raw = localStorage.getItem('preferences_date_range');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function PreferencesTab({ employees, onAutoSchedule }: PreferencesTabProps) {
  const defaultFrom = getWeekStart(0);
  const defaultTo = new Date(defaultFrom);
  defaultTo.setDate(defaultFrom.getDate() + 5);

  const saved = loadDateRange();
  const [fromDate, setFromDate] = useState<Date>(() => saved?.from ? new Date(saved.from + 'T00:00:00') : defaultFrom);
  const [toDate, setToDate] = useState<Date>(() => saved?.to ? new Date(saved.to + 'T00:00:00') : defaultTo);

  const weekStart = getWeekSundayOf(fromDate);
  const weekKey = formatDateISO(weekStart);

  function updateDateRange(from: Date, to: Date) {
    setFromDate(from);
    setToDate(to);
    localStorage.setItem('preferences_date_range', JSON.stringify({
      from: formatDateISO(from),
      to: formatDateISO(to),
    }));
  }

  const [preferences, setPreferences] = useState<Record<string, EmployeePrefs>>({});
  const [editModalEmpId, setEditModalEmpId] = useState<string | null>(null);
  const [prefsText, setPrefsText] = useState('');
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [statusCopyToast, setStatusCopyToast] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{ line: number; content: string; type: string }[]>([]);

  const weekDays = WEEK_STRUCTURE.map((d, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return { ...d, dateStr: formatDate(date) };
  });

  // Load preferences from localStorage
  useEffect(() => {
    const prefForWeek: Record<string, EmployeePrefs> = {};
    employees.forEach(emp => {
      const raw = localStorage.getItem(`preferences_${emp.id}_${weekKey}`);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown[]>;
          const isOld = Object.values(parsed).some(v => Array.isArray(v) && v.length > 0 && typeof v[0] === 'string');
          if (isOld) {
            const converted: EmployeePrefs = {};
            for (const [day, shifts] of Object.entries(parsed)) {
              converted[day] = (shifts as string[]).map(s => ({ shift: s }));
            }
            prefForWeek[emp.id] = converted;
          } else {
            prefForWeek[emp.id] = parsed as EmployeePrefs;
          }
        } catch { prefForWeek[emp.id] = {}; }
      } else {
        prefForWeek[emp.id] = {};
      }
    });
    setPreferences(prefForWeek);
  }, [weekKey, employees]);

  function setPreferencesForEmployee(empId: string, prefs: EmployeePrefs) {
    localStorage.setItem(`preferences_${empId}_${weekKey}`, JSON.stringify(prefs));
    setPreferences(prev => ({ ...prev, [empId]: prefs }));
    const submittedShifts = Object.values(prefs).flat().length;
    const emp = employees.find(e => e.id === empId);
    updateFlexibility(empId, weekKey, submittedShifts, emp?.shiftsPerWeek ?? 3);
  }

  function deletePreferencesForEmployee(empId: string) {
    localStorage.removeItem(`preferences_${empId}_${weekKey}`);
    setPreferences(prev => { const next = { ...prev }; delete next[empId]; return next; });
    removeFlexibility(empId, weekKey);
  }

  function closeEditModal() {
    setEditModalEmpId(null);
    setPrefsText('');
    setValidationErrors([]);
  }

  function formatPrefShifts(prefShifts: PrefShift[]): string {
    return prefShifts.map(ps => {
      let s = ps.shift;
      if (ps.customArrival) s += ` מ-${ps.customArrival}`;
      if (ps.customDeparture) s += ` עד ${ps.customDeparture}`;
      return s;
    }).join('/');
  }

  function serializePreferences(empId: string): string {
    const prefs = preferences[empId] || {};
    const lines: string[] = [];
    for (const d of weekDays) {
      const prefShifts = prefs[d.day];
      if (!prefShifts || prefShifts.length === 0) continue;
      const shifts = prefShifts.map(ps => ps.shift);
      if (d.day === 'שישי') {
        lines.push(`${d.dateStr} שישי`);
      } else if (shifts.includes('בוקר') && shifts.includes('ערב')) {
        lines.push(`${d.dateStr} בוקר/ערב`);
      } else {
        for (const ps of prefShifts) {
          lines.push(`${d.dateStr} ${ps.shift}`);
        }
      }
    }
    return lines.join('\n');
  }

  function generateEmployeePrefsText(empId: string): string {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return '';
    const prefs = preferences[empId] || {};
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 5);
    const range = `${formatDate(weekStart)}-${formatDate(weekEnd)}`;
    const lines = [`העדפות ${emp.name} לשבוע ${range}:`];
    for (const d of weekDays) {
      const prefShifts = prefs[d.day];
      if (prefShifts && prefShifts.length > 0) lines.push(`• ${d.dateStr} — ${formatPrefShifts(prefShifts)}`);
    }
    return lines.join('\n');
  }

  function generateAllPrefsText(): string {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 5);
    const range = `${formatDate(weekStart)}-${formatDate(weekEnd)}`;
    const withPrefs = employees.filter(e => {
      const p = preferences[e.id];
      return p && Object.keys(p).length > 0;
    });
    const sep = '══════════════════';
    const lines = [`סיכום העדפות שבוע ${range}`, sep, ''];
    for (const emp of withPrefs) {
      const prefs = preferences[emp.id] || {};
      lines.push(`${emp.name}:`);
      for (const d of weekDays) {
        const prefShifts = prefs[d.day];
        if (prefShifts && prefShifts.length > 0) lines.push(`• ${d.dateStr} — ${formatPrefShifts(prefShifts)}`);
      }
      lines.push('');
    }
    lines.push(sep);
    lines.push(`הוגשו: ${withPrefs.length}/${employees.length} עובדות`);
    return lines.join('\n');
  }

  function triggerStatusCopy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setStatusCopyToast(true);
      setTimeout(() => setStatusCopyToast(false), 2000);
    });
  }

  function handleModalSave() {
    if (!editModalEmpId) return;
    const emp = employees.find(e => e.id === editModalEmpId);
    if (!emp) return;

    const text = prefsText.trim();

    // Empty text → confirm delete
    if (!text) {
      if (window.confirm(`האם למחוק את כל ההעדפות של ${emp.name} לשבוע זה?`)) {
        deletePreferencesForEmployee(emp.id);
        closeEditModal();
        setSaveToast(`העדפות ${emp.name} נמחקו`);
        setTimeout(() => setSaveToast(null), 3000);
      }
      return;
    }

    // Validation
    const weekDates = weekDays.map(d => d.dateStr);
    const VALID_SHIFT_TYPES = ['בוקר', 'ערב', 'בוקר/ערב', 'שישי'];
    const lines = text.split('\n');
    const errors: { line: number; content: string; type: string }[] = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const lineNum = index + 1;

      const spaceIndex = trimmed.indexOf(' ');
      if (spaceIndex === -1) {
        errors.push({ line: lineNum, content: trimmed, type: 'missing_shift' });
        return;
      }

      const datePart = trimmed.substring(0, spaceIndex).trim();
      const shiftPart = trimmed.substring(spaceIndex + 1).trim();

      const dateMatch = datePart.match(/^(\d{1,2})\.(\d{1,2})$/);
      if (!dateMatch) {
        errors.push({ line: lineNum, content: trimmed, type: 'invalid_date' });
        return;
      }
      const day = parseInt(dateMatch[1]);
      const month = parseInt(dateMatch[2]);
      if (day < 1 || day > 31 || month < 1 || month > 12) {
        errors.push({ line: lineNum, content: trimmed, type: 'invalid_date' });
        return;
      }

      const normalizedDate = `${day}.${month}`;
      if (!weekDates.includes(normalizedDate)) {
        errors.push({ line: lineNum, content: trimmed, type: 'out_of_range' });
        return;
      }

      if (!VALID_SHIFT_TYPES.includes(shiftPart)) {
        errors.push({ line: lineNum, content: trimmed, type: 'invalid_shift' });
        return;
      }
    });

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);

    // Parse validated lines into EmployeePrefs
    const dateToDay = new Map<string, string>();
    weekDays.forEach(d => dateToDay.set(d.dateStr, d.day));

    const prefs: EmployeePrefs = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const spaceIndex = trimmed.indexOf(' ');
      const datePart = trimmed.substring(0, spaceIndex).trim();
      const shiftPart = trimmed.substring(spaceIndex + 1).trim();
      const dateMatch = datePart.match(/^(\d{1,2})\.(\d{1,2})$/);
      if (!dateMatch) continue;
      const normalizedDate = `${parseInt(dateMatch[1])}.${parseInt(dateMatch[2])}`;
      const dayName = dateToDay.get(normalizedDate);
      if (!dayName) continue;

      let shifts: string[];
      if (shiftPart === 'בוקר/ערב') {
        shifts = ['בוקר', 'ערב'];
      } else if (shiftPart === 'שישי') {
        shifts = ['בוקר'];
      } else {
        shifts = [shiftPart];
      }

      prefs[dayName] = prefs[dayName] || [];
      for (const sh of shifts) {
        if (!prefs[dayName].some(p => p.shift === sh)) {
          prefs[dayName].push({ shift: sh });
        }
      }
    }

    const count = Object.values(prefs).flat().length;
    setPreferencesForEmployee(emp.id, prefs);
    closeEditModal();
    setSaveToast(`העדפות ${emp.name} נשמרו — ${count} משמרות`);
    setTimeout(() => setSaveToast(null), 3000);
  }

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 5);

  const btnBase: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer' };
  const smallBtnBase: React.CSSProperties = { padding: '4px 10px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 4, cursor: 'pointer' };

  return (
    <div dir="rtl" style={{ padding: '0 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1a4a2e' }}>
          העדפות — שבוע {formatDate(weekStart)}–{formatDate(weekEnd)}.{weekStart.getFullYear()}
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => {
              if (window.confirm('למחוק את כל ההעדפות של כל העובדות השבוע?')) {
                employees.forEach(e => deletePreferencesForEmployee(e.id));
                localStorage.removeItem('preferences_date_range');
              }
            }}
            style={{ ...btnBase, background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}
          >
            אפס את כל ההעדפות
          </button>
          <button
            onClick={() => triggerStatusCopy(generateAllPrefsText())}
            style={{ ...btnBase, background: '#16a34a', color: 'white' }}
          >
            העתק הכל לווטסאפ
          </button>
        </div>
      </div>

      {/* Date range pickers */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, background: 'white', padding: '12px 16px', borderRadius: 8, border: '1px solid #e8e0d4', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#1a4a2e' }}>העדפות לשבוע:</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: '#64748b' }}>מתאריך</span>
          <input
            type="date"
            value={formatDateISO(fromDate)}
            onChange={e => {
              const d = new Date(e.target.value + 'T00:00:00');
              if (!isNaN(d.getTime())) {
                const sunday = getWeekSundayOf(d);
                const friday = new Date(sunday);
                friday.setDate(sunday.getDate() + 5);
                updateDateRange(sunday, friday);
              }
            }}
            style={{ padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #e8e0d4', color: '#1a1a1a' }}
          />
          <span style={{ fontSize: 13, color: '#64748b' }}>עד תאריך</span>
          <input
            type="date"
            value={formatDateISO(toDate)}
            onChange={e => {
              const d = new Date(e.target.value + 'T00:00:00');
              if (!isNaN(d.getTime())) updateDateRange(fromDate, d);
            }}
            style={{ padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #e8e0d4', color: '#1a1a1a' }}
          />
        </div>
      </div>

      {/* Active date range indicator */}
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10, fontWeight: 500 }}>
        {`מציג העדפות לתאריכים ${formatDate(fromDate)}–${formatDate(toDate)}`}
      </div>

      {/* Empty state */}
      {employees.every(e => !preferences[e.id] || Object.keys(preferences[e.id]).length === 0) && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6, padding: '12px 16px', marginBottom: 14, color: '#856404', fontSize: 13 }}>
          לא הוזנו העדפות כלל לשבוע זה
        </div>
      )}

      {/* Status table */}
      <div style={{ background: 'white', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: 16, marginBottom: 16, border: '1px solid #e8e0d4' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ background: '#1a4a2e', color: 'white', padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>עובדת</th>
              <th style={{ background: '#1a4a2e', color: 'white', padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>העדפות</th>
              <th style={{ background: '#1a4a2e', color: 'white', padding: '10px 14px', textAlign: 'center', width: 180, fontWeight: 600 }}>פעולה</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, idx) => {
              const empPrefs = preferences[emp.id];
              const hasPrefs = !!(empPrefs && Object.keys(empPrefs).length > 0);
              const summary = hasPrefs
                ? weekDays.filter(d => (empPrefs[d.day] || []).length > 0).map(d => `${d.day}: ${formatPrefShifts(empPrefs[d.day] || [])}`).join(' | ')
                : null;
              return (
                <tr key={emp.id} style={{ background: idx % 2 === 0 ? '#ffffff' : '#faf7f2' }}>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid #e8e0d4', fontWeight: 600, color: '#1a4a2e' }}>{emp.name}</td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid #e8e0d4', fontSize: 12 }}>
                    {hasPrefs ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#dcfce7', color: '#16a34a' }}>
                          הגישה
                        </span>
                        <span style={{ color: '#475569' }}>{summary}</span>
                      </div>
                    ) : (
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#f5f0e8', color: '#64748b' }}>
                        לא הגישה
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #e8e0d4', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button
                        onClick={() => {
                          setEditModalEmpId(emp.id);
                          setPrefsText(hasPrefs ? serializePreferences(emp.id) : '');
                          setValidationErrors([]);
                        }}
                        style={{ ...smallBtnBase, background: hasPrefs ? '#1a4a2e' : '#16a34a', color: 'white' }}
                      >
                        {hasPrefs ? 'ערוך' : 'צור'}
                      </button>
                      {hasPrefs && (
                        <>
                          <button
                            onClick={() => triggerStatusCopy(generateEmployeePrefsText(emp.id))}
                            title="העתק לווטסאפ"
                            style={{ ...smallBtnBase, background: '#0891b2', color: 'white' }}
                          >
                            העתק
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`למחוק את העדפות ${emp.name}?`)) {
                                deletePreferencesForEmployee(emp.id);
                              }
                            }}
                            style={{ ...smallBtnBase, background: '#fee2e2', color: '#dc2626' }}
                          >
                            אפס
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* AutoSchedule button */}
      {onAutoSchedule && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <button
            onClick={() => onAutoSchedule(weekKey)}
            style={{ ...btnBase, padding: '10px 28px', fontSize: 14, background: '#c17f3b', color: 'white' }}
          >
            שבץ אוטומטי לטווח זה
          </button>
        </div>
      )}

      {/* Edit preferences modal */}
      {editModalEmpId !== null && (() => {
        const modalEmp = employees.find(e => e.id === editModalEmpId);
        if (!modalEmp) return null;
        return (
          <div
            onClick={closeEditModal}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ background: 'white', borderRadius: 12, padding: 24, width: 520, maxWidth: '90vw', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', position: 'relative' }}
              dir="rtl"
            >
              <button
                onClick={closeEditModal}
                style={{ position: 'absolute', left: 12, top: 12, width: 28, height: 28, borderRadius: '50%', background: '#f5f0e8', border: 'none', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}
              >
                ✕
              </button>
              <h3 style={{ margin: '0 0 16px 0', fontSize: 17, fontWeight: 700, color: '#1a4a2e' }}>
                עריכת העדפות — {modalEmp.name}
              </h3>

              {/* Instructions box */}
              <div style={{ background: '#EAF3DE', border: '1px solid #C0DD97', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#3B6D11', marginBottom: 10, direction: 'rtl' }}>
                <div style={{ fontWeight: 500 }}>פורמט הזנה:</div>
                <div>תאריך + סוג משמרת, שורה אחת לכל בקשה</div>
                <div style={{ height: 6 }} />
                <div style={{ fontWeight: 700 }}>דוגמאות:</div>
                <div style={{ background: 'white', borderRadius: 4, padding: '6px 10px', fontFamily: 'monospace', marginTop: 4, whiteSpace: 'pre', lineHeight: 1.6 }}>
{`${weekDays[0].dateStr} בוקר
${weekDays[1].dateStr} ערב
${weekDays[2].dateStr} בוקר/ערב
${weekDays[5].dateStr} שישי`}
                </div>
              </div>

              {/* Textarea */}
              <textarea
                value={prefsText}
                onChange={e => { setPrefsText(e.target.value); setValidationErrors([]); }}
                rows={8}
                style={{
                  width: '100%', padding: 10, boxSizing: 'border-box', fontSize: 13,
                  border: `1px solid ${validationErrors.length > 0 ? '#E24B4A' : '#e8e0d4'}`,
                  borderRadius: 6, fontFamily: 'inherit', color: '#1a1a1a',
                }}
                placeholder={`${weekDays[0].dateStr} בוקר\n${weekDays[1].dateStr} ערב\n${weekDays[2].dateStr} בוקר/ערב\n${weekDays[5].dateStr} שישי`}
                autoFocus
              />

              {/* Validation errors */}
              {validationErrors.map((err, i) => {
                let msg = '';
                if (err.type === 'invalid_date') {
                  msg = `שגיאה בשורה ${err.line}: תאריך לא תקין — '${err.content}'\nהשתמש בפורמט D.M (לדוגמה: ${weekDays[0].dateStr})`;
                } else if (err.type === 'out_of_range') {
                  msg = `שגיאה בשורה ${err.line}: התאריך לא בשבוע הנוכחי — '${err.content}'\nהשבוע הנוכחי: ${formatDate(weekStart)}–${formatDate(weekEnd)}`;
                } else if (err.type === 'invalid_shift') {
                  msg = `שגיאה בשורה ${err.line}: סוג משמרת לא מזוהה — '${err.content}'\nערכים מותרים: בוקר / ערב / בוקר/ערב / שישי`;
                } else if (err.type === 'missing_shift') {
                  msg = `שגיאה בשורה ${err.line}: חסר סוג משמרת — '${err.content}'\nפורמט נכון: תאריך + רווח + סוג משמרת (לדוגמה: ${weekDays[0].dateStr} בוקר)`;
                }
                return (
                  <div key={i} style={{ background: '#FCEBEB', border: '1px solid #F7C1C1', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#A32D2D', marginTop: 6, direction: 'rtl', whiteSpace: 'pre-wrap' }}>
                    {msg}
                  </div>
                );
              })}

              {/* Action buttons */}
              <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={closeEditModal}
                  style={{ ...btnBase, background: '#f5f0e8', color: '#475569', border: '1px solid #e8e0d4' }}
                >
                  ביטול
                </button>
                <button
                  onClick={handleModalSave}
                  style={{ ...btnBase, background: '#1a4a2e', color: 'white' }}
                >
                  שמור
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Toasts */}
      {statusCopyToast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#16a34a', color: 'white', padding: '12px 28px', borderRadius: 8, zIndex: 9999, fontSize: 15, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', pointerEvents: 'none' }}>
          הועתק!
        </div>
      )}
      {saveToast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#16a34a', color: 'white', padding: '12px 28px', borderRadius: 8, zIndex: 9999, fontSize: 15, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', pointerEvents: 'none' }}>
          {saveToast}
        </div>
      )}
    </div>
  );
}
