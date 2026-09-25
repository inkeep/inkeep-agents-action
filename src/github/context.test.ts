import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseEventContext } from './context.js';

const repository = {
  owner: { login: 'acme' },
  name: 'widgets',
  full_name: 'acme/widgets',
  html_url: 'https://github.com/acme/widgets',
  default_branch: 'main',
};

async function parse(eventName: string, payload: object) {
  const dir = await mkdtemp(join(tmpdir(), 'event-'));
  const eventPath = join(dir, 'event.json');
  await writeFile(eventPath, JSON.stringify({ repository, ...payload }));
  process.env.GITHUB_EVENT_NAME = eventName;
  process.env.GITHUB_EVENT_PATH = eventPath;
  return parseEventContext();
}

describe('parseEventContext isMergedPullRequest', () => {
  afterEach(() => {
    delete process.env.GITHUB_EVENT_NAME;
    delete process.env.GITHUB_EVENT_PATH;
  });

  it('is true for a PR merged by the merge queue bot', async () => {
    const ctx = await parse('pull_request', {
      action: 'closed',
      sender: { login: 'github-merge-queue[bot]' },
      pull_request: { number: 7, merged: true },
    });
    expect(ctx.isMergedPullRequest).toBe(true);
  });

  it('is false when a PR is closed without merging', async () => {
    const ctx = await parse('pull_request', {
      action: 'closed',
      sender: { login: 'outside-contributor' },
      pull_request: { number: 7, merged: false },
    });
    expect(ctx.isMergedPullRequest).toBe(false);
  });

  it('is false for other pull_request actions', async () => {
    const ctx = await parse('pull_request', {
      action: 'synchronize',
      sender: { login: 'outside-contributor' },
      pull_request: { number: 7, merged: true },
    });
    expect(ctx.isMergedPullRequest).toBe(false);
  });

  it('is false for comment events on merged PRs', async () => {
    const ctx = await parse('issue_comment', {
      action: 'created',
      sender: { login: 'outside-contributor' },
      issue: { number: 7, pull_request: { merged_at: '2026-01-01T00:00:00Z' } },
      comment: { id: 1 },
    });
    expect(ctx.isMergedPullRequest).toBe(false);
  });
});
