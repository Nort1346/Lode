<script setup lang="ts">
import type { MediaCarouselItem } from '~/types/media'

const props = defineProps<{
  item: MediaCarouselItem
}>()

const { t, locale } = useI18n()
const { goToItem } = useGoToItem()

const logoUrl = ref<string | null>(null)

watch(
  [() => props.item, locale],
  async ([item]) => {
    logoUrl.value = null
    if (!item) return
    try {
      const data = await $fetch<{ logoUrl: string | null }>('/api/browse/logo', {
        query: { mediaType: item.type, id: item.id, locale: locale.value }
      })
      logoUrl.value = data.logoUrl
    } catch {
      logoUrl.value = null
    }
  },
  { immediate: true }
)
</script>

<template>
  <div
    class="relative my-6 overflow-hidden rounded-2xl cursor-pointer group h-[260px] sm:h-[320px] md:h-[380px]"
    @click="goToItem(item)"
  >
    <img
      :src="item.backdropUrl || item.posterUrl"
      :alt="item.title"
      loading="lazy"
      class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
    />

    <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
    <div class="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent" />

    <div class="absolute inset-0 flex items-end p-6 sm:p-8">
      <div class="max-w-xl">
        <div class="flex items-center gap-2 mb-2">
          <span
            class="flex items-center rounded-md px-2 py-0.5 text-xs font-semibold backdrop-blur-sm"
            :class="item.type === 'movie' ? 'bg-blue-500/80 text-white' : 'bg-purple-500/80 text-white'"
          >
            {{ item.type === 'movie' ? t('mediaCard.movie') : t('mediaCard.tv') }}
          </span>
          <span
            v-if="item.rating > 0"
            class="flex items-center gap-1 rounded-md bg-amber-500/90 px-2 py-0.5 text-xs font-bold text-black backdrop-blur-sm"
          >
            <UIcon name="i-lucide-star" class="size-3" />
            {{ item.rating.toFixed(1) }}
          </span>
          <span v-if="item.year" class="text-sm text-white/50">{{ item.year }}</span>
        </div>
        <img
          v-if="logoUrl"
          :src="logoUrl"
          :alt="item.title"
          class="max-h-12 sm:max-h-16 md:max-h-20 mb-2 object-contain drop-shadow-lg"
        />
        <h3 v-else class="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-2">{{ item.title }}</h3>
        <p class="text-sm text-white/60 line-clamp-2 mb-4">{{ item.overview }}</p>
        <UButton
          :label="t('browse.spotlightCTA')"
          icon="i-lucide-play"
          size="md"
          class="cursor-pointer"
          @click.stop="goToItem(item)"
        />
      </div>
    </div>
  </div>
</template>
