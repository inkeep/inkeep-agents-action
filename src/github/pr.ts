import * as core from '@actions/core';
import * as github from '@actions/github';
import { minimatch } from 'minimatch';
import type { PullRequest, ChangedFile, Comment, GitHubUser } from '../types/index.js';

type Octokit = ReturnType<typeof github.getOctokit>;

export interface PRContext {
  pullRequest: PullRequest;
  changedFiles: ChangedFile[];
  comments: Comment[];
  triggerComment?: Comment;
}

function mapUser(user: { login: string; id: number; avatar_url: string; html_url: string }): GitHubUser {
  return {
    login: user.login,
    id: user.id,
    avatarUrl: user.avatar_url,
    url: user.html_url,
  };
}

/**
 * Fetch pull request details
 */
async function fetchPullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PullRequest> {
  core.info(`Fetching PR #${prNumber} details`);

  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  return {
    number: pr.number,
    title: pr.title,
    body: pr.body,
    author: mapUser(pr.user!),
    url: pr.html_url,
    state: pr.state,
    base: {
      ref: pr.base.ref,
      sha: pr.base.sha,
    },
    head: {
      ref: pr.head.ref,
      sha: pr.head.sha,
    },
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
  };
}

/**
 * Fetch the PR diff
 */
async function fetchDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string> {
  core.info(`Fetching PR #${prNumber} diff`);

  const { data: diff } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: {
      format: 'diff',
    },
  });

  // The response is a string when requesting diff format
  return diff as unknown as string;
}

/**
 * Fetch changed files with optional path filtering and content fetching
 */
async function fetchChangedFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string,
  pathFilter?: string,
  includeContents: boolean = false,
  includePatches: boolean = false
): Promise<ChangedFile[]> {
  core.info(`Fetching PR #${prNumber} changed files`);

  const files: ChangedFile[] = [];

  // Paginate through all changed files
  for await (const response of octokit.paginate.iterator(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  })) {
    for (const file of response.data) {
      // Apply path filter if specified
      if (pathFilter && !minimatch(file.filename, pathFilter)) {
        continue;
      }

      const changedFile: ChangedFile = {
        path: file.filename,
        status: file.status as ChangedFile['status'],
        additions: file.additions,
        deletions: file.deletions,
        patch: includePatches ? file.patch : undefined,
        previousPath: file.previous_filename,
      };

      // Fetch file contents if requested and file wasn't deleted
      if (includeContents && file.status !== 'removed') {
        try {
          const { data: content } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: file.filename,
            ref: headSha,
          });

          if ('content' in content && content.encoding === 'base64') {
            changedFile.contents = Buffer.from(content.content, 'base64').toString('utf-8');
          }
        } catch (error) {
          core.warning(`Failed to fetch contents for ${file.filename}: ${error}`);
        }
      }

      files.push(changedFile);
    }
  }

  core.info(`Found ${files.length} changed files${pathFilter ? ` matching "${pathFilter}"` : ''}`);

  return files;
}

/**
 * Fetch all PR comments (both issue comments and review comments)
 */
async function fetchComments(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  triggerCommentId?: number | null
): Promise<{ comments: Comment[]; triggerComment?: Comment }> {
  core.info(`Fetching PR #${prNumber} comments`);

  const comments: Comment[] = [];
  let triggerComment: Comment | undefined;

  // Fetch issue comments (general PR comments)
  for await (const response of octokit.paginate.iterator(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  })) {
    for (const comment of response.data) {
      const mappedComment: Comment = {
        id: comment.id,
        body: comment.body || '',
        author: mapUser(comment.user!),
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
        type: 'issue',
      };

      comments.push(mappedComment);

      if (triggerCommentId && comment.id === triggerCommentId) {
        triggerComment = mappedComment;
      }
    }
  }

  // Fetch review comments (inline code comments)
  for await (const response of octokit.paginate.iterator(octokit.rest.pulls.listReviewComments, {
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  })) {
    for (const comment of response.data) {
      const mappedComment: Comment = {
        id: comment.id,
        body: comment.body,
        author: mapUser(comment.user!),
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
        type: 'review',
        path: comment.path,
        line: comment.line || comment.original_line,
      };

      comments.push(mappedComment);

      if (triggerCommentId && comment.id === triggerCommentId) {
        triggerComment = mappedComment;
      }
    }
  }

  core.info(`Found ${comments.length} comments`);

  return { comments, triggerComment };
}

/**
 * Fetch all PR context: details, diff, files, and comments
 */
export async function fetchPRContext(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  options: {
    pathFilter?: string;
    includeContents?: boolean;
    triggerCommentId?: number | null;
  } = {}
): Promise<PRContext> {
  const octokit = github.getOctokit(token);

  // Fetch PR details first to get head SHA
  const pullRequest = await fetchPullRequest(octokit, owner, repo, prNumber);

  // Fetch remaining data in parallel
  const [changedFiles, { comments, triggerComment }] = await Promise.all([
    fetchChangedFiles(
      octokit,
      owner,
      repo,
      prNumber,
      pullRequest.head.sha,
      options.pathFilter,
      options.includeContents
    ),
    fetchComments(octokit, owner, repo, prNumber, options.triggerCommentId),
  ]);

  return {
    pullRequest,
    changedFiles,
    comments,
    triggerComment,
  };
}
