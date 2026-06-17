<script setup lang="ts">
useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'google', content: 'notranslate' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' },
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
    }
  ],
  htmlAttrs: {
    lang: 'en',
    class: 'dark',
    translate: 'no'
  },
  bodyAttrs: {
    class: 'bg-gradient-main notranslate'
  }
})

useSeoMeta({
  title: 'StreamHub',
  description: 'Streaming downloading panel',
  ogTitle: 'StreamHub',
  ogDescription: 'Streaming downloading panel'
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
