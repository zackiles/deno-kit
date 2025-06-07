/**
 * @module setup-values
 * @description Utility module for gathering setup values from user input
 *
 * This module provides functions for collecting user input during the project setup process,
 * supporting both interactive prompts and automated testing through environment variables.
 */

import { basename } from '@std/path'
import { canParse } from '@std/semver'
import {
  bold,
  dim,
  green,
  greenGradient,
  prompt,
  terminal,
} from './terminal/mod.ts'
import type {
  SelectPromptConfig,
  TextPromptConfig,
} from './terminal/prompts/prompt.ts'
import {
  getGitUserEmail,
  getGitUserName,
  WorkspaceGit,
} from './workspace/index.ts'
import {
  extractProjectName,
  extractScope,
  isValidPackageName,
} from './utils/package-info.ts'
import type { TemplateValues } from './types.ts'
import { getConfig } from './config.ts'
import { toTitleCase } from './utils/formatting.ts'

const config = await getConfig()

type DerivedConfig = {
  derived: true
  getValue: (values: Record<string, string>) => string
}

type ExtendedTextPromptConfig = TextPromptConfig & {
  envKey?: string
  errorMessage?: string
}

type ExtendedSelectPromptConfig = SelectPromptConfig & {
  envKey?: string
}

type PromptItem =
  | ExtendedTextPromptConfig
  | ExtendedSelectPromptConfig
  | DerivedConfig

/**
 * Gets a template value from config using the DENO_KIT_TEMPLATE_ prefix
 */
const getTemplateValueFromConfig = (key: string): string | undefined => {
  const configKey = `DENO_KIT_TEMPLATE_${key}` as keyof typeof config
  return config[configKey]
}

const createAutoPromptConfig = async (context: Record<string, string>) => {
  if (config.DENO_KIT_ENV === 'test') {
    return false
  }

  const displayData = createPackageMetadataDisplay(context)
  for (const line of displayData) {
    terminal.print(line)
  }

  const response = await prompt.ask({
    message: 'Would you like to use this auto-configuration?',
    type: 'select',
    clearBefore: false,
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No! Let me edit it' },
    ],
    theme: {
      colors: {
        primary: (text: string) => bold(greenGradient(text)),
      },
    },
  })

  return response === 'yes'
}

const createPackageMetadataDisplay = (
  context: Record<string, string>,
): string[] => {
  const keyLabels = {
    PACKAGE_NAME: { emoji: '📦', label: 'PACKAGE' },
    PACKAGE_VERSION: { emoji: '📌', label: 'VERSION' },
    PACKAGE_AUTHOR_NAME: { emoji: '👤', label: 'AUTHOR' },
    PACKAGE_AUTHOR_EMAIL: { emoji: '📧', label: 'EMAIL' },
    PACKAGE_GITHUB_USER: { emoji: '🐙', label: 'USER' },
  }

  const filteredEntries = Object.entries(context)
    .filter(([key]) => key !== 'YEAR' && key !== 'PACKAGE_SCOPE')
    .filter(([key]) => keyLabels[key as keyof typeof keyLabels])
    .map(([key, value]) => {
      // Add github.com/ prefix to GitHub user if it exists and is not empty
      if (key === 'PACKAGE_GITHUB_USER' && value && value.trim() !== '') {
        return [key, `github.com/${value}`]
      }
      return [key, value]
    })

  // Match the width of the "Detected Configuration" box (67 chars total)
  const totalWidth = 61

  const lines: string[] = []

  // Calculate fixed width for left column
  const maxLabelLength = Math.max(
    ...Object.values(keyLabels).map(({ label }) => label.length + 4), // +4 for emoji + spaces
  )

  // Top border with title
  const titleTextPlain = ' Detected Configuration '
  const titleTextColored = bold(
    // reverse the array
    terminal.gradient(['#B14EFF', '#966FE6', '#7D63CA', '#3F3265'])(
      titleTextPlain,
    ),
  )
  const remainingWidth = totalWidth - titleTextPlain.length - 2 // -2 for corner characters, use plain text length
  const leftPadding = Math.floor(remainingWidth / 2)
  const rightPadding = remainingWidth - leftPadding
  const titleLine = `${'─'.repeat(leftPadding)}${titleTextColored}${
    '─'.repeat(rightPadding)
  }`
  lines.push(`╭${titleLine}╮`)

  // Content rows
  for (const [key, value] of filteredEntries) {
    const config = keyLabels[key as keyof typeof keyLabels]
    if (config) {
      const labelPlain = `${config.emoji}  ${config.label}`
      const labelColored = `${config.emoji}  ${bold(config.label)}`
      const labelPart = labelColored +
        ' '.repeat(maxLabelLength - labelPlain.length)

      const valueText = value.length > 35
        ? `${value.substring(0, 32)}...`
        : value
      const valuePart = dim(valueText)

      // Calculate exact spacing to match the box width (use plain length for calculation)
      const separator = ' │ '
      const usedSpace = maxLabelLength + separator.length + valueText.length +
        4 // 4 for borders and spaces
      const padding = Math.max(0, totalWidth - usedSpace)

      lines.push(
        `│ ${labelPart}${separator}${valuePart}${' '.repeat(padding)} │`,
      )
    }
  }

  // Bottom border
  lines.push(`╰${'─'.repeat(totalWidth - 2)}╯`)

  return lines
}

/**
 * Creates a prompt configuration with options for all template values
 */
function createPromptConfig(context: {
  PACKAGE_AUTHOR_NAME: string
  PACKAGE_AUTHOR_EMAIL: string
  PACKAGE_SCOPE: string
  PACKAGE_NAME: string
  PROJECT_NAME: string
  PACKAGE_GITHUB_USER: string
}): Record<string, PromptItem> {
  return {
    PACKAGE_NAME: {
      type: 'text',
      message: 'Package name (@scope/name)',
      defaultValue: context.PACKAGE_SCOPE
        ? `${context.PACKAGE_SCOPE}/${context.PROJECT_NAME}`
        : `@my-org/${context.PROJECT_NAME}`,
      envKey: 'PACKAGE_NAME',
      validate: (value: unknown) => {
        if (typeof value !== 'string') return 'Value must be a string'
        return isValidPackageName(value)
      },
      errorMessage: 'ERROR:Invalid value',
    },
    PACKAGE_SCOPE: {
      derived: true,
      getValue: (values) => extractScope(values.PACKAGE_NAME),
    },
    PROJECT_NAME: {
      derived: true,
      getValue: (values) => extractProjectName(values.PACKAGE_NAME),
    },
    PROJECT_TYPE: {
      type: 'select',
      message: 'Select project type',
      options: config.DENO_KIT_PROJECT_TYPES.split(',').map((type) => ({
        value: type,
        label: type === 'cli'
          ? type.toUpperCase()
          : toTitleCase(type.replace(/-/g, ' ')),
      })),
      defaultValue: 'cli',
      envKey: 'PROJECT_TYPE',
    },
    YEAR: {
      derived: true,
      getValue: () => new Date().getFullYear().toString(),
    },
    PACKAGE_VERSION: {
      type: 'text',
      message: 'Package version',
      defaultValue: '0.0.1',
      envKey: 'PACKAGE_VERSION',
      validate: (value: unknown) => {
        if (typeof value !== 'string') return false
        return canParse(value)
      },
      errorMessage: 'ERROR: Must be semver',
    },
    PACKAGE_AUTHOR_NAME: {
      type: 'text',
      message: 'Author name',
      defaultValue: context.PACKAGE_AUTHOR_NAME,
      envKey: 'PACKAGE_AUTHOR_NAME',
    },
    PACKAGE_AUTHOR_EMAIL: {
      type: 'text',
      message: 'Author email',
      defaultValue: context.PACKAGE_AUTHOR_EMAIL,
      envKey: 'PACKAGE_AUTHOR_EMAIL',
    },
    PACKAGE_DESCRIPTION: {
      type: 'text',
      message: 'Package description',
      defaultValue: 'A Deno project',
      envKey: 'PACKAGE_DESCRIPTION',
    },
    PACKAGE_GITHUB_USER: {
      type: 'text',
      message: 'GitHub username or organization',
      defaultValue: context.PACKAGE_SCOPE,
      envKey: 'PACKAGE_GITHUB_USER',
    },
  }
}

/**
 * Get user input for a prompt with modern styling
 */
async function promptUser(
  promptText: string,
  defaultValue: string,
): Promise<string> {
  if (config.DENO_KIT_ENV === 'test') {
    return defaultValue
  }

  const value = await prompt.ask({
    message: promptText,
    type: 'text',
    defaultValue: defaultValue,
    clearBefore: true,
  })

  return value as string
}

/**
 * Prints a selected value with consistent styling
 */
function printSelection(emoji: string, label: string, value: string) {
  terminal.print(`${green(emoji)}  ${label}: ${value}`)
}

/**
 * Gathers all setup values from user input
 */
export async function getTemplateValues(): Promise<TemplateValues> {
  const values: Record<string, string> = {}
  let githubUser: string | undefined
  try {
    githubUser = (await WorkspaceGit.getGithubUser()).login
  } catch (error) {
    terminal.debug(
      'Error getting GitHub user. Using fallback for PACKAGE_GITHUB_USER',
      error,
    )
  }

  // NOTE: If GitHub is being used, initial context has every variable
  // needed to generate a project except a description and project type
  // TODO: Can we embed a small model to auto-generate a short description?
  const initialContext = {
    PROJECT_NAME: basename(config.DENO_KIT_WORKSPACE_PATH),
    PACKAGE_VERSION: '0.0.1',
    PACKAGE_AUTHOR_NAME: await getGitUserName({
      cwd: config.DENO_KIT_WORKSPACE_PATH,
    }),
    PACKAGE_AUTHOR_EMAIL: await getGitUserEmail({
      cwd: config.DENO_KIT_WORKSPACE_PATH,
    }),
    YEAR: new Date().getFullYear().toString(),
    PACKAGE_GITHUB_USER: '',
    PACKAGE_SCOPE: '',
    PACKAGE_NAME: '',
  }
  if (githubUser) {
    initialContext.PACKAGE_GITHUB_USER = githubUser
    initialContext.PACKAGE_SCOPE = `@${githubUser}`
    initialContext.PACKAGE_NAME =
      `${initialContext.PACKAGE_SCOPE}/${initialContext.PROJECT_NAME}`
  }

  const useAutoConfig = await createAutoPromptConfig(initialContext)

  // If user accepts auto-configuration, use initial context values and skip to GitHub repo prompts
  if (useAutoConfig) {
    // Set all values from initial context
    Object.assign(values, initialContext)
    // Add missing values that aren't in initialContext
    values.PACKAGE_DESCRIPTION = 'A Deno project'
    printSelection(
      '✍️',
      bold('Package Description'),
      values.PACKAGE_DESCRIPTION,
    )

    // Still need to prompt for PROJECT_TYPE since it can't be auto-detected
    const prompts = createPromptConfig(initialContext)
    const projectTypePrompt = prompts.PROJECT_TYPE as ExtendedSelectPromptConfig

    // Use config value from environment variable if available
    const configValue = projectTypePrompt.envKey
      ? getTemplateValueFromConfig(projectTypePrompt.envKey)
      : undefined
    if (configValue) {
      values.PROJECT_TYPE = configValue
      printSelection('🛠️', bold('Type'), values.PROJECT_TYPE.toUpperCase())
    } else if (config.DENO_KIT_ENV === 'test') {
      values.PROJECT_TYPE = projectTypePrompt.defaultValue as string
      printSelection('🛠️', bold('Type'), values.PROJECT_TYPE.toUpperCase())
    } else {
      const result = await prompt.ask({
        message: projectTypePrompt.message,
        type: 'select',
        options: projectTypePrompt.options,
        defaultValue: projectTypePrompt.defaultValue || 'cli',
      })

      values.PROJECT_TYPE = (result as string) ||
        (projectTypePrompt.defaultValue as string) || 'cli'
      printSelection('🛠️', bold('Type'), values.PROJECT_TYPE.toUpperCase())
    }
  } else {
    // Original prompting flow
    const prompts = createPromptConfig(initialContext)

    // Process PACKAGE_NAME first with validation
    const namePrompt = prompts.PACKAGE_NAME as ExtendedTextPromptConfig
    let packageName: string
    let nameValidationFailed = false

    do {
      const configValue = namePrompt.envKey
        ? getTemplateValueFromConfig(namePrompt.envKey)
        : undefined
      const defaultValue = configValue ?? namePrompt.defaultValue ?? ''

      const promptMessage = nameValidationFailed
        ? `${namePrompt.message} (${
          namePrompt.errorMessage || 'Invalid input'
        })`
        : namePrompt.message

      packageName = await promptUser(promptMessage, defaultValue)

      // Validate the package name if validation function exists
      const isValid = !namePrompt.validate || namePrompt.validate(packageName)
      nameValidationFailed = !isValid
    } while (namePrompt.validate && !namePrompt.validate(packageName))

    values.PACKAGE_NAME = packageName

    // Update context with derived scope
    const derivedScope = (prompts.PACKAGE_SCOPE as DerivedConfig).getValue(
      values,
    )
    const scopeWithoutAt = derivedScope.replace('@', '')
    const updatedPrompts = createPromptConfig({
      ...initialContext,
      PACKAGE_NAME: packageName,
      PACKAGE_SCOPE: scopeWithoutAt,
    })

    // Process PACKAGE_VERSION with validation
    const versionPrompt = updatedPrompts
      .PACKAGE_VERSION as ExtendedTextPromptConfig
    let packageVersion: string
    let versionValidationFailed = false

    do {
      const configValue = versionPrompt.envKey
        ? getTemplateValueFromConfig(versionPrompt.envKey)
        : undefined
      const defaultValue = configValue ?? versionPrompt.defaultValue ?? ''

      const promptMessage = versionValidationFailed
        ? `${versionPrompt.message} (${
          versionPrompt.errorMessage || 'Invalid input'
        })`
        : versionPrompt.message

      packageVersion = await promptUser(promptMessage, defaultValue)

      // Validate the package version if validation function exists
      const isValid = !versionPrompt.validate ||
        versionPrompt.validate(packageVersion)
      versionValidationFailed = !isValid
    } while (versionPrompt.validate && !versionPrompt.validate(packageVersion))

    values.PACKAGE_VERSION = packageVersion

    // Process all remaining values
    for (const [key, promptConfig] of Object.entries(updatedPrompts)) {
      // Skip already processed prompts
      if (key === 'PACKAGE_NAME' || key === 'PACKAGE_VERSION') continue

      // Skip GitHub user prompt if one was auto-detected
      if (key === 'PACKAGE_GITHUB_USER' && githubUser) {
        values[key] = githubUser
        //printSelection('🐙', 'GitHub name', values[key])
        continue
      }

      // Handle derived values
      if ('derived' in promptConfig && promptConfig.derived) {
        values[key] = promptConfig.getValue(values)
        continue
      }

      // Handle select prompts
      if ('type' in promptConfig && promptConfig.type === 'select') {
        const selectPrompt = promptConfig as ExtendedSelectPromptConfig
        // Use config value from environment variable if available
        const configValue = selectPrompt.envKey
          ? getTemplateValueFromConfig(selectPrompt.envKey)
          : undefined
        if (configValue) {
          values[key] = configValue
          printSelection(
            selectPrompt.message.startsWith('Select project') ? '🔧' : '❓',
            key.split('_').slice(-2).join(' '),
            values[key],
          )
          continue
        }

        // Skip prompt in test mode
        if (config.DENO_KIT_ENV === 'test') {
          values[key] = selectPrompt.defaultValue as string
          printSelection(
            selectPrompt.message.startsWith('Select project') ? '🔧' : '❓',
            key.split('_').slice(-2).join(' '),
            values[key],
          )
          continue
        }

        const result = await prompt.ask({
          message: selectPrompt.message,
          type: 'select',
          options: selectPrompt.options,
          defaultValue: selectPrompt.defaultValue || '',
        })

        values[key] = (result as string) ||
          (selectPrompt.defaultValue as string) ||
          ''
        printSelection(
          selectPrompt.message.startsWith('Select project') ? '🔧' : '❓',
          key.split('_').slice(-2).join(' '),
          values[key],
        )
        continue
      }

      // Handle normal prompts
      const typedPrompt = promptConfig as ExtendedTextPromptConfig
      const configValue = typedPrompt.envKey
        ? getTemplateValueFromConfig(typedPrompt.envKey)
        : undefined
      const defaultValue = configValue ?? typedPrompt.defaultValue ?? ''

      // Get appropriate emoji for each prompt
      const emojiMap: Record<string, string> = {
        PROJECT_NAME: '🧩',
        PACKAGE_VERSION: '📌',
        PACKAGE_AUTHOR_NAME: '👤',
        PACKAGE_AUTHOR_EMAIL: '📧',
        PACKAGE_DESCRIPTION: '📝',
        PACKAGE_GITHUB_USER: '🐙',
        PACKAGE_NAME: '📦',
      }
      const emoji = emojiMap[key] || '❓'

      values[key] = await promptUser(
        typedPrompt.message,
        defaultValue,
      )
      printSelection(emoji, typedPrompt.message, values[key])
    }
  }

  // Handle GitHub repo creation - always ask if they want to create a repo when GitHub user exists
  if (config.DENO_KIT_ENV !== 'test' && values.PACKAGE_GITHUB_USER) {
    const createRepoPromptText =
      `Create a Github repo at "github.com/${values.PACKAGE_GITHUB_USER}/${values.PROJECT_NAME}"?`
    const createRepo = await prompt.ask({
      message: createRepoPromptText,
      type: 'select',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    })
    values.CREATE_GITHUB_REPO = createRepo === 'yes' ? 'true' : 'false'

    if (values.CREATE_GITHUB_REPO === 'true') {
      const repoPublicPromptText = 'Should the repo be public?'
      const repoPublic = await prompt.ask({
        message: repoPublicPromptText,
        type: 'select',
        options: [
          { value: 'no', label: 'No (private)' },
          { value: 'yes', label: 'Yes (public)' },
        ],
      })
      values.GITHUB_REPO_PUBLIC = repoPublic === 'yes' ? 'true' : 'false'
    }
  }
  return values as TemplateValues
}

export default getTemplateValues
