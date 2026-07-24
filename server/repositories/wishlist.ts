import { wishlist } from '#server/database/schema'
import { eq, and } from 'drizzle-orm'
import { dbGet, dbAll, dbRun } from '#server/utils/db'
import type { SqliteDb } from '#server/types/database'
import type { WishlistRepo } from '#server/types/repos'

export function createWishlistRepo(db: SqliteDb): WishlistRepo {
  return {
    async findByUser(userId) {
      return dbAll(db.select().from(wishlist).where(eq(wishlist.userId, userId)))
    },

    async findDuplicate(userId, mediaType, mediaId) {
      return dbGet(
        db
          .select()
          .from(wishlist)
          .where(and(eq(wishlist.userId, userId), eq(wishlist.mediaType, mediaType), eq(wishlist.mediaId, mediaId)))
      )
    },

    async create(data) {
      await dbRun(db.insert(wishlist).values(data))
    },

    async delete(id) {
      await dbRun(db.delete(wishlist).where(eq(wishlist.id, id)))
    }
  }
}
