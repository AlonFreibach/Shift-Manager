import { useState } from 'react';
import { calculateFairnessScore, calculateFlexibilityScore, calculateStabilityScore } from '../utils/fairnessScore';
import { withAccumulatedHistory, resetAccumulatedData } from '../utils/fairnessAccumulator';
import type { Employee } from '../data/employees';

interface FairnessTabProps {
  employees: Employee[];
}

export function FairnessTab({ employees }: FairnessTabProps) {
  const [, forceUpdate] = useState(0);

  const rows = employees.filter(e => !e.isTrainee).map(emp => {
    const enriched = withAccumulatedHistory(emp);
    const fairness = calculateFairnessScore(enriched);
    const flexibility = calculateFlexibilityScore(enriched);
    const stability = calculateStabilityScore(enriched);
    const composite = (stability * 0.5) + (flexibility * 0.4) + (fairness * 0.1);
    return { emp, fairness, flexibility, stability, composite };
  });

  // Sort by composite score descending
  rows.sort((a, b) => b.composite - a.composite);

  function handleReset() {
    if (window.confirm('האם לאפס את כל היסטוריית הצדק? פעולה זו אינה ניתנת לביטול.')) {
      resetAccumulatedData();
      forceUpdate(n => n + 1);
    }
  }

  return (
    <div style={{ background: 'white', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: 24, border: '1px solid #e8e0d4' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1a4a2e' }}>טבלת צדק</h2>
        <button
          onClick={handleReset}
          style={{
            padding: '8px 16px',
            fontSize: 13,
            background: '#fee2e2',
            color: '#dc2626',
            border: '1px solid #fca5a5',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          אפס היסטוריה
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ background: '#1a4a2e', color: 'white', padding: '10px 16px', textAlign: 'right', fontWeight: 600 }}>שם</th>
              <th style={{ background: '#1a4a2e', color: 'white', padding: '10px 16px', textAlign: 'center', fontWeight: 600 }}>ציון צדק</th>
              <th style={{ background: '#1a4a2e', color: 'white', padding: '10px 16px', textAlign: 'center', fontWeight: 600 }}>ציון גמישות</th>
              <th style={{ background: '#1a4a2e', color: 'white', padding: '10px 16px', textAlign: 'center', fontWeight: 600 }}>ציון קביעות</th>
              <th style={{ background: '#1a4a2e', color: 'white', padding: '10px 16px', textAlign: 'center', fontWeight: 600 }}>ציון משוכלל</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ emp, fairness, flexibility, stability, composite }, idx) => (
              <tr key={emp.id} style={{ background: idx % 2 === 0 ? '#ffffff' : '#faf7f2' }}>
                <td style={{ padding: '10px 16px', borderBottom: '1px solid #e8e0d4', fontWeight: 600, color: '#1a4a2e' }}>{emp.name}</td>
                <td style={{ padding: '10px 16px', borderBottom: '1px solid #e8e0d4', textAlign: 'center', color: '#475569' }}>{fairness.toFixed(1)}</td>
                <td style={{ padding: '10px 16px', borderBottom: '1px solid #e8e0d4', textAlign: 'center', color: '#475569' }}>{flexibility}</td>
                <td style={{ padding: '10px 16px', borderBottom: '1px solid #e8e0d4', textAlign: 'center', color: '#475569' }}>{stability}</td>
                <td style={{ padding: '10px 16px', borderBottom: '1px solid #e8e0d4', textAlign: 'center', fontWeight: 700, background: '#f0fdf4', color: '#1a4a2e' }}>{composite.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
