import type { HostedReviewProvider } from '../../shared/hosted-review'
import type { PullRequestLinkedIssue } from '../../shared/pull-request-generation'
import { sourceControlLinkedIssueNumber } from '../../shared/source-control-ai-action-variables'
import { getWorkspaceAttachments } from '../../shared/workspace-attachments'
import type { WorkspaceAttachmentMetadata } from '../../shared/workspace-attachment-legacy'
import type { GitRuntimeOptions } from '../git/git-runtime-options'
import { getIssue as getGitHubIssue } from '../github/issues'
import { getIssue as getGitLabIssue } from '../gitlab/issues'

export type PullRequestLinkedIssueMeta = WorkspaceAttachmentMetadata

type LocalGitOptions = Pick<GitRuntimeOptions, 'wslDistro' | 'admissionTier'>

function inferIssueProvider(
  meta: PullRequestLinkedIssueMeta,
  provider?: HostedReviewProvider | null
): 'github' | 'gitlab' | null {
  if (provider === 'github' || provider === 'gitlab') {
    return provider
  }
  if (provider) {
    return null
  }
  const hasGitHub = sourceControlLinkedIssueNumber(meta, 'github') !== null
  const hasGitLab = sourceControlLinkedIssueNumber(meta, 'gitlab') !== null
  return hasGitHub === hasGitLab ? null : hasGitHub ? 'github' : 'gitlab'
}

function fallbackTitle(
  meta: PullRequestLinkedIssueMeta,
  provider: 'github' | 'gitlab',
  number: number
): string {
  const item = meta.linkedWorkItem
  if (item?.provider === provider && item.type === 'issue' && item.number === number) {
    return item.title
  }
  return (
    getWorkspaceAttachments(meta).find(
      (attachment) =>
        attachment.provider === provider &&
        attachment.type === 'issue' &&
        attachment.number === number
    )?.title ?? '(title unavailable)'
  )
}

export async function loadPullRequestLinkedIssue(args: {
  meta: PullRequestLinkedIssueMeta | null | undefined
  provider?: HostedReviewProvider | null
  repoPath: string
  connectionId?: string | null
  localGitOptions?: LocalGitOptions
}): Promise<PullRequestLinkedIssue | null> {
  if (!args.meta) {
    return null
  }
  const provider = inferIssueProvider(args.meta, args.provider)
  const number = sourceControlLinkedIssueNumber(args.meta, provider)
  if (!provider || number === null) {
    return null
  }

  const issue =
    provider === 'github'
      ? await getGitHubIssue(args.repoPath, number, args.connectionId, args.localGitOptions)
      : await getGitLabIssue(args.repoPath, number, args.connectionId, args.localGitOptions)

  return {
    provider,
    number,
    title: issue?.title || fallbackTitle(args.meta, provider, number),
    description: issue?.description ?? ''
  }
}
