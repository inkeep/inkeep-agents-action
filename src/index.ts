import * as core from '@actions/core';
import { getGitHubToken, getProjectIdFromTriggerUrl } from './auth/token.js';
import { parseEventContext } from './github/context.js';
import { fetchPRContext } from './github/pr.js';
import { sendTrigger } from './trigger/client.js';
import type { TriggerPayload } from './types/index.js';

async function run(): Promise<void> {
  try {
    // Get inputs
    const triggerUrl = core.getInput('trigger-url', { required: true });
    const signingSecret = core.getInput('signing-secret') || undefined;
    const githubTokenOverride = core.getInput('github-token') || undefined;
    const pathFilter = core.getInput('path-filter') || undefined;
    const includeFileContents = core.getInput('include-file-contents') === 'true';

    core.info('Starting Inkeep Agents Action');

    // Parse GitHub event context
    const eventContext = await parseEventContext();
    core.info(
      `Processing ${eventContext.event.type} event for PR #${eventContext.pullRequestNumber}`
    );

    const projectId = getProjectIdFromTriggerUrl(triggerUrl);

    // Get GitHub token (via OIDC or override)
    const githubToken = await getGitHubToken(projectId, githubTokenOverride);

    // Fetch PR context (diff, files, comments)
    const prContext = await fetchPRContext(
      githubToken,
      eventContext.repository.owner,
      eventContext.repository.name,
      eventContext.pullRequestNumber!,
      {
        pathFilter,
        includeContents: includeFileContents,
        triggerCommentId: eventContext.triggerCommentId,
      }
    );

    // Check if any files match the path filter
    if (pathFilter && prContext.changedFiles.length === 0) {
      core.info(`No files match path filter "${pathFilter}". Skipping trigger.`);
      core.setOutput('skipped', 'true');
      core.setOutput('skip-reason', 'no-matching-files');
      return;
    }

    // Build the trigger payload
    const payload: TriggerPayload = {
      event: eventContext.event,
      repository: eventContext.repository,
      pullRequest: prContext.pullRequest,
      sender: eventContext.sender,
      diff: prContext.diff,
      changedFiles: prContext.changedFiles,
      comments: prContext.comments,
      triggerComment: prContext.triggerComment,
    };

    // Send to trigger URL
    const response = await sendTrigger(triggerUrl, payload, signingSecret);

    // Set outputs
    core.setOutput('invocation-id', response.invocationId);
    core.setOutput('conversation-id', response.conversationId);

    core.info(`Trigger successful!`);
    core.info(`  Invocation ID: ${response.invocationId}`);
    core.info(`  Conversation ID: ${response.conversationId}`);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unexpected error occurred');
    }
  }
}

run();
