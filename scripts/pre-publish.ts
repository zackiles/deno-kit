#!/usr/bin/env -S deno run --allow-run --allow-read --allow-write

/**
 * @module scripts/pre-publish
 * Pre-publish script to run format, check, and lint tasks.
 * Ensures code quality before publishing.
 */

import * as path from '@std/path'

async function runCommand(cmd: string, args: string[]) {
  console.log(`\nRunning: ${cmd} ${args.join(' ')}`)
  // Only get the code when stdio is inherited
  const { code } = await new Deno.Command(cmd, {
    args,
    stdout: 'inherit', // Stream output directly
    stderr: 'inherit', // Stream errors directly
  }).output()

  if (code !== 0) {
    console.error(`
❌ Command failed: ${cmd} ${args.join(' ')}`)
    Deno.exit(code)
  }
  console.log(`✅ Command succeeded: ${cmd} ${args.join(' ')}`)
}

try {
  // 1. Format code (respects deno.jsonc fmt includes/excludes)
  await runCommand('deno', ['fmt'])

  // 2. Check code (explicitly exclude templates, respects deno.jsonc compilerOptions)
  //   We list relevant top-level dirs/files excluding templates
  const checkPaths: string[] = []
  const srcDir = 'src'
  for await (const entry of Deno.readDir(srcDir)) {
    if (entry.name !== 'templates') {
      checkPaths.push(path.join(srcDir, entry.name))
    }
  }
  // Add other relevant top-level files/dirs if needed
  checkPaths.push('scripts', 'test')

  await runCommand('deno', ['check', '-r', '--quiet', ...checkPaths])

  // 3. Lint code (respects deno.jsonc lint includes/excludes)
  await runCommand('deno', ['lint'])

  console.log('\nPre-publish checks passed successfully!')
  Deno.exit(0)
} catch (error) {
  console.error('\nAn unexpected error occurred during pre-publish checks:', error)
  Deno.exit(1)
}
