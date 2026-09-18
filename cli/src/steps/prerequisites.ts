import { DOCS_LINKS } from '../constants'
import { checkDaemon, composeVersion, dockerVersion } from '../core/docker'
import { SetupFailure } from '../core/errors'
import { run } from '../core/exec'
import { hyperlink } from '../core/hyperlink'
import { log, stepHeader, withSpinner } from '../core/prompt'

function dockerInstallHints(): string[] {
  switch (process.platform) {
    case 'darwin':
      return ['  Install Docker Desktop for macOS:', `    ${hyperlink(DOCS_LINKS.dockerMac)}`]
    case 'win32':
      return ['  Install Docker Desktop for Windows (WSL2 backend):', `    ${hyperlink(DOCS_LINKS.dockerWindows)}`]
    default:
      return ['  Install Docker Engine for Linux:', `    ${hyperlink(DOCS_LINKS.dockerLinux)}`]
  }
}

async function daemonHints(permissionDenied: boolean): Promise<string[]> {
  switch (process.platform) {
    case 'darwin':
      return ['  Start Docker Desktop and try again.']
    case 'win32':
      return ['  Start Docker Desktop (WSL2 backend) and try again.']
    default: {
      if (!permissionDenied) return ['  Start the daemon:  sudo systemctl start docker']
      const user = (await run('sh', ['-c', 'id -un'])).stdout.trim()
      const groupLine = (await run('sh', ['-c', 'getent group docker 2>/dev/null'])).stdout
      const members = groupLine.split(':')[3]?.split(',') ?? []
      const groups = (await run('sh', ['-c', 'id -nG'])).stdout.trim().split(/\s+/)
      if (user && members.includes(user) && !groups.includes('docker')) {
        // Group membership is re-evaluated at login, so a session opened before the
        // usermod cannot see the docker group until it re-logs.
        return [
          '  You are in the docker group, but this session predates the change.',
          '  Log out and back in, or run:  newgrp docker'
        ]
      }
      return [
        '  The error looks like a permission problem - add your user to the docker group:',
        `    sudo usermod -aG docker ${user || 'YOUR_USER'}   (then log out and back in)`
      ]
    }
  }
}

export async function checkPrerequisites(): Promise<void> {
  stepHeader(1, 'Checking prerequisites')

  const version = await withSpinner('Checking Docker...', dockerVersion)
  if (version === null) throw new SetupFailure('Docker is not installed.', dockerInstallHints())
  log.success(`Docker ${version}`)

  const daemon = await withSpinner('Checking Docker daemon...', checkDaemon)
  if (!daemon.reachable) {
    throw new SetupFailure('Docker daemon is not running or not reachable from this shell.', [
      ...daemon.errorLines.map((line) => `    ${line}`),
      ...(await daemonHints(daemon.permissionDenied))
    ])
  }
  log.success('Docker daemon running')

  const compose = await withSpinner('Checking Docker Compose...', composeVersion)
  if (compose === null) {
    throw new SetupFailure('Docker Compose plugin is not installed.', [
      '  macOS/Windows: install or update Docker Desktop',
      `    ${hyperlink(DOCS_LINKS.dockerGeneric)}`,
      '  Linux: install the Docker Compose plugin',
      `    ${hyperlink(DOCS_LINKS.composeLinux)}`
    ])
  }
  log.success(`Docker Compose ${compose}`)
}
