## GitHub Copilot Chat

- Extension: 0.40.1 (prod)
- VS Code: 1.112.0 (07ff9d6178ede9a1bd12ad3399074d726ebe6e43)
- OS: win32 10.0.26200 x64
- GitHub Account: AlonFreibach

## Network

User Settings:
```json
  "http.systemCertificatesNode": true,
  "github.copilot.advanced.debug.useElectronFetcher": true,
  "github.copilot.advanced.debug.useNodeFetcher": false,
  "github.copilot.advanced.debug.useNodeFetchFetcher": true
```

Connecting to https://api.github.com:
- DNS ipv4 Lookup: 20.217.135.0 (44 ms)
- DNS ipv6 Lookup: Error (4 ms): getaddrinfo ENOTFOUND api.github.com
- Proxy URL: None (1 ms)
- Electron fetch (configured): timed out after 10 seconds
- Node.js https: timed out after 10 seconds
- Node.js fetch: timed out after 10 seconds

Connecting to https://api.githubcopilot.com/_ping:
- DNS ipv4 Lookup: 140.82.113.21 (7 ms)
- DNS ipv6 Lookup: Error (5 ms): getaddrinfo ENOTFOUND api.githubcopilot.com
- Proxy URL: None (2 ms)
- Electron fetch (configured): timed out after 10 seconds
- Node.js https: timed out after 10 seconds
- Node.js fetch: timed out after 10 seconds

Connecting to https://copilot-proxy.githubusercontent.com/_ping:
- DNS ipv4 Lookup: 20.250.119.64 (47 ms)
- DNS ipv6 Lookup: Error (35 ms): getaddrinfo ENOTFOUND copilot-proxy.githubusercontent.com
- Proxy URL: None (3 ms)
- Electron fetch (configured): timed out after 10 seconds
- Node.js https: timed out after 10 seconds
- Node.js fetch: timed out after 10 seconds

Connecting to https://mobile.events.data.microsoft.com: timed out after 10 seconds
Connecting to https://dc.services.visualstudio.com: timed out after 10 seconds
Connecting to https://copilot-telemetry.githubusercontent.com/_ping: timed out after 10 seconds
Connecting to https://copilot-telemetry.githubusercontent.com/_ping: timed out after 10 seconds
Connecting to https://default.exp-tas.com: timed out after 10 seconds

Number of system certificates: 76

## Documentation

In corporate networks: [Troubleshooting firewall settings for GitHub Copilot](https://docs.github.com/en/copilot/troubleshooting-github-copilot/troubleshooting-firewall-settings-for-github-copilot).import { useState, useEffect } from 'react';

interface Employee {
  id: string;
  name: string;
  weeklyShifts: number;
  friday: boolean;
  shiftType: string;
  availableFromDate?: string;
  availableToDate?: string;
}

interface WeeklyBoardProps {
  employees: Employee[];
}

const WEEK_STRUCTURE = [
  { day: 'ראשון', shifts: ['בוקר', 'ערב'] },
  { day: 'שני',   shifts: ['בוקר', 'ערב'] },
  { day: 'שלישי', shifts: ['בוקר', 'ערב'] },
  { day: 'רביעי', shifts: ['בוקר', 'אמצע', 'ערב'] },
  { day: 'חמישי', shifts: ['בוקר', 'אמצע', 'ערב'] },
  { day: 'שישי',  shifts: ['בוקר'] },
];

const REQUIRED: Record<string, Record<string, number>> = {
  'ראשון':  { 'בוקר': 1, 'ערב': 2 },
  'שני':    { 'בוקר': 1, 'ערב': 2 },
  'שלישי':  { 'בוקר': 1, 'ערב': 2 },
  'רביעי':  { 'בוקר': 2, 'אמצע': 2, 'ערב': 2 },
  'חמישי':  { 'בוקר': 3, 'אמצע': 2, 'ערב': 3 },
  'שישי':   { 'בוקר': 6 },
};

type Schedule = Record<string, string[]>;

function getWeekStart(offset = 0): Date {
  const d = new Date();
  const day = d.getDay();
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - day + offset * 7);
  sunday.setHours(0, 0, 0, 0);
  return sunday;
}

function formatDate(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

function isEmployeeAvailable(emp: Employee, day: string, shift: string): boolean {
  if (day === 'שישי' && !emp.friday) return false;
  if (emp.shiftType !== 'הכל') {
    if (emp.shiftType === 'בוקר' && shift !== 'בוקר') return false;
    if (emp.shiftType === 'ערב' && shift !== 'ערב') return false;
    if (emp.shiftType === 'אמצע' && shift !== 'אמצע') return false;
  }
  return true;
}

export function WeeklyBoard({ employees }: WeeklyBoardProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [schedule, setSchedule] = useState<Schedule>({});
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const weekStart = getWeekStart(weekOffset);
  const weekKey = weekStart.toISOString().split('T')[0];

  useEffect(() => {
    const saved = localStorage.getItem(`schedule_${weekKey}`);
    setSchedule(saved ? JSON.parse(saved) : {});
  }, [weekKey]);

  function saveSchedule(newSchedule: Schedule) {
    setSchedule(newSchedule);
    localStorage.setItem(`schedule_${weekKey}`, JSON.stringify(newSchedule));
  }

  function addEmployee(day: string, shift: string, empId: string) {
    const key = `${day}_${shift}`;
    const current = schedule[key] || [];
    if (current.includes(empId)) return;
    saveSchedule({ ...schedule, [key]: [...current, empId] });
    setOpenDropdown(null);
  }

  function removeEmployee(day: string, shift: string, empId: string) {
    const key = `${day}_${shift}`;
    saveSchedule({ ...schedule, [key]: (schedule[key] || []).filter(id => id !== empId) });
  }

  function getAssigned(day: string, shift: string): Employee[] {
    const key = `${day}_${shift}`;
    return (schedule[key] || []).map(id => employees.find(e => e.id === id)).filter(Boolean) as Employee[];
  }

  function getAvailable(day: string, shift: string): Employee[] {
    const key = `${day}_${shift}`;
    const assignedIds = schedule[key] || [];
    return employees.filter(e =>
      isEmployeeAvailable(e, day, shift) && !assignedIds.includes(e.id)
    );
  }

  const totalRequired = Object.values(REQUIRED).reduce((s, d) =>
    s + Object.values(d).reduce((a, b) => a + b, 0), 0);
  const totalAssigned = Object.values(schedule).reduce((s, arr) => s + arr.length, 0);

  const weekDays = WEEK_STRUCTURE.map((d, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return { ...d, dateStr: formatDate(date) };
  });

  return (
    <div dir="rtl" style={{ padding: '16px', fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button onClick={() => setWeekOffset(w => w - 1)}
          style={{ padding: '4px 12px', cursor: 'pointer' }}>← שבוע קודם</button>
        <div style={{ fontWeight: 500, fontSize: 16 }}>
          לוח שיבוץ שבועי — {formatDate(weekStart)}–{formatDate(new Date(weekStart.getTime() + 5 * 86400000))}.{weekStart.getFullYear()}
        </div>
        <button onClick={() => setWeekOffset(w => w + 1)}
          style={{ padding: '4px 12px', cursor: 'pointer' }}>שבוע הבא →</button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #ddd', padding: '6px 8px', background: '#f5f5f5' }}>משמרת</th>
              {weekDays.map(d => (
                <th key={d.day} style={{ border: '1px solid #ddd', padding: '6px 8px', background: '#f5f5f5', textAlign: 'center' }}>
                  <div>{d.day}</div>
                  <div style={{ fontWeight: 400, fontSize: 12 }}>{d.dateStr}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {['בוקר', 'אמצע', 'ערב'].map(shift => (
              <tr key={shift}>
                <td style={{ border: '1px solid #ddd', padding: '6px 8px', fontWeight: 500, background: '#f9f9f9' }}>{shift}</td>
                {weekDays.map(d => {
                  const required = REQUIRED[d.day]?.[shift];
                  if (!required) return (
                    <td key={d.day} style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center', color: '#bbb' }}>—</td>
                  );
                  const assigned = getAssigned(d.day, shift);
                  const available = getAvailable(d.day, shift);
                  const dropKey = `${d.day}_${shift}`;
                  const isFull = assigned.length >= required;
                  const bg = isFull ? '#d4edda' : assigned.length > 0 ? '#fff3cd' : '#fde8e8';

                  return (
                    <td key={d.day} style={{ border: '1px solid #ddd', padding: '6px', background: bg, position: 'relative', minWidth: 80 }}>
                      <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>
                        {assigned.length}/{required}
                      </div>
                      {assigned.map(emp => (
                        <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 2, fontSize: 12 }}>
                          <span>{emp.name}</span>
                          <button onClick={() => removeEmployee(d.day, shift, emp.id)}
                            style={{ background: 'none', border: 'none', color: '#e55', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                        </div>
                      ))}
                      {!isFull && (
                        <div style={{ position: 'relative' }}>
                          <button
                            onClick={() => setOpenDropdown(openDropdown === dropKey ? null : dropKey)}
                            style={{ fontSize: 16, background: 'none', border: '1px solid #aaa', borderRadius: 4, cursor: 'pointer', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                            +
                          </button>
                          {openDropdown === dropKey && (
                            <div style={{ position: 'absolute', top: 24, right: 0, background: 'white', border: '1px solid #ccc', borderRadius: 6, zIndex: 100, minWidth: 120, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                              {available.length === 0 ? (
                                <div style={{ padding: '8px 12px', color: '#888', fontSize: 12 }}>אין עובדות זמינות</div>
                              ) : available.map(emp => (
                                <div key={emp.id}
                                  onClick={() => addEmployee(d.day, shift, emp.id)}
                                  style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f0f0f0' }}
                                  onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                                  {emp.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, padding: '8px 12px', background: '#f5f5f5', borderRadius: 8, fontSize: 13 }}>
        סטטוס: {totalAssigned}/{totalRequired} משמרות מלאות
        {totalAssigned === totalRequired && ' ✅'}
      </div>
    </div>
  );
}
