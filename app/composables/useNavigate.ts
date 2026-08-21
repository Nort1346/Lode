import type { MediaItemType } from '~/types/media'

export function useGoToItem() {
  function goToItem(item: { id: number; type: MediaItemType }): void {
    navigateTo(item.type === 'movie' ? `/browse/movie/${item.id}` : `/browse/tv/${item.id}`)
  }

  return { goToItem }
}
