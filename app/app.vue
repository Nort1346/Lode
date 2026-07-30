<script setup lang="ts">
const { t } = useI18n()

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
  title: () => t('seo.title'),
  description: () => t('seo.description'),
  ogTitle: () => t('seo.title'),
  ogDescription: () => t('seo.description')
})
</script>

<template>
  <UApp>
    <NuxtPwaAssets />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <DownloadOverlay />
  </UApp>
</template>
