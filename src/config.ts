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
      // Check if running from a local file URL or remotely
      const isLocalFile = import.meta.url.startsWith('file:')
      const isJsrPackage = import.meta.url.includes('jsr.io') ||
        import.meta.url.includes('@deno-kit/kit')

      // Get the absolute path of this file
      const kitDir = isLocalFile
        ? fromFileUrl(new URL('.', import.meta.url))
        : join(Deno.cwd(), 'src')

      // Get command-line arguments
      const kitArgs = Deno.args

      // Get full command line arguments minus the file path
      // In Deno, Deno.args doesn't include the script name, so we don't need to remove it
      const projectArgs = Deno.args

      // Get the project directory (one level up from kitDir)
      const projectDir = isLocalFile
        ? fromFileUrl(new URL('..', import.meta.url))
        : Deno.cwd()

      // Load environment variables from .env file
      const env = await load()

      // Define the templates directory path
      // Use DENO_KIT_TEMPLATES_DIR if set, otherwise default to kit/templates
      let templatesDir: string

      const envTemplatesDir = Deno.env.get('DENO_KIT_TEMPLATES_DIR')
      if (envTemplatesDir) {
        templatesDir = envTemplatesDir
      } else if (isJsrPackage) {
        // When running from JSR package, use templates from the package source
        const moduleVersion =
          import.meta.url.match(/@deno-kit\/kit\/(\d+\.\d+\.\d+)/)?.[1] ||
          '0.0.2'
        templatesDir =
          `https://jsr.io/@deno-kit/kit/${moduleVersion}/src/templates`
      } else {
        templatesDir = join(kitDir, 'templates')
      }

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
