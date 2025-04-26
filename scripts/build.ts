#!/usr/bin/env -S deno run --allow-all

/**
 * Build script for compiling the kit.ts file into an executable.
 * This script builds binaries for multiple platforms and creates zip archives.
 *
 * Features:
 * - Multi-platform compilation (Windows, macOS, Linux)
 * - Resource bundling (templates, configs)
 * - Production environment configuration
 * - Automatic cleanup of temporary files
 *
 * @module scripts/build
 * @see {@link https://docs.deno.com/runtime/reference/cli/compile} - Deno compile command
 */

import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from '@zip-js/zip-js/data-uri'
import { dirname, fromFileUrl, join, relative } from '@std/path'
import { exists } from '@std/fs'

// Get the absolute path to the project root directory
const PROJECT_ROOT = dirname(dirname(fromFileUrl(import.meta.url)))

// Define resource paths relative to project root
const RESOURCES = {
  source: 'src/main.ts',
  denoConfig: 'deno.jsonc',
  templates: 'templates',
  bannedDirsDefault: 'src/utils/banned_directories_default.jsonc',
  bannedDirsCustom: 'src/utils/banned_directories_custom.jsonc',
  windowsIcon: 'assets/deno-kit.ico',
  templatesZip: 'bin/templates.zip',
} as const

// Convert paths relative to project root into fully resolved paths for file operations
const RESOLVED_PATHS = Object.fromEntries(
  Object.entries(RESOURCES).map(([key, path]) => [key, join(PROJECT_ROOT, path)]),
) as Record<keyof typeof RESOURCES, string>

/**
 * Creates a zip file containing the binary and environment file
 */
async function createZipFile(sourcePath: string, targetPath: string): Promise<void> {
  const [fileData, fileName] = await Promise.all([
    Deno.readFile(sourcePath),
    Promise.resolve(sourcePath.split('/').pop() || 'binary'),
  ])

  const zipWriter = new ZipWriter(new Uint8ArrayWriter())
  await zipWriter.add(fileName, new Uint8ArrayReader(fileData))

  // Add the .env file to the zip
  const envContent = 'DENO_ENV=production'
  const envData = new TextEncoder().encode(envContent)
  await zipWriter.add('.env', new Uint8ArrayReader(envData))

  const zipData = await zipWriter.close()
  await Deno.writeFile(targetPath, zipData)
}

/**
 * Creates a zip file from a directory while preserving structure
 */
async function createDirectoryZip(sourceDir: string, targetPath: string): Promise<void> {
  const zipWriter = new ZipWriter(new Uint8ArrayWriter())

  async function addFilesToZip(dir: string, baseDir: string) {
    for await (const entry of Deno.readDir(dir)) {
      const entryPath = join(dir, entry.name)
      const relativePath = entryPath.slice(baseDir.length + 1)

      if (entry.isDirectory) {
        await addFilesToZip(entryPath, baseDir)
      } else {
        const fileData = await Deno.readFile(entryPath)
        await zipWriter.add(relativePath, new Uint8ArrayReader(fileData))
      }
    }
  }

  await addFilesToZip(sourceDir, sourceDir)
  const zipData = await zipWriter.close()
  await Deno.writeFile(targetPath, zipData)
}

/**
 * Lists directory contents recursively for verification
 */
async function listFilesRecursively(dir: string, indent = '') {
  for await (const entry of Deno.readDir(dir)) {
    const entryPath = join(dir, entry.name)
    console.log(`${indent}${entry.isDirectory ? '📁' : '📄'} ${entry.name}`)

    if (entry.isDirectory) {
      await listFilesRecursively(entryPath, `${indent}  `)
    }
  }
}

/**
 * Main build function that compiles the source for multiple platforms
 */
async function build() {
  console.log('Starting build process...')

  try {
    // Verify all required resources exist
    for (const [name, path] of Object.entries(RESOLVED_PATHS)) {
      if (name === 'templatesZip') continue // Skip checking templates.zip as it will be created
      if (!await exists(path)) {
        throw new Error(`Required resource not found: ${name} at ${path}`)
      }
    }

    // Always use bin directory relative to project root
    const outputDir = join(PROJECT_ROOT, 'bin')
    try {
      await Deno.mkdir(outputDir, { recursive: true })
    } catch (err) {
      if (!(err instanceof Deno.errors.AlreadyExists)) throw err
    }

    await createDirectoryZip(RESOLVED_PATHS.templates, RESOLVED_PATHS.templatesZip)
    console.log(`Created templates zip at: ${RESOURCES.templatesZip}`)

    const config = {
      cwd: PROJECT_ROOT,
      source: RESOURCES.source,
      outputDir,
      denoConfig: RESOURCES.denoConfig,
      templates: RESOLVED_PATHS.templatesZip,
      bannedDirsDefault: RESOURCES.bannedDirsDefault,
      bannedDirsCustom: RESOURCES.bannedDirsCustom,
      windowsIcon: RESOURCES.windowsIcon,
    }
    console.log('\nBuild configuration:')
    for (const [key, value] of Object.entries(config)) {
      console.log(`${key}: ${value}`)
    }

    console.log('\nVerifying template files...')
    await listFilesRecursively(RESOLVED_PATHS.templates)

    const targets = [
      { name: 'windows-x86_64', target: 'x86_64-pc-windows-msvc' },
      { name: 'macos-x86_64', target: 'x86_64-apple-darwin' },
      { name: 'macos-aarch64', target: 'aarch64-apple-darwin' },
      { name: 'linux-x86_64', target: 'x86_64-unknown-linux-gnu' },
      { name: 'linux-aarch64', target: 'aarch64-unknown-linux-gnu' },
    ]

    const outputs = []
    for (const [index, platform] of targets.entries()) {
      const outputFileName = `deno-kit-${platform.name}${
        platform.name.includes('windows') ? '.exe' : ''
      }`
      const outputPath = join(outputDir, outputFileName)

      console.log(`\nBuilding for ${platform.name} (${platform.target}) to ${outputPath}...`)

      // Use relative paths for all --include arguments
      const args = [
        'compile',
        '-A',
        '--unstable',
        '--lock',
        '--no-check',
        '--reload',
        '--config',
        relative(PROJECT_ROOT, RESOLVED_PATHS.denoConfig),
        '--target',
        platform.target,
        '--output',
        outputPath,
        '--include',
        'bin/templates.zip',
        '--include',
        relative(PROJECT_ROOT, RESOLVED_PATHS.bannedDirsDefault),
        '--include',
        relative(PROJECT_ROOT, RESOLVED_PATHS.bannedDirsCustom),
        '--include',
        relative(PROJECT_ROOT, RESOLVED_PATHS.denoConfig),
      ]

      if (index === 0) args.splice(2, 0, '--reload')
      if (platform.name.includes('windows')) {
        args.push('--icon', relative(PROJECT_ROOT, RESOLVED_PATHS.windowsIcon))
      }

      args.push(relative(PROJECT_ROOT, RESOLVED_PATHS.source))

      console.log(`\nCompile command for ${platform.name}:`)
      console.log(args.join(' '))

      const command = new Deno.Command(Deno.execPath(), {
        args,
        stdout: 'inherit',
        stderr: 'inherit',
        cwd: PROJECT_ROOT, // Ensure we run from project root
      })

      const { success } = await command.spawn().status

      if (success) {
        console.log(`✅ Build completed for ${platform.name}`)

        if (!await exists(outputPath)) {
          throw new Error(`Build succeeded but output file not found at: ${outputPath}`)
        }

        if (!platform.name.includes('windows')) {
          await Deno.chmod(outputPath, 0o755)
        }

        const zipFileName = `deno-kit-${platform.name}.zip`
        const zipFilePath = join(outputDir, zipFileName)

        await createZipFile(outputPath, zipFilePath)
        console.log(`✅ Created zip archive: ${zipFilePath}`)

        outputs.push({ platform: platform.name, binaryPath: outputPath, zipPath: zipFilePath })
        await Deno.remove(outputPath)
      } else {
        console.error(`❌ Build failed for ${platform.name}`)
      }
    }

    if (outputs.length > 0) {
      console.log('\n✅ Build process completed successfully!')
      console.log('\nCreated archives:')
      for (const { platform, zipPath } of outputs) {
        console.log(`- ${zipPath} (${platform})`)
      }

      // Clean up temporary files
      const cleanupFiles = [
        RESOLVED_PATHS.templatesZip,
        join(dirname(RESOLVED_PATHS.templatesZip), '.env'),
      ]

      for (const file of cleanupFiles) {
        try {
          if (await exists(file)) {
            await Deno.remove(file)
            console.log(`\nCleaned up temporary file: ${relative(PROJECT_ROOT, file)}`)
          }
        } catch (error) {
          console.error(`Error cleaning up file ${relative(PROJECT_ROOT, file)}:`, error)
        }
      }
    } else {
      throw new Error('No builds were successful.')
    }
  } catch (error) {
    console.error('Error during build:', error)
    // Clean up temporary files even if build fails
    const cleanupFiles = [
      RESOLVED_PATHS.templatesZip,
      join(dirname(RESOLVED_PATHS.templatesZip), '.env'),
    ]

    for (const file of cleanupFiles) {
      try {
        if (await exists(file)) {
          await Deno.remove(file)
          console.log(`\nCleaned up temporary file: ${relative(PROJECT_ROOT, file)}`)
        }
      } catch (_) {
        // Ignore cleanup errors on build failure
      }
    }
    Deno.exit(1)
  }
}

await build()
