import { fromFileUrl, join } from '@std/path'
import { load } from '@std/dotenv'

// Interface for our configuration
interface Config {
  kitDir: string
  kitArgs: string[]
  projectArgs: string[]
  projectDir: string
  env: Record<string, string>
  templatesDir: string
  backupsDir: string
}

// Singleton class
class ConfigSingleton {
  private static instance: ConfigSingleton | null = null
  private config: Config | null = null

  private constructor() {}

  public static getInstance(): ConfigSingleton {
    if (!ConfigSingleton.instance) {
      ConfigSingleton.instance = new ConfigSingleton()
    }
    return ConfigSingleton.instance
  }

  public async init(): Promise<void> {
    if (this.config) return

    try {
      // Get the absolute path of this file
      const kitDir = fromFileUrl(new URL('.', import.meta.url))

      // Get command-line arguments
      const kitArgs = Deno.args

      // Get full command line arguments minus the file path
      // In Deno, Deno.args doesn't include the script name, so we don't need to remove it
      const projectArgs = Deno.args

      // Get the project directory (one level up from kitDir)
      const projectDir = fromFileUrl(new URL('..', import.meta.url))

      // Load environment variables from .env file
      const env = await load()

      // Define the templates directory path
      // Use DENO_KIT_TEMPLATES_DIR if set, otherwise default to kit/templates
      const templatesDir = Deno.env.get('DENO_KIT_TEMPLATES_DIR') ||
        join(kitDir, 'templates')

      // Define the backups directory path within the workspace
      const workspaceDir = Deno.env.get('DENO_KIT_WORKSPACE') || Deno.cwd()
      const backupsDir = join(workspaceDir, '.deno-kit', 'backups')

      this.config = {
        kitDir,
        kitArgs,
        projectArgs,
        projectDir,
        templatesDir,
        backupsDir,
        env,
      }
    } catch (error) {
      console.error('Failed to initialize config:', error)
      throw error
    }
  }

  public getConfig(): Config {
    if (!this.config) {
      throw new Error('Config not initialized. Call init() first.')
    }
    return this.config
  }
}

// An async function that returns the initialized config
async function getConfig(): Promise<Config> {
  const instance = ConfigSingleton.getInstance()
  await instance.init()
  return instance.getConfig()
}

export { getConfig }
export default getConfig
