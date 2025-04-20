#!/usr/bin/env -S deno run --allow-all

/**
 * Build script for compiling the kit.ts file into an executable.
 * This script uses Deno.compile to create a standalone binary.
 */

import { join } from '@std/path'
import resolveResourcePath from '../src/utils/resource-path.ts'

async function build() {
  console.log('Cleaning Deno cache...')
  const cleanCommand = new Deno.Command(Deno.execPath(), {
    args: ['cache', '--reload'],
    stdout: 'inherit',
    stderr: 'inherit',
  })
  await cleanCommand.spawn().status

  console.log('Starting build process...')

  try {
    // Add an argument for the output directory
    const outputDir = Deno.args[0] || 'build'

    // Define the source file (kit.ts)
    const sourceFile = join(Deno.cwd(), 'src', 'main.ts')

    // Use Deno.args[0] directly if it exists
    const outputFile = Deno.args[0] ? join(Deno.args[0], 'kit') : join(Deno.cwd(), outputDir, 'kit')

    // Define the config file path
    const configFile = join(Deno.cwd(), 'deno.jsonc')

    console.log(`Source: ${sourceFile}`)
    console.log(`Output: ${outputFile}`)
    console.log(`Config: ${configFile}`)

    // Determine the target based on the OS
    let target = ''
    const os = Deno.build.os
    const arch = Deno.build.arch

    if (os === 'darwin') {
      target = arch === 'aarch64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin'
    } else if (os === 'windows') {
      target = 'x86_64-pc-windows-msvc'
    } else if (os === 'linux') {
      target = arch === 'aarch64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu'
    } else {
      throw new Error(`Unsupported OS: ${os}`)
    }

    console.log(`Using target: ${target}`)

    // Resolve the path to the templates directory
    const templatesDir = await resolveResourcePath('src/templates')

    // Resolve the path to the banned directories file
    const bannedDirsFile = 'src/utils/banned_directories_default.jsonc'
    const bannedDirsCustomFile = 'src/utils/banned_directories_custom.jsonc'

    // Define the deno config file path
    const denoConfigFile = 'deno.jsonc'

    // Compile the source file into a binary
    const command = new Deno.Command(Deno.execPath(), {
      args: [
        'compile',
        '--allow-all',
        '--no-check',
        '--config',
        configFile,
        '--target',
        target,
        '--include',
        templatesDir,
        '--include',
        bannedDirsFile,
        '--include',
        bannedDirsCustomFile,
        '--include',
        denoConfigFile,
        '--output',
        outputFile,
        sourceFile,
      ],
      stdout: 'inherit',
      stderr: 'inherit',
    })

    // Spawn the process and wait for it to complete
    const process = command.spawn()
    const status = await process.status

    if (status.success) {
      console.log('✅ Build completed successfully!')

      // Set executable permissions (rwxr-xr-x)
      // 0o755 = Owner: rwx, Group: r-x, Others: r-x
      await Deno.chmod(outputFile, 0o755)
      console.log('✅ Executable permissions set')

      console.log(`Executable created at: ${outputFile}`)
      console.log('Try running it with: ./kit')
    } else {
      console.error('❌ Build failed with exit code:', status.code)
      Deno.exit(status.code)
    }
  } catch (error) {
    console.error('Error during build:', error)
    Deno.exit(1)
  }
}

// Run the build function
await build()
