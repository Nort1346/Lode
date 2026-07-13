import { vReveal } from '~/directives/reveal'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('reveal', vReveal)
})
