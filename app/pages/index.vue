<script setup lang="ts">
const { loggedIn } = useUserSession()

if (loggedIn.value) {
  void navigateTo('/dashboard')
} else {
  void navigateTo('/login')
}
</script>

<template>
  <div />
</template>
