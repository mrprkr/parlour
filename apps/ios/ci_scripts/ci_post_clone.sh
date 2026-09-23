#!/bin/sh
# Xcode Cloud builds from a clean clone, and the Xcode project is generated
# from project.yml rather than checked in, so generate it before Xcode Cloud
# looks for it. Set PARLOUR_DEVELOPMENT_TEAM in the workflow's environment;
# Xcode Cloud manages the signing itself either way.
set -e

brew install xcodegen

cd "$(dirname "$0")/.."
xcodegen generate
