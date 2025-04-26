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

1.  **Push a Tag:** A developer pushes a new version tag (e.g., `vX.Y.Z`) pointing to the desired release commit on `main`.
2.  **Trigger `Test Installer` Workflow (`test-installer.yml`):**
    *   Triggered by the tag push.
    *   Checks out the code at the specific tag (`${{ github.ref }}`).
    *   Builds the `deno-kit` binary for Linux x86_64 using `deno task build`.
    *   Tests the `install.sh` script using the built binary.
    *   Verifies the installed binary version matches the tag.
    *   Tests uninstallation.
3.  **Trigger `Publish to JSR` Workflow (`publish-jsr.yml`):**
    *   Triggered by the successful completion of `Test Installer`.
    *   **Crucially**, runs *only if* the commit the tag points to (`${{ github.event.workflow_run.head_commit.message }}`) has a message starting with `chore: tag version v`.
    *   Checks out the code at the exact commit SHA (`${{ github.event.workflow_run.head_sha }}`).
    *   Runs `deno task build` (Note: This build isn't strictly necessary for JSR publishing itself).
    *   Publishes the package to JSR using `npx jsr publish --no-check`.
        *   **Note:** `--no-check` bypasses local Deno/JSR checks. Ensure these pass locally before tagging.
4.  **Trigger `Publish to GitHub Releases` Workflow (`publish-github.yml`):**
    *   Triggered by the successful completion of `Publish to JSR`.
    *   **Crucially**, also runs *only if* the tagged commit message starts with `chore: tag version v`.
    *   Checks out the code at the exact commit SHA (`${{ github.event.workflow_run.head_sha }}`).
    *   Builds binaries for all supported platforms using `deno task build`.
    *   Creates a new GitHub Release named after the tag.
    *   Attaches the built binary `.zip` archives to the GitHub Release.
    *   Automatically generates release notes based on commit messages since the previous tag.

## How to Release a New Version

1.  **Ensure `main` is Stable:** Make sure the `main` branch is up-to-date and contains all changes intended for the release. Pull the latest changes (`git checkout main && git pull origin main`).
2.  **Run Local Checks:** Verify tests, linting, formatting, and type-checking pass locally on the `main` branch using the defined Deno tasks:
    ```bash
    # Run linters, formatters, and type checks
    deno task pre-publish

    # Run all tests
    deno task tests
    ```
3.  **Update Version:** Update the `version` field in `deno.jsonc` according to [SemVer](https://semver.org/) rules.
4.  **Commit and Push Version Change:** Stage and commit the change to `deno.jsonc`. **IMPORTANT:** The commit message for this change **MUST** start with `chore: tag version v` (e.g., `chore: tag version v1.2.3`) for the automated JSR and GitHub Release publishing workflows to run.
    ```bash
    # Example (Replace X.Y.Z with the actual version):
    git add deno.jsonc
    git commit -m "chore: tag version vX.Y.Z"
    git push origin main
    ```
5.  **Run the Tagging Script:** Use the `tag.ts` script via the Deno task to automate tagging and pushing. Provide the target version tag (matching the one in `deno.jsonc` and the commit message) as an argument. The script handles syncing, tag validation, potential overwriting of existing tags, and pushing the tag to trigger the workflows.
    ```bash
    # Example: Release version v1.2.3
    deno task tag v1.2.3
    ```
    This script performs the following actions:
    *   Checks if the working directory is clean. If not, it stages changes and prompts for a conventional commit message (defaults to `chore: tag version vX.Y.Z`).
    *   Pulls the latest changes from `origin main` using `git pull --rebase`.
    *   Pushes any local commits (like the version bump) to `origin main`.
    *   Fetches all remote tags.
    *   Validates the provided tag format (`vX.Y.Z`) and ensures it's newer than the latest existing tag.
    *   **Important:** If the tag already exists locally or remotely, the script will *delete* the existing tag(s) and create a new one pointing to the current commit. This allows re-running the release workflows for the same version if needed.
    *   Creates the local tag.
    *   Pushes the new tag to `origin`, which triggers the release workflows (`Test Installer`, `Publish to JSR`, `Publish to GitHub Releases`).

6.  **Monitor Workflows:** Check the "Actions" tab in the GitHub repository to monitor the progress of the triggered workflows. Address any failures.

## Important Considerations

*   **`tag.ts` Script:** The release process is primarily driven by the `scripts/tag.ts` Deno task. Understand its behavior, especially regarding working directory changes and tag overwriting.
*   **Workflow Trigger Commit Message:** The `Publish to JSR` and `Publish to GitHub Releases` workflows will *only* run if the commit the tag points to has a message starting with `chore: tag version v`. Ensure the version bump commit (Step 4) uses this exact format.
*   **Tag Format & Validation:** The `tag.ts` script enforces the `vX.Y.Z` SemVer format.
*   **`jsr publish --no-check`:** The JSR publish step in the workflow skips local checks (`deno task pre-publish`, `deno task tests`). It is **essential** to run these checks locally *before* running the `deno task tag` command.
*   **Commit Messages for Release Notes:** Use conventional commit messages (e.g., `feat: ...`, `fix: ...`, `chore: ...`) on your feature/fix commits for meaningful auto-generated GitHub Release notes. Note that the specific `chore: tag version v...` message is only required for the version bump commit to trigger the workflows.
*   **Build Scripts:** The release workflows rely on `deno task build` (which runs `./scripts/build.ts`) executing correctly.
*   **Manual Intervention:** Avoid manually running `git tag`, `git push --tags`, publishing to JSR, or creating GitHub Releases for versions intended to go through this automated flow. If a workflow fails (e.g., due to an incorrect commit message on the tagged commit, or a build failure), investigate the cause, fix the underlying issue (you might need to amend the commit message and re-tag), and potentially re-run the `deno task tag vX.Y.Z` command (which will overwrite the existing tag and trigger the workflows again).
