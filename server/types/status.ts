export interface ServiceStatus {
  name: string
  status: 'running' | 'stopped' | 'error'
  url: string | null
  details: string | null
}
