// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  GitLabReleaseBranchInfo,
  GitLabPromotionWorkflow
} from '../../../../../../shared/gitlab-promotion-workflow'
import type { GitLabWorkItemDetails } from '../../../../../../shared/gitlab-types'
import { GitLabPromotionStages } from './GitLabPromotionStages'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

const HEAD_SHA = 'a'.repeat(40)
const workflow: GitLabPromotionWorkflow = {
  developmentBranch: 'develop',
  testingBranch: 'develop-1',
  features: [],
  releases: []
}
const detail: GitLabWorkItemDetails = {
  item: {
    id: 'mr-1',
    type: 'mr',
    number: 1,
    title: 'Feature',
    state: 'merged',
    url: 'https://gitlab.example/mr/1',
    labels: [],
    updatedAt: '',
    author: null,
    branchName: 'feature-20261025-search-alice',
    baseRefName: 'develop'
  },
  body: '',
  comments: [],
  headSha: HEAD_SHA
}

const mounted: { root: ReturnType<typeof createRoot>; container: HTMLDivElement }[] = []
afterEach(() => {
  for (const view of mounted.splice(0)) {
    act(() => view.root.unmount())
    view.container.remove()
  }
})

function renderStage(
  targetInfo: GitLabReleaseBranchInfo,
  mrPipelineStatus?: string
): HTMLButtonElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mounted.push({ root, container })
  act(() =>
    root.render(
      <GitLabPromotionStages
        workflow={workflow}
        feature={{
          branch: 'feature-20261025-search-alice',
          steps: { development: { targetBranch: 'develop', mrIid: 1 } }
        }}
        headSha={HEAD_SHA}
        activeReleaseBranch=""
        details={{ development: { ...detail, pipelineStatus: mrPipelineStatus } }}
        targetInfos={{ development: targetInfo }}
        busy={false}
        verifier="Alice"
        onVerifierChange={() => {}}
        onRefresh={() => {}}
        onCreateMR={() => {}}
        onVerify={() => {}}
      />
    )
  )
  const button = [...container.querySelectorAll('button')].find((item) =>
    item.textContent?.includes('Record environment validation')
  )
  if (!button) {
    throw new Error('Validation button is missing')
  }
  return button
}

describe('GitLab promotion target pipeline gate', () => {
  it('allows validation when the develop pipeline succeeded even without an MR pipeline', () => {
    const button = renderStage({
      defaultBranch: 'main',
      defaultSha: HEAD_SHA,
      branchSha: HEAD_SHA,
      pipelineStatus: 'success'
    })
    expect(button.disabled).toBe(false)
  })

  it('blocks validation when the develop pipeline is still running', () => {
    const button = renderStage(
      {
        defaultBranch: 'main',
        defaultSha: HEAD_SHA,
        branchSha: HEAD_SHA,
        pipelineStatus: 'running'
      },
      'success'
    )
    expect(button.disabled).toBe(true)
  })
})
