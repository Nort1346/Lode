import { Avatar, Style } from '@dicebear/core'
import adventurer from '@dicebear/styles/adventurer.json'
import avataaars from '@dicebear/styles/avataaars.json'
import bigEars from '@dicebear/styles/big-ears.json'
import bottts from '@dicebear/styles/bottts.json'
import funEmoji from '@dicebear/styles/fun-emoji.json'
import lorelei from '@dicebear/styles/lorelei.json'
import micah from '@dicebear/styles/micah.json'
import notionists from '@dicebear/styles/notionists.json'
import openPeeps from '@dicebear/styles/open-peeps.json'
import personas from '@dicebear/styles/personas.json'
import pixelArt from '@dicebear/styles/pixel-art.json'
import toonHead from '@dicebear/styles/toon-head.json'
import type { StyleDefinition } from '@dicebear/core'

const STYLE_MAP: Record<string, StyleDefinition> = {
  adventurer: adventurer as unknown as StyleDefinition,
  avataaars: avataaars as unknown as StyleDefinition,
  'big-ears': bigEars as unknown as StyleDefinition,
  bottts: bottts as unknown as StyleDefinition,
  'fun-emoji': funEmoji as unknown as StyleDefinition,
  lorelei: lorelei as unknown as StyleDefinition,
  micah: micah as unknown as StyleDefinition,
  notionists: notionists as unknown as StyleDefinition,
  'open-peeps': openPeeps as unknown as StyleDefinition,
  personas: personas as unknown as StyleDefinition,
  'pixel-art': pixelArt as unknown as StyleDefinition,
  'toon-head': toonHead as unknown as StyleDefinition
}

const AVAILABLE_STYLES = Object.keys(STYLE_MAP)

const PREVIEW_SEEDS = [
  'Felix',
  'Aneka',
  'Jasper',
  'Mia',
  'Oliver',
  'Luna',
  'Ethan',
  'Sophia',
  'Noah',
  'Emma',
  'Liam',
  'Ava',
  'Mason',
  'Isabella',
  'Lucas',
  'Lily',
  'Alexander',
  'Charlotte',
  'Sebastian',
  'Amelia'
]

const BG_COLORS = [
  'b6e3f4',
  'c0aede',
  'd1d4f9',
  'ffd5dc',
  'ffdfbf',
  'd4f0f0',
  'e8d5b7',
  'c1e1c1',
  'ffc8dd',
  'bde0fe',
  'a2d2ff',
  'cdb4db',
  'ffc6ff',
  'caffbf',
  '9bf6ff'
]

const styleInstances = new Map<string, Style>()

function getStyle(name: string): Style | null {
  const def = STYLE_MAP[name]
  if (!def) return null
  let style = styleInstances.get(name)
  if (!style) {
    style = new Style(def)
    styleInstances.set(name, style)
  }
  return style
}

export function useDicebear() {
  function generateDataUri(styleName: string, seed: string, bgColor?: string): string {
    const style = getStyle(styleName)
    if (!style) return ''
    const options: Record<string, unknown> = { seed, size: 96, borderRadius: 50 }
    if (bgColor) options.backgroundColor = bgColor
    const avatar = new Avatar(style, options)
    return avatar.toDataUri()
  }

  function generatePreviews(styleName: string): Array<{ seed: string; dataUri: string; bgColor: string }> {
    return PREVIEW_SEEDS.map((seed, i) => {
      const bgColor = BG_COLORS[i % BG_COLORS.length] as string
      return { seed, dataUri: generateDataUri(styleName, seed, bgColor), bgColor }
    })
  }

  function getAvailableStyles(): string[] {
    return AVAILABLE_STYLES
  }

  function getRandomBgColor(): string {
    const idx = Math.floor(Math.random() * BG_COLORS.length)
    return (BG_COLORS[idx] ?? BG_COLORS[0]) as string
  }

  return { generateDataUri, generatePreviews, getAvailableStyles, getRandomBgColor, BG_COLORS }
}
