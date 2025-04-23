#!/usr/bin/env -S deno run --allow-all

/**
 * Build script for compiling the kit.ts file into an executable.
 * This script builds binaries for multiple platforms and creates zip archives.
 *
 * @module scripts/build
 * @see {@link https://docs.deno.com/runtime/reference/cli/compile} - Deno compile command
 */

// Remote imports
import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from '@zip-js/zip-js'

// Local imports
import { join, dirname, fromFileUrl } from '@std/path'
import { exists } from '@std/fs'
import { resolveResourcePath } from '../src/utils/resource-path.ts'

// Project configuration
const PROJECT_ROOT = dirname(dirname(fromFileUrl(import.meta.url)))

const RESOURCES = {
  source: './src/main.ts',
  denoConfig: { file: './deno.jsonc' },
  resourcePaths: {
    templates: './templates',
    bannedDirsDefault: './src/utils/banned_directories_default.jsonc',
    bannedDirsCustom: './src/utils/banned_directories_custom.jsonc',
  },
  assets: { windowsIcon: './assets/deno-kit.ico' }
} as const

/**
 * Custom resource path resolver that can handle both files and directories
 *
 * @param path - Relative path to the resource from project root
 * @param isDirectory - Whether the resource is a directory
 * @returns Resolved absolute path
 */
async function resolveResource(path: string, isDirectory = true): Promise<string> {
  const absolutePath = join(PROJECT_ROOT, path)

  try {
    return isDirectory
      ? await resolveResourcePath(absolutePath)
      : (await exists(absolutePath) ? absolutePath : null)
  } catch (error) {
    console.warn(`Warning: Could not resolve path ${path}: ${error}`)
    return join(PROJECT_ROOT, path)
  }
}

/**
 * Creates a zip file from a binary file
 *
 * @param sourcePath - Path to the binary file to zip
 * @param targetPath - Path where the zip file should be saved
 * @returns Promise that resolves when the zip file has been created
 */
async function createZipFile(sourcePath: string, targetPath: string): Promise<void> {
  const [fileData, fileName] = await Promise.all([
    Deno.readFile(sourcePath),
    Promise.resolve(sourcePath.split('/').pop() || 'binary')
  ])

  const zipWriter = new ZipWriter(new Uint8ArrayWriter())
  await zipWriter.add(fileName, new Uint8ArrayReader(fileData))

  const zipData = await zipWriter.close()
  await Deno.writeFile(targetPath, zipData)
}

/**
 * Lists all files in a directory recursively
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
 * and packages the binaries into zip archives
 */
async function build() {
  console.log('Starting build process...')

  try {
    // Resolve all resource paths
    console.log('Resolving resource paths...')
    const resolvedPaths = {
      templates: await resolveResource(RESOURCES.resourcePaths.templates, true),
      bannedDirsDefault: await resolveResource(RESOURCES.resourcePaths.bannedDirsDefault, false),
      bannedDirsCustom: await resolveResource(RESOURCES.resourcePaths.bannedDirsCustom, false),
      windowsIcon: await resolveResource(RESOURCES.assets.windowsIcon, false),
      source: await resolveResource(RESOURCES.source, false),
      denoConfig: await resolveResource(RESOURCES.denoConfig.file, false),
    }

    const outputDir = Deno.args[0] || 'bin'
    const isAbsolutePath = outputDir.startsWith('/') ||
      (Deno.build.os === 'windows' && /^[A-Z]:[\\\/]/.test(outputDir))
    const absoluteOutputDir = isAbsolutePath ? outputDir : join(Deno.cwd(), outputDir)

    try {
      await Deno.mkdir(absoluteOutputDir, { recursive: true })
    } catch (err) {
      if (!(err instanceof Deno.errors.AlreadyExists)) throw err
    }

    // Log configuration
    const config = {
      cwd: Deno.cwd(),
      source: resolvedPaths.source,
      outputDir: absoluteOutputDir,
      denoConfig: resolvedPaths.denoConfig,
      templates: resolvedPaths.templates,
      bannedDirsDefault: resolvedPaths.bannedDirsDefault,
      bannedDirsCustom: resolvedPaths.bannedDirsCustom,
      windowsIcon: resolvedPaths.windowsIcon,
    }
    for (const [key, value] of Object.entries(config)) {
      console.log(`${key}: ${value}`)
    }

    // Debug: List all files in the templates directory
    console.log('\nVerifying files in templates directory...')
    await listFilesRecursively(resolvedPaths.templates)
    console.log('\nFinished listing template files\n')

    // Define platform targets
    const targets = [
      { name: 'windows-x86_64', target: 'x86_64-pc-windows-msvc' },
      { name: 'macos-x86_64', target: 'x86_64-apple-darwin' },
      { name: 'macos-aarch64', target: 'aarch64-apple-darwin' },
      { name: 'linux-x86_64', target: 'x86_64-unknown-linux-gnu' },
      { name: 'linux-aarch64', target: 'aarch64-unknown-linux-gnu' },
    ]

    // Build for each target
    const outputs = []
    for (const [index, platform] of targets.entries()) {
      const outputFileName = `deno-kit-${platform.name}${platform.name.includes('windows') ? '.exe' : ''}`
      const outputPath = join(absoluteOutputDir, outputFileName)

      console.log(`Building for ${platform.name} (${platform.target})...`)

      const args = [
        'compile',
        '-A',
        '--unstable',
        '--no-check',
        '--lock',
        '--config',
        resolvedPaths.denoConfig,
        '--target',
        platform.target,
        '--include',
        resolvedPaths.templates,
        '--include',
        resolvedPaths.bannedDirsDefault,
        '--include',
        resolvedPaths.bannedDirsCustom,
        '--include',
        resolvedPaths.denoConfig,
        '--output',
        outputPath,
      ]

      if (index === 0) args.splice(2, 0, '--reload')
      if (platform.name.includes('windows')) args.push('--icon', resolvedPaths.windowsIcon)
      args.push(resolvedPaths.source)

      const command = new Deno.Command(Deno.execPath(), {
        args,
        stdout: 'inherit',
        stderr: 'inherit',
      })

      const { success } = await command.spawn().status

      if (success) {
        console.log(`✅ Build completed for ${platform.name}`)

        if (!platform.name.includes('windows')) {
          await Deno.chmod(outputPath, 0o755)
        }

        const zipFileName = `deno-kit-${platform.name}.zip`
        const zipFilePath = join(absoluteOutputDir, zipFileName)

        console.log(`Creating zip archive: ${zipFilePath}`)
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
      console.log('\nCreated the following archives:')
      for (const { platform, zipPath } of outputs) {
        console.log(`- ${zipPath} (${platform})`)
      }
    } else {
      throw new Error('No builds were successful.')
    }
  } catch (error) {
    console.error('Error during build:', error)
    Deno.exit(1)
  }
}

// Run the build function
await build()
