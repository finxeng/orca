// @vitest-environment happy-dom

import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../../../shared/repo-types'
import { GitLabPromotionDialog } from './GitLabPromotionDialog'

const mocks = vi.hoisted(() => ({
  createPromotionStageMR: vi.fn(),
  loadPromotionStageDetails: vi.fn()
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string | number>) =>
    fallback.replace(/{{(\w+)}}/g, (_match, name: string) => String(values?.[name] ?? ''))
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: { updateRepo: () => Promise<boolean> }) => unknown) =>
    selector({ updateRepo: async () => true })
}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => children,
  DialogContent: ({ children }: { children: ReactNode }) => children,
  DialogHeader: ({ children }: { children: ReactNode }) => children,
  DialogTitle: ({ children }: { children: ReactNode }) => children,
  DialogDescription: ({ children }: { children: ReactNode }) => children
}))
vi.mock('./gitlab-promotion-stage-operations', () => ({
  createPromotionStageMR: mocks.createPromotionStageMR,
  loadPromotionStageDetails: mocks.loadPromotionStageDetails,
  verifyPromotionStage: vi.fn()
}))

const HEAD_SHA = 'a'.repeat(40)
const branch = 'feature-20261025-search-alice'
const repo: Repo = {
  id: 'repo',
  path: '/repo',
  displayName: 'repo',
  badgeColor: 'gray',
  addedAt: 0,
  gitLabPromotion: {
    developmentBranch: 'develop',
    testingBranch: 'develop-1',
    features: [
      { branch, steps: { development: { targetBranch: 'develop', verifiedHeadSha: HEAD_SHA } } }
    ],
    releases: []
  }
}

beforeEach(() => {
  mocks.createPromotionStageMR.mockReset().mockResolvedValue({
    detail: null,
    targetInfo: { defaultBranch: 'master', defaultSha: HEAD_SHA, branchSha: HEAD_SHA }
  })
  mocks.loadPromotionStageDetails.mockReset().mockResolvedValue({ details: {}, targetInfos: {} })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { gl: { releaseBranchInfo: vi.fn().mockResolvedValue({ projectName: 'repo' }) } }
  })
})

afterEach(() => cleanup())

describe('GitLab promotion MR entry', () => {
  it('opens an editable MR form and creates only after explicit submission', async () => {
    render(
      <GitLabPromotionDialog
        repo={repo}
        branch={branch}
        headSha={HEAD_SHA}
        open
        onOpenChange={() => {}}
        createRequest={{ id: 1, branch, stage: 'testing', targetBranch: 'develop-1' }}
        issueNumbers={[11]}
      />
    )

    const title = await screen.findByRole('textbox', { name: 'MR title' })
    if (!(title instanceof HTMLInputElement)) {
      throw new Error('MR title input is missing')
    }
    expect(title.value).toBe(`${branch} → develop-1`)
    const description = screen.getByRole('textbox', { name: 'MR description' })
    if (!(description instanceof HTMLTextAreaElement)) {
      throw new Error('MR description input is missing')
    }
    expect(description.value).toBe('Related to #11')
    expect(mocks.createPromotionStageMR).not.toHaveBeenCalled()
    expect(screen.queryByText('Release')).toBeNull()

    fireEvent.change(title, { target: { value: 'Validate schedule in test' } })
    fireEvent.change(description, {
      target: { value: 'Related to #11\nRun schedule checks' }
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Create as draft' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create MR' }))

    await waitFor(() =>
      expect(mocks.createPromotionStageMR).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: 'testing',
          targetBranch: 'develop-1',
          details: {
            title: 'Validate schedule in test',
            description: 'Related to #11\nRun schedule checks',
            draft: true
          }
        })
      )
    )
  })
})
