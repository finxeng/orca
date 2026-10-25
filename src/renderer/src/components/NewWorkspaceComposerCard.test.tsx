// @vitest-environment happy-dom

import { act } from 'react'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  composerApiMocks as apiMocks,
  sourceRepos,
  localReadyHostOption,
  pnpmInstallSetupConfig,
  renderCard,
  findInputByLabel,
  changeInputValue,
  findWaitSwitch
} from './new-workspace-composer-card-test-fixture'

let current: { container: HTMLDivElement; root: Root } | null = null

function unmountCurrent(): void {
  act(() => current?.root.unmount())
  current?.container.remove()
}

describe('NewWorkspaceComposerCard folder task source mode', () => {
  beforeEach(() => {
    ;(window as unknown as { api: unknown }).api = {
      runtimeEnvironments: {
        getStatus: apiMocks.runtimeGetStatus
      },
      ssh: {
        connect: apiMocks.sshConnect
      }
    }
    apiMocks.runtimeGetStatus.mockResolvedValue({
      id: 'status',
      ok: true,
      result: {
        runtimeId: 'runtime-devbox',
        rendererGraphEpoch: 1,
        graphStatus: 'ready',
        authoritativeWindowId: null,
        liveTabCount: 0,
        liveLeafCount: 0
      },
      _meta: { runtimeId: 'runtime-devbox' }
    })
    apiMocks.sshConnect.mockResolvedValue(undefined)
  })

  afterEach(() => {
    unmountCurrent()
    current = null
    vi.clearAllMocks()
  })

  it('keeps the Advanced focus highlight inside the composer edge', () => {
    current = renderCard()

    const advancedButton = [...current.container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Advanced')
    )

    expect(advancedButton?.className).toContain('focus-visible:ring-inset')
  })

  it('shows only preset actions while editing and prevents hiding the draft', () => {
    current = renderCard({
      advancedOpen: true,
      sparseControlsEnabled: true,
      canUseSparseCheckout: true
    })
    const buttons = [...current.container.querySelectorAll('button')]
    const button = (label: string) => buttons.find((node) => node.textContent?.includes(label))
    act(() => button('Begin preset')?.click())
    expect(button('Advanced')?.disabled).toBe(true)
    expect(current.container.textContent).not.toContain('Create workspace')
  })

  it('removes collapsed Advanced controls from the Tab order', () => {
    current = renderCard({ advancedOpen: false, branchesEnabled: true })

    const advancedPanel = [...current.container.querySelectorAll('[aria-hidden="true"]')].find(
      (element) => element.querySelector('textarea[placeholder="Write a note"]') !== null
    )

    expect(advancedPanel?.hasAttribute('inert')).toBe(true)
  })

  it('passes folder child repos into the create-from field without a source trigger', () => {
    current = renderCard({
      repoBackedSearchRepos: sourceRepos as never
    })

    const projectSection = current.container.querySelector(
      '[data-contextual-tour-target="workspace-creation-project"]'
    )
    const nameSection = current.container.querySelector(
      '[data-contextual-tour-target="workspace-creation-name"]'
    )
    expect(projectSection?.textContent).not.toContain('Task Source')
    expect(nameSection?.textContent).toContain('Create From')
    const nameInput = current.container.querySelector('[aria-label="workspace name"]')
    expect(nameInput?.getAttribute('data-repo-backed-search-count')).toBe('2')
    expect(nameInput?.getAttribute('data-repo-backed-search-names')).toBe('Repo A,Repo B')
    expect(current.container.querySelector('[data-testid="repo-backed-source-trigger"]')).toBeNull()
    expect(current.container.querySelectorAll('[data-testid="project-combobox"]')).toHaveLength(1)
  })

  it('scopes the workspace-creation-project tour target to the project picker rather than the run target picker', () => {
    current = renderCard({ projectHostSetupOptions: [localReadyHostOption] })

    const projectTourTarget = current.container.querySelector(
      '[data-contextual-tour-target="workspace-creation-project"]'
    )
    expect(projectTourTarget).toBeTruthy()
    expect(projectTourTarget?.querySelector('[data-project-combobox-root="true"]')).toBeTruthy()
    expect(projectTourTarget?.querySelector('[data-run-target-combobox-root="true"]')).toBeNull()
    expect(projectTourTarget?.textContent).not.toContain('Run on')
    expect(projectTourTarget?.querySelector('label')).toBeNull()
    expect(projectTourTarget?.querySelector('[aria-label="Add project"]')).toBeNull()
    expect(current.container.querySelector('[aria-label="Add project"]')).toBeTruthy()

    const runTargetPicker = current.container.querySelector(
      'div[data-run-target-combobox-root="true"]'
    )
    expect(runTargetPicker).toBeTruthy()
  })

  it('keeps the reuse-branch row collapsed until a local branch is reusable', () => {
    // Why: the row stays mounted (for the smooth height transition) but is
    // collapsed + aria-hidden when reuse isn't possible.
    current = renderCard({ canReuseSelectedBranch: false })
    const collapsedReuse = [...current.container.querySelectorAll('[aria-hidden="true"]')].find(
      (el) => el.textContent?.includes('Reuse branch')
    )
    expect(collapsedReuse).toBeTruthy()

    unmountCurrent()

    current = renderCard({ canReuseSelectedBranch: true, reuseSelectedBranch: true })
    const reuseLabel = [...current.container.querySelectorAll('label')].find((label) =>
      label.textContent?.includes('Reuse branch')
    )
    expect(reuseLabel).toBeTruthy()
    // Visible: not inside an aria-hidden (collapsed) wrapper.
    expect(reuseLabel?.closest('[aria-hidden="true"]')).toBeNull()
    expect(current.container.textContent).toContain(
      'Check out the existing branch instead of creating a new one from it.'
    )
  })

  it('emits the toggled value from the reuse checkbox in both directions', () => {
    const clickReuseCheckbox = (): void => {
      const reuseLabel = [...(current?.container.querySelectorAll('label') ?? [])].find((label) =>
        label.textContent?.includes('Reuse branch')
      )
      const checkbox = reuseLabel?.querySelector<HTMLInputElement>('input[type="checkbox"]')
      expect(checkbox).toBeTruthy()
      act(() => checkbox?.click())
    }

    // Checked -> unchecked (opting out of reuse).
    const offChanges: boolean[] = []
    current = renderCard({
      canReuseSelectedBranch: true,
      reuseSelectedBranch: true,
      onReuseSelectedBranchChange: (next) => offChanges.push(next)
    })
    clickReuseCheckbox()
    expect(offChanges).toEqual([false])

    unmountCurrent()

    // Unchecked -> checked (opting into reuse — the action that pins the branch).
    const onChanges: boolean[] = []
    current = renderCard({
      canReuseSelectedBranch: true,
      reuseSelectedBranch: false,
      onReuseSelectedBranchChange: (next) => onChanges.push(next)
    })
    clickReuseCheckbox()
    expect(onChanges).toEqual([true])
  })

  it('shows the setup startup policy toggle only when setup is available', () => {
    current = renderCard({
      advancedOpen: true,
      setupControlsEnabled: true,
      setupConfig: {
        source: 'yaml',
        command: '# defaultTabs[1]\npnpm dev',
        kind: 'default-tabs'
      }
    })
    expect(current.container.textContent).not.toContain(
      'Wait for setup to complete before starting agent'
    )

    unmountCurrent()

    current = renderCard({
      advancedOpen: true,
      setupControlsEnabled: true,
      setupConfig: pnpmInstallSetupConfig
    })
    expect(current.container.textContent).toContain(
      'Wait for setup to complete before starting agent'
    )
  })

  it('emits the setup startup policy toggle value when setup will run', () => {
    const changes: string[] = []
    current = renderCard({
      advancedOpen: true,
      setupControlsEnabled: true,
      resolvedSetupDecision: 'run',
      setupConfig: pnpmInstallSetupConfig,
      onSetupAgentStartupPolicyChange: (next) => changes.push(next)
    })

    const waitSwitch = findWaitSwitch(current.container)
    expect(waitSwitch).toBeTruthy()
    expect(waitSwitch?.disabled).toBe(false)
    act(() => waitSwitch?.click())
    expect(changes).toEqual(['wait-for-setup'])
  })

  it('disables the wait-for-setup toggle when setup is set to skip', () => {
    const changes: string[] = []
    current = renderCard({
      advancedOpen: true,
      setupControlsEnabled: true,
      resolvedSetupDecision: 'skip',
      setupConfig: pnpmInstallSetupConfig,
      onSetupAgentStartupPolicyChange: (next) => changes.push(next)
    })

    const waitSwitch = findWaitSwitch(current.container)
    expect(waitSwitch?.disabled).toBe(true)
    // Nothing to wait for when setup won't run — clicking is inert.
    act(() => waitSwitch?.click())
    expect(changes).toEqual([])
  })

  it('shows a git-only branch name field in Advanced and emits manual edits', () => {
    const changes: (string | undefined)[] = []
    current = renderCard({
      advancedOpen: false,
      branchesEnabled: true,
      branchNameOverride: 'feature/initial',
      onBranchNameOverrideChange: (next) => changes.push(next)
    })

    const branchInput = findInputByLabel(current.container, 'Branch name')
    expect(branchInput).toBeTruthy()
    expect(branchInput?.value).toBe('feature/initial')

    changeInputValue(branchInput as HTMLInputElement, 'feature/manual')

    expect(changes).toEqual(['feature/manual'])
  })

  it('omits the branch name field for non-git projects', () => {
    current = renderCard({
      advancedOpen: true,
      branchesEnabled: true,
      selectedRepoIsGit: false,
      branchNameOverride: 'feature/manual',
      onBranchNameOverrideChange: vi.fn()
    })

    expect(findInputByLabel(current.container, 'Branch name')).toBeNull()
  })

  it('omits the branch name field when a tracked work item is the source', () => {
    // Why: a PR/issue/MR/Linear source derives the branch itself (and a linked
    // GitHub PR re-resolves it at submit), so a manual override would be a
    // silently ignored control — the field is only for typed-name/base-branch.
    current = renderCard({
      advancedOpen: true,
      branchesEnabled: true,
      branchNameOverride: 'feature/manual',
      smartNameSelection: { kind: 'github-pr', label: '#42 Fix', url: 'https://example.com/pr/42' },
      onBranchNameOverrideChange: vi.fn()
    })

    expect(findInputByLabel(current.container, 'Branch name')).toBeNull()
  })

  it('keeps GitLab workspace and branch feature names independent', () => {
    const changes: (string | undefined)[] = []
    current = renderCard({
      advancedOpen: true,
      branchesEnabled: true,
      name: 'workspace-display',
      smartNameSelection: { kind: 'gitlab-issue', label: '#8 Log4j2.Schedule_调整' },
      linkedWorkItem: {
        provider: 'gitlab',
        type: 'issue',
        number: 8,
        title: 'Log4j2.Schedule_调整',
        url: 'https://gitlab.example.com/team/tool/-/issues/8'
      },
      onBranchNameOverrideChange: (next) => changes.push(next)
    })

    expect(findInputByLabel(current.container, 'Workspace name')?.value).toBe('workspace-display')
    const featureInput = findInputByLabel(current.container, 'Branch feature name')
    expect(featureInput?.value).toBe('')
    if (!featureInput) {
      throw new Error('Branch feature name input is missing')
    }
    changeInputValue(featureInput, 'New/功能?Name')
    expect(changes).toEqual(['New/功能?Name'])
    expect(findInputByLabel(current.container, 'Workspace name')?.value).toBe('workspace-display')
  })

  it('requires a feature name for a repository with the GitLab release workflow', () => {
    const repo = {
      id: 'repo-a',
      path: '/repo-a',
      displayName: 'Repo A',
      badgeColor: '#111111',
      addedAt: 0,
      gitLabPromotion: {
        developmentBranch: 'develop',
        testingBranch: 'develop-1',
        features: [],
        releases: []
      }
    }
    current = renderCard({ eligibleRepos: [repo], advancedOpen: true, branchesEnabled: true })

    expect(findInputByLabel(current.container, 'Branch feature name')).toBeTruthy()
    expect(findInputByLabel(current.container, 'Branch name')).toBeNull()
    const createButton = [...current.container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Create workspace')
    )
    expect(createButton?.disabled).toBe(true)
  })

  it('keeps the branch name field when creating from a base branch', () => {
    // Why: choosing a base branch still lets the user name their new branch.
    current = renderCard({
      advancedOpen: true,
      branchesEnabled: true,
      branchNameOverride: 'feature/manual',
      smartNameSelection: { kind: 'branch', label: 'main' },
      onBranchNameOverrideChange: vi.fn()
    })

    expect(findInputByLabel(current.container, 'Branch name')).toBeTruthy()
  })

  it('places the parent workspace picker immediately after the branch name field', () => {
    current = renderCard({
      advancedOpen: true,
      branchesEnabled: true
    })

    const nextField = findInputByLabel(current.container, 'Branch name')?.closest(
      'div.space-y-1'
    )?.nextElementSibling
    expect(nextField?.textContent).toMatch(/Parent worktree(?!.*Note)/)
    expect(nextField?.nextElementSibling?.textContent).toContain('Note')
  })

  it('does not disable folder workspace creation when only source lookup needs SSH', () => {
    current = renderCard({
      eligibleRepos: [
        { id: 'repo-a', displayName: 'Repo A', path: '/repo-a', connectionId: 'ssh-a' } as never
      ],
      repoBackedSearchRepos: sourceRepos as never,
      repoBackedSourcesDisabled: false
    })

    const createButton = [...current.container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Create workspace')
    )
    expect(createButton).toBeTruthy()
    expect(createButton?.hasAttribute('disabled')).toBe(false)
    expect(
      current.container
        .querySelector('[aria-label="workspace name"]')
        ?.getAttribute('data-repo-backed-sources-disabled')
    ).toBe('false')
  })
})

describe('NewWorkspaceComposerCard note sizing', () => {
  // Sizing is layout-driven (field-sizing) rather than a JS measure pass, and happy-dom
  // has no layout engine, so these assert the class contract that produces the growth.
  afterEach(() => {
    unmountCurrent()
    current = null
  })

  function findNoteTextarea(container: HTMLElement): HTMLTextAreaElement {
    const label = [...container.querySelectorAll('label')].find(
      (candidate) => candidate.textContent?.trim() === 'Note'
    )
    const textarea = label?.parentElement?.querySelector('textarea')
    expect(textarea).toBeTruthy()
    return textarea as HTMLTextAreaElement
  }

  it('sizes from the note value, so a PR prefill written straight to state still shows in full', () => {
    // #10575: the prefill never fires an input event, so nothing but the value can drive height.
    current = renderCard({
      advancedOpen: true,
      note: `PR #10575 — ${'a note title long enough to wrap over several lines '.repeat(3)}`
    })

    expect(findNoteTextarea(current.container).className).toContain('[field-sizing:content]')
  })

  it('keeps a note past the height cap readable instead of clipping it', () => {
    current = renderCard({ advancedOpen: true, note: 'a'.repeat(4000) })

    const { className } = findNoteTextarea(current.container)
    expect(className).toContain('max-h-40')
    expect(className).toContain('overflow-y-auto')
    expect(className).toContain('scrollbar-sleek')
    expect(className).not.toContain('overflow-hidden')
  })
})
