# Deno-Kit Build and Release Process

This document provides a comprehensive technical overview of the build, release, and installation process for Deno-Kit.

## 1. Build Process Overview

The core build process is orchestrated by `scripts/build.ts`, which compiles the Deno-Kit application into standalone native executables for multiple platforms and packages them into distributable `.zip` archives. This process is utilized both for local development and in CI/CD pipelines.

## 2. Build Script (`scripts/build.ts`)

The `build.ts` script handles the entire build workflow:

### Resource Preparation

1. Verifies essential source files, configuration, and assets exist (e.g., `src/main.ts`, `deno.jsonc`, banned directories lists, `templates/` directory)
2. Creates the `bin/` directory if it doesn't exist
3. Creates a temporary `bin/templates.zip` archive from the `templates/` directory (used during build, then cleaned up)

### Multi-Platform Compilation

The script builds binaries for the following targets:

- Windows x86_64 (`x86_64-pc-windows-msvc`)
- macOS x86_64 (`x86_64-apple-darwin`)
- macOS ARM64/Apple Silicon (`aarch64-apple-darwin`)
- Linux x86_64 (`x86_64-unknown-linux-gnu`)
- Linux ARM64 (`aarch64-unknown-linux-gnu`)

For each platform, the build script:

1. **Constructs and executes a `deno compile` command** with:
   - **Source**: `src/main.ts`
   - **Flags**: `-A` (all permissions), `--lock`, `--no-check`, `--config deno.jsonc`
   - **Target**: The specific platform identifier
   - **Output**: Platform-specific binary path (e.g., `bin/deno-kit-linux-x86_64`)
   - **Resource Embedding**: Using `--include` to bundle configuration files directly into the binary:
     - `src/utils/banned_directories_default.jsonc`
     - `src/utils/banned_directories_custom.jsonc`
     - `deno.jsonc`
   - **Icon**: Windows builds include `assets/deno-kit.ico`
2. **Sets executable permissions** for non-Windows binaries
3. **Creates a platform-specific zip archive** (e.g., `bin/deno-kit-linux-x86_64.zip`) containing only:
   - The compiled binary
4. **Cleans up temporary files** including the raw binaries and the temporary `bin/templates.zip` after all builds are complete

## 3. CI/CD Release Pipeline

The release process is automated through a sequence of GitHub Actions workflows:

### 1. Test Installer Workflow (`test-installer.yml`)

Triggered when a tag matching `v[0-9]+.[0-9]+.[0-9]+` is pushed:

1. Sets up Deno v2.x
2. Builds binaries using `scripts/build.ts`
3. Tests the installer with the locally built Linux binary:
   - Verifies installation works correctly
   - Checks that the installed version matches the release tag
   - Tests uninstallation functionality

### 2. Publish to JSR Workflow (`publish-jsr.yml`)

Runs after the Test Installer workflow completes successfully if the commit message contains "chore: tag version v":

1. Sets up Deno v2.x
2. Creates the bin directory
3. Runs the build task
4. Publishes the package to JSR (JavaScript Registry) using `npx jsr publish --no-check`

### 3. Publish to GitHub Releases Workflow (`publish-github.yml`)

Runs after the Publish to JSR workflow completes successfully:

1. Sets up Deno v2.x
2. Builds binaries for all platforms
3. Extracts the version from the git tag
4. Creates a GitHub release with:
   - The version tag
   - Generated release notes
   - Uploads all platform-specific zip files (containing the binary) from the `bin/` directory as release assets.

## 4. Installation Process

Deno-Kit provides a shell script (`install.sh`) that handles downloading, extracting, and installing the appropriate binary for the user's platform.

### Installation Script (`install.sh`)

The recommended installation method:

```
curl -fsSL https://raw.githubusercontent.com/zackiles/deno-kit/main/install.sh | sh
```

The script performs these steps:

1. **Platform Detection**: Automatically identifies the OS (macOS, Linux, Windows) and architecture (x86_64, ARM64)
2. **Release Fetching**: Downloads the appropriate platform-specific zip archive (e.g., `deno-kit-linux-x86_64.zip`) from the latest GitHub release (or uses a specified version tag)
3. **Extraction**: Unpacks the zip archive containing the binary into a temporary location
4. **Installation**:
   - Places the binary in `~/.local/bin/deno-kit` (Unix/macOS) or `%USERPROFILE%\.bin\deno-kit.exe` (Windows)
   - Sets executable permissions
5. **PATH Configuration**: Verifies the installation and guides users to add the installation directory to PATH if needed

### Installation Options

The script supports several optional flags:

- `--tag=VERSION`: Install a specific version (defaults to latest)
- `--path=PATH`: Specify a custom installation directory (defaults to standard user binary locations)
- `--source-file=FILE`: Use a local zip file instead of downloading from GitHub
- `--uninstall`: Remove an existing installation instead of installing

### Uninstallation

To uninstall Deno-Kit:

```
curl -fsSL https://raw.githubusercontent.com/zackiles/deno-kit/main/install.sh | sh -s -- --uninstall
```

## 5. Binary Details

Each platform-specific binary:

1. **Is self-contained**: Includes the Deno runtime and application code
2. **Contains embedded resources**: Accessible through an internal Virtual File System (VFS):
   - Configuration files (`deno.jsonc`)
   - Banned directories lists
3. **Is pre-configured for production**: The binary defaults to `DENO_KIT_ENV=production` unless overridden by the system environment.

When a user runs commands such as `deno-kit init`, the application can:

- Access the embedded configuration files
- Use the environment configuration (defaulting to production if no `DENO_KIT_ENV` system variable is set)
- Access project templates (likely bundled implicitly via the source code import graph or fetched dynamically, as `templates.zip` is not distributed with the binary)
