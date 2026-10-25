import {
  acquire,
  glabExecFileAsync,
  glabHostEnvOptions,
  glabRepoExecOptions,
  release
} from './gl-utils'
import { getProjectRef } from './gitlab-project-ref-resolution'
import type { LocalGitExecOptions } from './gitlab-project-ref-resolution'
import { isValidPromotionRef } from '../../shared/gitlab-promotion-workflow'
import type { GitLabReleaseBranchInfo } from '../../shared/gitlab-promotion-workflow'

export type GitLabReleaseContext = {
  repoPath: string
  connectionId?: string | null
  gitOptions?: LocalGitExecOptions
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readSha(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.commit)) {
    return null
  }
  const sha = value.commit.id
  return typeof sha === 'string' && /^[0-9a-f]{40,64}$/.test(sha) ? sha : null
}

export async function gitLabProjectApi(
  context: GitLabReleaseContext,
  path: string,
  fields?: Record<string, string>
): Promise<unknown> {
  const project = await getProjectRef(
    context.repoPath,
    undefined,
    context.connectionId,
    context.gitOptions
  )
  if (!project) {
    throw new Error('Could not resolve the GitLab project from origin.')
  }
  const args = ['api', `projects/${encodeURIComponent(project.path)}${path}`]
  if (fields) {
    args.push('--method', 'POST')
    for (const [key, value] of Object.entries(fields)) {
      args.push('--field', `${key}=${value}`)
    }
  }
  const { stdout } = await glabExecFileAsync(args, {
    ...glabRepoExecOptions(context.repoPath, context.connectionId, context.gitOptions),
    ...glabHostEnvOptions(project, context.connectionId),
    idempotent: !fields,
    timeout: 60_000
  })
  return JSON.parse(stdout)
}

async function branchInfo(context: GitLabReleaseContext, branch: string): Promise<unknown> {
  try {
    return await gitLabProjectApi(context, `/repository/branches/${encodeURIComponent(branch)}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/404|not found/i.test(message)) {
      return null
    }
    throw error
  }
}

async function branchPipeline(
  context: GitLabReleaseContext,
  branch: string,
  sha: string
): Promise<{ status: string; url?: string } | null> {
  const rows = await gitLabProjectApi(
    context,
    `/pipelines?ref=${encodeURIComponent(branch)}&sha=${sha}&order_by=id&sort=desc&per_page=1`
  )
  if (!Array.isArray(rows) || !isRecord(rows[0])) {
    return null
  }
  const pipeline = rows[0]
  if (pipeline.ref !== branch || pipeline.sha !== sha || typeof pipeline.status !== 'string') {
    return null
  }
  return {
    status: pipeline.status,
    ...(typeof pipeline.web_url === 'string' ? { url: pipeline.web_url } : {})
  }
}

export async function getGitLabRepositoryBranchSha(
  context: GitLabReleaseContext,
  branch: string
): Promise<string | null> {
  if (!isValidPromotionRef(branch)) {
    throw new Error('Invalid branch name.')
  }
  return readSha(await branchInfo(context, branch))
}

export async function getGitLabReleaseBranchInfo(
  context: GitLabReleaseContext,
  branch?: string
): Promise<GitLabReleaseBranchInfo> {
  if (branch && !isValidPromotionRef(branch)) {
    throw new Error('Invalid release branch name.')
  }
  const project = await gitLabProjectApi(context, '')
  if (
    !isRecord(project) ||
    typeof project.default_branch !== 'string' ||
    !isValidPromotionRef(project.default_branch)
  ) {
    throw new Error('GitLab did not report a valid default branch.')
  }
  const defaultBranch = project.default_branch
  const defaultSha = readSha(await branchInfo(context, defaultBranch))
  if (!defaultSha) {
    throw new Error('Could not read the default branch commit.')
  }
  const branchSha = branch ? readSha(await branchInfo(context, branch)) : null
  const pipeline = branch && branchSha ? await branchPipeline(context, branch, branchSha) : null
  return {
    defaultBranch,
    defaultSha,
    branchSha,
    ...(pipeline ? { pipelineStatus: pipeline.status, pipelineUrl: pipeline.url } : {})
  }
}

export async function createGitLabReleaseBranch(
  context: GitLabReleaseContext,
  branch: string,
  expectedDefaultSha: string
): Promise<GitLabReleaseBranchInfo> {
  if (!isValidPromotionRef(branch) || !/^release-v\d+\.\d+\.\d+-\d{8}$/.test(branch)) {
    throw new Error('Invalid release branch name.')
  }
  if (!/^[0-9a-f]{40,64}$/.test(expectedDefaultSha)) {
    throw new Error('Invalid default branch commit.')
  }
  await acquire()
  try {
    const before = await getGitLabReleaseBranchInfo(context, branch)
    if (before.branchSha) {
      throw new Error('Release branch already exists.')
    }
    if (before.defaultSha !== expectedDefaultSha) {
      throw new Error('Default branch changed. Refresh before creating the release.')
    }
    await gitLabProjectApi(context, '/repository/branches', { branch, ref: expectedDefaultSha })
    const after = await getGitLabReleaseBranchInfo(context, branch)
    if (after.branchSha !== expectedDefaultSha) {
      throw new Error('Release branch was created but its commit differs from the expected base.')
    }
    return after
  } finally {
    release()
  }
}

export async function createGitLabReleaseTag(
  context: GitLabReleaseContext,
  branch: string,
  tag: string,
  expectedSha: string
): Promise<{ tag: string; sha: string }> {
  if (
    !isValidPromotionRef(branch) ||
    !isValidPromotionRef(tag) ||
    branch.match(/^release-(v\d+\.\d+\.\d+)-\d{8}$/)?.[1] !== tag ||
    !/^[0-9a-f]{40,64}$/.test(expectedSha)
  ) {
    throw new Error('Invalid release tag request.')
  }
  await acquire()
  try {
    const current = await branchInfo(context, branch)
    if (readSha(current) !== expectedSha) {
      throw new Error('Release branch changed after Pre verification.')
    }
    await gitLabProjectApi(context, '/repository/tags', { tag_name: tag, ref: expectedSha })
    return { tag, sha: expectedSha }
  } finally {
    release()
  }
}
