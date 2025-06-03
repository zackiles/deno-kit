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
