<template>
  <Transition
    enter-active-class="transition-opacity duration-200 ease-out"
    enter-from-class="opacity-0"
    leave-active-class="transition-opacity duration-150 ease-in"
    leave-to-class="opacity-0"
  >
    <div v-if="active" class="fixed inset-0 z-60 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div class="flex flex-col items-center gap-8 w-80">
        <div class="relative flex items-center justify-center size-32">
          <span class="ripple absolute size-7 rounded-full bg-amber-500" />
          <span class="ripple absolute size-7 rounded-full bg-amber-500 [animation-delay:0.6s]" />
          <span class="ripple absolute size-7 rounded-full bg-amber-500 [animation-delay:1.2s]" />
        </div>
        <p
          class="max-w-72 text-center text-base font-semibold text-zinc-900 dark:text-zinc-100 transition-opacity duration-300"
          :class="fading ? 'opacity-0' : 'opacity-100'"
        >
          {{ currentMessage }}
        </p>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
const { active, currentMessage, fading } = useDownloadOverlay()
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
