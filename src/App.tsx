import { useState } from 'react'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useAuth } from './hooks/useAuth'
import { employees, type Employee } from './data/employees'
import { WeeklyBoard } from './components/WeeklyBoard'
import { EmployeesTab } from './components/EmployeesTab'
import { FairnessTab } from './components/FairnessTab'
import { AuthScreen } from './components/AuthScreen'
import { EmployeeDashboard } from './components/EmployeeDashboard'
import { PreferencesView } from './components/PreferencesView'
import './App.css'

type TabId = 'board' | 'employees' | 'preferences' | 'fairness';

const TABS: { id: TabId; label: string }[] = [
  { id: 'board', label: 'לוח שיבוץ' },
  { id: 'employees', label: 'עובדות' },
  { id: 'preferences', label: 'העדפות שהוגשו' },
  { id: 'fairness', label: 'טבלת צדק' },
];

function App() {
  const { session, role, employeeData, signOut, loading } = useAuth()
  const [savedEmployees, setSavedEmployees] = useLocalStorage<Employee[]>('employees', employees)
  const [currentTab, setCurrentTab] = useState<TabId>('board')
  const [autoScheduleRequest, setAutoScheduleRequest] = useState<string | null>(null)

  function handleAutoSchedule(targetWeekKey: string) {
    setAutoScheduleRequest(targetWeekKey)
    setCurrentTab('board')
  }

  // Loading spinner
  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center" style={{ background: '#faf7f2' }}>
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-10 h-10 border-4 rounded-full animate-spin"
            style={{ borderColor: '#e8e0d4', borderTopColor: '#1a4a2e' }}
          />
          <span className="text-sm font-medium" style={{ color: '#8b8b8b' }}>טוען...</span>
        </div>
      </div>
    )
  }

  // Not logged in
  if (!session) {
    return <AuthScreen />
  }

  // Employee view
  if (role === 'employee') {
    if (!employeeData) {
      return (
        <div dir="rtl" className="min-h-screen flex items-center justify-center" style={{ background: '#EBF3D8' }}>
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: '#C8DBA0', borderTopColor: '#2D5016' }} />
            <span className="text-sm font-medium" style={{ color: '#5A8A1F' }}>טוען...</span>
          </div>
        </div>
      )
    }
    return <EmployeeDashboard employee={employeeData} signOut={signOut} />
  }

  // Admin view
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
        <div className="header-inner" style={{ width: '100%', padding: '0 24px', display: 'flex', alignItems: 'center', height: 56 }}>
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
          </nav>
          {/* Sign out button */}
          <button
            onClick={signOut}
            style={{
              marginRight: 'auto',
              padding: '6px 16px',
              fontSize: 13,
              fontWeight: 600,
              background: 'rgba(255,255,255,0.15)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            התנתק
          </button>
        </div>
      </header>

      {/* Tab Content */}
      <main style={{ width: '100%', padding: '16px 24px' }}>
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
          <PreferencesView onAutoSchedule={handleAutoSchedule} />
        )}
        {currentTab === 'fairness' && (
          <FairnessTab employees={savedEmployees} />
        )}
      </main>
    </div>
  )
}

export default App
