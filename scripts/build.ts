#!/usr/bin/env -S deno run --allow-all

/**
 * Build script for compiling the kit.ts file into an executable.
 * This script builds binaries for multiple platforms and creates zip archives.
 *
 * @module scripts/build
 */

import { join } from '@std/path'
import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from '@zip-js/zip-js'
import resolveResourcePath from '../src/utils/resource-path.ts'

/**
 * Creates a zip file from a binary file
 *
 * @param sourcePath - Path to the binary file to zip
 * @param targetPath - Path where the zip file should be saved
 * @returns Promise that resolves when the zip file has been created
 */
async function createZipFile(sourcePath: string, targetPath: string): Promise<void> {
  // Read the file
  const fileData = await Deno.readFile(sourcePath)

  // Get the filename without path
  const fileName = sourcePath.split('/').pop() || 'binary'

  // Create a zip writer and add the file
  const zipWriter = new ZipWriter(new Uint8ArrayWriter())
  await zipWriter.add(fileName, new Uint8ArrayReader(fileData))

  // Close the writer and write the zip file
  const zipData = await zipWriter.close()
  await Deno.writeFile(targetPath, zipData)
}

/**
 * Main build function that compiles the source for multiple platforms
 * and packages the binaries into zip archives
 */
async function build() {
  console.log('Starting build process...')

  try {
    const outputDir = Deno.args[0] || 'bin'

    // Handle absolute vs relative paths properly
    const isAbsolutePath = outputDir.startsWith('/') ||
      (Deno.build.os === 'windows' && /^[A-Z]:[\\\/]/.test(outputDir))

    const absoluteOutputDir = isAbsolutePath ? outputDir : join(Deno.cwd(), outputDir)

    // Create output directory if it doesn't exist
    try {
      await Deno.mkdir(absoluteOutputDir, { recursive: true })
    } catch (err) {
      if (!(err instanceof Deno.errors.AlreadyExists)) {
        throw err
      }
    }

    // Define paths
    const sourceFile = join(Deno.cwd(), 'src', 'main.ts')
    const configFile = join(Deno.cwd(), 'deno.jsonc')
    const denoConfigFile = 'deno.jsonc'
    const templatesDir = await resolveResourcePath('src/templates')
    const bannedDirsFile = 'src/utils/banned_directories_default.jsonc'
    const bannedDirsCustomFile = 'src/utils/banned_directories_custom.jsonc'

    console.log(`Source: ${sourceFile}`)
    console.log(`Output directory: ${absoluteOutputDir}`)
    console.log(`Config: ${configFile}`)

    // Define the different platform targets
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
      let outputFileName = `deno-kit-${platform.name}`

      // Add .exe extension for Windows platforms
      if (platform.name.includes('windows')) {
        outputFileName += '.exe'
      }

      const outputPath = join(absoluteOutputDir, outputFileName)

      console.log(`Building for ${platform.name} (${platform.target})...`)

      // Prepare compile arguments
      const args = [
        'compile',
        '-A',
        '--lock',
        '--config',
        configFile,
        '--target',
        platform.target,
        '--include',
        templatesDir,
        '--include',
        bannedDirsFile,
        '--include',
        bannedDirsCustomFile,
        '--include',
        denoConfigFile,
        '--output',
        outputPath,
      ]

      // Only add --reload for the first platform
      if (index === 0) {
        args.splice(2, 0, '--reload')
      }

      // Add icon for Windows platforms
      if (platform.name.includes('windows')) {
        args.push('--icon', 'assets/deno-kit.ico')
      }

      // Add the source file as the last argument
      args.push(sourceFile)

      // Run the compile command
      const command = new Deno.Command(Deno.execPath(), {
        args,
        stdout: 'inherit',
        stderr: 'inherit',
      })

      const process = command.spawn()
      const status = await process.status

      if (status.success) {
        console.log(`✅ Build completed for ${platform.name}`)

        // Set executable permissions for non-Windows platforms
        if (!platform.name.includes('windows')) {
          await Deno.chmod(outputPath, 0o755)
        }

        // Create and store the zip archive
        const zipFileName = `deno-kit-${platform.name}.zip`
        const zipFilePath = join(absoluteOutputDir, zipFileName)

        console.log(`Creating zip archive: ${zipFilePath}`)
        await createZipFile(outputPath, zipFilePath)
        console.log(`✅ Created zip archive: ${zipFilePath}`)

        outputs.push({
          platform: platform.name,
          binaryPath: outputPath,
          zipPath: zipFilePath,
        })

        // Remove the unzipped binary to save space
        await Deno.remove(outputPath)
      } else {
        console.error(`❌ Build failed for ${platform.name} with exit code:`, status.code)
      }
    }

    if (outputs.length > 0) {
      console.log('\n✅ Build process completed successfully!')
      console.log('\nCreated the following archives:')
      for (const output of outputs) {
        console.log(`- ${output.zipPath} (${output.platform})`)
      }
    } else {
      console.error('❌ No builds were successful.')
      Deno.exit(1)
    }
  } catch (error) {
    console.error('Error during build:', error)
    Deno.exit(1)
  }
}

// Run the build function
await build()
