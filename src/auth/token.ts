import * as core from '@actions/core';

const TOKEN_EXCHANGE_ENDPOINT = 'https://api.inkeep.com/api/github/token-exchange';
const OIDC_AUDIENCE = 'inkeep-agents-action';

export interface TokenExchangeResponse {
  token: string;
  expires_at: string;
  repository: string;
  installation_id: number;
}

/**
 * Get a GitHub token for API access.
 *
 * If github-token input is provided, uses that directly.
 * Otherwise, performs OIDC token exchange with Inkeep API to get
 * a GitHub App installation token.
 */
export async function getGitHubToken(overrideToken?: string): Promise<string> {
  // If override token provided, use it directly
  if (overrideToken) {
    core.info('Using provided github-token override');
    return overrideToken;
  }

  core.info('Performing OIDC token exchange for GitHub App authentication');

  // Request OIDC token from GitHub Actions
  const oidcToken = await core.getIDToken(OIDC_AUDIENCE);

  if (!oidcToken) {
    throw new Error(
      'Failed to get OIDC token. Ensure the workflow has "id-token: write" permission.'
    );
  }

  // Exchange OIDC token for GitHub App installation token
  const response = await fetch(TOKEN_EXCHANGE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ oidc_token: oidcToken }),
  });

  if (!response.ok) {
    const errorBody = await response.text();

    if (response.status === 401) {
      throw new Error(`OIDC token validation failed: ${errorBody}`);
    }

    if (response.status === 403) {
      throw new Error(
        `GitHub App not installed on this repository. Please install the Inkeep GitHub App. Details: ${errorBody}`
      );
    }

    throw new Error(`Token exchange failed (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as TokenExchangeResponse;

  core.info(`Authenticated as GitHub App for repository: ${data.repository}`);

  return data.token;
}
