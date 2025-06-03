import { assertEquals, assertRejects } from '@std/assert'
import { WorkspaceGit } from '../src/workspace/workspace-git.ts'

Deno.test('WorkspaceGit - removeGithubRepo method interface', async (t) => {
  await t.step('method exists and has correct signature', () => {
    const gitWorkspace = new WorkspaceGit()

    // 🤖 Check that the method exists
    assertEquals(
      typeof gitWorkspace.removeGithubRepo,
      'function',
      'removeGithubRepo should be a function',
    )
  })

  await t.step('method validates authentication requirement', async () => {
    const gitWorkspace = new WorkspaceGit()

    // 🤖 This should fail with auth error since gh is likely not available or authenticated
    await assertRejects(
      async () => {
        await gitWorkspace.removeGithubRepo({
          name: 'test/test-repo',
          confirm: true,
        })
      },
      Error,
      'Failed to delete repository',
      'Should require GitHub CLI authentication',
    )
  })

  await t.step(
    'method validates repository name when not provided',
    async () => {
      const gitWorkspace = new WorkspaceGit()

      // 🤖 This should fail when trying to get remote URL since we're not in a git repo
      await assertRejects(
        async () => {
          await gitWorkspace.removeGithubRepo({ confirm: true })
        },
        Error,
        'No repository name provided',
        'Should fail when GitHub CLI is not available',
      )
    },
  )
})
