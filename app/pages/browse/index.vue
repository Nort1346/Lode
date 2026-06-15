<template>
  <div>
    <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
      <UInput
        v-model="searchQuery"
        placeholder="Szukaj filmów i seriali..."
        icon="i-lucide-search"
        size="xl"
        class="flex-1"
        autofocus
        @keyup.enter="doSearch"
      />
      <USelect v-model="searchType" :items="typeOptions" size="xl" class="w-full sm:w-40" />
    </div>

    <div v-if="pending" class="flex justify-center py-20">
      <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-amber-500" />
    </div>

    <div v-else-if="error" class="rounded-xl bg-red-500/10 p-6 text-center text-red-500 dark:text-red-400">
      Wystąpił błąd podczas wyszukiwania. Spróbuj ponownie.
    </div>

    <div
      v-else-if="results.length > 0"
      class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
    >
      <MediaCard
        v-for="item in results"
        :id="item.id"
        :key="`${item.type}-${item.id}`"
        :type="item.type"
        :title="item.title"
        :overview="item.overview"
        :poster-url="item.posterUrl"
        :year="item.year"
        :rating="item.rating"
        @click="goToItem(item)"
      />
    </div>

    <div v-else-if="searched" class="py-20 text-center text-zinc-500 dark:text-zinc-400">
      Nie znaleziono wyników dla "{{ lastQuery }}"
    </div>

    <div v-else class="py-20 text-center text-zinc-400 dark:text-zinc-500">
      <UIcon name="i-lucide-film" class="mx-auto mb-4 size-12 opacity-50" />
      <p>Wpisz tytuł aby znaleźć film lub serial</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const searchQuery = ref('')
const searchType = ref('all')
const lastQuery = ref('')
const searched = ref(false)

const typeOptions = [
  { label: 'Wszystko', value: 'all' },
  { label: 'Filmy', value: 'movie' },
  { label: 'Seriale', value: 'tv' }
]

const { data, pending, error, execute } = await useFetch('/api/browse/search', {
  query: computed(() => ({
    q: lastQuery.value,
    type: searchType.value
  })),
  immediate: false
})

const results = computed(() => data.value?.results ?? [])

async function doSearch() {
  const q = searchQuery.value.trim()
  if (q.length < 2) return
  lastQuery.value = q
  searched.value = true
  await execute()
}

function goToItem(item: { id: number; type: string }) {
  if (item.type === 'movie') {
    navigateTo(`/browse/movie/${item.id}`)
  } else {
    navigateTo(`/browse/tv/${item.id}`)
  }
}
</script>
