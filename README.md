# Inkeep Agents Action

A GitHub Action that triggers Inkeep agents when GitHub events occur (PR creation, comments, etc.). The action collects rich context from the GitHub event (diffs, file changes, comments) and sends it to your Inkeep agent trigger URL.

## Features

- Triggers on pull requests, PR comments, and PR reviews
- Collects PR diff, changed files, and comments automatically
- Supports path filtering to trigger only on specific file changes
- Optional file contents inclusion for richer context
- HMAC signature verification for secure payloads
- OIDC authentication with Inkeep GitHub App

## Quick Start

1. **Install the Inkeep GitHub App** on your repository

2. **Create a trigger** in your Inkeep project and copy the trigger URL

3. **Add secrets** to your repository:
   - `INKEEP_TRIGGER_URL` - Your trigger URL
   - `INKEEP_SIGNING_SECRET` (optional) - If you configured signing on your trigger

4. **Create a workflow** (`.github/workflows/inkeep-agent.yml`):

```yaml
name: Inkeep Agent

on:
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: read
  pull-requests: read
  id-token: write  # Required for OIDC authentication

jobs:
  trigger-agent:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Inkeep Agent
        uses: inkeep/agents-action@v1
        with:
          trigger-url: ${{ secrets.INKEEP_TRIGGER_URL }}
          signing-secret: ${{ secrets.INKEEP_SIGNING_SECRET }}
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `trigger-url` | Yes | - | The Inkeep agent trigger webhook URL |
| `signing-secret` | No | - | HMAC signing secret for payload verification |
| `github-token` | No | - | Override token (skips OIDC auth if provided) |
| `path-filter` | No | - | Glob pattern to filter which files trigger the action |
| `include-file-contents` | No | `false` | Include full file contents for changed files |

## Outputs

| Output | Description |
|--------|-------------|
| `invocation-id` | The trigger invocation ID |
| `conversation-id` | The conversation ID created by the agent |
| `skipped` | `true` if the trigger was skipped (e.g., no matching files) |
| `skip-reason` | Reason for skipping (e.g., `no-matching-files`) |

## Examples

### Trigger only on docs changes

```yaml
- uses: inkeep/agents-action@v1
  with:
    trigger-url: ${{ secrets.INKEEP_TRIGGER_URL }}
    path-filter: 'docs/**'
```

### Include file contents for richer context

```yaml
- uses: inkeep/agents-action@v1
  with:
    trigger-url: ${{ secrets.INKEEP_TRIGGER_URL }}
    include-file-contents: 'true'
```

### Trigger on PR comments mentioning a bot

```yaml
on:
  issue_comment:
    types: [created]

jobs:
  trigger-on-mention:
    if: |
      github.event.issue.pull_request &&
      contains(github.event.comment.body, '@docs-bot')
    runs-on: ubuntu-latest
    steps:
      - uses: inkeep/agents-action@v1
        with:
          trigger-url: ${{ secrets.INKEEP_TRIGGER_URL }}
```

## Workflow Templates

See the `workflow-templates/` directory for ready-to-use workflow files:

- `docs-writer.yml` - Documentation writer agent triggered on PRs and bot mentions
- `generic.yml` - Minimal template to customize for any agent

## Payload Structure

The action sends a JSON payload to your trigger URL with the following structure:

```typescript
{
  event: { type: string, action: string },
  repository: { owner, name, fullName, url, defaultBranch },
  pullRequest: { number, title, body, author, url, state, base, head, ... },
  sender: { login, id, avatarUrl, url },
  diff: string,
  changedFiles: [{ path, status, additions, deletions, patch, contents? }],
  comments: [{ id, body, author, createdAt, type, path?, line? }],
  triggerComment?: { ... }  // The comment that triggered the action (for issue_comment events)
}
```

## Authentication

This action authenticates with GitHub using OIDC token exchange with the Inkeep API. This allows the action to use the Inkeep GitHub App's permissions without exposing any credentials.

Requirements:
- The Inkeep GitHub App must be installed on your repository
- Your workflow must have `id-token: write` permission

Alternatively, you can provide a `github-token` input to skip OIDC authentication and use a different token.

## License

MIT
