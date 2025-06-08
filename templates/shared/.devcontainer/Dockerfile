# syntax=docker/dockerfile:1

# CURSOR DEV CONTAINER DOCKERFILE
#
# This Dockerfile is specifically configured for Cursor's dev container implementation.
# Key difference from VS Code: We use a hardcoded Deno version that matches .deno-version
# instead of ARG/build-time variables because Cursor's ${localEnv:} evaluation timing
# causes build args to be empty when initializeCommand runs after build-time.

# Use the exact version from .deno-version file (2.1.4)
# CURSOR COMPATIBILITY: Hardcoded instead of ARG because build args don't work reliably
# with Cursor's environment variable timing. The test.ts script reads .deno-version
# directly and ensures this matches.
FROM denoland/deno:2.1.4

# Install essential dev tools and create vscode user for dev container compatibility
# CURSOR REQUIREMENT: The vscode user is essential for proper file permissions and
# compatibility with Cursor's remote development features
RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    sudo \
    curl \
    bash \
    # Create vscode user with UID 1001 to avoid conflicts with Deno image's UID 1000
    && useradd -m -s /bin/bash -u 1001 vscode \
    # Give vscode user sudo privileges for development flexibility
    && echo "vscode ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers \
    # Clean up to reduce image size
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Switch to vscode user for all subsequent operations
# CURSOR REQUIREMENT: Running as vscode user ensures proper file ownership
# and compatibility with Cursor's remote user configuration
USER vscode
WORKDIR /workspace

# Set up deno cache directory with proper permissions
# This ensures Deno modules are cached correctly for the vscode user
ENV DENO_DIR=/home/vscode/.cache/deno
RUN mkdir -p ${DENO_DIR}

# Install deno deploy command (optional)
# CURSOR COMPATIBILITY: Made optional to prevent build failures if network issues occur
# The || echo allows the build to continue even if deployctl installation fails
RUN deno install -A --global https://deno.land/x/deploy/deployctl.ts || \
    echo "Warning: deployctl installation failed, can install later if needed"

# [Optional] Uncomment this section to install additional OS packages.
# RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
#    && apt-get -y install --no-install-recommends <your-package-list-here>
