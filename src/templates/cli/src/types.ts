/**
 * @module types
 * @description Internal and exported types for the CLI. NOTE: Re-export them in `mod.ts` if you'd like to expose them to consumers as well.
 */
import type { Args, ParseOptions } from '@std/cli'

/**
 * Configuration options for the Lib class
 */
interface LibConfig {
  [key: string]: unknown
}

type CrudOperation = {
  [key: string]: unknown
}

type LibRequest = CrudOperation
type LibResult = CrudOperation

/**
 * Arguments passed to a command's execution function.
 */
type CommandOptions = {
  /** CLI arguments parsed by std/cli */
  args: Args
  /** Complete list of available command routes */
  routes: CommandDefinition[]
}

/**
 * Definition of a CLI command to be exported from command files.
 */
type CommandDefinition = {
  name: string
  command: (params: CommandOptions) => Promise<void> | void
  description: string
  options?: ParseOptions
}

export type { CommandDefinition, CommandOptions, LibConfig, LibRequest, LibResult }
