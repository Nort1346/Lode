// OSC 8 hyperlink: emitted unconditionally for http(s) URLs, deliberately
// independent of NO_COLOR (ECMA-48 terminals ignore unknown OSC sequences).
// Uses the BEL terminator (\u0007), not ST (\u001b\\): fast-string-width (clack's
// width math) strips BEL-terminated OSC 8 but not ST, so BEL keeps box/note borders aligned.
export function hyperlink(url: string, label?: string): string {
  const text = label && label !== url ? label : url
  if (/^https?:\/\//.test(url)) {
    return `\u001b]8;;${url}\u0007${text}\u001b]8;;\u0007`
  }
  return label && label !== url ? `${label}: ${url}` : url
}
