// Injected at compile time via `bun build --define BUILD_VERSION='"<tag>"'`.
declare const BUILD_VERSION: string

export const VERSION: string = typeof BUILD_VERSION === 'string' ? BUILD_VERSION : 'dev'
