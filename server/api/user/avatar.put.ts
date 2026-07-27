import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { Style, Avatar } from '@dicebear/core'
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
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { syncAvatar } from '#server/utils/sync'
import type { StyleDefinition } from '@dicebear/core'
import { AVATARS_DIR } from '#server/utils/paths'
import { useDbAsync, dbRun } from '#server/utils/db'

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

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const body = await readBody<{ style: string; seed: string; bgColor: string }>(event)
  if (!body?.style || !(body.style in STYLE_MAP)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid avatar style' })
  }
  if (!body.seed || typeof body.seed !== 'string' || body.seed.length > 64) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid avatar seed' })
  }

  const styleDef = STYLE_MAP[body.style]
  const style = new Style(styleDef)
  const bgColor = BG_COLORS.includes(body.bgColor) ? body.bgColor : BG_COLORS[0]
  const avatar = new Avatar(style, { seed: body.seed, size: 512, backgroundColor: bgColor })
  const svg = avatar.toString()

  const jpgBuffer = await sharp(Buffer.from(svg)).resize(512, 512).jpeg({ quality: 90 }).removeAlpha().toBuffer()

  const avatarsDir = AVATARS_DIR
  if (!existsSync(avatarsDir)) {
    await mkdir(avatarsDir, { recursive: true })
  }

  const avatarPath = resolve(avatarsDir, `${session.user.id}.jpg`)
  await writeFile(avatarPath, jpgBuffer)

  const db = await useDbAsync()
  await dbRun(
    db
      .update(users)
      .set({ avatarUrl: `/avatars/${session.user.id}.jpg` })
      .where(eq(users.id, session.user.id))
  )

  await syncAvatar(session.user.id, jpgBuffer)

  return { avatarUrl: `/avatars/${session.user.id}.jpg` }
})
