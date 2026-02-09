import { z } from 'zod';

/**
 * Standardized payload schemas for Inkeep agent triggers
 */

export const GitHubUserSchema = z.object({
  login: z.string(),
});

export const RepositorySchema = z.object({
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  url: z.string().url(),
  defaultBranch: z.string(),
});

export const PullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  author: GitHubUserSchema,
  url: z.string().url(),
  state: z.string(),
  base: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
  head: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ChangedFileSchema = z.object({
  path: z.string(),
  status: z.enum(['added', 'modified', 'removed', 'renamed', 'copied', 'changed', 'unchanged']),
  additions: z.number(),
  deletions: z.number(),
  patch: z.string().optional(),
  previousPath: z.string().optional(), // For renamed files
  contents: z.string().optional(), // Only if include-file-contents is true
});

export const CommentSchema = z.object({
  id: z.number(),
  body: z.string(),
  author: GitHubUserSchema,
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  type: z.enum(['issue', 'review', 'review_summary']),
  // For review comments (inline code comments)
  path: z.string().optional(),
  line: z.number().optional(),
  diffHunk: z.string().optional(), // Surrounding diff context for inline comments
  isSuggestion: z.boolean().optional(), // True if comment contains a GitHub suggested change
  // For review summaries
  state: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING']).optional(),
});

export const GitHubEventSchema = z.object({
  type: z.string(),
  action: z.string(),
});

export const TriggerPayloadSchema = z.object({
  event: GitHubEventSchema,
  repository: RepositorySchema,
  pullRequest: PullRequestSchema,
  sender: GitHubUserSchema,
  changedFiles: z.array(ChangedFileSchema),
  comments: z.array(CommentSchema),
  triggerComment: CommentSchema.optional(), // The specific comment that triggered this (for issue_comment events)
});

export const TriggerResponseSchema = z.object({
  success: z.boolean(),
  invocationId: z.string(),
  conversationId: z.string(),
});

// Inferred types from schemas
export type GitHubUser = z.infer<typeof GitHubUserSchema>;
export type Repository = z.infer<typeof RepositorySchema>;
export type PullRequest = z.infer<typeof PullRequestSchema>;
export type ChangedFile = z.infer<typeof ChangedFileSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type GitHubEvent = z.infer<typeof GitHubEventSchema>;
export type TriggerPayload = z.infer<typeof TriggerPayloadSchema>;
export type TriggerResponse = z.infer<typeof TriggerResponseSchema>;
