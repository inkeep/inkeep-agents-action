import * as core from '@actions/core';
import { getGitHubToken, getProjectIdFromTriggerUrl } from './auth/token.js';
import { parseEventContext } from './github/context.js';
import { fetchPRContext, checkBotPRExists } from './github/pr.js';
import { sendTrigger } from './trigger/client.js';
import type { TriggerPayload } from './types/index.js';

async function run(): Promise<void> {
  try {
    // Get inputs
    const triggerUrl = core.getInput('trigger-url', { required: true });
    const signingSecret = core.getInput('signing-secret') || undefined;
    const githubTokenOverride = core.getInput('github-token') || undefined;
    const pathFilter = core.getInput('path-filter') || undefined;
    const prTitleRegex = core.getInput('pr-title-regex') || undefined;
    const apiBaseUrl = core.getInput('api-base-url') || undefined;

    core.info('Starting Inkeep Agents Action');

    // Parse GitHub event context
    const eventContext = await parseEventContext();
    core.info(
      `Processing ${eventContext.event.type} event for PR #${eventContext.pullRequestNumber}`
    );

    const projectId = getProjectIdFromTriggerUrl(triggerUrl);

    // Get GitHub token (via OIDC or override)
    const githubToken = await getGitHubToken(projectId, githubTokenOverride, apiBaseUrl);

    // Check if bot has already created a PR referencing this one
    const existingBotPR = await checkBotPRExists(
      githubToken,
      eventContext.repository.owner,
      eventContext.repository.name,
      eventContext.pullRequestNumber!
    );

    if (existingBotPR) {
      core.info(`Bot already created PR #${existingBotPR.number} referencing this PR. Skipping trigger.`);
      core.setOutput('skipped', 'true');
      core.setOutput('skip-reason', 'bot-pr-exists');
      core.setOutput('existing-bot-pr-number', existingBotPR.number.toString());
      core.setOutput('existing-bot-pr-url', existingBotPR.url);
      return;
    }
    

    // Fetch PR context (diff, files, comments)
    const prContext = await fetchPRContext(
      githubToken,
      eventContext.repository.owner,
      eventContext.repository.name,
      eventContext.pullRequestNumber!,
      {
        pathFilter,
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

    // Check if PR title matches regex filter
    if (prTitleRegex) {
      const regex = new RegExp(prTitleRegex);
      if (!regex.test(prContext.pullRequest.title)) {
        core.info(`PR title "${prContext.pullRequest.title}" does not match regex "${prTitleRegex}". Skipping trigger.`);
        core.setOutput('skipped', 'true');
        core.setOutput('skip-reason', 'title-no-match');
        return;
      }
    }

    // Build the trigger payload
    const payload: TriggerPayload = {
      event: eventContext.event,
      repository: eventContext.repository,
      pullRequest: prContext.pullRequest,
      sender: eventContext.sender,
      changedFiles: prContext.changedFiles,
      comments: prContext.comments,
      triggerComment: prContext.triggerComment,
    };

    if (prContext.triggerComment?.author.login === 'inkeep[bot]') {
      core.info('Trigger comment was made by Inkeep bot. Skipping trigger.');
      core.setOutput('skipped', 'true');
      core.setOutput('skip-reason', 'inkeep-bot-comment');
      return;
    }

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
