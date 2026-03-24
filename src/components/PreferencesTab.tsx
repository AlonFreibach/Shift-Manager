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

  const [preferences, setPreferences] = useState<Record<number, EmployeePrefs>>({});
  const [modalStep, setModalStep] = useState<'input' | 'confirm' | 'summary'>('input');
  const [prefEmployeeId, setPrefEmployeeId] = useState<number | null>(employees[0]?.id ?? null);
  const [prefsText, setPrefsText] = useState('');
  const [parserError, setParserError] = useState<string | null>(null);
  const [lastConfirmed, setLastConfirmed] = useState<{ name: string; count: number } | null>(null);
  const [submitToast, setSubmitToast] = useState(false);
  const [statusCopyToast, setStatusCopyToast] = useState(false);
  const [showInputForm, setShowInputForm] = useState(false);

  const weekDays = WEEK_STRUCTURE.map((d, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return { ...d, dateStr: formatDate(date) };
  });

  // Load preferences from localStorage
  useEffect(() => {
    const prefForWeek: Record<number, EmployeePrefs> = {};
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

  function setPreferencesForEmployee(empId: number, prefs: EmployeePrefs) {
    localStorage.setItem(`preferences_${empId}_${weekKey}`, JSON.stringify(prefs));
    setPreferences(prev => ({ ...prev, [empId]: prefs }));
    const submittedShifts = Object.values(prefs).flat().length;
    const emp = employees.find(e => e.id === empId);
    updateFlexibility(empId, weekKey, submittedShifts, emp?.shiftsPerWeek ?? 3);
  }

  function deletePreferencesForEmployee(empId: number) {
    localStorage.removeItem(`preferences_${empId}_${weekKey}`);
    setPreferences(prev => { const next = { ...prev }; delete next[empId]; return next; });
    removeFlexibility(empId, weekKey);
  }

  function formatPrefShifts(prefShifts: PrefShift[]): string {
    return prefShifts.map(ps => {
      let s = ps.shift;
      if (ps.customArrival) s += ` מ-${ps.customArrival}`;
      if (ps.customDeparture) s += ` עד ${ps.customDeparture}`;
      return s;
    }).join('/');
  }

  function serializePreferences(empId: number): string {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return '';
    const prefs = preferences[empId] || {};
    const lines = [emp.name];
    for (const d of weekDays) {
      const prefShifts = prefs[d.day];
      if (!prefShifts || prefShifts.length === 0) continue;
      for (const ps of prefShifts) {
        let line = `${d.dateStr} ${ps.shift}`;
        if (ps.customArrival) line += ` מ-${ps.customArrival}`;
        if (ps.customDeparture) line += ` עד ${ps.customDeparture}`;
        lines.push(line);
      }
    }
    return lines.join('\n');
  }

  function generateEmployeePrefsText(empId: number): string {
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

  function parsePreferencesText(text: string): { prefs: EmployeePrefs; badLines: { raw: string; reason: string }[] } {
    text = text.replace(/[\u05B0-\u05C7]/g, '');

    const DAY_NAME_MAP: Record<string, string> = {
      'ראשון': 'ראשון', 'שני': 'שני', 'שלישי': 'שלישי',
      'רביעי': 'רביעי', 'חמישי': 'חמישי', 'שישי': 'שישי',
    };
    const SHIFT_KEYWORDS = new Set(['בוקר', 'ערב', 'אמצע', 'שישי']);
    const datePattern = /^\d{1,2}\.\d{1,2}$/;
    const timePattern = /^\d{1,2}:\d{2}$/;

    const dateToDay = new Map<string, string>();
    weekDays.forEach(d => dateToDay.set(d.dateStr, d.day));

    const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (rawLines.length === 0) throw new Error('אין טקסט');

    const firstToken = rawLines[0].split(/[\s,]/)[0];
    const firstIsPref = datePattern.test(firstToken) || DAY_NAME_MAP[firstToken] !== undefined;
    const prefLines = firstIsPref ? rawLines : rawLines.slice(1);

    const items: string[] = [];
    for (const line of prefLines) {
      for (const part of line.split(',')) {
        const t = part.trim();
        if (t) items.push(t);
      }
    }

    const prefs: EmployeePrefs = {};
    const badLines: { raw: string; reason: string }[] = [];

    for (const item of items) {
      const tokens = item.split(/\s+/);
      const firstTok = tokens[0];

      let day: string | undefined;
      if (datePattern.test(firstTok)) {
        day = dateToDay.get(firstTok);
        if (!day) continue;
      } else if (DAY_NAME_MAP[firstTok]) {
        day = DAY_NAME_MAP[firstTok];
      } else {
        badLines.push({ raw: item, reason: 'חסר תאריך או שם יום' });
        continue;
      }

      if (tokens.length < 2 || !SHIFT_KEYWORDS.has(tokens[1])) {
        badLines.push({ raw: item, reason: 'חסר משמרת' });
        continue;
      }

      const rest = tokens.slice(1).join(' ');

      if (rest.includes('/')) {
        const shiftParts = rest.split('/').map(s => s.trim());
        if (shiftParts.some(s => !SHIFT_KEYWORDS.has(s))) {
          badLines.push({ raw: item, reason: 'פורמט לא מוכר' });
          continue;
        }
        for (const s of shiftParts) {
          const sh = s === 'שישי' && day === 'שישי' ? 'בוקר' : s;
          if (!WEEK_STRUCTURE.some(w => w.day === day && w.shifts.includes(sh))) continue;
          prefs[day] = prefs[day] || [];
          if (!prefs[day].some(p => p.shift === sh)) prefs[day].push({ shift: sh });
        }
        continue;
      }

      const shiftWord = tokens[1];
      let customDeparture: string | undefined;
      let customArrival: string | undefined;
      let badModifier = false;
      let i = 2;
      while (i < tokens.length) {
        if (tokens[i] === 'עד' && i + 1 < tokens.length && timePattern.test(tokens[i + 1])) {
          customDeparture = tokens[i + 1]; i += 2;
        } else if (tokens[i].startsWith('מ-') && timePattern.test(tokens[i].slice(2))) {
          customArrival = tokens[i].slice(2); i += 1;
        } else if (tokens[i] === 'מ' && i + 1 < tokens.length && timePattern.test(tokens[i + 1])) {
          customArrival = tokens[i + 1]; i += 2;
        } else {
          badModifier = true; break;
        }
      }
      if (badModifier) { badLines.push({ raw: item, reason: 'פורמט לא מוכר' }); continue; }

      const actualShift = shiftWord === 'שישי' && day === 'שישי' ? 'בוקר' : shiftWord;
      if (!WEEK_STRUCTURE.some(w => w.day === day && w.shifts.includes(actualShift))) continue;

      prefs[day] = prefs[day] || [];
      const existing = prefs[day].findIndex(p => p.shift === actualShift);
      const entry: PrefShift = { shift: actualShift };
      if (customDeparture) entry.customDeparture = customDeparture;
      if (customArrival) entry.customArrival = customArrival;
      if (existing >= 0) prefs[day][existing] = entry;
      else prefs[day].push(entry);
    }

    return { prefs, badLines };
  }

  function handlePreferencesParse() {
    if (!prefEmployeeId) { setParserError('בחרי עובדת'); return; }
    const emp = employees.find(e => e.id === prefEmployeeId);
    if (!emp) { setParserError('עובדת לא נמצאה'); return; }
    try {
      const { prefs, badLines } = parsePreferencesText(prefsText);
      if (badLines.length > 0) {
        setParserError(
          '⚠️ לא הצלחתי להבין את השורות הבאות:\n' +
          badLines.map(b => `• "${b.raw}" — ${b.reason}`).join('\n') +
          '\n\nהפורמט הנכון:\nDD.M בוקר/ערב/שישי\nDD.M בוקר עד HH:MM\nDD.M ערב מ-HH:MM\nלדוגמה:\n22.3 בוקר\n23.3 ערב\n25.3 בוקר/ערב\n27.3 שישי\n22.3 בוקר עד 13:00'
        );
        return;
      }
      const count = Object.values(prefs).flat().length;
      if (count === 0) {
        setParserError(
          '❌ לא הצלחתי להבין את ההעדפות. נסי לכתוב בפורמט:\n' +
          '\'ראשון בוקר, שני ערב, שישי לא\'\n' +
          '(יום + משמרת, מופרדים בפסיקים)'
        );
        return;
      }
      setPreferencesForEmployee(emp.id, prefs);
      setLastConfirmed({ name: emp.name, count });
      setModalStep('confirm');
      setParserError(null);
    } catch (err: any) {
      setParserError(err?.message || 'שגיאה בפרסר');
    }
  }

  function handleSubmitAll() {
    setShowInputForm(false);
    setModalStep('input');
    setPrefsText('');
    setSubmitToast(true);
    setTimeout(() => setSubmitToast(false), 3000);
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
            style={{ padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #e8e0d4' }}
          />
          <span style={{ fontSize: 13, color: '#64748b' }}>עד תאריך</span>
          <input
            type="date"
            value={formatDateISO(toDate)}
            onChange={e => {
              const d = new Date(e.target.value + 'T00:00:00');
              if (!isNaN(d.getTime())) updateDateRange(fromDate, d);
            }}
            style={{ padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #e8e0d4' }}
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
                          setPrefEmployeeId(emp.id);
                          setPrefsText(hasPrefs ? serializePreferences(emp.id) : '');
                          setParserError(null);
                          setModalStep('input');
                          setShowInputForm(true);
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

      {/* Add preferences button */}
      {!showInputForm && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={() => {
              setModalStep('input');
              setPrefsText('');
              setParserError(null);
              setPrefEmployeeId(employees[0]?.id ?? null);
              setShowInputForm(true);
            }}
            style={{ ...btnBase, padding: '10px 28px', fontSize: 14, background: '#1a4a2e', color: 'white' }}
          >
            + הזן העדפות
          </button>
        </div>
      )}

      {/* Input form (inline, not modal) */}
      {showInputForm && (
        <div style={{ background: 'white', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: 20, position: 'relative', border: '1px solid #e8e0d4' }}>
          {/* Navigation */}
          {modalStep !== 'input' && (
            <button
              onClick={() => setModalStep(modalStep === 'summary' ? 'confirm' : 'input')}
              style={{ position: 'absolute', left: 12, top: 12, fontSize: 12, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px' }}
            >
              ← חזור
            </button>
          )}
          <button
            onClick={() => { setShowInputForm(false); setModalStep('input'); setPrefsText(''); }}
            style={{ position: 'absolute', right: 12, top: 12, width: 28, height: 28, borderRadius: '50%', background: '#f5f0e8', border: 'none', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}
            title="סגור"
          >
            ✕
          </button>

          {/* Step 1: Input */}
          {modalStep === 'input' && (
            <>
              <h3 style={{ marginBottom: 12, fontSize: 16, marginTop: 0, fontWeight: 700, color: '#1a4a2e' }}>הזן העדפות</h3>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 13, color: '#475569' }}>עובדת:</label>
              <select
                value={prefEmployeeId ?? ''}
                onChange={e => setPrefEmployeeId(Number(e.target.value))}
                style={{ width: '100%', marginBottom: 10, padding: '8px 10px', fontSize: 14, border: '1px solid #e8e0d4', borderRadius: 6 }}
              >
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
              <textarea
                value={prefsText}
                onChange={e => setPrefsText(e.target.value)}
                rows={8}
                style={{ width: '100%', padding: 10, boxSizing: 'border-box', fontSize: 13, border: '1px solid #e8e0d4', borderRadius: 6 }}
                placeholder="הדבק כאן את ההעדפות כפי שקיבלת בווטסאפ"
              />
              {parserError && (
                <div style={{ color: '#dc2626', marginTop: 8, fontSize: 12, whiteSpace: 'pre-wrap', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px' }}>
                  {parserError}
                </div>
              )}
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handlePreferencesParse}
                  style={{ ...btnBase, background: '#1a4a2e', color: 'white' }}
                >
                  פרסר והוסף
                </button>
              </div>
            </>
          )}

          {/* Step 2: Confirm */}
          {modalStep === 'confirm' && lastConfirmed && (
            <>
              <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 6, padding: '14px 16px', marginBottom: 20, color: '#166534', fontSize: 15 }}>
                העדפות <strong>{lastConfirmed.name}</strong> התקבלו — {lastConfirmed.count} משמרות
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setModalStep('input'); setPrefsText(''); setPrefEmployeeId(employees[0]?.id ?? null); setParserError(null); }}
                  style={{ ...btnBase, background: '#1a4a2e', color: 'white' }}
                >
                  הוסף עובדת נוספת
                </button>
                <button
                  onClick={() => setModalStep('summary')}
                  style={{ ...btnBase, background: '#16a34a', color: 'white' }}
                >
                  סיכום והגשה
                </button>
              </div>
            </>
          )}

          {/* Step 3: Summary */}
          {modalStep === 'summary' && (() => {
            const withPrefs = employees.filter(e => {
              const p = preferences[e.id];
              return p && Object.keys(p).length > 0;
            });
            return (
              <>
                <h3 style={{ marginBottom: 14, fontSize: 16, marginTop: 0, fontWeight: 700, color: '#1a4a2e' }}>סיכום העדפות השבוע</h3>
                {withPrefs.length === 0 ? (
                  <p style={{ color: '#64748b', marginBottom: 16 }}>לא הוזנו העדפות השבוע</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
                    <thead>
                      <tr>
                        <th style={{ background: '#1a4a2e', color: 'white', padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>עובדת</th>
                        <th style={{ background: '#1a4a2e', color: 'white', padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>ימים ומשמרות</th>
                        <th style={{ background: '#1a4a2e', color: 'white', padding: '8px 12px', textAlign: 'center', width: 100, fontWeight: 600 }}>פעולות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withPrefs.map((emp, idx) => {
                        const empPrefs = preferences[emp.id] || {};
                        const summary = weekDays
                          .filter(d => (empPrefs[d.day] || []).length > 0)
                          .map(d => `${d.day}: ${formatPrefShifts(empPrefs[d.day] || [])}`)
                          .join(' | ');
                        return (
                          <tr key={emp.id} style={{ background: idx % 2 === 0 ? '#ffffff' : '#faf7f2' }}>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #e8e0d4', fontWeight: 600, color: '#1a4a2e' }}>{emp.name}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #e8e0d4', color: '#475569', fontSize: 12 }}>{summary}</td>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #e8e0d4', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                <button
                                  onClick={() => {
                                    setPrefEmployeeId(emp.id);
                                    setPrefsText(serializePreferences(emp.id));
                                    setParserError(null);
                                    setModalStep('input');
                                  }}
                                  style={{ ...smallBtnBase, background: '#1a4a2e', color: 'white' }}
                                >
                                  ערוך
                                </button>
                                <button
                                  onClick={() => {
                                    if (window.confirm(`למחוק את ההעדפות של ${emp.name}?`)) {
                                      deletePreferencesForEmployee(emp.id);
                                    }
                                  }}
                                  style={{ ...smallBtnBase, background: '#fee2e2', color: '#dc2626' }}
                                >
                                  מחק
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => { setModalStep('input'); setPrefsText(''); setPrefEmployeeId(employees[0]?.id ?? null); setParserError(null); }}
                    style={{ ...btnBase, background: '#f5f0e8', color: '#475569', border: '1px solid #e8e0d4' }}
                  >
                    + הוסף עובדת
                  </button>
                  <button
                    onClick={handleSubmitAll}
                    style={{ ...btnBase, background: '#16a34a', color: 'white' }}
                  >
                    אשר והגש
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Toasts */}
      {statusCopyToast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#16a34a', color: 'white', padding: '12px 28px', borderRadius: 8, zIndex: 9999, fontSize: 15, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', pointerEvents: 'none' }}>
          הועתק!
        </div>
      )}
      {submitToast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#16a34a', color: 'white', padding: '12px 28px', borderRadius: 8, zIndex: 9999, fontSize: 15, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', pointerEvents: 'none' }}>
          ההעדפות נשמרו בהצלחה!
        </div>
      )}
    </div>
  );
}
