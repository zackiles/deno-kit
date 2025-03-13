import { parse as parseJsonc } from '@std/jsonc'

/**
 * Retrieves the package name and version from deno.json
 * @returns An object containing the package name and version
 * @throws Error if deno.json cannot be read or is missing required fields
 */
function getPackageInfo(): { name: string; version: string } {
  try {
    const content = Deno.readTextFileSync('./deno.jsonc')
    const data = parseJsonc(content) as Record<string, unknown>

    if (!data?.name || !data?.version) {
      throw new Error(
        'Missing required fields in deno.json: name and version must be defined',
      )
    }

    return { name: String(data.name), version: String(data.version) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Failed to load package information from deno.json: ${message}`,
    )
  }
}

export { getPackageInfo }
