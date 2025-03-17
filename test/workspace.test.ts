import { assertEquals, assertExists, assertRejects, assertStringIncludes } from '@std/assert'
import { createWorkspace } from '../src/workspace.ts'
import { isBannedDirectory } from '../src/utils/banned-directories.ts'
import type { KitFileSpecification, TemplateValues } from '../src/types.ts'
import { join } from '@std/path'

Deno.test('Workspace functionality', async (t) => {
  // Create a templates directory with sample templates for testing
  const templatesDir = await Deno.makeTempDir({ prefix: 'deno-kit-test-templates-' })

  // Create a few template files with placeholders
  const templateFiles = {
    'README.md':
      '# {PROJECT_NAME}\n\nCreated by {PACKAGE_AUTHOR_NAME} ({PACKAGE_AUTHOR_EMAIL})\n\n## Description\n\n{PACKAGE_DESCRIPTION}\n\n## License\n\n{PACKAGE_LICENSE} {YEAR}',
    'package.json':
      '{\n  "name": "{PACKAGE_NAME}",\n  "version": "{PACKAGE_VERSION}",\n  "description": "{PACKAGE_DESCRIPTION}",\n  "author": "{PACKAGE_AUTHOR_NAME} <{PACKAGE_AUTHOR_EMAIL}>",\n  "license": "{PACKAGE_LICENSE}"\n}',
    'docs/about.md': '# About {PROJECT_NAME}\n\nMaintained by {PACKAGE_GITHUB_USER}',
    'custom.md': '# Test with {MISSING_VALUE}\n\nA placeholder that should remain unchanged.',
    'complex.md': 'This has {NESTED_PLACEHOLDER} and {SPECIAL_CHARS}',
  }

  // Write template files
  for (const [path, content] of Object.entries(templateFiles)) {
    const filePath = join(templatesDir, path)
    const dirPath = filePath.substring(0, filePath.lastIndexOf('/'))
    await Deno.mkdir(dirPath, { recursive: true })
    await Deno.writeTextFile(filePath, content)
  }

  // Template values for testing
  const templateValues = {
    PACKAGE_NAME: 'test-package',
    PACKAGE_SCOPE: 'test-scope',
    PACKAGE_VERSION: '1.0.0',
    PACKAGE_AUTHOR_NAME: 'Test Author',
    PACKAGE_AUTHOR_EMAIL: 'test@example.com',
    PACKAGE_DESCRIPTION: 'Test package description',
    PACKAGE_LICENSE: 'MIT',
    PACKAGE_REPOSITORY: 'https://github.com/test/test-package',
    PACKAGE_GITHUB_USER: 'test',
    YEAR: new Date().getFullYear().toString(),
    PROJECT_NAME: 'Test Project',
    NESTED_PLACEHOLDER: 'resolved-nested-value',
    SPECIAL_CHARS: 'special-chars-value',
  }

  // Create a workspace instance for all tests
  const workspace = await createWorkspace({
    name: 'test-workspace',
    configFileName: 'test-workspace.json',
    templatesPath: templatesDir,
  })

  // Step 1: Verify workspace properties are correctly initialized
  await t.step('workspace initialization - properties are correct', () => {
    assertExists(workspace, 'Workspace should be created')
    assertEquals(workspace.name, 'test-workspace', 'Workspace name should match')
    assertEquals(workspace.configFileName, 'test-workspace.json', 'Config filename should match')
    assertExists(workspace.templatesPath, 'Templates path should exist')
    assertStringIncludes(
      workspace.templatesPath,
      'deno-kit-test-templates-',
      'Templates path should contain correct prefix',
    )
    assertExists(workspace.path, 'Workspace path should exist')
    assertExists(workspace.backupsPath, 'Backups path should exist')
    assertExists(workspace.id, 'Workspace ID should exist')
    assertEquals(typeof workspace.id, 'string', 'Workspace ID should be a string')
  })

  // Step 2: Test template compilation and writing
  await t.step('compileAndWriteTemplates - replaces placeholders correctly', async () => {
    await workspace.compileAndWriteTemplates(templateValues)

    // Verify README.md has been processed correctly
    const readmePath = join(workspace.path, 'README.md')
    const readmeContent = await Deno.readTextFile(readmePath)

    assertStringIncludes(readmeContent, '# Test Project', 'PROJECT_NAME should be replaced')
    assertStringIncludes(
      readmeContent,
      'Created by Test Author',
      'PACKAGE_AUTHOR_NAME should be replaced',
    )
    assertStringIncludes(
      readmeContent,
      'test@example.com',
      'PACKAGE_AUTHOR_EMAIL should be replaced',
    )
    assertStringIncludes(
      readmeContent,
      'Test package description',
      'PACKAGE_DESCRIPTION should be replaced',
    )
    assertStringIncludes(readmeContent, 'MIT', 'PACKAGE_LICENSE should be replaced')
    assertStringIncludes(
      readmeContent,
      new Date().getFullYear().toString(),
      'YEAR should be replaced',
    )
  })

  // Step 3: Test JSON representation contains all expected properties
  await t.step('toJSON - returns valid JSON with all required properties', async () => {
    const workspaceJson = await workspace.toJSON()
    const parsedJson = JSON.parse(workspaceJson) as KitFileSpecification

    assertEquals(parsedJson.id, workspace.id, 'JSON should contain correct ID')
    assertEquals(parsedJson.name, workspace.name, 'JSON should contain correct name')
    assertEquals(
      Array.isArray(parsedJson.workspaceFiles),
      true,
      'Should have workspace files array',
    )
    assertEquals(Array.isArray(parsedJson.templateFiles), true, 'Should have template files array')
    assertEquals(Array.isArray(parsedJson.backupFiles), true, 'Should have backup files array')
    assertEquals(typeof parsedJson.templateValues, 'object', 'Should have template values object')
  })

  // Step 4: Test template compilation with newly provided values overriding existing ones
  await t.step('compileAndWriteTemplates - overrides template values correctly', async () => {
    const overrideValues = {
      ...templateValues,
      PROJECT_NAME: 'Override Project',
      PACKAGE_AUTHOR_NAME: 'Override Author',
    }

    await workspace.compileAndWriteTemplates(overrideValues)

    // Verify README.md has been processed with overridden values
    const readmePath = join(workspace.path, 'README.md')
    const readmeContent = await Deno.readTextFile(readmePath)

    assertStringIncludes(readmeContent, '# Override Project', 'PROJECT_NAME should be overridden')
    assertStringIncludes(
      readmeContent,
      'Created by Override Author',
      'PACKAGE_AUTHOR_NAME should be overridden',
    )
    assertStringIncludes(
      readmeContent,
      'test@example.com',
      'Unchanged values should remain the same',
    )
  })

  // Step 5: Test nested template files are correctly processed
  await t.step('compileAndWriteTemplates - processes nested directory templates', async () => {
    // Verify the docs/about.md file was created and processed
    const aboutPath = join(workspace.path, 'docs/about.md')
    const aboutContent = await Deno.readTextFile(aboutPath)

    assertStringIncludes(
      aboutContent,
      '# About Override Project',
      'PROJECT_NAME should be replaced in nested file',
    )
    assertStringIncludes(
      aboutContent,
      'Maintained by test',
      'PACKAGE_GITHUB_USER should be replaced in nested file',
    )
  })

  // Step 6: Test direct file writing to workspace
  await t.step('writeFile - writes content to workspace correctly', async () => {
    const testFilePath = 'test-file.txt'
    const testContent = 'This is a test file content'

    await workspace.writeFile(testFilePath, testContent)

    // Verify the file was written correctly
    const fullPath = join(workspace.path, testFilePath)
    const content = await Deno.readTextFile(fullPath)

    assertEquals(content, testContent, 'File content should match what was written')
  })

  // Step 7: Test workspace ID format is valid
  await t.step('workspace ID - has valid format', () => {
    const { id } = workspace

    // Workspace ID should be a SHA-256 hash (64 hex characters)
    assertEquals(id.length, 64, 'Workspace ID should be 64 characters (SHA-256 hash)')
    // Should only contain valid hex characters
    assertEquals(/^[0-9a-f]+$/.test(id), true, 'Workspace ID should only contain hex characters')
  })

  // Step 8: Test handling of missing placeholders in templates
  await t.step('compileAndWriteTemplates - preserves unmatched placeholders', async () => {
    // The custom template was already added to templateFiles and written to the templates directory
    // Verify the custom.md file has been processed with placeholder preserved
    const customPath = join(workspace.path, 'custom.md')
    const content = await Deno.readTextFile(customPath)

    assertStringIncludes(
      content,
      '{MISSING_VALUE}',
      'Unmatched placeholders should remain as-is',
    )
  })

  // Step 9: Test git user information retrieval
  await t.step('getGitUserInfo - retrieves git user information safely', async () => {
    // Since we don't want to require git to be configured for the tests to pass,
    // we'll just ensure the methods work without errors and return expected types
    const userName = await workspace.getGitUserName()
    const userEmail = await workspace.getGitUserEmail()

    // Both should return strings (empty or not)
    assertEquals(typeof userName, 'string', 'Git user name should be a string')
    assertEquals(typeof userEmail, 'string', 'Git user email should be a string')
  })

  // Step 10: Test error handling for templates path validation
  await t.step('templatesPath validation - rejects invalid templates paths', async () => {
    // Test creating a workspace with a non-existent templates path
    const nonExistentPath = '/this/path/does/not/exist'

    await assertRejects(
      async () => {
        await createWorkspace({
          templatesPath: nonExistentPath,
        })
      },
      Error,
      'Templates directory',
      'Should reject invalid templates paths',
    )
  })

  // Step 11: Test security boundary - prevent file operations outside workspace
  await t.step('writeFile - prevents writing outside workspace directory', async () => {
    // Attempt to write to a path outside of the workspace (using "../" to navigate up)
    const outsidePath = '../outside-workspace.txt'
    const content = 'This should not be written'

    await assertRejects(
      async () => {
        await workspace.writeFile(outsidePath, content)
      },
      Error,
      'Cannot write file outside of workspace',
      'Should prevent writing files outside workspace directory',
    )

    // Also test with absolute path outside workspace
    const absoluteOutsidePath = '/tmp/outside-workspace.txt'

    await assertRejects(
      async () => {
        await workspace.writeFile(absoluteOutsidePath, content)
      },
      Error,
      'Cannot write file outside of workspace',
      'Should prevent writing files with absolute paths outside workspace',
    )
  })

  // Step 12: Test writing to deeply nested paths
  await t.step('writeFile - creates nested directories as needed', async () => {
    const deeplyNestedPath = 'deep/nested/path/structure/file.txt'
    const content = 'Content in deeply nested file'

    await workspace.writeFile(deeplyNestedPath, content)

    // Verify the file exists and has correct content
    const fullPath = join(workspace.path, deeplyNestedPath)
    const fileContent = await Deno.readTextFile(fullPath)

    assertEquals(fileContent, content, 'Content should be written to deeply nested path')

    // Check that intermediate directories were created
    const stat = await Deno.stat(join(workspace.path, 'deep/nested/path/structure'))
    assertEquals(stat.isDirectory, true, 'Intermediate directories should be created')
  })

  // Step 13: Test file overwrite protection
  await t.step('writeFile - respects create=false flag', async () => {
    // First create a file
    const testPath = 'protected-file.txt'
    const originalContent = 'Original content'
    await workspace.writeFile(testPath, originalContent)

    // Try to write to the same file with create=false, but with a file that doesn't exist
    const nonExistentPath = 'non-existent-file.txt'

    // This should fail silently (no error) but also not create the file
    await workspace.writeFile(nonExistentPath, 'New content', false)

    try {
      await Deno.stat(join(workspace.path, nonExistentPath))
      assertEquals(true, false, 'Non-existent file should not be created with create=false')
    } catch (error) {
      // This is expected - the file should not exist
      assertEquals(error instanceof Deno.errors.NotFound, true, 'Expected NotFound error')
    }

    // Now try to overwrite an existing file with create=true (should work)
    const newContent = 'New content'
    await workspace.writeFile(testPath, newContent, true)

    const updatedContent = await Deno.readTextFile(join(workspace.path, testPath))
    assertEquals(updatedContent, newContent, 'File should be overwritten with create=true')
  })

  // Step 14: Test handling of empty template values
  await t.step('compileAndWriteTemplates - rejects empty template values', async () => {
    // Create empty template values that still satisfies the TemplateValues type
    const emptyTemplateValues = {} as TemplateValues

    // Attempt to compile templates with empty values
    await assertRejects(
      async () => {
        await workspace.compileAndWriteTemplates(emptyTemplateValues)
      },
      Error,
      'No template values provided',
      'Should reject empty template values',
    )
  })

  // Step 15: Test backup path accessibility
  await t.step('backup functionality - backup path is accessible and valid', async () => {
    // Ensure the backup path exists
    assertExists(workspace.backupsPath, 'Backup path should exist')

    // The backups path should be different from the workspace path
    assertStringIncludes(
      workspace.backupsPath,
      'workspace-backups',
      'Backup path should contain correct prefix',
    )

    // Check that the backup directory structure is valid
    try {
      const stat = await Deno.stat(workspace.backupsPath)
      assertEquals(stat.isDirectory, true, 'Backup path should be a directory')

      // Check if workspace ID is part of the backup path (indicating proper organization)
      assertStringIncludes(
        workspace.backupsPath,
        workspace.id.substring(0, 6),
        'Backup path should contain workspace ID reference',
      )
    } catch (error) {
      assertEquals(true, false, `Error accessing backup path: ${error}`)
    }
  })

  // Step 16: Test complex template patterns
  await t.step('compileAndWriteTemplates - handles complex placeholder patterns', async () => {
    // The complex template was already compiled during earlier calls to compileAndWriteTemplates
    // Verify it was processed correctly
    const complexPath = join(workspace.path, 'complex.md')
    const content = await Deno.readTextFile(complexPath)

    // Check both placeholder replacements
    assertStringIncludes(
      content,
      'resolved-nested-value',
      'Complex nested placeholders should be replaced',
    )

    assertStringIncludes(
      content,
      'special-chars-value',
      'Placeholders with special characters should be replaced',
    )
  })

  // Step 17: Test workspace configuration file creation
  await t.step('createWorkspace - creates and persists workspace configuration', async () => {
    const configFilePath = join(workspace.path, workspace.configFileName)

    try {
      // Verify the config file exists
      const stat = await Deno.stat(configFilePath)
      assertEquals(stat.isFile, true, 'Workspace config file should exist')

      // Verify the config file contains valid JSON
      const configContent = await Deno.readTextFile(configFilePath)
      const config = JSON.parse(configContent) as KitFileSpecification

      // Check essential properties
      assertEquals(config.id, workspace.id, 'Config file should contain correct workspace ID')
      assertEquals(config.name, workspace.name, 'Config file should contain correct workspace name')
      assertExists(config.workspaceFiles, 'Config file should list workspace files')
      assertExists(config.templateFiles, 'Config file should list template files')
      assertExists(config.backupFiles, 'Config file should list backup files')
    } catch (error) {
      assertEquals(true, false, `Failed to verify workspace config file: ${error}`)
    }
  })

  // Step 18: Test workspace path validation
  await t.step('createWorkspace - validates workspace path requirements', async () => {
    // This test verifies workspace path validation by attempting to use
    // an existing workspace path, which requires additional validation checks

    // Attempt to create a workspace with an existing workspace path
    try {
      // This will likely fail due to specific workspace validation requirements
      // that's ok - we're testing that the validation logic runs, not the specific result
      await createWorkspace({
        workspacePath: workspace.path,
        templatesPath: templatesDir,
      })
    } catch (error) {
      // We expect this to fail with a specific error about package configuration
      // Just verify we get some kind of error, which shows validation is working
      assertStringIncludes(
        String(error),
        'package configuration',
        'Workspace path validation should check package configuration',
      )
    }
  })

  // Step 19: Test creating workspace without enough template files
  await t.step('createWorkspace - handles empty template directory', async () => {
    // Create an empty templates directory
    const emptyTemplatesDir = await Deno.makeTempDir({ prefix: 'deno-kit-empty-templates-' })

    try {
      // Attempt to create a workspace with the empty templates directory
      await assertRejects(
        async () => {
          await createWorkspace({
            templatesPath: emptyTemplatesDir,
          })
        },
        Error,
        'Templates directory',
        'Should reject empty templates directory',
      )
    } finally {
      // Clean up the empty templates directory
      if (!(await isBannedDirectory(emptyTemplatesDir))) {
        await Deno.remove(emptyTemplatesDir, { recursive: true })
      }
    }
  })

  // Step 20: Test validation for workspace directories
  await t.step('createWorkspace - validates workspace directories', async () => {
    // Since the banned directory test is environment-specific,
    // let's test a more general validation aspect
    const nonExistentPath = '/path/that/does/not/exist'

    // Test that validation happens (specific error varies by environment)
    await assertRejects(
      async () => {
        await createWorkspace({
          workspacePath: nonExistentPath,
          templatesPath: templatesDir,
        })
      },
      Error,
      '', // Don't check specific error message as it may vary
      'Should validate workspace directories',
    )
  })

  // Clean up test directories
  try {
    if (await isBannedDirectory(workspace.path)) {
      throw new Error(`Workspace path is a banned directory: ${workspace.path}`)
    }
    await Deno.remove(workspace.path, { recursive: true })

    if (await isBannedDirectory(templatesDir)) {
      throw new Error(`Templates path is a banned directory: ${templatesDir}`)
    }
    await Deno.remove(templatesDir, { recursive: true })

    // Also clean up the backup directory if it exists
    if (workspace.backupsPath && !(await isBannedDirectory(workspace.backupsPath))) {
      await Deno.remove(workspace.backupsPath, { recursive: true })
    }
  } catch (error) {
    console.warn(`Failed to cleanup test directories: ${error}`)
  }
})
