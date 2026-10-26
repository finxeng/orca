export type GitLabPromotionStage = 'development' | 'testing' | 'pre'
export type GitLabReleaseBranchInfo = {
  defaultBranch: string
  defaultSha: string
  branchSha: string | null
  projectName?: string
  pipelineStatus?: string
  pipelineUrl?: string
}
export type GitLabPromotionMrResult = { number: number; url: string; headSha: string }
export type GitLabPromotionMrDetails = { title: string; description: string; draft: boolean }

export type GitLabPromotionStep = {
  targetBranch: string
  mrIid?: number
  mrUrl?: string
  verifiedHeadSha?: string
  verifiedAt?: number
  verifiedBy?: string
}

export type GitLabPromotionFeature = {
  branch: string
  steps: Partial<Record<GitLabPromotionStage, GitLabPromotionStep>>
}

export type GitLabPromotionRelease = {
  branch: string
  baseSha?: string
  verifiedSha?: string
  verifiedAt?: number
  verifiedBy?: string
  tag?: string
}

export type GitLabPromotionWorkflow = {
  developmentBranch: string
  testingBranch: string
  releases: GitLabPromotionRelease[]
  features: GitLabPromotionFeature[]
}

const VALID_REF = /^(?!\/|.*(?:\.\.|\/\/|@\{|\\))[A-Za-z0-9._/-]+(?<![./])$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isValidPromotionRef(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 180 &&
    VALID_REF.test(value) &&
    !value.split('/').some((part) => !part || part.startsWith('.') || part.endsWith('.lock'))
  )
}

export function normalizeGitLabPromotionWorkflow(
  value: unknown
): GitLabPromotionWorkflow | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const record = value
  if (
    typeof record.developmentBranch !== 'string' ||
    !isValidPromotionRef(record.developmentBranch) ||
    typeof record.testingBranch !== 'string' ||
    !isValidPromotionRef(record.testingBranch) ||
    record.developmentBranch === record.testingBranch ||
    !Array.isArray(record.features) ||
    !Array.isArray(record.releases)
  ) {
    return undefined
  }
  const features: GitLabPromotionFeature[] = []
  for (const candidate of record.features) {
    if (!isRecord(candidate)) {
      return undefined
    }
    const item = candidate
    if (
      typeof item.branch !== 'string' ||
      !isValidPromotionRef(item.branch) ||
      !item.steps ||
      typeof item.steps !== 'object' ||
      Array.isArray(item.steps)
    ) {
      return undefined
    }
    const rawSteps = item.steps
    if (!isRecord(rawSteps)) {
      return undefined
    }
    const steps: GitLabPromotionFeature['steps'] = {}
    for (const stage of ['development', 'testing', 'pre'] as const) {
      const raw = rawSteps[stage]
      if (raw === undefined) {
        continue
      }
      if (!isRecord(raw)) {
        return undefined
      }
      const step = raw
      if (
        typeof step.targetBranch !== 'string' ||
        !isValidPromotionRef(step.targetBranch) ||
        (step.mrIid !== undefined && (!Number.isInteger(step.mrIid) || Number(step.mrIid) <= 0)) ||
        (step.mrUrl !== undefined && typeof step.mrUrl !== 'string') ||
        (step.verifiedHeadSha !== undefined &&
          (typeof step.verifiedHeadSha !== 'string' ||
            !/^[0-9a-f]{40,64}$/.test(step.verifiedHeadSha))) ||
        (step.verifiedAt !== undefined &&
          (typeof step.verifiedAt !== 'number' || !Number.isFinite(step.verifiedAt))) ||
        (step.verifiedBy !== undefined &&
          (typeof step.verifiedBy !== 'string' || step.verifiedBy.length > 100))
      ) {
        return undefined
      }
      steps[stage] = {
        targetBranch: step.targetBranch,
        ...(typeof step.mrIid === 'number' ? { mrIid: step.mrIid } : {}),
        ...(typeof step.mrUrl === 'string' ? { mrUrl: step.mrUrl } : {}),
        ...(typeof step.verifiedHeadSha === 'string'
          ? { verifiedHeadSha: step.verifiedHeadSha }
          : {}),
        ...(typeof step.verifiedAt === 'number' ? { verifiedAt: step.verifiedAt } : {}),
        ...(typeof step.verifiedBy === 'string' ? { verifiedBy: step.verifiedBy } : {})
      }
    }
    features.push({ branch: item.branch, steps })
  }
  const releases: GitLabPromotionRelease[] = []
  for (const candidate of record.releases) {
    if (!isRecord(candidate)) {
      return undefined
    }
    const item = candidate
    if (
      typeof item.branch !== 'string' ||
      !isValidPromotionRef(item.branch) ||
      (item.baseSha !== undefined &&
        (typeof item.baseSha !== 'string' || !/^[0-9a-f]{40,64}$/.test(item.baseSha))) ||
      (item.verifiedSha !== undefined &&
        (typeof item.verifiedSha !== 'string' || !/^[0-9a-f]{40,64}$/.test(item.verifiedSha))) ||
      (item.verifiedAt !== undefined &&
        (typeof item.verifiedAt !== 'number' || !Number.isFinite(item.verifiedAt))) ||
      (item.verifiedBy !== undefined &&
        (typeof item.verifiedBy !== 'string' || item.verifiedBy.length > 100)) ||
      (item.tag !== undefined && (typeof item.tag !== 'string' || !isValidPromotionRef(item.tag)))
    ) {
      return undefined
    }
    releases.push({
      branch: item.branch,
      ...(typeof item.baseSha === 'string' ? { baseSha: item.baseSha } : {}),
      ...(typeof item.verifiedSha === 'string' ? { verifiedSha: item.verifiedSha } : {}),
      ...(typeof item.verifiedAt === 'number' ? { verifiedAt: item.verifiedAt } : {}),
      ...(typeof item.verifiedBy === 'string' ? { verifiedBy: item.verifiedBy } : {}),
      ...(typeof item.tag === 'string' ? { tag: item.tag } : {})
    })
  }
  if (
    features.length > 1000 ||
    releases.length > 200 ||
    new Set(features.map((item) => item.branch)).size !== features.length ||
    new Set(releases.map((item) => item.branch)).size !== releases.length
  ) {
    return undefined
  }
  return {
    developmentBranch: record.developmentBranch,
    testingBranch: record.testingBranch,
    features,
    releases
  }
}

const RELEASE_DESCRIPTION = /^[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*$/

export function promotionReleaseBranch(version: string, description: string): string | null {
  if (
    !/^\d+\.\d+\.\d+$/.test(version) ||
    description.length > 48 ||
    !RELEASE_DESCRIPTION.test(description)
  ) {
    return null
  }
  return `release-v${version}-${description}`
}

export function promotionReleaseVersion(branch: string): string | null {
  const match = /^release-(v\d+\.\d+\.\d+)-(.+)$/.exec(branch)
  return match && match[2].length <= 48 && RELEASE_DESCRIPTION.test(match[2]) ? match[1] : null
}

export function promotionTagName(projectName: string, releaseBranch: string): string | null {
  const version = promotionReleaseVersion(releaseBranch)
  if (!version || !RELEASE_DESCRIPTION.test(projectName)) {
    return null
  }
  return `${projectName.toLowerCase()}-tag-${version}`
}
