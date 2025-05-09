/**
 * @module workspace
 *
 * Shared types for the workspace modules
 */

/**
 * Logger interface for Workspace class to use for logging operations
 */
export type WorkspaceLogger = Record<
  'debug' | 'info' | 'warn' | 'error' | 'log',
  (message: string, ...args: unknown[]) => void
>

/**
 * Specification for the workspace config file that defines the workspace configuration
 */
export interface WorkspaceConfigFile {
  /** Unique identifier for the workspace */
  id: string
  /** List of file paths in the workspace */
  name?: string
  workspaceFiles: string[]
  /** List of template file paths */
  templateFiles: string[]
  /** List of backup file paths */
  backupFiles: string[]
  /** Template values for the workspace */
  templateValues?: { [key: string]: string }
}
