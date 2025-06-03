/**
 * @module workspace-types
 *
 * Shared types for the workspace modules
 */

import type { Workspace } from './index.ts'

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

/**
 * Git methods that will be added to the workspace
 * These methods are explicitly added in withGitFunctionality
 */
export type GitMethods =
  | 'getGithubUser'
  | 'createGithubRepo'
  | 'createRepoSecret'
  | 'removeGithubRepo'

/**
 * Type for a workspace with git functionality added
 */
export interface WorkspaceWithGit extends Workspace {
  getGithubUser(): Promise<{ login: string }>
  createLocalRepo(options?: {
    name?: string
    commitMessage?: string
  }): Promise<void>
  createGithubRepo(options?: {
    name?: string
    isPublic?: boolean
    push?: boolean
  }): Promise<{ path: string; repoUrl: string }>
  createRepoSecret(options: {
    name: string
    value: string
  }): Promise<void>
  removeGithubRepo(options?: {
    name?: string
    confirm?: boolean
  }): Promise<{ repoName: string }>
}
