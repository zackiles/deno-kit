#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import type { CommandDefinition, CommandOptions } from '../types.ts'
import { getPackageInfo } from '../utils/package-info.ts'
import logger from '../utils/logger.ts'
import loadConfig from '../config.ts'

const config = await loadConfig()

const commandDefinition: CommandDefinition = {
  name: 'version',
  command: displayVersion,
  description: 'Display the package version',
}

async function displayVersion({ args }: CommandOptions): Promise<void> {
  try {
    const packageInfo = await getPackageInfo()
    const version = packageInfo.version || 'unknown'
    logger.print(version)
  } catch (error) {
    logger.error('Failed to retrieve version information:', error.message)
    Deno.exit(1)
  }
}

if (import.meta.main) {
  const args: Args = parseArgs(Deno.args, commandDefinition.options)
  await commandDefinition.command({ args, routes: [commandDefinition] })
}

export default commandDefinition
