<script setup lang="ts">
import type { RankingConfig } from '#server/types/ranking'
import { DEFAULT_RANKING_CONFIG } from '#server/types/ranking'

definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

const { t } = useI18n()
const toast = useToast()

const config = ref<RankingConfig>(structuredClone(DEFAULT_RANKING_CONFIG))
const originalConfig = ref<string>('')
const loading = ref(true)
const saving = ref(false)
const hasChanges = computed(() => JSON.stringify(config.value) !== originalConfig.value)

const newGroup = ref('')
const newLangCode = ref('')
const newLangScore = ref(30)
const newLangPatterns = ref('')
const newResKey = ref('')
const newResScore = ref(20)
const newSourceKey = ref('')
const newSourceScore = ref(5)
const newPatternPerLang = ref<Record<number, string>>({})

const scoreMax = computed(
  () =>
    config.value.weights.resolution +
    config.value.weights.language +
    config.value.weights.seeders +
    config.value.weights.size +
    config.value.weights.source +
    config.value.weights.group +
    config.value.titleRelevance.wordWeight +
    config.value.titleRelevance.yearWeight +
    config.value.titleRelevance.fullTitleWeight
)

function validatePattern(pattern: string): boolean {
  try {
    return new RegExp(pattern) instanceof RegExp
  } catch {
    return false
  }
}

function hasInvalidPatterns(): boolean {
  for (const lang of config.value.languages) {
    if (lang.isFallback === true) continue
    for (const p of lang.patterns) {
      if (!validatePattern(p)) return true
    }
  }
  return false
}

async function fetchConfig() {
  loading.value = true
  try {
    const data = await $fetch<{ config: RankingConfig }>('/api/admin/ranking/config')
    config.value = data.config
    originalConfig.value = JSON.stringify(data.config)
  } catch {
    // use defaults
  } finally {
    loading.value = false
  }
}

async function saveConfig() {
  saving.value = true
  try {
    await $fetch('/api/admin/ranking/config', { method: 'PUT', body: config.value })
    originalConfig.value = JSON.stringify(config.value)
    toast.add({ title: t('ranking.saved'), color: 'success' })
  } catch {
    toast.add({ title: t('ranking.saveError'), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function resetConfig() {
  try {
    const data = await $fetch<{ config: RankingConfig }>('/api/admin/ranking/config/reset', { method: 'POST' })
    config.value = data.config
    originalConfig.value = JSON.stringify(data.config)
    toast.add({ title: t('ranking.resetDone'), color: 'success' })
  } catch {
    toast.add({ title: t('ranking.saveError'), color: 'error' })
  }
}

function resetSection(key: keyof RankingConfig) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(config.value as any)[key] = structuredClone((DEFAULT_RANKING_CONFIG as any)[key])
}

function addGroup() {
  const name = newGroup.value.trim().toLowerCase()
  if (name !== '' && !config.value.knownGroups.includes(name)) {
    config.value.knownGroups.push(name)
    newGroup.value = ''
  }
}

function removeGroup(index: number) {
  config.value.knownGroups.splice(index, 1)
}

function addLanguage() {
  const code = newLangCode.value.trim().toLowerCase()
  if (code === '') return
  const patterns = newLangPatterns.value
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '')
  config.value.languages.push({
    code,
    score: newLangScore.value,
    patterns,
    isFallback: false
  })
  newLangCode.value = ''
  newLangScore.value = 30
  newLangPatterns.value = ''
}

function removeLanguage(index: number) {
  config.value.languages.splice(index, 1)
}

function addPattern(langIndex: number) {
  const input = newPatternPerLang.value[langIndex]
  if (input === undefined || input.trim() === '') return
  const pattern = input.trim()
  if (!validatePattern(pattern)) return
  const lang = config.value.languages[langIndex]
  if (lang === undefined) return
  lang.patterns.push(pattern)
  newPatternPerLang.value[langIndex] = ''
}

function removePattern(langIndex: number, patternIndex: number) {
  const lang = config.value.languages[langIndex]
  if (lang === undefined) return
  lang.patterns.splice(patternIndex, 1)
}

function addResolution() {
  const key = newResKey.value.trim().toLowerCase()
  if (key !== '') {
    config.value.resolutions[key] = newResScore.value
    newResKey.value = ''
    newResScore.value = 20
  }
}

function removeResolution(key: string) {
  const { [key]: _, ...rest } = config.value.resolutions
  void _
  config.value.resolutions = rest
}

function addSource() {
  const key = newSourceKey.value.trim().toLowerCase()
  if (key !== '') {
    config.value.sources[key] = newSourceScore.value
    newSourceKey.value = ''
    newSourceScore.value = 5
  }
}

function removeSource(key: string) {
  const { [key]: _, ...rest } = config.value.sources
  void _
  config.value.sources = rest
}

function addThreshold(type: 'movie' | 'series' | 'seasonPack') {
  config.value.sizeThresholds[type].push({ min: 0, max: 10, score: 10 })
}

function removeThreshold(type: 'movie' | 'series' | 'seasonPack', index: number) {
  config.value.sizeThresholds[type].splice(index, 1)
}

function toggleUnlimited(type: 'movie' | 'series' | 'seasonPack', index: number) {
  const t = config.value.sizeThresholds[type][index]
  if (t === undefined) return
  t.max = t.max === Infinity ? 10 : Infinity
}

onBeforeRouteLeave((_to, _from, next) => {
  if (hasChanges.value) {
    if (window.confirm(t('ranking.unsavedWarning'))) {
      next()
    } else {
      next(false)
    }
  } else {
    next()
  }
})

onMounted(fetchConfig)
</script>

<template>
  <div>
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-zinc-900 dark:text-white mb-2">{{ t('ranking.title') }}</h1>
      <p class="text-zinc-500 dark:text-zinc-400">{{ t('ranking.subtitle') }}</p>
    </div>

    <div v-if="loading" class="space-y-4">
      <USkeleton v-for="i in 3" :key="i" class="h-32 rounded-xl" />
    </div>

    <template v-else>
      <!-- Unsaved indicator -->
      <div
        v-if="hasChanges"
        class="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
      >
        <div class="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
          <UIcon name="i-lucide-alert-circle" class="w-4 h-4" />
          {{ t('ranking.unsavedWarning') }}
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div class="flex justify-center items-center p-2 rounded-lg bg-blue-100 dark:bg-blue-900/20">
              <UIcon name="i-lucide-sliders-horizontal" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div class="text-2xl font-bold text-zinc-900 dark:text-white">
                {{ Object.keys(config.resolutions).length + Object.keys(config.sources).length }}
              </div>
              <div class="text-xs text-zinc-500 dark:text-zinc-400">
                {{ t('ranking.resolutions.title') }} + {{ t('ranking.sources.title') }}
              </div>
            </div>
          </div>
        </div>
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div class="flex justify-center items-center p-2 rounded-lg bg-green-100 dark:bg-green-900/20">
              <UIcon name="i-lucide-globe" class="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <div class="text-2xl font-bold text-zinc-900 dark:text-white">{{ config.languages.length }}</div>
              <div class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('ranking.languages.title') }}</div>
            </div>
          </div>
        </div>
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div class="flex justify-center items-center p-2 rounded-lg bg-purple-100 dark:bg-purple-900/20">
              <UIcon name="i-lucide-tag" class="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <div class="text-2xl font-bold text-zinc-900 dark:text-white">{{ config.knownGroups.length }}</div>
              <div class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('ranking.groups.title') }}</div>
            </div>
          </div>
        </div>
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div class="flex justify-center items-center p-2 rounded-lg bg-amber-100 dark:bg-amber-900/20">
              <UIcon name="i-lucide-trophy" class="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <div class="text-2xl font-bold text-zinc-900 dark:text-white">{{ scoreMax }}</div>
              <div class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('ranking.scoreMax') }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Weights -->
      <div class="card p-6 mb-6">
        <div class="flex items-center justify-between mb-1">
          <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">{{ t('ranking.weights.title') }}</h2>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :label="t('ranking.sections.reset')"
            @click="resetSection('weights')"
          />
        </div>
        <p class="text-xs text-zinc-400 dark:text-zinc-500 mb-4">{{ t('ranking.weightsHint') }}</p>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div v-for="(value, key) in config.weights" :key="key">
            <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              {{ t(`ranking.weights.${key}`) }}
            </label>
            <UInput
              v-model.number="config.weights[key as keyof typeof config.weights]"
              type="number"
              :min="0"
              :max="500"
            />
          </div>
        </div>
      </div>

      <!-- Resolutions -->
      <div class="card p-6 mb-6">
        <div class="flex items-center justify-between mb-1">
          <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">{{ t('ranking.resolutions.title') }}</h2>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :label="t('ranking.sections.reset')"
            @click="resetSection('resolutions')"
          />
        </div>
        <p class="text-xs text-zinc-400 dark:text-zinc-500 mb-4">{{ t('ranking.resolutionsHint') }}</p>
        <div class="space-y-2 mb-4">
          <div v-for="(score, key) in config.resolutions" :key="key" class="flex items-center gap-3">
            <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300 w-24">{{ key }}</span>
            <UInput v-model.number="config.resolutions[key]" type="number" :min="0" :max="500" class="flex-1" />
            <UButton color="error" variant="ghost" icon="i-lucide-x" size="xs" @click="removeResolution(key)" />
          </div>
        </div>
        <div class="flex items-center gap-2">
          <UInput v-model="newResKey" :placeholder="t('ranking.resolutions.add')" class="flex-1" />
          <UInput v-model.number="newResScore" type="number" :min="0" :max="500" class="w-24" />
          <UButton color="primary" variant="soft" icon="i-lucide-plus" size="xs" @click="addResolution" />
        </div>
      </div>

      <!-- Sources -->
      <div class="card p-6 mb-6">
        <div class="flex items-center justify-between mb-1">
          <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">{{ t('ranking.sources.title') }}</h2>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :label="t('ranking.sections.reset')"
            @click="resetSection('sources')"
          />
        </div>
        <p class="text-xs text-zinc-400 dark:text-zinc-500 mb-4">{{ t('ranking.sourcesHint') }}</p>
        <div class="space-y-2 mb-4">
          <div v-for="(score, key) in config.sources" :key="key" class="flex items-center gap-3">
            <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300 w-24">{{ key }}</span>
            <UInput v-model.number="config.sources[key]" type="number" :min="0" :max="500" class="flex-1" />
            <UButton color="error" variant="ghost" icon="i-lucide-x" size="xs" @click="removeSource(key)" />
          </div>
        </div>
        <div class="flex items-center gap-2">
          <UInput v-model="newSourceKey" :placeholder="t('ranking.sources.add')" class="flex-1" />
          <UInput v-model.number="newSourceScore" type="number" :min="0" :max="500" class="w-24" />
          <UButton color="primary" variant="soft" icon="i-lucide-plus" size="xs" @click="addSource" />
        </div>
      </div>

      <!-- Languages -->
      <div class="card p-6 mb-6">
        <div class="flex items-center justify-between mb-1">
          <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">{{ t('ranking.languages.title') }}</h2>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :label="t('ranking.sections.reset')"
            @click="resetSection('languages')"
          />
        </div>
        <p class="text-xs text-zinc-400 dark:text-zinc-500 mb-4">{{ t('ranking.languagesHint') }}</p>
        <div class="space-y-3 mb-4">
          <div
            v-for="(lang, index) in config.languages"
            :key="index"
            class="p-3 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-100 dark:border-white/5"
          >
            <div class="flex items-center gap-3 mb-2">
              <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300 w-20">{{ lang.code }}</span>
              <UInput v-model.number="lang.score" type="number" :min="0" :max="500" class="w-24" />
              <UCheckbox v-model="lang.isFallback" :label="t('ranking.languages.isFallback')" />
              <UButton color="error" variant="ghost" icon="i-lucide-x" size="xs" @click="removeLanguage(index)" />
            </div>
            <div v-if="!lang.isFallback">
              <label class="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">{{
                t('ranking.languages.patterns')
              }}</label>
              <div class="flex flex-wrap gap-1 mb-2">
                <UBadge
                  v-for="(pattern, pi) in lang.patterns"
                  :key="pi"
                  :color="validatePattern(pattern) ? 'neutral' : 'error'"
                  variant="soft"
                  class="cursor-pointer font-mono text-xs"
                  @click="removePattern(index, pi)"
                >
                  {{ pattern }}
                  <UIcon name="i-lucide-x" class="w-3 h-3 ml-1" />
                </UBadge>
                <span v-if="lang.patterns.length === 0" class="text-xs text-zinc-400 dark:text-zinc-500 italic">
                  {{ t('ranking.patterns.placeholder') }}
                </span>
              </div>
              <div class="flex items-center gap-2">
                <UInput
                  v-model="newPatternPerLang[index]"
                  :placeholder="t('ranking.patterns.placeholder')"
                  class="flex-1"
                  @keydown.enter="addPattern(index)"
                />
                <UButton
                  color="primary"
                  variant="soft"
                  icon="i-lucide-plus"
                  size="xs"
                  :disabled="
                    (newPatternPerLang[index] ?? '').trim() === '' ||
                    !validatePattern((newPatternPerLang[index] ?? '').trim())
                  "
                  @click="addPattern(index)"
                >
                  {{ t('ranking.patterns.add') }}
                </UButton>
              </div>
              <p
                v-if="
                  (newPatternPerLang[index] ?? '').trim() !== '' &&
                  !validatePattern((newPatternPerLang[index] ?? '').trim())
                "
                class="text-xs text-red-500 mt-1"
              >
                {{ t('ranking.patternInvalid') }}
              </p>
            </div>
          </div>
        </div>
        <div class="p-3 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-600">
          <div class="flex items-center gap-2 mb-2">
            <UInput v-model="newLangCode" :placeholder="t('ranking.languages.code')" class="w-24" />
            <UInput v-model.number="newLangScore" type="number" :min="0" :max="500" class="w-24" />
          </div>
          <div class="flex items-center gap-2">
            <UInput v-model="newLangPatterns" :placeholder="t('ranking.languages.patternsHint')" class="flex-1" />
            <UButton color="primary" variant="soft" icon="i-lucide-plus" size="xs" @click="addLanguage" />
          </div>
        </div>
      </div>

      <!-- Known Groups -->
      <div class="card p-6 mb-6">
        <div class="flex items-center justify-between mb-1">
          <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">{{ t('ranking.groups.title') }}</h2>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :label="t('ranking.sections.reset')"
            @click="resetSection('knownGroups')"
          />
        </div>
        <p class="text-xs text-zinc-400 dark:text-zinc-500 mb-4">{{ t('ranking.groupsHint') }}</p>
        <div class="flex flex-wrap gap-2 mb-4">
          <UBadge
            v-for="(group, index) in config.knownGroups"
            :key="group"
            color="neutral"
            variant="soft"
            class="cursor-pointer"
            @click="removeGroup(index)"
          >
            {{ group }}
            <UIcon name="i-lucide-x" class="w-3 h-3 ml-1" />
          </UBadge>
        </div>
        <div class="flex items-center gap-2">
          <UInput
            v-model="newGroup"
            :placeholder="t('ranking.groups.placeholder')"
            class="flex-1"
            @keydown.enter="addGroup"
          />
          <UButton color="primary" variant="soft" icon="i-lucide-plus" size="xs" @click="addGroup" />
        </div>
      </div>

      <!-- Size Thresholds -->
      <div class="card p-6 mb-6">
        <div class="flex items-center justify-between mb-1">
          <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">
            {{ t('ranking.sizeThresholds.title') }}
          </h2>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :label="t('ranking.sections.reset')"
            @click="resetSection('sizeThresholds')"
          />
        </div>
        <p class="text-xs text-zinc-400 dark:text-zinc-500 mb-4">{{ t('ranking.sizeThresholdsHint') }}</p>
        <div
          v-for="(typeKey, typeLabel) in { movie: 'movie', series: 'series', seasonPack: 'seasonPack' }"
          :key="typeKey"
          class="mb-6 last:mb-0"
        >
          <h3 class="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            {{ t(`ranking.sizeThresholds.${typeLabel}`) }}
          </h3>
          <div class="space-y-2 mb-2">
            <div
              v-for="(threshold, index) in config.sizeThresholds[typeKey as keyof typeof config.sizeThresholds]"
              :key="index"
              class="flex items-center gap-2"
            >
              <UInput
                v-model.number="threshold.min"
                type="number"
                :min="0"
                class="w-24"
                :placeholder="t('ranking.sizeThresholds.min')"
              />
              <span class="text-zinc-400">-</span>
              <template v-if="threshold.max === Infinity">
                <span class="w-24 text-center text-sm font-medium text-amber-600 dark:text-amber-400">
                  {{ t('ranking.sizeThresholds.unlimited') }}
                </span>
              </template>
              <template v-else>
                <UInput
                  v-model.number="threshold.max"
                  type="number"
                  :min="0"
                  class="w-24"
                  :placeholder="t('ranking.sizeThresholds.max')"
                />
              </template>
              <UInput
                v-model.number="threshold.score"
                type="number"
                :min="0"
                :max="500"
                class="w-24"
                :placeholder="t('ranking.sizeThresholds.score')"
              />
              <UButton
                color="warning"
                variant="ghost"
                :icon="threshold.max === Infinity ? 'i-lucide-lock' : 'i-lucide-lock-open'"
                size="xs"
                :title="t('ranking.sizeThresholds.unlimited')"
                @click="toggleUnlimited(typeKey as keyof typeof config.sizeThresholds, index)"
              />
              <UButton
                color="error"
                variant="ghost"
                icon="i-lucide-x"
                size="xs"
                @click="removeThreshold(typeKey as keyof typeof config.sizeThresholds, index)"
              />
            </div>
          </div>
          <UButton
            color="primary"
            variant="soft"
            icon="i-lucide-plus"
            size="xs"
            @click="addThreshold(typeKey as 'movie' | 'series' | 'seasonPack')"
          >
            {{ t('ranking.sizeThresholds.add') }}
          </UButton>
        </div>
      </div>

      <!-- Title Relevance -->
      <div class="card p-6 mb-6">
        <div class="flex items-center justify-between mb-1">
          <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">
            {{ t('ranking.titleRelevance.title') }}
          </h2>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :label="t('ranking.sections.reset')"
            @click="resetSection('titleRelevance')"
          />
        </div>
        <p class="text-xs text-zinc-400 dark:text-zinc-500 mb-4">{{ t('ranking.titleRelevanceHint') }}</p>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              {{ t('ranking.titleRelevance.wordWeight') }}
            </label>
            <UInput v-model.number="config.titleRelevance.wordWeight" type="number" :min="0" :max="100" />
          </div>
          <div>
            <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              {{ t('ranking.titleRelevance.yearWeight') }}
            </label>
            <UInput v-model.number="config.titleRelevance.yearWeight" type="number" :min="0" :max="100" />
          </div>
          <div>
            <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              {{ t('ranking.titleRelevance.fullTitleWeight') }}
            </label>
            <UInput v-model.number="config.titleRelevance.fullTitleWeight" type="number" :min="0" :max="100" />
          </div>
          <div>
            <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              {{ t('ranking.titleRelevance.penalty') }}
            </label>
            <UInput v-model.number="config.titleRelevance.penalty" type="number" :min="-100" :max="0" />
          </div>
        </div>
      </div>

      <!-- Recommended Count -->
      <div class="card p-6 mb-6">
        <div class="flex items-center justify-between mb-1">
          <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">{{ t('ranking.recommendedCount') }}</h2>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :label="t('ranking.sections.reset')"
            @click="resetSection('recommendedCount')"
          />
        </div>
        <p class="text-xs text-zinc-400 dark:text-zinc-500 mb-4">{{ t('ranking.recommendedCountHint') }}</p>
        <UInput v-model.number="config.recommendedCount" type="number" :min="1" :max="10" class="w-32" />
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-3">
        <UButton
          color="primary"
          :loading="saving"
          :disabled="hasInvalidPatterns()"
          :label="t('ranking.save')"
          @click="saveConfig"
        />
        <UButton color="warning" variant="soft" :label="t('ranking.reset')" @click="resetConfig" />
      </div>
    </template>
  </div>
</template>
