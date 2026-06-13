<script setup lang="ts">
const { loggedIn } = useUserSession()

if (loggedIn.value) {
  navigateTo('/dashboard')
} else {
  navigateTo('/login')
}
</script>

<template>
  <div />
</template>
