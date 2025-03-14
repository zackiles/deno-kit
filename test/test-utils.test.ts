import { assertEquals, assertExists } from '@std/assert'
import { join } from '@std/path'
import {
  createTempDir,
  getExpectedFiles,
  mockGitClone,
  restoreEnv,
  runDenoKitCommand,
  setupTestEnv,
  setupTestProject,
  verifyUpdateResults,
} from './test-utils.ts'
import { TEMPLATE_MAPPINGS } from '../src/commands/setup.ts'

Deno.test('getExpectedFiles returns the correct list of files', async () => {
  const expectedFiles = await getExpectedFiles()

  assertEquals(
    expectedFiles.length > 0,
    true,
    'Should return at least one expected file',
  )

  for (const destPath of Object.values(TEMPLATE_MAPPINGS) as string[]) {
    const normalizedPath = destPath.startsWith('./')
      ? destPath.slice(2)
      : destPath
    assertEquals(
      expectedFiles.includes(normalizedPath),
      true,
      `Expected files should include ${normalizedPath}`,
    )
  }
})

Deno.test('createTempDir creates a temporary directory', async () => {
  const tempDir = await createTempDir('test-utils-test-')

  try {
    const dirInfo = await Deno.stat(tempDir)
    assertExists(dirInfo, 'Temporary directory should exist')
    assertEquals(dirInfo.isDirectory, true, 'Should be a directory')

    const dirName = tempDir.split('/').pop() || ''
    assertEquals(
      dirName.startsWith('test-utils-test-'),
      true,
      'Directory name should start with the specified prefix',
    )
  } finally {
    await Deno.remove(tempDir, { recursive: true })
  }
})

Deno.test('setupTestEnv and restoreEnv work correctly', () => {
  const originalTestMode = Deno.env.get('DENO_KIT_TEST_MODE')
  const originalPackageName = Deno.env.get('DENO_KIT_PACKAGE_NAME')

  const tempDir = '/fake/test/dir'
  const storedEnv = setupTestEnv(tempDir)

  assertEquals(
    Deno.env.get('DENO_KIT_TEST_MODE'),
    'true',
    'Test mode should be enabled',
  )
  assertEquals(
    Deno.env.get('DENO_KIT_WORKSPACE'),
    tempDir,
    'Workspace should be set to temp dir',
  )
  assertEquals(
    Deno.env.get('DENO_KIT_PACKAGE_NAME'),
    '@test/example',
    'Package name should be set',
  )

  restoreEnv(storedEnv)

  assertEquals(
    Deno.env.get('DENO_KIT_TEST_MODE'),
    originalTestMode,
    'Test mode should be restored',
  )
  assertEquals(
    Deno.env.get('DENO_KIT_PACKAGE_NAME'),
    originalPackageName,
    'Package name should be restored',
  )
})

Deno.test('mockGitClone creates the expected mock structure', async () => {
  const tempDir = await createTempDir('git-mock-test-')

  try {
    await mockGitClone(tempDir)

    const repoDir = join(tempDir, 'mock-cursor-config')
    const cursorDir = join(repoDir, '.cursor')
    const rulesDir = join(cursorDir, 'rules')

    const docsFile = join(repoDir, 'how-cursor-rules-work.md')
    const docsInfo = await Deno.stat(docsFile)
    assertExists(docsInfo, 'Documentation file should exist')
    assertEquals(docsInfo.isFile, true, 'Documentation file should be a file')

    const rulesDirInfo = await Deno.stat(rulesDir)
    assertExists(rulesDirInfo, 'Rules directory should exist')
    assertEquals(
      rulesDirInfo.isDirectory,
      true,
      'Rules directory should be a directory',
    )

    const ruleFiles = [
      'sample-rule.mdc',
      'another-rule.mdc',
      'nested/nested-rule.mdc',
    ]
    for (const ruleFile of ruleFiles) {
      const rulePath = join(rulesDir, ruleFile)
      const ruleInfo = await Deno.stat(rulePath)
      assertExists(ruleInfo, `Rule file ${ruleFile} should exist`)
      assertEquals(ruleInfo.isFile, true, `${ruleFile} should be a file`)

      const content = await Deno.readTextFile(rulePath)
      assertEquals(content.length > 0, true, `${ruleFile} should have content`)
    }
  } finally {
    await Deno.remove(tempDir, { recursive: true })
  }
})

Deno.test('runDenoKitCommand function has correct structure', () => {
  assertEquals(
    typeof runDenoKitCommand,
    'function',
    'runDenoKitCommand should be a function',
  )
})

Deno.test('setupTestProject and verifyUpdateResults are exported correctly', () => {
  assertEquals(
    typeof setupTestProject,
    'function',
    'setupTestProject should be a function',
  )
  assertEquals(
    typeof verifyUpdateResults,
    'function',
    'verifyUpdateResults should be a function',
  )
})
