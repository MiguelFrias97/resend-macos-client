# Changelog

Every version here is a `vX.Y.Z` tag on `main`, and matches `version` in `package.json`. Merged
work waits under **Unreleased** until it is tagged.

To release: move the Unreleased entries under a new `## X.Y.Z - YYYY-MM-DD` heading and bump
`version` in `package.json` to match, merge that, then tag the merge commit on `main` as `vX.Y.Z`
and push the tag. Bump the minor version for new features and the patch version for fixes only.

## Unreleased

## 0.1.0 - 2026-10-24

The first tagged version.

### Changed

- **The CocoaPods toolchain runs on Ruby 4.0.9.** `.ruby-version` pins it, the Gemfile requires it
  (it accepted any Ruby from 2.6.10), and `Gemfile.lock` records it (it recorded 4.0.5) (#37).
