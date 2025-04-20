# Releasing Deno Kit

This document describes the automated process for releasing new versions of Deno Kit, typically from the `main` branch. Releases are handled automatically via GitHub Actions when a version tag is pushed.

## Development Workflow

Before releasing, the typical development workflow is:

1.  **Feature Branches:** Create branches off `main` for new features or fixes (e.g., `feat/my-feature`, `fix/my-bug`).
2.  **Pull Requests:** Submit Pull Requests to merge completed feature/fix branches back into `main`.
3.  **`main` Branch:** Keep the `main` branch stable and representing the code intended for the *next* release.

## Release Workflow (Triggered by Tag Push)

The release process is triggered **solely by pushing a Git tag** from your local machine to the remote repository. This tag should follow Semantic Versioning, be prefixed with `v` (e.g., `v1.0.0`, `v1.2.3`), and typically point to a commit on the `main` branch.

The tag push triggers the first workflow defined in `.github/workflows/test-installer.yml` (due to its `on: push: tags:` configuration). Subsequent workflows are triggered upon the successful completion of the previous one, using `on: workflow_run:` configurations in `.github/workflows/publish-jsr.yml` and `.github/workflows/publish-github.yml`.

Here's the automated workflow sequence:

1.  **Push a Tag:** A developer pushes a new version tag (e.g., `git push origin vX.Y.Z`) pointing to the desired release commit on `main`.
2.  **Trigger `Test Installer` Workflow (`test-installer.yml`):**
    *   Checks out the code at the specific tag.
    *   Builds the `deno-kit` binary for Linux x86_64 using `deno task build`.
    *   Tests the `install.sh` script by running it with the `--source-file` flag pointing to the just-built binary archive.
    *   Verifies that the installed binary executes and reports the correct version (matching the tag).
    *   Tests the uninstallation using `install.sh --uninstall`.
3.  **Trigger `Publish to JSR` Workflow (`publish-jsr.yml`):**
    *   Runs *only if* the `Test Installer` workflow succeeds.
    *   Checks out the code at the specific tag.
    *   Publishes the package to JSR using `npx jsr publish --no-check`.
        *   **Note:** `--no-check` bypasses local Deno/JSR checks (lint, fmt, etc.). Ensure these pass locally before tagging.
4.  **Trigger `Publish to GitHub Releases` Workflow (`publish-github.yml`):**
    *   Runs *only if* the `Publish to JSR` workflow succeeds.
    *   Checks out the code at the specific tag.
    *   Builds binaries for all supported platforms (macOS, Windows, Linux) using `deno task build`.
    *   Creates a new GitHub Release named after the tag (e.g., "Release vX.Y.Z").
    *   Attaches the built binary `.zip` archives to the GitHub Release.
    *   Automatically generates release notes based on commit messages between the new tag and the previous tag.

## How to Release a New Version

1.  **Ensure `main` is Stable:** Make sure the `main` branch is up-to-date and contains all changes intended for the release. Pull the latest changes (`git checkout main && git pull origin main`).
2.  **Run Local Checks:** Verify tests, linting, formatting, and type-checking pass locally on the `main` branch using the defined Deno tasks:
    ```bash
    # Run linters, formatters, and type checks
    deno task pre-publish

    # Run all tests
    deno task tests
    ```
3.  **Update Version (if necessary):** Although not strictly enforced by the automation itself (JSR uses the version from `deno.jsonc`), it's crucial to update the `version` field in `deno.jsonc` according to [SemVer](https://semver.org/) rules *before* tagging.
    ```bash
    # Example: Update deno.jsonc manually or using a tool
    git add deno.jsonc
    git commit -m "chore: bump version to X.Y.Z"
    git push origin main
    ```
4.  **Create and Push Tag:** Create an annotated tag (recommended) or a lightweight tag for the desired version on the commit you want to release (usually the latest commit on `main`).
    ```bash
    # Ensure your local main branch is up-to-date
    git checkout main
    git pull origin main

    # Create the tag (use the version from deno.jsonc)
    git tag vX.Y.Z

    # Push the tag to trigger the release workflows
    git push origin vX.Y.Z
    ```
5.  **Monitor Workflows:** Check the "Actions" tab in the GitHub repository to monitor the progress of the `Test Installer`, `Publish to JSR`, and `Publish to GitHub Releases` workflows. Address any failures.

## Important Considerations

*   **Tag Format:** Tags MUST start with `v` followed by a valid SemVer string (e.g., `v1.0.0`).
*   **`jsr publish --no-check`:** The JSR publish step currently skips local checks. It's **essential** to run these checks (`deno task test`, `deno task lint`, `deno task fmt`) *before* pushing the tag.
*   **Commit Messages:** Use conventional commit messages (e.g., `feat: ...`, `fix: ...`, `chore: ...`) for meaningful auto-generated GitHub Release notes.
*   **Build Script:** The release process relies on `./scripts/build.ts` running correctly and producing the expected zipped binaries in the `bin/` directory.
*   **Manual Intervention:** Do not manually publish to JSR or create GitHub Releases for versions intended to go through this automated flow, as it can interfere with the process or lead to inconsistencies. If a workflow fails, investigate the cause and potentially re-run the failed jobs or push a corrected tag if necessary.
