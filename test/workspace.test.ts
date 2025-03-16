import { assertEquals, assertExists } from '@std/assert'
import { createWorkspace } from '../src/workspace.ts'
import type { KitFileSpecification } from '../src/types.ts'

Deno.test('Workspace - creates workspace and handles templates', async () => {
  // Create a workspace instance
  const workspace = await createWorkspace()

  // Verify workspace was created successfully
  assertExists(workspace, 'Workspace should be created')

  // Test compileAndWriteTemplates with required template values
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
    PROJECT_NAME: 'test-project',
  }

  await workspace.compileAndWriteTemplates(templateValues)

  // Verify workspace JSON output is valid
  const workspaceJson = workspace.toJSON()
  const parsedJson = JSON.parse(workspaceJson) as KitFileSpecification

  // Verify the JSON contains expected properties
  assertEquals(
    typeof parsedJson.workspaceId,
    'string',
    'Should have a workspace ID',
  )
  assertEquals(
    Array.isArray(parsedJson.workspaceFiles),
    true,
    'Should have workspace files array',
  )
  assertEquals(
    Array.isArray(parsedJson.templateFiles),
    true,
    'Should have template files array',
  )
  assertEquals(
    Array.isArray(parsedJson.backupFiles),
    true,
    'Should have backup files array',
  )
  assertEquals(
    typeof parsedJson.templateValues,
    'object',
    'Should have template values object',
  )

  // Cleanup - remove temporary workspace directory
  try {
    await Deno.remove(workspace.workspacePath, { recursive: true })
  } catch (error) {
    console.warn(`Failed to cleanup test workspace: ${error}`)
  }
})
