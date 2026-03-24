import { useState } from 'react';
import type { Employee, FixedShift } from '../data/employees';

interface EmployeesTabProps {
  employees: Employee[];
  onUpdate: (employees: Employee[]) => void;
}

export function EmployeesTab({ employees, onUpdate }: EmployeesTabProps) {
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null); // null = add mode, number = edit mode
  const [formData, setFormData] = useState<Partial<Employee>>({
    name: '',
    shiftsPerWeek: 3,
    friday: false,
    shiftType: 'הכל',
    isTrainee: false,
    availableFromDate: '',
    availableToDate: '',
    fixedShifts: [],
  });
  const shiftOptions = Array.from({ length: 13 }, (_, i) => i); // 0..12
  const dayOptions = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];
  const shiftTypeOptions = ['בוקר', 'ערב'];

  const isEditMode = editingId !== null;

  const openAddModal = () => {
    setEditingId(null);
    setFormData({
      name: '',
      shiftsPerWeek: 3,
      friday: false,
      shiftType: 'הכל',
      isTrainee: false,
      availableFromDate: '',
      availableToDate: '',
      fixedShifts: [],
    });
    setShowModal(true);
  };

  const openEditModal = (emp: Employee) => {
    setEditingId(emp.id);
    setFormData({
      name: emp.name,
      shiftsPerWeek: emp.shiftsPerWeek,
      friday: emp.friday,
      shiftType: emp.shiftType,
      isTrainee: emp.isTrainee,
      availableFromDate: emp.availableFromDate,
      availableToDate: emp.availableToDate,
      fixedShifts: emp.fixedShifts ? [...emp.fixedShifts] : [],
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
  };

  const handleSave = () => {
    if (!formData.name?.trim()) {
      alert('אנא הזן שם עובדת');
      return;
    }
    if (isEditMode) {
      // Edit existing employee
      onUpdate(employees.map(emp =>
        emp.id === editingId ? {
          ...emp,
          name: formData.name!,
          shiftsPerWeek: formData.shiftsPerWeek || 3,
          friday: formData.friday || false,
          shiftType: formData.shiftType || 'הכל',
          isTrainee: formData.isTrainee || false,
          availableFromDate: formData.availableFromDate || '',
          availableToDate: formData.availableToDate || '',
          fixedShifts: (formData.fixedShifts as FixedShift[]) || [],
        } : emp
      ));
    } else {
      // Add new employee
      const newId = Math.max(...employees.map(e => e.id), 0) + 1;
      const employee: Employee = {
        id: newId,
        name: formData.name,
        shiftsPerWeek: formData.shiftsPerWeek || 3,
        friday: formData.friday || false,
        shiftType: formData.shiftType || 'הכל',
        isTrainee: formData.isTrainee || false,
        availableFrom: '',
        availableTo: '',
        availableFromDate: formData.availableFromDate || '',
        availableToDate: formData.availableToDate || '',
        fairnessHistory: [],
        flexibilityHistory: [],
        fixedShifts: (formData.fixedShifts as FixedShift[]) || [],
      };
      onUpdate([...employees, employee]);
    }
    closeModal();
  };

  const handleUpdate = (id: number, field: keyof Employee, value: any) => {
    onUpdate(employees.map(emp =>
      emp.id === id ? { ...emp, [field]: value } : emp
    ));
  };

  const updateFixedShiftCard = (empId: number, idx: number, field: keyof FixedShift, value: string) => {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;
    const shifts = [...(emp.fixedShifts || [])];
    shifts[idx] = { ...shifts[idx], [field]: value };
    if (field === 'shift') {
      if (value === 'בוקר') { shifts[idx].arrivalTime = '07:00'; shifts[idx].departureTime = '14:00'; }
      else { shifts[idx].arrivalTime = '14:00'; shifts[idx].departureTime = '21:00'; }
    }
    if (field === 'day' && value === 'שישי') {
      shifts[idx].shift = 'בוקר'; shifts[idx].arrivalTime = '07:00'; shifts[idx].departureTime = '14:00';
    }
    handleUpdate(empId, 'fixedShifts', shifts);
  };

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid #e8e0d4', borderRadius: 6 };
  const selectStyle: React.CSSProperties = { ...inputStyle };

  return (
    <div dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1a4a2e' }}>עובדות</h2>
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
          + הוסף עובדת
        </button>
      </div>

      {/* Employees Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {employees.map((employee) => (
          <div
            key={employee.id}
            style={{
              background: 'white',
              borderRadius: 10,
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              padding: 16,
              border: '1px solid #e8e0d4',
              transition: 'box-shadow 0.15s',
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#1a4a2e' }}>{employee.name}</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Shifts Per Week */}
              <div>
                <label style={labelStyle}>מספר משמרות בשבוע:</label>
                <select
                  value={employee.shiftsPerWeek}
                  onChange={(e) => handleUpdate(employee.id, 'shiftsPerWeek', parseInt(e.target.value))}
                  style={selectStyle}
                >
                  {shiftOptions.map(num => (
                    <option key={num} value={num}>{num}</option>
                  ))}
                </select>
              </div>

              {/* Friday */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>עבודה בשישי:</label>
                <input
                  type="checkbox"
                  checked={employee.friday}
                  onChange={(e) => handleUpdate(employee.id, 'friday', e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: '#4a7c59' }}
                />
              </div>

              {/* Trainee */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>מתלמדת (בהכשרה):</label>
                <input
                  type="checkbox"
                  checked={employee.isTrainee}
                  onChange={(e) => handleUpdate(employee.id, 'isTrainee', e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: '#c17f3b' }}
                />
              </div>

              {/* Shift Type */}
              <div>
                <label style={labelStyle}>סוג משמרת:</label>
                <select
                  value={employee.shiftType}
                  onChange={(e) => handleUpdate(employee.id, 'shiftType', e.target.value)}
                  style={selectStyle}
                >
                  <option>הכל</option>
                  <option>בוקר</option>
                  <option>ערב</option>
                  <option>אמצע</option>
                </select>
              </div>

              {/* Available Date Range */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={labelStyle}>זמין מ:</label>
                  <input
                    type="date"
                    value={employee.availableFromDate}
                    onChange={(e) => handleUpdate(employee.id, 'availableFromDate', e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>זמין עד:</label>
                  <input
                    type="date"
                    value={employee.availableToDate}
                    onChange={(e) => handleUpdate(employee.id, 'availableToDate', e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* Fixed Shifts */}
            <div style={{ marginTop: 10, borderTop: '1px solid #f0ebe3', paddingTop: 10 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#0C447C', marginBottom: 6 }}>
                משמרות קבועות {(employee.fixedShifts?.length || 0) > 0 && `(${employee.fixedShifts!.length})`}
              </label>
              {(employee.fixedShifts || []).map((fs, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', borderRadius: 6, padding: '8px 12px', marginBottom: 4 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={fs.day} onChange={e => updateFixedShiftCard(employee.id, idx, 'day', e.target.value)} style={{ fontSize: 12, fontWeight: 500, color: '#1a4a2e', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                      {dayOptions.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select value={fs.shift} onChange={e => updateFixedShiftCard(employee.id, idx, 'shift', e.target.value)} style={{ fontSize: 12, fontWeight: 500, color: '#1a4a2e', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                      {(fs.day === 'שישי' ? ['בוקר'] : shiftTypeOptions).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      <input type="time" value={fs.arrivalTime} onChange={e => updateFixedShiftCard(employee.id, idx, 'arrivalTime', e.target.value)} style={{ fontSize: 12, color: '#64748b', background: 'transparent', border: 'none', width: 58, padding: 0 }} />
                      —
                      <input type="time" value={fs.departureTime} onChange={e => updateFixedShiftCard(employee.id, idx, 'departureTime', e.target.value)} style={{ fontSize: 12, color: '#64748b', background: 'transparent', border: 'none', width: 58, padding: 0 }} />
                    </span>
                  </div>
                  <button onClick={() => {
                    const shifts = (employee.fixedShifts || []).filter((_, i) => i !== idx);
                    handleUpdate(employee.id, 'fixedShifts', shifts);
                  }} style={{ fontSize: 13, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 2px', fontWeight: 600, lineHeight: 1 }}>✕</button>
                </div>
              ))}
              <button
                onClick={() => {
                  const newShift: FixedShift = { day: 'ראשון', shift: 'בוקר', arrivalTime: '07:00', departureTime: '14:00' };
                  handleUpdate(employee.id, 'fixedShifts', [...(employee.fixedShifts || []), newShift]);
                }}
                style={{ width: '100%', marginTop: 4, padding: '6px 0', fontSize: 12, fontWeight: 600, background: 'transparent', color: '#1a4a2e', border: '1px solid #4a7c59', borderRadius: 6, cursor: 'pointer' }}
              >
                + הוסף משמרת קבועה
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button
                onClick={() => openEditModal(employee)}
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  background: '#E6F1FB',
                  color: '#0C447C',
                  border: '1px solid #B3D4F0',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                ערוך
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`האם למחוק את ${employee.name}? פעולה זו אינה ניתנת לביטול.`)) {
                    onUpdate(employees.filter(e => e.id !== employee.id));
                  }
                }}
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  background: '#fee2e2',
                  color: '#dc2626',
                  border: '1px solid #fca5a5',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                מחק
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Employee Modal */}
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
              onClick={closeModal}
              style={{
                position: 'absolute', right: 12, top: 12,
                width: 28, height: 28, borderRadius: '50%', background: '#f5f0e8',
                border: 'none', cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b',
              }}
            >
              ✕
            </button>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a4a2e', marginBottom: 20, marginTop: 0 }}>
              {isEditMode ? `עריכת עובדת — ${formData.name}` : 'הוסף עובדת חדשה'}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Name */}
              <div>
                <label style={labelStyle}>שם:</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="הזן שם עובדת"
                  style={inputStyle}
                />
              </div>

              {/* Shifts Per Week */}
              <div>
                <label style={labelStyle}>מספר משמרות בשבוע:</label>
                <select
                  value={formData.shiftsPerWeek ?? 3}
                  onChange={(e) => setFormData({...formData, shiftsPerWeek: parseInt(e.target.value)})}
                  style={selectStyle}
                >
                  {shiftOptions.map(num => (
                    <option key={num} value={num}>{num}</option>
                  ))}
                </select>
              </div>

              {/* Friday */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="modal-friday"
                  checked={formData.friday || false}
                  onChange={(e) => setFormData({...formData, friday: e.target.checked})}
                  style={{ width: 18, height: 18, accentColor: '#4a7c59' }}
                />
                <label htmlFor="modal-friday" style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>עבודה בשישי</label>
              </div>

              {/* Trainee */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="modal-isTrainee"
                  checked={formData.isTrainee || false}
                  onChange={(e) => setFormData({...formData, isTrainee: e.target.checked})}
                  style={{ width: 18, height: 18, accentColor: '#c17f3b' }}
                />
                <label htmlFor="modal-isTrainee" style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>מתלמדת (בהכשרה)</label>
              </div>

              {/* Shift Type */}
              <div>
                <label style={labelStyle}>סוג משמרת:</label>
                <select
                  value={formData.shiftType || 'הכל'}
                  onChange={(e) => setFormData({...formData, shiftType: e.target.value as any})}
                  style={selectStyle}
                >
                  <option>הכל</option>
                  <option>בוקר</option>
                  <option>ערב</option>
                  <option>אמצע</option>
                </select>
              </div>

              {/* Date Range */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={labelStyle}>זמין מ:</label>
                  <input
                    type="date"
                    value={formData.availableFromDate || ''}
                    onChange={(e) => setFormData({...formData, availableFromDate: e.target.value})}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>זמין עד:</label>
                  <input
                    type="date"
                    value={formData.availableToDate || ''}
                    onChange={(e) => setFormData({...formData, availableToDate: e.target.value})}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* Fixed Shifts in Modal */}
            <div style={{ marginTop: 14, borderTop: '1px solid #f0ebe3', paddingTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#0C447C' }}>
                  משמרות קבועות {((formData.fixedShifts as FixedShift[])?.length || 0) > 0 && `(${(formData.fixedShifts as FixedShift[])!.length})`}
                </label>
                <button
                  onClick={() => {
                    const newFs: FixedShift = { day: 'ראשון', shift: 'בוקר', arrivalTime: '07:00', departureTime: '14:00' };
                    setFormData({ ...formData, fixedShifts: [...((formData.fixedShifts as FixedShift[]) || []), newFs] });
                  }}
                  style={{ fontSize: 11, padding: '2px 8px', background: '#E6F1FB', color: '#0C447C', border: '1px solid #B3D4F0', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                >
                  + הוסף
                </button>
              </div>
              {((formData.fixedShifts as FixedShift[]) || []).map((fs, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                  <select value={fs.day} onChange={e => {
                    const arr = [...((formData.fixedShifts as FixedShift[]) || [])];
                    arr[idx] = { ...arr[idx], day: e.target.value };
                    if (e.target.value === 'שישי') { arr[idx].shift = 'בוקר'; arr[idx].arrivalTime = '07:00'; arr[idx].departureTime = '14:00'; }
                    setFormData({ ...formData, fixedShifts: arr });
                  }} style={{ fontSize: 11, padding: '3px 4px', borderRadius: 4, border: '1px solid #e8e0d4', width: 60 }}>
                    {dayOptions.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select value={fs.shift} onChange={e => {
                    const arr = [...((formData.fixedShifts as FixedShift[]) || [])];
                    arr[idx] = { ...arr[idx], shift: e.target.value, arrivalTime: e.target.value === 'בוקר' ? '07:00' : '14:00', departureTime: e.target.value === 'בוקר' ? '14:00' : '21:00' };
                    setFormData({ ...formData, fixedShifts: arr });
                  }} style={{ fontSize: 11, padding: '3px 4px', borderRadius: 4, border: '1px solid #e8e0d4', width: 50 }}>
                    {(fs.day === 'שישי' ? ['בוקר'] : shiftTypeOptions).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input type="time" value={fs.arrivalTime} onChange={e => {
                    const arr = [...((formData.fixedShifts as FixedShift[]) || [])];
                    arr[idx] = { ...arr[idx], arrivalTime: e.target.value };
                    setFormData({ ...formData, fixedShifts: arr });
                  }} style={{ fontSize: 11, padding: '3px 2px', borderRadius: 4, border: '1px solid #e8e0d4', width: 70 }} />
                  <input type="time" value={fs.departureTime} onChange={e => {
                    const arr = [...((formData.fixedShifts as FixedShift[]) || [])];
                    arr[idx] = { ...arr[idx], departureTime: e.target.value };
                    setFormData({ ...formData, fixedShifts: arr });
                  }} style={{ fontSize: 11, padding: '3px 2px', borderRadius: 4, border: '1px solid #e8e0d4', width: 70 }} />
                  <button onClick={() => {
                    const arr = ((formData.fixedShifts as FixedShift[]) || []).filter((_, i) => i !== idx);
                    setFormData({ ...formData, fixedShifts: arr });
                  }} style={{ fontSize: 12, background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '0 4px', fontWeight: 700 }}>✕</button>
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button
                onClick={handleSave}
                style={{
                  flex: 1,
                  padding: '8px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  background: '#1a4a2e',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                {isEditMode ? 'שמור שינויים' : 'שמור'}
              </button>
              <button
                onClick={closeModal}
                style={{
                  flex: 1,
                  padding: '8px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  background: '#f5f0e8',
                  color: '#475569',
                  border: '1px solid #e8e0d4',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
