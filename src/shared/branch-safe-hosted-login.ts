const MAX_BRANCH_SAFE_LOGIN_LENGTH = 255

/** A hosted login occupies one Git ref path segment. */
export function isBranchSafeHostedLogin(value: string): boolean {
  if (value.length > MAX_BRANCH_SAFE_LOGIN_LENGTH) {
    return false
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    return false
  }
  return !value.includes('..') && !value.endsWith('.') && !value.endsWith('.lock')
}
