import { prompt } from '../terminal/mod.ts'
import { terminal } from '../terminal/mod.ts'
import { getConfig } from '../config.ts'

const config = await getConfig()

const EDITORS = [
  { name: 'Cursor', cmd: 'cursor' },
  { name: 'VS Code', cmd: 'code' },
  { name: 'Windsurf', cmd: 'windsurf' },
] as const

const log = {
  debug: (msg: string) => {
    if (terminal.started) {
      terminal.debug(msg)
    } else {
      if (config.DENO_KIT_ENV !== 'production') {
        console.debug(msg)
      }
    }
  },
}

const hasCommand = async (cmd: string) => {
  const isWindows = Deno.build.os === 'windows'
  const whichCmd = isWindows ? 'where' : 'which'

  try {
    const result = await new Deno.Command(whichCmd, {
      args: [cmd],
      stdout: 'null',
      stderr: 'null',
    }).output()
    return result.success
  } catch {
    return false
  }
}

const getAvailableEditors = async () => {
  const available = await Promise.all(
    EDITORS.map(async ({ name, cmd }) => {
      const isAvailable = await hasCommand(cmd)
      log.debug(
        `Editor ${name} (${cmd}): ${isAvailable ? 'detected' : 'not found'}`,
      )
      return {
        name,
        cmd,
        available: isAvailable,
      }
    }),
  )
  return available.filter(({ available }) => available)
}

const promptEditor = async (editors: Array<{ name: string; cmd: string }>) => {
  const options = [
    ...editors.map(({ name }) => ({ value: name, label: name })),
    { value: 'Skip', label: 'Skip' },
  ]

  const choice = await prompt.ask({
    message: 'Open project in editor?',
    type: 'select',
    options,
    clearBefore: false,
    clearAfter: false,
  })

  if (choice === 'Skip') return null

  const selectedEditor = editors.find(({ name }) => name === choice)
  return selectedEditor ? selectedEditor.cmd : null
}

const openEditor = async (cmd: string, path: string) => {
  // IMPORTANT: In test mode, don't open the editor
  if (config.DENO_KIT_ENV === 'test') return true

  const process = new Deno.Command(cmd, {
    args: [path],
    stdout: 'inherit',
    stderr: 'inherit',
  }).spawn()

  // We only wait briefly to check if the process started successfully
  try {
    const status = await Promise.race([
      process.status,
      new Promise<Deno.CommandStatus>((resolve) =>
        setTimeout(
          () => resolve({ success: true, code: 0, signal: null }),
          2000,
        )
      ),
    ])
    return status.success
  } catch {
    return false
  }
}

export const ide = {
  async openFolder(path: string) {
    const editors = await getAvailableEditors()
    const selectedEditorCmd = await promptEditor(editors)

    if (!selectedEditorCmd) return true

    return await openEditor(selectedEditorCmd, path)
  },
}
