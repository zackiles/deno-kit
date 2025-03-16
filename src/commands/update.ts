#!/usr/bin/env -S deno run --allow-all

import { parseArgs as parse } from '@std/cli'
import { setupOrUpdateCursorConfig } from '../utils/cursor-config.ts'

interface UpdateOptions {
  /** Whether to install cursor rules */
  installCursorRules?: boolean
  /** Workspace directory to operate in */
  workspace?: string
}

/**
 * Updates the project's Cursor AI configuration by executing the installation script
 *
 * @param {UpdateOptions} options - Configuration options
 * @returns {Promise<void>}
 */
async function update(options: UpdateOptions = {}): Promise<void> {
  try {
    // Run cursor setup if enabled (default to true)
    if (options.installCursorRules !== false) {
      console.log('🔄 Updating Cursor AI configuration...')
      const success = await setupOrUpdateCursorConfig(options.workspace)
      if (success) {
        console.log('✅ Successfully installed Cursor AI rules')
      } else {
        console.warn('⚠️ Failed to install Cursor AI rules')
      }
    }
  } catch (error) {
    console.error(
      '❌ Error updating cursor configuration:',
      error instanceof Error ? error.message : String(error),
    )
  }
}

if (import.meta.main) {
  const flags = parse(Deno.args, {
    boolean: ['install-cursor-rules'],
    string: ['workspace'],
    default: { 'install-cursor-rules': true },
  })

  await update({
    installCursorRules: flags['install-cursor-rules'],
    workspace: flags.workspace,
  })
}

export { update }
export type { UpdateOptions }
