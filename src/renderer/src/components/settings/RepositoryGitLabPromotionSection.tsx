import { useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import type { Repo } from '../../../../shared/repo-types'
import { isValidPromotionRef } from '../../../../shared/gitlab-promotion-workflow'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { GitLabPromotionDialog } from '../right-sidebar/source-control/promotion/GitLabPromotionDialog'
import { getRepositoryPromotionSectionId } from './repository-settings-targets'

export function RepositoryGitLabPromotionSection({
  repo,
  updateRepo
}: {
  repo: Repo
  updateRepo: (
    repoId: string,
    updates: { gitLabPromotion: Repo['gitLabPromotion'] }
  ) => void | Promise<boolean>
}) {
  const [developmentBranch, setDevelopmentBranch] = useState(
    repo.gitLabPromotion?.developmentBranch ?? 'develop'
  )
  const [testingBranch, setTestingBranch] = useState(
    repo.gitLabPromotion?.testingBranch ?? 'develop-1'
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [releaseOpen, setReleaseOpen] = useState(false)
  const valid =
    isValidPromotionRef(developmentBranch) &&
    isValidPromotionRef(testingBranch) &&
    developmentBranch !== testingBranch

  const save = async () => {
    if (!valid) {
      return
    }
    setSaving(true)
    setError('')
    try {
      const workflow = {
        developmentBranch,
        testingBranch,
        features: repo.gitLabPromotion?.features ?? [],
        releases: repo.gitLabPromotion?.releases ?? []
      }
      const result = await updateRepo(repo.id, { gitLabPromotion: workflow })
      if (result === false) {
        setError(translate('gitlabPromotion.saveFailed', 'Could not save the release workflow.'))
      } else {
        const stored = useAppStore
          .getState()
          .repos.find(
            (candidate) =>
              candidate.id === repo.id &&
              getRepoExecutionHostId(candidate) === getRepoExecutionHostId(repo)
          )?.gitLabPromotion
        if (JSON.stringify(stored) !== JSON.stringify(workflow)) {
          setError(
            translate(
              'gitlabPromotion.upgradeServer',
              'The server did not save this workflow. Update Orca Server and retry.'
            )
          )
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id={getRepositoryPromotionSectionId(repo.id)} className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">
          {translate('gitlabPromotion.settingsTitle', 'GitLab release workflow')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate(
            'gitlabPromotion.settingsDescription',
            'Promote feature branches through development, testing, and Pre.'
          )}
        </p>
      </div>
      <div className="space-y-1">
        <label htmlFor={`promotion-development-${repo.id}`} className="text-sm font-medium">
          {translate('gitlabPromotion.developmentBranch', 'Development branch')}
        </label>
        <Input
          id={`promotion-development-${repo.id}`}
          value={developmentBranch}
          onChange={(event) => setDevelopmentBranch(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`promotion-testing-${repo.id}`} className="text-sm font-medium">
          {translate('gitlabPromotion.testingBranch', 'Testing branch')}
        </label>
        <Input
          id={`promotion-testing-${repo.id}`}
          value={testingBranch}
          onChange={(event) => setTestingBranch(event.target.value)}
        />
      </div>
      {!valid ? (
        <p className="text-xs text-destructive">
          {translate('gitlabPromotion.invalidBranches', 'Enter two different valid branch names.')}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button size="sm" disabled={!valid || saving} onClick={() => void save()}>
          {saving
            ? translate('gitlabPromotion.saving', 'Saving…')
            : translate('gitlabPromotion.save', 'Save workflow')}
        </Button>
        {repo.gitLabPromotion ? (
          <Button size="sm" variant="outline" onClick={() => setReleaseOpen(true)}>
            {translate('gitlabPromotion.manageRelease', 'Manage releases')}
          </Button>
        ) : null}
      </div>
      <GitLabPromotionDialog
        repo={repo}
        branch={null}
        headSha={null}
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
      />
    </section>
  )
}
