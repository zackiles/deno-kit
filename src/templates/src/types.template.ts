/**
 * Internal types for the Library.
 * Re-export them in `mod.ts` if you'd like to expose them to consumers as well.
 */

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

export type { LibConfig, LibRequest, LibResult }
