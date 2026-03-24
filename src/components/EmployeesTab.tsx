import { useState } from 'react';
import type { Employee } from '../data/employees';

interface EmployeesTabProps {
  employees: Employee[];
  onUpdate: (employees: Employee[]) => void;
}

export function EmployeesTab({ employees, onUpdate }: EmployeesTabProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmployee, setNewEmployee] = useState<Partial<Employee>>({
    name: '',
    shiftsPerWeek: 3,
    friday: false,
    shiftType: 'הכל',
    availableFrom: '',
    availableTo: '',
    availableFromDate: '',
    availableToDate: '',
  });
  const shiftOptions = Array.from({ length: 13 }, (_, i) => i); // 0..12

  const handleUpdate = (id: number, field: keyof Employee, value: any) => {
    onUpdate(employees.map(emp =>
      emp.id === id ? { ...emp, [field]: value } : emp
    ));
  };

  const handleAddEmployee = () => {
    if (!newEmployee.name?.trim()) {
      alert('אנא הזן שם עובדת');
      return;
    }
    const newId = Math.max(...employees.map(e => e.id), 0) + 1;
    const employee: Employee = {
      id: newId,
      name: newEmployee.name,
      shiftsPerWeek: newEmployee.shiftsPerWeek || 3,
      friday: newEmployee.friday || false,
      shiftType: newEmployee.shiftType || 'הכל',
      availableFrom: '',
      availableTo: '',
      availableFromDate: newEmployee.availableFromDate || '',
      availableToDate: newEmployee.availableToDate || '',
      fairnessHistory: [],
      flexibilityHistory: [],
    };
    onUpdate([...employees, employee]);
    setShowAddForm(false);
    resetNewEmployee();
  };

  const resetNewEmployee = () => {
    setNewEmployee({
      name: '',
      shiftsPerWeek: 3,
      friday: false,
      shiftType: 'הכל',
      availableFrom: '',
      availableTo: '',
      availableFromDate: '',
      availableToDate: '',
    });
  };

  const handleCancelAdd = () => {
    setShowAddForm(false);
    resetNewEmployee();
  };

  void editingId;
  void setEditingId;

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid #e8e0d4', borderRadius: 6 };
  const selectStyle: React.CSSProperties = { ...inputStyle };

  return (
    <div dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1a4a2e' }}>עובדות</h2>
        <button
          onClick={() => setShowAddForm(true)}
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

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
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

      {/* Add Employee Modal */}
      {showAddForm && (
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
              onClick={handleCancelAdd}
              style={{
                position: 'absolute', right: 12, top: 12,
                width: 28, height: 28, borderRadius: '50%', background: '#f5f0e8',
                border: 'none', cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b',
              }}
            >
              ✕
            </button>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a4a2e', marginBottom: 20, marginTop: 0 }}>הוסף עובדת חדשה</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Name */}
              <div>
                <label style={labelStyle}>שם:</label>
                <input
                  type="text"
                  value={newEmployee.name || ''}
                  onChange={(e) => setNewEmployee({...newEmployee, name: e.target.value})}
                  placeholder="הזן שם עובדת"
                  style={inputStyle}
                />
              </div>

              {/* Shifts Per Week */}
              <div>
                <label style={labelStyle}>מספר משמרות בשבוע:</label>
                <select
                  value={newEmployee.shiftsPerWeek || 3}
                  onChange={(e) => setNewEmployee({...newEmployee, shiftsPerWeek: parseInt(e.target.value)})}
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
                  id="friday"
                  checked={newEmployee.friday || false}
                  onChange={(e) => setNewEmployee({...newEmployee, friday: e.target.checked})}
                  style={{ width: 18, height: 18, accentColor: '#4a7c59' }}
                />
                <label htmlFor="friday" style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>עבודה בשישי</label>
              </div>

              {/* Shift Type */}
              <div>
                <label style={labelStyle}>סוג משמרת:</label>
                <select
                  value={newEmployee.shiftType || 'הכל'}
                  onChange={(e) => setNewEmployee({...newEmployee, shiftType: e.target.value as any})}
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
                    value={newEmployee.availableFromDate || ''}
                    onChange={(e) => setNewEmployee({...newEmployee, availableFromDate: e.target.value})}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>זמין עד:</label>
                  <input
                    type="date"
                    value={newEmployee.availableToDate || ''}
                    onChange={(e) => setNewEmployee({...newEmployee, availableToDate: e.target.value})}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button
                onClick={handleAddEmployee}
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
                שמור
              </button>
              <button
                onClick={handleCancelAdd}
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
