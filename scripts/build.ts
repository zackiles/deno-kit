#!/usr/bin/env -S deno run --allow-all

/**
 * Build script for compiling the kit.ts file into an executable.
 * This script uses Deno.compile to create a standalone binary.
 */

import { join } from '@std/path'
import getConfig from '../src/config-oldd.ts'

async function build() {
  console.log('Building kit executable...')

  try {
    // Get project configuration
    const config = await getConfig()

    // Define the source file (kit.ts)
    const sourceFile = join(config.kitDir, 'kit.ts')

    // Define the output file path
    const outputFile = join(config.workspaceDir, 'kit')

    // Define the config file path
    const configFile = join(config.kitDir, 'deno.jsonc')

    console.log(`Source: ${sourceFile}`)
    console.log(`Output: ${outputFile}`)
    console.log(`Config: ${configFile}`)

    // First, create a temporary version of kit.ts with absolute paths
    const tempKitPath = join(config.kitDir, 'kit.temp.ts')
    const kitContent = await Deno.readTextFile(sourceFile)

    // Replace the relative path with an absolute path to main.ts
    const mainTsPath = join(config.kitDir, 'main.ts')
    const modifiedContent = kitContent.replace(
      "'.deno-kit/main.ts'",
      `'${mainTsPath}'`,
    )

    await Deno.writeTextFile(tempKitPath, modifiedContent)
    console.log('✅ Created temporary kit file with absolute paths')

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

    // Compile the temporary kit.ts file
    const command = new Deno.Command(Deno.execPath(), {
      args: [
        'compile',
        '--allow-read',
        '--allow-write',
        '--allow-env',
        '--allow-run',
        '--allow-net',
        '--config',
        configFile,
        '--target',
        target,
        '--output',
        outputFile,
        tempKitPath,
      ],
      stdout: 'inherit',
      stderr: 'inherit',
    })

    // Spawn the process and wait for it to complete
    const process = command.spawn()
    const status = await process.status

    // Clean up the temporary file
    try {
      await Deno.remove(tempKitPath)
      console.log('✅ Cleaned up temporary files')
    } catch (error) {
      console.warn('Warning: Failed to clean up temporary file:', error)
    }

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
