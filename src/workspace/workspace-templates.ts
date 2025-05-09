/**
 * @module workspace
 *
 * Handles template operations for the workspace.
 */
import { relative } from '@std/path'
import { ensureDir } from '@std/fs'
import type { WorkspaceLogger } from './workspace-types.ts'

/**
 * Manages template operations within a workspace
 */
export class WorkspaceTemplates {
  #templates = new Map<string, string>()
  #templateValues = new Map<string, string>()

  /**
   * Creates a new WorkspaceTemplates instance
   *
   * @param templatesPath The root path of the templates
   * @param workspacePath The root path of the workspace
   * @param logger Logger instance for logging operations
   */
  constructor(
    readonly templatesPath: string,
    readonly workspacePath: string,
    private readonly logger: WorkspaceLogger,
  ) {}

  /**
   * Get all template files
   */
  get templates(): Map<string, string> {
    return this.#templates
  }

  /**
   * Get all template values
   */
  get templateValues(): Map<string, string> {
    return this.#templateValues
  }

  /**
   * Set the template files
   */
  setTemplates(templates: Map<string, string>): void {
    this.#templates = templates
  }

  /**
   * Set template values
   */
  setTemplateValues(values: { [key: string]: string }): void {
    this.#templateValues = new Map(Object.entries(values))
  }

  /**
   * Compiles template files by replacing placeholder values with provided template values,
   * then saves the compiled templates to the workspace directory.
   * The template paths are adjusted to point to the workspace directory before saving.
   * Placeholders in templates should be in the format {PLACEHOLDER_NAME}.
   *
   * @param templateValues Optional values to replace placeholders with in template files
   * @param templateFiles Optional map of template files to use instead of this.#templates
   * @throws Error If writing any template file fails or if no template files or values are available
   * @example
   * ```ts
   * await workspace.compileAndWriteTemplates({
   *   PROJECT_NAME: "my-project",
   *   AUTHOR: "John Doe"
   * });
   * ```
   */
  async compileAndWriteTemplates(
    templateValues?: { [key: string]: string },
    templateFiles?: Map<string, string>,
  ): Promise<void> {
    const templatesMap = templateFiles || this.#templates

    if (templatesMap.size === 0) {
      throw new Error(
        'No template files available to compile. Please provide template files or ensure the workspace has templates.',
      )
    }

    if (templateValues && Object.keys(templateValues).length === 0) {
      throw new Error(
        'No template values provided. Please provide template values either during workspace creation or when calling compileAndWriteTemplates.',
      )
    }

    // Merge template values using nullish coalescing and spread operators
    const existingValues = this.#templateValues.size > 0
      ? Object.fromEntries(this.#templateValues.entries())
      : {}

    const mergedTemplateValues = {
      ...existingValues,
      ...(templateValues ?? {}),
    } as { [key: string]: string }

    if (Object.keys(mergedTemplateValues).length === 0) {
      throw new Error(
        'No template values provided. Please provide template values either during workspace creation or when calling compileAndWriteTemplates.',
      )
    }

    // Store the merged template values in the workspace's internal template values map
    this.#templateValues = new Map(Object.entries(mergedTemplateValues))

    // Compile templates and prepare for writing
    const compiledTemplates = [...templatesMap.entries()].map(([path, content]) => {
      const processedContent = content.replace(
        /{([A-Z_]+)}/g,
        (_match, placeholder) => mergedTemplateValues[placeholder] ?? _match,
      )

      return [path.replace(this.templatesPath, this.workspacePath), processedContent]
    })

    // Update the internal template map with workspace paths instead of template paths
    const updatedTemplates = new Map<string, string>()
    for (const [templatePath, content] of this.#templates.entries()) {
      const workspacePath = templatePath.replace(this.templatesPath, this.workspacePath)
      updatedTemplates.set(workspacePath, content)
    }
    this.#templates = updatedTemplates

    // Write all templates to disk with Promise.all for parallelism
    await Promise.all(
      compiledTemplates.map(async ([path, content]) => {
        try {
          const dirPath = path.substring(0, path.lastIndexOf('/'))
          await ensureDir(dirPath)
          await Deno.writeTextFile(path, content)
        } catch (error) {
          throw new Error(
            `Failed to write template to workspace at '${path}': ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
        }
      }),
    )
  }

  /**
   * Get template file paths relative to the templates path
   */
  getRelativeTemplatePaths(): string[] {
    return Array.from(this.#templates.keys()).map((p) => {
      try {
        return relative(this.templatesPath, p)
      } catch {
        // If relative path creation fails, try a simple string replacement instead
        const basePath = this.templatesPath.replace(/\\/g, '/')
        return p.replace(basePath, '').replace(/^\//, '')
      }
    })
  }
}
