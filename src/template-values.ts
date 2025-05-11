/**
 * @module setup-values
 * @description Utility module for gathering setup values from user input
 *
 * This module provides functions for collecting user input during the project setup process,
 * supporting both interactive prompts and automated testing through environment variables.
 */

import logger from './utils/logger.ts'
import { getGitUserEmail, getGitUserName } from './workspace/workspace.ts'
import { extractProjectName, extractScope, isValidPackageName } from './utils/package-info.ts'
import type { TemplateValues } from './types.ts'
import { promptSelect } from '@std/cli/unstable-prompt-select'
import { getConfig } from './config.ts'
import { toTitleCase } from './utils/formatting.ts'

const config = await getConfig()

/**
 * Type definitions for prompt configuration
 */
type PromptConfig = {
  text: string
  defaultValue: string
  envKey?: string
  validate?: (value: string) => boolean
  errorMessage?: string
}

type DerivedConfig = {
  derived: true
  getValue: (values: Record<string, string>) => string
}

type SelectConfig = {
  select: true
  text: string
  options: Array<{
    value: string
    label: string
  }>
  defaultValue: string
  envKey?: string
}

type PromptItem = PromptConfig | DerivedConfig | SelectConfig

/**
 * Gets a template value from config using the DENO_KIT_TEMPLATE_ prefix
 */
function getTemplateValueFromConfig(key: string): string | undefined {
  const configKey = `DENO_KIT_TEMPLATE_${key}` as keyof typeof config
  return config[configKey]
}

/**
 * Creates a prompt configuration with options for all template values
 */
function createPromptConfig(context: {
  PACKAGE_AUTHOR_NAME: string
  PACKAGE_AUTHOR_EMAIL: string
  PACKAGE_SCOPE: string
}): Record<string, PromptItem> {
  return {
    PACKAGE_NAME: {
      text: 'Enter package @scope/name',
      defaultValue: '@my-org/my-project',
      envKey: 'PACKAGE_NAME',
      validate: isValidPackageName,
      errorMessage:
        'Invalid package name format. It must be in the format @scope/name (e.g., @deno/example)',
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
      select: true,
      text: 'Select project type',
      options: config.DENO_KIT_PROJECT_TYPES.split(',').map((type) => ({
        value: type,
        label: toTitleCase(type.replace(/-/g, ' ')),
      })),
      defaultValue: 'library',
      envKey: 'PROJECT_TYPE',
    },
    YEAR: {
      derived: true,
      getValue: () => new Date().getFullYear().toString(),
    },
    PACKAGE_VERSION: {
      text: 'Enter package version',
      defaultValue: '0.0.1',
      envKey: 'PACKAGE_VERSION',
    },
    PACKAGE_AUTHOR_NAME: {
      text: 'Enter author name',
      defaultValue: context.PACKAGE_AUTHOR_NAME,
      envKey: 'PACKAGE_AUTHOR_NAME',
    },
    PACKAGE_AUTHOR_EMAIL: {
      text: 'Enter author email',
      defaultValue: context.PACKAGE_AUTHOR_EMAIL,
      envKey: 'PACKAGE_AUTHOR_EMAIL',
    },
    PACKAGE_DESCRIPTION: {
      text: 'Enter package description',
      defaultValue: 'A Deno project',
      envKey: 'PACKAGE_DESCRIPTION',
    },
    PACKAGE_GITHUB_USER: {
      text: 'Enter GitHub username or organization',
      defaultValue: context.PACKAGE_SCOPE,
      envKey: 'PACKAGE_GITHUB_USER',
    },
  }
}

/**
 * Get user input for a prompt
 */
async function promptUser(promptText: string, defaultValue: string): Promise<string> {
  const promptWithDefault = `${promptText} [${defaultValue}]: `
  logger.print(promptWithDefault)

  // Skip stdin read in test mode
  if (config.DENO_KIT_ENV === 'test') {
    return defaultValue
  }

  const inputBuffer = new Uint8Array(1024)
  const bytesRead = await Deno.stdin.read(inputBuffer)
  return bytesRead === null
    ? defaultValue
    : new TextDecoder().decode(inputBuffer.subarray(0, bytesRead)).trim() || defaultValue
}

/**
 * Gathers all setup values from user input
 */
export async function getTemplateValues(): Promise<TemplateValues> {
  const values: Record<string, string> = {}

  const initialContext = {
    PACKAGE_AUTHOR_NAME: await getGitUserName({ cwd: config.DENO_KIT_WORKSPACE_PATH }),
    PACKAGE_AUTHOR_EMAIL: await getGitUserEmail({ cwd: config.DENO_KIT_WORKSPACE_PATH }),
    PACKAGE_SCOPE: '',
  }
  logger.debug('initialContext', initialContext)
  const prompts = createPromptConfig(initialContext)

  // Process PACKAGE_NAME first with validation
  const namePrompt = prompts.PACKAGE_NAME as PromptConfig
  let packageName: string

  do {
    const configValue = namePrompt.envKey
      ? getTemplateValueFromConfig(namePrompt.envKey)
      : undefined
    const defaultValue = configValue ?? namePrompt.defaultValue
    packageName = await promptUser(namePrompt.text, defaultValue)

    // Validate the package name if validation function exists
    const isValid = !namePrompt.validate || namePrompt.validate(packageName)
    if (!isValid) {
      logger.error(namePrompt.errorMessage || 'Invalid input')
    }
  } while (namePrompt.validate && !namePrompt.validate(packageName))

  values.PACKAGE_NAME = packageName

  // Update context with derived scope
  const derivedScope = (prompts.PACKAGE_SCOPE as DerivedConfig).getValue(values)
  const scopeWithoutAt = derivedScope.replace('@', '')
  const updatedPrompts = createPromptConfig({ ...initialContext, PACKAGE_SCOPE: scopeWithoutAt })

  // Process all remaining values
  for (const [key, prompt] of Object.entries(updatedPrompts)) {
    // Skip already processed package name
    if (key === 'PACKAGE_NAME') continue

    // Handle derived values
    if ('derived' in prompt && prompt.derived) {
      values[key] = prompt.getValue(values)
      continue
    }

    // Handle select prompts
    if ('select' in prompt && prompt.select) {
      // Use config value from environment variable if available
      const configValue = prompt.envKey ? getTemplateValueFromConfig(prompt.envKey) : undefined
      if (configValue) {
        values[key] = configValue
        continue
      }

      // Skip prompt in test mode
      if (config.DENO_KIT_ENV === 'test') {
        values[key] = prompt.defaultValue
        continue
      }

      // Call promptSelect and handle both success and failure cases
      values[key] = prompt.defaultValue

      const result = await promptSelect(
        prompt.text,
        prompt.options.map((opt) => opt.label),
        { clear: true },
      )

      if (result) {
        // Find the original value that matches the selected label
        const selected = prompt.options.find((opt) => opt.label === result)
        values[key] = selected?.value ?? prompt.defaultValue
      }

      continue
    }

    // Handle normal prompts
    const typedPrompt = prompt as PromptConfig
    const configValue = typedPrompt.envKey
      ? getTemplateValueFromConfig(typedPrompt.envKey)
      : undefined
    const defaultValue = configValue ?? typedPrompt.defaultValue
    values[key] = await promptUser(typedPrompt.text, defaultValue)
  }

  return values as TemplateValues
}

export default getTemplateValues
