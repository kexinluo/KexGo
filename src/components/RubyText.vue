<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ text: string }>()

type Segment = { base: string; ruby?: string }

const HAN_TAIL = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+$/

const segments = computed<Segment[]>(() => {
  const result: Segment[] = []
  const pattern = /([^\[]*)\[([^\]]+)\]/g
  let cursor = 0
  for (const match of props.text.matchAll(pattern)) {
    const index = match.index ?? 0
    const prefix = match[1] ?? ''
    const hanTail = prefix.match(HAN_TAIL)?.[0] ?? ''
    // For `むように溶[と]` annotate only 溶, not the preceding kana.
    // Kana-only bases (e.g. に[に], ける[ける]) use the whole prefix.
    const base = hanTail || prefix
    const leading = hanTail ? prefix.slice(0, prefix.length - hanTail.length) : ''
    if (leading) result.push({ base: leading })
    if (base) result.push({ base, ruby: match[2] })
    cursor = index + match[0].length
  }
  if (cursor < props.text.length) result.push({ base: props.text.slice(cursor) })
  return result.length ? result : [{ base: props.text }]
})
</script>

<template>
  <span class="ruby-text">
    <template v-for="(segment, index) in segments" :key="index">
      <ruby v-if="segment.ruby">
        {{ segment.base }}<rt>{{ segment.ruby }}</rt>
      </ruby>
      <span v-else>{{ segment.base }}</span>
    </template>
  </span>
</template>

<style scoped>
.ruby-text {
  display: inline;
}

.ruby-text ruby {
  ruby-position: over;
  ruby-align: center;
}

.ruby-text rt {
  color: var(--faint);
  font-size: 0.52em;
  font-weight: 400;
  letter-spacing: 0.02em;
}
</style>
