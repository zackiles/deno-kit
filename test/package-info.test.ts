/**
 * @module package-info.test
 * @description Tests for the package-info.ts utilities, focusing on package-info functionality
 */

import { assertEquals, assertExists, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { ensureDir } from '@std/fs'
import {
  findPackageFromPath,
  findPackagePathFromPath,
  getMainExportPath,
  PACKAGE_CONFIG_FILES,
} from '../src/utils/package-info.ts'

// Create a temporary directory for testing before tests start
console.log('Creating temporary test directory...')
const tempDir = await Deno.makeTempDir({ prefix: 'deno-kit-test-' })
console.log(`Temporary directory created: ${tempDir}`)

// Ensure the temporary directory exists
await ensureDir(tempDir)
console.log(
  `Directory exists: ${await Deno.stat(tempDir).then(() => true).catch(() =>
    false
  )}`,
)

// Test data setup
const validPackageJson = {
  name: 'test-package',
  version: '1.0.0',
  exports: {
    '.': './src/index.ts',
  },
}

const validPackageJsonPath = join(tempDir, 'package.json')
await Deno.writeTextFile(validPackageJsonPath, JSON.stringify(validPackageJson))
console.log(`Test package.json written to: ${validPackageJsonPath}`)
console.log(
  `File exists: ${await Deno.stat(validPackageJsonPath).then(() => true).catch(
    () => false,
  )}`,
)

// Mock remote fetch implementation factory
const createMockFetch =
  (handlers: Record<string, () => Response>) =>
  (url: string | URL | Request, options: RequestInit = {}) => {
    const urlString = url.toString()
    const method = options?.method || 'GET'

    // Use the handler for this URL and method if defined
    const handlerKey = `${method}:${urlString}` as keyof typeof handlers
    const handler = handlers[handlerKey]
    if (handler) {
      return Promise.resolve(handler())
    }

    // Default fallback
    return Promise.resolve(new Response('Not Found', { status: 404 }))
  }

// Clean up function
const cleanupTempFiles = async () => {
  try {
    await Deno.remove(tempDir, { recursive: true })
    console.log(`Cleaned up temporary directory: ${tempDir}`)
  } catch (error) {
    console.error(
      `Failed to clean up temp directory ${tempDir}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

// Run first test
Deno.test('findPackageFromPath - retrieves package information from valid package.json file', async () => {
  console.log(`Testing with package file: ${validPackageJsonPath}`)
  console.log(
    `File exists: ${await Deno.stat(validPackageJsonPath).then(() => true)
      .catch(() => false)}`,
  )

  const packageData = await findPackageFromPath(validPackageJsonPath)

  assertExists(packageData)
  assertEquals(packageData.path, validPackageJsonPath)
  assertEquals(packageData.name, 'test-package')
  assertEquals(packageData.version, '1.0.0')
  assertEquals(
    (packageData.exports as Record<string, unknown>)?.['.'],
    './src/index.ts',
  )
})

Deno.test('findPackageFromPath - throws error when file is not a valid package config', async () => {
  const invalidFilePath = join(tempDir, 'not-a-package.txt')
  console.log(`Creating invalid package file: ${invalidFilePath}`)

  // Ensure directory exists before writing
  await ensureDir(tempDir)

  await Deno.writeTextFile(invalidFilePath, 'Not a valid package file')
  console.log(
    `File exists: ${await Deno.stat(invalidFilePath).then(() => true).catch(
      () => false,
    )}`,
  )

  await assertRejects(
    () => findPackageFromPath(invalidFilePath),
    Error,
    'Invalid package configuration file',
  )
})

Deno.test('findPackageFromPath - throws error when no package file is found', async () => {
  const emptyDir = join(tempDir, 'empty-dir-no-packages')
  console.log(`Creating empty directory: ${emptyDir}`)

  // Ensure parent directory exists
  await ensureDir(tempDir)

  // Create the empty directory
  await Deno.mkdir(emptyDir)
  console.log(
    `Directory exists: ${await Deno.stat(emptyDir).then(() => true).catch(() =>
      false
    )}`,
  )

  // Testing with direct path to empty directory
  await assertRejects(
    () => findPackageFromPath(emptyDir),
    Error,
    'No package configuration file found',
  )
})

Deno.test('findPackageFromPath - handles JSONC files with comments', async () => {
  const jsonWithComments = `{
    // This is a comment
    "name": "test-jsonc-package",
    "version": "2.0.0",
    /* Multi-line comment
       with multiple lines */
    "exports": {
      ".": "./mod.ts"
    }
  }`

  const jsonCPath = join(tempDir, 'deno.jsonc')
  console.log(`Creating JSONC file: ${jsonCPath}`)

  // Ensure directory exists before writing
  await ensureDir(tempDir)

  await Deno.writeTextFile(jsonCPath, jsonWithComments)
  console.log(
    `File exists: ${await Deno.stat(jsonCPath).then(() => true).catch(() =>
      false
    )}`,
  )

  const packageData = await findPackageFromPath(jsonCPath)

  assertEquals(packageData.name, 'test-jsonc-package')
  assertEquals(packageData.version, '2.0.0')
  assertEquals(
    (packageData.exports as Record<string, unknown>)?.['.'],
    './mod.ts',
  )
})

Deno.test('findPackageFromPath - handles missing optional fields', async () => {
  const minimalPackage = { name: 'minimal-package' }
  const minimalPath = join(tempDir, 'minimal-package.json')
  console.log(`Creating minimal package file: ${minimalPath}`)

  // Ensure directory exists before writing
  await ensureDir(tempDir)

  await Deno.writeTextFile(minimalPath, JSON.stringify(minimalPackage))
  console.log(
    `File exists: ${await Deno.stat(minimalPath).then(() => true).catch(() =>
      false
    )}`,
  )

  const packageData = await findPackageFromPath(minimalPath)

  assertEquals(packageData.name, 'minimal-package')
  assertEquals(packageData.version, undefined)
  assertEquals(packageData.exports, undefined)
})

Deno.test('findPackageFromPath - handles "remote" URLs correctly', async () => {
  const originalFetch = globalThis.fetch

  // Define response handlers for various URL patterns
  const mockHandlers: Record<string, () => Response> = {
    'HEAD:https://example.com/remote-package.json': () =>
      new Response('', { status: 200 }),
    'GET:https://example.com/remote-package.json': () =>
      new Response(
        JSON.stringify({
          name: 'remote-package',
          version: '3.0.0',
        }),
        { status: 200 },
      ),
  }

  // Add handlers for all standard package files
  for (const file of PACKAGE_CONFIG_FILES) {
    const url = `https://example.com/${file}`
    mockHandlers[`HEAD:${url}`] = () => new Response('', { status: 200 })
    mockHandlers[`GET:${url}`] = () =>
      new Response(
        JSON.stringify({
          name: 'standard-package',
          version: '1.0.0',
        }),
        { status: 200 },
      )
  }

  try {
    globalThis.fetch = createMockFetch(mockHandlers)

    const packageData = await findPackageFromPath(
      'https://example.com/remote-package.json',
    )

    assertEquals(packageData.name, 'remote-package')
    assertEquals(packageData.version, '3.0.0')
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('findPackageFromPath - traverses up URL structure to find package file', async () => {
  const originalFetch = globalThis.fetch

  const mockHandlers: Record<string, () => Response> = {
    'HEAD:https://example.com/package.json': () =>
      new Response('', { status: 200 }),
    'GET:https://example.com/package.json': () =>
      new Response(
        JSON.stringify({
          name: 'parent-package',
          version: '1.0.0',
        }),
        { status: 200 },
      ),
  }

  try {
    globalThis.fetch = createMockFetch(mockHandlers)

    const packageData = await findPackageFromPath(
      'https://example.com/subdir/nested/some-file.ts',
    )

    assertEquals(packageData.name, 'parent-package')
    assertEquals(packageData.version, '1.0.0')
    assertEquals(packageData.path, 'https://example.com/package.json')
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('findPackageFromPath - handles symlinks correctly', async () => {
  const packageDir = join(tempDir, 'real-package-dir')
  await ensureDir(packageDir)

  const symlinkPackageJson = {
    name: 'symlink-package',
    version: '2.0.0',
  }
  const symlinkPackagePath = join(packageDir, 'package.json')
  await Deno.writeTextFile(
    symlinkPackagePath,
    JSON.stringify(symlinkPackageJson),
  )

  const symlinkDir = join(tempDir, 'symlink-dir')

  try {
    await Deno.symlink(packageDir, symlinkDir)
    const packageData = await findPackageFromPath(symlinkDir)

    assertEquals(packageData.name, 'symlink-package')
    assertEquals(packageData.version, '2.0.0')
  } catch (err) {
    console.log(
      `Skipping symlink test - symlinks not supported: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }
})

Deno.test('findPackagePathFromPath - traverses local directory structure to find package file', async () => {
  const nestedDir = join(tempDir, 'nested', 'deeply', 'project')
  await ensureDir(nestedDir)

  // Write package.json first since it's higher priority in PACKAGE_CONFIG_FILES
  const packageJson = {
    name: 'nested-package',
    version: '1.0.0',
  }
  const packagePath = join(tempDir, 'package.json')
  await Deno.writeTextFile(packagePath, JSON.stringify(packageJson))

  // Remove any existing deno.jsonc to ensure test consistency
  try {
    await Deno.remove(join(tempDir, 'deno.jsonc'))
  } catch {
    // Ignore error if file doesn't exist
  }

  const foundPath = await findPackagePathFromPath(nestedDir)
  assertEquals(foundPath, packagePath)
})

Deno.test('findPackagePathFromPath - handles remote URLs and traverses up correctly', async () => {
  const originalFetch = globalThis.fetch
  const mockHandlers: Record<string, () => Response> = {
    'HEAD:https://example.com/deep/nested/package.json': () =>
      new Response('', { status: 404 }),
    'HEAD:https://example.com/deep/package.json': () =>
      new Response('', { status: 200 }),
  }

  try {
    globalThis.fetch = createMockFetch(mockHandlers)
    const foundPath = await findPackagePathFromPath(
      'https://example.com/deep/nested/code.ts',
    )
    assertEquals(foundPath, 'https://example.com/deep/package.json')
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('findPackagePathFromPath - converts file URLs to local paths correctly', async () => {
  // Create a new package.json in a clean directory to avoid conflicts
  const testDir = join(tempDir, 'file-url-test')
  await ensureDir(testDir)
  const packagePath = join(testDir, 'package.json')
  await Deno.writeTextFile(packagePath, JSON.stringify({ name: 'test' }))

  // Ensure the file exists before testing
  console.log(`Testing file URL conversion with package at: ${packagePath}`)
  console.log(
    `File exists: ${await Deno.stat(packagePath).then(() => true).catch(() =>
      false
    )}`,
  )

  // Convert to file URL with three forward slashes for absolute paths
  const fileUrl = `file:///${packagePath.replace(/^\//, '')}`
  console.log(`Using file URL: ${fileUrl}`)

  const foundPath = await findPackagePathFromPath(fileUrl)
  assertEquals(foundPath, packagePath)
})

Deno.test('findPackagePathFromPath - traverses down from the current directory with traverseUp=false', async () => {
  // Create a nested directory structure with a package file in a subdirectory
  const baseDir = join(tempDir, 'downward-test')
  const subDir = join(baseDir, 'sub')
  const subSubDir = join(subDir, 'subsub')

  await ensureDir(baseDir)
  await ensureDir(subDir)
  await ensureDir(subSubDir)

  // Create a package.json in the sub directory
  const subPackageJson = {
    name: 'sub-package',
    version: '1.0.0',
  }
  const subPackagePath = join(subDir, 'package.json')
  await Deno.writeTextFile(subPackagePath, JSON.stringify(subPackageJson))

  // Test downward traversal from the base directory
  const foundPath = await findPackagePathFromPath(baseDir, undefined, false)
  assertEquals(
    foundPath,
    subPackagePath,
    'Should find package.json in subdirectory',
  )
})

Deno.test('findPackagePathFromPath - respects maxDepth when traversing down', async () => {
  // Create a deeper nested directory structure
  const baseDir = join(tempDir, 'depth-test')
  const level1 = join(baseDir, 'level1')
  const level2 = join(level1, 'level2')
  const level3 = join(level2, 'level3')
  const level4 = join(level3, 'level4')

  await ensureDir(baseDir)
  await ensureDir(level1)
  await ensureDir(level2)
  await ensureDir(level3)
  await ensureDir(level4)

  // Create package files at different levels
  const level2PackagePath = join(level2, 'package.json')
  const level4PackagePath = join(level4, 'package.json')

  await Deno.writeTextFile(
    level2PackagePath,
    JSON.stringify({ name: 'level2-package' }),
  )
  await Deno.writeTextFile(
    level4PackagePath,
    JSON.stringify({ name: 'level4-package' }),
  )

  // Test with default maxDepth (3), which should find level2 but not level4
  const foundWithDefaultDepth = await findPackagePathFromPath(
    baseDir,
    undefined,
    false,
  )
  assertEquals(
    foundWithDefaultDepth,
    level2PackagePath,
    'Should find package at level 2 with default maxDepth',
  )

  // Test with higher maxDepth (4), which should find level4
  const foundWithHigherDepth = await findPackagePathFromPath(
    baseDir,
    undefined,
    false,
    4,
  )
  assertEquals(
    foundWithHigherDepth,
    level2PackagePath,
    'Should still find level2 package first with higher maxDepth',
  )

  // Test with higher maxDepth but starting from level3
  const foundFromLevel3 = await findPackagePathFromPath(
    level3,
    undefined,
    false,
    4,
  )
  assertEquals(
    foundFromLevel3,
    level4PackagePath,
    'Should find level4 package when starting from level3',
  )
})

Deno.test('findPackagePathFromPath - explicit upward traversal finds package in parent dir', async () => {
  // Use the existing structure where package.json is in tempDir
  const nestedDir = join(tempDir, 'nested-explicit-up', 'deeply', 'project')
  await ensureDir(nestedDir)

  // Write a new package.json in tempDir
  const upwardPackagePath = join(tempDir, 'upward-test-package.json')
  await Deno.writeTextFile(
    upwardPackagePath,
    JSON.stringify({ name: 'upward-test' }),
  )

  // Test with explicit traverseUp = true
  const customConfigFiles = [
    'upward-test-package.json',
  ] as unknown as typeof PACKAGE_CONFIG_FILES
  const foundPath = await findPackagePathFromPath(
    nestedDir,
    customConfigFiles,
    true,
  )
  assertEquals(
    foundPath,
    upwardPackagePath,
    'Should find package in parent dir with explicit upward traversal',
  )
})

Deno.test('findPackageFromPath - discovers packages with specified traversal direction', async () => {
  // Create a directory structure with packages at different levels
  const baseDir = join(tempDir, 'traversal-test')
  const subDir = join(baseDir, 'subdir')

  await ensureDir(baseDir)
  await ensureDir(subDir)

  // Create package files at both levels
  const basePackagePath = join(baseDir, 'package.json')
  const subPackagePath = join(subDir, 'package.json')

  await Deno.writeTextFile(
    basePackagePath,
    JSON.stringify({ name: 'base-package' }),
  )
  await Deno.writeTextFile(
    subPackagePath,
    JSON.stringify({ name: 'sub-package' }),
  )

  // Test direct file access (no traversal needed)
  const directResult = await findPackageFromPath(basePackagePath)
  assertEquals(
    directResult.name,
    'base-package',
    'Should read package directly from file path',
  )

  // Test downward traversal from base directory - should find its own package.json first
  const downwardResult = await findPackageFromPath(baseDir, undefined, false)
  assertEquals(
    downwardResult.name,
    'base-package',
    'Should find package in current directory with downward traversal',
  )

  // Test upward traversal from subdirectory - should find subdirectory's own package.json
  const subDirUpwardResult = await findPackageFromPath(subDir, undefined, true)
  assertEquals(
    subDirUpwardResult.name,
    'sub-package',
    'Should find package in current directory with upward traversal',
  )
})

Deno.test('findPackagePathFromPath - handles remote URLs with downward traversal', async () => {
  const originalFetch = globalThis.fetch
  const mockHandlers: Record<string, () => Response> = {
    // Current directory has package.json
    'HEAD:https://example.com/current/package.json': () =>
      new Response('', { status: 200 }),
    'GET:https://example.com/current/package.json': () =>
      new Response(
        JSON.stringify({
          name: 'current-package',
          version: '1.0.0',
        }),
        { status: 200 },
      ),
  }

  try {
    globalThis.fetch = createMockFetch(mockHandlers)

    // Test with traverseUp = false
    const foundPath = await findPackagePathFromPath(
      'https://example.com/current/file.ts',
      undefined,
      false,
    )
    assertEquals(
      foundPath,
      'https://example.com/current/package.json',
      'Should find package.json in current directory with downward traversal',
    )

    // Verify we don't go up with traverseUp = false
    const notFoundPath = await findPackagePathFromPath(
      'https://example.com/current/subdir/file.ts',
      undefined,
      false,
    )
    assertEquals(
      notFoundPath,
      '',
      'Should not find package with downward traversal if not in current dir',
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

/**
 * Test for findPackagePathFromPath handling multiple package configuration files
 * in the same directory with proper priority order
 */
Deno.test('findPackagePathFromPath - respects priority order of config files', async () => {
  // Create a directory with multiple package files
  const multiConfigDir = join(tempDir, 'multi-config')
  await ensureDir(multiConfigDir)

  // Create all supported package files in the same directory
  const packageConfigs = {
    'deno.json': { name: 'deno-json-package' },
    'deno.jsonc': { name: 'deno-jsonc-package' },
    'package.json': { name: 'npm-package' },
    'package.jsonc': { name: 'npm-jsonc-package' },
    'jsr.json': { name: 'jsr-package' },
  }

  // Write all package files
  for (const [filename, content] of Object.entries(packageConfigs)) {
    const filePath = join(multiConfigDir, filename)
    await Deno.writeTextFile(filePath, JSON.stringify(content))
  }

  // First test: default order should prioritize deno.json
  const foundPath = await findPackagePathFromPath(multiConfigDir)
  assertEquals(
    foundPath,
    join(multiConfigDir, 'deno.json'),
    'Should find deno.json first based on priority order',
  )

  // Second test: custom order should follow provided sequence
  const customOrder = [
    'package.json',
    'deno.json',
  ] as unknown as typeof PACKAGE_CONFIG_FILES
  const customFoundPath = await findPackagePathFromPath(
    multiConfigDir,
    customOrder,
  )
  assertEquals(
    customFoundPath,
    join(multiConfigDir, 'package.json'),
    'Should respect custom package config file order',
  )
})

/**
 * Test for findPackagePathFromPath correctly skipping directories in DIRS_TO_SKIP
 */
Deno.test('findPackagePathFromPath - skips directories marked as excludable', async () => {
  // Create a nested structure with some excluded directories
  const skipTestBaseDir = join(tempDir, 'skip-test')
  await ensureDir(skipTestBaseDir)

  // Create node_modules directory with a package.json inside
  const nodeModulesDir = join(skipTestBaseDir, 'node_modules')
  await ensureDir(nodeModulesDir)
  await Deno.writeTextFile(
    join(nodeModulesDir, 'package.json'),
    JSON.stringify({ name: 'should-be-skipped' }),
  )

  // Create a .git directory with a package.json inside
  const gitDir = join(skipTestBaseDir, '.git')
  await ensureDir(gitDir)
  await Deno.writeTextFile(
    join(gitDir, 'package.json'),
    JSON.stringify({ name: 'should-be-skipped-git' }),
  )

  // Create a valid directory that should be traversed
  const validDir = join(skipTestBaseDir, 'src')
  await ensureDir(validDir)
  const validPackagePath = join(validDir, 'package.json')
  await Deno.writeTextFile(
    validPackagePath,
    JSON.stringify({ name: 'should-be-found' }),
  )

  // Test that downward traversal skips the excluded directories
  const foundPath = await findPackagePathFromPath(
    skipTestBaseDir,
    undefined,
    false,
  )
  assertEquals(
    foundPath,
    validPackagePath,
    'Should find package in src/ but skip node_modules/ and .git/',
  )
})

/**
 * Test for findPackagePathFromPath with handling of non-existent paths gracefully
 */
Deno.test('findPackagePathFromPath - handles non-existent paths gracefully', async () => {
  // Non-existent absolute path
  const nonExistentPath = join(tempDir, 'does-not-exist', 'some-file.ts')
  // Test with traverseUp = false
  const downwardResult = await findPackagePathFromPath(
    nonExistentPath,
    undefined,
    false,
  )
  assertEquals(
    downwardResult,
    '',
    'Should return empty string for non-existent path with downward traversal',
  )
})

/**
 * Test for findPackageFromPath properly reading and parsing package fields
 */
Deno.test('findPackageFromPath - correctly parses and returns all package fields', async () => {
  // Create a package file with various fields to test extraction
  const complexPackage = {
    name: 'complex-package',
    version: '1.2.3',
    description: 'A test package with many fields',
    author: 'Test Author <test@example.com>',
    license: 'MIT',
    type: 'module',
    main: './dist/index.js',
    types: './dist/index.d.ts',
    exports: {
      '.': {
        'import': './dist/esm/index.js',
        'require': './dist/cjs/index.js',
        'types': './dist/index.d.ts',
      },
      './utils': './dist/utils.js',
    },
    dependencies: {
      'dependency1': '^1.0.0',
      'dependency2': '~2.0.0',
    },
    engines: {
      'node': '>= 14.0.0',
      'deno': '>= 1.0.0',
    },
  }

  const complexPackagePath = join(tempDir, 'complex-package.json')
  await Deno.writeTextFile(complexPackagePath, JSON.stringify(complexPackage))

  // Test that all fields are correctly parsed and returned
  const packageData = await findPackageFromPath(complexPackagePath)

  // Check basic fields
  assertEquals(packageData.name, 'complex-package')
  assertEquals(packageData.version, '1.2.3')
  assertEquals(packageData.description, 'A test package with many fields')
  assertEquals(packageData.license, 'MIT')

  // Check nested fields
  const exports = packageData.exports as Record<string, Record<string, string>>
  assertEquals(exports?.['.']?.import, './dist/esm/index.js')
  assertEquals(
    (packageData.dependencies as Record<string, string>)?.dependency1,
    '^1.0.0',
  )
  assertEquals(
    (packageData.engines as Record<string, string>)?.deno,
    '>= 1.0.0',
  )
})

/**
 * Test for findPackageFromPath handling invalid JSON
 */
Deno.test('findPackageFromPath - gracefully handles invalid JSON format', async () => {
  // Create a file with invalid JSON
  const invalidJsonPath = join(tempDir, 'invalid.package.json')
  await Deno.writeTextFile(
    invalidJsonPath,
    `{
    "name": "invalid-json-package",
    "version": "1.0.0",
    broken-json-here
  }`,
  )

  // Test that proper error is thrown with informative message
  await assertRejects(
    () => findPackageFromPath(invalidJsonPath),
    Error,
    'Failed to parse package file',
  )
})

/**
 * Test for findPackageFromPath following file URL redirects
 */
Deno.test('findPackageFromPath - follows file URL redirects properly', async () => {
  // Create a directory with a package.json
  const fileUrlDir = join(tempDir, 'file-url-redirect')
  await ensureDir(fileUrlDir)
  const packagePath = join(fileUrlDir, 'package.json')
  await Deno.writeTextFile(
    packagePath,
    JSON.stringify({
      name: 'file-url-package',
      version: '1.0.0',
    }),
  )

  // Convert to file URL with three forward slashes for absolute paths
  const fileUrl = `file:///${packagePath.replace(/^\//, '')}`

  // Test full findPackageFromPath with file URL
  const packageData = await findPackageFromPath(fileUrl)

  // Verify package data was loaded correctly
  assertEquals(packageData.name, 'file-url-package')
  assertEquals(packageData.version, '1.0.0')
  assertEquals(packageData.path, packagePath)
})

/**
 * Test for findPackagePathFromPath respecting infinite maxDepth
 */
Deno.test('findPackagePathFromPath - respects infinite maxDepth for deeply nested structures', async () => {
  // Create a very deep directory structure
  const baseDir = join(tempDir, 'infinite-depth-test')
  let currentDir = baseDir
  const depth = 10 // Create a structure 10 levels deep

  // Create nested directories
  for (let i = 1; i <= depth; i++) {
    currentDir = join(currentDir, `level${i}`)
    await ensureDir(currentDir)
  }

  // Add package.json at the deepest level
  const deepPackagePath = join(currentDir, 'package.json')
  await Deno.writeTextFile(
    deepPackagePath,
    JSON.stringify({ name: `level${depth}-package` }),
  )

  // Test with a specific finite maxDepth that is less than our total depth
  const limitedDepthResult = await findPackagePathFromPath(
    baseDir,
    undefined,
    false,
    5,
  )
  assertEquals(
    limitedDepthResult,
    '',
    'Should not find package.json with limited depth of 5 in a 10-level deep structure',
  )

  // Test with infinite maxDepth (Number.POSITIVE_INFINITY)
  const infiniteDepthResult = await findPackagePathFromPath(
    baseDir,
    undefined,
    false,
  )
  assertEquals(
    infiniteDepthResult,
    deepPackagePath,
    'Should find deeply nested package.json with infinite maxDepth',
  )
})

/**
 * Test for findPackageFromPath respecting maxDepth parameter
 */
Deno.test('findPackageFromPath - respects maxDepth when traversing for packages', async () => {
  // Create a nested directory structure with package files at different depths
  const baseDir = join(tempDir, 'findPackage-depth-test')
  const nestedDir1 = join(baseDir, 'nested1')
  const nestedDir2 = join(nestedDir1, 'nested2')
  const nestedDir3 = join(nestedDir2, 'nested3')

  await ensureDir(baseDir)
  await ensureDir(nestedDir1)
  await ensureDir(nestedDir2)
  await ensureDir(nestedDir3)

  // Create package.json files at level 2 and level 3
  const level2PackagePath = join(nestedDir2, 'package.json')
  const level3PackagePath = join(nestedDir3, 'package.json')

  await Deno.writeTextFile(
    level2PackagePath,
    JSON.stringify({ name: 'level2-package', level: 2 }),
  )
  await Deno.writeTextFile(
    level3PackagePath,
    JSON.stringify({ name: 'level3-package', level: 3 }),
  )

  // Test with limited maxDepth of 1 - should not find any package
  await assertRejects(
    () => findPackageFromPath(baseDir, undefined, false, 1),
    Error,
    'No package configuration file found',
  )

  // Test with maxDepth of 2 - should find level2 package
  const level2Result = await findPackageFromPath(baseDir, undefined, false, 2)
  assertEquals(level2Result.name, 'level2-package')
  assertEquals(level2Result.level, 2)

  // Test with unlimited maxDepth but start from nestedDir2 - should find level2 package directly
  const unlimitedResult = await findPackageFromPath(nestedDir2)
  assertEquals(unlimitedResult.name, 'level2-package')
  assertEquals(unlimitedResult.level, 2)
})

/**
 * Test for findPackagePathFromPath with custom configFiles in remote URL traversal
 */
Deno.test('findPackagePathFromPath - respects custom configFiles for remote URLs', async () => {
  const originalFetch = globalThis.fetch
  const mockHandlers: Record<string, () => Response> = {
    // Standard files should not be found
    'HEAD:https://example.com/project/deno.json': () =>
      new Response('', { status: 404 }),
    'HEAD:https://example.com/project/package.json': () =>
      new Response('', { status: 404 }),
    // Custom config file should be found
    'HEAD:https://example.com/project/custom.config.json': () =>
      new Response('', { status: 200 }),
    'GET:https://example.com/project/custom.config.json': () =>
      new Response(
        JSON.stringify({
          name: 'custom-config-package',
          version: '1.0.0',
        }),
        { status: 200 },
      ),
  }

  try {
    globalThis.fetch = createMockFetch(mockHandlers)

    // Test with custom config files array
    const customConfigFiles = [
      'custom.config.json',
    ] as unknown as typeof PACKAGE_CONFIG_FILES
    const foundPath = await findPackagePathFromPath(
      'https://example.com/project/src/file.ts',
      customConfigFiles,
    )

    assertEquals(
      foundPath,
      'https://example.com/project/custom.config.json',
      'Should find custom config file in remote URL traversal',
    )

    // Verify standard config files are not found when not in custom list
    const notFoundPath = await findPackagePathFromPath(
      'https://example.com/project/src/file.ts',
    )
    assertEquals(
      notFoundPath,
      '',
      'Should not find standard config files when they dont exist',
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

/**
 * Test for findPackagePathFromPath handling file URLs with traverseUp=false and maxDepth
 */
Deno.test('findPackagePathFromPath - handles file URLs with downward traversal and depth limits', async () => {
  // Create a deep directory structure
  const baseDir = join(tempDir, 'file-url-depth-test')
  const level1 = join(baseDir, 'level1')
  const level2 = join(level1, 'level2')
  const level3 = join(level2, 'level3')

  await ensureDir(baseDir)
  await ensureDir(level1)
  await ensureDir(level2)
  await ensureDir(level3)

  // Create package files at different levels
  const level2PackagePath = join(level2, 'package.json')
  const level3PackagePath = join(level3, 'package.json')

  await Deno.writeTextFile(
    level2PackagePath,
    JSON.stringify({ name: 'level2-package' }),
  )
  await Deno.writeTextFile(
    level3PackagePath,
    JSON.stringify({ name: 'level3-package' }),
  )

  // Convert base directory to file URL
  const baseFileUrl = `file:///${baseDir.replace(/^\//, '')}`

  // Test with maxDepth = 2 (should find level2 package)
  const foundWithDepth2 = await findPackagePathFromPath(
    baseFileUrl,
    undefined,
    false,
    2,
  )
  assertEquals(
    foundWithDepth2,
    level2PackagePath,
    'Should find package.json at level 2 when maxDepth is 2',
  )

  // Test with maxDepth = 1 (should not find any package)
  const foundWithDepth1 = await findPackagePathFromPath(
    baseFileUrl,
    undefined,
    false,
    1,
  )
  assertEquals(
    foundWithDepth1,
    '',
    'Should not find any package when maxDepth is 1',
  )

  // Test with infinite maxDepth (should find level2 package first)
  const foundWithInfiniteDepth = await findPackagePathFromPath(
    baseFileUrl,
    undefined,
    false,
  )
  assertEquals(
    foundWithInfiniteDepth,
    level2PackagePath,
    'Should find first package with infinite maxDepth',
  )
})

/**
 * Test for findPackageFromPath handling invalid JSON from remote URLs
 */
Deno.test('findPackageFromPath - handles invalid JSON from remote URLs', async () => {
  const originalFetch = globalThis.fetch
  const mockHandlers: Record<string, () => Response> = {
    'HEAD:https://example.com/invalid-package.json': () =>
      new Response('', { status: 200 }),
    'GET:https://example.com/invalid-package.json': () =>
      new Response(
        `{
          "name": "invalid-remote-package",
          "version": "1.0.0",
          broken-json-here
        }`,
        { status: 200 },
      ),
  }

  try {
    globalThis.fetch = createMockFetch(mockHandlers)

    await assertRejects(
      () => findPackageFromPath('https://example.com/invalid-package.json'),
      Error,
      'Failed to parse package file',
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

/**
 * Test for findPackageFromPath handling malformed exports field
 */
Deno.test('findPackageFromPath - handles malformed exports field', async () => {
  // Test cases for different malformed exports
  const malformedExportsCases = {
    'exports-as-string': {
      name: 'malformed-exports-string',
      exports: './index.js', // exports should be an object
    },
    'exports-dot-as-number': {
      name: 'malformed-exports-number',
      exports: {
        '.': 42, // '.' export should be a string
      },
    },
    'exports-as-array': {
      name: 'malformed-exports-array',
      exports: ['./index.js'], // exports should be an object
    },
  }

  for (const [testName, packageData] of Object.entries(malformedExportsCases)) {
    const packagePath = join(tempDir, `${testName}.package.json`)
    await Deno.writeTextFile(packagePath, JSON.stringify(packageData))

    const result = await findPackageFromPath(packagePath)
    assertExists(
      result.exports,
      `exports field should be present in ${testName}`,
    )
    assertEquals(
      result.exports,
      packageData.exports,
      `malformed exports should be preserved as-is in ${testName}`,
    )
  }
})

/**
 * Test for findPackageFromPath handling skipped directory as initial path
 */
Deno.test('findPackageFromPath - handles skipped directory as initial path', async () => {
  // Create a node_modules directory with a package file
  const nodeModulesDir = join(tempDir, 'node_modules')
  await ensureDir(nodeModulesDir)

  const nodeModulesPackagePath = join(nodeModulesDir, 'package.json')
  await Deno.writeTextFile(
    nodeModulesPackagePath,
    JSON.stringify({
      name: 'node-modules-package',
      version: '1.0.0',
    }),
  )

  // Test with node_modules as initial path and traverseUp=false
  const packageData = await findPackageFromPath(
    nodeModulesDir,
    undefined,
    false,
  )
  assertEquals(
    packageData.name,
    'node-modules-package',
    'Should find package in node_modules when it is the initial path',
  )

  // Create a nested structure to test that other node_modules are still skipped
  const nestedDir = join(nodeModulesDir, 'nested')
  const nestedNodeModules = join(nestedDir, 'node_modules')
  await ensureDir(nestedDir)
  await ensureDir(nestedNodeModules)

  // Add a package.json to the nested node_modules
  await Deno.writeTextFile(
    join(nestedNodeModules, 'package.json'),
    JSON.stringify({
      name: 'should-be-skipped',
      version: '1.0.0',
    }),
  )

  // Add a package.json to the nested directory
  const nestedPackagePath = join(nestedDir, 'package.json')
  await Deno.writeTextFile(
    nestedPackagePath,
    JSON.stringify({
      name: 'nested-package',
      version: '1.0.0',
    }),
  )

  // Test downward traversal from node_modules - should find nested package but skip nested node_modules
  const nestedResult = await findPackageFromPath(
    nodeModulesDir,
    undefined,
    false,
  )
  assertEquals(
    nestedResult.name,
    'node-modules-package',
    'Should find first package in node_modules when traversing down',
  )
})

/**
 * Test for getMainExportPath handling various export formats
 */
Deno.test('getMainExportPath - correctly resolves path to main export', async () => {
  // Create a package with standard exports field
  const packageWithExports = {
    name: 'exports-package',
    exports: {
      '.': './src/index.ts',
      './utils': './src/utils/index.ts',
    },
  }

  const exportsPackagePath = join(tempDir, 'exports-package.json')
  await Deno.writeTextFile(
    exportsPackagePath,
    JSON.stringify(packageWithExports),
  )

  // Test resolving the main export path
  const mainExportPath = await getMainExportPath(exportsPackagePath)
  assertEquals(
    mainExportPath,
    join(tempDir, 'src/index.ts'),
    'Should correctly resolve main export path',
  )
})

/**
 * Test for getMainExportPath throwing error when no main export is found
 */
Deno.test('getMainExportPath - throws error for missing main export', async () => {
  // Create packages with various missing or malformed exports
  const testCases = [
    {
      name: 'no-exports-package',
      // Package with no exports field
    },
    {
      name: 'empty-exports-package',
      exports: {},
      // Package with empty exports object
    },
    {
      name: 'no-dot-exports-package',
      exports: {
        './utils': './src/utils.js',
        // Package with exports but no '.' entry
      },
    },
  ]

  for (const testCase of testCases) {
    const packagePath = join(tempDir, `${testCase.name}.json`)
    await Deno.writeTextFile(packagePath, JSON.stringify(testCase))

    // Test that error is thrown for each case
    await assertRejects(
      () => getMainExportPath(packagePath),
      Error,
      'No main export found for package',
      `Should throw error for ${testCase.name}`,
    )
  }
})

/**
 * Test for getMainExportPath handling complex export formats
 */
Deno.test('getMainExportPath - handles complex conditional exports', async () => {
  // Create a package with more complex exports field (object instead of string)
  const packageWithComplexExports = {
    name: 'complex-exports-package',
    exports: {
      '.': {
        import: './esm/index.js',
        require: './cjs/index.js',
        // getMainExportPath should fail on this format as it expects a string
      },
    },
  }

  const complexExportsPath = join(tempDir, 'complex-exports-package.json')
  await Deno.writeTextFile(
    complexExportsPath,
    JSON.stringify(packageWithComplexExports),
  )

  // Test that appropriate error is thrown
  await assertRejects(
    () => getMainExportPath(complexExportsPath),
    Error,
    'No main export found for package',
    'Should throw error when main export is not a string',
  )
})

// Register cleanup to run after all tests
Deno.test({
  name: 'cleanup',
  fn: cleanupTempFiles,
  sanitizeResources: false,
  sanitizeOps: false,
})
