#!/usr/bin/env deno run --allow-read --allow-write --allow-env

import { prompt, Prompt } from './src/terminal/mod.ts'
import * as debug from './src/terminal/debugger.ts'

console.log('🎯 Testing Interactive Prompt System')
console.log('✨ Features:')
console.log('  • Use ↑/↓ arrow keys to navigate')
console.log('  • Type to search options')
console.log('  • Backspace to delete search')
console.log('  • Enter to select, Esc to cancel')
console.log('  • Mouse click to select')
console.log('')

try {
  // Test searchable select prompt
  const framework = await prompt.ask(Prompt.multiselect({
    message: 'Select project features (use Space to select, Enter to submit)',
    name: 'features',
    searchable: true,
    options: [
      { value: 'react', label: 'React', description: 'A JavaScript library for building user interfaces' },
      { value: 'vue', label: 'Vue.js', description: 'An approachable, performant and versatile framework' },
      { value: 'svelte', label: 'Svelte', description: 'Cybernetically enhanced web apps' },
      { value: 'angular', label: 'Angular', description: 'Platform for building mobile and desktop web applications' },
      { value: 'solid', label: 'SolidJS', description: 'Simple and performant reactivity for building user interfaces' },
      { value: 'qwik', label: 'Qwik', description: 'The HTML-first framework' },
      { value: 'typescript', label: 'TypeScript', description: 'JavaScript with syntax for types' },
      { value: 'testing', label: 'Testing', description: 'Unit and integration testing setup' },
      { value: 'linting', label: 'ESLint', description: 'Code linting and formatting' },
      { value: 'docs', label: 'Documentation', description: 'Auto-generated API documentation' }
    ]
  }))

  console.log(`\n✅ You selected: ${Array.isArray(framework) ? framework.join(', ') : framework}`)
  console.log('🎉 Interactive search and selection works!')

} catch (error) {
  if (error instanceof Error && error.message === 'Prompt was cancelled') {
    console.log('\n👋 Demo cancelled by user')
  } else {
    console.error('❌ Error:', error)
  }
}
