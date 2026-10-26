import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../../../shared/repo-types'
import { GitLabPromotionWorkspaceEntry } from './GitLabPromotionWorkspaceEntry'

vi.mock('./GitLabPromotionDialog', () => ({ GitLabPromotionDialog: () => null }))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string | number>) =>
    fallback.replace(/{{(\w+)}}/g, (_match, name: string) => String(values?.[name] ?? ''))
}))

const headSha = 'a'.repeat(40)
const branch = 'feature-20261025-search-alice'
const repo: Repo = {
  id: 'repo',
  path: '/repo',
  displayName: 'repo',
  badgeColor: 'gray',
  addedAt: 0,
  gitLabPromotion: {
    developmentBranch: 'develop',
    testingBranch: 'develop-1',
    features: [],
    releases: []
  }
}

function renderEntry(hasUncommittedChanges: boolean, currentRepo = repo) {
  return renderToStaticMarkup(
    <GitLabPromotionWorkspaceEntry
      repo={currentRepo}
      branch={branch}
      headSha={headSha}
      hasUncommittedChanges={hasUncommittedChanges}
      upstreamStatus={{ hasUpstream: true, upstreamName: `origin/${branch}`, ahead: 0, behind: 0 }}
    />
  )
}

describe('GitLab promotion source control entry', () => {
  it('offers setup in Source Control when a feature repo has no saved workflow', () => {
    const markup = renderEntry(false, { ...repo, gitLabPromotion: undefined })
    expect(markup).toContain('Configure Dev, Test, and Pre branches')
    expect(markup).toContain('Configure')
  })

  it('shows the exact development MR target but blocks creation while local changes are pending', () => {
    const markup = renderEntry(true)
    expect(markup).toContain('develop')
    expect(markup).toContain('Waiting for commit and push')
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Create Development MR<\/button>/)
  })

  it('enables creation after the branch is clean and synced', () => {
    const markup = renderEntry(false)
    expect(markup).toContain('Create Development MR')
    expect(markup).toContain('Development, testing, Pre, and tag')
    expect(markup).toContain('Tag')
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>Create Development MR<\/button>/)
  })

  it('shows the release tag as the fourth step after Pre validation', () => {
    const currentRepo: Repo = {
      ...repo,
      gitLabPromotion: {
        ...repo.gitLabPromotion!,
        releases: [{ branch: 'release-v1.2.3-orderexport', verifiedSha: headSha }],
        features: [
          {
            branch,
            steps: {
              development: { targetBranch: 'develop', verifiedHeadSha: headSha },
              testing: { targetBranch: 'develop-1', verifiedHeadSha: headSha },
              pre: { targetBranch: 'release-v1.2.3-orderexport', verifiedHeadSha: headSha }
            }
          }
        ]
      }
    }
    expect(renderEntry(false, currentRepo)).toContain('Awaiting release tag')
    const taggedRepo: Repo = {
      ...currentRepo,
      gitLabPromotion: {
        ...currentRepo.gitLabPromotion!,
        releases: [
          { branch: 'release-v1.2.3-orderexport', verifiedSha: headSha, tag: 'repo-tag-v1.2.3' }
        ]
      }
    }
    expect(renderEntry(false, taggedRepo)).toContain('repo-tag-v1.2.3')
  })

  it('links an already recorded MR without offering a duplicate create action', () => {
    const currentRepo: Repo = {
      ...repo,
      gitLabPromotion: {
        ...repo.gitLabPromotion!,
        features: [
          {
            branch,
            steps: {
              development: {
                targetBranch: 'develop',
                mrIid: 23,
                mrUrl: 'https://gitlab.example/mr/23'
              }
            }
          }
        ]
      }
    }
    const markup = renderEntry(false, currentRepo)
    expect(markup).toContain('MR !23 recorded')
    expect(markup).toContain('View MR')
    expect(markup).not.toContain('Create Development MR')
  })
})
