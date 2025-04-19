#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import type { CommandDefinition } from '../types.ts'
import { getPackageForPath } from '../utils/package-info.ts'
import logger from '../utils/logger.ts'
import loadConfig from '../config.ts'

const config = await loadConfig()

const commandDefinition: CommandDefinition = {
  name: 'remove',
  command: command,
  description: 'Remove Deno-Kit from the current workspace',
}

async function command(): Promise<void> {
  logger.debug(`Removing Deno-Kit from workspace: ${config.workspace}`)

  const packageInfo = await getPackageForPath(config.workspace, {
    packageConfigFiles: ['kit.json'],
  })

  if (packageInfo) {
    await Deno.remove(packageInfo)
    logger.info(`Removed Deno-Kit from workspace: ${config.workspace}`)
  } else {
    throw new Error(`Deno-Kit not found in workspace: ${config.workspace}`)
  }
}

if (import.meta.main) {
  const args: Args = parseArgs(Deno.args, commandDefinition.options)
  await commandDefinition.command({ args, routes: [commandDefinition] })
}

export default commandDefinition
