export type SkeletonColumnType = 'text' | 'badge' | 'avatar' | 'poster' | 'toggle' | 'dot' | 'actions'

export interface SkeletonColumn {
  type: SkeletonColumnType
  /** Tailwind responsive visibility classes, e.g. 'hidden lg:table-cell' */
  hidden?: string
  /** Width class for the primary skeleton bar, e.g. 'w-24' (text, badge, avatar, poster) */
  width?: string
  /** Cell content alignment */
  align?: 'left' | 'center' | 'right'
  /** Number of skeleton icon buttons for 'actions' columns */
  actionsCount?: number
  /** Width class for each 'actions' button, e.g. 'w-20' for labeled buttons */
  actionsWidth?: string
}
