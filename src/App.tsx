import { useState } from 'react'
import { useLocalStorage } from './hooks/useLocalStorage'
import { employees, type Employee } from './data/employees'
import { WeeklyBoard } from './components/WeeklyBoard'
import { EmployeesTab } from './components/EmployeesTab'
import { PreferencesTab } from './components/PreferencesTab'
import { FairnessTab } from './components/FairnessTab'
import './App.css'

type TabId = 'board' | 'employees' | 'preferences' | 'fairness';

const TABS: { id: TabId; label: string }[] = [
  { id: 'board', label: 'לוח שיבוץ' },
  { id: 'employees', label: 'עובדות' },
  { id: 'preferences', label: 'העדפות' },
  { id: 'fairness', label: 'טבלת צדק' },
];

function App() {
  const [savedEmployees, setSavedEmployees] = useLocalStorage<Employee[]>('employees', employees)
  const [currentTab, setCurrentTab] = useState<TabId>('board')
  const [autoScheduleRequest, setAutoScheduleRequest] = useState<string | null>(null)

  function handleAutoScheduleFromPreferences(targetWeekKey: string) {
    setAutoScheduleRequest(targetWeekKey)
    setCurrentTab('board')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#faf7f2' }} dir="rtl">
      {/* Navigation Header */}
      <header style={{
        background: '#1a4a2e',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div className="header-inner" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px', display: 'flex', alignItems: 'center', height: 56 }}>
          <div className="header-brand" style={{ fontWeight: 700, fontSize: 18, color: '#ffffff', marginLeft: 32, whiteSpace: 'nowrap' }}>
            נוי השדה — שוהם
          </div>
          <nav className="header-nav" style={{ display: 'flex', gap: 2, height: '100%' }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id)}
                style={{
                  padding: '0 18px',
                  fontSize: 14,
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 0,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  background: 'transparent',
                  color: currentTab === tab.id ? '#ffffff' : 'rgba(255,255,255,0.7)',
                  borderBottom: currentTab === tab.id ? '2px solid #c17f3b' : '2px solid transparent',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                }}
                onMouseEnter={e => {
                  if (currentTab !== tab.id) (e.currentTarget as HTMLButtonElement).style.color = '#ffffff';
                }}
                onMouseLeave={e => {
                  if (currentTab !== tab.id) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.7)';
                }}
              >
                {tab.label}
              </button>
            ))}
            {/* Disabled future tab */}
            <button
              disabled
              title="יעלה בגירסא הבאה"
              style={{
                padding: '0 18px',
                fontSize: 14,
                fontWeight: 600,
                border: 'none',
                borderRadius: 0,
                cursor: 'not-allowed',
                background: 'transparent',
                color: 'rgba(255,255,255,0.35)',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                borderBottom: '2px solid transparent',
              }}
            >
              <span style={{ fontSize: 11 }}>🔒</span> כניסת עובדות
            </button>
          </nav>
        </div>
      </header>

      {/* Tab Content */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
        {currentTab === 'board' && (
          <WeeklyBoard
            employees={savedEmployees}
            onUpdateEmployees={setSavedEmployees}
            autoScheduleRequest={autoScheduleRequest}
            onAutoScheduleHandled={() => setAutoScheduleRequest(null)}
            onNavigateToPreferences={() => setCurrentTab('preferences')}
          />
        )}
        {currentTab === 'employees' && (
          <EmployeesTab employees={savedEmployees} onUpdate={setSavedEmployees} />
        )}
        {currentTab === 'preferences' && (
          <PreferencesTab employees={savedEmployees} onAutoSchedule={handleAutoScheduleFromPreferences} />
        )}
        {currentTab === 'fairness' && (
          <FairnessTab employees={savedEmployees} />
        )}
      </main>
    </div>
  )
}

export default App
