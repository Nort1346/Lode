export interface ServiceRuntimeStatus {
  name: string
  status: 'running' | 'stopped' | 'error'
  url: string | null
  details: string | null
}
