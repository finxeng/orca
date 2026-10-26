import { describe, expect, it, vi } from 'vitest'
import type { GitLabPromotionWorkflow } from '../../../../../../shared/gitlab-promotion-workflow'
import { createPromotionStageMR } from './gitlab-promotion-stage-operations'

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

const headSha = 'a'.repeat(40)
const branch = 'feature-20261025-search-alice'
const workflow: GitLabPromotionWorkflow = {
  developmentBranch: 'develop',
  testingBranch: 'develop-1',
  features: [],
  releases: [{ branch: 'release-v1.2.3-orderexport' }]
}

function createMR(stage: 'testing' | 'pre', currentWorkflow = workflow) {
  return createPromotionStageMR({
    workflow: currentWorkflow,
    feature: { branch, steps: {} },
    branch,
    headSha,
    repoArgs: { repoPath: '/repo', repoId: 'repo', repoOwnerExecutionHostId: 'local' },
    save: vi.fn(),
    stage,
    targetBranch: stage === 'testing' ? 'develop-1' : 'release-v1.2.3-orderexport',
    issueNumbers: [],
    details: { title: 'Test feature', description: '', draft: false }
  })
}

describe('GitLab promotion stage prerequisites', () => {
  it('requires validation of the previous stage before creating Test or Pre MRs', async () => {
    await expect(createMR('testing')).rejects.toThrow('previous environment')
    await expect(createMR('pre')).rejects.toThrow('previous environment')
  })

  it('does not promote another feature into an already tagged release', async () => {
    const tagged: GitLabPromotionWorkflow = {
      ...workflow,
      releases: [{ branch: 'release-v1.2.3-orderexport', tag: 'repo-tag-v1.2.3' }]
    }
    await expect(createMR('pre', tagged)).rejects.toThrow('target branch')
  })
})
