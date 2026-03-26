// קובץ זה מייצר דוח JSON אחרי הרצת הבדיקות
// Claude Code: אל תשנה את הקובץ הזה, רק צור אותו

import { writeFileSync } from 'fs'
import { join } from 'path'

function collectTasks(suite: any): any[] {
  const tasks: any[] = []
  if (suite.tasks) {
    for (const task of suite.tasks) {
      if (task.type === 'test' || task.type === 'custom') {
        tasks.push(task)
      } else if (task.tasks) {
        tasks.push(...collectTasks(task))
      }
    }
  }
  return tasks
}

export default class ResultsReporter {
  onTestRunEnd(testModules: any[]) {
    const results = {
      timestamp: new Date().toISOString(),
      passed: [] as string[],
      failed: [] as { name: string; error: string }[]
    }

    testModules.forEach((mod: any) => {
      const file = mod.task || mod
      const tasks = collectTasks(file)
      tasks.forEach((task: any) => {
        if (task.result?.state === 'pass') {
          results.passed.push(task.name)
        } else if (task.result?.state === 'fail') {
          results.failed.push({
            name: task.name,
            error: task.result?.errors?.[0]?.message || 'שגיאה לא ידועה'
          })
        }
      })
    })

    writeFileSync(join(process.cwd(), 'tests', 'unit-results.json'), JSON.stringify(results, null, 2))
    console.log('\n=== דוח בדיקות ===')
    console.log(`עברו: ${results.passed.length}`)
    console.log(`נכשלו: ${results.failed.length}`)
    if (results.failed.length > 0) {
      console.log('\nבאגים שנמצאו:')
      results.failed.forEach(f => console.log(`  ❌ ${f.name}: ${f.error}`))
    }
  }
}
