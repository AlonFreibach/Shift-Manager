import { useState } from 'react';
import type { Employee, FixedShift } from '../data/employees';
import { CreateUserModal } from './CreateUserModal';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { supabase } from '../lib/supabaseClient';
import type { SupabaseEmployee } from '../lib/supabaseClient';

interface EmployeesTabProps {
  employees: Employee[];
  onRefresh: () => void;
}

const MIYA_NAME = 'מיה';

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

// ── Add Modal Form State ──
interface AddFormData {
  name: string;
  phone: string;
  email: string;
  birthday: string;
  seniority: number;
  shiftsPerWeek: number;
  shiftType: 'all' | 'morning' | 'evening';
  friday: 'yes' | 'biweekly' | 'no';
  activeFrom: string;
  activeUntil: string;
}

const INITIAL_FORM: AddFormData = {
  name: '',
  phone: '',
  email: '',
  birthday: '',
  seniority: 0,
  shiftsPerWeek: 3,
  shiftType: 'all',
  friday: 'no',
  activeFrom: '',
  activeUntil: '',
};

export function EmployeesTab({ employees, onRefresh }: EmployeesTabProps) {
  const [subTab, setSubTab] = useState<'active' | 'former'>('active');

  // Modal state — 3-step wizard
  const [showModal, setShowModal] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [formData, setFormData] = useState<AddFormData>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [magicLink, setMagicLink] = useState('');
  const [copyFeedback, setCopyFeedback] = useState('');

  // Create-user modal state (existing 🔑 flow)
  const [createUserTarget, setCreateUserTarget] = useState<Employee | null>(null);

  // Link modal state
  const [linkModal, setLinkModal] = useState<{
    emp: Employee;
    link: string | null;
    loading: boolean;
    copied: boolean;
  } | null>(null);

  // Inline card edit state
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [draftEmployee, setDraftEmployee] = useState<Partial<Employee> | null>(null);

  // Vacation modal state
  const [vacationModal, setVacationModal] = useState<{ empId: string } | null>(null);
  const [vacationFrom, setVacationFrom] = useState('');
  const [vacationTo, setVacationTo] = useState('');

  // Fixed shift modal state
  const [fixedShiftModal, setFixedShiftModal] = useState(false);
  const [editingFsIdx, setEditingFsIdx] = useState<number | null>(null);
  const [fsDay, setFsDay] = useState('ראשון');
  const [fsShift, setFsShift] = useState('בוקר');
  const [fsArrival, setFsArrival] = useState('');
  const [fsDeparture, setFsDeparture] = useState('');

  // Unsaved changes tracking
  const [wizardDirty, setWizardDirty] = useState(false);
  const [cardEditDirty, setCardEditDirty] = useState(false);
  const [vacationDirty, setVacationDirty] = useState(false);
  const [fixedShiftDirty, setFixedShiftDirty] = useState(false);
  const [unsavedTarget, setUnsavedTarget] = useState<'wizard' | 'cardEdit' | 'vacation' | 'fixedShift' | null>(null);

  const shiftOptions = Array.from({ length: 13 }, (_, i) => i); // 0..12
  const dayOptions = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];
  const shiftTypeOptions = ['בוקר', 'ערב'];

  // ── Add Modal — 3-step wizard ──
  const openAddModal = () => {
    setFormData(INITIAL_FORM);
    setWizardStep(1);
    setMagicLink('');
    setCopyFeedback('');
    setWizardDirty(false);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setWizardStep(1);
    setMagicLink('');
    setWizardDirty(false);
  };

  const tryCloseWizard = () => {
    if (wizardDirty && wizardStep < 3) { setUnsavedTarget('wizard'); return; }
    closeModal();
  };

  const updateFormData = (updates: Partial<AddFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
    setWizardDirty(true);
  };

  const updateDraft = (updates: Partial<Employee>) => {
    setDraftEmployee(prev => prev ? { ...prev, ...updates } : prev);
    setCardEditDirty(true);
  };

  const handleSaveToSupabase = async () => {
    if (!formData.name.trim()) return;
    setSaving(true);

    // Insert employee to Supabase (without email — handled separately to avoid unique-constraint crashes)
    const { data: newEmp, error } = await supabase
      .from('employees')
      .insert({
        name: formData.name.trim(),
        phone: formData.phone.trim() || null,
        seniority: formData.seniority,
        shifts_per_week: formData.shiftsPerWeek,
        shift_type: formData.shiftType,
        friday: formData.friday,
        active_from: formData.activeFrom || null,
        active_until: formData.activeUntil || null,
        birthday: formData.birthday.trim() || null,
        role: 'employee',
      })
      .select()
      .single();

    if (error || !newEmp) {
      alert('שגיאה בשמירת עובד/ת: ' + (error?.message || 'Unknown error'));
      setSaving(false);
      return;
    }

    // Save email separately — unique-constraint or format errors won't block employee creation
    if (formData.email.trim()) {
      const { error: emailError } = await supabase
        .from('employees')
        .update({ email: formData.email.trim() })
        .eq('id', newEmp.id);
      if (emailError) {
        alert('העובד/ת נוסף/ה בהצלחה, אך לא ניתן לשמור את האימייל: ' + emailError.message);
      }
    }

    // Create token
    const { data: tokenData } = await supabase
      .from('employee_tokens')
      .insert({ employee_id: newEmp.id })
      .select('token')
      .single();

    const link = tokenData
      ? `${window.location.origin}/join/${tokenData.token}`
      : '';
    setMagicLink(link);

    // Refresh employee list from Supabase
    onRefresh();

    setSaving(false);
    setWizardStep(3);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback('הועתק!');
      setTimeout(() => setCopyFeedback(''), 2000);
    } catch {
      setCopyFeedback('שגיאה בהעתקה');
    }
  };

  // ── Open link modal for existing employee card ──
  const handleOpenLinkModal = async (empId: string) => {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;

    setLinkModal({ emp, link: null, loading: true, copied: false });

    // Employee already has Supabase ID — look up token directly
    let { data: tokenRow } = await supabase
      .from('employee_tokens')
      .select('token')
      .eq('employee_id', emp.id)
      .eq('is_active', true)
      .single();

    if (!tokenRow) {
      const { data: newToken } = await supabase
        .from('employee_tokens')
        .insert({ employee_id: emp.id })
        .select('token')
        .single();
      tokenRow = newToken;
    }

    const link = tokenRow ? `${window.location.origin}/join/${tokenRow.token}` : null;
    setLinkModal(prev => prev ? { ...prev, link, loading: false } : null);
  };

  const handleCopyLinkFromModal = async () => {
    if (!linkModal?.link) return;
    try {
      await navigator.clipboard.writeText(linkModal.link);
      setLinkModal(prev => prev ? { ...prev, copied: true } : null);
      setTimeout(() => setLinkModal(prev => prev ? { ...prev, copied: false } : null), 2000);
    } catch {
      // Clipboard API unavailable — user can select manually
    }
  };

  // ── Inline Card Edit ──
  const startCardEdit = (emp: Employee) => {
    setEditingCardId(emp.id);
    setDraftEmployee({
      name: emp.name,
      phone: emp.phone || '',
      email: emp.email || '',
      seniority: emp.seniority ?? 0,
      shiftsPerWeek: emp.shiftsPerWeek,
      fridayAvailability: emp.fridayAvailability,
      shiftType: emp.shiftType,
      isTrainee: emp.isTrainee,
      availableFromDate: emp.availableFromDate,
      availableToDate: emp.availableToDate,
      fixedShifts: emp.fixedShifts ? emp.fixedShifts.map(fs => ({ ...fs })) : [],
      vacationPeriods: emp.vacationPeriods.map(vp => ({ ...vp })),
      birthday: emp.birthday || '',
    });
    setCardEditDirty(false);
  };

  const saveCardEdit = async () => {
    if (!draftEmployee || editingCardId === null) return;
    if (!draftEmployee.name?.trim()) {
      alert('אנא הזן שם עובד/ת');
      return;
    }

    // Map local values to Supabase format
    const fridayMap: Record<string, string> = { always: 'yes', never: 'no', biweekly: 'biweekly' };
    const shiftMap: Record<string, string> = { 'הכל': 'all', 'בוקר': 'morning', 'ערב': 'evening' };

    const friday = draftEmployee.fridayAvailability ? fridayMap[draftEmployee.fridayAvailability] || 'no' : undefined;
    const shiftType = draftEmployee.shiftType ? shiftMap[draftEmployee.shiftType] || 'all' : undefined;

    const updateData: Record<string, unknown> = {};
    if (draftEmployee.name !== undefined) updateData.name = draftEmployee.name.trim();
    if (draftEmployee.phone !== undefined) updateData.phone = (draftEmployee.phone as string)?.trim() || null;
    if (draftEmployee.email !== undefined) updateData.email = (draftEmployee.email as string)?.trim() || null;
    if (draftEmployee.seniority !== undefined) updateData.seniority = draftEmployee.seniority;
    if (draftEmployee.shiftsPerWeek !== undefined) updateData.shifts_per_week = draftEmployee.shiftsPerWeek;
    if (friday !== undefined) updateData.friday = friday;
    if (shiftType !== undefined) updateData.shift_type = shiftType;
    if (draftEmployee.availableFromDate !== undefined) updateData.active_from = draftEmployee.availableFromDate || null;
    if (draftEmployee.availableToDate !== undefined) updateData.active_until = draftEmployee.availableToDate || null;
    if (draftEmployee.fixedShifts !== undefined) updateData.fixed_shifts = draftEmployee.fixedShifts;
    if (draftEmployee.vacationPeriods !== undefined) updateData.vacation_periods = draftEmployee.vacationPeriods;
    if (draftEmployee.birthday !== undefined) updateData.birthday = (draftEmployee.birthday as string)?.trim() || null;
    if ((draftEmployee as Record<string, unknown>).trainingStart !== undefined) updateData.training_start = (draftEmployee as Record<string, unknown>).trainingStart || null;
    if ((draftEmployee as Record<string, unknown>).shiftsStart !== undefined) updateData.shifts_start = (draftEmployee as Record<string, unknown>).shiftsStart || null;

    const { error } = await supabase
      .from('employees')
      .update(updateData)
      .eq('id', editingCardId);

    if (error) {
      alert('שגיאה בעדכון: ' + error.message);
      return;
    }

    onRefresh();
    setEditingCardId(null);
    setDraftEmployee(null);
  };

  const cancelCardEdit = () => {
    setEditingCardId(null);
    setDraftEmployee(null);
    setCardEditDirty(false);
  };

  const tryCancelCardEdit = () => {
    if (cardEditDirty) { setUnsavedTarget('cardEdit'); return; }
    cancelCardEdit();
  };

  // ── Split active / former ──
  const isInactive = (emp: Employee) => {
    if (!emp.availableToDate) return false;
    return new Date(emp.availableToDate + 'T23:59:59') < new Date();
  };
  const activeEmployees = employees.filter(e => !isInactive(e));
  const formerEmployees = employees.filter(e => isInactive(e));

  const restoreEmployee = async (emp: Employee) => {
    await supabase.from('employees').update({ active_until: null }).eq('id', emp.id);
    onRefresh();
  };

  const addVacationToDraft = () => {
    if (!vacationFrom || !vacationTo || !draftEmployee) return;
    const current = (draftEmployee.vacationPeriods || []) as { from: string; to: string }[];
    updateDraft({ vacationPeriods: [...current, { from: vacationFrom, to: vacationTo }] });
    setVacationModal(null);
    setVacationDirty(false);
    setVacationFrom('');
    setVacationTo('');
  };

  const removeDraftVacation = (idx: number) => {
    if (!draftEmployee) return;
    const current = (draftEmployee.vacationPeriods || []) as { from: string; to: string }[];
    updateDraft({ vacationPeriods: current.filter((_, i) => i !== idx) });
  };

  const addFixedShiftToDraft = () => {
    if (!draftEmployee) return;
    const defaultArrival = fsShift === 'בוקר' ? '07:00' : '14:00';
    const defaultDeparture = fsShift === 'בוקר' ? '14:00' : '21:00';
    const newFs: FixedShift = {
      day: fsDay,
      shift: fsShift,
      arrivalTime: fsArrival || defaultArrival,
      departureTime: fsDeparture || defaultDeparture,
    };
    const current = (draftEmployee.fixedShifts as FixedShift[]) || [];
    if (editingFsIdx !== null) {
      // Edit mode: replace the existing fixed shift
      const updated = current.map((fs, i) => i === editingFsIdx ? newFs : fs);
      updateDraft({ fixedShifts: updated });
    } else {
      // Add mode: append new fixed shift
      updateDraft({ fixedShifts: [...current, newFs] });
    }
    setFixedShiftModal(false);
    setFixedShiftDirty(false);
    setEditingFsIdx(null);
    setFsDay('ראשון');
    setFsShift('בוקר');
    setFsArrival('');
    setFsDeparture('');
  };

  const fmtShort = (d: string) => {
    const [, m, dd] = d.split('-');
    return `${dd}.${m}`;
  };

  const getSubtitle = (emp: Employee) => {
    if (emp.name === MIYA_NAME && !emp.isTrainee) return 'מנהלת החנות';
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

  // Bridge local Employee to SupabaseEmployee shape for CreateUserModal
  const toSupabaseEmployee = (emp: Employee): SupabaseEmployee => ({
    id: emp.id,
    name: emp.name,
    email: emp.email || undefined,
    phone: emp.phone || undefined,
    seniority: emp.seniority ?? 0,
    friday: emp.fridayAvailability,
    shift_type: emp.shiftType,
    active_from: emp.availableFromDate || undefined,
    active_until: emp.availableToDate || undefined,
    role: emp.name === MIYA_NAME ? 'admin' : 'employee',
    created_at: '',
  });

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid #e8e0d4', borderRadius: 6, color: '#1a1a1a' };
  const selectStyle: React.CSSProperties = { ...inputStyle };

  const infoRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 14 };
  const infoLabelStyle: React.CSSProperties = { minWidth: 90, fontSize: 13, color: '#6b7280', flexShrink: 0 };
  const iconWrapStyle: React.CSSProperties = { opacity: 0.5, flexShrink: 0, display: 'flex', alignItems: 'center' };
  const badgeStyle = (bg: string, color: string): React.CSSProperties => ({
    fontSize: 12, fontWeight: 500, padding: '2px 10px', borderRadius: 999, background: bg, color, whiteSpace: 'nowrap',
  });
  const dividerStyle: React.CSSProperties = { height: 0, borderTop: '0.5px solid #e8e0d4', margin: '10px 0' };

  // ── Toggle button helper ──
  const toggleBtn = (label: string, active: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8,
        border: active ? '2px solid #1a4a2e' : '1px solid #e8e0d4',
        background: active ? '#EAF3DE' : 'white',
        color: active ? '#1a4a2e' : '#64748b',
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );

  return (
    <div dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1a4a2e' }}>עובדות/ים</h2>
        {subTab === 'active' && (
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
            + הוסף עובד/ת
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        <button
          onClick={() => setSubTab('active')}
          style={{
            padding: '7px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8,
            border: subTab === 'active' ? '2px solid #1a4a2e' : '1px solid #e8e0d4',
            background: subTab === 'active' ? '#EAF3DE' : 'white',
            color: subTab === 'active' ? '#1a4a2e' : '#64748b',
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          פעילות ({activeEmployees.length})
        </button>
        <button
          onClick={() => setSubTab('former')}
          style={{
            padding: '7px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8,
            border: subTab === 'former' ? '2px solid #1a4a2e' : '1px solid #e8e0d4',
            background: subTab === 'former' ? '#EAF3DE' : 'white',
            color: subTab === 'former' ? '#1a4a2e' : '#64748b',
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          עבדו פעם ({formerEmployees.length})
        </button>
      </div>

      {/* Former employees grid */}
      {subTab === 'former' && (
        formerEmployees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 14 }}>
            אין עובדות/ים שסיימו לעבוד
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
            {formerEmployees.map((employee) => {
              const subtitle = getSubtitle(employee);
              const availText = getAvailabilityText(employee);
              return (
                <div
                  key={employee.id}
                  style={{
                    background: 'white', borderRadius: 12, border: '0.5px solid #e0ddd8',
                    padding: '1.25rem', direction: 'rtl', opacity: 0.85,
                  }}
                >
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: '50%',
                      background: '#F1EFE8', color: '#8b8b8b',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, fontWeight: 600, flexShrink: 0,
                    }}>
                      {employee.name.charAt(0)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontSize: 17, fontWeight: 500, color: '#1a1a1a', lineHeight: 1.2 }}>{employee.name}</span>
                      {subtitle && <span style={{ fontSize: 12, color: '#8b8b8b' }}>{subtitle}</span>}
                    </div>
                    <span style={{
                      marginRight: 'auto',
                      ...badgeStyle('#FEE2E2', '#991B1B'),
                    }}>
                      לא פעילה
                    </span>
                  </div>
                  <div style={dividerStyle} />
                  {/* Info */}
                  <div style={infoRowStyle}>
                    <span style={iconWrapStyle}><IconCalendar /></span>
                    <span style={infoLabelStyle}>משמרות בשבוע</span>
                    <span style={{ fontWeight: 500 }}>{employee.shiftsPerWeek}</span>
                  </div>
                  <div style={infoRowStyle}>
                    <span style={iconWrapStyle}><IconClock /></span>
                    <span style={infoLabelStyle}>סוג משמרת</span>
                    <span style={badgeStyle('#E6F1FB', '#185FA5')}>{employee.shiftType}</span>
                  </div>
                  {availText && (
                    <div style={infoRowStyle}>
                      <span style={iconWrapStyle}><IconCalendar /></span>
                      <span style={infoLabelStyle}>זמינות</span>
                      <span style={{ fontSize: 13, color: '#475569' }}>{availText}</span>
                    </div>
                  )}
                  <div style={dividerStyle} />
                  {/* Restore button */}
                  <button
                    onClick={() => restoreEmployee(employee)}
                    style={{
                      width: '100%', padding: '8px 0', fontSize: 13, fontWeight: 600,
                      background: 'white', color: '#1a4a2e',
                      border: '1.5px solid #1a4a2e', borderRadius: 8, cursor: 'pointer',
                    }}
                  >
                    החזר לפעילות
                  </button>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Active employees grid */}
      {subTab === 'active' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
        {activeEmployees.map((employee) => {
          const isEditing = editingCardId === employee.id;
          const draft = isEditing ? draftEmployee : null;
          const inactive = isInactive(employee);
          const subtitle = getSubtitle(employee);
          const availText = getAvailabilityText(employee);

          // Expiring within 30 days
          const expiringDays = (() => {
            if (!employee.availableToDate) return null;
            const now = new Date(); now.setHours(0, 0, 0, 0);
            const end = new Date(employee.availableToDate + 'T00:00:00');
            const diff = Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
            return diff >= 0 && diff <= 30 ? diff : null;
          })();

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
                        onChange={(e) => { updateDraft({ name: e.target.value }); }}
                        style={inputStyle}
                      />
                    </div>

                    {/* Phone + Email */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={labelStyle}>טלפון:</label>
                        <input
                          type="tel"
                          value={(draft.phone as string) || ''}
                          onChange={(e) => { updateDraft({ phone: e.target.value }); }}
                          placeholder="050-1234567"
                          dir="ltr"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>אימייל:</label>
                        <input
                          type="email"
                          value={(draft.email as string) || ''}
                          onChange={(e) => { updateDraft({ email: e.target.value }); }}
                          placeholder="example@email.com"
                          dir="ltr"
                          style={inputStyle}
                        />
                      </div>
                    </div>

                    {/* Shifts Per Week + Seniority */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={labelStyle}>משמרות בשבוע:</label>
                        <select
                          value={draft.shiftsPerWeek ?? 3}
                          onChange={(e) => { updateDraft({ shiftsPerWeek: parseInt(e.target.value) }); }}
                          style={selectStyle}
                        >
                          {shiftOptions.map(num => <option key={num} value={num}>{num}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>ותק (חודשים):</label>
                        <input
                          type="number"
                          min={0}
                          value={draft.seniority ?? 0}
                          onChange={(e) => { updateDraft({ seniority: parseInt(e.target.value) || 0 }); }}
                          style={inputStyle}
                        />
                      </div>
                    </div>

                    {/* Friday */}
                    <div>
                      <label style={labelStyle}>שישי:</label>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                          <input type="radio" name={`friday_${employee.id}`} value="always"
                            checked={draft.fridayAvailability === 'always'}
                            onChange={() => { updateDraft({ fridayAvailability: 'always' }); }}
                          /> כל שישי
                        </label>
                        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                          <input type="radio" name={`friday_${employee.id}`} value="never"
                            checked={draft.fridayAvailability === 'never'}
                            onChange={() => { updateDraft({ fridayAvailability: 'never' }); }}
                          /> לא
                        </label>
                        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                          <input type="radio" name={`friday_${employee.id}`} value="biweekly"
                            checked={draft.fridayAvailability === 'biweekly'}
                            onChange={() => { updateDraft({ fridayAvailability: 'biweekly' }); }}
                          /> אחת לשבועיים
                        </label>
                      </div>
                    </div>

                    {/* Trainee */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={draft.isTrainee || false}
                        onChange={(e) => { updateDraft({ isTrainee: e.target.checked }); }}
                        style={{ width: 16, height: 16, accentColor: '#c17f3b' }}
                      />
                      <label style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>מתלמדת (בהכשרה)</label>
                    </div>

                    {/* Birthday */}
                    <div>
                      <label style={labelStyle}>יום הולדת (DD/MM):</label>
                      <input
                        type="text"
                        value={(draft.birthday as string) || ''}
                        onChange={(e) => { updateDraft({ birthday: e.target.value }); }}
                        placeholder="DD/MM"
                        dir="ltr"
                        style={inputStyle}
                      />
                    </div>

                    {/* Shift Type */}
                    <div>
                      <label style={labelStyle}>סוג משמרת:</label>
                      <select
                        value={draft.shiftType || 'הכל'}
                        onChange={(e) => { updateDraft({ shiftType: e.target.value as any }); }}
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
                        <label style={labelStyle}>תחילת חפיפה:</label>
                        <input type="date" value={(draft as Record<string, unknown>).trainingStart as string || ''} onChange={(e) => { updateDraft({ trainingStart: e.target.value } as Partial<Employee>); }} style={{ ...inputStyle, fontSize: 11 }} />
                      </div>
                      <div>
                        <label style={labelStyle}>תחילת משמרות:</label>
                        <input type="date" value={draft.availableFromDate || ''} onChange={(e) => { updateDraft({ availableFromDate: e.target.value }); }} style={{ ...inputStyle, fontSize: 11 }} />
                      </div>
                      <div>
                        <label style={labelStyle}>זמין עד:</label>
                        <input type="date" value={draft.availableToDate || ''} onChange={(e) => { updateDraft({ availableToDate: e.target.value }); }} style={{ ...inputStyle, fontSize: 11 }} />
                      </div>
                    </div>
                  </div>

                  {/* Fixed Shifts (edit) */}
                  <div style={{ marginTop: 10, borderTop: '1px solid #f0ebe3', paddingTop: 10 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#0C447C', marginBottom: 6 }}>
                      משמרות קבועות {((draft.fixedShifts as FixedShift[])?.length || 0) > 0 && `(${(draft.fixedShifts as FixedShift[])!.length})`}
                    </label>
                    {((draft.fixedShifts as FixedShift[]) || []).map((fs, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', borderRadius: 6, padding: '6px 10px', fontSize: 13, marginBottom: 4 }}>
                        <span style={{ fontWeight: 500, color: '#1a4a2e' }}>{fs.day} — {fs.shift}</span>
                        <span style={{ color: '#6b7280' }}>({fs.arrivalTime}–{fs.departureTime})</span>
                        <span style={{ marginRight: 'auto', display: 'flex', gap: 4 }}>
                          <button onClick={() => {
                            setEditingFsIdx(idx);
                            setFsDay(fs.day); setFsShift(fs.shift);
                            setFsArrival(fs.arrivalTime); setFsDeparture(fs.departureTime);
                            setFixedShiftModal(true); setFixedShiftDirty(false);
                          }} style={{ fontSize: 12, background: 'none', border: 'none', color: '#1a4a2e', cursor: 'pointer', padding: '0 4px' }}>✏️</button>
                          <button onClick={() => {
                            const arr = ((draft.fixedShifts as FixedShift[]) || []).filter((_, i) => i !== idx);
                            updateDraft({ fixedShifts: arr });
                          }} style={{ fontSize: 12, background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '0 4px', fontWeight: 700 }}>✕</button>
                        </span>
                      </div>
                    ))}
                    <button
                      onClick={() => { setEditingFsIdx(null); setFixedShiftModal(true); setFsDay('ראשון'); setFsShift('בוקר'); setFsArrival(''); setFsDeparture(''); setFixedShiftDirty(false); }}
                      style={{ width: '100%', marginTop: 4, padding: '6px 0', fontSize: 12, fontWeight: 600, background: 'transparent', color: '#1a4a2e', border: '1px solid #4a7c59', borderRadius: 6, cursor: 'pointer' }}
                    >
                      + הוסף משמרת קבועה
                    </button>
                  </div>

                  {/* Vacation Periods (edit) */}
                  {(() => {
                    const draftVacations = ((draft.vacationPeriods || []) as { from: string; to: string }[]);
                    return (
                      <div style={{ marginTop: 10, borderTop: '1px solid #f0ebe3', paddingTop: 10 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
                          חופש {draftVacations.length > 0 && `(${draftVacations.length})`}
                        </label>
                        {draftVacations.map((vp, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FEF3E2', borderRadius: 6, padding: '4px 10px', fontSize: 13, color: '#92400e', marginBottom: 4 }}>
                            <span style={{ fontWeight: 600 }}>{fmtShort(vp.from)} – {fmtShort(vp.to)}</span>
                            <button
                              onClick={() => removeDraftVacation(idx)}
                              style={{ marginRight: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#92400e', padding: '0 2px', lineHeight: 1 }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => { setVacationModal({ empId: employee.id }); setVacationFrom(''); setVacationTo(''); }}
                          style={{ width: '100%', marginTop: 4, padding: '6px 0', fontSize: 12, fontWeight: 600, background: 'transparent', color: '#c17f3b', border: '1px solid #c17f3b', borderRadius: 6, cursor: 'pointer' }}
                        >
                          + הוסף חופש
                        </button>
                      </div>
                    );
                  })()}

                  {/* Edit Buttons */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button
                      onClick={saveCardEdit}
                      style={{ padding: '6px 14px', fontSize: 12, background: '#1a4a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                    >
                      שמור
                    </button>
                    <button
                      onClick={tryCancelCardEdit}
                      style={{ padding: '6px 14px', fontSize: 12, background: '#f5f0e8', color: '#475569', border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                    >
                      בטל
                    </button>
                  </div>
                </>
              ) : (
                /* ════════ VIEW MODE ════════ */
                <div style={{ position: 'relative' }}>
                  {expiringDays !== null && (
                    <div style={{
                      position: 'absolute', top: -10, left: -10, zIndex: 1,
                      background: '#c17f3b', color: 'white',
                      fontSize: 11, fontWeight: 700, padding: '3px 10px',
                      borderRadius: 999, whiteSpace: 'nowrap',
                    }}>
                      פג בעוד {expiringDays} ימים
                    </div>
                  )}
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
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
                  {/* Row — Phone (conditional) */}
                  {employee.phone && (
                    <div style={infoRowStyle}>
                      <span style={iconWrapStyle}>📞</span>
                      <span style={infoLabelStyle}>טלפון</span>
                      <span style={{ fontSize: 13, direction: 'ltr' as const }}>{employee.phone}</span>
                    </div>
                  )}
                  {/* Row — Email (conditional) */}
                  {employee.email && (
                    <div style={infoRowStyle}>
                      <span style={iconWrapStyle}>✉️</span>
                      <span style={infoLabelStyle}>אימייל</span>
                      <span style={{ fontSize: 12, direction: 'ltr' as const, wordBreak: 'break-all' as const }}>{employee.email}</span>
                    </div>
                  )}

                  {/* Row — Shifts per week */}
                  <div style={infoRowStyle}>
                    <span style={iconWrapStyle}><IconCalendar /></span>
                    <span style={infoLabelStyle}>משמרות בשבוע</span>
                    <span style={{ fontWeight: 500 }}>{employee.shiftsPerWeek}</span>
                  </div>

                  {/* Row — Seniority (conditional) */}
                  {employee.seniority > 0 && (
                    <div style={infoRowStyle}>
                      <span style={iconWrapStyle}><IconStar /></span>
                      <span style={infoLabelStyle}>ותק</span>
                      <span style={{ fontSize: 13, color: '#475569' }}>{employee.seniority} חודשים</span>
                    </div>
                  )}

                  {/* Row — Shift type */}
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
                      <span style={badgeStyle('#F1EFE8', '#5F5E5A')}>לא עובד/ת</span>
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

                  {/* Row 4b — Birthday (conditional) */}
                  {employee.birthday && (
                    <div style={infoRowStyle}>
                      <span style={iconWrapStyle}>🎂</span>
                      <span style={infoLabelStyle}>יום הולדת</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#c17f3b' }}>{employee.birthday}</span>
                    </div>
                  )}

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

                  {/* 5b. VACATION PERIODS */}
                  <div>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#6b7280', marginBottom: 6 }}>
                      חופש
                    </span>
                    {employee.vacationPeriods.length === 0 ? (
                      <span style={{ fontSize: 13, color: '#9ca3af' }}>אין</span>
                    ) : (
                      <div style={{ background: '#FEF3E2', borderRadius: 8, padding: '8px 12px' }}>
                        {employee.vacationPeriods.map((vp, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 13 }}>
                            <span style={{ fontWeight: 500, color: '#c17f3b' }}>{fmtShort(vp.from)} – {fmtShort(vp.to)}</span>
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
                      onClick={() => handleOpenLinkModal(employee.id)}
                      title="הצג קישור כניסה"
                      style={{
                        padding: '7px 12px',
                        fontSize: 13,
                        fontWeight: 500,
                        background: 'transparent',
                        color: '#2563EB',
                        border: '0.5px solid #93C5FD',
                        borderRadius: 8,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      🔗
                    </button>
                    <button
                      onClick={() => setCreateUserTarget(employee)}
                      title="הגדר כניסה"
                      style={{
                        padding: '7px 12px',
                        fontSize: 13,
                        fontWeight: 500,
                        background: 'transparent',
                        color: '#7c3aed',
                        border: '0.5px solid #c4b5fd',
                        borderRadius: 8,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      🔑
                    </button>
                    <button
                      onClick={async () => {
                        if (window.confirm(`האם למחוק את ${employee.name}? פעולה זו אינה ניתנת לביטול.`)) {
                          const { error } = await supabase.from('employees').delete().eq('id', employee.id);
                          if (error) { alert('שגיאה במחיקה: ' + error.message); return; }
                          onRefresh();
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
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}

      {/* ═══ Add Employee Modal — 3-Step Wizard ═══ */}
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
              onClick={tryCloseWizard}
              style={{
                position: 'absolute', right: 12, top: 12,
                width: 28, height: 28, borderRadius: '50%', background: '#f5f0e8',
                border: 'none', cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b',
              }}
            >
              ✕
            </button>

            {/* Step indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              {[1, 2, 3].map(step => (
                <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700,
                    background: wizardStep >= step ? '#1a4a2e' : '#e8e0d4',
                    color: wizardStep >= step ? 'white' : '#9ca3af',
                  }}>
                    {wizardStep > step ? '✓' : step}
                  </div>
                  {step < 3 && <div style={{ width: 24, height: 2, background: wizardStep > step ? '#1a4a2e' : '#e8e0d4' }} />}
                </div>
              ))}
            </div>

            {/* ═══ Step 1: Personal Details ═══ */}
            {wizardStep === 1 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a4a2e', marginBottom: 16, marginTop: 0 }}>
                  פרטים אישיים
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>שם מלא *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => updateFormData({ name: e.target.value })}
                      placeholder="הזן שם עובד/ת"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>מספר טלפון</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={e => updateFormData({ phone: e.target.value })}
                      placeholder="050-1234567"
                      dir="ltr"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>אימייל</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={e => updateFormData({ email: e.target.value })}
                      placeholder="example@email.com"
                      dir="ltr"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>יום הולדת</label>
                    <input
                      type="text"
                      value={formData.birthday}
                      onChange={e => updateFormData({ birthday: e.target.value })}
                      placeholder="DD/MM"
                      dir="ltr"
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
                  <button onClick={tryCloseWizard} style={{ padding: '8px 16px', fontSize: 14, fontWeight: 600, background: '#f5f0e8', color: '#475569', border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer' }}>
                    ביטול
                  </button>
                  <button
                    onClick={() => {
                      if (!formData.name.trim()) { alert('נא להזין שם'); return; }
                      setWizardStep(2);
                    }}
                    style={{ padding: '8px 20px', fontSize: 14, fontWeight: 600, background: '#1a4a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                  >
                    הבא &larr;
                  </button>
                </div>
              </>
            )}

            {/* ═══ Step 2: Shift Settings ═══ */}
            {wizardStep === 2 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a4a2e', marginBottom: 16, marginTop: 0 }}>
                  הגדרות משמרת
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Shifts per week + Seniority (one row) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>משמרות בשבוע</label>
                      <input
                        type="number"
                        min={0}
                        max={12}
                        value={formData.shiftsPerWeek}
                        onChange={e => updateFormData({ shiftsPerWeek: parseInt(e.target.value) || 0 })}
                        style={inputStyle}
                      />
                      <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, display: 'block' }}>
                        כמה משמרות מחויבת בשבוע
                      </span>
                    </div>
                    <div>
                      <label style={labelStyle}>ותק בחודשים</label>
                      <input
                        type="number"
                        min={0}
                        value={formData.seniority}
                        onChange={e => updateFormData({ seniority: parseInt(e.target.value) || 0 })}
                        style={inputStyle}
                      />
                      <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, display: 'block' }}>
                        לדוגמה: שנתיים = 24
                      </span>
                    </div>
                  </div>

                  {/* Shift Type toggle */}
                  <div>
                    <label style={labelStyle}>סוג משמרת</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {toggleBtn('הכל', formData.shiftType === 'all', () => updateFormData({ shiftType: 'all' }))}
                      {toggleBtn('בוקר בלבד', formData.shiftType === 'morning', () => updateFormData({ shiftType: 'morning' }))}
                      {toggleBtn('ערב בלבד', formData.shiftType === 'evening', () => updateFormData({ shiftType: 'evening' }))}
                    </div>
                  </div>

                  {/* Friday toggle */}
                  <div>
                    <label style={labelStyle}>עובד/ת בשישי</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {toggleBtn('כל שישי', formData.friday === 'yes', () => updateFormData({ friday: 'yes' }))}
                      {toggleBtn('אחת לשבועיים', formData.friday === 'biweekly', () => updateFormData({ friday: 'biweekly' }))}
                      {toggleBtn('בכלל לא', formData.friday === 'no', () => updateFormData({ friday: 'no' }))}
                    </div>
                  </div>

                  {/* Date Range */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={labelStyle}>תאריך התחלה</label>
                      <input
                        type="date"
                        value={formData.activeFrom}
                        onChange={e => updateFormData({ activeFrom: e.target.value })}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>תאריך סיום</label>
                      <input
                        type="date"
                        value={formData.activeUntil}
                        onChange={e => updateFormData({ activeUntil: e.target.value })}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'space-between' }}>
                  <button onClick={() => setWizardStep(1)} style={{ padding: '8px 16px', fontSize: 14, fontWeight: 600, background: '#f5f0e8', color: '#475569', border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer' }}>
                    &rarr; הקודם
                  </button>
                  <button
                    onClick={handleSaveToSupabase}
                    disabled={saving}
                    style={{
                      padding: '8px 20px', fontSize: 14, fontWeight: 600,
                      background: saving ? '#9ca3af' : '#1a4a2e', color: 'white',
                      border: 'none', borderRadius: 6, cursor: saving ? 'default' : 'pointer',
                      opacity: saving ? 0.7 : 1,
                    }}
                  >
                    {saving ? 'שומר...' : 'שמור וצור קישור'}
                  </button>
                </div>
              </>
            )}

            {/* ═══ Step 3: Success + Magic Link ═══ */}
            {wizardStep === 3 && (
              <>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a4a2e', margin: '0 0 4px' }}>
                    {formData.name} נוספה בהצלחה!
                  </h2>
                  <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
                    שלחי לה את הקישור הבא כדי שתוכל להגיש העדפות
                  </p>
                </div>

                {magicLink ? (
                  <div style={{ background: '#f8f7f4', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                    <label style={{ ...labelStyle, marginBottom: 6 }}>קישור כניסה:</label>
                    <div style={{
                      display: 'flex', gap: 8, alignItems: 'center',
                    }}>
                      <input
                        readOnly
                        value={magicLink}
                        dir="ltr"
                        style={{
                          ...inputStyle, flex: 1,
                          background: 'white', fontSize: 12, fontFamily: 'monospace',
                        }}
                        onClick={e => (e.target as HTMLInputElement).select()}
                      />
                      <button
                        onClick={() => copyToClipboard(magicLink)}
                        style={{
                          padding: '6px 14px', fontSize: 13, fontWeight: 600,
                          background: copyFeedback === 'הועתק!' ? '#DCFCE7' : '#1a4a2e',
                          color: copyFeedback === 'הועתק!' ? '#166534' : 'white',
                          border: 'none', borderRadius: 6, cursor: 'pointer',
                          whiteSpace: 'nowrap', transition: 'all 0.15s',
                        }}
                      >
                        {copyFeedback || 'העתק קישור'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: '#FEF3C7', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: '#92400E' }}>
                    לא הצלחנו ליצור קישור. נסי ליצור דרך כפתור 🔗 בכרטיס העובד/ת.
                  </div>
                )}

                <button
                  onClick={closeModal}
                  style={{
                    width: '100%', padding: '10px 16px', fontSize: 14, fontWeight: 600,
                    background: '#f5f0e8', color: '#475569',
                    border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer',
                  }}
                >
                  סגור
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {createUserTarget && (
        <CreateUserModal
          employee={toSupabaseEmployee(createUserTarget)}
          onClose={() => setCreateUserTarget(null)}
        />
      )}

      {/* ═══ Link Modal ═══ */}
      {linkModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}
          onClick={() => setLinkModal(null)}
        >
          <div
            dir="rtl"
            onClick={e => e.stopPropagation()}
            style={{ background: 'white', borderRadius: 14, padding: 24, width: '90%', maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#EAF3DE', color: '#3B6D11', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, flexShrink: 0 }}>
                {linkModal.emp.name.charAt(0)}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1a4a2e' }}>
                  קישור כניסה — {linkModal.emp.name}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
                  שלחי את הקישור לעובד/ת כדי שיוכל/תוכל להגיש העדפות
                </div>
              </div>
            </div>

            {/* Body */}
            {linkModal.loading ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#6b7280', fontSize: 13 }}>
                <div style={{ width: 28, height: 28, border: '3px solid #C8DBA0', borderTopColor: '#2D5016', borderRadius: '50%', margin: '0 auto 10px', animation: 'spin 0.8s linear infinite' }} />
                טוען קישור...
              </div>
            ) : linkModal.link ? (
              <>
                <div style={{ background: '#f5f0e8', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
                  <input
                    readOnly
                    value={linkModal.link}
                    dir="ltr"
                    style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: 12, fontFamily: 'monospace', color: '#1a1a1a', cursor: 'text' }}
                    onClick={e => (e.target as HTMLInputElement).select()}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleCopyLinkFromModal}
                    style={{ flex: 1, padding: '10px 0', fontSize: 14, fontWeight: 600, background: linkModal.copied ? '#DCFCE7' : '#1a4a2e', color: linkModal.copied ? '#166534' : 'white', border: 'none', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s' }}
                  >
                    {linkModal.copied ? '✓ הועתק!' : 'העתק קישור'}
                  </button>
                  <button
                    onClick={() => setLinkModal(null)}
                    style={{ padding: '10px 18px', fontSize: 14, fontWeight: 600, background: '#f5f0e8', color: '#475569', border: '1px solid #e8e0d4', borderRadius: 8, cursor: 'pointer' }}
                  >
                    סגור
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ background: '#FEF3C7', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 13, color: '#92400E' }}>
                  לא נמצא/ה עובד/ת במערכת. ייתכן שטרם נוסף/ה ל-Supabase.
                </div>
                <button
                  onClick={() => setLinkModal(null)}
                  style={{ width: '100%', padding: '10px 0', fontSize: 14, fontWeight: 600, background: '#f5f0e8', color: '#475569', border: '1px solid #e8e0d4', borderRadius: 8, cursor: 'pointer' }}
                >
                  סגור
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {/* Vacation mini modal */}
      {vacationModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { if (vacationDirty) { setUnsavedTarget('vacation'); } else { setVacationModal(null); } }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, minWidth: 320, maxWidth: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1a4a2e', marginBottom: 16 }}>
              הוסף חופש — {employees.find(e => e.id === vacationModal.empId)?.name}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 4 }}>מתאריך</label>
                <input type="date" value={vacationFrom} onChange={e => { setVacationFrom(e.target.value); setVacationDirty(true); }} style={{ width: '100%', padding: '8px 10px', fontSize: 14, border: '1px solid #d1cdc6', borderRadius: 6, direction: 'ltr', color: '#1a1a1a' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 4 }}>עד תאריך</label>
                <input type="date" value={vacationTo} onChange={e => { setVacationTo(e.target.value); setVacationDirty(true); }} style={{ width: '100%', padding: '8px 10px', fontSize: 14, border: '1px solid #d1cdc6', borderRadius: 6, direction: 'ltr', color: '#1a1a1a' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => { if (vacationDirty) { setUnsavedTarget('vacation'); } else { setVacationModal(null); } }} style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, background: '#f5f0e8', color: '#475569', border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer' }}>
                ביטול
              </button>
              <button
                disabled={!vacationFrom || !vacationTo || vacationFrom > vacationTo}
                onClick={addVacationToDraft}
                style={{
                  padding: '8px 18px', fontSize: 13, fontWeight: 700, borderRadius: 6, border: 'none', cursor: (!vacationFrom || !vacationTo || vacationFrom > vacationTo) ? 'not-allowed' : 'pointer',
                  background: (!vacationFrom || !vacationTo || vacationFrom > vacationTo) ? '#94a3b8' : '#1a4a2e',
                  color: 'white', opacity: (!vacationFrom || !vacationTo || vacationFrom > vacationTo) ? 0.6 : 1,
                }}
              >
                שמור
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Fixed shift mini modal */}
      {fixedShiftModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { if (fixedShiftDirty) { setUnsavedTarget('fixedShift'); } else { setFixedShiftModal(false); } }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, minWidth: 320, maxWidth: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1a4a2e', marginBottom: 16 }}>
              {editingFsIdx !== null ? 'ערוך משמרת קבועה' : 'הוסף משמרת קבועה'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 4 }}>יום</label>
                <select value={fsDay} onChange={e => { setFsDay(e.target.value); setFixedShiftDirty(true); }} style={{ width: '100%', padding: '8px 10px', fontSize: 14, border: '1px solid #d1cdc6', borderRadius: 6, color: '#1a1a1a' }}>
                  {dayOptions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 4 }}>משמרת</label>
                <select value={fsShift} onChange={e => { setFsShift(e.target.value); setFixedShiftDirty(true); }} style={{ width: '100%', padding: '8px 10px', fontSize: 14, border: '1px solid #d1cdc6', borderRadius: 6, color: '#1a1a1a' }}>
                  {(fsDay === 'שישי' ? ['בוקר'] : shiftTypeOptions).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 4 }}>התחלה</label>
                  <input type="time" value={fsArrival} onChange={e => { setFsArrival(e.target.value); setFixedShiftDirty(true); }} placeholder={fsShift === 'בוקר' ? '07:00' : '14:00'} style={{ width: '100%', padding: '8px 10px', fontSize: 14, border: '1px solid #d1cdc6', borderRadius: 6, direction: 'ltr', color: '#1a1a1a' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 4 }}>סיום</label>
                  <input type="time" value={fsDeparture} onChange={e => { setFsDeparture(e.target.value); setFixedShiftDirty(true); }} placeholder={fsShift === 'בוקר' ? '14:00' : '21:00'} style={{ width: '100%', padding: '8px 10px', fontSize: 14, border: '1px solid #d1cdc6', borderRadius: 6, direction: 'ltr', color: '#1a1a1a' }} />
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>אם לא מוזן — ישתמש בשעות ברירת המחדל</div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => { if (fixedShiftDirty) { setUnsavedTarget('fixedShift'); } else { setFixedShiftModal(false); } }} style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, background: '#f5f0e8', color: '#475569', border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer' }}>
                ביטול
              </button>
              <button
                onClick={addFixedShiftToDraft}
                style={{ padding: '8px 18px', fontSize: 13, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer', background: '#1a4a2e', color: 'white' }}
              >
                שמור
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Unsaved changes dialog */}
      {unsavedTarget && (
        <UnsavedChangesDialog
          onSave={unsavedTarget === 'wizard' ? undefined : unsavedTarget === 'cardEdit' ? () => { saveCardEdit(); setUnsavedTarget(null); } : unsavedTarget === 'vacation' ? () => { addVacationToDraft(); setUnsavedTarget(null); } : () => { addFixedShiftToDraft(); setUnsavedTarget(null); }}
          onDiscard={() => {
            if (unsavedTarget === 'wizard') { closeModal(); }
            else if (unsavedTarget === 'cardEdit') { cancelCardEdit(); }
            else if (unsavedTarget === 'vacation') { setVacationModal(null); setVacationFrom(''); setVacationTo(''); setVacationDirty(false); }
            else if (unsavedTarget === 'fixedShift') { setFixedShiftModal(false); setFixedShiftDirty(false); }
            setUnsavedTarget(null);
          }}
          onCancel={() => setUnsavedTarget(null)}
        />
      )}
    </div>
  );
}
