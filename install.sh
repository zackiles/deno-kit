#!/bin/sh
set -e

# Deno-Kit Installer
# This script downloads and installs the Deno-Kit binary for your platform.
#
# Usage:
#   ./install.sh [options]
#
# Options:
#   --tag=VERSION    Install specific version (default: latest)
#   --path=PATH      Override default installation path
#   --source-file=FILE Path to a local release zip file to install instead of downloading
#   --uninstall      Remove deno-kit binary instead of installing
#   -h, --help       Show this help message and exit
#
# This script:
# 1. Detects your OS and architecture (unless using --source-file)
# 2. Downloads the appropriate binary from GitHub releases OR uses the local file
# 3. Extracts the zip archive
# 4. Installs the binary to:
#    - Unix/macOS: ~/.local/bin/deno-kit
#    - Windows: %USERPROFILE%\\.bin\\deno-kit.exe
# 5. Sets executable permissions
# 6. Verifies installation and helps add to PATH if needed
#
# The script will overwrite any existing deno-kit installation.

GITHUB_REPO="zackiles/deno-kit"
BIN_NAME="deno-kit"
INSTALL_DIR="${HOME}/.local/bin"
TEMP_DIR=""
SOURCE_FILE="" # New variable for local source file

# Parse arguments
VERSION="latest"
CUSTOM_INSTALL_DIR=""
UNINSTALL_MODE=false
while [ $# -gt 0 ]; do
  case "$1" in
    --tag=*)
      VERSION="${1#*=}"
      ;;
    --path=*)
      CUSTOM_INSTALL_DIR="${1#*=}"
      ;;
    --source-file=*) # New option
      SOURCE_FILE="${1#*=}"
      ;;
    --uninstall)
      UNINSTALL_MODE=true
      ;;
    -h|--help)
      show_usage
      ;;
    *)
      echo "Unknown option: $1"
      show_usage
      ;;
  esac
  shift
done

# Validate source file if provided
if [ -n "$SOURCE_FILE" ] && [ ! -f "$SOURCE_FILE" ]; then
  fail "Source file not found: $SOURCE_FILE"
fi

# Set default install directory based on platform and any provided custom path
if [ -n "$CUSTOM_INSTALL_DIR" ]; then
  INSTALL_DIR="$CUSTOM_INSTALL_DIR"
fi

# Functions
cleanup() {
  if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
    rm -rf "$TEMP_DIR"
  fi
}

fail() {
  echo "Error: $1" >&2
  cleanup
  exit 1
}

show_usage() {
  echo "Usage: ./install.sh [options]"
  echo ""
  echo "Options:"
  echo "  --tag=VERSION    Install specific version (default: latest)"
  echo "  --path=PATH      Override default installation path"
  echo "  --source-file=FILE Path to a local release zip file to install instead of downloading"
  echo "  --uninstall      Remove deno-kit binary instead of installing"
  echo "  -h, --help       Show this help message and exit"
  echo ""
  exit 1
}

# Set up cleanup on exit
trap cleanup EXIT INT TERM

# Create a temporary directory
create_temp_dir() {
  if [ -n "$(command -v mktemp)" ]; then
    TEMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t 'deno-kit-install')
  else
    # fallback for systems without mktemp
    TEMP_DIR="${TMPDIR:-/tmp}/deno-kit-install-$$"
    mkdir -p "$TEMP_DIR"
  fi
  echo "Created temporary directory: $TEMP_DIR"
}

# Check if we need sudo for the install directory
need_sudo() {
  if [ ! -d "$INSTALL_DIR" ]; then
    if mkdir -p "$INSTALL_DIR" 2>/dev/null; then
      return 1 # No sudo needed
    else
      return 0 # Sudo needed
    fi
  elif [ -w "$INSTALL_DIR" ]; then
    return 1 # No sudo needed
  else
    return 0 # Sudo needed
  fi
}

# Detect the current platform
detect_platform() {
  PLATFORM="unknown"
  ARCH="unknown"

  # Detect OS
  case "$(uname -s)" in
    Darwin*)
      PLATFORM="macos"
      ;;
    Linux*)
      PLATFORM="linux"
      ;;
    MINGW*|MSYS*|CYGWIN*|Windows_NT)
      PLATFORM="windows"
      ;;
  esac

  # Detect architecture
  case "$(uname -m)" in
    x86_64|amd64)
      ARCH="x86_64"
      ;;
    arm64|aarch64)
      ARCH="aarch64"
      ;;
    *)
      fail "Unsupported architecture: $(uname -m)"
      ;;
  esac

  echo "Detected platform: $PLATFORM-$ARCH"
}

# Get the latest release URL from GitHub
get_release_info() {
  # Skip if using a source file
  if [ -n "$SOURCE_FILE" ]; then
    echo "Using local source file: $SOURCE_FILE"
    # Determine asset name from source file for extraction logic consistency
    ASSET_NAME=$(basename "$SOURCE_FILE")
    # Attempt to infer platform/arch from filename (optional, for logging/consistency)
    # This regex might need adjustment based on actual filenames from build.ts
    if echo "$ASSET_NAME" | grep -qE "^${BIN_NAME}-(linux|macos|windows)-(x86_64|aarch64)\.zip$"; then
        PLATFORM=$(echo "$ASSET_NAME" | sed -E "s/${BIN_NAME}-([^-]+)-.*/\\1/")
        ARCH=$(echo "$ASSET_NAME" | sed -E "s/${BIN_NAME}-[^-]+-([^-.]+)\.zip/\\1/")
        echo "Inferred platform from filename: $PLATFORM-$ARCH"
    else
        echo "Could not infer platform/arch from filename, detecting locally."
        detect_platform # Detect locally if filename doesn't match pattern
    fi
    return
  fi

  # --- Rest of existing get_release_info logic ---
  if [ "$VERSION" = "latest" ]; then
    URL="https://api.github.com/repos/$GITHUB_REPO/releases/latest"
  else
    URL="https://api.github.com/repos/$GITHUB_REPO/releases/tags/$VERSION"
  fi

  if [ -n "$(command -v curl)" ]; then
    RELEASE_INFO=$(curl -s "$URL")
  elif [ -n "$(command -v wget)" ]; then
    RELEASE_INFO=$(wget -q -O- "$URL")
  else
    fail "Neither curl nor wget found. Please install one of them."
  fi

  if [ -z "$RELEASE_INFO" ]; then
    fail "Could not get release information"
  fi

  # Check for API errors
  if echo "$RELEASE_INFO" | grep -q '"message": *"Not Found"'; then
    fail "Release not found: $VERSION"
  fi

  if echo "$RELEASE_INFO" | grep -q '"message": *"API rate limit exceeded"'; then
    fail "GitHub API rate limit exceeded. Please try again later or use a GitHub token."
  fi

  # Extract version
  if [ "$VERSION" = "latest" ]; then
    VERSION=$(echo "$RELEASE_INFO" | grep -o '"tag_name": *"[^"]*"' | sed 's/"tag_name": *"//;s/"//')
    if [ -z "$VERSION" ]; then
      fail "Could not detect latest version"
    fi
    echo "Latest version: $VERSION"
  fi

  # Detect platform if not already done (only needed if not using --source-file)
  if [ -z "$PLATFORM" ]; then
      detect_platform
  fi
}

# Download the release asset for the current platform
download_release() {
  # Skip if using a source file
  if [ -n "$SOURCE_FILE" ]; then
    return
  fi

  # --- Rest of existing download_release logic ---
  ASSET_NAME="${BIN_NAME}-${PLATFORM}-${ARCH}.zip"

  if [ -n "$(command -v curl)" ]; then
    ASSET_URL=$(echo "$RELEASE_INFO" | grep -o "\"browser_download_url\": *\"[^\"]*${ASSET_NAME}\"" | sed 's/"browser_download_url": *"//;s/"//')
  elif [ -n "$(command -v grep)" ] && [ -n "$(command -v sed)" ]; then
    ASSET_URL=$(echo "$RELEASE_INFO" | grep -o "\"browser_download_url\": *\"[^\"]*${ASSET_NAME}\"" | sed 's/"browser_download_url": *"//;s/"//')
  else
    fail "Could not parse release information. Please install grep and sed."
  fi


  if [ -z "$ASSET_URL" ]; then
    fail "Could not find release asset for $PLATFORM-$ARCH version $VERSION"
  fi

  echo "Downloading $ASSET_NAME from $ASSET_URL"
  if [ -n "$(command -v curl)" ]; then
    curl -fsSL "$ASSET_URL" -o "$TEMP_DIR/$ASSET_NAME" || fail "Failed to download $ASSET_NAME"
  elif [ -n "$(command -v wget)" ]; then
    wget -q "$ASSET_URL" -O "$TEMP_DIR/$ASSET_NAME" || fail "Failed to download $ASSET_NAME"
  else
    fail "Neither curl nor wget found. Please install one of them."
  fi
}

# Extract the zip file
extract_archive() {
  echo "Extracting archive..."
  EXTRACT_SOURCE=""
  if [ -n "$SOURCE_FILE" ]; then
      EXTRACT_SOURCE="$SOURCE_FILE" # Use the user-provided file directly
  else
      EXTRACT_SOURCE="$TEMP_DIR/$ASSET_NAME" # Use the downloaded file
  fi

  if [ ! -f "$EXTRACT_SOURCE" ]; then
      fail "Archive file not found: $EXTRACT_SOURCE"
  fi

  if [ -n "$(command -v unzip)" ]; then
    unzip -q "$EXTRACT_SOURCE" -d "$TEMP_DIR" || fail "Failed to extract archive: $EXTRACT_SOURCE"
  else
    # Fallback for systems without unzip
    if [ "$PLATFORM" = "windows" ]; then
      fail "unzip command not found. Please install unzip."
    else
      # Try using Python's zipfile module as a fallback
      if [ -n "$(command -v python3)" ]; then
        python3 -m zipfile -e "$EXTRACT_SOURCE" "$TEMP_DIR" || fail "Failed to extract archive using Python: $EXTRACT_SOURCE"
      elif [ -n "$(command -v python)" ]; then
        python -m zipfile -e "$EXTRACT_SOURCE" "$TEMP_DIR" || fail "Failed to extract archive using Python: $EXTRACT_SOURCE"
      else
        fail "Neither unzip nor python found. Please install one of them."
      fi
    fi
  fi
}

# Set up the binary in the appropriate location
install_binary() {
  # Ensure platform is detected if not inferred from filename
  if [ -z "$PLATFORM" ]; then
      detect_platform
  fi

  # Set the correct binary name based on the platform
  if [ "$PLATFORM" = "windows" ]; then
    BINARY_NAME="${BIN_NAME}.exe"
    # Update install dir for windows if no custom path was provided
    if [ -z "$CUSTOM_INSTALL_DIR" ] && [ -z "$SOURCE_FILE" ]; then # Only default if no custom path AND not using local source
      INSTALL_DIR="${HOME}/.bin" # Windows users typically don't have ~/.local/bin
    elif [ -z "$CUSTOM_INSTALL_DIR" ] && [ -n "$SOURCE_FILE" ]; then
      # If using source file but no custom path, still need a windows default
      INSTALL_DIR="${HOME}/.bin"
    fi
  else
    BINARY_NAME="$BIN_NAME"
  fi

  echo "Using installation directory: $INSTALL_DIR"

  # Create install directory if it doesn't exist
  if [ ! -d "$INSTALL_DIR" ]; then
    if ! mkdir -p "$INSTALL_DIR"; then
      if need_sudo; then
        echo "Creating directory $INSTALL_DIR requires elevated privileges"
        if [ -n "$(command -v sudo)" ]; then
          sudo mkdir -p "$INSTALL_DIR" || fail "Failed to create directory $INSTALL_DIR"
        else
          fail "Failed to create directory $INSTALL_DIR and sudo is not available"
        fi
      else
        fail "Failed to create directory $INSTALL_DIR"
      fi
    fi
  fi

  # Find the binary in the temp directory
  # The binary name *inside* the zip might not have the .exe extension even for windows
  # Let's check for both BIN_NAME and BINARY_NAME
  BINARY_PATH=""
  if [ -f "$TEMP_DIR/$BINARY_NAME" ]; then
      BINARY_PATH="$TEMP_DIR/$BINARY_NAME"
  elif [ -f "$TEMP_DIR/$BIN_NAME" ]; then # Check without extension too
      BINARY_PATH="$TEMP_DIR/$BIN_NAME"
  else
     # If not found directly, search for any executable-like file not matching the zip name
     FOUND_EXEC=""
     ZIP_BASENAME=$(basename "$EXTRACT_SOURCE")
     for file in "$TEMP_DIR"/*; do
        if [ -f "$file" ] && [ "$(basename "$file")" != "$ZIP_BASENAME" ]; then
            # Basic check if it *might* be the executable (e.g., has execute bit on Unix)
            if [ "$PLATFORM" != "windows" ] && [ -x "$file" ]; then
                 FOUND_EXEC="$file"
                 break
            elif [ "$PLATFORM" = "windows" ]; then
                 # On windows, assume the first non-zip file is it
                 FOUND_EXEC="$file"
                 break
             fi
             # If no execute bit found on Unix, maybe it's the one anyway
             if [ -z "$FOUND_EXEC" ]; then
                FOUND_EXEC="$file"
             fi
        fi
     done
     if [ -n "$FOUND_EXEC" ]; then
        BINARY_PATH="$FOUND_EXEC"
        echo "Found potential binary: $BINARY_PATH"
     fi
  fi

  if [ -z "$BINARY_PATH" ]; then
    echo "Contents of $TEMP_DIR:"
    ls -la "$TEMP_DIR"
    fail "Could not find extracted binary in $TEMP_DIR"
  fi

  # Determine the final destination path (including .exe on windows)
  DEST_PATH="$INSTALL_DIR/$BINARY_NAME"

  # Check if file exists and notify user we're overwriting it
  if [ -f "$DEST_PATH" ]; then
    echo "Existing installation found. Overwriting..."
  fi

  if need_sudo; then
    echo "Installing to $DEST_PATH (requires elevated privileges)"
    if [ -n "$(command -v sudo)" ]; then
      sudo cp -f "$BINARY_PATH" "$DEST_PATH" || fail "Failed to copy binary to $DEST_PATH"
      if [ "$PLATFORM" != "windows" ]; then
        sudo chmod +x "$DEST_PATH" || fail "Failed to set executable permission"
      fi
    else
      fail "Need elevated privileges to install to $DEST_PATH but sudo is not available"
    fi
  else
    echo "Installing to $DEST_PATH"
    cp -f "$BINARY_PATH" "$DEST_PATH" || fail "Failed to copy binary to $DEST_PATH"
    if [ "$PLATFORM" != "windows" ]; then
      chmod +x "$DEST_PATH" || fail "Failed to set executable permission"
    fi
  fi

  echo "Installation successful!"
}

# Verify that the binary is in PATH
verify_install() {
  # Ensure platform and binary name are set correctly
  if [ -z "$PLATFORM" ]; then
      detect_platform
  fi
  if [ "$PLATFORM" = "windows" ]; then
    BINARY_NAME="${BIN_NAME}.exe"
    if [ -z "$CUSTOM_INSTALL_DIR" ] && [ -z "$SOURCE_FILE" ]; then
       INSTALL_DIR="${HOME}/.bin"
    elif [ -z "$CUSTOM_INSTALL_DIR" ] && [ -n "$SOURCE_FILE" ]; then
       INSTALL_DIR="${HOME}/.bin"
    fi
  else
    BINARY_NAME="$BIN_NAME"
  fi
  DEST_PATH="$INSTALL_DIR/$BINARY_NAME" # Ensure DEST_PATH is set based on final logic

  # Try to find the binary in PATH first
  if [ -n "$(command -v "$BIN_NAME" 2>/dev/null)" ]; then
    VERIFIED_PATH=$(command -v "$BIN_NAME")
    echo "✅ Installation verified: $VERIFIED_PATH"
    # Optionally check if it matches the expected installation path
    if [ "$VERIFIED_PATH" = "$DEST_PATH" ]; then
        echo "   Matches expected install path."
    else
        echo "   Note: Found in PATH at a different location than expected ($DEST_PATH)."
    fi
    return 0
  fi

  # If not in PATH, check if the binary exists at the install location
  if [ -f "$DEST_PATH" ]; then
    echo "✅ Binary installed at: $DEST_PATH"

    # Check if the binary is executable (non-Windows)
    if [ "$PLATFORM" != "windows" ] && [ ! -x "$DEST_PATH" ]; then
        echo "❌ Warning: Binary at $DEST_PATH is not executable!"
    fi

    # Still show PATH warning if not in PATH
    if ! echo "$PATH" | grep -q "$INSTALL_DIR"; then
      echo "⚠️ The installation directory ($INSTALL_DIR) is not in your PATH."
      echo "You can run the binary using: $DEST_PATH"
      echo "Or add $INSTALL_DIR to your PATH."
    fi
    return 0
  fi

  echo "❌ Installation verification failed. Binary not found in PATH or at $DEST_PATH."

  # Suggest adding to PATH based on the detected shell (only if install dir isn't in PATH)
  if ! echo "$PATH" | grep -q "$INSTALL_DIR"; then
    echo "The installation directory ($INSTALL_DIR) is not in your PATH."
    SHELL_NAME="$(basename "$SHELL")"
    PROFILE_FILE=""

    case "$SHELL_NAME" in
      bash)
        PROFILE_FILE="$HOME/.bashrc"
        # Also check .bash_profile/.profile as .bashrc isn't always sourced for login shells
        if [ ! -f "$PROFILE_FILE" ]; then PROFILE_FILE="$HOME/.bash_profile"; fi
        if [ ! -f "$PROFILE_FILE" ]; then PROFILE_FILE="$HOME/.profile"; fi
        ;;
      zsh)
        PROFILE_FILE="$HOME/.zshrc"
        ;;
      fish)
        PROFILE_FILE="$HOME/.config/fish/config.fish"
        ;;
    esac

    if [ -n "$PROFILE_FILE" ] && [ -f "$PROFILE_FILE" ]; then
      echo "Add the following line to your $PROFILE_FILE file:"
      if [ "$SHELL_NAME" = "fish" ]; then
         echo "    fish_add_path $INSTALL_DIR"
      else
         echo "    export PATH=\"\$PATH:$INSTALL_DIR\""
      fi

      # Offer to add it automatically
      printf "Would you like to add it automatically? [y/N] "
      read -r REPLY
      if [ "$REPLY" = "y" ] || [ "$REPLY" = "Y" ]; then
        echo "" >> "$PROFILE_FILE" # Add newline for separation
        if [ "$SHELL_NAME" = "fish" ]; then
           echo "fish_add_path $INSTALL_DIR" >> "$PROFILE_FILE"
        else
           echo "export PATH=\"\$PATH:$INSTALL_DIR\"" >> "$PROFILE_FILE"
        fi
        echo "Added to $PROFILE_FILE. Please restart your terminal or run:"
        if [ "$SHELL_NAME" = "fish" ]; then
           echo "    source $PROFILE_FILE"
        else
           echo "    source $PROFILE_FILE"
        fi
      fi
    elif [ "$PLATFORM" = "windows" ]; then
      echo "For Windows, you need to add $INSTALL_DIR to your PATH environment variable manually."
      echo "(Search for 'Edit the system environment variables')"
    else
      echo "Please add $INSTALL_DIR to your PATH."
    fi
  fi
}

# Uninstall the binary
uninstall_binary() {
  # Ensure platform is detected if not already done
  if [ -z "$PLATFORM" ]; then
      detect_platform
  fi

  # Set the correct binary name based on the platform
  if [ "$PLATFORM" = "windows" ]; then
    BINARY_NAME="${BIN_NAME}.exe"
    # Update install dir for windows if no custom path was provided
    if [ -z "$CUSTOM_INSTALL_DIR" ]; then
      INSTALL_DIR="${HOME}/.bin"
    fi
  else
    BINARY_NAME="$BIN_NAME"
  fi

  BINARY_PATH="$INSTALL_DIR/$BINARY_NAME"

  echo "Looking for deno-kit binary at: $BINARY_PATH"

  if [ -f "$BINARY_PATH" ]; then
    echo "Removing deno-kit binary..."

    if need_sudo; then
      if [ -n "$(command -v sudo)" ]; then
        sudo rm -f "$BINARY_PATH" || fail "Failed to remove binary (permission denied)"
      else
        fail "Need elevated privileges to remove $BINARY_PATH but sudo is not available"
      fi
    else
      rm -f "$BINARY_PATH" || fail "Failed to remove binary"
    fi

    echo "✅ Uninstallation successful!"
  else
    echo "❌ deno-kit binary not found at $BINARY_PATH"
    # Don't exit with error if just not found during uninstall
    # exit 1
  fi
}

# Main script execution
echo "🦕 Deno-Kit Installer"

# Handle uninstall if requested
if [ "$UNINSTALL_MODE" = true ]; then
  echo "Uninstall mode activated"
  detect_platform # Need platform to determine binary name/path
  uninstall_binary
  exit 0
fi

echo "Installing Deno-Kit..."

create_temp_dir
# Detect platform first, needed for get_release_info logic if source file used
# and for install_binary/verify_install logic
detect_platform
get_release_info # Handles both download and local source file cases
download_release # Skipped if using source file
extract_archive
install_binary
verify_install

echo "Deno-Kit installed! Run 'deno-kit help' to get started."
if [ "$UNINSTALL_MODE" = false ]; then
    echo "You can remove Deno-Kit by running this script again with the --uninstall flag."
    # Show uninstall command using the determined install path
    DETECTED_INSTALL_DIR="$INSTALL_DIR" # Capture the final install dir used
    if [ -f "./install.sh" ]; then
        echo "Example uninstall command: ./install.sh --uninstall --path=$DETECTED_INSTALL_DIR"
    else
        echo "(To uninstall, re-download install.sh and run with --uninstall --path=$DETECTED_INSTALL_DIR)"
    fi
fi
