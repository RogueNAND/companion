# Fork Management

This repo is a minimal fork of [Bitfocus Companion](https://github.com/bitfocus/companion) that adds a WebSocket bridge API for external control via Python.

## Branch Strategy

| Branch    | Purpose                                                                               |
| --------- | ------------------------------------------------------------------------------------- |
| `dev`     | Active development. Receives upstream syncs first, plus granular development commits. |
| `patched` | Stable/promoted. Only updated by CI after tests pass.                                 |

## How Sync Works

The `sync-upstream.yml` workflow runs weekly (Sunday) or on manual trigger:

1. **Tag** — Tags current `dev` HEAD as `pre-sync-<upstream-tag>` for recovery
2. **Squash** — Collapses all patch commits into a single commit via `git reset --soft`
3. **Rebase** — Rebases the single patch commit onto the new upstream tag
4. **Test** — Runs `yarn build:ts`, `yarn test`, `yarn prettier --check .`, `yarn lint`
5. **Promote** — Force-pushes `dev` to `patched`
6. **Build** — Builds and pushes Docker image to GHCR

## Adding Patches

Just commit to `dev`. The next sync automatically squashes everything into one patch commit before rebasing.

```bash
git checkout dev
# make changes
git commit -m "feat: add new WS command"
git push origin dev
```

## Fixing Failed Rebases

When a rebase fails, the workflow creates a GitHub issue with conflict details and pushes a `pre-sync-*` tag preserving the pre-squash state.

```bash
# Recover from a failed rebase
git fetch origin --tags
git checkout -b fix-rebase pre-sync-v4.X.Y

# The tag points to the granular commit history before squash
# Resolve conflicts manually against the new upstream tag
git rebase --onto v4.X.Y <old-base> fix-rebase

# Push the fixed branch
git push origin fix-rebase:dev --force
```

## Reviewing Past History

Granular commit history before each sync is preserved in `pre-sync-*` tags:

```bash
git log pre-sync-v4.2.5   # see all individual commits before that sync
```

## Image Tags

| Tag          | Source                                                   |
| ------------ | -------------------------------------------------------- |
| `v4.X.Y`     | Promoted build from `patched` (matches upstream version) |
| `latest`     | Most recent promoted build                               |
| `dev-v4.X.Y` | Dev build from `dev` branch (built on every push)        |
| `dev-latest` | Most recent dev build                                    |

## Manual Trigger

Go to Actions → "Sync Upstream" → Run workflow:

- **force_build**: Re-run even if already on latest tag
- **target_tag**: Sync to a specific upstream tag instead of latest
