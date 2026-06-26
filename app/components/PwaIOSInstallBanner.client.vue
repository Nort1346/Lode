<script setup lang="ts">
const DISMISS_KEY = 'pwa-ios-dismissed'
const DISMISS_DAYS = 7

const { t } = useI18n()

const dismissed = ref(false)

const isIOSSafari = computed(() => {
  if (import.meta.server) return false
  const ua = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return isIOS && isSafari && !isStandalone
})

const showBanner = computed(() => isIOSSafari.value && !dismissed.value)

onMounted(() => {
  try {
    const ts = localStorage.getItem(DISMISS_KEY)
    if (ts !== null && Date.now() - Number(ts) < DISMISS_DAYS * 86_400_000) {
      dismissed.value = true
    }
  } catch {
    /* localStorage not available */
  }
})

function dismiss() {
  dismissed.value = true
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    /* localStorage not available */
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      leave-active-class="transition-all duration-200 ease-in"
      enter-from-class="translate-y-full opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-full opacity-0"
    >
      <div v-if="showBanner" class="fixed bottom-0 inset-x-0 z-50 p-4 pb-6">
        <div
          class="max-w-lg mx-auto bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 rounded-xl shadow-2xl p-4 flex items-start gap-3"
        >
          <div class="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
            <UIcon name="i-lucide-share" class="w-5 h-5 text-amber-500" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-zinc-900 dark:text-white">{{ t('pwa.iosTitle') }}</p>
            <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{{ t('pwa.iosDescription') }}</p>
          </div>
          <button
            class="flex items-center justify-center w-7 h-7 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors flex-shrink-0"
            @click="dismiss"
          >
            <UIcon name="i-lucide-x" class="w-4 h-4" />
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
