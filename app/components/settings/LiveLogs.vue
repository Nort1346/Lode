<script setup lang="ts">
const { t } = useI18n()

const showLogs = ref(false)
const logs = ref<string[]>([])
const logsPaused = ref(false)
const logsContainer = ref<HTMLElement | null>(null)
let eventSource: EventSource | null = null

function connectLogs() {
  if (eventSource !== null) return
  eventSource = new EventSource('/api/admin/logs-stream')
  eventSource.onmessage = (e) => {
    if (logsPaused.value) return
    try {
      const data = JSON.parse(e.data) as { line: string }
      logs.value.push(data.line)
      if (logs.value.length > 500) logs.value.splice(0, logs.value.length - 500)
      nextTick(() => {
        if (logsContainer.value && !logsPaused.value) {
          logsContainer.value.scrollTop = logsContainer.value.scrollHeight
        }
      })
    } catch {
      // skip malformed
    }
  }
  eventSource.onerror = () => {
    eventSource?.close()
    eventSource = null
  }
}

function disconnectLogs() {
  eventSource?.close()
  eventSource = null
}

function toggleLogs() {
  showLogs.value = !showLogs.value
  if (showLogs.value) {
    logs.value = []
    connectLogs()
  } else {
    disconnectLogs()
  }
}

function downloadLogs() {
  const blob = new Blob([logs.value.join('\n')], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `streamhub-logs-${new Date().toISOString().slice(0, 10)}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

function logLineColor(line: string): string {
  if (line.includes(' ERROR ')) return 'text-red-400'
  if (line.includes(' WARN ')) return 'text-amber-400'
  return 'text-zinc-400'
}

onUnmounted(() => {
  disconnectLogs()
})
</script>

<template>
  <div class="mt-4">
    <UButton
      icon="i-lucide-terminal"
      variant="ghost"
      size="xs"
      class="text-zinc-300 dark:text-zinc-700 hover:text-zinc-500 dark:hover:text-zinc-400"
      :label="t('settings.liveLogs')"
      @click="toggleLogs"
    />

    <div v-if="showLogs" class="mt-3 card overflow-hidden">
      <div class="flex items-center gap-2 px-4 py-2 border-b border-zinc-200 dark:border-white/5">
        <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">{{ t('settings.liveLogs') }}</span>
        <div class="ml-auto flex items-center gap-1">
          <UButton
            :icon="logsPaused ? 'i-lucide-play' : 'i-lucide-pause'"
            variant="ghost"
            size="xs"
            class="text-zinc-400"
            :label="logsPaused ? t('settings.logsResume') : t('settings.logsPause')"
            @click="logsPaused = !logsPaused"
          />
          <UButton
            icon="i-lucide-trash-2"
            variant="ghost"
            size="xs"
            class="text-zinc-400"
            :label="t('settings.logsClear')"
            @click="logs = []"
          />
          <UButton
            icon="i-lucide-download"
            variant="ghost"
            size="xs"
            class="text-zinc-400"
            :label="t('settings.logsDownload')"
            @click="downloadLogs"
          />
        </div>
      </div>
      <div ref="logsContainer" class="h-100 overflow-y-auto bg-zinc-950 p-4 font-mono text-xs leading-relaxed">
        <div v-if="logs.length === 0" class="text-zinc-600">{{ t('settings.logsEmpty') }}</div>
        <div v-for="(line, i) in logs" :key="i" :class="logLineColor(line)">{{ line }}</div>
      </div>
    </div>
  </div>
</template>
