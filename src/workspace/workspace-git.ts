/**
 * @module workspace-git
 *
 * Provides a WorkspaceGit class for managing git repositories and GitHub operations.
 * Supports repository creation, authentication management, and secret configuration.
 *
 * @example
 * ```ts
 * import { WorkspaceGit } from "./workspace-git.ts"
 * import { Workspace } from "../workspace/index.ts"
 *
 * // Create with existing workspace
 * const workspace = await Workspace.create({ workspacePath: "./my-project" })
 * const gitWorkspace = new WorkspaceGit(workspace)
 *
 * // Create without workspace (uses current directory)
 * const gitWorkspace = new WorkspaceGit()
 *
 * // Get GitHub user information
 * const { login } = await gitWorkspace.getGithubUser()
 *
 * // Create a new repository
 * const { path, repoUrl } = await gitWorkspace.createRepo({
 *   name: "my-new-repo",
 *   public: false,
 *   push: true,
 *   commitMessage: "feat: initial commit"
 * })
 *
 * // Create repository secret
 * await gitWorkspace.createRepoSecret({
 *   name: "API_KEY",
 *   value: "secret-value"
 * })
 * ```
 */
import { basename } from '@std/path'
import { Workspace } from './index.ts'
import type { WorkspaceWithGit } from './types.ts'

/**
 * WorkspaceGit class that manages git repositories and GitHub operations.
 * Provides functionality for repository creation, authentication, and secrets management.
 * All operations require GitHub CLI (gh) authentication.
 */
class WorkspaceGit {
  #workspace?: Workspace

  /**
   * Create a new WorkspaceGit instance
   *
   * @param workspace Optional Workspace instance to use for operations
   */
  constructor(workspace?: Workspace) {
    if (workspace) {
      this.#workspace = workspace
    }
  }

  /**
   * Ensures GitHub CLI is authenticated before performing operations
   *
   * @returns True if authentication is successful
   * @throws Error if gh is not available or authentication fails
   * @private
   */
  static async #ensureAuth(): Promise<boolean> {
    try {
      await Workspace.runCommand('gh', ['--version'])
    } catch {
      throw new Error('GitHub CLI (gh) is not available on PATH')
    }

    // Check authentication status
    try {
      await Workspace.runCommand('gh', ['auth', 'status', '--active'])
      return true
    } catch {
      // Not authenticated, try to login with GH_TOKEN
      const ghToken = Deno.env.get('GH_TOKEN')
      if (!ghToken) {
        throw new Error(
          'Not authenticated with GitHub CLI and GH_TOKEN environment variable is not set',
        )
      }

      // Attempt to login with token
      try {
        await Workspace.runCommand('sh', [
          '-c',
          'echo $GH_TOKEN | gh auth login --with-token',
        ])
        return true
      } catch (error) {
        throw new Error(
          `Failed to authenticate with GitHub CLI using GH_TOKEN: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }
  }

  /**
   * Gets the authenticated user information from GitHub
   *
   * @returns Object containing user login information
   * @throws Error if authentication fails or unable to get user info
   */
  static async getGithubUser(): Promise<{ login: string }> {
    // Get authenticated user
    const login = await Workspace.runCommand('sh', [
      '-c',
      'gh api user --jq .login | cat',
    ])

    if (!login) {
      throw new Error('Failed to get GitHub user login')
    }

    return { login }
  }

  /**
   * Creates a local git repository if one doesn't already exist
   *
   * @param options Configuration options for local repository creation
   * @param options.name Optional repository name (currently unused, reserved for future use)
   * @param options.commitMessage Optional commit message for initial commit
   *   - If the path is not already a git repository, creates an initial commit
   *   - If no message provided, uses a default 'chore: initial commit'
   *   - If path is already a git repository, requires a commit message
   *
   * @throws {Error} If:
   *   - Git is not available on the system
   *   - The path is already a git repository but no commit message was provided
   *
   * @example
   * // Create a local repo with initial commit
   * await gitWorkspace.createLocalRepo({
   *   commitMessage: 'feat: initial project setup'
   * })
   *
   * @private
   */
  async createLocalRepo({
    commitMessage,
  }: {
    name?: string
    commitMessage?: string
  } = {}): Promise<void> {
    const runCommand = this.#workspace
      ? this.#workspace.runCommand.bind(this.#workspace)
      : Workspace.runCommand

    // Check if git is available
    try {
      await runCommand('git', ['--version'])
    } catch {
      throw new Error('Git is not available on PATH')
    }

    // Check if current path is a git repo
    const isGitRepo = await (async () => {
      try {
        await runCommand('git', ['rev-parse', '--git-dir'])
        return true
      } catch {
        return false
      }
    })()

    if (!isGitRepo) {
      // Initialize git repo
      await runCommand('git', ['init'])

      // Stage all files
      await runCommand('git', ['add', '.'])

      // Commit with message
      const message = commitMessage || 'chore: initial commit'
      await runCommand('git', ['commit', '-m', message])
    } else if (!commitMessage) {
      throw new Error(
        'Path is already a git repository but no commit message was provided',
      )
    }
  }

  /**
   * Creates a new GitHub repository with flexible path and naming options
   *
   * @param options Configuration options for repository creation
   * @param options.name Optional custom repository name
   *   - If provided, uses this name for the GitHub repository
   *   - If not provided, uses the basename of the current path or workspace path
   * @param options.isPublic Whether repository should be public (default: false)
   * @param options.push Whether to push local commits to the new repository (default: false)
   * @param options.commitMessage Optional commit message for initial commit
   *   - If the path is not already a git repository, creates an initial commit
   *   - If no message provided, uses a default 'chore: initial commit'
   *   - If path is already a git repository, requires a commit message
   *
   * @returns An object containing:
   *   - path: The local path used to create the repository
   *   - repoUrl: The GitHub URL of the newly created repository
   *
   * @throws {Error} If:
   *   - Git is not available on the system
   *   - A repository already exists on GitHub at the specified location
   *   - Authentication with GitHub fails
   *   - The repository creation process encounters an error
   *
   * @example
   * // Create a repo using current directory name
   * const repo = await gitWorkspace.createGithubRepo()
   *
   * @example
   * // Create a repo with a custom name
   * const repo = await gitWorkspace.createGithubRepo({
   *   name: 'my-custom-repo',
   *   isPublic: true,
   *   commitMessage: 'Initial project setup'
   * })
   */
  async createGithubRepo({
    name,
    isPublic = false,
    push = false,
  }: {
    name?: string
    isPublic?: boolean
    push?: boolean
  } = {}): Promise<{ path: string; repoUrl: string }> {
    await WorkspaceGit.#ensureAuth()

    const runCommand = this.#workspace
      ? this.#workspace.runCommand.bind(this.#workspace)
      : Workspace.runCommand

    const path = this.#workspace?.path || Deno.cwd()
    const repoName = name || basename(path)

    // Check if repo already exists on GitHub
    try {
      const remoteUrl = await runCommand('git', ['remote', 'get-url', 'origin'])
      if (remoteUrl.includes('github.com')) {
        throw new Error('Repository already exists on GitHub')
      }
    } catch (error) {
      // If error is not about remote not existing, re-throw
      if (
        error instanceof Error &&
        error.message.includes('already exists on GitHub')
      ) {
        throw error
      }
      // Remote doesn't exist, which is what we want
    }

    // Create GitHub repository
    const ghArgs = ['repo', 'create', `--source=${path}`]
    if (repoName !== basename(path)) {
      ghArgs.push(repoName)
    }
    if (isPublic) {
      ghArgs.push('--public')
    } else {
      ghArgs.push('--private')
    }
    if (push) {
      ghArgs.push('--push')
    }

    const output = await runCommand('gh', ghArgs)

    // Extract repository URL from output
    const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+/)
    const repoUrl = urlMatch ? urlMatch[0] : ''

    if (!repoUrl) {
      throw new Error('Failed to extract repository URL from gh output')
    }

    return { path, repoUrl }
  }

  /**
   * Creates a repository secret
   *
   * @param options Secret configuration
   * @param options.name Secret name
   * @param options.value Secret value
   * @throws Error if secret already exists or creation fails
   */
  async createRepoSecret({
    name,
    value,
  }: {
    name: string
    value: string
  }): Promise<void> {
    await WorkspaceGit.#ensureAuth()

    const runCommand = this.#workspace
      ? this.#workspace.runCommand.bind(this.#workspace)
      : Workspace.runCommand

    // Check if secret already exists
    try {
      await runCommand('gh', [
        'secret',
        'list',
        '--json',
        'name',
        '--jq',
        `.[] | select(.name=="${name}") | .name`,
      ])
      throw new Error(`Secret '${name}' already exists`)
    } catch (error) {
      // If error is about secret existing, re-throw
      if (error instanceof Error && error.message.includes('already exists')) {
        throw error
      }
      // Secret doesn't exist, which is what we want
    }

    // Create secret
    await runCommand('sh', ['-c', `echo "${value}" | gh secret set ${name}`])
  }
}

/**
 * Adds git functionality to a workspace instance
 */
function withGitFunctionality<T extends Workspace>(
  workspace: T,
): T & WorkspaceWithGit {
  const gitWorkspace = new WorkspaceGit(workspace)

  return Object.assign(workspace, {
    // TODO: Refactor the Workspace class to move the other git related commands to this file as well
    createLocalRepo: gitWorkspace.createLocalRepo.bind(gitWorkspace),
    getGithubUser: WorkspaceGit.getGithubUser.bind(gitWorkspace),
    createGithubRepo: gitWorkspace.createGithubRepo.bind(gitWorkspace),
    createRepoSecret: gitWorkspace.createRepoSecret.bind(gitWorkspace),
  }) as T & WorkspaceWithGit
}

export { withGitFunctionality, WorkspaceGit }
