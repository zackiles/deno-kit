import { create as createWorkspace, type Workspace } from '../workspace/workspace.ts'
import type { CommandRouteDefinition } from '../utils/command-router.ts'
import logger from '../utils/logger.ts'
import { setupOrUpdateCursorConfig } from '../utils/cursor-config.ts'
import { ensureDir, exists } from '@std/fs'
import getTemplateValues from '../template-values.ts'
import { getConfig } from '../config.ts'
import { join } from '@std/path'
import { compress, decompress } from '../utils/compression.ts'
import type { DenoKitConfig } from '../types.ts'

// Load config and check for existing project
const config = await getConfig() as DenoKitConfig

const commandRoute: CommandRouteDefinition = {
  name: 'init',
  command: command,
  description: 'Create a new Deno-Kit project in the current or specified path',
  options: {
    unknown: () => true,
  },
}

/**
 * Initializes a new Deno-Kit project
 */
async function command(): Promise<void> {
  await ensureDir(config.DENO_KIT_WORKSPACE_PATH)
  logger.print(
    `Creating a new ${config.DENO_KIT_NAME} project in workspace: ${config.DENO_KIT_WORKSPACE_PATH}\n\n`,
  )
  logger.debug('Deno-Kit Config:', config)

  const configFilePath = join(
    config.DENO_KIT_WORKSPACE_PATH,
    config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME,
  )
  if (await exists(configFilePath)) {
    throw new Error(`A Deno-Kit project already exists at ${configFilePath}`)
  }

  let workspace: Workspace
  let temporaryTemplatesPath = ''
  const templateValues = await getTemplateValues()

  try {
    temporaryTemplatesPath = await Deno.makeTempDir({ prefix: 'deno-kit-templates-' })
    await prepareTemplates(temporaryTemplatesPath)
    logger.debug(`Templates prepared successfully in: ${temporaryTemplatesPath}`)
    logger.debug(`Creating workspace in: ${config.DENO_KIT_WORKSPACE_PATH}`)
    workspace = await createWorkspace({
      name: templateValues.PACKAGE_NAME,
      workspacePath: config.DENO_KIT_WORKSPACE_PATH,
      templatesPath: temporaryTemplatesPath,
      logger: logger,
      configFileName: config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME,
    })

    await workspace.compileAndWriteTemplates(templateValues)
    await workspace.save()

    await workspace.runCommand('deno', ['install'], {
      cwd: workspace.path,
    })

    // Set up Cursor config (in all environments)
    await setupOrUpdateCursorConfig(workspace.path)

    logger.info(
      `✅ Setup ${templateValues.PROJECT_TYPE} project in ${config.DENO_KIT_WORKSPACE_PATH}`,
    )
  } finally {
    if (temporaryTemplatesPath) {
      await Deno.remove(temporaryTemplatesPath, { recursive: true })
        .catch((err) => logger.warn(`Cleanup failed: ${err instanceof Error ? err.message : err}`))
    }
  }

  /**
   * Prepares templates based on the current environment
   */
  async function prepareTemplates(
    templatesDir: string,
  ): Promise<void> {
    logger.debug(`Using configured templates path: ${config.DENO_KIT_TEMPLATES_PATH}`)

    // Create transform path function for template handling
    const transformTemplatePath = (filename: string): string =>
      filename.startsWith('shared/')
        ? filename.slice(7) // 'shared/'.length
        : filename.match(new RegExp(`^(${config.DENO_KIT_PROJECT_TYPES.replace(/,/g, '|')})/(.+)`))
          ?.[2] ?? filename

    // Function to decompress templates from a source to the templates directory
    const decompressTemplates = async (source: string, isUrl = false) => {
      logger.debug(`Decompressing templates from ${isUrl ? 'URL' : 'file'}: ${source}`)
      await decompress(source, templatesDir, {
        isUrl,
        transformPath: transformTemplatePath,
      })
    }

    const prepareLocalTemplates = async () => {
      const zipPath = join(config.DENO_KIT_PATH, 'bin', `templates-${config.DENO_KIT_ENV}.zip`)

      try {
        logger.debug(`Compressing local templates from: ${config.DENO_KIT_TEMPLATES_PATH}`)
        await compress(config.DENO_KIT_TEMPLATES_PATH, zipPath)

        if (!await exists(zipPath)) throw new Error(`Templates zip file not found: ${zipPath}`)
        await decompressTemplates(zipPath, false)
      } finally {
        // Clean up the temporary zip file
        await Deno.remove(zipPath)
          .catch((err) =>
            logger.warn(
              `Failed to clean up templates zip: ${err instanceof Error ? err.message : err}`,
            )
          )
      }
    }

    const prepareRemoteTemplates = async () => {
      const version = await fetch(
        `https://api.github.com/repos/${config.DENO_KIT_GITHUB_REPO}/releases/latest`,
        { headers: { Accept: 'application/vnd.github.v3+json' } },
      )
        .then((res) => res.json())
        .then(({ tag_name }) => tag_name?.replace(/^v/, ''))

      if (!version) throw new Error('Could not determine latest version')

      await decompressTemplates(
        `https://github.com/${config.DENO_KIT_GITHUB_REPO}/releases/download/v${version}/templates.zip`,
        true,
      )
    }

    try {
      if (config.DENO_KIT_ENV === 'production') {
        await prepareRemoteTemplates()
      } else if (config.DENO_KIT_ENV === 'test' || config.DENO_KIT_ENV === 'development') {
        await prepareLocalTemplates()
      } else {
        throw new Error(
          `Template management for environment ${config.DENO_KIT_ENV} not implemented`,
        )
      }
    } catch (error) {
      logger.warn(
        `Failed to process templates: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw error
    }
  }
}

export default commandRoute
