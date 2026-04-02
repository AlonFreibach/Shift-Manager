import { useState, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js';
import type { Employee } from '../data/employees';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const MIYA_NAME = 'מיה';

interface WorkforceTabProps {
  employees: Employee[];
}

// Standard weekly slots from WEEK_STRUCTURE + SLOT_DEFAULTS (including Miya slot per morning)
// Sun-Thu: morning(2+Miya=3)+evening(2)=5 each = 25; Wed: +1 evening = 26; Thu: +1 morning +1 evening = 28; Fri: 5+Miya=6
function getStandardSlots(): number {
  // Sun: 2+1M bkr + 2 eve = 5
  // Mon: 2+1M bkr + 2 eve = 5
  // Tue: 2+1M bkr + 2 eve = 5
  // Wed: 2+1M bkr + 3 eve = 6
  // Thu: 3+1M bkr + 3 eve = 7
  // Fri: 5+1M bkr = 6
  // Total: 5+5+5+6+7+6 = 34
  return 34;
}

function isActiveOn(emp: Employee, date: Date): boolean {
  if (emp.name === MIYA_NAME) return false; // Miya counted separately
  if (emp.isTrainee) return false;
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (emp.availableFromDate && iso < emp.availableFromDate) return false;
  if (emp.availableToDate && iso > emp.availableToDate) return false;
  return true;
}

function isOnVacation(emp: Employee, date: Date): boolean {
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return (emp.vacationPeriods || []).some(v => iso >= v.from && iso <= v.to);
}

function getCapacityAt(employees: Employee[], date: Date): number {
  return employees
    .filter(e => isActiveOn(e, date) && !isOnVacation(e, date))
    .reduce((sum, e) => sum + e.shiftsPerWeek, 0);
}

function formatDate(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function WorkforceTab({ employees }: WorkforceTabProps) {
  const [simSlider, setSimSlider] = useState(3);

  const standardSlots = getStandardSlots();
  const target = Math.ceil(standardSlots * 1.3);
  const now = new Date();

  const activeEmps = useMemo(() => employees.filter(e => isActiveOn(e, now)), [employees]);
  const currentCapacity = useMemo(() => activeEmps.reduce((s, e) => s + e.shiftsPerWeek, 0), [activeEmps]);
  const currentPct = Math.round((currentCapacity / standardSlots) * 100);

  const pctColor = currentPct >= 130 ? '#16a34a' : currentPct >= 100 ? '#c17f3b' : '#dc2626';
  const pctBg = currentPct >= 130 ? '#dcfce7' : currentPct >= 100 ? '#FEF3E2' : '#fee2e2';

  // ── Alerts ──
  const alerts = useMemo(() => {
    const result: { type: 'red' | 'orange'; text: string }[] = [];
    const today = new Date();

    for (const emp of employees) {
      if (emp.name === MIYA_NAME || emp.isTrainee) continue;
      // Ending within 30 days
      if (emp.availableToDate) {
        const endDate = new Date(emp.availableToDate + 'T00:00:00');
        const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / 86400000);
        if (daysLeft > 0 && daysLeft <= 30) {
          const newCap = currentCapacity - emp.shiftsPerWeek;
          const newPct = Math.round((newCap / standardSlots) * 100);
          result.push({ type: 'red', text: `בעוד ${daysLeft} ימים ${emp.name} מסיימת — תרדי ל-${newPct}%` });
        }
      }
      // Vacation planned
      for (const v of emp.vacationPeriods || []) {
        const from = new Date(v.from + 'T00:00:00');
        const to = new Date(v.to + 'T00:00:00');
        if (from > today && from.getTime() - today.getTime() < 60 * 86400000) {
          const capDuring = currentCapacity - emp.shiftsPerWeek;
          const pctDuring = Math.round((capDuring / standardSlots) * 100);
          result.push({ type: 'orange', text: `בתקופת החופש של ${emp.name} (${formatDate(from)}–${formatDate(to)}) תרדי ל-${pctDuring}%` });
        }
      }
      // Starting in future
      if (emp.availableFromDate) {
        const startDate = new Date(emp.availableFromDate + 'T00:00:00');
        if (startDate > today) {
          result.push({ type: 'orange', text: `עד ${formatDate(startDate)} — ${emp.name} (${emp.shiftsPerWeek} משמרות) עדיין לא התחילה` });
        }
      }
    }
    return result;
  }, [employees, currentCapacity, standardSlots]);

  // ── 6-month forecast ──
  const forecast = useMemo(() => {
    const months: { label: string; pct: number; date: Date }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 15);
      const cap = getCapacityAt(employees, d);
      months.push({ label: `${d.getMonth() + 1}/${d.getFullYear()}`, pct: Math.round((cap / standardSlots) * 100), date: d });
    }
    return months;
  }, [employees, standardSlots]);

  const chartData = {
    labels: forecast.map(m => m.label),
    datasets: [
      {
        label: 'יכולת צפויה (%)',
        data: forecast.map(m => m.pct),
        borderColor: '#16a34a',
        backgroundColor: forecast.map(m => m.pct < 130 ? '#dc2626' : '#16a34a'),
        pointRadius: 6,
        pointBackgroundColor: forecast.map(m => m.pct < 130 ? '#dc2626' : '#16a34a'),
        tension: 0.3,
      },
      {
        label: 'יעד 130%',
        data: forecast.map(() => 130),
        borderColor: '#c17f3b',
        borderDash: [8, 4],
        pointRadius: 0,
        tension: 0,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: { legend: { display: true, position: 'bottom' as const } },
    scales: { y: { min: 0, max: 200, ticks: { callback: (v: any) => `${v}%` } } },
  };

  // ── Future capacity (after upcoming departures within 60 days) ──
  const futureAnalysis = useMemo(() => {
    const today = new Date();
    const leaving = employees.filter(e => {
      if (e.name === MIYA_NAME || e.isTrainee) return false;
      if (!e.availableToDate) return false;
      const endDate = new Date(e.availableToDate + 'T00:00:00');
      const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / 86400000);
      return daysLeft > 0 && daysLeft <= 60 && isActiveOn(e, today);
    });
    const leavingShifts = leaving.reduce((s, e) => s + e.shiftsPerWeek, 0);
    const futureCapacity = currentCapacity - leavingShifts;
    const futurePct = Math.round((futureCapacity / standardSlots) * 100);
    const leavingNames = leaving.map(e => e.name);
    return { futureCapacity, futurePct, leavingNames, leavingShifts };
  }, [employees, currentCapacity, standardSlots]);

  // ── Ideal profile (based on future capacity) ──
  const profile = useMemo(() => {
    const effectiveCapacity = futureAnalysis.futureCapacity;
    const gap = target - effectiveCapacity;
    const morningOnly = activeEmps.filter(e => e.shiftType === 'בוקר').length;
    const eveningOnly = activeEmps.filter(e => e.shiftType === 'ערב').length;
    const shiftType = morningOnly < eveningOnly ? 'בוקר' : eveningOnly < morningOnly ? 'ערב' : 'הכל';
    const fridayCount = activeEmps.filter(e => e.fridayAvailability !== 'never').length;
    const needsFriday = fridayCount < 4;
    return { shiftsNeeded: Math.max(0, gap), shiftType, needsFriday, needsHiring: gap > 0 };
  }, [target, futureAnalysis, activeEmps]);

  // ── Simulator ──
  const simCapacity = currentCapacity + simSlider;
  const simPct = Math.round((simCapacity / standardSlots) * 100);
  const simPctColor = simPct >= 130 ? '#16a34a' : simPct >= 100 ? '#c17f3b' : '#dc2626';

  const cardStyle: React.CSSProperties = {
    flex: '1 1 0', minWidth: 140, background: 'white', borderRadius: 10,
    padding: 16, textAlign: 'center', border: '1px solid #e8e0d4',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* ═══ 1. Metric Cards ═══ */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ ...cardStyle, border: `2px solid ${pctColor}`, background: pctBg }}>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 4 }}>יכולת נוכחית</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: pctColor }}>{currentPct}%</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 4 }}>סלוטים סטנדרטיים</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#1a4a2e' }}>{standardSlots}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 4 }}>יכולת נדרשת (130%)</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#c17f3b' }}>{target}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 4 }}>יכולת בפועל</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#1a4a2e' }}>{currentCapacity}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{activeEmps.length} עובדות פעילות</div>
        </div>
      </div>

      {/* ═══ 2. Alerts ═══ */}
      {alerts.length > 0 && (
        <div style={{ background: 'white', borderRadius: 10, padding: 16, marginBottom: 20, border: '1px solid #e8e0d4' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#1a4a2e' }}>התראות</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alerts.map((a, i) => (
              <div key={i} style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                background: a.type === 'red' ? '#fee2e2' : '#FEF3E2',
                color: a.type === 'red' ? '#dc2626' : '#92400E',
                borderRight: `4px solid ${a.type === 'red' ? '#dc2626' : '#c17f3b'}`,
              }}>
                {a.type === 'red' ? '🔴' : '🟡'} {a.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ 3. Forecast Chart ═══ */}
      <div style={{ background: 'white', borderRadius: 10, padding: 16, marginBottom: 20, border: '1px solid #e8e0d4' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#1a4a2e' }}>תחזית 6 חודשים</h3>
        <Line data={chartData} options={chartOptions} />
      </div>

      {/* ═══ 4. Ideal Profile ═══ */}
      <div style={{ background: 'white', borderRadius: 10, padding: 16, marginBottom: 20, border: '1px solid #e8e0d4' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#1a4a2e' }}>פרופיל עובדת מבוקשת</h3>

        {/* Future capacity line */}
        <div style={{
          padding: '8px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 500,
          background: futureAnalysis.futurePct >= 130 ? '#dcfce7' : futureAnalysis.futurePct >= 100 ? '#FEF3E2' : '#fee2e2',
          color: futureAnalysis.futurePct >= 130 ? '#166534' : futureAnalysis.futurePct >= 100 ? '#92400E' : '#dc2626',
          borderRight: `4px solid ${futureAnalysis.futurePct >= 130 ? '#16a34a' : futureAnalysis.futurePct >= 100 ? '#c17f3b' : '#dc2626'}`,
        }}>
          יכולת עתידית (אחרי עזיבות צפויות): <strong>{futureAnalysis.futurePct}%</strong>
          {futureAnalysis.leavingNames.length > 0 && (
            <span style={{ opacity: 0.8 }}> — {futureAnalysis.leavingNames.join(', ')} ({futureAnalysis.leavingShifts} משמרות)</span>
          )}
        </div>

        {/* Recommendation */}
        {(() => {
          const fp = futureAnalysis.futurePct;
          if (fp < 100) return (
            <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 14, fontWeight: 700, background: '#fee2e2', color: '#dc2626', borderRight: '4px solid #dc2626' }}>
              🔴 נדרש גיוס — צפי ירידה מתחת לקיבולת אחרי עזיבת {futureAnalysis.leavingNames.join(', ')}
            </div>
          );
          if (fp < 130) return (
            <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 14, fontWeight: 700, background: '#FEF3E2', color: '#92400E', borderRight: '4px solid #c17f3b' }}>
              🟡 מומלץ לגייס — היכולת תרד ל-{fp}% אחרי עזיבת {futureAnalysis.leavingNames.length > 0 ? futureAnalysis.leavingNames.join(', ') : 'עובדות צפויות'}
            </div>
          );
          return (
            <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 14, fontWeight: 700, background: '#dcfce7', color: '#166534', borderRight: '4px solid #16a34a' }}>
              ✓ אין צורך בגיוס — גם אחרי עזיבות צפויות היכולת תישאר {fp}%
            </div>
          );
        })()}

        {profile.needsHiring && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 16px', fontSize: 13 }}>
              <div style={{ fontWeight: 600, color: '#1a4a2e' }}>משמרות נדרשות</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>{profile.shiftsNeeded}/שבוע</div>
            </div>
            <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 16px', fontSize: 13 }}>
              <div style={{ fontWeight: 600, color: '#1a4a2e' }}>סוג משמרת</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>{profile.shiftType}</div>
            </div>
            <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 16px', fontSize: 13 }}>
              <div style={{ fontWeight: 600, color: '#1a4a2e' }}>זמינות שישי</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: profile.needsFriday ? '#dc2626' : '#16a34a' }}>
                {profile.needsFriday ? 'נדרש' : 'לא חובה'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ 5. Recruitment Simulator ═══ */}
      <div style={{ background: 'white', borderRadius: 10, padding: 16, border: '1px solid #e8e0d4' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#1a4a2e' }}>סימולטור גיוס</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#475569', display: 'block', marginBottom: 6 }}>
              משמרות בשבוע לעובדת חדשה: <strong>{simSlider}</strong>
            </label>
            <input
              type="range" min={1} max={6} value={simSlider}
              onChange={e => setSimSlider(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#1a4a2e' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ textAlign: 'center', padding: '8px 16px', background: '#f8f7f4', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>משמרות נוספות</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1a4a2e' }}>+{simSlider}</div>
            </div>
            <div style={{ textAlign: 'center', padding: '8px 16px', background: '#f8f7f4', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>יכולת חדשה</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1a4a2e' }}>{simCapacity}</div>
            </div>
            <div style={{ textAlign: 'center', padding: '8px 16px', background: simPct >= 130 ? '#dcfce7' : simPct >= 100 ? '#FEF3E2' : '#fee2e2', borderRadius: 8, border: `2px solid ${simPctColor}` }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>אחוז חדש</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: simPctColor }}>{simPct}%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
