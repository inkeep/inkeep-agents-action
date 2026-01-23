import * as github from '@actions/github';
import * as core from '@actions/core';
import { readFile } from 'fs/promises';
import type { GitHubEvent, Repository, GitHubUser } from '../types/index.js';

export interface EventContext {
  event: GitHubEvent;
  repository: Repository;
  sender: GitHubUser;
  pullRequestNumber: number | null;
  triggerCommentId: number | null;
}

/**
 * Parse the GitHub event context from environment variables and event payload.
 */
export async function parseEventContext(): Promise<EventContext> {
  const eventName = process.env.GITHUB_EVENT_NAME;
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (!eventName) {
    throw new Error('GITHUB_EVENT_NAME environment variable is not set');
  }

  if (!eventPath) {
    throw new Error('GITHUB_EVENT_PATH environment variable is not set');
  }

  core.info(`Event type: ${eventName}`);

  // Read the event payload
  const eventPayloadRaw = await readFile(eventPath, 'utf-8');
  const eventPayload = JSON.parse(eventPayloadRaw);

  const action = eventPayload.action || '';
  core.info(`Event action: ${action || '(none)'}`);

  // Extract repository info
  const repo = eventPayload.repository;
  if (!repo) {
    throw new Error('Event payload does not contain repository information');
  }

  const repository: Repository = {
    owner: repo.owner?.login || repo.owner?.name || github.context.repo.owner,
    name: repo.name || github.context.repo.repo,
    fullName: repo.full_name,
    url: repo.html_url,
    defaultBranch: repo.default_branch || 'main',
  };

  // Extract sender info
  const senderData = eventPayload.sender;
  if (!senderData) {
    throw new Error('Event payload does not contain sender information');
  }

  const sender: GitHubUser = {
    login: senderData.login,
    id: senderData.id,
    avatarUrl: senderData.avatar_url,
    url: senderData.html_url,
  };

  // Determine PR number based on event type
  let pullRequestNumber: number | null = null;
  let triggerCommentId: number | null = null;

  if (eventName === 'pull_request' || eventName === 'pull_request_review') {
    pullRequestNumber = eventPayload.pull_request?.number || null;
  } else if (eventName === 'issue_comment') {
    // For issue_comment, we need to check if it's on a PR
    const issue = eventPayload.issue;
    if (issue?.pull_request) {
      // This is a comment on a PR
      pullRequestNumber = issue.number;
      triggerCommentId = eventPayload.comment?.id || null;
    } else {
      throw new Error(
        'issue_comment event is not associated with a pull request. This action only supports PR comments.'
      );
    }
  } else if (eventName === 'pull_request_review_comment') {
    pullRequestNumber = eventPayload.pull_request?.number || null;
    triggerCommentId = eventPayload.comment?.id || null;
  }

  if (!pullRequestNumber) {
    throw new Error(
      `Could not determine pull request number from event "${eventName}". ` +
        'This action only supports pull_request, issue_comment (on PRs), and pull_request_review events.'
    );
  }

  return {
    event: { type: eventName, action },
    repository,
    sender,
    pullRequestNumber,
    triggerCommentId,
  };
}
