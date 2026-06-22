<script setup lang="ts">
useHead({
  meta: [{ name: 'google', content: 'notranslate' }],
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
    }
  ],
  htmlAttrs: {
    lang: 'en',
    translate: 'no'
  },
  bodyAttrs: {
    class: 'bg-gradient-main notranslate'
  }
})

useSeoMeta({
  title: 'StreamHub',
  description: 'Browse, request, and download movies & TV shows',
  ogTitle: 'StreamHub',
  ogDescription: 'Browse, request, and download movies & TV shows'
})
</script>

<template>
  <UApp>
    <NuxtPwaAssets />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
