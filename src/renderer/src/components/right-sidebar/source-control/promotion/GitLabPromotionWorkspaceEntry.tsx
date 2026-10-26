import { useState } from 'react'
import { ArrowRight, Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { getRepoExecutionHostId } from '../../../../../../shared/execution-host'
import type { GitUpstreamStatus } from '../../../../../../shared/git-status-types'
import type { GitLabPromotionStage } from '../../../../../../shared/gitlab-promotion-workflow'
import type { Repo } from '../../../../../../shared/repo-types'
import { getRepositoryPromotionSectionId } from '../../../settings/repository-settings-targets'
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
  const [expanded, setExpanded] = useState(true)
  const [createRequest, setCreateRequest] = useState<{
    id: number
    branch: string
    stage: GitLabPromotionStage
    targetBranch: string
  } | null>(null)
  const workflow = repo.gitLabPromotion
  const isFeature = branch.startsWith('feature-')
  const isRelease = branch.startsWith('release-v')
  if (!workflow && isFeature) {
    return (
      <section
        className="border-b border-border px-4 py-3"
        aria-label={translate('gitlabPromotion.promotion', 'Promotion')}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-xs font-semibold">
              {translate('gitlabPromotion.promotion', 'Promotion')}
            </h2>
            <p className="text-2xs text-muted-foreground">
              {translate(
                'gitlabPromotion.configureHint',
                'Configure Dev, Test, and Pre branches to start promotion.'
              )}
            </p>
          </div>
          <Button
            variant="outline"
            size="xs"
            onClick={() =>
              useAppStore.getState().openSettingsTarget({
                pane: 'repo',
                repoId: repo.id,
                hostId: getRepoExecutionHostId(repo),
                sectionId: getRepositoryPromotionSectionId(repo.id)
              })
            }
          >
            {translate('gitlabPromotion.configure', 'Configure')}
          </Button>
        </div>
      </section>
    )
  }
  if (!workflow) {
    return null
  }
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
      : (workflow.releases.findLast((item) => !item.tag)?.branch ?? '')
  const targetBranch =
    currentStage === 'development'
      ? workflow.developmentBranch
      : currentStage === 'testing'
        ? workflow.testingBranch
        : currentStage === 'pre'
          ? releaseTarget
          : ''
  const currentStep = currentStage ? feature?.steps[currentStage] : undefined
  const release = workflow.releases.find((item) => item.branch === recordedRelease)
  const preVerified = Boolean(headSha && feature?.steps.pre?.verifiedHeadSha === headSha)
  const tagComplete = Boolean(preVerified && release?.tag)
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
    (currentStage !== 'pre' ||
      !workflow.releases.some((item) => item.branch === targetBranch && item.tag)) &&
    !existingMr &&
    priorVerified &&
    headSha &&
    /^[0-9a-f]{40,64}$/.test(headSha) &&
    !hasUncommittedChanges &&
    upstreamStatus?.hasUpstream &&
    upstreamStatus.ahead === 0
  )
  const status = !currentStage
    ? tagComplete
      ? translate('gitlabPromotion.complete', 'Complete')
      : translate('gitlabPromotion.awaitingTag', 'Awaiting release tag')
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

  const openFullWorkflow = () => {
    setCreateRequest(null)
    setOpen(true)
  }

  return (
    <>
      {isFeature ? (
        <Collapsible open={expanded} onOpenChange={setExpanded} asChild>
          <section
            className="border-b border-border px-4 pb-3"
            aria-label={translate('gitlabPromotion.promotion', 'Promotion')}
          >
            <CollapsibleTrigger variant="row">
              <span className="flex min-w-0 items-center gap-2">
                <span className="font-semibold">
                  {translate('gitlabPromotion.promotion', 'Promotion')}
                </span>
                <span className="truncate text-2xs font-normal text-muted-foreground">
                  {status}
                </span>
              </span>
              <ChevronDown
                className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div
                className="flex items-start gap-1.5"
                aria-label={translate(
                  'gitlabPromotion.promotionStages',
                  'Development, testing, Pre, and tag'
                )}
              >
                {([...STAGES, 'tag'] as const).map((stage, index) => {
                  const verified =
                    stage === 'tag'
                      ? tagComplete
                      : Boolean(headSha && feature?.steps[stage]?.verifiedHeadSha === headSha)
                  const active = stage === (currentStage ?? 'tag') && !verified
                  const label =
                    stage === 'tag'
                      ? translate('gitlabPromotion.tagStage', 'Tag')
                      : stageLabels[stage]
                  return (
                    <div key={stage} className="flex min-w-0 flex-1 items-start gap-1.5">
                      <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-2xs">
                        <span
                          className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${verified ? 'border-primary text-primary' : active ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground'}`}
                        >
                          {verified ? <Check className="size-3" aria-hidden="true" /> : index + 1}
                        </span>
                        <span
                          className={
                            active ? 'font-medium text-foreground' : 'text-muted-foreground'
                          }
                        >
                          {label}
                        </span>
                      </div>
                      {index < STAGES.length ? (
                        <span className="mt-2.5 h-px min-w-1 flex-1 bg-border" aria-hidden="true" />
                      ) : null}
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                <span className="font-medium">
                  {currentStage
                    ? translate('gitlabPromotion.stageMr', '{{stage}} MR', {
                        stage: stageLabels[currentStage]
                      })
                    : translate('gitlabPromotion.releaseTag', 'Release tag')}
                </span>
                <Button variant="link" size="xs" onClick={openFullWorkflow}>
                  {translate('gitlabPromotion.viewFullWorkflow', 'View full workflow')}
                </Button>
              </div>
              {currentStage ? (
                <>
                  <div className="mt-1 flex min-w-0 items-center gap-1 text-2xs text-muted-foreground">
                    <span className="min-w-0 truncate font-mono" title={branch}>
                      {branch}
                    </span>
                    <ArrowRight className="size-3 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 truncate font-mono" title={targetBranch}>
                      {targetBranch || translate('gitlabPromotion.selectRelease', 'Select release')}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="min-w-0 text-2xs text-muted-foreground">
                      {priorStage
                        ? translate(
                            'gitlabPromotion.priorStage',
                            'Previous: {{stage}} {{status}}',
                            {
                              stage: stageLabels[priorStage],
                              status: priorVerified
                                ? translate('gitlabPromotion.verifiedShort', 'verified')
                                : translate('gitlabPromotion.pending', 'Pending')
                            }
                          )
                        : translate('gitlabPromotion.firstStage', 'First stage')}
                    </span>
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
              ) : (
                <p className="mt-1 text-2xs text-muted-foreground">
                  {release?.tag
                    ? release.tag
                    : translate(
                        'gitlabPromotion.tagFromRelease',
                        'Create the tag from the release workflow after Pre validation.'
                      )}
                </p>
              )}
            </CollapsibleContent>
          </section>
        </Collapsible>
      ) : (
        <div className="mx-3 my-2 flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs font-medium">
              {translate('gitlabPromotion.release', 'Release')}
            </div>
            <div className="truncate text-xs text-muted-foreground">{branch}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={openFullWorkflow}>
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
