import { describe, it, expect } from 'vitest'
import { calculateFairnessScore } from '../../src/utils/fairnessScore'
import type { Employee } from '../../src/data/employees'

function makeEmployee(fairnessHistory: { date: string; type: 1 | 2 }[]): Employee {
  return {
    id: 99,
    name: 'test',
    shiftsPerWeek: 4,
    fridayAvailability: 'always',
    shiftType: 'הכל',
    isTrainee: false,
    availableFrom: '08:00',
    availableTo: '20:00',
    availableFromDate: '',
    availableToDate: '',
    fairnessHistory,
    flexibilityHistory: [],
  }
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

describe('ציון צדק', () => {

  it('משמרת השבוע מקבלת 100% משקל', () => {
    const emp = makeEmployee([{ date: daysAgo(0), type: 1 }])
    const score = calculateFairnessScore(emp)
    expect(score).toBeGreaterThan(0)
  })

  it('משמרת מלפני 8 שבועות מקבלת משקל נמוך יותר', () => {
    const recent = calculateFairnessScore(makeEmployee([{ date: daysAgo(0), type: 1 }]))
    const old = calculateFairnessScore(makeEmployee([{ date: daysAgo(8 * 7), type: 1 }]))
    expect(recent).toBeGreaterThan(old)
  })

  it('משמרת מסוג 1 מקבלת 3 נקודות', () => {
    const score = calculateFairnessScore(makeEmployee([{ date: daysAgo(0), type: 1 }]))
    expect(score).toBe(3)
  })

  it('משמרת מסוג 2 מקבלת 1 נקודה', () => {
    const score = calculateFairnessScore(makeEmployee([{ date: daysAgo(0), type: 2 }]))
    expect(score).toBe(1)
  })

})
