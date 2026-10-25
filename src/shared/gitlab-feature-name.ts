export function isValidGitLabFeatureName(value: string | null | undefined): boolean {
  return Boolean(value && value.length <= 48 && /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(value))
}
