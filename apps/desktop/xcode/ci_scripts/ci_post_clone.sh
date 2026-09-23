#!/bin/sh
#
# Xcode Cloud starts from a clean clone on a Mac with Xcode and nothing else,
# and it keeps nothing between builds. This puts in place what the build phase
# needs (Node, pnpm, Rust, cmake), the workspace's packages, and the Xcode
# project, which is generated rather than checked in. The ffmpeg, whisper and
# llama.cpp builds in ../appstore/stage.ts then happen in the build itself.
#
# This runs in the same job that is later trusted with signing, so nothing is
# installed from a moving target: every download is a pinned version checked
# against a SHA-256 before it runs. rustup, cmake and Node publish theirs, and
# these match; XcodeGen does not, so its is the one recorded when it was
# pinned, as ffmpeg's is. Bump a version and its hash together.
#
# Set PARLOUR_DEVELOPMENT_TEAM in the Xcode Cloud workflow's environment;
# Xcode Cloud manages the signing itself.
set -eu

NODE_VERSION=22.23.2
NODE_SHA256=61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6
RUSTUP_VERSION=1.29.1
RUSTUP_SHA256=ec1b9233e7f72990ecd8e62063fa7f6c3dfc2bec8e97f88bff165f9100ac696a
RUST_VERSION=1.98.1
CMAKE_VERSION=4.4.3
CMAKE_SHA256=0c5d65251c14cc884bfa16bdbed3c263ce5bffe2e21c0d0d00962cb0610464fa
XCODEGEN_VERSION=2.46.0
XCODEGEN_SHA256=4d9e34b62172d645eed6457cac13fc222569974098ef4ee9c3368bedf0196806

# Where ../embed.sh looks for them.
tools="$HOME/.parlour-tools"
mkdir -p "$tools"
cd "$tools"

fetch() {
  curl --proto '=https' --tlsv1.2 -fsSL -o "$2" "$1"
  echo "$3  $2" | shasum -a 256 -c -
}

fetch "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-darwin-arm64.tar.gz" node.tar.gz "$NODE_SHA256"
tar -xzf node.tar.gz
mv "node-v$NODE_VERSION-darwin-arm64" node

fetch "https://github.com/Kitware/CMake/releases/download/v$CMAKE_VERSION/cmake-$CMAKE_VERSION-macos-universal.tar.gz" cmake.tar.gz "$CMAKE_SHA256"
tar -xzf cmake.tar.gz
mv "cmake-$CMAKE_VERSION-macos-universal/CMake.app/Contents" cmake

fetch "https://github.com/yonaskolb/XcodeGen/releases/download/$XCODEGEN_VERSION/xcodegen.zip" xcodegen.zip "$XCODEGEN_SHA256"
unzip -q xcodegen.zip

fetch "https://static.rust-lang.org/rustup/archive/$RUSTUP_VERSION/aarch64-apple-darwin/rustup-init" rustup-init "$RUSTUP_SHA256"
chmod +x rustup-init
./rustup-init -y --no-modify-path --profile minimal --default-toolchain "$RUST_VERSION"

export PATH="$tools/node/bin:$tools/cmake/bin:$tools/xcodegen/bin:$HOME/.cargo/bin:$PATH"

# The pnpm the workspace pins in package.json, at that exact version.
npm install -g "$(node -p "require('$CI_PRIMARY_REPOSITORY_PATH/package.json').packageManager")"

cd "$CI_PRIMARY_REPOSITORY_PATH"
# Xcode Cloud sets CI already; said here as well, since pnpm asks before
# replacing a node_modules when it thinks a person is watching.
CI=true pnpm install --frozen-lockfile

cd apps/desktop/xcode
xcodegen generate
