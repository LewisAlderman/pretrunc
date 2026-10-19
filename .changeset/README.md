# Changesets

A change people using pretrunc would notice gets a changeset: `vp exec changeset`, then pick the bump and write a line for the changelog. On `main`, the release workflow keeps a "Version Packages" pull request open with the next version and its changelog; merging it stages the release on npm, which a maintainer approves with two-factor authentication on npmjs.com, and the release is tagged once it's live.
