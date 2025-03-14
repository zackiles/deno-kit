import { assertEquals, assertExists } from '@std/assert'
import { join } from '@std/path'
import {
  createTempDir,
  getExpectedFiles,
  restoreEnv,
  setupTestEnv,
} from './test-utils.ts'

/**
 * Run the test scenario with either the workspace flag or by changing directory
 */
async function runTestScenario(useWorkspaceFlag: boolean) {
  const tempDir = await createTempDir()
  const originalCwd = Deno.cwd()
  const originalEnv = setupTestEnv(tempDir)

  try {
    // Create the .deno-kit/backups directory structure
    const backupsDir = join(tempDir, '.deno-kit', 'backups')
    await Deno.mkdir(backupsDir, { recursive: true })

    // Create original files with known content
    const expectedFiles = await getExpectedFiles()
    const originalContents = new Map<string, string>()

    for (const file of expectedFiles) {
      const filePath = join(tempDir, file)
      await Deno.mkdir(
        join(tempDir, file.split('/').slice(0, -1).join('/')),
        { recursive: true },
      )

      // For deno.jsonc, create a valid JSON file
      const content = file === 'deno.jsonc'
        ? JSON.stringify({ name: 'test-project' }, null, 2)
        : `Original content for ${file}`

      await Deno.writeTextFile(filePath, content)
      originalContents.set(file, content)
    }

    // If not using workspace flag, change to the temporary directory
    if (!useWorkspaceFlag) {
      Deno.chdir(tempDir)
    }

    // Run setup command which should create backups
    const setupCommand = new Deno.Command(Deno.execPath(), {
      args: [
        'run',
        '--allow-all',
        join(originalCwd, 'src', 'main.ts'),
        'setup',
        ...(useWorkspaceFlag ? ['--workspace', tempDir] : []),
      ],
      env: Deno.env.toObject(),
    })

    const setupResult = await setupCommand.output()
    assertEquals(
      setupResult.code,
      0,
      'Setup command should exit with code 0',
    )

    // Verify backups were created and contain original content
    for (const file of expectedFiles) {
      const backupPath = join(backupsDir, `${file}.backup`)
      const backupInfo = await Deno.stat(backupPath)
      assertExists(backupInfo, `Backup file for ${file} should exist`)

      const backupContent = await Deno.readTextFile(backupPath)
      assertEquals(
        backupContent,
        originalContents.get(file),
        `Backup content should match original for ${file}`,
      )

      // Verify the file was replaced with template content
      const currentPath = join(tempDir, file)
      const currentContent = await Deno.readTextFile(currentPath)

      // Content should be different from original since it's from template
      if (currentContent === originalContents.get(file)) {
        throw new Error(
          `File ${file} should have been replaced with template content`,
        )
      }
    }

    // Run reset command which should restore original files
    const resetCommand = new Deno.Command(Deno.execPath(), {
      args: [
        'run',
        '--allow-all',
        join(originalCwd, 'src', 'main.ts'),
        'reset',
        ...(useWorkspaceFlag ? ['--workspace', tempDir] : []),
      ],
      env: Deno.env.toObject(),
    })

    const resetResult = await resetCommand.output()
    assertEquals(
      resetResult.code,
      0,
      'Reset command should exit with code 0',
    )

    // Verify files were restored to their original content
    for (const file of expectedFiles) {
      const filePath = join(tempDir, file)
      const restoredContent = await Deno.readTextFile(filePath)
      assertEquals(
        restoredContent,
        originalContents.get(file),
        `File ${file} should be restored to original content`,
      )
    }

    // Verify backup files were removed after reset
    for (const file of expectedFiles) {
      const backupPath = join(backupsDir, `${file}.backup`)
      try {
        await Deno.stat(backupPath)
        throw new Error(`Backup file ${backupPath} should have been removed`)
      } catch (error) {
        assertEquals(
          error instanceof Deno.errors.NotFound,
          true,
          `Backup file ${backupPath} should not exist after reset`,
        )
      }
    }
  } finally {
    // If we changed directory, change back
    if (!useWorkspaceFlag) {
      Deno.chdir(originalCwd)
    }

    restoreEnv(originalEnv)

    // Clean up: remove temporary directory
    await Deno.remove(tempDir, { recursive: true }).catch((e) =>
      console.error(
        `Cleanup error: ${e instanceof Error ? e.message : String(e)}`,
      )
    )
  }
}

Deno.test('reset command restores original files from backups (using workspace flag)', async () => {
  await runTestScenario(true)
})

Deno.test('reset command restores original files from backups (changing directory)', async () => {
  await runTestScenario(false)
})
