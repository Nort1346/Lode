<script setup lang="ts">
import type { WishlistItem } from '~/types/wishlist'

definePageMeta({
  middleware: ['auth'],
  layout: 'default'
})

const { t } = useI18n()
const toast = useToast()

const { data, refresh, pending } = useFetch<{ items: WishlistItem[] }>('/api/wishlist')
const items = computed(() => data.value?.items ?? [])

async function removeFromWishlist(item: WishlistItem) {
  try {
    await $fetch('/api/wishlist', { method: 'DELETE', body: { id: item.id } })
    await refresh()
    toast.add({ title: t('wishlist.removedFromWishlist'), color: 'success' })
  } catch {
    toast.add({ title: t('wishlist.failed'), color: 'error' })
  }
}

function goToItem(item: WishlistItem) {
  if (item.mediaType === 'movie') {
    navigateTo(`/browse/movie/${item.mediaId}`)
  } else {
    navigateTo(`/browse/tv/${item.mediaId}`)
  }
}
</script>

<template>
  <div>
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-zinc-900 dark:text-white mb-2">{{ t('wishlist.title') }}</h1>
      <p class="text-zinc-500 dark:text-zinc-400">{{ t('wishlist.subtitle') }}</p>
    </div>

    <div v-if="pending" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      <div v-for="i in 10" :key="i" class="space-y-2">
        <USkeleton class="aspect-2/3 w-full rounded-xl" />
        <USkeleton class="h-4 w-3/4 rounded" />
        <USkeleton class="h-3 w-1/2 rounded" />
      </div>
    </div>

    <div v-else-if="items.length === 0" class="card p-12 text-center">
      <UIcon name="i-lucide-heart" class="w-12 h-12 text-zinc-300 dark:text-zinc-600 mx-auto mb-4" />
      <p class="text-zinc-500 dark:text-zinc-400 mb-4">{{ t('wishlist.noItems') }}</p>
      <p class="text-sm text-zinc-400 dark:text-zinc-500 mb-6">{{ t('wishlist.noItemsDesc') }}</p>
      <UButton to="/browse" icon="i-lucide-film" color="primary">
        {{ t('wishlist.browse') }}
      </UButton>
    </div>

    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      <div v-for="item in items" :key="item.id" class="group relative cursor-pointer" @click="goToItem(item)">
        <div class="relative overflow-hidden rounded-xl">
          <img
            v-if="item.mediaPoster"
            :src="item.mediaPoster"
            :alt="item.mediaTitle"
            class="aspect-2/3 w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div v-else class="aspect-2/3 w-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
            <UIcon name="i-lucide-film" class="w-12 h-12 text-zinc-400" />
          </div>
          <div
            class="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          />
          <div
            class="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          >
            <div class="flex items-center gap-2">
              <UButton size="xs" color="primary" icon="i-lucide-download" @click.stop="goToItem(item)">
                {{ t('wishlist.download') }}
              </UButton>
              <UButton
                size="xs"
                color="error"
                variant="outline"
                icon="i-lucide-trash-2"
                @click.stop="removeFromWishlist(item)"
              >
                {{ t('wishlist.remove') }}
              </UButton>
            </div>
          </div>
        </div>
        <div class="mt-2">
          <p class="text-sm font-medium text-zinc-900 dark:text-white line-clamp-1">{{ item.mediaTitle }}</p>
          <div class="flex items-center gap-2 mt-1">
            <span
              class="text-xs px-1.5 py-0.5 rounded"
              :class="
                item.mediaType === 'movie'
                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                  : 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
              "
            >
              {{ item.mediaType === 'movie' ? t('mediaCard.movie') : t('mediaCard.tv') }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
