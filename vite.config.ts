/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    // Only run Vitest unit tests — Playwright specs (*.spec.ts) are excluded.
    include: ['tests/unit/**/*.test.ts'],
    reporters: ['verbose', './tests/unit/results-reporter.ts'],
  },
})
