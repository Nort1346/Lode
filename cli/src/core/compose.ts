const IMAGE_LINE = 'ghcr\\.io\\/nort1346\\/lode:'

const MASK_PATTERN = new RegExp(`^(\\s*(?:#\\s*)?)(image:\\s*${IMAGE_LINE})\\S+`, 'gm')
const TAG_PATTERN = new RegExp(`^(\\s*image:\\s*${IMAGE_LINE})\\S+`, 'gm')
const HAS_IMAGE_LINE = new RegExp(`^\\s*image:\\s*${IMAGE_LINE}`, 'm')

// Mask the lode image tag so tag-only differences never look like a changed file.
export function maskLodeImageTag(content: string): string {
  return content.replace(MASK_PATTERN, (_match, prefix: string, imagePart: string) => `${prefix}${imagePart}<version>`)
}

export function setLodeImageTag(content: string, tag: string): { content: string; changed: boolean } {
  if (!HAS_IMAGE_LINE.test(content)) return { content, changed: false }
  return { content: content.replace(TAG_PATTERN, (_match, prefix: string) => `${prefix}${tag}`), changed: true }
}
