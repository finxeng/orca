import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { getRepoExecutionHostId } from '../../../../../../shared/execution-host'
import {
  promotionReleaseBranch,
  type GitLabReleaseBranchInfo,
  type GitLabPromotionStage,
  type GitLabPromotionWorkflow
} from '../../../../../../shared/gitlab-promotion-workflow'
import type { GitLabWorkItemDetails } from '../../../../../../shared/gitlab-types'
import type { Repo } from '../../../../../../shared/repo-types'
import { GitLabPromotionStages } from './GitLabPromotionStages'
import { GitLabPromotionReleaseSection } from './GitLabPromotionReleaseSection'
import {
  createPromotionStageMR,
  loadPromotionStageDetails,
  verifyPromotionStage,
  type PromotionCreateRequest
} from './gitlab-promotion-stage-operations'

const EMPTY_ISSUE_NUMBERS: number[] = []

export function GitLabPromotionDialog({
  repo,
  branch,
  headSha,
  open,
  onOpenChange,
  createRequest,
  issueNumbers = EMPTY_ISSUE_NUMBERS
}: {
  repo: Repo
  branch: string | null
  headSha: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  createRequest?: PromotionCreateRequest | null
  issueNumbers?: number[]
}) {
  const workflow = repo.gitLabPromotion
  const updateRepo = useAppStore((state) => state.updateRepo)
  const [details, setDetails] = useState<
    Partial<Record<GitLabPromotionStage, GitLabWorkItemDetails>>
  >({})
  const [targetInfos, setTargetInfos] = useState<
    Partial<Record<GitLabPromotionStage, GitLabReleaseBranchInfo>>
  >({})
  const [releaseVersion, setReleaseVersion] = useState('0.0.0')
  const [pendingRelease, setPendingRelease] = useState<{
    branch: string
    info: GitLabReleaseBranchInfo
  } | null>(null)
  const [existingReleaseName, setExistingReleaseName] = useState('')
  const [selectedRelease, setSelectedRelease] = useState('')
  const [tagName, setTagName] = useState('')
  const [pendingTag, setPendingTag] = useState<{ branch: string; tag: string; sha: string } | null>(
    null
  )
  const [verifier, setVerifier] = useState('')
  const [busy, setBusy] = useState(false)
  const handledCreateRequest = useRef<number | null>(null)
  const [error, setError] = useState('')
  const feature = workflow?.features.find((item) => item.branch === branch)
  const releases = workflow?.releases ?? []
  const activeReleaseBranch =
    [selectedRelease, feature?.steps.pre?.targetBranch].find((candidate) =>
      releases.some((item) => item.branch === candidate)
    ) ??
    releases.at(-1)?.branch ??
    ''
  const release = releases.find((item) => item.branch === activeReleaseBranch)
  const repoHostId = getRepoExecutionHostId(repo)
  const repoArgs = useMemo(
    () => ({ repoPath: repo.path, repoId: repo.id, repoOwnerExecutionHostId: repoHostId }),
    [repo.path, repo.id, repoHostId]
  )

  const loadDetails = useCallback(
    () => loadPromotionStageDetails(feature, repoArgs),
    [feature, repoArgs]
  )

  useEffect(() => {
    if (!open || !branch || !feature) {
      return
    }
    let current = true
    void loadDetails()
      .then((loaded) => {
        if (current) {
          setDetails(loaded.details)
          setTargetInfos(loaded.targetInfos)
        }
      })
      .catch((cause) => {
        if (current) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      })
    return () => {
      current = false
    }
  }, [open, branch, feature, loadDetails])

  const save = useCallback(
    async (next: GitLabPromotionWorkflow) => {
      if (
        !(await updateRepo(
          repo.id,
          { gitLabPromotion: next },
          { hostId: getRepoExecutionHostId(repo) }
        ))
      ) {
        throw new Error(
          translate('gitlabPromotion.saveFailed', 'Could not save the release workflow.')
        )
      }
      const stored = useAppStore
        .getState()
        .repos.find(
          (candidate) =>
            candidate.id === repo.id && getRepoExecutionHostId(candidate) === repoHostId
        )?.gitLabPromotion
      if (JSON.stringify(stored) !== JSON.stringify(next)) {
        throw new Error(
          translate(
            'gitlabPromotion.upgradeServer',
            'The server did not save this workflow. Update Orca Server and retry.'
          )
        )
      }
    },
    [repo, repoHostId, updateRepo]
  )

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [])

  const createMR = useCallback(
    (stage: GitLabPromotionStage, targetBranch: string) =>
      void run(async () => {
        if (!workflow || !branch) {
          return
        }
        const { detail, targetInfo } = await createPromotionStageMR({
          workflow,
          feature,
          branch,
          headSha,
          repoArgs,
          save,
          stage,
          targetBranch,
          issueNumbers
        })
        setDetails((current) => ({ ...current, [stage]: detail ?? undefined }))
        setTargetInfos((current) => ({ ...current, [stage]: targetInfo }))
      }),
    [run, workflow, branch, feature, headSha, repoArgs, save, issueNumbers]
  )

  useEffect(() => {
    if (
      !open ||
      !createRequest ||
      createRequest.branch !== branch ||
      handledCreateRequest.current === createRequest.id
    ) {
      return
    }
    handledCreateRequest.current = createRequest.id
    createMR(createRequest.stage, createRequest.targetBranch)
  }, [open, createRequest, branch, createMR])

  const verify = (stage: GitLabPromotionStage) =>
    void run(async () => {
      if (!workflow || !branch) {
        return
      }
      const { detail, targetInfo } = await verifyPromotionStage({
        workflow,
        feature,
        branch,
        headSha,
        repoArgs,
        save,
        stage,
        verifier
      })
      setDetails((current) => ({ ...current, [stage]: detail }))
      setTargetInfos((current) => ({ ...current, [stage]: targetInfo }))
    })

  const prepareRelease = () =>
    void run(async () => {
      if (!workflow) {
        return
      }
      const name = promotionReleaseBranch(releaseVersion, new Date())
      if (!name) {
        throw new Error(
          translate('gitlabPromotion.invalidVersion', 'Use a version in 0.0.0 format.')
        )
      }
      const info = await window.api.gl.releaseBranchInfo({ ...repoArgs, branch: name })
      if (info.branchSha || workflow.releases.some((item) => item.branch === name)) {
        throw new Error(
          translate('gitlabPromotion.releaseExists', 'This release branch already exists.')
        )
      }
      setPendingRelease({ branch: name, info })
    })

  const createRelease = () =>
    void run(async () => {
      if (!workflow || !pendingRelease) {
        return
      }
      await window.api.gl.createReleaseBranch({
        ...repoArgs,
        branch: pendingRelease.branch,
        expectedDefaultSha: pendingRelease.info.defaultSha
      })
      await save({
        ...workflow,
        releases: [
          ...workflow.releases,
          { branch: pendingRelease.branch, baseSha: pendingRelease.info.defaultSha }
        ]
      })
      setSelectedRelease(pendingRelease.branch)
      setPendingRelease(null)
    })

  const importRelease = () =>
    void run(async () => {
      if (!workflow || !/^release-v\d+\.\d+\.\d+-\d{8}$/.test(existingReleaseName)) {
        throw new Error(
          translate('gitlabPromotion.invalidRelease', 'Enter a valid release branch name.')
        )
      }
      const info = await window.api.gl.releaseBranchInfo({
        ...repoArgs,
        branch: existingReleaseName
      })
      if (!info.branchSha) {
        throw new Error(
          translate(
            'gitlabPromotion.releaseMissing',
            'This release branch does not exist on GitLab.'
          )
        )
      }
      if (!workflow.releases.some((item) => item.branch === existingReleaseName)) {
        await save({
          ...workflow,
          releases: [...workflow.releases, { branch: existingReleaseName }]
        })
      }
      setSelectedRelease(existingReleaseName)
    })

  const createTag = () =>
    void run(async () => {
      if (
        !workflow ||
        !pendingTag ||
        release?.branch !== pendingTag.branch ||
        release.verifiedSha !== pendingTag.sha
      ) {
        return
      }
      const included = workflow.features.filter(
        (item) => item.steps.pre?.targetBranch === release.branch
      )
      if (included.length === 0 || included.some((item) => !item.steps.pre?.verifiedHeadSha)) {
        throw new Error(
          translate(
            'gitlabPromotion.validateAllFeatures',
            'Validate every included feature before tagging.'
          )
        )
      }
      await window.api.gl.createReleaseTag({
        ...repoArgs,
        branch: pendingTag.branch,
        tag: pendingTag.tag,
        expectedSha: pendingTag.sha
      })
      await save({
        ...workflow,
        releases: workflow.releases.map((item) =>
          item.branch === pendingTag.branch ? { ...item, tag: pendingTag.tag } : item
        )
      })
      setPendingTag(null)
    })

  if (!workflow) {
    return null
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" scrollable>
        <DialogHeader>
          <DialogTitle>
            {translate('gitlabPromotion.dialogTitle', 'GitLab promotion and release')}
          </DialogTitle>
          <DialogDescription>{branch ?? repo.displayName}</DialogDescription>
        </DialogHeader>
        {branch?.startsWith('feature-') ? (
          <GitLabPromotionStages
            workflow={workflow}
            feature={feature}
            headSha={headSha}
            activeReleaseBranch={activeReleaseBranch}
            details={details}
            targetInfos={targetInfos}
            busy={busy}
            verifier={verifier}
            onVerifierChange={setVerifier}
            onRefresh={() =>
              void run(async () => {
                const loaded = await loadDetails()
                setDetails(loaded.details)
                setTargetInfos(loaded.targetInfos)
              })
            }
            onCreateMR={createMR}
            onVerify={verify}
          />
        ) : null}
        <GitLabPromotionReleaseSection
          workflow={workflow}
          releases={releases}
          release={release}
          activeReleaseBranch={activeReleaseBranch}
          releaseVersion={releaseVersion}
          pendingRelease={pendingRelease}
          existingReleaseName={existingReleaseName}
          tagName={tagName}
          pendingTag={pendingTag}
          busy={busy}
          onReleaseVersionChange={(value) => {
            setReleaseVersion(value)
            setPendingRelease(null)
          }}
          onExistingReleaseNameChange={setExistingReleaseName}
          onTagNameChange={(value) => {
            setTagName(value)
            setPendingTag(null)
          }}
          onSelectedReleaseChange={(value) => {
            setSelectedRelease(value)
            setPendingTag(null)
          }}
          onPrepareRelease={prepareRelease}
          onConfirmCreateRelease={createRelease}
          onImportRelease={importRelease}
          onPrepareTag={(tag) => {
            if (release?.verifiedSha && /^v\d+\.\d+\.\d+$/.test(tag)) {
              setPendingTag({ branch: release.branch, tag, sha: release.verifiedSha })
            }
          }}
          onCreateTag={createTag}
        />
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
