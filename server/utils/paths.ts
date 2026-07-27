import { resolve } from 'node:path'

export const AVATARS_DIR = resolve(process.cwd(), '.output', 'public', 'avatars')
export const AVATARS_DEV_DIR = resolve(process.cwd(), 'public', 'avatars')
