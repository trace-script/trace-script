<script setup lang="ts">
import { version } from '../../../../package.json'
import Badge from '../ui/badge/Badge.vue'
</script>

<template>
  <main class="flex min-h-screen flex-col bg-background text-foreground">
    <header class="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
      <div class="flex items-center gap-3">
        <span class="size-2 rounded-full bg-primary" aria-hidden="true" />
        <h1 class="text-sm font-semibold tracking-tight">
          Agent Trace
        </h1>
      </div>
      <Badge variant="outline">
        v{{ version }}
      </Badge>
    </header>

    <section class="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center" aria-labelledby="empty-title">
      <Badge variant="secondary">
        Ready
      </Badge>
      <h2 id="empty-title" class="text-xl font-semibold tracking-tight">
        Your agent traces start here
      </h2>
      <p class="max-w-sm text-sm leading-6 text-muted-foreground">
        The DevTools panel is ready. Trace collection will be available as the next development stages are connected.
      </p>
    </section>

    <footer class="border-t border-border px-5 py-2 text-xs text-muted-foreground">
      Trace Script · Local DevTools panel
    </footer>
  </main>
</template>
