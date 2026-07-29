<template>
  <Transition
    enter-active-class="transition-opacity duration-200 ease-out"
    enter-from-class="opacity-0"
    leave-active-class="transition-opacity duration-150 ease-in"
    leave-to-class="opacity-0"
  >
    <div v-if="active" class="fixed inset-0 z-60 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div class="flex flex-col items-center gap-6">
        <div class="relative flex items-center justify-center size-20">
          <span class="ripple absolute size-4 rounded-full bg-amber-500" />
          <span class="ripple absolute size-4 rounded-full bg-amber-500 [animation-delay:0.6s]" />
          <span class="ripple absolute size-4 rounded-full bg-amber-500 [animation-delay:1.2s]" />
        </div>
        <p class="max-w-80 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {{ label }}
        </p>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
const { active, label } = useDownloadOverlay()
</script>

<style scoped>
.ripple {
  animation: ripple 1.8s ease-out infinite;
}

@keyframes ripple {
  0% {
    transform: scale(1);
    opacity: 0.6;
  }
  100% {
    transform: scale(2.5);
    opacity: 0;
  }
}
</style>
