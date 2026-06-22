export function useGoToItem() {
  function goToItem(item: { id: number; type: string }): void {
    if (item.type === 'movie') {
      navigateTo(`/browse/movie/${item.id}`)
    } else {
      navigateTo(`/browse/tv/${item.id}`)
    }
  }

  return { goToItem }
}
