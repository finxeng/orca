import {
  acquire,
  glabExecFileAsync,
  glabHostEnvOptions,
  glabRepoExecOptions,
  release
} from './gl-utils'
import { getProjectRef } from './gitlab-project-ref-resolution'
import { getGitLabRepositoryBranchSha } from './release-operations'
import type { GitLabReleaseContext } from './release-operations'
import { isValidPromotionRef } from '../../shared/gitlab-promotion-workflow'
import type {
  GitLabPromotionMrDetails,
  GitLabPromotionMrResult
} from '../../shared/gitlab-promotion-workflow'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseMR(
  value: unknown,
  headSha: string,
  source: string,
  target: string
): GitLabPromotionMrResult | null {
  if (
    !isRecord(value) ||
    typeof value.iid !== 'number' ||
    !Number.isInteger(value.iid) ||
    typeof value.web_url !== 'string' ||
    value.source_branch !== source ||
    value.target_branch !== target ||
    typeof value.source_project_id !== 'number' ||
    value.source_project_id !== value.target_project_id
  ) {
    return null
  }
  return { number: value.iid, url: value.web_url, headSha }
}

export async function createGitLabPromotionMR(
  context: GitLabReleaseContext,
  source: string,
  target: string,
  expectedSha: string,
  issueNumbers: number[] = [],
  details?: GitLabPromotionMrDetails
): Promise<GitLabPromotionMrResult> {
  if (
    !isValidPromotionRef(source) ||
    !isValidPromotionRef(target) ||
    source === target ||
    !/^[0-9a-f]{40,64}$/.test(expectedSha) ||
    issueNumbers.length > 20 ||
    issueNumbers.some((number) => !Number.isSafeInteger(number) || number <= 0) ||
    (details !== undefined &&
      (!details.title.trim() || details.title.length > 255 || details.description.length > 20_000))
  ) {
    throw new Error('Invalid promotion merge request.')
  }
  const project = await getProjectRef(
    context.repoPath,
    undefined,
    context.connectionId,
    context.gitOptions
  )
  if (!project) {
    throw new Error('Could not resolve the GitLab project from origin.')
  }
  await acquire()
  try {
    const remoteHead = await getGitLabRepositoryBranchSha(context, source)
    if (remoteHead !== expectedSha) {
      throw new Error('Feature branch has not been pushed at the expected commit.')
    }
    if (!(await getGitLabRepositoryBranchSha(context, target))) {
      throw new Error('Target branch does not exist on GitLab.')
    }
    const options = {
      ...glabRepoExecOptions(context.repoPath, context.connectionId, context.gitOptions),
      ...glabHostEnvOptions(project, context.connectionId),
      timeout: 60_000
    }
    const findOpenMR = async (): Promise<GitLabPromotionMrResult | null> => {
      const { stdout } = await glabExecFileAsync(
        [
          'mr',
          'list',
          '-R',
          project.path,
          '--source-branch',
          source,
          '--target-branch',
          target,
          '--per-page',
          '20',
          '--output',
          'json'
        ],
        { ...options, idempotent: true }
      )
      const items: unknown = JSON.parse(stdout)
      if (!Array.isArray(items)) {
        throw new Error('GitLab did not return an MR list.')
      }
      return (
        items
          .map((item) => parseMR(item, expectedSha, source, target))
          .find((item) => item !== null) ?? null
      )
    }
    const existing = await findOpenMR()
    if (existing) {
      return existing
    }
    const title = details?.title.trim() ?? `${source} → ${target}`
    const description =
      details?.description ??
      [...new Set(issueNumbers)].map((number) => `Related to #${number}`).join('\n')
    try {
      await glabExecFileAsync(
        [
          'mr',
          'create',
          '-R',
          project.path,
          '--source-branch',
          source,
          '--target-branch',
          target,
          '--title',
          title,
          '--description',
          description,
          ...(details?.draft ? ['--draft'] : []),
          '--remove-source-branch=false',
          '--push=false',
          '--yes'
        ],
        { ...options, idempotent: false }
      )
    } catch (error) {
      const found = await findOpenMR().catch(() => null)
      if (found) {
        return found
      }
      throw error
    }
    const created = await findOpenMR()
    if (!created) {
      throw new Error(
        'GitLab created the MR but did not return its identity. Refresh before retrying.'
      )
    }
    return created
  } finally {
    release()
  }
}
