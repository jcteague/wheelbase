export function loadMassiveApiKey(): string {
  return process.env.MASSIVE_API_KEY ?? ''
}
