// @vitest-environment happy-dom

import { act } from 'react'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  composerApiMocks as apiMocks,
  composerStoreMocks as storeMocks,
  localReadyHostOption,
  devboxNeedsSetupHostOption,
  disconnectedDevboxNeedsSetupHostOption,
  disconnectedBastionNeedsSetupHostOption,
  vmRecipeHostOptions,
  findConnectButton,
  renderCard,
  openRunTargetPicker,
  findRunTargetItem,
  setupComposerTestEnvironment
} from './new-workspace-composer-card-test-fixture'

let current: { container: HTMLDivElement; root: Root } | null = null

function unmountCurrent(): void {
  act(() => current?.root.unmount())
  current?.container.remove()
}

describe('NewWorkspaceComposerCard run target picker', () => {
  beforeEach(setupComposerTestEnvironment)

  afterEach(() => {
    unmountCurrent()
    current = null
    vi.clearAllMocks()
  })

  it('shows setup-needed hosts in the run target picker when one setup is ready', () => {
    current = renderCard({
      projectHostSetupOptions: [localReadyHostOption, devboxNeedsSetupHostOption],
      selectedProjectHostSetupId: 'setup-local'
    })

    expect(current.container.textContent).toContain('Run on')
    openRunTargetPicker(current.container)

    const devboxItem = findRunTargetItem('Devbox')
    expect(devboxItem?.textContent).not.toContain('Project location not set')
    expect(devboxItem?.textContent).toContain('Set project location')
    // Not-connected rows stay highlightable (never `disabled`) so they hover like
    // the other rows; they're quieted visually instead.
    expect(devboxItem?.hasAttribute('data-disabled')).toBe(false)
    expect(devboxItem?.getAttribute('role')).toBe('option')
  })

  it('shows the run target picker for one ready setup so hosts can be added', () => {
    current = renderCard({
      projectHostSetupOptions: [localReadyHostOption],
      selectedProjectHostSetupId: 'setup-local'
    })

    expect(current.container.textContent).toContain('Run on')
    openRunTargetPicker(current.container)
    expect(findRunTargetItem('Add host')).toBeTruthy()
  })

  it('does not select setup-needed run target rows', () => {
    const hostChanges: string[] = []
    current = renderCard({
      projectHostSetupOptions: [localReadyHostOption, devboxNeedsSetupHostOption],
      selectedProjectHostSetupId: 'setup-local',
      onProjectHostSetupChange: (setupId) => hostChanges.push(setupId)
    })

    openRunTargetPicker(current.container)
    const devboxItem = findRunTargetItem('Devbox')
    expect(devboxItem).toBeTruthy()
    act(() => devboxItem?.click())

    expect(hostChanges).toEqual([])
  })

  it('connects disconnected setup-needed SSH hosts without selecting them', async () => {
    const hostChanges: string[] = []
    current = renderCard({
      projectHostSetupOptions: [localReadyHostOption, disconnectedDevboxNeedsSetupHostOption],
      selectedProjectHostSetupId: 'setup-local',
      onProjectHostSetupChange: (setupId) => hostChanges.push(setupId)
    })

    openRunTargetPicker(current.container)
    const devboxItem = findRunTargetItem('Devbox')
    expect(devboxItem).toBeTruthy()
    const connectButton = [...(devboxItem?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes('Connect')
    )
    expect(connectButton).toBeTruthy()

    await act(async () => {
      connectButton?.click()
    })

    expect(apiMocks.sshConnect).toHaveBeenCalledWith({ targetId: 'devbox' })
    expect(hostChanges).toEqual([])
    // The picker stays open so the connecting state is visible; the row is not auto-selected.
    expect(findRunTargetItem('Devbox')).toBeTruthy()
  })

  it('keeps other hosts connectable while one connect is still in flight', async () => {
    // First host's connect never resolves — a stalled connect must not disable the others.
    apiMocks.sshConnect.mockImplementation(({ targetId }: { targetId: string }) =>
      targetId === 'devbox' ? new Promise(() => {}) : Promise.resolve(undefined)
    )
    current = renderCard({
      projectHostSetupOptions: [
        localReadyHostOption,
        disconnectedDevboxNeedsSetupHostOption,
        disconnectedBastionNeedsSetupHostOption
      ],
      selectedProjectHostSetupId: 'setup-local'
    })

    openRunTargetPicker(current.container)
    await act(async () => {
      findConnectButton('Devbox')?.click()
    })

    // The picker stays open through the connect, so the state is inspectable in place.
    // Devbox is mid-connect: disabled, showing the connecting indicator; Bastion stays clickable.
    const devboxButton = findConnectButton('Devbox')
    expect(devboxButton?.disabled).toBe(true)
    expect(devboxButton?.textContent).toContain('Connecting')
    const bastionButton = findConnectButton('Bastion')
    expect(bastionButton?.disabled).toBe(false)
    expect(bastionButton?.textContent).toContain('Connect')

    await act(async () => {
      bastionButton?.click()
    })
    expect(apiMocks.sshConnect).toHaveBeenCalledWith({ targetId: 'bastion' })
  })

  it('stops the connecting indicator when the connect fails', async () => {
    // A failed connect must clear the spinner and restore the Connect button so the user
    // can retry — the row can't stay stuck on "Connecting" after the error.
    apiMocks.sshConnect.mockRejectedValue(new Error('connection refused'))
    current = renderCard({
      projectHostSetupOptions: [localReadyHostOption, disconnectedDevboxNeedsSetupHostOption],
      selectedProjectHostSetupId: 'setup-local'
    })

    openRunTargetPicker(current.container)
    await act(async () => {
      findConnectButton('Devbox')?.click()
    })

    const devboxButton = findConnectButton('Devbox')
    expect(devboxButton?.disabled).toBe(false)
    expect(devboxButton?.textContent).toContain('Connect')
    expect(devboxButton?.textContent).not.toContain('Connecting')
  })

  it('opens the SSH host add dialog over the composer without leaving for Settings', () => {
    current = renderCard({
      projectHostSetupOptions: [localReadyHostOption, devboxNeedsSetupHostOption],
      selectedProjectHostSetupId: 'setup-local'
    })

    openRunTargetPicker(current.container)
    act(() => findRunTargetItem('Add host')?.click())
    act(() => findRunTargetItem('Add SSH host')?.click())

    const dialog = document.body.querySelector('[data-testid="add-remote-host-dialog"]')
    expect(dialog?.getAttribute('data-mode')).toBe('ssh')
    // The composer stays put — no navigation that would discard the in-progress form.
    expect(storeMocks.closeModal).not.toHaveBeenCalled()
    expect(storeMocks.openSettingsPage).not.toHaveBeenCalled()
    expect(storeMocks.openSettingsTarget).not.toHaveBeenCalled()
  })

  it('opens the add-host submenu on hover without a click', () => {
    current = renderCard({
      projectHostSetupOptions: [localReadyHostOption, devboxNeedsSetupHostOption],
      selectedProjectHostSetupId: 'setup-local'
    })

    openRunTargetPicker(current.container)
    const addHost = findRunTargetItem('Add host')
    expect(addHost).toBeTruthy()
    // Hovering the row (no click) opens its submenu so it feels like a menu.
    // Hover arms rows via mousemove, matching the project picker.
    act(() => {
      addHost?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    })

    expect(findRunTargetItem('Add SSH host')).toBeTruthy()
    expect(findRunTargetItem('Add Remote Orca Server')).toBeTruthy()
  })

  it('opens the remote Orca server add dialog over the composer without leaving for Settings', () => {
    current = renderCard({
      projectHostSetupOptions: [localReadyHostOption, devboxNeedsSetupHostOption],
      selectedProjectHostSetupId: 'setup-local'
    })

    openRunTargetPicker(current.container)
    act(() => findRunTargetItem('Add host')?.click())
    act(() => findRunTargetItem('Add Remote Orca Server')?.click())

    const dialog = document.body.querySelector('[data-testid="add-remote-host-dialog"]')
    expect(dialog?.getAttribute('data-mode')).toBe('server')
    expect(storeMocks.closeModal).not.toHaveBeenCalled()
    expect(storeMocks.openSettingsPage).not.toHaveBeenCalled()
    expect(storeMocks.openSettingsTarget).not.toHaveBeenCalled()
  })

  it('shows VM recipes inside the run target picker', () => {
    const hostChanges: string[] = []
    const recipeChanges: (string | null)[] = []
    current = renderCard({
      projectHostSetupOptions: vmRecipeHostOptions,
      selectedProjectHostSetupId: 'setup-local',
      onProjectHostSetupChange: (setupId) => hostChanges.push(setupId),
      ephemeralVmRecipes: [
        {
          id: 'vercel',
          name: 'Vercel Sandbox',
          create: './scripts/orca-vm/vercel.start.sh',
          destroy: './scripts/orca-vm/vercel.cleanup.sh',
          destroyDisabled: false
        }
      ] as never,
      onEphemeralVmRecipeChange: (recipeId) => recipeChanges.push(recipeId)
    })

    expect(current.container.textContent).toContain('Run on')
    expect(current.container.textContent).not.toContain('VM recipe')

    openRunTargetPicker(current.container)

    expect(document.body.textContent).toContain('Per-Workspace Environment')
    const ephemeralVmItem = [
      ...document.body.querySelectorAll<HTMLElement>('[role="option"]')
    ].find((item) => item.textContent?.includes('Per-Workspace Environment'))
    expect(ephemeralVmItem).toBeTruthy()
    act(() => ephemeralVmItem?.click())

    const recipeItem = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (item) => item.textContent?.includes('Vercel Sandbox')
    )
    expect(recipeItem).toBeTruthy()
    act(() => recipeItem?.click())

    expect(recipeChanges).toEqual(['vercel'])
    expect(hostChanges).toEqual([])
  })

  it('clears the selected VM recipe when an existing host is selected', () => {
    const hostChanges: string[] = []
    const recipeChanges: (string | null)[] = []
    current = renderCard({
      projectHostSetupOptions: vmRecipeHostOptions,
      selectedProjectHostSetupId: 'setup-local',
      onProjectHostSetupChange: (setupId) => hostChanges.push(setupId),
      ephemeralVmRecipes: [
        {
          id: 'vercel',
          name: 'Vercel Sandbox',
          create: './scripts/orca-vm/vercel.start.sh',
          destroyDisabled: true
        }
      ] as never,
      selectedEphemeralVmRecipeId: 'vercel',
      onEphemeralVmRecipeChange: (recipeId) => recipeChanges.push(recipeId)
    })

    const runTargetShell = current.container.querySelector<HTMLElement>(
      'div[data-run-target-combobox-root="true"]'
    )
    expect(runTargetShell?.textContent).toContain('Per-Workspace Environment')
    openRunTargetPicker(current.container)

    const builderItem = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (item) => item.textContent?.includes('Builder')
    )
    expect(builderItem).toBeTruthy()
    act(() => builderItem?.click())

    expect(hostChanges).toEqual(['["setup-builder","ssh:builder"]'])
    expect(recipeChanges).toEqual([null])
  })
})
