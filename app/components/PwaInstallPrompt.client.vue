<script setup lang="ts">
const pwa = usePWA()
const { t } = useI18n()

const isReady = computed(() => pwa?.showInstallPrompt === true && pwa?.isPWAInstalled === false)

async function handleInstall() {
  if (!pwa) return
  try {
    const choice = await pwa.install()
    if (choice?.outcome === 'accepted') {
      pwa.cancelInstall()
    }
  } catch {
    /* native prompt not available */
  }
}

function handleDismiss() {
  pwa?.cancelInstall()
}
</script>

<template>
  <UModal :open="isReady">
    <template #header>
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
          <UIcon name="i-lucide-download" class="w-5 h-5 text-amber-500" />
        </div>
        <h3 class="text-lg font-semibold text-zinc-900 dark:text-white">{{ t('pwa.installTitle') }}</h3>
      </div>
    </template>
    <template #body>
      <p class="text-sm text-zinc-600 dark:text-zinc-400">{{ t('pwa.installDescription') }}</p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="soft" color="neutral" :label="t('pwa.dismiss')" @click="handleDismiss" />
        <UButton color="primary" icon="i-lucide-download" :label="t('pwa.installButton')" @click="handleInstall" />
      </div>
    </template>
  </UModal>
</template>
