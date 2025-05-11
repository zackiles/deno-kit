#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import type { CommandRouteDefinition, CommandRouteOptions } from '../utils/command-router.ts'
import logger from '../utils/logger.ts'
import loadConfig from '../config.ts'

const config = await loadConfig()

const commandRouteDefinition: CommandRouteDefinition = {
	name: 'help',
	command: command,
	description: 'Display help menu',
}

function command({ routes }: CommandRouteOptions): void {
	logger.print(`${config.PACKAGE_NAME} - ${config.PACKAGE_DESCRIPTION}

Usage:
  ${config.PROJECT_NAME} [command] [options]

Commands:
${routes.map((cmd) => `  ${cmd.name.padEnd(10)} ${cmd.description}`).join("\n")}`)
}

if (import.meta.main) {
	const args: Args = parseArgs(Deno.args)
	await commandRouteDefinition.command({ args, routes: [commandRouteDefinition] })
}

export { commandRouteDefinition, command }
export default commandRouteDefinition
