import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../shared/repo-types'

const { getProjectRef, getBranchConflictKind, glabExecFileAsync } = vi.hoisted(() => ({
  getProjectRef: vi.fn(),
  getBranchConflictKind: vi.fn(),
  glabExecFileAsync: vi.fn()
}))

vi.mock('./gitlab-project-ref-resolution', () => ({ getProjectRef }))
vi.mock('../git/repo', () => ({ getBranchConflictKind }))
vi.mock('../git/runner', () => ({ glabExecFileAsync }))

import {
  formatGitLabFeatureBranchName,
  resolveGitLabFeatureBranchName
} from './feature-branch-name'

const repo: Repo = {
  id: 'repo-1',
  path: '/projects/tool',
  displayName: 'tool',
  badgeColor: '#000',
  addedAt: 0
}

describe('GitLab feature branch naming', () => {
  beforeEach(() => {
    getProjectRef.mockReset()
    getBranchConflictKind.mockReset()
    glabExecFileAsync.mockReset()
    getProjectRef.mockResolvedValue({ host: 'gitlab.example.com', path: 'team/tool' })
    getBranchConflictKind.mockResolvedValue(null)
    glabExecFileAsync.mockResolvedValue({ stdout: JSON.stringify({ username: 'xin1.feng' }) })
  })

  it('uses the manually entered feature name, creation date, and GitLab username', async () => {
    const name = await resolveGitLabFeatureBranchName(
      repo,
      {
        name: 'old-workspace-name',
        branchNameOverride: 'log4j2-schedule',
        linkedWorkItem: {
          provider: 'gitlab',
          type: 'issue',
          number: 3,
          title: 'Issue #3: Log4j2 schedule',
          url: 'https://gitlab.example.com/team/tool/-/issues/3'
        }
      },
      {},
      new Date(2026, 6, 3)
    )
    expect(name && formatGitLabFeatureBranchName(name)).toBe(
      'feature-20260703-log4j2-schedule-xin1.feng'
    )
    expect(name && formatGitLabFeatureBranchName(name, 2)).toBe(
      'feature-20260703-log4j2-schedule-2-xin1.feng'
    )
    expect(glabExecFileAsync).toHaveBeenCalledWith(
      ['api', '--hostname', 'gitlab.example.com', 'user'],
      { cwd: '/projects/tool' }
    )
  })

  it('keeps an explicitly selected existing branch unchanged', async () => {
    getBranchConflictKind.mockResolvedValue('local')
    await expect(
      resolveGitLabFeatureBranchName(repo, {
        name: 'worktree',
        branchNameOverride: 'existing/branch'
      })
    ).resolves.toBeNull()
    expect(glabExecFileAsync).not.toHaveBeenCalled()
  })

  it('formats a manually entered branch name when that branch does not exist', async () => {
    const name = await resolveGitLabFeatureBranchName(
      repo,
      { name: 'Fix login', branchNameOverride: 'my-fix' },
      {},
      new Date(2026, 6, 3)
    )
    expect(name && formatGitLabFeatureBranchName(name)).toBe('feature-20260703-my-fix-xin1.feng')
    expect(getBranchConflictKind).toHaveBeenCalledWith('/projects/tool', 'my-fix', undefined, {})
  })

  it('keeps a remote branch and a selected merge request source branch unchanged', async () => {
    getBranchConflictKind.mockResolvedValue('remote')
    await expect(
      resolveGitLabFeatureBranchName(repo, {
        name: 'worktree',
        branchNameOverride: 'remote-only'
      })
    ).resolves.toBeNull()
    getBranchConflictKind.mockClear()
    await expect(
      resolveGitLabFeatureBranchName(repo, {
        name: 'worktree',
        branchNameOverride: 'mr-source',
        linkedGitLabMR: 3
      })
    ).resolves.toBeNull()
    expect(getBranchConflictKind).not.toHaveBeenCalled()
  })

  it('keeps a selected merge request source branch when no override was entered', async () => {
    await expect(
      resolveGitLabFeatureBranchName(repo, { name: 'review', linkedGitLabMR: 3 })
    ).resolves.toBeNull()
    expect(glabExecFileAsync).not.toHaveBeenCalled()
  })

  it('requires a feature name even when a task title and workspace name exist', async () => {
    await expect(
      resolveGitLabFeatureBranchName(repo, {
        name: 'workspace-display-name',
        linkedWorkItem: {
          provider: 'gitlab',
          type: 'issue',
          number: 8,
          title: 'Log4j2Schedule调整为2分支一次',
          url: 'https://gitlab.example.com/team/tool/-/issues/8'
        }
      })
    ).rejects.toThrow('Enter a branch feature name')
    expect(glabExecFileAsync).not.toHaveBeenCalled()
  })

  it.each(['中文', 'issue#8', 'task_name', 'two words', ' a ', 'a--b', 'name/part'])(
    'rejects invalid feature names: %s',
    async (feature) => {
      await expect(
        resolveGitLabFeatureBranchName(repo, {
          name: 'workspace-display-name',
          branchNameOverride: feature
        })
      ).rejects.toThrow('Enter a branch feature name')
    }
  )

  it('refuses to substitute a Git username for a missing GitLab login', async () => {
    glabExecFileAsync.mockRejectedValue(new Error('not logged in'))
    await expect(
      resolveGitLabFeatureBranchName(repo, { name: 'feature', branchNameOverride: 'fix-login' })
    ).rejects.toThrow('Could not read the GitLab username')
  })

  it('leaves a non-GitLab repository on its existing branch naming path', async () => {
    getProjectRef.mockResolvedValue(null)
    await expect(resolveGitLabFeatureBranchName(repo, { name: 'feature' })).resolves.toBeNull()
  })
})
