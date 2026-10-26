import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import type {
  GitLabPromotionRelease,
  GitLabPromotionWorkflow,
  GitLabReleaseBranchInfo
} from '../../../../../../shared/gitlab-promotion-workflow'
import {
  promotionReleaseBranch,
  promotionReleaseVersion,
  promotionTagName
} from '../../../../../../shared/gitlab-promotion-workflow'

export function GitLabPromotionReleaseSection({
  workflow,
  releases,
  release,
  activeReleaseBranch,
  releaseVersion,
  releaseDescription,
  projectName,
  pendingRelease,
  existingReleaseName,
  tagName,
  pendingTag,
  busy,
  onReleaseVersionChange,
  onReleaseDescriptionChange,
  onExistingReleaseNameChange,
  onTagNameChange,
  onSelectedReleaseChange,
  onPrepareRelease,
  onConfirmCreateRelease,
  onImportRelease,
  onPrepareTag,
  onCreateTag
}: {
  workflow: GitLabPromotionWorkflow
  releases: GitLabPromotionRelease[]
  release: GitLabPromotionRelease | undefined
  activeReleaseBranch: string
  releaseVersion: string
  releaseDescription: string
  projectName: string
  pendingRelease: { branch: string; info: GitLabReleaseBranchInfo } | null
  existingReleaseName: string
  tagName: string
  pendingTag: { branch: string; tag: string; sha: string } | null
  busy: boolean
  onReleaseVersionChange: (value: string) => void
  onReleaseDescriptionChange: (value: string) => void
  onExistingReleaseNameChange: (value: string) => void
  onTagNameChange: (value: string) => void
  onSelectedReleaseChange: (value: string) => void
  onPrepareRelease: () => void
  onConfirmCreateRelease: () => void
  onImportRelease: () => void
  onPrepareTag: (tag: string) => void
  onCreateTag: () => void
}) {
  const included = release
    ? workflow.features.filter((item) => item.steps.pre?.targetBranch === release.branch)
    : []
  const suggestedTag = release ? (promotionTagName(projectName, release.branch) ?? '') : ''
  const selectedTag = tagName || suggestedTag
  const allIncludedVerified =
    included.length > 0 && included.every((item) => item.steps.pre?.verifiedHeadSha)
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">{translate('gitlabPromotion.release', 'Release')}</h3>
      <div className="flex gap-2">
        <Input
          aria-label={translate('gitlabPromotion.version', 'Version')}
          value={releaseVersion}
          onChange={(event) => onReleaseVersionChange(event.target.value)}
          placeholder="0.0.0"
        />
        <Button
          size="sm"
          disabled={busy || !promotionReleaseBranch(releaseVersion, releaseDescription)}
          onClick={onPrepareRelease}
        >
          {translate('gitlabPromotion.checkRelease', 'Check release')}
        </Button>
      </div>
      <Input
        aria-label={translate('gitlabPromotion.releaseDescription', 'Release description')}
        value={releaseDescription}
        onChange={(event) => onReleaseDescriptionChange(event.target.value)}
        placeholder={translate(
          'gitlabPromotion.releaseDescriptionHint',
          'English letters, numbers, dots, and hyphens'
        )}
      />
      {pendingRelease ? (
        <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3 text-xs">
          <div>
            {translate('gitlabPromotion.newBranch', 'New branch')}: {pendingRelease.branch}
          </div>
          <div>
            {translate('gitlabPromotion.base', 'Base')}: {pendingRelease.info.defaultBranch} @{' '}
            {pendingRelease.info.defaultSha.slice(0, 12)}
          </div>
          <Button size="sm" disabled={busy} onClick={onConfirmCreateRelease}>
            {translate('gitlabPromotion.confirmRelease', 'Create release branch')}
          </Button>
        </div>
      ) : null}
      <div className="flex gap-2">
        <Input
          aria-label={translate('gitlabPromotion.existingRelease', 'Existing release branch')}
          value={existingReleaseName}
          onChange={(event) => onExistingReleaseNameChange(event.target.value)}
          placeholder={translate(
            'gitlabPromotion.existingReleaseExample',
            'release-v0.0.0-orderexport'
          )}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !promotionReleaseVersion(existingReleaseName)}
          onClick={onImportRelease}
        >
          {translate('gitlabPromotion.addExisting', 'Add existing branch')}
        </Button>
      </div>
      <select
        aria-label={translate('gitlabPromotion.releaseBranch', 'Release branch')}
        value={activeReleaseBranch}
        onChange={(event) => onSelectedReleaseChange(event.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">{translate('gitlabPromotion.selectRelease', 'Select release')}</option>
        {releases.map((item) => (
          <option key={item.branch} value={item.branch}>
            {item.branch}
          </option>
        ))}
      </select>
      {release ? (
        <div className="space-y-2 text-xs text-muted-foreground">
          <div>
            {translate('gitlabPromotion.defaultBase', 'Default branch base')}:{' '}
            {release.baseSha
              ? release.baseSha.slice(0, 12)
              : translate('gitlabPromotion.unknownBase', 'Unknown for imported branch')}
          </div>
          <div>
            {translate('gitlabPromotion.preVerification', 'Pre validation')}:{' '}
            {release.verifiedSha
              ? release.verifiedSha.slice(0, 12)
              : translate('gitlabPromotion.pending', 'Pending')}
            {release.verifiedBy ? ` · ${release.verifiedBy}` : ''}
          </div>
          <div>
            {translate('gitlabPromotion.tagStage', 'Tag')}:{' '}
            {release.tag ?? translate('gitlabPromotion.notCreated', 'Not created')}
          </div>
          <div className="space-y-1">
            <div>{translate('gitlabPromotion.includedFeatures', 'Included features')}:</div>
            {included.length === 0 ? (
              <div>{translate('gitlabPromotion.noFeatureMrs', 'No feature MRs yet')}</div>
            ) : (
              included.map((item) => (
                <div key={item.branch} className="flex items-center justify-between gap-2">
                  <span className="truncate">{item.branch}</span>
                  <span>
                    {item.steps.pre?.verifiedHeadSha
                      ? translate('gitlabPromotion.validated', 'Validated')
                      : item.steps.pre?.mrIid
                        ? translate('gitlabPromotion.mrNumber', 'MR !{{number}}', {
                            number: item.steps.pre.mrIid
                          })
                        : translate('gitlabPromotion.awaitingMr', 'Awaiting MR')}
                  </span>
                </div>
              ))
            )}
          </div>
          {release.verifiedSha && !release.tag ? (
            <div className="flex gap-2">
              <Input
                aria-label={translate('gitlabPromotion.tagName', 'Tag name')}
                value={selectedTag}
                onChange={(event) => onTagNameChange(event.target.value)}
                placeholder={translate('gitlabPromotion.tagNameExample', 'project-tag-v0.0.0')}
              />
              <Button
                size="sm"
                disabled={
                  busy || !allIncludedVerified || !suggestedTag || selectedTag !== suggestedTag
                }
                onClick={() => onPrepareTag(selectedTag)}
              >
                {translate('gitlabPromotion.checkTag', 'Check tag')}
              </Button>
            </div>
          ) : null}
          {!allIncludedVerified && release.verifiedSha && !release.tag ? (
            <p>
              {translate(
                'gitlabPromotion.validateAllFeatures',
                'Validate every included feature before tagging.'
              )}
            </p>
          ) : null}
          {pendingTag?.branch === release.branch ? (
            <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
              <div>
                {translate('gitlabPromotion.tagStage', 'Tag')} {pendingTag.tag} →{' '}
                {pendingTag.sha.slice(0, 12)}
              </div>
              <Button size="sm" disabled={busy} onClick={onCreateTag}>
                {translate('gitlabPromotion.confirmTag', 'Create tag')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
