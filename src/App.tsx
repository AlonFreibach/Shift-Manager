import { useState, useMemo } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { useSupabaseEmployees } from './hooks/useSupabaseEmployees'
import { supabase } from './lib/supabaseClient'
import { WeeklyBoard } from './components/WeeklyBoard'
import { EmployeesTab } from './components/EmployeesTab'
import { FairnessTab } from './components/FairnessTab'
import { AuthScreen } from './components/AuthScreen'
import { EmployeeDashboard } from './components/EmployeeDashboard'
import { PreferencesView } from './components/PreferencesView'
import { ForecastTab } from './components/ForecastTab'
import { JoinPage } from './pages/JoinPage'
import './App.css'

type TabId = 'board' | 'employees' | 'preferences' | 'fairness' | 'forecast';

const BETA_TABS = new Set(['forecast'])

const TABS: { id: TabId; label: string }[] = [
  { id: 'board', label: 'לוח שיבוץ' },
  { id: 'employees', label: 'עובדות/ים' },
  { id: 'preferences', label: 'העדפות שהוגשו' },
  { id: 'fairness', label: 'טבלת צדק' },
  { id: 'forecast', label: 'תחזית כ"א' },
];

function AppContent() {
  const { session, role, employeeData, signOut, loading: authLoading } = useAuth()
  const { employees, loading: empLoading, refresh: refreshEmployees } = useSupabaseEmployees()
  const [currentTab, setCurrentTab] = useState<TabId>('board')
  const [autoScheduleRequest, setAutoScheduleRequest] = useState<string | null>(null)
  const [expiryBannerDismissed, setExpiryBannerDismissed] = useState(false)

  const activeEmployees = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return employees.filter(emp => {
      if (!emp.availableToDate) return true;
      return new Date(emp.availableToDate + 'T23:59:59') >= now;
    });
  }, [employees])

  const expiringEmployees = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const inOneMonth = new Date(now);
    inOneMonth.setDate(inOneMonth.getDate() + 30);
    return employees
      .filter(emp => {
        if (!emp.availableToDate) return false;
        const endDate = new Date(emp.availableToDate + 'T00:00:00');
        return endDate >= now && endDate <= inOneMonth;
      })
      .map(emp => {
        const endDate = new Date(emp.availableToDate + 'T00:00:00');
        const diffDays = Math.ceil((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        return { name: emp.name, daysLeft: diffDays };
      });
  }, [employees])

  const loading = authLoading || empLoading

  function handleAutoSchedule(targetWeekKey: string) {
    setAutoScheduleRequest(targetWeekKey)
    setCurrentTab('board')
  }

  const forceSignOut = () => {
    localStorage.removeItem('guest_employee')
    supabase.auth.signOut()
  }

  // Always-visible sign out button (top-right corner)
  const floatingSignOutBtn = (
    <button
      onClick={forceSignOut}
      style={{
        position: 'fixed', top: 10, left: 10, zIndex: 9999,
        padding: '5px 12px', fontSize: 11, fontWeight: 600,
        background: 'rgba(0,0,0,0.5)', color: 'white',
        border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6,
        cursor: 'pointer', opacity: 0.7,
      }}
    >
      התנתק
    </button>
  )

  // Loading spinner
  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center" style={{ background: '#faf7f2' }}>
        {floatingSignOutBtn}
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

  // Not logged in (and no guest session)
  if (!session && !role) {
    return <AuthScreen />
  }

  // Employee view (both auth and guest)
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
          <div className="header-brand" style={{ fontWeight: 700, fontSize: 18, color: '#ffffff', marginLeft: 32, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/logo.png" style={{ height: 32, objectFit: 'contain' }} alt="לוגו נוי השדה" />
            נוי השדה — סניף שוהם
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
                {BETA_TABS.has(tab.id) && (
                  <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: '#c17f3b', color: 'white', marginRight: 4, verticalAlign: 'super' }}>BETA</span>
                )}
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

      {/* Expiration warning banner */}
      {!expiryBannerDismissed && expiringEmployees.length > 0 && (
        <div style={{
          background: '#FEF3E2', border: '1px solid #F5D5A0', borderRadius: 0,
          padding: '10px 24px', display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            {expiringEmployees.map((emp, i) => (
              <div key={i} style={{ fontSize: 14, fontWeight: 600, color: '#92400e', lineHeight: 1.6 }}>
                תוקף העבודה של {emp.name} פג בעוד {emp.daysLeft} ימים
              </div>
            ))}
          </div>
          <button
            onClick={() => setExpiryBannerDismissed(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#92400e', padding: '0 4px', lineHeight: 1, flexShrink: 0 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Tab Content */}
      <main style={{ width: '100%', padding: '16px 24px' }}>
        {currentTab === 'board' && (
          <WeeklyBoard
            employees={activeEmployees}
            refreshEmployees={refreshEmployees}
            autoScheduleRequest={autoScheduleRequest}
            onAutoScheduleHandled={() => setAutoScheduleRequest(null)}
            onNavigateToPreferences={() => setCurrentTab('preferences')}
          />
        )}
        {currentTab === 'employees' && (
          <EmployeesTab employees={employees} onRefresh={refreshEmployees} />
        )}
        {currentTab === 'preferences' && (
          <PreferencesView onAutoSchedule={handleAutoSchedule} />
        )}
        {currentTab === 'fairness' && (
          <FairnessTab employees={activeEmployees} />
        )}
        {currentTab === 'forecast' && (
          <ForecastTab employees={employees} onRefresh={refreshEmployees} />
        )}
      </main>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/join/:token" element={<JoinPage />} />
      <Route path="*" element={<AppContent />} />
    </Routes>
  )
}

export default App
