#!/usr/bin/env deno run --allow-run --allow-read

/**
 * @module run-cursor-dev-container
 * @fileoverview Cursor Dev Container Launcher
 *
 * Automates the process of launching Cursor directly into a dev container,
 * bypassing the need for manual "Reopen in Container" command palette actions.
 *
 * @description This script manages Docker container lifecycle and constructs the proper
 * vscode-remote:// URI format required by Cursor's dev container extension. Key differences
 * from VS Code include specific JSON structure requirements and Docker context settings
 * for macOS Docker Desktop integration.
 *
 * KEY DIFFERENCES FROM VS CODE:
 * 1. Cursor uses the same dev-container URI format as VS Code, but requires specific
 *    JSON structure and Docker context settings for macOS Docker Desktop
 * 2. The --folder-uri flag must be used with a properly constructed vscode-remote:// URI
 * 3. Docker context "desktop-linux" is crucial for macOS Docker Desktop integration
 *
 * @author Zachary Iles
 * @version 0.0.1
 * @since 2025
 * @requires deno
 * @requires docker
 * @requires cursor
 *
 * @example
 * ```bash
 * deno run -A run-cursor-dev-container.ts
 * ```
 *
 * @see ~/.cursor/extensions/ms-vscode-remote.remote-containers-0.394.0/dist/extension.js
 *      Contains URI construction logic around lines 50000-60000, including Buffer.from(configJSON,"utf8").toString("hex") pattern
 * @see ~/.cursor/extensions/ms-vscode-remote.remote-containers-0.394.0/dist/common/uri.js
 *      Authority type definitions (dev-container, attached-container, k8s-container) and URI parsing functions
 * @see ~/.cursor/extensions/ms-vscode-remote.remote-containers-0.394.0/dist/common/containerConfiguration.js
 *      JSON config structure requirements for container settings and Docker context handling
 */

const CONTAINER_NAME = 'DenoContainer'
const DEFAULT_DENO_VERSION = '2.3.5'

async function run(cmd: string, args: string[] = []) {
  const command = new Deno.Command(cmd, {
    args,
    stdout: 'piped',
    stderr: 'piped',
  })

  const { success, stdout, stderr } = await command.output()
  const decoder = new TextDecoder()

  return {
    success,
    stdout: decoder.decode(stdout).trim(),
    stderr: decoder.decode(stderr).trim(),
  }
}

async function getContainerStatus() {
  // Check if container exists (running or stopped)
  // CURSOR NUANCE: We need to ensure the container is running before launching Cursor
  // because Cursor's dev container extension expects an existing container unlike VS Code
  // which can build containers on-demand more reliably
  const { stdout } = await run('docker', [
    'ps',
    '-a',
    '--filter',
    `name=${CONTAINER_NAME}`,
    '--format',
    '{{.Status}}',
  ])
  return stdout
}

async function startContainer() {
  const status = await getContainerStatus()

  if (!status) {
    // Read .deno-version directly because devcontainer.json build args don't work reliably in Cursor
    const version = await Deno.readTextFile('.deno-version').catch(() =>
      DEFAULT_DENO_VERSION
    )
    const result = await run('docker', [
      'build',
      '--build-arg',
      `DENO_VERSION=${version.trim()}`,
      '-t',
      CONTAINER_NAME.toLowerCase(),
      '.devcontainer/',
    ])

    if (!result.success) throw new Error(`Build failed: ${result.stderr}`)
    return
  }

  if (status.startsWith('Up')) {
    console.log('Container running')
    return
  }

  console.log('Starting container...')
  const result = await run('docker', ['start', CONTAINER_NAME])
  if (!result.success) throw new Error(`Start failed: ${result.stderr}`)
}

function createDevContainerUri() {
  // CURSOR DEV CONTAINER URI CONSTRUCTION
  // This is the critical part that differs from VS Code documentation.
  // Cursor expects a very specific URI format for programmatic dev container opening.

  // IMPORTANT: Without desktop-linux context, Cursor tries unix:///var/run/docker.sock which fails on macOS
  const config = {
    hostPath: Deno.cwd(),
    localDocker: true,
    settings: {
      context: 'desktop-linux', // Required for macOS Docker Desktop
    },
  }

  // Convert JSON to hex encoding as expected by Cursor's dev container extension
  // This matches the Buffer.from(s,"utf8").toString("hex") pattern from the extension source
  const hex = Array.from(new TextEncoder().encode(JSON.stringify(config)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return `vscode-remote://dev-container+${hex}/workspace`
}

async function openCursor() {
  const uri = createDevContainerUri()

  // Launch Cursor with the properly constructed dev container URI
  // Format: vscode-remote://dev-container+<hex-encoded-config><workspace-path>
  // This bypasses the need for manual "Reopen in Container" command palette action
  const result = await run('cursor', ['--folder-uri', uri])

  if (!result.success) {
    throw new Error(`Cursor launch failed: ${result.stderr}`)
  }
}

async function main() {
  try {
    await startContainer()
    console.debug('Opening Cursor...')
    await openCursor()
    console.debug('Success! Cursor is running in dev container')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error:', message)
    console.log(
      "Fallback: Use 'Dev Containers: Reopen in Container' in Cursor",
    )
    Deno.exit(1)
  }
}

if (import.meta.main) {
  await main()
}
