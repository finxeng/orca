import { translate } from '@/i18n/i18n'
import type { GitLabWorkItemDetails } from '../../../../../../shared/gitlab-types'
import type {
  GitLabPromotionFeature,
  GitLabPromotionStage,
  GitLabPromotionStep,
  GitLabPromotionWorkflow,
  GitLabReleaseBranchInfo
} from '../../../../../../shared/gitlab-promotion-workflow'
import type { ExecutionHostId } from '../../../../../../shared/execution-host'

export type PromotionCreateRequest = {
  id: number
  branch: string
  stage: GitLabPromotionStage
  targetBranch: string
}

type RepoArgs = {
  repoPath: string
  repoId: string
  repoOwnerExecutionHostId: ExecutionHostId
}

type StageContext = {
  workflow: GitLabPromotionWorkflow
  feature: GitLabPromotionFeature | undefined
  branch: string
  headSha: string | null
  repoArgs: RepoArgs
  save: (workflow: GitLabPromotionWorkflow) => Promise<void>
}

export async function loadPromotionStageDetails(
  feature: GitLabPromotionFeature | undefined,
  repoArgs: RepoArgs
): Promise<{
  details: Partial<Record<GitLabPromotionStage, GitLabWorkItemDetails>>
  targetInfos: Partial<Record<GitLabPromotionStage, GitLabReleaseBranchInfo>>
}> {
  if (!feature) {
    return { details: {}, targetInfos: {} }
  }
  const entries = await Promise.all(
    (['development', 'testing', 'pre'] as const).map(async (stage) => {
      const step = feature.steps[stage]
      if (!step?.mrIid) {
        return { stage, detail: null, targetInfo: null }
      }
      const [detail, targetInfo] = await Promise.all([
        window.api.gl.workItemDetails({
          ...repoArgs,
          iid: step.mrIid,
          type: 'mr',
          includeReviewDetails: false
        }),
        window.api.gl.releaseBranchInfo({ ...repoArgs, branch: step.targetBranch })
      ])
      return { stage, detail, targetInfo }
    })
  )
  const details: Partial<Record<GitLabPromotionStage, GitLabWorkItemDetails>> = {}
  const targetInfos: Partial<Record<GitLabPromotionStage, GitLabReleaseBranchInfo>> = {}
  for (const entry of entries) {
    if (entry.detail) {
      details[entry.stage] = entry.detail
    }
    if (entry.targetInfo) {
      targetInfos[entry.stage] = entry.targetInfo
    }
  }
  return { details, targetInfos }
}

function saveFeature(
  workflow: GitLabPromotionWorkflow,
  branch: string,
  stage: GitLabPromotionStage,
  step: GitLabPromotionStep
): GitLabPromotionWorkflow {
  const previous = workflow.features.find((item) => item.branch === branch)
  const feature: GitLabPromotionFeature = { branch, steps: { ...previous?.steps, [stage]: step } }
  return {
    ...workflow,
    features: [...workflow.features.filter((item) => item.branch !== branch), feature]
  }
}

export async function createPromotionStageMR(
  context: StageContext & {
    stage: GitLabPromotionStage
    targetBranch: string
    issueNumbers: number[]
  }
): Promise<{ detail: GitLabWorkItemDetails | null; targetInfo: GitLabReleaseBranchInfo }> {
  const { workflow, feature, branch, headSha, repoArgs, save, stage, targetBranch } = context
  if (!headSha || !/^[0-9a-f]{40,64}$/.test(headSha)) {
    throw new Error(
      translate('gitlabPromotion.refreshGit', 'Refresh the workspace Git status first.')
    )
  }
  const previous =
    stage === 'testing'
      ? feature?.steps.development
      : stage === 'pre'
        ? feature?.steps.testing
        : null
  if (previous && previous.verifiedHeadSha !== headSha) {
    throw new Error(
      translate(
        'gitlabPromotion.revalidatePrevious',
        'The feature branch changed after its last validation. Validate the previous environment again.'
      )
    )
  }
  const review = await window.api.gl.createPromotionMR({
    ...repoArgs,
    source: branch,
    target: targetBranch,
    expectedSha: headSha,
    issueNumbers: context.issueNumbers
  })
  await save(
    saveFeature(workflow, branch, stage, {
      targetBranch,
      mrIid: review.number,
      mrUrl: review.url
    })
  )
  const [detail, targetInfo] = await Promise.all([
    window.api.gl.workItemDetails({
      ...repoArgs,
      iid: review.number,
      type: 'mr',
      includeReviewDetails: false
    }),
    window.api.gl.releaseBranchInfo({ ...repoArgs, branch: targetBranch })
  ])
  return { detail, targetInfo }
}

export async function verifyPromotionStage(
  context: StageContext & { stage: GitLabPromotionStage; verifier: string }
): Promise<{ detail: GitLabWorkItemDetails; targetInfo: GitLabReleaseBranchInfo }> {
  const { workflow, feature, branch, headSha, repoArgs, save, stage } = context
  const verifiedBy = context.verifier.trim()
  if (!verifiedBy) {
    throw new Error(translate('gitlabPromotion.enterVerifier', 'Enter a verifier.'))
  }
  const step = feature?.steps[stage]
  if (!step?.mrIid) {
    throw new Error(translate('gitlabPromotion.createMrFirst', 'Create the MR first.'))
  }
  const [detail, targetInfo] = await Promise.all([
    window.api.gl.workItemDetails({
      ...repoArgs,
      iid: step.mrIid,
      type: 'mr',
      includeReviewDetails: false
    }),
    window.api.gl.releaseBranchInfo({ ...repoArgs, branch: step.targetBranch })
  ])
  if (
    !detail ||
    detail.item.isCrossRepository ||
    detail.item.branchName !== branch ||
    detail.item.baseRefName !== step.targetBranch
  ) {
    throw new Error(
      translate('gitlabPromotion.mrBranchesChanged', 'The MR source or target branch changed.')
    )
  }
  if (detail.item.state !== 'merged' || !detail.headSha) {
    throw new Error(
      translate('gitlabPromotion.mrNotReady', 'The MR is not merged or its commit cannot be read.')
    )
  }
  if (!targetInfo.branchSha || targetInfo.pipelineStatus !== 'success') {
    throw new Error(
      translate(
        'gitlabPromotion.targetPipelineNotReady',
        'The target branch pipeline has not succeeded for its current commit.'
      )
    )
  }
  const verifiedTargetSha = targetInfo.branchSha
  if (headSha && detail.headSha !== headSha) {
    throw new Error(
      translate(
        'gitlabPromotion.branchChanged',
        'The workspace branch changed. Refresh the MR and validate again.'
      )
    )
  }
  let next = saveFeature(workflow, branch, stage, {
    ...step,
    verifiedHeadSha: detail.headSha,
    verifiedAt: Date.now(),
    verifiedBy
  })
  if (stage === 'pre') {
    next = {
      ...next,
      releases: next.releases.map((item) =>
        item.branch === step.targetBranch
          ? { ...item, verifiedSha: verifiedTargetSha, verifiedAt: Date.now(), verifiedBy }
          : item
      )
    }
  }
  await save(next)
  return { detail, targetInfo }
}
