import type {
  CommandRouteDefinition,
  CommandRouteOptions,
} from '../utils/command-router.ts'
import printHelpMenu from '../utils/print-help-menu.ts'
import { getConfig } from '../config.ts'
import type { DenoKitConfig } from '../types.ts'

const config = await getConfig() as DenoKitConfig

const commandRoute: CommandRouteDefinition = {
  name: 'help',
  command: command,
  description: 'Display this help message',
}

function command({ routes = [] }: CommandRouteOptions): void {
  const maxCommandLength = Math.max(
    ...routes.map((cmd: CommandRouteDefinition) => cmd.name.length),
  )

  printHelpMenu({
    title: { text: `${config.DENO_KIT_NAME} - Usage:` },
    usage: {
      text: `  ${config.DENO_KIT_NAME.toLowerCase()} <command> [options]`,
    },
    section: { text: 'Commands:' },
  })

  for (const config of routes) {
    printHelpMenu({
      command: {
        command: config.name,
        description: config.description,
        padding: maxCommandLength,
      },
    })
  }

  printHelpMenu({
    note: {
      text: `If no command is provided, the "help" command will be executed.`,
    },
    workspace: { text: config.DENO_KIT_WORKSPACE_PATH },
  })
}

export default commandRoute
