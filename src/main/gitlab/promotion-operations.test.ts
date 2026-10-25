import { beforeEach, describe, expect, it, vi } from 'vitest'

const { glabExecFileAsync, getProjectRef } = vi.hoisted(() => ({
  glabExecFileAsync: vi.fn(),
  getProjectRef: vi.fn()
}))

vi.mock('./gl-utils', () => ({
  acquire: vi.fn().mockResolvedValue(undefined),
  release: vi.fn(),
  glabExecFileAsync,
  glabHostEnvOptions: () => ({}),
  glabRepoExecOptions: () => ({})
}))
vi.mock('./gitlab-project-ref-resolution', () => ({ getProjectRef }))

import {
  createGitLabReleaseBranch,
  createGitLabReleaseTag,
  getGitLabReleaseBranchInfo
} from './release-operations'
import { createGitLabPromotionMR } from './promotion-merge-request'

const DEFAULT_SHA = 'a'.repeat(40)
const FEATURE_SHA = 'b'.repeat(40)
const RELEASE_SHA = 'c'.repeat(40)
const CONTEXT = { repoPath: '/repo' }

describe('GitLab promotion mutations', () => {
  let defaultSha: string
  const releaseHeads = new Map<string, string>()
  let featureSha: string
  const posted: { path: string; fields: string[] }[] = []
  const mrCreates: string[][] = []
  const mrs: Record<string, unknown>[] = []

  beforeEach(() => {
    defaultSha = DEFAULT_SHA
    releaseHeads.clear()
    featureSha = FEATURE_SHA
    posted.length = 0
    mrCreates.length = 0
    mrs.length = 0
    getProjectRef.mockReset().mockResolvedValue({ host: 'gitlab.example', path: 'team/repo' })
    glabExecFileAsync.mockReset().mockImplementation(async (args: string[]) => {
      if (args[0] === 'mr' && args[1] === 'list') {
        const source = args[args.indexOf('--source-branch') + 1]
        const target = args[args.indexOf('--target-branch') + 1]
        return {
          stdout: JSON.stringify(
            mrs.filter((item) => item.source_branch === source && item.target_branch === target)
          )
        }
      }
      if (args[0] === 'mr' && args[1] === 'create') {
        mrCreates.push(args)
        const source = args[args.indexOf('--source-branch') + 1]
        const target = args[args.indexOf('--target-branch') + 1]
        const iid = 41 + mrs.length
        mrs.push({
          iid,
          web_url: `https://gitlab.example/team/repo/-/merge_requests/${iid}`,
          source_branch: source,
          target_branch: target,
          source_project_id: 1,
          target_project_id: 1
        })
        return { stdout: `https://gitlab.example/team/repo/-/merge_requests/${iid}` }
      }
      const path = args[1]
      const fields = args.filter((_, index) => args[index - 1] === '--field')
      if (args.includes('POST')) {
        posted.push({ path, fields })
        if (path.endsWith('/repository/branches')) {
          const branch = fields.find((value) => value.startsWith('branch='))?.slice(7)
          const sha = fields.find((value) => value.startsWith('ref='))?.slice(4)
          if (branch && sha) {
            releaseHeads.set(branch, sha)
          }
          return { stdout: JSON.stringify({ name: 'release-v1.2.3-20261025' }) }
        }
        if (path.endsWith('/repository/tags')) {
          return { stdout: JSON.stringify({ name: 'v1.2.3' }) }
        }
      }
      if (path === 'projects/team%2Frepo') {
        return { stdout: JSON.stringify({ default_branch: 'main' }) }
      }
      if (path.includes('/repository/branches/main')) {
        return { stdout: JSON.stringify({ commit: { id: defaultSha } }) }
      }
      if (path.includes('/repository/branches/feature-')) {
        return { stdout: JSON.stringify({ commit: { id: featureSha } }) }
      }
      if (path.includes('/repository/branches/develop')) {
        return { stdout: JSON.stringify({ commit: { id: DEFAULT_SHA } }) }
      }
      if (path.includes('/repository/branches/release-')) {
        const branch = decodeURIComponent(path.split('/').at(-1) ?? '')
        const sha = releaseHeads.get(branch)
        if (!sha) {
          throw new Error('404 Not Found')
        }
        return { stdout: JSON.stringify({ commit: { id: sha } }) }
      }
      if (path.includes('/pipelines?')) {
        const query = new URLSearchParams(path.split('?')[1])
        return {
          stdout: JSON.stringify([
            {
              ref: query.get('ref'),
              sha: query.get('sha'),
              status: 'success',
              web_url: 'https://gitlab.example/team/repo/-/pipelines/7'
            }
          ])
        }
      }
      throw new Error(`Unexpected GitLab API call: ${path}`)
    })
  })

  it('creates the release only at the default branch SHA the user saw', async () => {
    await expect(
      createGitLabReleaseBranch(CONTEXT, 'release-v1.2.3-20261025', DEFAULT_SHA)
    ).resolves.toMatchObject({ branchSha: DEFAULT_SHA })
    expect(posted[0]).toMatchObject({
      fields: ['branch=release-v1.2.3-20261025', `ref=${DEFAULT_SHA}`]
    })
    defaultSha = FEATURE_SHA
    await expect(
      createGitLabReleaseBranch(CONTEXT, 'release-v1.2.4-20261025', DEFAULT_SHA)
    ).rejects.toThrow()
    expect(posted).toHaveLength(1)
  })

  it('reads the target branch pipeline for its current commit', async () => {
    const info = await getGitLabReleaseBranchInfo(CONTEXT, 'develop')
    expect(info).toMatchObject({
      branchSha: DEFAULT_SHA,
      pipelineStatus: 'success',
      pipelineUrl: 'https://gitlab.example/team/repo/-/pipelines/7'
    })
    expect(glabExecFileAsync).toHaveBeenCalledWith(
      expect.arrayContaining([
        'api',
        `projects/team%2Frepo/pipelines?ref=develop&sha=${DEFAULT_SHA}&order_by=id&sort=desc&per_page=1`
      ]),
      expect.any(Object)
    )
  })

  it('refuses to tag when release HEAD changed after verification', async () => {
    releaseHeads.set('release-v1.2.3-20261025', RELEASE_SHA)
    await expect(
      createGitLabReleaseTag(CONTEXT, 'release-v1.2.3-20261025', 'v1.2.3', DEFAULT_SHA)
    ).rejects.toThrow('changed')
    expect(posted).toHaveLength(0)
    await expect(
      createGitLabReleaseTag(CONTEXT, 'release-v1.2.3-20261025', 'v1.2.3', RELEASE_SHA)
    ).resolves.toEqual({ tag: 'v1.2.3', sha: RELEASE_SHA })
    expect(posted[0]?.fields).toContain(`ref=${RELEASE_SHA}`)
  })

  it('rejects a tag whose version differs from the release branch', async () => {
    releaseHeads.set('release-v1.2.3-20261025', RELEASE_SHA)
    await expect(
      createGitLabReleaseTag(CONTEXT, 'release-v1.2.3-20261025', 'v1.2.4', RELEASE_SHA)
    ).rejects.toThrow('Invalid release tag')
    expect(posted).toHaveLength(0)
  })

  it('creates an exact source-to-target MR and preserves the feature branch', async () => {
    const result = await createGitLabPromotionMR(
      CONTEXT,
      'feature-20261025-search-alice',
      'develop-1',
      FEATURE_SHA
    )
    expect(result.number).toBe(41)
    expect(mrCreates[0]).toContain('--remove-source-branch=false')
    expect(mrCreates[0]).toContain('--push=false')
    expect(mrCreates[0]).toEqual(expect.arrayContaining(['--target-branch', 'develop-1']))
    await createGitLabPromotionMR(CONTEXT, 'feature-20261025-search-alice', 'develop', FEATURE_SHA)
    expect(mrCreates).toHaveLength(2)
    expect(mrCreates[1]).toEqual(expect.arrayContaining(['--target-branch', 'develop']))
    await createGitLabPromotionMR(CONTEXT, 'feature-20261025-search-alice', 'develop', FEATURE_SHA)
    expect(mrCreates).toHaveLength(2)
    featureSha = DEFAULT_SHA
    await expect(
      createGitLabPromotionMR(CONTEXT, 'feature-20261025-search-alice', 'develop', FEATURE_SHA)
    ).rejects.toThrow('not been pushed')
  })

  it('includes linked GitLab issues in the promotion MR description', async () => {
    await createGitLabPromotionMR(
      CONTEXT,
      'feature-20261025-search-alice',
      'develop',
      FEATURE_SHA,
      [123, 456, 123]
    )
    const args = mrCreates[0]
    expect(args[args.indexOf('--description') + 1]).toBe('Related to #123\nRelated to #456')
  })
})
