import type { SourceControlActionId } from '../../../../shared/source-control-ai-actions'

export function getRepositoryLocalCommandsSectionId(repoId: string): string {
  return `repo-${repoId}-local-commands`
}

export function getRepositoryIconSectionId(repoId: string): string {
  return `repo-${repoId}-icon`
}

export function getRepositoryPromotionSectionId(repoId: string): string {
  return `repo-${repoId}-gitlab-promotion`
}

export function getRepositorySourceControlAiSectionId(repoId: string): string {
  return `repo-${repoId}-source-control-ai`
}

export function getRepositorySourceControlAiActionRecipeSectionId(
  repoId: string,
  actionId: SourceControlActionId
): string {
  return `repo-${repoId}-source-control-ai-${actionId}`
}
