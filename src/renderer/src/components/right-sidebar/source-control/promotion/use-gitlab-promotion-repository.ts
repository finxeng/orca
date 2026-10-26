import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { getRepoExecutionHostId } from '../../../../../../shared/execution-host'
import type { GitLabPromotionWorkflow } from '../../../../../../shared/gitlab-promotion-workflow'
import type { Repo } from '../../../../../../shared/repo-types'

export function useGitLabPromotionRepository(
  repo: Repo,
  open: boolean,
  setError: (error: string) => void
) {
  const updateRepo = useAppStore((state) => state.updateRepo)
  const [projectName, setProjectName] = useState('')
  const repoHostId = getRepoExecutionHostId(repo)
  const repoArgs = useMemo(
    () => ({ repoPath: repo.path, repoId: repo.id, repoOwnerExecutionHostId: repoHostId }),
    [repo.path, repo.id, repoHostId]
  )

  useEffect(() => {
    if (!open) {
      return
    }
    let current = true
    void window.api.gl
      .releaseBranchInfo(repoArgs)
      .then((info) => {
        if (current) {
          setProjectName(info.projectName ?? '')
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
  }, [open, repoArgs, setError])

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

  return { repoArgs, projectName, save }
}
