import * as core from '@actions/core';

const DEFAULT_API_BASE_URL = 'https://api.pilot.inkeep.com';
const TOKEN_EXCHANGE_PATH = '/work-apps/github/token-exchange';
const OIDC_AUDIENCE = 'inkeep-agents-action';

export interface TokenExchangeResponse {
  token: string;
  expires_at: string;
  repository: string;
  installation_id: number;
}

export interface TokenExchangeRequest {
  oidc_token: string;
  project_id: string;
}

/**
 * Get a GitHub token for API access.
 *
 * If github-token input is provided, uses that directly.
 * Otherwise, performs OIDC token exchange with Inkeep API to get
 * a GitHub App installation token.
 */
export async function getGitHubToken(
  projectId: string,
  overrideToken?: string,
  apiBaseUrl?: string
): Promise<string> {
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

  // Build the token exchange endpoint URL
  const baseUrl = apiBaseUrl || DEFAULT_API_BASE_URL;
  const tokenExchangeUrl = `${baseUrl.replace(/\/$/, '')}${TOKEN_EXCHANGE_PATH}`;
  
  if (apiBaseUrl) {
    core.info(`Using custom API base URL: ${baseUrl}`);
  }

  // Exchange OIDC token for GitHub App installation token
  const request: TokenExchangeRequest = {
    oidc_token: oidcToken,
    project_id: projectId,
  };
  const response = await fetch(tokenExchangeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
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

export function getProjectIdFromTriggerUrl(triggerUrl: string): string {
  // URL format: https://domain/run/tenants/:tenantId/projects/:projectId/...
  const url = new URL(triggerUrl);
  const parts = url.pathname.split('/');
  // parts: ["", "run", "tenants", tenantId, "projects", projectId, ...]
  const projectIndex = parts.indexOf('projects');
  if (projectIndex === -1 || projectIndex + 1 >= parts.length) {
    throw new Error(`Invalid trigger URL format: could not extract project ID from ${triggerUrl}`);
  }
  return parts[projectIndex + 1];
}