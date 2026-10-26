import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import type {
  GitLabPromotionFeature,
  GitLabReleaseBranchInfo,
  GitLabPromotionStage,
  GitLabPromotionWorkflow
} from '../../../../../../shared/gitlab-promotion-workflow'
import type { GitLabWorkItemDetails } from '../../../../../../shared/gitlab-types'

const STAGES: GitLabPromotionStage[] = ['development', 'testing', 'pre']
export function GitLabPromotionStages({
  workflow,
  feature,
  headSha,
  activeReleaseBranch,
  details,
  targetInfos,
  busy,
  verifier,
  onVerifierChange,
  onRefresh,
  onCreateMR,
  onVerify
}: {
  workflow: GitLabPromotionWorkflow
  feature: GitLabPromotionFeature | undefined
  headSha: string | null
  activeReleaseBranch: string
  details: Partial<Record<GitLabPromotionStage, GitLabWorkItemDetails>>
  targetInfos: Partial<Record<GitLabPromotionStage, GitLabReleaseBranchInfo>>
  busy: boolean
  verifier: string
  onVerifierChange: (value: string) => void
  onRefresh: () => void
  onCreateMR: (stage: GitLabPromotionStage, targetBranch: string) => void
  onVerify: (stage: GitLabPromotionStage) => void
}) {
  return (
    <div className="space-y-4">
      <Button size="sm" variant="outline" disabled={busy} onClick={onRefresh}>
        {translate('gitlabPromotion.refreshMrs', 'Refresh MR status')}
      </Button>
      <Input
        aria-label={translate('gitlabPromotion.verifier', 'Verifier')}
        value={verifier}
        onChange={(event) => onVerifierChange(event.target.value)}
        placeholder={translate(
          'gitlabPromotion.verifierHint',
          'Verifier for environment validation'
        )}
      />
      {STAGES.map((stage, index) => {
        const label =
          stage === 'development'
            ? translate('gitlabPromotion.stageDevelopment', 'Development')
            : stage === 'testing'
              ? translate('gitlabPromotion.stageTesting', 'Testing')
              : translate('gitlabPromotion.stagePre', 'Pre')
        const targetBranch =
          stage === 'development'
            ? workflow.developmentBranch
            : stage === 'testing'
              ? workflow.testingBranch
              : activeReleaseBranch
        const recordedStep = feature?.steps[stage]
        const step = recordedStep?.targetBranch === targetBranch ? recordedStep : undefined
        const detail = step ? details[stage] : undefined
        const targetInfo = step ? targetInfos[stage] : undefined
        const mrUrl = step?.mrUrl
        const pipelineUrl = targetInfo?.pipelineUrl
        const targetPipelineStatus =
          targetInfo?.pipelineStatus === 'success'
            ? translate('gitlabPromotion.pipelineSuccess', 'Passed')
            : (targetInfo?.pipelineStatus ??
              translate('gitlabPromotion.pipelineMissing', 'No pipeline found'))
        const prior = index === 0 ? null : feature?.steps[STAGES[index - 1]]
        const canStart =
          (index === 0 || Boolean(prior?.verifiedHeadSha && prior.verifiedHeadSha === headSha)) &&
          (stage !== 'pre' ||
            workflow.releases.some((item) => item.branch === targetBranch && !item.tag))
        const verified = Boolean(step?.verifiedHeadSha && step.verifiedHeadSha === headSha)
        const stale = Boolean(step?.verifiedHeadSha && step.verifiedHeadSha !== headSha)
        const headMismatch = Boolean(
          step?.mrIid && detail?.headSha && headSha && detail.headSha !== headSha
        )
        return (
          <div key={stage} className="space-y-2 border-b border-border pb-4 last:border-0">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">
                {label}{' '}
                <span className="break-all font-normal text-muted-foreground">
                  → {targetBranch || translate('gitlabPromotion.selectRelease', 'Select release')}
                </span>
              </h3>
              <p className="text-xs text-muted-foreground">
                {stale
                  ? translate('gitlabPromotion.staleVerification', 'Verification is out of date')
                  : headMismatch
                    ? translate(
                        'gitlabPromotion.branchChanged',
                        'The workspace commit ({{localSha}}) differs from the GitLab MR source commit ({{mrSha}}). Sync the feature branch and refresh MR status.',
                        {
                          localSha: headSha?.slice(0, 8) ?? '',
                          mrSha: detail?.headSha?.slice(0, 8) ?? ''
                        }
                      )
                    : verified
                      ? translate('gitlabPromotion.verified', 'Verified {{sha}} · {{user}}', {
                          sha: step?.verifiedHeadSha?.slice(0, 8) ?? '',
                          user:
                            step?.verifiedBy ??
                            translate('gitlabPromotion.unknownVerifier', 'Unknown verifier')
                        })
                      : detail?.item.state === 'merged'
                        ? `${translate('gitlabPromotion.awaitingVerification', 'Merged, awaiting environment validation')} · ${targetBranch} ${translate('gitlabPromotion.pipeline', 'pipeline')}: ${targetPipelineStatus}${targetInfo?.branchSha ? ` (${targetInfo.branchSha.slice(0, 8)})` : ''}`
                        : step?.mrIid
                          ? `${translate('gitlabPromotion.mrNumber', 'MR !{{number}}', { number: step.mrIid })} · ${detail?.pipelineStatus ?? translate('gitlabPromotion.loading', 'Loading')}`
                          : translate('gitlabPromotion.awaitingMr', 'Awaiting MR')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!step?.mrIid || stale ? (
                <Button
                  size="sm"
                  disabled={busy || !canStart || !targetBranch}
                  onClick={() => onCreateMR(stage, targetBranch)}
                >
                  {stale
                    ? translate('gitlabPromotion.createNewMr', 'Create new {{stage}} MR', {
                        stage: label
                      })
                    : translate('gitlabPromotion.createMr', 'Create {{stage}} MR', {
                        stage: label
                      })}
                </Button>
              ) : null}
              {step?.mrIid && !verified && !stale ? (
                <Button
                  size="sm"
                  disabled={
                    busy ||
                    detail?.item.isCrossRepository ||
                    detail?.item.branchName !== feature?.branch ||
                    detail?.item.baseRefName !== targetBranch ||
                    detail?.item.state !== 'merged' ||
                    headMismatch ||
                    targetInfo?.pipelineStatus !== 'success' ||
                    !targetInfo?.branchSha ||
                    !verifier.trim()
                  }
                  onClick={() => onVerify(stage)}
                >
                  {translate('gitlabPromotion.recordVerification', 'Record environment validation')}
                </Button>
              ) : null}
              {mrUrl ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void window.api.shell.openUrl(mrUrl)}
                >
                  {translate('gitlabPromotion.viewMr', 'View MR')}
                </Button>
              ) : null}
              {detail?.item.state === 'merged' && pipelineUrl ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void window.api.shell.openUrl(pipelineUrl)}
                >
                  {translate('gitlabPromotion.viewPipeline', 'View pipeline')}
                </Button>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
