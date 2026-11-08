<script setup lang="ts">
import { computed, ref } from 'vue'
import { MAX_TAGS, normalizeTagList } from '../utils/tags'
import AppIcon from './AppIcon.vue'

const props = withDefaults(
  defineProps<{
    tags: string[]
    history?: string[]
  }>(),
  { history: () => [] }
)

const emit = defineEmits<{
  (event: 'update', tags: string[]): void
}>()

const draft = ref('')
const focused = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)
const atLimit = computed(() => props.tags.length >= MAX_TAGS)

const suggestions = computed(() => {
  const needle = draft.value.trim().toLocaleLowerCase()
  const existing = new Set(props.tags.map((tag) => tag.toLocaleLowerCase()))
  return props.history
    .filter((tag) => !existing.has(tag.toLocaleLowerCase()))
    .filter((tag) => !needle || tag.toLocaleLowerCase().includes(needle))
    .slice(0, 6)
})

function commitTags(raw: string): void {
  if (atLimit.value) return
  const candidates = raw
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (candidates.length === 0) return

  const next = normalizeTagList([...props.tags, ...candidates])
  draft.value = ''
  if (next.length !== props.tags.length) emit('update', next)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.isComposing) return
  if (event.key === 'Enter') {
    event.preventDefault()
    commitTags(draft.value)
  }
  if (event.key === 'Escape') {
    draft.value = ''
    inputEl.value?.blur()
  }
}

function removeTag(index: number): void {
  emit(
    'update',
    props.tags.filter((_, current) => current !== index)
  )
}
</script>

<template>
  <div class="tag-editor">
    <div v-if="tags.length" class="tag-list">
      <span v-for="(tag, index) in tags" :key="`${tag}-${index}`" class="tag-chip">
        <span class="tag-hash">#</span>
        <span class="tag-label" :title="tag">{{ tag }}</span>
        <button class="tag-remove" :aria-label="`删除标签 ${tag}`" @click="removeTag(index)">
          <AppIcon name="close" :size="10" :stroke-width="2.3" />
        </button>
      </span>
    </div>

    <div class="tag-input-wrap">
      <div class="tag-input-row" :class="{ 'at-limit': atLimit }">
        <AppIcon name="tag" :size="13" />
        <input
          ref="inputEl"
          v-model="draft"
          type="text"
          maxlength="240"
          :disabled="atLimit"
          :placeholder="atLimit ? `最多 ${MAX_TAGS} 个标签` : '添加标签，回车保存'"
          aria-label="添加标签"
          autocomplete="off"
          @focus="focused = true"
          @blur="focused = false"
          @keydown="onKeydown"
        />
        <button
          class="tag-submit"
          :disabled="atLimit || !draft.trim()"
          aria-label="保存标签"
          @click="commitTags(draft)"
        >
          <AppIcon name="plus" :size="12" />
        </button>
      </div>
      <div v-if="focused && suggestions.length" class="tag-suggestions">
        <button
          v-for="suggestion in suggestions"
          :key="suggestion"
          type="button"
          @mousedown.prevent
          @click="commitTags(suggestion)"
        >
          <span>#</span>{{ suggestion }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tag-editor {
  display: flex;
  flex-direction: column;
  gap: 9px;
  min-height: 54px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  max-width: 170px;
  height: 23px;
  padding: 0 5px 0 7px;
  border: 1px solid rgb(200 245 106 / 13%);
  border-radius: 5px;
  color: var(--text);
  background: rgb(200 245 106 / 4.5%);
  font-size: 9px;
  letter-spacing: 0.01em;
}

.tag-hash {
  color: var(--accent-text);
  font-family: var(--font-mono);
  font-size: 8px;
}

.tag-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-remove {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  margin-left: 1px;
  border-radius: 3px;
  color: rgb(200 245 106 / 30%);
  transition: color 140ms ease, background 140ms ease;
}

.tag-remove:hover {
  color: var(--text);
  background: rgb(200 245 106 / 10%);
}

.tag-input-wrap {
  position: relative;
}

.tag-suggestions {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 12;
  display: flex;
  flex-direction: column;
  padding: 4px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--suggestion-bg);
  box-shadow: 0 12px 28px rgb(0 0 0 / 35%);
}

.tag-suggestions button {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 24px;
  padding: 0 7px;
  color: var(--muted);
  border-radius: 4px;
  font-size: 9px;
  text-align: left;
}

.tag-suggestions button:hover {
  color: var(--text);
  background: rgb(255 255 255 / 4%);
}

.tag-suggestions span {
  color: var(--faint);
}

.tag-input-row {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 27px;
  width: 100%;
  max-width: 300px;
  padding: 0 4px 0 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--faint);
  background: rgb(255 255 255 / 2%);
  transition: border-color 160ms ease;
}

.tag-input-row:focus-within {
  border-color: rgb(200 245 106 / 23%);
}

.tag-input-row.at-limit {
  opacity: 0.55;
}

.tag-input-row input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-size: 9.5px;
}

.tag-input-row input::placeholder {
  color: var(--faint);
}

.tag-submit {
  display: grid;
  place-items: center;
  width: 19px;
  height: 19px;
  flex: 0 0 auto;
  border-radius: 4px;
  color: var(--accent-text);
  background: rgb(200 245 106 / 8%);
  transition: background 140ms ease, opacity 140ms ease;
}

.tag-submit:hover:not(:disabled) {
  background: rgb(200 245 106 / 14%);
}

.tag-submit:disabled {
  opacity: 0.25;
}
</style>
