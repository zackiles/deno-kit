import {
  create as createWorkspace,
  type Workspace,
  type WorkspaceWithGit,
} from '../workspace/index.ts'
import type { CommandRouteDefinition } from '../utils/command-router.ts'
import terminal, { purpleGradient } from '../terminal/mod.ts'
//import { setupOrUpdateCursorConfig } from '../utils/cursor-config.ts'
import { normalize } from '@std/path'
import { ensureDir, exists } from '@std/fs'
import { realPath } from '@std/fs/unstable-real-path'
import getTemplateValues from '../template-values.ts'
import { getConfig } from '../config.ts'
import { join } from '@std/path'
import { compress, decompress } from '../utils/compression.ts'
import type { DenoKitConfig } from '../types.ts'
import { dedent } from '@std/text/unstable-dedent'
import { bold, dim, green } from '@std/fmt/colors'

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

const ensureValidWorkspacePath = async () => {
  // TODO: Likely a better way and a different place to make this check
  // IMPORTANT: I've blown out unstaged changes enough times with destructive
  // actions running the deno-kit CLI by mistake in this repo that I'm going
  // out-of-my-way to make sure that {workspace path != CLI path}.
  config.DENO_KIT_WORKSPACE_PATH = await realPath(
    normalize(config.DENO_KIT_WORKSPACE_PATH),
  )
  if (config.DENO_KIT_WORKSPACE_PATH === config.DENO_KIT_PATH) {
    terminal.error(
      'Workspace path cannot be the same as the Deno-Kit binary path',
      {
        workspacePath: config.DENO_KIT_WORKSPACE_PATH,
        kitPath: config.DENO_KIT_PATH,
      },
    )
    const { gracefulShutdown } = await import('../utils/graceful-shutdown.ts')
    await gracefulShutdown.shutdown(true, 1)
    return
  }

  await ensureDir(config.DENO_KIT_WORKSPACE_PATH)

  const potentialConfigFilePath = join(
    config.DENO_KIT_WORKSPACE_PATH,
    config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME,
  )
  if (await exists(potentialConfigFilePath)) {
    throw new Error(
      `A Deno-Kit project already exists at ${potentialConfigFilePath}`,
    )
  }
}

/**
 * Initializes a new Deno-Kit project
 */
async function command(): Promise<void> {
  if (config.DENO_KIT_ENV !== 'test' && Deno.stdin.isTerminal() === false) {
    throw new Error('Deno-Kit init command only supports interactive terminals')
  }
  await ensureValidWorkspacePath() // CAUTION: Things can go poorly for us if we don't call ensureValidWorkspacePath(), like destroying the current codebase.
  // Create workspace display box
  const totalWidth = 61
  const titleTextPlain = ' Workspace '
  const titleTextColored = bold(green(titleTextPlain))
  const remainingWidth = totalWidth - titleTextPlain.length - 2
  const leftPadding = Math.floor(remainingWidth / 2)
  const rightPadding = remainingWidth - leftPadding
  const titleLine = `${'─'.repeat(leftPadding)}${titleTextColored}${
    '─'.repeat(rightPadding)
  }`

  const workspacePath = config.DENO_KIT_WORKSPACE_PATH.length > 53
    ? `...${
      config.DENO_KIT_WORKSPACE_PATH.substring(
        config.DENO_KIT_WORKSPACE_PATH.length - 50,
      )
    }`
    : config.DENO_KIT_WORKSPACE_PATH

  const pathPadding = Math.max(0, totalWidth - workspacePath.length - 4)

  terminal.print(dedent`
    ╭${titleLine}╮
    │ ${dim(workspacePath)}${' '.repeat(pathPadding)} │
    ╰${'─'.repeat(totalWidth - 2)}╯
    `)

  let workspace: Workspace
  let temporaryTemplatesPath = ''
  const templateValues = await getTemplateValues()

  try {
    temporaryTemplatesPath = await Deno.makeTempDir({
      prefix: 'dk-templates-',
    })
    await prepareTemplates(temporaryTemplatesPath)
    terminal.debug(
      `Templates prepared successfully in: ${temporaryTemplatesPath}`,
    )
    terminal.debug(`Creating workspace in: ${config.DENO_KIT_WORKSPACE_PATH}`)
    workspace = await createWorkspace({
      name: templateValues.PACKAGE_NAME,
      workspacePath: config.DENO_KIT_WORKSPACE_PATH,
      templatesPath: temporaryTemplatesPath,
      logger: terminal,
      configFileName: config.DENO_KIT_WORKSPACE_CONFIG_FILE_NAME,
    })

    await workspace.compileAndWriteTemplates(templateValues)
    await workspace.save()

    await workspace.runCommand('deno', ['install'], {
      cwd: workspace.path,
    })

    // Set up Cursor config (in all environments)
    // TODO: fix the installer and build in the cursor-config project so we can re-enable it here
    //await setupOrUpdateCursorConfig(workspace.path)

    await (workspace as WorkspaceWithGit).createLocalRepo({
      name: templateValues.PROJECT_NAME,
      commitMessage: 'chore: initial commit',
    })
    terminal.debug(
      `Initialized git repo at ${workspace.path}`,
    )
    if (config.DENO_KIT_ENV !== 'test') {
      const isPublic = templateValues.GITHUB_REPO_PUBLIC === 'true'
      const push = templateValues.CREATE_GITHUB_REPO === 'true'

      if (push) {
        const { repoUrl } = await (workspace as WorkspaceWithGit)
          .createGithubRepo({
            name: templateValues.PROJECT_NAME,
            isPublic,
            push,
          })
        terminal.print(
          purpleGradient('[SUCCESS]'),
          `${isPublic ? '🌍 Public' : '🔐 Private'} GitHub repo created for ${
            dim(templateValues.PROJECT_NAME)
          } @ ${dim(repoUrl)}`,
        )

        // IMPORTANT: In development, immediately remove the GitHub repo for testing purposes
        if (config.DENO_KIT_ENV === 'development') {
          try {
            const { repoName } = await (workspace as WorkspaceWithGit)
              .removeGithubRepo({
                name: templateValues.PROJECT_NAME,
                confirm: true,
              })
            terminal.debug(
              `Development mode: GitHub repo '${repoName}' was created and immediately deleted for testing purposes`,
            )
          } catch (error) {
            terminal.error(
              `Failed to delete GitHub repo '${templateValues.PROJECT_NAME}' in development mode`,
              {
                error: error instanceof Error ? error.message : String(error),
                repoName: templateValues.PROJECT_NAME,
              },
            )
            // IMPORTANT:Don't re-throw the error - just log it and continue
          }
        }
      }
    }
    terminal.clear()
    terminal.print(
      `🎉 ${bold(green('Success!'))} ${bold('Setup')} ${
        bold(templateValues.PROJECT_TYPE.toUpperCase())
      } ${bold('project in')} ${dim(config.DENO_KIT_WORKSPACE_PATH)}`,
    )
  } finally {
    if (temporaryTemplatesPath) {
      await Deno.remove(temporaryTemplatesPath, { recursive: true })
        .catch((err) =>
          terminal.warn(
            `Cleanup failed: ${err instanceof Error ? err.message : err}`,
          )
        )
    }
  }

  /**
   * Prepares templates based on the current environment
   * How this works: takes user's selected project type and decompresses the templates from the shared/ and the project type's folder
   * into the templates directory. This essentially merges shared templates with the project-specific templates to create a complete project.
   *
   * If the user is in a development environment, it will compress the templates from the templates directory into a zip file and decompress it into the templates directory.
   *
   * If the user is in a production environment, it will decompress the templates from the remote URL into the templates directory.
   */
  async function prepareTemplates(
    templatesDir: string,
  ): Promise<void> {
    terminal.debug(
      `Using configured templates path: ${config.DENO_KIT_TEMPLATES_PATH}`,
    )

    // Get the user-selected project type for filtering
    const selectedProjectType = templateValues.PROJECT_TYPE

    // Function to decompress templates from a source to the templates directory
    const decompressTemplates = async (source: string, isUrl = false) => {
      terminal.debug(
        `Decompressing templates from ${isUrl ? 'URL' : 'file'}: ${source}`,
      )

      const transformTemplatePath = (
        archiveMemberPath: string,
      ): string | null => {
        // Allow files from 'shared/'
        if (archiveMemberPath.startsWith('shared/')) {
          // Remove 'shared/' prefix and normalize for platform
          const relativePath = archiveMemberPath.substring('shared/'.length)
          const newPath = normalize(relativePath)
          terminal.debug(
            `Transforming shared path: ${archiveMemberPath} -> ${newPath}`,
          )
          return newPath
        }

        // Allow files from the selected project type's folder
        const projectTypePrefix = `${selectedProjectType}/`
        if (archiveMemberPath.startsWith(projectTypePrefix)) {
          // Remove the selected project type's prefix and normalize for platform
          const relativePath = archiveMemberPath.substring(
            projectTypePrefix.length,
          )
          const newPath = normalize(relativePath)
          terminal.debug(
            `Transforming project type path: ${archiveMemberPath} -> ${newPath}`,
          )
          return newPath
        }

        // For any other file/path, return null to signal it should be skipped
        terminal.debug(
          `Skipping path: ${archiveMemberPath} (does not match shared/ or ${projectTypePrefix})`,
        )
        return null
      }

      await decompress(source, templatesDir, {
        isUrl,
        transformPath: transformTemplatePath,
      })
    }

    const prepareLocalTemplates = async () => {
      const zipPath = join(
        config.DENO_KIT_PATH,
        'bin',
        `templates-${config.DENO_KIT_ENV}.zip`,
      )

      try {
        terminal.debug(
          `Compressing local templates from: ${config.DENO_KIT_TEMPLATES_PATH}`,
        )
        await compress(config.DENO_KIT_TEMPLATES_PATH, zipPath)

        if (!await exists(zipPath)) {
          throw new Error(`Templates zip file not found: ${zipPath}`)
        }
        await decompressTemplates(zipPath, false)
      } finally {
        // Clean up the temporary zip file
        await Deno.remove(zipPath)
          .catch((err) =>
            terminal.warn(
              `Failed to clean up templates zip: ${
                err instanceof Error ? err.message : err
              }`,
            )
          )
      }
    }

    if (config.DENO_KIT_ENV === 'production') {
      await decompressTemplates(
        // IMPORTANT: In production this is a URL to the versioned templates for this release
        config.DENO_KIT_TEMPLATES_PATH,
        true,
      )
    } else if (
      config.DENO_KIT_ENV === 'test' || config.DENO_KIT_ENV === 'development'
    ) {
      await prepareLocalTemplates()
    } else {
      throw new Error(
        `Template management for environment ${config.DENO_KIT_ENV} not implemented`,
      )
    }
  }
}

export default commandRoute
