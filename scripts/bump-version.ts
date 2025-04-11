#!/usr/bin/env deno

import { parse } from '@std/jsonc'
import { dirname, fromFileUrl, join } from '@std/path'

/**
 * Updates the version in the README.md file to match the version in deno.jsonc
 */
async function updateReadmeVersion() {
  try {
    // Get the project root directory
    const currentDir = dirname(fromFileUrl(import.meta.url))
    const projectRoot = join(currentDir, '..')

    // Read and parse deno.jsonc
    const denoJsoncPath = join(projectRoot, 'deno.jsonc')
    const denoJsoncContent = await Deno.readTextFile(denoJsoncPath)
    const config = parse(denoJsoncContent) as { version?: string }

    if (!config || typeof config !== 'object' || !config.version) {
      console.error('No version found in deno.jsonc')
      Deno.exit(1)
    }

    const version = config.version

    // Read README.md
    const readmePath = join(projectRoot, 'README.md')
    let readmeContent = await Deno.readTextFile(readmePath)

    // Update version in README.md
    readmeContent = readmeContent.replace(
      /https:\/\/jsr\.io\/@deno-kit\/kit\/[0-9]+\.[0-9]+\.[0-9]+\//g,
      `https://jsr.io/@deno-kit/kit/${version}/`,
    )

    // Write updated README.md
    await Deno.writeTextFile(readmePath, readmeContent)

    console.log(`Updated README.md with version: ${version}`)

    return { success: true, version }
  } catch (error) {
    console.error('Error updating README version:', error)
    Deno.exit(1)
  }
}

// Only run the function if this module is the main module
if (import.meta.main) {
  await updateReadmeVersion()
}

export { updateReadmeVersion }
