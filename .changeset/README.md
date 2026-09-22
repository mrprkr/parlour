# Changesets

A changeset is a small markdown file saying which package a pull request
changes, whether it is a patch, a minor or a major, and one line for the
changelog. `pnpm changeset` writes one; commit it with the change.

Only `parlour` is versioned this way. The site, the design tokens and the
desktop app are private, and the app takes its version from `parlour` when
`pnpm release:version` runs. [CONTRIBUTING.md](../CONTRIBUTING.md) has the
release steps.
