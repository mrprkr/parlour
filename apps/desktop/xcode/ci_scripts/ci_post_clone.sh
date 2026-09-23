#!/bin/sh
#
# Xcode Cloud starts from a clean clone on a Mac with Xcode and Homebrew and
# nothing else, and it keeps nothing between builds. This installs what the
# build phase needs (Node, pnpm, Rust, cmake), the workspace's packages, and
# generates the Xcode project, which is not checked in. The ffmpeg, whisper
# and llama.cpp builds in ../appstore/stage.ts then happen in the build itself.
#
# Set PARLOUR_DEVELOPMENT_TEAM in the Xcode Cloud workflow's environment;
# Xcode Cloud manages the signing itself.
set -eu

brew install node@22 cmake xcodegen
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"

# The pnpm the workspace pins, rather than whatever Homebrew has this week.
npm install -g "$(node -p "require('$CI_PRIMARY_REPOSITORY_PATH/package.json').packageManager")"

curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
export PATH="$HOME/.cargo/bin:$PATH"

cd "$CI_PRIMARY_REPOSITORY_PATH"
pnpm install --frozen-lockfile

cd apps/desktop/xcode
xcodegen generate
