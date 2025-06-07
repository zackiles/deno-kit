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

import { dirname, fromFileUrl, join, relative } from '@std/path'
import { exists } from '@std/fs'
import { compress } from '../src/utils/compression.ts'
import { promptSelect } from '@std/cli/unstable-prompt-select'

// Get the absolute path to the project root directory
const PROJECT_ROOT = dirname(dirname(fromFileUrl(import.meta.url)))

// Define all supported platform targets
const SUPPORTED_TARGETS = [
  {
    name: 'windows-x86_64',
    target: 'x86_64-pc-windows-msvc',
    os: 'windows',
    arch: 'x86_64',
  },
  {
    name: 'macos-x86_64',
    target: 'x86_64-apple-darwin',
    os: 'darwin',
    arch: 'x86_64',
  },
  {
    name: 'macos-aarch64',
    target: 'aarch64-apple-darwin',
    os: 'darwin',
    arch: 'aarch64',
  },
  {
    name: 'linux-x86_64',
    target: 'x86_64-unknown-linux-gnu',
    os: 'linux',
    arch: 'x86_64',
  },
  {
    name: 'linux-aarch64',
    target: 'aarch64-unknown-linux-gnu',
    os: 'linux',
    arch: 'aarch64',
  },
] as const

// Define resource paths relative to project root
const RESOURCES = {
  source: 'src/main.ts',
  denoConfig: 'deno.jsonc',
  templates: 'templates',
  bannedDirsDefault: 'src/utils/banned_directories_default.jsonc',
  bannedDirsCustom: 'src/utils/banned_directories_custom.jsonc',
  windowsIcon: 'assets/logo.ico',
  templatesZip: 'bin/templates.zip',
} as const

// Convert paths relative to project root into fully resolved paths for file operations
const RESOLVED_PATHS = Object.fromEntries(
  Object.entries(RESOURCES).map((
    [key, path],
  ) => [key, join(PROJECT_ROOT, path)]),
) as Record<keyof typeof RESOURCES, string>

/**
 * Gets the current platform target string based on the running OS and architecture
 */
function getCurrentPlatformTarget() {
  const os = Deno.build.os
  const arch = Deno.build.arch

  const currentTarget = SUPPORTED_TARGETS.find((t) =>
    t.os === os && t.arch === arch
  )

  if (currentTarget) {
    return { name: currentTarget.name, target: currentTarget.target }
  } else {
    throw new Error(`Unsupported platform: ${os}-${arch}`)
  }
}

/**
 * Cleans existing zip files for the binary names we're using
 */
async function cleanExistingZips(outputDir: string, binaryNames: string[]) {
  console.log('Cleaning existing zip files...')

  try {
    for await (const entry of Deno.readDir(outputDir)) {
      if (entry.isFile && entry.name.endsWith('.zip')) {
        // Check if this zip file matches any of our binary names
        const zipBaseName = entry.name.replace('.zip', '')
        const shouldClean = binaryNames.some((name) =>
          zipBaseName === `deno-kit-${name}`
        )

        if (shouldClean) {
          const zipPath = join(outputDir, entry.name)
          await Deno.remove(zipPath)
          console.log(`🗑️  Removed: ${entry.name}`)
        }
      }
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.log('Build directory does not exist yet, nothing to clean.')
    } else {
      throw error
    }
  }
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
 * Runs the built binary with any arguments passed to build.ts
 */
async function runBinary(binaryPath: string) {
  console.log(`\nRunning binary: ${binaryPath}`)
  console.log('Arguments:', Deno.args)

  const command = new Deno.Command(binaryPath, {
    args: Deno.args,
    stdout: 'inherit',
    stderr: 'inherit',
  })

  const { success } = await command.spawn().status
  if (!success) {
    console.error('❌ Binary execution failed')
    Deno.exit(1)
  }
}

/**
 * Main build function that compiles the source for multiple platforms
 */
async function build() {
  const environment = Deno.env.get('DENO_KIT_ENV') || 'production'
  const isDevelopment = environment === 'development' || environment === 'test'

  console.log(`Starting build process in ${environment} mode...`)

  try {
    // Verify all required resources exist
    for (const [name, path] of Object.entries(RESOLVED_PATHS)) {
      if (name === 'templatesZip') continue // Skip checking templates.zip as it will be created
      if (!await exists(path)) {
        throw new Error(`Required resource not found: ${name} at ${path}`)
      }
    }

    await compress(RESOLVED_PATHS.templates, RESOLVED_PATHS.templatesZip)
    console.log(`Created templates zip at: ${RESOURCES.templatesZip}`)

    const config = {
      cwd: PROJECT_ROOT,
      source: RESOURCES.source,
      outputDir: join(PROJECT_ROOT, 'bin'),
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

    const allTargets = SUPPORTED_TARGETS

    // Clean existing zip files
    const binaryNames = allTargets.map((t) => t.name)
    await cleanExistingZips(config.outputDir, binaryNames)

    // Determine which targets to build based on environment
    const currentPlatform = getCurrentPlatformTarget()
    const targets = isDevelopment ? [currentPlatform] : allTargets

    console.log(
      `\nBuilding for ${
        isDevelopment ? 'current platform only' : 'all platforms'
      }:`,
    )
    for (const t of targets) {
      console.log(`- ${t.name} (${t.target})`)
    }

    if (isDevelopment) {
      console.log(`\nDevelopment mode: Building only ${currentPlatform.name}`)
    }

    const outputs = []
    for (const [_index, platform] of targets.entries()) {
      const outputFileName = `deno-kit-${platform.name}${
        platform.name.includes('windows') ? '.exe' : ''
      }`
      const outputPath = join(config.outputDir, outputFileName)

      console.log(
        `\nBuilding for ${platform.name} (${platform.target}) to ${outputPath}...`,
      )

      // Use relative paths for all --include arguments
      const args = [
        'compile',
        '-A',
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
        relative(PROJECT_ROOT, RESOLVED_PATHS.bannedDirsDefault),
        '--include',
        relative(PROJECT_ROOT, RESOLVED_PATHS.bannedDirsCustom),
        '--include',
        relative(PROJECT_ROOT, RESOLVED_PATHS.denoConfig),
      ]

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
          throw new Error(
            `Build succeeded but output file not found at: ${outputPath}`,
          )
        }

        if (!platform.name.includes('windows')) {
          await Deno.chmod(outputPath, 0o755)
        }

        if (isDevelopment) {
          // In development mode, keep the binary without zipping
          console.log(`✅ Binary available at: ${outputPath}`)
          outputs.push({
            platform: platform.name,
            binaryPath: outputPath,
          })
        } else {
          // In production mode, create zip and optionally keep current platform binary
          const zipFileName = `deno-kit-${platform.name}.zip`
          const zipFilePath = join(config.outputDir, zipFileName)

          await compress(outputPath, zipFilePath)
          console.log(`✅ Created zip archive: ${zipFilePath}`)

          const outputInfo = {
            platform: platform.name,
            binaryPath: outputPath,
            zipPath: zipFilePath,
          }

          // Keep the current platform binary unzipped in production mode too
          if (platform.name === currentPlatform.name) {
            console.log(
              `✅ Current platform binary available at: ${outputPath}`,
            )
            outputs.push(outputInfo)
          } else {
            outputs.push(outputInfo)
            await Deno.remove(outputPath)
          }
        }
      } else {
        console.error(`❌ Build failed for ${platform.name}`)
      }
    }

    if (outputs.length > 0) {
      console.log('✅ Build process completed successfully!')

      if (isDevelopment) {
        console.log('Created binaries:')
        for (const { platform, binaryPath } of outputs) {
          console.log(`- ${binaryPath} (${platform})`)
        }

        // For development environment only, prompt to run the binary (skip in test)
        const buildOutput = outputs.find((output) =>
          output.platform === currentPlatform.name
        )
        if (buildOutput && environment === 'development') {
          const shouldRun = await promptSelect(
            'Would you like to run the build?',
            ['Yes', 'No'],
          )

          if (shouldRun === 'Yes') {
            await runBinary(buildOutput.binaryPath)
          }
        }
      } else {
        console.log('Created archives:')
        for (const output of outputs) {
          if ('zipPath' in output) {
            console.log(`- ${output.zipPath} (${output.platform})`)
          }
        }
        console.log('Available binaries:')
        for (const output of outputs) {
          if (output.platform === currentPlatform.name) {
            console.log(`- ${output.binaryPath} (${output.platform})`)
          }
        }
      }
    } else {
      throw new Error('No builds were successful.')
    }
  } catch (error) {
    console.error('Error during build:', error)
    Deno.exit(1)
  }
}

if (import.meta.main) {
  await build()
}
