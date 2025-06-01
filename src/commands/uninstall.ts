/**
 * IMPORTANT: This file is a template for creating new commands.
 * It is not a real command and will not be executed.
 *
 * To create a new command, copy this file and rename it to the desired name.
 * Then, implement the command logic in the `command` function.
 */
import { deleteSelf } from '../utils/delete-self.ts'
import type { CommandRouteDefinition } from '../utils/command-router.ts'

const commandRoute: CommandRouteDefinition = {
  name: 'uninstall',
  command: command,
  description: 'Uninstall Deno-Kit',
  options: {},
}

async function command(): Promise<void> {
  await deleteSelf()
}

export default commandRoute
