import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import {
  promotionReleaseBranch,
  promotionReleaseVersion,
  promotionTagName,
  type GitLabPromotionMrDetails,
  type GitLabReleaseBranchInfo,
  type GitLabPromotionStage
} from '../../../../../../shared/gitlab-promotion-workflow'
import type { GitLabWorkItemDetails } from '../../../../../../shared/gitlab-types'
import type { Repo } from '../../../../../../shared/repo-types'
import { GitLabPromotionStages } from './GitLabPromotionStages'
import { GitLabPromotionReleaseSection } from './GitLabPromotionReleaseSection'
import { GitLabPromotionMrComposer } from './GitLabPromotionMrComposer'
import { useGitLabPromotionRepository } from './use-gitlab-promotion-repository'
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
  const [details, setDetails] = useState<
    Partial<Record<GitLabPromotionStage, GitLabWorkItemDetails>>
  >({})
  const [targetInfos, setTargetInfos] = useState<
    Partial<Record<GitLabPromotionStage, GitLabReleaseBranchInfo>>
  >({})
  const [releaseVersion, setReleaseVersion] = useState('0.0.0')
  const [releaseDescription, setReleaseDescription] = useState('')
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
  const nextCreateRequestId = useRef(0)
  const [composerRequest, setComposerRequest] = useState<PromotionCreateRequest | null>(
    open && createRequest?.branch === branch ? createRequest : null
  )
  const [error, setError] = useState('')
  const { repoArgs, projectName, save } = useGitLabPromotionRepository(repo, open, setError)
  const feature = workflow?.features.find((item) => item.branch === branch)
  const releases = workflow?.releases ?? []
  const activeReleaseBranch =
    [selectedRelease, feature?.steps.pre?.targetBranch].find((candidate) =>
      releases.some((item) => item.branch === candidate)
    ) ??
    releases.findLast((item) => !item.tag)?.branch ??
    ''
  const release = releases.find((item) => item.branch === activeReleaseBranch)
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

  useEffect(() => {
    if (open) {
      setComposerRequest(createRequest?.branch === branch ? createRequest : null)
    }
  }, [open, createRequest, branch])

  const openMRComposer = (stage: GitLabPromotionStage, targetBranch: string) => {
    nextCreateRequestId.current += 1
    setComposerRequest({
      id: nextCreateRequestId.current,
      branch: branch ?? '',
      stage,
      targetBranch
    })
  }

  const createMR = useCallback(
    (stage: GitLabPromotionStage, targetBranch: string, mrDetails: GitLabPromotionMrDetails) =>
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
          issueNumbers,
          details: mrDetails
        })
        setDetails((current) => ({ ...current, [stage]: detail ?? undefined }))
        setTargetInfos((current) => ({ ...current, [stage]: targetInfo }))
        setComposerRequest(null)
      }),
    [run, workflow, branch, feature, headSha, repoArgs, save, issueNumbers]
  )

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
      const name = promotionReleaseBranch(releaseVersion, releaseDescription)
      if (!name) {
        throw new Error(
          translate(
            'gitlabPromotion.invalidVersion',
            'Enter a version and an English release description.'
          )
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
      if (!workflow || !promotionReleaseVersion(existingReleaseName)) {
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
            {composerRequest
              ? translate('gitlabPromotion.confirmCreateMr', 'Create MR')
              : translate('gitlabPromotion.dialogTitle', 'GitLab promotion and release')}
          </DialogTitle>
          <DialogDescription>
            {composerRequest
              ? `${composerRequest.branch} → ${composerRequest.targetBranch}`
              : (branch ?? repo.displayName)}
          </DialogDescription>
        </DialogHeader>
        {composerRequest ? (
          <GitLabPromotionMrComposer
            key={composerRequest.id}
            source={composerRequest.branch}
            target={composerRequest.targetBranch}
            issueNumbers={issueNumbers}
            busy={busy}
            onCancel={() => setComposerRequest(null)}
            onCreate={(mrDetails) =>
              createMR(composerRequest.stage, composerRequest.targetBranch, mrDetails)
            }
          />
        ) : branch?.startsWith('feature-') ? (
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
            onCreateMR={openMRComposer}
            onVerify={verify}
          />
        ) : null}
        {!composerRequest ? (
          <GitLabPromotionReleaseSection
            workflow={workflow}
            releases={releases}
            release={release}
            activeReleaseBranch={activeReleaseBranch}
            releaseVersion={releaseVersion}
            releaseDescription={releaseDescription}
            projectName={projectName}
            pendingRelease={pendingRelease}
            existingReleaseName={existingReleaseName}
            tagName={tagName}
            pendingTag={pendingTag}
            busy={busy}
            onReleaseVersionChange={(value) => {
              setReleaseVersion(value)
              setPendingRelease(null)
            }}
            onReleaseDescriptionChange={(value) => {
              setReleaseDescription(value)
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
              if (release?.verifiedSha && tag === promotionTagName(projectName, release.branch)) {
                setPendingTag({ branch: release.branch, tag, sha: release.verifiedSha })
              }
            }}
            onCreateTag={createTag}
          />
        ) : null}
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
