<script setup lang="ts">
const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  visible: []
}>()

const root = ref<HTMLElement | null>(null)
const visible = ref(props.disabled ?? false)

onMounted(() => {
  if (props.disabled) return
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          visible.value = true
          emit('visible')
          observer.disconnect()
          break
        }
      }
    },
    { rootMargin: '200px' }
  )
  if (root.value) observer.observe(root.value)
  onUnmounted(() => observer.disconnect())
})
</script>

<template>
  <div ref="root">
    <slot v-if="visible" />
    <div v-else class="mb-10 h-70" />
  </div>
</template>
