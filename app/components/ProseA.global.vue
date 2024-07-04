
<template>
  <NuxtLink
    class="font-bold underline hover:no-underline"
    :href="href"
    target="_blank"
  >
    <slot />
  </NuxtLink>
</template>

<script setup lang="ts">
defineProps({
  href: {
    type: String,
    default: ''
  },
})
</script>