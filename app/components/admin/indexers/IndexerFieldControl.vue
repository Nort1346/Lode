<script setup lang="ts">
import type { IndexerField } from '#shared/indexers'
import type { IndexerFieldFormValue } from '~/types/indexers'

const props = withDefaults(
  defineProps<{
    field: IndexerField
    modelValue: IndexerFieldFormValue
    captchaImage?: string | null
    captchaLoading?: boolean
  }>(),
  {
    captchaImage: null,
    captchaLoading: false
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: IndexerFieldFormValue]
  requestCaptcha: []
}>()

const { t } = useI18n()

const label = computed(() => props.field.label ?? props.field.name)

const selectItems = computed(() =>
  (props.field.selectOptions ?? []).map((option) => ({ label: option.name, value: option.value }))
)

const selectValue = computed<string | number | undefined>(() => {
  if (typeof props.modelValue === 'number' || typeof props.modelValue === 'string') return props.modelValue
  return undefined
})

const textValue = computed(() => {
  const value = props.modelValue
  if (value === null || value === undefined) return ''
  return String(value)
})

const numberValue = computed<number | undefined>(() => {
  const value = props.modelValue
  if (value === null || value === undefined || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
})

const booleanValue = computed(() => props.modelValue === true)

function onTextInput(value: string | number) {
  emit('update:modelValue', String(value))
}

function onNumberInput(value: string | number) {
  if (value === '') {
    emit('update:modelValue', null)
    return
  }
  const parsed = Number(value)
  emit('update:modelValue', Number.isFinite(parsed) ? parsed : null)
}

function onSelect(value: unknown) {
  if (value === null || value === undefined) {
    emit('update:modelValue', null)
    return
  }
  const match = (props.field.selectOptions ?? []).find((option) => String(option.value) === String(value))
  if (match !== undefined) {
    emit('update:modelValue', match.value)
    return
  }
  if (typeof value === 'number' || typeof value === 'string') {
    emit('update:modelValue', value)
    return
  }
  emit('update:modelValue', null)
}

function onCheckbox(value: boolean | 'indeterminate') {
  emit('update:modelValue', value === true)
}
</script>

<template>
  <div
    v-if="field.type === 'info'"
    class="rounded-lg bg-zinc-50 dark:bg-white/5 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400"
  >
    {{ field.helpText ?? label }}
  </div>

  <UFormField v-else-if="field.type === 'checkbox'" :help="field.helpText">
    <UCheckbox :model-value="booleanValue" :label="label" @update:model-value="onCheckbox" />
  </UFormField>

  <UFormField v-else-if="field.type === 'select' && selectItems.length > 0" :label="label" :help="field.helpText">
    <USelect :model-value="selectValue" :items="selectItems" class="w-full" @update:model-value="onSelect" />
  </UFormField>

  <UFormField v-else-if="field.type === 'number'" :label="label" :help="field.helpText" :ui="{ label: 'text-xs' }">
    <UInput
      :model-value="numberValue"
      type="number"
      :step="field.isFloat === true ? 'any' : 1"
      class="w-full"
      @update:model-value="onNumberInput"
    />
  </UFormField>

  <UFormField v-else-if="field.type === 'cardigannCaptcha'" :label="label" :help="field.helpText" class="sm:col-span-2">
    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-refresh-cw"
          size="xs"
          variant="outline"
          :label="t('indexers.captchaLoad')"
          :loading="captchaLoading"
          @click="emit('requestCaptcha')"
        />
        <UButton
          v-if="captchaImage"
          icon="i-lucide-x"
          size="xs"
          variant="ghost"
          :label="t('indexers.captchaClear')"
          @click="emit('update:modelValue', '')"
        />
      </div>
      <img
        v-if="captchaImage"
        :src="captchaImage"
        :alt="t('indexers.captchaAlt')"
        class="rounded-lg border border-zinc-200 dark:border-white/10 bg-white max-h-28"
      />
      <UInput :model-value="textValue" class="w-full" @update:model-value="onTextInput" />
    </div>
  </UFormField>

  <UFormField v-else :label="label" :help="field.helpText">
    <UInput
      :model-value="textValue"
      :type="field.type === 'password' ? 'password' : 'text'"
      autocomplete="off"
      class="w-full"
      @update:model-value="onTextInput"
    />
  </UFormField>
</template>
