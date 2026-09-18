/** Database backend for Lode. */
export type DbDriver = 'sqlite' | 'postgres'

/** Lode image tag. */
export type LodeTag = 'latest' | 'nightly'

/** Whether a service runs as a local container or an external instance. */
export type ServiceMode = 'local' | 'external'

/** Media server backend for library detection. */
export type MediaProvider = 'jellyfin' | 'none'

/** Deployment mode for the media server. */
export type MediaMode = 'local' | 'external' | 'none'

/** Compose files shipped with the repo (base + per-service overlays). */
export type ComposeFileName =
  | 'docker-compose.yml'
  | 'docker-compose.postgres.yml'
  | 'docker-compose.qbittorrent.yml'
  | 'docker-compose.prowlarr.yml'
  | 'docker-compose.jellyfin.yml'
  | 'docker-compose.flaresolverr.yml'
  | 'docker-compose.dozzle.yml'

/** User selection persisted in .lode-setup so re-runs can prefill prompts. */
export interface SetupSelection {
  dbDriver: DbDriver
  imageTag: LodeTag
  qbittorrent: ServiceMode
  prowlarr: ServiceMode
  mediaProvider: MediaProvider
  mediaMode: MediaMode
  flaresolverr: boolean
  dozzle: boolean
}

/** URLs for externally hosted services (only meaningful when the mode is external). */
export interface ExternalUrls {
  qbittorrent: string
  prowlarr: string
  jellyfin: string
}

/** Mutable context threaded through every setup step. */
export interface StepContext {
  /** True when a .lode-setup state file existed before this run. */
  stateFound: boolean
  /** Selection loaded from the state file before this run's prompts (drives deselection cleanup). */
  previousSelection: SetupSelection | null
  selection: SetupSelection
  urls: ExternalUrls
  composeFiles: ComposeFileName[]
  /** qBittorrent temporary password extracted from logs (local mode only). */
  qbitTempPass: string
  /** Admin password extracted from lode logs after first start. */
  adminPass: string
}

/** An option for select-style prompts. */
export interface PromptOption<T extends string = string> {
  value: T
  label: string
  hint?: string
}

/** Result of an external process run. */
export interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

/** A row in the final services summary table. */
export interface SummaryRow {
  label: string
  value: string
  /** http(s) values are rendered as OSC 8 hyperlinks. */
  url?: string
}
