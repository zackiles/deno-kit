/**
 * @module types
 * @description Core type definitions for the deno-kit library
 */

/**
 * Template values interface for configuring workspace templates
 */
interface TemplateValues {
  /** Full package name including scope (e.g., "@deno/example") */
  PACKAGE_NAME: string

  /** Package scope with @ symbol (e.g., "@deno") */
  PACKAGE_SCOPE: string

  /** Semantic version number (e.g., "1.0.0") */
  PACKAGE_VERSION: string

  /** Author's full name (e.g., "John Doe") */
  PACKAGE_AUTHOR_NAME: string

  /** Author's email address (e.g., "john.doe@example.com") */
  PACKAGE_AUTHOR_EMAIL: string

  /** Short description of the package (e.g., "A modern HTTP client for Deno") */
  PACKAGE_DESCRIPTION: string

  /** GitHub username or organization without @ (e.g., "denoland") */
  PACKAGE_GITHUB_USER: string

  /** Current year for license and documentation (e.g., "2024") */
  YEAR: string

  /** Package name without scope (e.g., "example" from "@deno/example") */
  PROJECT_NAME: string

  /** Allow string indexing for dynamic template values */
  [key: string]: string
}

/**
 * Specification for the kit.json file structure that defines the workspace configuration
 */
interface KitFileSpecification {
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
  templateValues: TemplateValues
}

export type { KitFileSpecification, TemplateValues }
