#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env

import { prompt, Prompt } from './src/terminal/prompts/prompt.ts'

async function testFlashingCursor() {
  console.log('Testing flashing cursor in prompts...\n')

  const name = await prompt.ask(Prompt.text({
    message: 'What is your name?',
    placeholder: 'Enter your full name',
    name: 'name'
  }))

  console.log(`Hello, ${name}!\n`)

  const items = await prompt.ask(Prompt.select({
    message: 'Select your favorite language',
    searchable: true,
    options: [
      { value: 'js', label: 'JavaScript' },
      { value: 'ts', label: 'TypeScript' },
      { value: 'py', label: 'Python' },
      { value: 'rs', label: 'Rust' },
      { value: 'go', label: 'Go' },
      { value: 'cpp', label: 'C++' },
    ],
    name: 'language'
  }))

  console.log(`You selected: ${items}`)

  const password = await prompt.ask(Prompt.password({
    message: 'Enter a test password',
    name: 'password'
  })) as string

  console.log(`Password length: ${password.length}`)
}

if (import.meta.main) {
  await testFlashingCursor()
}
