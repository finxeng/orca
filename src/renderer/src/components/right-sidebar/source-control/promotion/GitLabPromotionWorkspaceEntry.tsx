import { useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { GitUpstreamStatus } from '../../../../../../shared/git-status-types'
import type { GitLabPromotionStage } from '../../../../../../shared/gitlab-promotion-workflow'
import type { Repo } from '../../../../../../shared/repo-types'
import { GitLabPromotionDialog } from './GitLabPromotionDialog'

const STAGES: GitLabPromotionStage[] = ['development', 'testing', 'pre']
const EMPTY_ISSUE_NUMBERS: number[] = []

export function GitLabPromotionWorkspaceEntry({
  repo,
  branch,
  headSha,
  hasUncommittedChanges,
  upstreamStatus,
  issueNumbers = EMPTY_ISSUE_NUMBERS
}: {
  repo: Repo
  branch: string
  headSha: string | null
  hasUncommittedChanges: boolean
  upstreamStatus?: GitUpstreamStatus
  issueNumbers?: number[]
}) {
  const [open, setOpen] = useState(false)
  const [createRequest, setCreateRequest] = useState<{
    id: number
    branch: string
    stage: GitLabPromotionStage
    targetBranch: string
  } | null>(null)
  const workflow = repo.gitLabPromotion
  if (!workflow) {
    return null
  }
  const isFeature = branch.startsWith('feature-')
  const isRelease = branch.startsWith('release-v')
  if (!isFeature && !isRelease) {
    return null
  }

  const feature = workflow.features.find((item) => item.branch === branch)
  const currentStage = STAGES.find(
    (stage) => !headSha || feature?.steps[stage]?.verifiedHeadSha !== headSha
  )
  const stageLabels = {
    development: translate('gitlabPromotion.stageDevelopment', 'Development'),
    testing: translate('gitlabPromotion.stageTesting', 'Testing'),
    pre: translate('gitlabPromotion.stagePre', 'Pre')
  }
  const recordedRelease = feature?.steps.pre?.targetBranch
  const releaseTarget =
    recordedRelease && workflow.releases.some((item) => item.branch === recordedRelease)
      ? recordedRelease
      : (workflow.releases.at(-1)?.branch ?? '')
  const targetBranch =
    currentStage === 'development'
      ? workflow.developmentBranch
      : currentStage === 'testing'
        ? workflow.testingBranch
        : currentStage === 'pre'
          ? releaseTarget
          : ''
  const currentStep = currentStage ? feature?.steps[currentStage] : undefined
  const recordedStep = currentStep?.targetBranch === targetBranch ? currentStep : undefined
  const mrUrl = recordedStep?.mrUrl
  const stale = Boolean(recordedStep?.verifiedHeadSha && recordedStep.verifiedHeadSha !== headSha)
  const existingMr = Boolean(recordedStep?.mrIid && !stale)
  const priorStage = currentStage ? STAGES[STAGES.indexOf(currentStage) - 1] : undefined
  const priorVerified = !priorStage || feature?.steps[priorStage]?.verifiedHeadSha === headSha
  const readyToCreate = Boolean(
    isFeature &&
    currentStage &&
    targetBranch &&
    !existingMr &&
    priorVerified &&
    headSha &&
    /^[0-9a-f]{40,64}$/.test(headSha) &&
    !hasUncommittedChanges &&
    upstreamStatus?.hasUpstream &&
    upstreamStatus.ahead === 0
  )
  const status = !currentStage
    ? translate('gitlabPromotion.complete', 'Complete')
    : existingMr
      ? translate('gitlabPromotion.mrRecorded', 'MR !{{number}} recorded', {
          number: recordedStep?.mrIid ?? 0
        })
      : stale
        ? translate('gitlabPromotion.staleVerification', 'Verification is out of date')
        : hasUncommittedChanges
          ? translate('gitlabPromotion.waitingForCommitPush', 'Waiting for commit and push')
          : !upstreamStatus?.hasUpstream
            ? translate('gitlabPromotion.publishFeatureBranch', 'Publish the feature branch')
            : upstreamStatus.ahead > 0
              ? translate('gitlabPromotion.pushFeatureBranch', 'Push the feature branch')
              : !priorVerified
                ? translate('gitlabPromotion.verifyPreviousStage', 'Verify the previous stage')
                : !targetBranch
                  ? translate('gitlabPromotion.selectRelease', 'Select release')
                  : translate('gitlabPromotion.awaitingMr', 'Awaiting MR')

  const openCreate = () => {
    if (!currentStage || !targetBranch || !readyToCreate) {
      return
    }
    setCreateRequest((previous) => ({
      id: (previous?.id ?? 0) + 1,
      branch,
      stage: currentStage,
      targetBranch
    }))
    setOpen(true)
  }

  return (
    <>
      {isFeature ? (
        <section
          className="border-b border-border px-4 py-4"
          aria-label={translate('gitlabPromotion.promotion', 'Promotion')}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold">
              {translate('gitlabPromotion.promotion', 'Promotion')}
            </h2>
            <Button variant="link" size="xs" onClick={() => setOpen(true)}>
              {translate('gitlabPromotion.viewFullWorkflow', 'View full workflow')}
            </Button>
          </div>
          <div
            className="mt-4 flex items-center gap-2"
            aria-label={translate(
              'gitlabPromotion.promotionStages',
              'Development, testing, and Pre'
            )}
          >
            {STAGES.map((stage, index) => {
              const verified = Boolean(
                headSha && feature?.steps[stage]?.verifiedHeadSha === headSha
              )
              const active = stage === currentStage
              return (
                <div key={stage} className="flex min-w-0 flex-1 items-center gap-2 text-2xs">
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${verified ? 'border-primary bg-primary text-primary-foreground' : active ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground'}`}
                  >
                    {verified ? <Check className="size-2.5" aria-hidden="true" /> : index + 1}
                  </span>
                  <span
                    className={active ? 'font-medium text-foreground' : 'text-muted-foreground'}
                  >
                    {stageLabels[stage]}
                  </span>
                  {index < STAGES.length - 1 ? (
                    <span className="h-px min-w-2 flex-1 bg-border" aria-hidden="true" />
                  ) : null}
                </div>
              )
            })}
          </div>
          <div className="mt-4 rounded-lg border border-border bg-card px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium">
                {currentStage
                  ? translate('gitlabPromotion.stageMr', '{{stage}} MR', {
                      stage: stageLabels[currentStage]
                    })
                  : translate('gitlabPromotion.allStagesVerified', 'All environments verified')}
              </h3>
              <span className="text-2xs text-muted-foreground">{status}</span>
            </div>
            {currentStage ? (
              <>
                <div className="mt-3 flex min-w-0 items-center gap-1.5 text-2xs">
                  <span
                    className="min-w-0 max-w-[70%] truncate rounded bg-muted px-1.5 py-1 font-mono"
                    title={branch}
                  >
                    {branch}
                  </span>
                  <ArrowRight
                    className="size-3 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span
                    className="min-w-0 truncate rounded bg-muted px-1.5 py-1 font-mono font-medium"
                    title={targetBranch}
                  >
                    {targetBranch || translate('gitlabPromotion.selectRelease', 'Select release')}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
                  <p className="min-w-0 flex-1 text-2xs leading-relaxed text-muted-foreground">
                    {existingMr
                      ? translate(
                          'gitlabPromotion.openMrForStatus',
                          'Open the MR or view validation details.'
                        )
                      : translate(
                          'gitlabPromotion.localChangesNotInMr',
                          'Local changes are not included in the MR. Commit and push first.'
                        )}
                  </p>
                  {existingMr && mrUrl ? (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => void window.api.shell.openUrl(mrUrl)}
                    >
                      {translate('gitlabPromotion.viewMr', 'View MR')}
                    </Button>
                  ) : (
                    <Button size="xs" disabled={!readyToCreate} onClick={openCreate}>
                      {translate('gitlabPromotion.createMr', 'Create {{stage}} MR', {
                        stage: stageLabels[currentStage]
                      })}
                    </Button>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </section>
      ) : (
        <div className="mx-3 my-2 flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs font-medium">
              {translate('gitlabPromotion.release', 'Release')}
            </div>
            <div className="truncate text-xs text-muted-foreground">{branch}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            {translate('gitlabPromotion.viewDetails', 'View details')}
          </Button>
        </div>
      )}
      <GitLabPromotionDialog
        repo={repo}
        branch={isFeature ? branch : null}
        headSha={headSha}
        open={open}
        onOpenChange={setOpen}
        createRequest={createRequest}
        issueNumbers={issueNumbers}
      />
    </>
  )
}
