import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, vi, type Mock } from 'vitest'
import NewWorkspaceComposerCard from './NewWorkspaceComposerCard'
import type { NewWorkspaceProjectOption } from '@/lib/new-workspace-project-options'
import type { ProjectHostSetupOption } from '@/lib/project-host-setup-options'

const storeMocks = vi.hoisted(() => ({
  closeModal: vi.fn(),
  openModal: vi.fn(),
  openSettingsPage: vi.fn(),
  openSettingsTarget: vi.fn(),
  setRuntimeEnvironmentStatus: vi.fn()
}))

const apiMocks = vi.hoisted(() => ({
  runtimeGetStatus: vi.fn(),
  sshConnect: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        closeModal: storeMocks.closeModal,
        openModal: storeMocks.openModal,
        openSettingsPage: storeMocks.openSettingsPage,
        openSettingsTarget: storeMocks.openSettingsTarget,
        setRuntimeEnvironmentStatus: storeMocks.setRuntimeEnvironmentStatus,
        activeModal: 'none',
        settings: { defaultTuiAgent: null, disabledTuiAgents: [] },
        updateSettings: vi.fn(),
        projects: [],
        repos: []
      }),
    {
      getState: () => ({
        setRuntimeEnvironmentStatus: storeMocks.setRuntimeEnvironmentStatus
      })
    }
  )
}))

vi.mock('@/components/contextual-tours/use-contextual-tour', () => ({
  useContextualTour: vi.fn()
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

vi.mock('@/components/agent/AgentCombobox', () => ({
  default: () => <button type="button">Agent picker</button>
}))

// Stub the host-add dialog to its `mode` — the composer's job is to open it with the right
// mode; the dialog's own SSH/runtime IPC has separate coverage.
vi.mock('@/components/sidebar/AddRemoteHostDialog', () => ({
  AddRemoteHostDialog: ({ mode }: { mode: 'ssh' | 'server' | null }) =>
    mode ? <div data-testid="add-remote-host-dialog" data-mode={mode} /> : null
}))

vi.mock('@/components/new-workspace/SetProjectLocationDialog', () => ({
  SetProjectLocationDialog: () => null
}))

vi.mock('@/components/sparse/SparseCheckoutPresetSelect', () => ({
  default: ({ onEditingChange }: { onEditingChange?: (editing: boolean) => void }) => (
    <div data-testid="sparse-select">
      <button onClick={() => onEditingChange?.(true)}>Begin preset</button>
    </div>
  )
}))

vi.mock('@/components/new-workspace/SmartWorkspaceNameField', () => ({
  default: ({
    branchesEnabled,
    repoBackedSourcesDisabled,
    repoBackedSearchRepos = []
  }: {
    branchesEnabled?: boolean
    repoBackedSourcesDisabled?: boolean
    repoBackedSearchRepos?: { displayName: string }[]
  }) => (
    <input
      aria-label="workspace name"
      data-branches-enabled={branchesEnabled ? 'true' : 'false'}
      data-repo-backed-search-count={repoBackedSearchRepos.length}
      data-repo-backed-search-names={repoBackedSearchRepos
        .map((repo) => repo.displayName)
        .join(',')}
      data-repo-backed-sources-disabled={repoBackedSourcesDisabled ? 'true' : 'false'}
    />
  )
}))

vi.mock('@/components/new-workspace/ProjectCombobox', () => ({
  default: ({
    options,
    value,
    onValueChange
  }: {
    options: NewWorkspaceProjectOption[]
    value: string | null
    onValueChange: (value: string) => void
  }) => (
    <div data-testid="project-combobox" data-project-combobox-root="true" data-value={value ?? ''}>
      {options.map((option) => (
        <button key={option.id} type="button" onClick={() => onValueChange(option.id)}>
          {option.displayName}
        </button>
      ))}
    </div>
  )
}))

export const composerStoreMocks: {
  closeModal: Mock
  openModal: Mock
  openSettingsPage: Mock
  openSettingsTarget: Mock
  setRuntimeEnvironmentStatus: Mock
} = storeMocks
export const composerApiMocks: { runtimeGetStatus: Mock; sshConnect: Mock } = apiMocks

export function setupComposerTestEnvironment(): void {
  ;(window as unknown as { api: unknown }).api = {
    runtimeEnvironments: { getStatus: apiMocks.runtimeGetStatus },
    ssh: { connect: apiMocks.sshConnect }
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
}

const projectOptions: NewWorkspaceProjectOption[] = [
  {
    kind: 'project-group',
    id: 'project-group:platform',
    projectGroupId: 'platform',
    displayName: 'Platform',
    badgeColor: 'var(--muted-foreground)',
    detail: '/workspace/platform',
    parentPath: '/workspace/platform',
    connectionId: null
  }
]

export const sourceRepos = [
  {
    id: 'repo-a',
    displayName: 'Repo A',
    path: '/repo-a',
    badgeColor: '#111111'
  },
  {
    id: 'repo-b',
    displayName: 'Repo B',
    path: '/repo-b',
    badgeColor: '#222222'
  }
]

export const localReadyHostOption: ProjectHostSetupOption = {
  kind: 'ready',
  id: 'setup-local',
  projectId: 'project-group:platform',
  hostId: 'local',
  repoId: 'repo-a',
  label: 'Local Mac',
  detail: 'Orca',
  path: '/Users/alice/orca'
}

export const devboxNeedsSetupHostOption: ProjectHostSetupOption = {
  kind: 'needs-setup',
  id: 'needs-setup:ssh:devbox',
  projectId: 'project-group:platform',
  hostId: 'ssh:devbox',
  label: 'Devbox',
  detail: 'Project location not set',
  isAvailable: true,
  attention: false,
  canSetLocation: true
}

function makeDisconnectedHostOption(targetId: string, label: string): ProjectHostSetupOption {
  return {
    kind: 'needs-setup',
    id: `needs-setup:ssh:${targetId}`,
    projectId: 'project-group:platform',
    hostId: `ssh:${targetId}`,
    label,
    detail: 'Connect this host to set up projects',
    isAvailable: false,
    attention: false,
    canSetLocation: false,
    connectAction: { kind: 'ssh', targetId }
  }
}

export const disconnectedDevboxNeedsSetupHostOption = makeDisconnectedHostOption('devbox', 'Devbox')
export const disconnectedBastionNeedsSetupHostOption = makeDisconnectedHostOption(
  'bastion',
  'Bastion'
)

export const pnpmInstallSetupConfig = {
  source: 'yaml' as const,
  command: 'pnpm install',
  kind: 'setup' as const
}

export const vmRecipeHostOptions: ProjectHostSetupOption[] = [
  localReadyHostOption,
  {
    kind: 'ready',
    id: 'setup-builder',
    projectId: 'project-group:platform',
    hostId: 'ssh:builder',
    repoId: 'repo-a',
    label: 'Builder',
    detail: 'Orca',
    path: '/workspace/orca'
  }
]

export function findConnectButton(label: string): HTMLButtonElement | undefined {
  const item = findRunTargetItem(label)
  return [...(item?.querySelectorAll('button') ?? [])].find((button) =>
    button.textContent?.includes('Connect')
  )
}

export function renderCard(
  overrides: Partial<React.ComponentProps<typeof NewWorkspaceComposerCard>> = {}
) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <NewWorkspaceComposerCard
        quickAgent={null}
        onQuickAgentChange={() => {}}
        eligibleRepos={[]}
        repoId="repo-a"
        projectOptions={projectOptions}
        selectedProjectId="project-group:platform"
        selectedRepoIsGit
        onRepoChange={() => {}}
        onProjectChange={() => {}}
        primaryActionLabel="Create workspace"
        name=""
        onNameValueChange={() => {}}
        onSmartGitHubItemSelect={() => {}}
        onSmartGitLabItemSelect={() => {}}
        onSmartBranchSelect={() => {}}
        onSmartLinearIssueSelect={() => {}}
        smartNameSelection={null}
        onClearSmartNameSelection={() => {}}
        canReuseSelectedBranch={false}
        reuseSelectedBranch={false}
        onReuseSelectedBranchChange={() => {}}
        branchNameOverride=""
        onBranchNameOverrideChange={() => {}}
        parentWorktreeId={null}
        onParentWorktreeIdChange={() => {}}
        forkPushWarning={null}
        detectedAgentIds={null}
        onOpenAgentSettings={() => {}}
        advancedOpen={false}
        onToggleAdvanced={() => {}}
        createDisabled={false}
        projectError={null}
        creating={false}
        onCreate={() => {}}
        note=""
        onNoteChange={() => {}}
        setupConfig={null}
        requiresExplicitSetupChoice={false}
        setupDecision={null}
        onSetupDecisionChange={() => {}}
        setupAgentStartupPolicy="start-immediately"
        onSetupAgentStartupPolicyChange={() => {}}
        shouldWaitForSetupCheck={false}
        resolvedSetupDecision={null}
        createError={null}
        selectedRepoConnectionId={null}
        selectedRepoSshStatus={null}
        selectedRepoRequiresConnection={false}
        selectedRepoConnectInProgress={false}
        onConnectSelectedRepo={async () => {}}
        canUseSparseCheckout={false}
        sparsePresets={[]}
        sparseSelectedPresetId={null}
        onSparseSelectPreset={() => {}}
        branchesEnabled={false}
        setupControlsEnabled={false}
        sparseControlsEnabled={false}
        {...overrides}
      />
    )
  })
  return { container, root }
}

export function findInputByLabel(
  container: HTMLElement,
  labelText: string
): HTMLInputElement | null {
  const label = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent?.trim() === labelText
  )
  const labelledId = label?.getAttribute('for')
  if (labelledId) {
    return document.getElementById(labelledId) as HTMLInputElement | null
  }
  return label?.parentElement?.querySelector<HTMLInputElement>('input') ?? null
}

export function changeInputValue(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  act(() => {
    valueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

export function openRunTargetPicker(container: HTMLElement): void {
  // The field is the search box; clicking its shell focuses it and opens the list.
  const runTargetShell = container.querySelector<HTMLElement>(
    'div[data-run-target-combobox-root="true"]'
  )
  expect(runTargetShell).toBeTruthy()
  act(() => runTargetShell?.click())
}

export function findRunTargetItem(label: string): HTMLElement | undefined {
  // Rows are listbox options; "Add host" is the pinned footer row (also an option).
  return [
    ...document.body.querySelectorAll<HTMLElement>('[role="option"], [data-run-target-add-host]')
  ].find((item) => item.textContent?.includes(label))
}

export function findWaitSwitch(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(
    '[role="switch"][aria-label="Wait for setup to complete before starting agent"]'
  )
}
