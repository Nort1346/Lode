<script setup lang="ts">
interface Request {
  id: string
  userId: string
  username: string
  mediaType: 'movie' | 'tv'
  mediaId: number
  mediaTitle: string
  mediaPoster: string | null
  status: 'pending' | 'accepted' | 'rejected'
  userNote: string | null
  adminNote: string | null
  createdAt: string
  updatedAt: string | null
}

const { t } = useI18n()

const { data: myRequestsData } = useLazyFetch<{ requests: Request[] }>('/api/requests/my')
const activeRequests = computed(() =>
  (myRequestsData.value?.requests ?? []).filter((r: Request) => r.status === 'pending' || r.status === 'rejected')
)
const pendingCount = computed(() => activeRequests.value.filter((r: Request) => r.status === 'pending').length)

const cardRefs = ref<HTMLElement[]>([])

function handleMouseMove(e: MouseEvent, idx: number) {
  const card = cardRefs.value[idx]
  if (card === null || card === undefined) return
  const rect = card.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const centerX = rect.width / 2
  const centerY = rect.height / 2
  const rotateX = ((y - centerY) / centerY) * -8
  const rotateY = ((x - centerX) / centerX) * 8
  card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.05, 1.05, 1.05)`
}

function handleMouseLeave(idx: number) {
  const card = cardRefs.value[idx]
  if (card === null || card === undefined) return
  card.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)'
}

function goToRequest(req: Request) {
  navigateTo(req.mediaType === 'movie' ? `/browse/movie/${req.mediaId}` : `/browse/tv/${req.mediaId}`)
}
</script>

<template>
  <div v-if="activeRequests.length > 0" class="mb-8">
    <div class="flex items-center justify-between mb-1">
      <h2 class="text-xl font-bold text-zinc-900 dark:text-white">{{ t('requests.myRequests') }}</h2>
      <span class="text-xs text-zinc-500 dark:text-zinc-400">{{ pendingCount }} {{ t('requests.pending') }}</span>
    </div>
    <div class="flex gap-4 overflow-x-auto pb-4 pt-4 px-1 scrollbar-hide">
      <div
        v-for="(req, idx) in activeRequests"
        :key="req.id"
        :ref="
          (el: unknown) => {
            if (el) cardRefs[idx] = el as HTMLElement
          }
        "
        class="flex-shrink-0 w-44 cursor-pointer group"
        style="
          transform-style: preserve-3d;
          will-change: transform;
          z-index: 0;
          transition:
            transform 0.2s ease-out,
            z-index 0s;
        "
        @mousemove="(e: MouseEvent) => handleMouseMove(e, idx)"
        @mouseleave="() => handleMouseLeave(idx)"
        @click="goToRequest(req)"
      >
        <div
          class="relative rounded-xl overflow-hidden aspect-[2/3] bg-zinc-200 dark:bg-white/5 shadow-md"
          :class="req.status === 'rejected' ? 'ring-2 ring-red-500/40' : ''"
        >
          <img
            v-if="req.mediaPoster"
            :src="req.mediaPoster"
            :alt="req.mediaTitle"
            class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
            loading="lazy"
          />
          <div v-else class="flex items-center justify-center w-full h-full">
            <UIcon name="i-lucide-film" class="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
          </div>
          <div
            class="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          />
          <div class="absolute top-2 right-2">
            <span
              v-if="req.status === 'pending'"
              class="flex items-center rounded-md px-2 py-0.5 text-xs font-semibold backdrop-blur-sm bg-amber-500/90 text-white"
            >
              {{ t('requests.pending') }}
            </span>
            <span
              v-else
              class="flex items-center rounded-md px-2 py-0.5 text-xs font-semibold backdrop-blur-sm bg-red-500/90 text-white"
            >
              {{ t('requests.rejected') }}
            </span>
          </div>
          <div
            class="absolute bottom-0 inset-x-0 p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          >
            <p v-if="req.adminNote" class="line-clamp-3 text-xs text-white/90 italic">{{ req.adminNote }}</p>
            <p v-else-if="req.userNote" class="line-clamp-3 text-xs text-white/90 italic">{{ req.userNote }}</p>
          </div>
        </div>
        <div class="mt-2 px-1">
          <h3 class="line-clamp-1 text-sm font-semibold text-zinc-900 dark:text-white">{{ req.mediaTitle }}</h3>
          <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {{ req.mediaType === 'movie' ? t('mediaCard.movie') : t('mediaCard.tv') }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
