// OSC 8 hyperlink: emitted unconditionally for http(s) URLs, deliberately
// independent of NO_COLOR (ECMA-48 terminals ignore unknown OSC sequences).
export function hyperlink(url: string, label?: string): string {
  const text = label && label !== url ? label : url
  if (/^https?:\/\//.test(url)) {
    return `\u001b]8;;${url}\u001b\\${text}\u001b]8;;\u001b\\`
  }
  return label && label !== url ? `${label}: ${url}` : url
}
