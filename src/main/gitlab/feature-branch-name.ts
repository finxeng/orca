import type { Repo } from '../../shared/repo-types'
import type { CreateWorktreeArgs } from '../../shared/worktree/create-types'
import { isValidGitLabFeatureName } from '../../shared/gitlab-feature-name'
import { isBranchSafeHostedLogin } from '../../shared/branch-safe-hosted-login'
import { glabExecFileAsync } from '../git/runner'
import { getBranchConflictKind } from '../git/repo'
import { getProjectRef } from './gitlab-project-ref-resolution'

type FeatureBranchRequest = Pick<
  CreateWorktreeArgs,
  'name' | 'baseBranch' | 'branchNameOverride' | 'linkedWorkItem'
> & {
  linkedPR?: number | null
  linkedGitLabIssue?: number | null
  linkedGitLabMR?: number | null
  linkedBitbucketPR?: number | null
  linkedAzureDevOpsPR?: number | null
  linkedGiteaPR?: number | null
}

export type GitLabFeatureBranchName = {
  date: string
  feature: string
  username: string
}

export function formatGitLabFeatureBranchName(name: GitLabFeatureBranchName, suffix = 1): string {
  const feature = suffix === 1 ? name.feature : `${name.feature}-${suffix}`
  return `feature-${name.date}-${feature}-${name.username}`
}

export async function resolveGitLabFeatureBranchName(
  repo: Repo,
  request: FeatureBranchRequest,
  gitOptions: { wslDistro?: string } = {},
  now = new Date()
): Promise<GitLabFeatureBranchName | null> {
  if (
    request.linkedWorkItem?.type === 'pr' ||
    request.linkedWorkItem?.type === 'mr' ||
    request.linkedPR != null ||
    request.linkedGitLabMR != null ||
    request.linkedBitbucketPR != null ||
    request.linkedAzureDevOpsPR != null ||
    request.linkedGiteaPR != null
  ) {
    return null
  }
  const project = await getProjectRef(repo.path, undefined, null, gitOptions)
  if (!project) {
    if (
      request.linkedWorkItem?.provider === 'gitlab' ||
      request.linkedGitLabIssue ||
      request.linkedGitLabMR
    ) {
      throw new Error('Could not identify the GitLab project for branch naming.')
    }
    return null
  }
  if (request.branchNameOverride) {
    const override = request.branchNameOverride
    const base = request.baseBranch?.replace(/^refs\/(?:heads|remotes)\//, '')
    if (base === override || base?.endsWith(`/${override}`)) {
      return null
    }
    if (await getBranchConflictKind(repo.path, override, undefined, gitOptions)) {
      return null
    }
  }
  const feature = request.branchNameOverride ?? ''
  if (!isValidGitLabFeatureName(feature)) {
    throw new Error(
      'Enter a branch feature name using English letters, numbers, and hyphens only (up to 48 characters).'
    )
  }
  let username: string
  try {
    const { stdout } = await glabExecFileAsync(['api', '--hostname', project.host, 'user'], {
      cwd: repo.path,
      ...gitOptions
    })
    const viewer: unknown = JSON.parse(stdout)
    username =
      viewer &&
      typeof viewer === 'object' &&
      'username' in viewer &&
      typeof viewer.username === 'string'
        ? viewer.username.trim()
        : ''
  } catch {
    throw new Error(
      `Could not read the GitLab username for ${project.host}. Sign in with glab and retry.`
    )
  }
  if (!isBranchSafeHostedLogin(username)) {
    throw new Error(
      `GitLab username for ${project.host} is missing or cannot be used in a branch name.`
    )
  }
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, '0')))
    .join('')
  return { date, feature, username }
}
