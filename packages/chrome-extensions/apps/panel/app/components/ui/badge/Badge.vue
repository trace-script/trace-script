<script setup lang="ts">
import type { BadgeVariant } from './variants'
import { badgeVariants } from './variants'

defineProps<{ variant: BadgeVariant }>()
</script>

<template>
  <span :class="badgeVariants({ variant })">
    <slot />
  </span>
</template>
