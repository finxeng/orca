import type { AiActionId } from './source-control-ai-actions'
import type { HostedReviewProvider } from './hosted-review'

/**
 * Registering a variable a hover card cannot describe is a compile error: the
 * element type is keyed off `SOURCE_CONTROL_ACTION_VARIABLE_INFO`, so chips can
 * never index a missing entry.
 */
export const SOURCE_CONTROL_ACTION_VARIABLES: Record<AiActionId, SourceControlActionVariable[]> = {
  commitMessage: ['basePrompt', 'branch', 'stagedFiles', 'stagedPatch', 'linkedIssue'],
  pullRequest: [
    'basePrompt',
    'branch',
    'baseBranch',
    'currentTitle',
    'currentBody',
    'commitSummary',
    'changedFiles',
    'patch',
    'linkedIssue'
  ],
  branchName: ['basePrompt', 'firstPrompt', 'assistantMessage'],
  conversationName: ['basePrompt', 'firstPrompt'],
  fixCommitFailure: ['basePrompt'],
  fixPushFailure: ['basePrompt'],
  fixChecks: ['basePrompt'],
  resolveConflicts: ['basePrompt'],
  resolveComments: ['basePrompt']
}

export type SourceControlActionVariableInfo = {
  description: string
  example: string
}

export const SOURCE_CONTROL_ACTION_VARIABLE_INFO = {
  basePrompt: {
    description:
      'Orca’s built-in prompt for this action, including the context Orca knows how to gather safely.',
    example:
      'Commit messages include staged diff guidance; PR details include branch comparison guidance; fix actions include the failure summary.'
  },
  branch: {
    description: 'The current source-control branch name.',
    example: 'feature/source-control-ai-recipes'
  },
  stagedFiles: {
    description: 'A newline-separated list of staged files for commit-message generation.',
    example: 'M src/shared/source-control-ai.ts\nA src/shared/source-control-ai-actions.ts'
  },
  stagedPatch: {
    description: 'The staged git patch used for commit-message generation.',
    example: 'diff --git a/src/app.ts b/src/app.ts\n+addActionRecipeDefaults()'
  },
  baseBranch: {
    description: 'The target branch selected in the Create PR composer.',
    example: 'main'
  },
  currentTitle: {
    description: 'The PR title currently typed in the composer before generation starts.',
    example: 'Improve Source Control AI customization'
  },
  currentBody: {
    description: 'The PR description currently typed in the composer before generation starts.',
    example: 'Adds configurable agents and command templates for Source Control actions.'
  },
  commitSummary: {
    description: 'A newline-separated list of commits on the branch compared to the base.',
    example: 'a1b2c3d Add action recipe defaults\nd4e5f6a Render command templates'
  },
  changedFiles: {
    description: 'A summary of files changed between the branch and the base branch.',
    example:
      'src/shared/source-control-ai-actions.ts | 24 +++++\nsrc/main/text-generation.ts | 8 +-'
  },
  patch: {
    description: 'The branch diff against the base branch used for PR-details generation.',
    example: 'diff --git a/src/app.ts b/src/app.ts\n+renderSourceControlActionCommandTemplate()'
  },
  firstPrompt: {
    description: 'The first user request for this workspace or chat.',
    example: 'Fix CI and commit the result'
  },
  assistantMessage: {
    description: 'The initial agent response, when Orca has one available.',
    example: 'I will inspect the failing check, patch the issue, and run tests.'
  },
  linkedIssue: {
    description:
      'The issue number linked to this workspace for the active GitHub or GitLab review. Empty when no matching issue is linked or the provider is ambiguous. Include a closing keyword only when the issue should be closed.',
    example: '123'
  }
} satisfies Record<string, SourceControlActionVariableInfo>

export type SourceControlActionVariable = keyof typeof SOURCE_CONTROL_ACTION_VARIABLE_INFO

/**
 * Issue numbers are positive integers on every supported provider, so anything
 * else (negative, zero, fractional, non-finite) is corrupt metadata rather than
 * a renderable issue reference — `Fixes #-7` is worse output than `Fixes #`.
 * The safe-integer bound also keeps the rendering in decimal notation: `String`
 * switches to exponent form (`1e+21`) above it.
 */
export function isLinkedIssueNumber(linkedIssue: unknown): linkedIssue is number {
  return typeof linkedIssue === 'number' && Number.isSafeInteger(linkedIssue) && linkedIssue > 0
}

export function sourceControlLinkedIssueNumber(
  meta:
    | {
        linkedIssue?: number | null
        linkedGitLabIssue?: number | null
        linkedWorkItem?: {
          provider: string
          type: string
          number: number
        } | null
      }
    | null
    | undefined,
  provider?: HostedReviewProvider | null
): number | null {
  const linkedItem = meta?.linkedWorkItem?.type === 'issue' ? meta.linkedWorkItem : null
  const github = isLinkedIssueNumber(meta?.linkedIssue)
    ? meta.linkedIssue
    : linkedItem?.provider === 'github' && isLinkedIssueNumber(linkedItem.number)
      ? linkedItem.number
      : null
  const gitlab = isLinkedIssueNumber(meta?.linkedGitLabIssue)
    ? meta.linkedGitLabIssue
    : linkedItem?.provider === 'gitlab' && isLinkedIssueNumber(linkedItem.number)
      ? linkedItem.number
      : null
  if (provider === 'github') {
    return github
  }
  if (provider === 'gitlab') {
    return gitlab
  }
  if (provider) {
    return null
  }
  return github === null ? gitlab : gitlab === null ? github : null
}

/**
 * Render the workspace-linked issue for template substitution. Anything
 * that is not a positive integer becomes `''` so the token expands to nothing
 * instead of leaking into the prompt.
 */
export function formatLinkedIssueTemplateValue(linkedIssue: number | null | undefined): string {
  return isLinkedIssueNumber(linkedIssue) ? String(linkedIssue) : ''
}

/**
 * Attach a resolved issue number to a draft context. Returns the context untouched
 * when nothing resolves, so unlinked workspaces keep their existing context shape.
 * The `linkedIssue`-bearing constraint keeps the attach off contexts that do not
 * declare the field (branch-name generation), where it would be silently unread.
 */
export function withLinkedIssueDraftContext<T extends { linkedIssue?: number | null }>(
  context: T,
  linkedIssue: number | null | undefined
): T {
  return isLinkedIssueNumber(linkedIssue) ? { ...context, linkedIssue } : context
}
