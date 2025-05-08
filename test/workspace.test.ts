import { create, load, type WorkspaceConfigFile } from '../src/workspace.ts'
import { isBannedDirectory } from '../src/utils/banned-directories.ts'
import { basename, join } from '@std/path'
import { assertEquals, assertExists, assertRejects, assertStringIncludes } from '@std/assert'

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
  const workspace = await create({
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
    const parsedJson = JSON.parse(workspaceJson) as WorkspaceConfigFile

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
    const readmePath = join(workspace.path, 'README.md')
    try {
      // Template values with required fields
      await workspace.compileAndWriteTemplates({
        PROJECT_NAME: 'Override Project',
        PACKAGE_NAME: 'test-package',
        PACKAGE_SCOPE: '@test',
        PACKAGE_VERSION: '1.0.0',
        PACKAGE_AUTHOR_NAME: 'Test Author',
        PACKAGE_AUTHOR_EMAIL: 'test@example.com',
        PACKAGE_DESCRIPTION: 'Test description',
        PACKAGE_GITHUB_USER: 'testuser',
        PACKAGE_LICENSE: 'MIT',
        PACKAGE_REPOSITORY: 'https://github.com/test/test-package',
        YEAR: '2024',
        NESTED_PLACEHOLDER: 'resolved-nested-value',
        SPECIAL_CHARS: 'special-chars-value',
      })

      // Read the compiled README.md
      const readmeContent = await Deno.readTextFile(readmePath)

      assertStringIncludes(readmeContent, '# Override Project', 'PROJECT_NAME should be overridden')

      // Verify the output file exists
      const readmeInfo = await Deno.stat(readmePath)
      assertEquals(readmeInfo.isFile, true, 'README.md should exist')
    } catch (error) {
      console.log('Error testing template overrides:', (error as Error).message)
      assertEquals(false, true, 'Should not throw error when overriding template values')
    }
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
        await create({
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
    // Create empty template values
    const emptyTemplateValues = {} as { [key: string]: string }

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
      const configFileInfo = await Deno.stat(configFilePath)
      assertEquals(configFileInfo.isFile, true, 'Workspace config file should exist')

      // Load the workspace from the config file
      await load(configFilePath)

      // Verify the config file contains valid JSON
      const configContent = await Deno.readTextFile(configFilePath)
      const config = JSON.parse(configContent) as WorkspaceConfigFile

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
      await create({
        workspacePath: workspace.path,
        templatesPath: templatesDir,
      })
      assertEquals(true, false, 'Should not be able to create workspace in banned directory')
    } catch (error) {
      // We expect this to fail with a specific error about banned directory
      assertStringIncludes(
        String(error),
        'banned directory',
        'Workspace path validation should check for banned directories',
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
          await create({
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
        await create({
          workspacePath: nonExistentPath,
          templatesPath: templatesDir,
        })
      },
      Error,
      '', // Don't check specific error message as it may vary
      'Should validate workspace directories',
    )
  })

  // Step 21: Test backup functionality - basic operation
  await t.step('backup - creates backup copies of workspace files', async () => {
    // Create a unique test file to check backup
    const testFileName = `backup-test-${Date.now()}.txt`
    const testContent = 'Test content for backup verification'
    await workspace.writeFile(testFileName, testContent)

    // Verify the file exists in the workspace
    const testFilePath = join(workspace.path, testFileName)
    try {
      const fileInfo = await Deno.stat(testFilePath)
      assertEquals(fileInfo.isFile, true, `Test file should exist: ${testFilePath}`)

      // Add debugging - show file content from disk
      console.log(`Debug - File on disk: ${testFilePath}`)
      const diskContent = await Deno.readTextFile(testFilePath)
      console.log(`Debug - Disk content: ${diskContent}`)
    } catch (err) {
      assertEquals(true, false, `Failed to stat test file: ${testFilePath}, error: ${err}`)
    }

    // Add debugging - inspect internal files map by reading workspace json
    console.log('Debug - Reading workspace state')
    const workspaceJson = await workspace.toJSON()
    console.log(`Debug - Workspace JSON: ${workspaceJson}`)

    // Perform backup
    const backupFiles = await workspace.backup()

    // Add debugging - dump the backup files contents
    console.log(`Debug - Backup files count: ${backupFiles.size}`)
    console.log('Debug - Backup paths:')
    for (const path of backupFiles.keys()) {
      console.log(`  ${path}`)
    }

    // Verify backup files map is not empty
    assertExists(backupFiles, 'Backup files map should exist')
    assertEquals(backupFiles.size > 0, true, 'Backup files map should not be empty')

    // Verify backups path was set
    assertExists(workspace.backupsPath, 'Backup path should be set')
    assertEquals(workspace.backupsPath.length > 0, true, 'Backup path should not be empty')

    // Find the test file in backups
    let foundTestFile = false
    for (const [backupPath, content] of backupFiles.entries()) {
      if (backupPath.includes(testFileName)) {
        foundTestFile = true
        assertEquals(content, testContent, 'Backup content should match original')

        // Verify file exists on disk
        try {
          const fileInfo = await Deno.stat(backupPath)
          assertEquals(fileInfo.isFile, true, `Backup file should exist on disk: ${backupPath}`)

          const diskContent = await Deno.readTextFile(backupPath)
          assertEquals(diskContent, testContent, 'Backup content on disk should match original')
        } catch (err) {
          assertEquals(true, false, `Failed to stat backup file: ${backupPath}, error: ${err}`)
        }
        break
      }
    }

    assertEquals(foundTestFile, true, `Should find test file ${testFileName} in backups`)
  })

  // Step 22: Test backup functionality - subdirectory structure
  await t.step('backup - preserves subdirectory structure', async () => {
    // Create nested directories with files
    const nestedPath = 'nested/test/path'
    const nestedFileName = 'nested-file.txt'
    const nestedFullPath = `${nestedPath}/${nestedFileName}`
    const nestedContent = 'Content in nested file for backup testing'

    // Write the nested file
    await workspace.writeFile(nestedFullPath, nestedContent)

    // Verify the file exists in workspace
    const fullPath = join(workspace.path, nestedFullPath)
    try {
      const fileInfo = await Deno.stat(fullPath)
      assertEquals(fileInfo.isFile, true, `Nested file should exist: ${fullPath}`)
    } catch (err) {
      assertEquals(true, false, `Failed to stat nested file: ${fullPath}, error: ${err}`)
    }

    // Perform backup
    const backupFiles = await workspace.backup()

    // Find the nested file in backups
    let foundNestedFile = false
    let nestedBackupPath = ''

    for (const [backupPath, content] of backupFiles.entries()) {
      if (backupPath.includes(nestedFileName) && backupPath.includes('nested')) {
        foundNestedFile = true
        nestedBackupPath = backupPath
        assertEquals(content, nestedContent, 'Nested backup content should match original')
        break
      }
    }

    assertEquals(foundNestedFile, true, `Should find nested file ${nestedFileName} in backups`)

    // If we found the file, check that the directory structure was preserved
    if (foundNestedFile && nestedBackupPath) {
      // Get the directory portion of the path
      const backupDir = nestedBackupPath.substring(0, nestedBackupPath.lastIndexOf('/'))

      // Verify nested directories exist
      try {
        const dirInfo = await Deno.stat(backupDir)
        assertEquals(dirInfo.isDirectory, true, 'Nested directory structure should be preserved')
      } catch (err) {
        assertEquals(true, false, `Failed to stat backup directory: ${backupDir}, error: ${err}`)
      }
    }
  })

  // Step 23: Test backup functionality - template exclusion
  await t.step('backup - excludes template files', async () => {
    // Create a unique non-template file to verify it gets backed up
    const nonTemplateFile = `non-template-${Date.now()}.txt`
    const nonTemplateContent = 'This is not a template file and should be backed up'
    await workspace.writeFile(nonTemplateFile, nonTemplateContent)

    // Create a modified version of a template file, but with a different name to avoid path matching
    const templateFileName = 'DIFFERENT-README.md' // This should not match any template name
    const modifiedContent = 'This is a modified readme that should be backed up'

    // Verify this is actually a template
    const templatePaths = Array.from(Object.keys(templateFiles))
    assertEquals(
      templatePaths.includes(templateFileName),
      false,
      'Test assumes DIFFERENT-README.md is not a template',
    )

    // Write modified content to the workspace version
    await workspace.writeFile(templateFileName, modifiedContent)

    // Also create a README.md file to verify it's excluded by base filename
    const readmeContent = 'This README.md should be excluded from backups'
    await workspace.writeFile('README.md', readmeContent)

    // Verify all files exist in workspace
    try {
      const nonTemplateInfo = await Deno.stat(join(workspace.path, nonTemplateFile))
      assertEquals(nonTemplateInfo.isFile, true, 'Non-template file should exist in workspace')

      const templateInfo = await Deno.stat(join(workspace.path, templateFileName))
      assertEquals(templateInfo.isFile, true, 'Modified template file should exist in workspace')

      const readmeInfo = await Deno.stat(join(workspace.path, 'README.md'))
      assertEquals(readmeInfo.isFile, true, 'README.md should exist in workspace')

      console.log('Debug - All test files created successfully in workspace')
    } catch (err) {
      assertEquals(true, false, `Failed to stat test files, error: ${err}`)
    }

    // Add debugging - inspect workspace state
    console.log('Debug - Reading workspace state before template backup test')
    const workspaceJson = await workspace.toJSON()
    const workspaceFilePaths = JSON.parse(workspaceJson).workspaceFiles
    console.log(
      'Debug - Workspace contains README.md:',
      workspaceFilePaths.some((f: string) => f.includes('README.md')),
    )

    // Perform backup
    const backupFiles = await workspace.backup()

    // Add debugging - dump the backup files contents
    console.log('Debug - Backup files count in template test:', backupFiles.size)
    console.log('Debug - Backup paths:')
    for (const [path] of backupFiles.entries()) {
      console.log(`  ${path}`)
    }

    // Check if our non-template file was backed up
    let foundNonTemplateFile = false
    for (const [backupPath, content] of backupFiles.entries()) {
      if (backupPath.includes(nonTemplateFile)) {
        foundNonTemplateFile = true
        assertEquals(
          content,
          nonTemplateContent,
          'Non-template file backup content should match original',
        )
        break
      }
    }

    assertEquals(foundNonTemplateFile, true, 'Should find non-template file in backups')

    // Check if our modified template file was backed up
    let foundModifiedTemplate = false
    for (const [backupPath, content] of backupFiles.entries()) {
      if (backupPath.includes(templateFileName)) {
        foundModifiedTemplate = true
        console.log('Debug - Found modified file in backup:', backupPath)
        assertEquals(
          content.includes('This is a modified readme'),
          true,
          'Backup content should match our modified version',
        )
        break
      }
    }

    assertEquals(foundModifiedTemplate, true, 'Should find modified file in backups')

    // Verify that README.md was NOT backed up (excluded by filename)
    let foundReadme = false
    for (const [backupPath] of backupFiles.entries()) {
      // Check for exact README.md filename, not just any path containing README.md
      const filename = basename(backupPath)
      if (filename === 'README.md') {
        foundReadme = true
        console.log('Debug - Found README.md in backup when it should be excluded:', backupPath)
        break
      }
    }

    assertEquals(foundReadme, false, 'README.md should be excluded from backups by filename')

    // Verify no template directory paths are in backup
    const templateBasePath = templatesDir.replace(/\\/g, '/')
    let foundTemplateDirFiles = false

    for (const backupPath of backupFiles.keys()) {
      if (backupPath.includes(templateBasePath)) {
        foundTemplateDirFiles = true
        console.log('Debug - Found template dir path in backup:', backupPath)
        break
      }
    }

    assertEquals(foundTemplateDirFiles, false, 'No template directory files should be in backup')
  })

  // Step 24: Test loadWorkspace - loads an existing workspace from configuration
  await t.step('loadWorkspace - loads workspace from configuration file', async () => {
    // Get the path to the workspace configuration file
    const configFilePath = join(workspace.path, workspace.configFileName)

    // Verify the config file exists
    const configFileInfo = await Deno.stat(configFilePath)
    assertEquals(configFileInfo.isFile, true, 'Workspace config file should exist')

    // Load the workspace from the config file
    const loadedWorkspace = await load(configFilePath)

    // Verify the loaded workspace has the same basic properties
    assertExists(loadedWorkspace, 'Loaded workspace should exist')
    assertEquals(loadedWorkspace.id, workspace.id, 'Loaded workspace ID should match original')
    assertEquals(
      loadedWorkspace.name,
      workspace.name,
      'Loaded workspace name should match original',
    )
    assertEquals(
      loadedWorkspace.configFileName,
      workspace.configFileName,
      'Config filename should match',
    )
    assertEquals(loadedWorkspace.path, workspace.path, 'Workspace path should match')

    // Compare JSON representation to verify deep equality
    const originalJson = JSON.parse(await workspace.toJSON())
    const loadedJson = JSON.parse(await loadedWorkspace.toJSON())

    // Compare essential properties
    assertEquals(loadedJson.id, originalJson.id, 'JSON ID should match')
    assertEquals(loadedJson.name, originalJson.name, 'JSON name should match')
    assertEquals(
      loadedJson.workspaceFiles.length,
      originalJson.workspaceFiles.length,
      'Should have same number of workspace files',
    )
    assertEquals(
      loadedJson.templateFiles.length,
      originalJson.templateFiles.length,
      'Should have same number of template files',
    )

    // Verify that essential workspace operations can be performed on the loaded workspace
    const testFilePath = 'loaded-workspace-test.txt'
    const testContent = 'Testing writing to loaded workspace'

    await loadedWorkspace.writeFile(testFilePath, testContent)
    const readContent = await Deno.readTextFile(join(loadedWorkspace.path, testFilePath))
    assertEquals(readContent, testContent, 'Should be able to write files to loaded workspace')
  })

  // Step 25: Verify paths in persisted JSON are relative
  await t.step('JSON persistence - ensures all stored paths are relative', async () => {
    // Ensure some files and backups exist to be written to the config
    await workspace.writeFile('another-test-file.txt', 'content')
    await workspace.backup() // This will also trigger a save()

    const configFilePath = join(workspace.path, workspace.configFileName)
    const configContent = await Deno.readTextFile(configFilePath)
    const parsedConfig = JSON.parse(configContent) as WorkspaceConfigFile

    const allPathArrays = {
      workspaceFiles: parsedConfig.workspaceFiles,
      templateFiles: parsedConfig.templateFiles,
      backupFiles: parsedConfig.backupFiles,
    }

    for (const [arrayName, paths] of Object.entries(allPathArrays)) {
      assertExists(paths, `${arrayName} array should exist in config`)
      assertEquals(Array.isArray(paths), true, `${arrayName} should be an array`)
      for (const path of paths) {
        assertEquals(
          typeof path === 'string' && !path.startsWith('/') && !path.match(/^[a-zA-Z]:\\/),
          true,
          `Path "${path}" in ${arrayName} should be relative (not start with '/' or drive letter)`,
        )
        // Also check that paths don't contain the workspace path, which would indicate they aren't purely relative
        assertEquals(
          !path.includes(workspace.path.substring(1)), // substring(1) to avoid leading '/' matching root relative paths
          true,
          `Path "${path}" in ${arrayName} should not contain the absolute workspace path segment`,
        )
      }
    }
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

// Add this test to test handling of JSONC workspace config files
Deno.test('Workspace with JSONC config file', async (t) => {
  // Create a templates directory with sample templates for testing
  const templatesDir = await Deno.makeTempDir({ prefix: 'deno-kit-test-templates-' })

  // Create a template file
  const templateFile = join(templatesDir, 'README.md')
  await Deno.writeTextFile(templateFile, '# {PROJECT_NAME}')

  // Create a workspace with a .jsonc config file
  const configFileName = 'workspace.jsonc'
  const expectedConfigFileName = 'workspace.jsonc.json'
  const workspace = await create({
    templatesPath: templatesDir,
    configFileName,
    name: 'jsonc-workspace',
  })

  await t.step('create with .jsonc config file', () => {
    assertEquals(
      workspace.configFileName,
      expectedConfigFileName,
      'Config filename should be workspace.jsonc.json',
    )

    // Check that the config file exists with the correct extension
    const configPath = join(workspace.path, expectedConfigFileName)
    assertExists(Deno.statSync(configPath), 'Config file with .json extension should exist')
  })

  await t.step('save to .jsonc config file', async () => {
    // Make a change to the workspace and save it
    await workspace.writeFile('test.txt', 'Test content')
    await workspace.save()

    // Verify the config file exists with the correct extension
    const configPath = join(workspace.path, expectedConfigFileName)
    const fileInfo = await Deno.stat(configPath)
    assertEquals(fileInfo.isFile, true, 'Config file should exist')

    // Verify the content is valid JSON
    const content = await Deno.readTextFile(configPath)
    const parsedConfig = JSON.parse(content)
    assertEquals(
      parsedConfig.name,
      'jsonc-workspace',
      'Config should contain correct workspace name',
    )

    // Verify the test.txt file is listed in workspaceFiles
    const workspaceFiles = parsedConfig.workspaceFiles as string[]
    assertEquals(
      workspaceFiles.some((path) => path.endsWith('test.txt')),
      true,
      'Config should list the new test.txt file',
    )
  })

  await t.step('load from .jsonc config file', async () => {
    // Load the workspace from the config file
    const configPath = join(workspace.path, expectedConfigFileName)
    const loadedWorkspace = await load(configPath)

    // Verify the loaded workspace has the same config filename
    assertEquals(
      loadedWorkspace.configFileName,
      expectedConfigFileName,
      'Loaded workspace should preserve config filename',
    )

    // Make a change and save to verify it saves back correctly
    await loadedWorkspace.writeFile('another-test.txt', 'More test content')
    await loadedWorkspace.save()

    // Verify the config file exists
    const fileInfo = await Deno.stat(configPath)
    assertEquals(fileInfo.isFile, true, 'Config file should exist')

    // Verify the content includes the new file
    const content = await Deno.readTextFile(configPath)
    const parsedConfig = JSON.parse(content)
    const workspaceFiles = parsedConfig.workspaceFiles as string[]
    assertEquals(
      workspaceFiles.some((path) => path.endsWith('another-test.txt')),
      true,
      'Config should list the new another-test.txt file',
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
