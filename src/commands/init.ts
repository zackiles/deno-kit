import {
  create as createWorkspace,
  type Workspace,
  type WorkspaceWithGit,
} from '../workspace/index.ts'
import type { CommandRouteDefinition } from '../utils/command-router.ts'
import terminal from '../utils/terminal.ts'
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
    Deno.exit(1)
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
  await ensureValidWorkspacePath() // CAUTION: Things can go poorly for us if we don't call ensureValidWorkspacePath(), like destroying the current codebase.

  terminal.print(dedent`
    ${bold('~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~')}
    ${bold('*')}  ${
    bold('Workspace:')
  }                                               ${bold('*')}
    ${bold('~')}  ${
    config.DENO_KIT_WORKSPACE_PATH.length > 59
      ? `${dim(config.DENO_KIT_WORKSPACE_PATH.substring(0, 53))}...`
      : dim(config.DENO_KIT_WORKSPACE_PATH.padEnd(53))
  } ${bold('~')}
    ${bold('~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~')}
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
    terminal.print(
      `Initialized git repo at ${workspace.path}`,
    )
    if (config.DENO_KIT_ENV !== 'test') {
      const isPublic = templateValues.GITHUB_REPO_PUBLIC === 'true'
      const push = templateValues.CREATE_GITHUB_REPO === 'true'

      if (push) {
        const { path, repoUrl } = await (workspace as WorkspaceWithGit)
          .createGithubRepo({
            name: templateValues.PROJECT_NAME,
            isPublic,
            push,
          })
        terminal.print(
          `${
            templateValues.GITHUB_REPO_PUBLIC ? 'Public' : 'Private'
          } GitHub repo created for ${path} and pushed to ${repoUrl}`,
        )
      }
    }

    terminal.print(
      `✅ Setup ${templateValues.PROJECT_TYPE} project in ${config.DENO_KIT_WORKSPACE_PATH}`,
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
