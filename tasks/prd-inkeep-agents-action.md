# PRD: Inkeep Agents GitHub Action

## Introduction

A GitHub Action that triggers Inkeep agents when GitHub events occur (PR creation, comments, etc.). The action collects rich context from the GitHub event (diffs, file changes, comments) and sends it to a customer-configured Inkeep agent trigger URL. This enables customers to build GitHub-integrated agents like documentation writers, code reviewers, and PR summarizers.

## Goals

- Provide a simple, reusable action that triggers any Inkeep agent from GitHub workflows
- Collect rich GitHub context (PR diff, changed files, comments) automatically
- Support common GitHub events: pull requests, issue comments, PR reviews
- Fire-and-forget execution with invocation tracking via outputs

## User Stories

### US-001: Set up TypeScript action scaffolding
**Description:** As a developer, I need the basic action structure so I can build the trigger logic.

**Acceptance Criteria:**
- [ ] `action.yml` defines the action with Node20 runtime
- [ ] TypeScript configured with strict mode
- [ ] Build script compiles TS and bundles with `@vercel/ncc`
- [ ] `dist/index.js` is the compiled entry point
- [ ] `.gitignore` excludes `node_modules` but includes `dist/`
- [ ] Typecheck passes

### US-002: Define action inputs
**Description:** As a customer, I need to configure my trigger URL and authentication so the action can call my agent.

**Acceptance Criteria:**
- [ ] `trigger-url` input (required) - the Inkeep agent trigger URL
- [ ] `signing-secret` input (optional) - HMAC signing secret for payload verification
- [ ] `github-token` input (optional) - override token; if provided, skips OIDC flow and uses this token directly
- [ ] `path-filter` input (optional) - glob pattern to filter which files trigger the action (e.g., `docs/**`)
- [ ] `include-file-contents` input (optional, default false) - whether to include full file contents for new/modified files
- [ ] Inputs documented in `action.yml` with descriptions
- [ ] Typecheck passes

### US-003: Define action outputs
**Description:** As a customer, I want to know the invocation result so I can reference it in subsequent workflow steps.

**Acceptance Criteria:**
- [ ] `invocation-id` output - the trigger invocation ID
- [ ] `conversation-id` output - the created conversation ID
- [ ] Outputs set correctly after successful trigger
- [ ] Typecheck passes

### US-004: Authenticate via OIDC token exchange
**Description:** As a developer, I need the action to authenticate as the Inkeep GitHub App so it can access PR data with proper permissions.

**Acceptance Criteria:**
- [ ] If `github-token` input provided, use it directly and skip OIDC flow
- [ ] Otherwise, request OIDC token from GitHub using `core.getIDToken("inkeep-agents-action")`
- [ ] Exchange OIDC token with Inkeep API endpoint for GitHub App installation token
- [ ] Inkeep API validates OIDC token claims (repo, workflow, etc.) before issuing installation token
- [ ] Handle token exchange errors gracefully with clear error messages
- [ ] Use resulting token for all GitHub API calls
- [ ] Workflow requires `id-token: write` permission for OIDC flow
- [ ] Typecheck passes

### US-005: Parse GitHub event context
**Description:** As an agent, I need structured GitHub context so I can understand what triggered me.

**Acceptance Criteria:**
- [ ] Detect event type from `GITHUB_EVENT_NAME` (`pull_request`, `issue_comment`, `pull_request_review`, etc.)
- [ ] Parse event payload from `GITHUB_EVENT_PATH`
- [ ] Extract common fields: repo, PR number, sender, action type
- [ ] Handle missing/malformed event data gracefully with clear errors
- [ ] Typecheck passes

### US-005: Fetch PR diff and changed files
**Description:** As an agent, I need the PR diff and list of changed files so I can analyze code changes.

**Acceptance Criteria:**
- [ ] Fetch PR diff via GitHub API (`GET /repos/{owner}/{repo}/pulls/{pull_number}` with `Accept: application/vnd.github.diff`)
- [ ] Fetch changed files list via GitHub API (`GET /repos/{owner}/{repo}/pulls/{pull_number}/files`)
- [ ] Include file path, status (added/modified/deleted), additions, deletions, and patch for each file
- [ ] If `path-filter` input provided, filter changed files to only those matching the glob pattern
- [ ] If no files match the filter, skip triggering the agent (exit successfully without calling trigger)
- [ ] If `include-file-contents` is true, fetch full file contents for new/modified files via GitHub API
- [ ] Handle large diffs gracefully (truncate or paginate if needed)
- [ ] Typecheck passes

### US-006: Fetch PR comments
**Description:** As an agent, I need PR comments so I can understand discussion context and respond to mentions.

**Acceptance Criteria:**
- [ ] Fetch issue comments via GitHub API (`GET /repos/{owner}/{repo}/issues/{issue_number}/comments`)
- [ ] Fetch PR review comments via GitHub API (`GET /repos/{owner}/{repo}/pulls/{pull_number}/comments`)
- [ ] Include comment body, author, created timestamp, and association (issue vs review)
- [ ] For `issue_comment` events, identify the triggering comment specifically
- [ ] Typecheck passes

### US-007: Build standardized payload
**Description:** As an agent developer, I need a consistent payload structure so I can write reliable agent logic.

**Acceptance Criteria:**
- [ ] Payload includes: `event` (type + action), `repository` (owner, name, url), `pullRequest` (number, title, body, author, url, base, head)
- [ ] Payload includes: `diff` (full diff string), `changedFiles` (array of file objects)
- [ ] Payload includes: `comments` (array of comment objects)
- [ ] Payload includes: `sender` (user who triggered the event)
- [ ] Payload includes: `triggerComment` (the specific comment if event is `issue_comment`)
- [ ] When `include-file-contents` is true, each changed file object includes `contents` field with full file content
- [ ] All fields typed with TypeScript interfaces
- [ ] Typecheck passes

### US-008: Send payload to trigger URL
**Description:** As a customer, I need the action to call my trigger URL so my agent receives the GitHub context.

**Acceptance Criteria:**
- [ ] POST request to configured `trigger-url`
- [ ] Request body is JSON payload from US-007
- [ ] If `signing-secret` provided, compute HMAC-SHA256 and set `X-Signature-256: sha256={hex}` header
- [ ] Set `Content-Type: application/json`
- [ ] Set `User-Agent: inkeep-agents-action/{version}`
- [ ] Typecheck passes

### US-009: Handle trigger response
**Description:** As a customer, I need clear feedback on whether the trigger succeeded.

**Acceptance Criteria:**
- [ ] On 202 response, parse `invocationId` and `conversationId` from body
- [ ] Set action outputs with these values
- [ ] On 4xx/5xx response, fail the action with error message from response
- [ ] On network error, fail with descriptive error
- [ ] Log trigger URL (without secret) and response status for debugging
- [ ] Typecheck passes

### US-010: Create docs-writer workflow template
**Description:** As a customer building a docs agent, I want a ready-to-use workflow file so I can get started quickly.

**Acceptance Criteria:**
- [ ] Template triggers on `pull_request` (opened, synchronize) and `issue_comment` (created)
- [ ] `issue_comment` job filters for PR comments containing bot mention
- [ ] Template includes `permissions: id-token: write` for OIDC authentication
- [ ] Secrets referenced: `INKEEP_TRIGGER_URL`, `INKEEP_SIGNING_SECRET`
- [ ] Template includes comments explaining each section
- [ ] Template saved to `workflow-templates/docs-writer.yml`

### US-011: Create generic workflow template
**Description:** As a customer, I want a minimal template I can customize for any agent type.

**Acceptance Criteria:**
- [ ] Template triggers on `pull_request` only (simplest case)
- [ ] Template includes `permissions: id-token: write` for OIDC authentication
- [ ] Minimal configuration with placeholders for customization
- [ ] Comments indicate where to add event filters or additional triggers
- [ ] Template saved to `workflow-templates/generic.yml`

## Functional Requirements

- FR-1: Action runs on Node.js 20 runtime
- FR-2: Action requires `trigger-url` input; fails immediately if not provided
- FR-3: Action authenticates via OIDC token exchange with Inkeep API to get GitHub App installation token (or uses override `github-token` if provided)
- FR-4: Action computes HMAC-SHA256 signature when `signing-secret` is provided
- FR-5: Action fetches PR context (diff, files, comments) for any event associated with a PR
- FR-6: Action handles `pull_request`, `issue_comment`, and `pull_request_review` event types
- FR-7: Action fails gracefully with clear error messages for API failures or missing context
- FR-8: Action completes after sending trigger request (fire-and-forget)
- FR-9: Action outputs `invocation-id` and `conversation-id` on success
- FR-10: When `path-filter` is provided, only files matching the glob pattern are included; action skips triggering if no files match
- FR-11: When `include-file-contents` is true, full file contents are fetched and included in the payload

## Non-Goals

- No waiting for agent completion or polling for results
- No direct GitHub App webhook handling (use native workflow events)
- No built-in comment posting (agents handle their own GitHub interactions)
- No event routing to multiple agents (one workflow = one agent)
- No payload transformation configuration (agents receive standard payload)

## Technical Considerations

- **Bundling:** Use `@vercel/ncc` to compile TypeScript and bundle dependencies into single `dist/index.js`
- **GitHub API:** Use `@actions/github` for authenticated Octokit client
- **Action toolkit:** Use `@actions/core` for inputs, outputs, logging, and failure handling
- **OIDC Authentication:** Use `core.getIDToken()` to request OIDC token; exchange with Inkeep API for installation token
- **Token Exchange Endpoint:** Inkeep API needs endpoint to validate OIDC token and return GitHub App installation token
- **HMAC signing:** Use Node.js `crypto` module (no external dependency needed)
- **Large diffs:** GitHub API may truncate large diffs; document this limitation
- **Rate limits:** GitHub App installation tokens have 5000 requests/hour (higher than GITHUB_TOKEN's 1000)

## Success Metrics

- Customer can trigger an Inkeep agent from a GitHub PR in under 10 minutes of setup
- Action payload provides sufficient context for agents to analyze PR changes
- Action execution completes in under 30 seconds (excluding agent runtime)
- Workflow templates work out-of-the-box with only URL/secret configuration

## Open Questions

- Should comments be limited to a certain count or time range to avoid huge payloads? (Deferred - skip for now)
- What's the maximum payload size the trigger endpoint accepts? (Deferred - ignore for now)

## Dependencies

- **Inkeep API: Token Exchange Endpoint** - Need to build an endpoint that accepts GitHub OIDC tokens, validates claims, and returns GitHub App installation tokens. This is a prerequisite for US-004.
