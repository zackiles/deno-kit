import { assertEquals } from '@std/assert'
import { create as createWorkspace } from '../src/workspace/index.ts'
import { withGitFunctionality } from '../src/workspace/workspace-git.ts'

Deno.test('Workspace Git Integration - removeGithubRepo method', async (t) => {
  await t.step(
    'removeGithubRepo method is available on workspace with git functionality',
    async () => {
      // Create a temporary directory for the test
      const tempDir = await Deno.makeTempDir({ prefix: 'workspace-git-test-' })
      const templatesDir = await Deno.makeTempDir({ prefix: 'templates-test-' })

      try {
        // Create a simple template file so the templates directory is not empty
        await Deno.writeTextFile(`${templatesDir}/test.md`, '# Test Template')

        // Create a basic workspace
        const workspace = await createWorkspace({
          workspacePath: tempDir,
          templatesPath: templatesDir,
        })

        // Add git functionality
        const gitWorkspace = withGitFunctionality(workspace)

        // 🤖 Check that the method exists on the workspace
        assertEquals(
          typeof gitWorkspace.removeGithubRepo,
          'function',
          'removeGithubRepo should be available on workspace with git functionality',
        )

        // 🤖 Verify the method signature matches the expected interface
        assertEquals(
          gitWorkspace.removeGithubRepo.length,
          0,
          'removeGithubRepo should accept optional parameters with defaults',
        )
      } finally {
        // Clean up
        await Deno.remove(tempDir, { recursive: true }).catch(() => {})
        await Deno.remove(templatesDir, { recursive: true }).catch(() => {})
      }
    },
  )
})
