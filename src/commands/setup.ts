#!/usr/bin/env -S deno run -A

import { parseArgs } from '@std/cli'
import type { Args } from '@std/cli'
import logger from '../utils/logger.ts'
import { getPackageForPath } from '../utils/package-info.ts'
import { create, isConfigFile, load, type WorkspaceConfigFile } from '../workspace.ts'
import type { CommandDefinition } from '../types.ts'
import type { Workspace } from '../workspace.ts'

const commandDefinition: CommandDefinition = {
  name: 'setup',
  command: command,
  description: 'Setup a new workspace for Deno-Kit',
  options: {
    string: ['workspace'],
    default: { 'workspace': Deno.cwd() },
  },
}

async function ensureNewWorkspace(workspace: string) {
  const workspaceConfigFile = await getPackageForPath(workspace, {
    packageConfigFiles: ['kit.json'],
  })
  if (workspaceConfigFile) {
    throw new Error('A workspace already exists. Remove the kit.json file and rerun setup.')
  }
}

/**
 * Updates the project's Cursor AI configuration by executing the installation script
 *
 * @param {Args} args - Command line arguments
 * @param {Workspace} workspace - Optional workspace instance
 * @returns {Promise<void>}
 */
async function command(args: Args, workspace?: Workspace): Promise<void> {
  try {
    await ensureNewWorkspace(args.workspace as string)
    logger.info('🔄 Setting up project...')
    logger.info(`options: ${JSON.stringify(args, null, 2)}`)
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error))
  }
}

if (import.meta.main) {
  const args = parseArgs(Deno.args, commandDefinition.options)
  await commandDefinition.command(args)
}

export default commandDefinition
