import * as core from '@actions/core';
import { createHmac } from 'crypto';
import type { TriggerPayload, TriggerResponse } from '../types/index.js';
import { TriggerResponseSchema } from '../types/index.js';

const PACKAGE_VERSION = '0.1.0'; // TODO: Read from package.json

/**
 * Compute HMAC-SHA256 signature for payload verification
 */
function computeSignature(payload: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  return `sha256=${hmac.digest('hex')}`;
}

/**
 * Send the trigger payload to the Inkeep API
 */
export async function sendTrigger(
  triggerUrl: string,
  payload: TriggerPayload,
  signingSecret?: string
): Promise<TriggerResponse> {
  const body = JSON.stringify(payload);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': `inkeep-agents-action/${PACKAGE_VERSION}`,
  };

  // Add HMAC signature if signing secret is provided
  if (signingSecret) {
    headers['X-Signature-256'] = computeSignature(body, signingSecret);
  }

  core.info(`Sending trigger to: ${triggerUrl}`);

  const response = await fetch(triggerUrl, {
    method: 'POST',
    headers,
    body,
  });

  const responseText = await response.text();

  if (!response.ok) {
    // Log sanitized URL (without query params that might contain secrets)
    const sanitizedUrl = new URL(triggerUrl);
    sanitizedUrl.search = '';

    throw new Error(
      `Trigger request failed (${response.status}): ${responseText}\n` +
        `URL: ${sanitizedUrl.toString()}`
    );
  }

  // Parse and validate response
  let responseData: unknown;
  try {
    responseData = JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid JSON response from trigger: ${responseText}`);
  }

  const result = TriggerResponseSchema.safeParse(responseData);

  if (!result.success) {
    core.warning(`Response validation warning: ${result.error.message}`);
    // Return a partial response if we can extract the fields
    const data = responseData as Record<string, unknown>;
    return {
      success: Boolean(data.success),
      invocationId: String(data.invocationId || data.invocation_id || ''),
      conversationId: String(data.conversationId || data.conversation_id || ''),
    };
  }

  return result.data;
}
