/**
 * @module setup-values
 * @description Utility module for gathering setup values from user input
 *
 * This module provides functions for collecting user input during the project setup process,
 * supporting both interactive prompts and automated testing through environment variables.
 */

import logger from './utils/logger.ts'
import { extractProjectName, extractScope, isValidPackageName } from './utils/package-info.ts'
import type { TemplateValues } from './types.ts'
import { promptSelect } from '@std/cli/unstable-prompt-select'

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
  options: string[]
  defaultValue: string
  envKey?: string
}

type PromptItem = PromptConfig | DerivedConfig | SelectConfig

// Available project types
const PROJECT_TYPES = [
  'Library',
  'CLI',
  'HTTP-Server',
  'Websocket-Server',
  'SSE-Server',
  'MCP-Server',
]

/**
 * Creates a prompt configuration with options for all template values
 */
function createPromptConfig(context: {
  gitName: string
  gitEmail: string
  scope: string
}): Record<string, PromptItem> {
  return {
    PACKAGE_NAME: {
      text: 'Enter package @scope/name',
      defaultValue: '@my-org/my-project',
      envKey: 'DENO_KIT_PACKAGE_NAME',
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
      options: PROJECT_TYPES,
      defaultValue: 'Library',
      envKey: 'DENO_KIT_PROJECT_TYPE',
    },
    YEAR: {
      derived: true,
      getValue: () => new Date().getFullYear().toString(),
    },
    PACKAGE_VERSION: {
      text: 'Enter package version',
      defaultValue: '0.0.1',
      envKey: 'DENO_KIT_PACKAGE_VERSION',
    },
    PACKAGE_AUTHOR_NAME: {
      text: 'Enter author name',
      defaultValue: context.gitName,
      envKey: 'DENO_KIT_PACKAGE_AUTHOR_NAME',
    },
    PACKAGE_AUTHOR_EMAIL: {
      text: 'Enter author email',
      defaultValue: context.gitEmail,
      envKey: 'DENO_KIT_PACKAGE_AUTHOR_EMAIL',
    },
    PACKAGE_DESCRIPTION: {
      text: 'Enter package description',
      defaultValue: 'A Deno project',
      envKey: 'DENO_KIT_PACKAGE_DESCRIPTION',
    },
    PACKAGE_GITHUB_USER: {
      text: 'Enter GitHub username or organization',
      defaultValue: context.scope,
      envKey: 'DENO_KIT_PACKAGE_GITHUB_USER',
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
  if (Deno.env.get('DENO_ENV') === 'test') {
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
export async function getTemplateValues({ gitName = '', gitEmail = '' }): Promise<TemplateValues> {
  const values: Record<string, string> = {}
  const initialContext = { gitName, gitEmail, scope: '' }
  const prompts = createPromptConfig(initialContext)

  // Process PACKAGE_NAME first with validation
  const namePrompt = prompts.PACKAGE_NAME as PromptConfig
  let packageName: string

  do {
    const defaultValue = Deno.env.get(namePrompt.envKey || '') || namePrompt.defaultValue
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
  const updatedPrompts = createPromptConfig({ ...initialContext, scope: scopeWithoutAt })

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
      // Use environment variable if available
      if (prompt.envKey && Deno.env.get(prompt.envKey)) {
        values[key] = Deno.env.get(prompt.envKey) || prompt.defaultValue
        continue
      }

      // Skip prompt in test mode
      if (Deno.env.get('DENO_ENV') === 'test') {
        values[key] = prompt.defaultValue
        continue
      }

      try {
        const result = await promptSelect(
          prompt.text,
          prompt.options,
          { clear: true },
        )
        values[key] = result || prompt.defaultValue
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        const errorStack = err instanceof Error && err.stack
          ? err.stack
          : 'No stack trace available'
        logger.error(`Error in select prompt: ${errorMessage}`, errorStack)
        values[key] = prompt.defaultValue
      }
      continue
    }

    // Handle normal prompts
    const typedPrompt = prompt as PromptConfig
    const defaultValue = Deno.env.get(typedPrompt.envKey || '') || typedPrompt.defaultValue
    values[key] = await promptUser(typedPrompt.text, defaultValue)
  }

  return values as TemplateValues
}

export default getTemplateValues
