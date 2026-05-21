import { useState } from 'react';
import { calculateFairnessScore, calculateFlexibilityScore, calculateStabilityScore } from '../utils/fairnessScore';
import {
  withAccumulatedHistory,
  resetAccumulatedData,
  snapshotAccumulatedStorage,
  restoreAccumulatedStorage,
} from '../utils/fairnessAccumulator';
import { useUndoStack } from '../hooks/useUndoStack';
import { UndoButton } from './UndoButton';
import { UsageGuide } from './UsageGuide';
import type { Employee } from '../data/employees';

interface FairnessTabProps {
  employees: Employee[];
}

function flexDisplayInfo(score: number | null): { text: string; color: string } {
  if (score === null) return { text: '—', color: '#475569' };
  if (score < 100) return { text: `⚠️ ${score}`, color: '#A32D2D' };
  if (score < 150) return { text: `${score}`, color: '#475569' };
  if (score < 200) return { text: `✦ ${score}`, color: '#3B6D11' };
  return { text: `★ ${score}`, color: '#D4A017' };
}

export function FairnessTab({ employees }: FairnessTabProps) {
  const [, forceUpdate] = useState(0);

  const undo = useUndoStack<Record<string, string>>({
    onRestore: (snap) => {
      restoreAccumulatedStorage(snap);
      forceUpdate(n => n + 1);
    },
  });

  const rows = employees.filter(e => !e.isTrainee).map(emp => {
    const enriched = withAccumulatedHistory(emp);
    const fairness = calculateFairnessScore(enriched);
    const flexibility = calculateFlexibilityScore(enriched);
    const stability = calculateStabilityScore(enriched);
    const flexVal = flexibility ?? 0;
    const composite = ((flexVal / 100) * 0.5) + ((stability / 10) * 0.4) + (fairness * 0.1);
    const hasFairnessHistory = enriched.fairnessHistory.length > 0;
    const hasAnyHistory = hasFairnessHistory || flexibility !== null;
    return { emp, fairness, flexibility, stability, composite, hasFairnessHistory, hasAnyHistory };
  });

  // Sort by composite score descending
  rows.sort((a, b) => b.composite - a.composite);

  function handleReset() {
    if (window.confirm('האם לאפס את כל היסטוריית הצדק? ניתן לשחזר עם כפתור "בטל".')) {
      undo.push(snapshotAccumulatedStorage());
      resetAccumulatedData();
      forceUpdate(n => n + 1);
    }
  }

  return (
    <div dir="rtl">
    <UsageGuide storageKey="fairness">
      <p style={{ margin: '0 0 8px' }}>
        הטבלה מציגה שלושה מדדים לכל עובדת, ומדרגת אותן לפי ציון משוכלל.
      </p>
      <ul style={{ margin: 0, paddingInlineStart: 20 }}>
        <li><strong>ציון צדק</strong> — כמה משמרות העובדת קיבלה לאחרונה (נמוך = קופחה).</li>
        <li><strong>ציון גמישות</strong> — כמה היא מגישה ביחס למה שהיא עובדת בפועל.</li>
        <li><strong>ציון קביעות</strong> — עד כמה ההגשות שלה יציבות לאורך זמן.</li>
        <li><strong>ציון משוכלל</strong> — שקלול השלושה (גמישות 50%, קביעות 40%, צדק 10%).</li>
        <li><strong>אפס היסטוריה</strong> מאפס את הנתונים הנצברים — וניתן לביטול עם <strong>↩ בטל</strong>.</li>
      </ul>
    </UsageGuide>
    <div style={{ background: 'white', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: 24, border: '1px solid #e8e0d4' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1a4a2e' }}>טבלת צדק</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <UndoButton onUndo={undo.undo} canUndo={undo.canUndo} />
          <button
            onClick={handleReset}
            aria-label="אפס היסטוריית צדק"
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
            {rows.map(({ emp, fairness, flexibility, stability, composite, hasFairnessHistory, hasAnyHistory }, idx) => {
              const flexInfo = flexDisplayInfo(flexibility);
              return (
                <tr key={emp.id} style={{ background: idx % 2 === 0 ? '#ffffff' : '#faf7f2' }}>
                  <td style={{ padding: '10px 16px', borderBottom: '1px solid #e8e0d4', fontWeight: 600, color: '#1a4a2e' }}>{emp.name}</td>
                  <td style={{ padding: '10px 16px', borderBottom: '1px solid #e8e0d4', textAlign: 'center', color: '#475569' }}>{fairness === 0 && !hasFairnessHistory ? '—' : fairness.toFixed(1)}</td>
                  <td style={{ padding: '10px 16px', borderBottom: '1px solid #e8e0d4', textAlign: 'center', color: flexInfo.color, fontWeight: flexibility !== null && flexibility >= 150 ? 700 : 400 }}>{flexInfo.text}</td>
                  <td style={{ padding: '10px 16px', borderBottom: '1px solid #e8e0d4', textAlign: 'center', color: stability >= 8 ? '#1a4a2e' : stability >= 5 ? '#b45309' : '#dc2626', fontWeight: stability >= 8 ? 700 : 400 }}>{stability}</td>
                  <td style={{ padding: '10px 16px', borderBottom: '1px solid #e8e0d4', textAlign: 'center', fontWeight: 700, background: '#f0fdf4', color: '#1a4a2e' }}>{!hasAnyHistory ? '—' : composite.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  );
}
