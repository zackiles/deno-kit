# Releasing @deno-kit/kit

This document describes the process for building and releasing new versions of the `@deno-kit/kit` library to JSR.

## Prerequisites

- Access to the GitHub repository with push permissions
- JSR publish token (for manual publishing)
- Deno 2.0 or newer installed

## Release Process

### 1. Prepare for Release

1. Ensure all changes are committed and pushed to the main branch
2. Make sure all tests pass:
   ```bash
   deno task test
   ```
3. Check that the code passes linting and formatting:
   ```bash
   deno lint
   deno fmt --check
   ```

### 2. Bump Version

1. Update the version in `deno.jsonc`:
   - Increment according to [semver](https://semver.org/) rules:
     - PATCH (0.0.x) for backwards-compatible bug fixes
     - MINOR (0.x.0) for backwards-compatible new features
     - MAJOR (x.0.0) for backwards-incompatible changes
   
2. Run the version bump script to update version references in documentation:
   ```bash
   deno task bump-version
   ```

3. Commit the version changes:
   ```bash
   git add deno.jsonc README.md
   git commit -m "chore: bump version to X.Y.Z"
   git push origin main
   ```

### 3. Build (if needed)

If you need to build the executable for distribution:

```bash
deno run -A scripts/build.ts
```

This will create the `kit` executable in the project workspace.

### 4. Publish to JSR

#### Automated Publishing (Recommended)

The GitHub Action workflow will automatically publish to JSR when a new tag is pushed:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

The GitHub Actions workflow (`jsr-publish.yml`) will handle the publishing process.

#### Manual Publishing

If needed, you can publish manually:

1. Ensure you have a JSR token:
   ```bash
   deno login
   ```

2. Publish to JSR:
   ```bash
   deno publish
   ```

### 5. Post-Release

1. Create a GitHub release:
   - Go to the repository's "Releases" section
   - Click "Draft a new release"
   - Select the tag you just pushed
   - Add release notes describing the changes
   - Attach any built binaries if applicable

2. Announce the release in appropriate channels

## Troubleshooting

### Publishing Issues

If you encounter publishing errors:

1. Verify your JSR token is valid
2. Check that the version in `deno.jsonc` hasn't already been published
3. Ensure the `publish` section in `deno.jsonc` includes all necessary files
4. Check the GitHub Actions logs for detailed error information

### Build Issues

If the build script fails:

1. Check Deno permissions
2. Verify the project structure matches what the build script expects
3. Check for OS compatibility (the script supports macOS, Windows, and Linux) 
