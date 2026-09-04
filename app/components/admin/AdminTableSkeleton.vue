<script setup lang="ts">
import type { SkeletonColumn } from '~/types/skeleton'

const props = withDefaults(
  defineProps<{
    columns: SkeletonColumn[]
    rows?: number
  }>(),
  {
    rows: 8
  }
)

const alignClass = (col: SkeletonColumn) =>
  col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : 'justify-start'

const gapClass = (col: SkeletonColumn) =>
  col.type === 'actions' ? 'gap-2' : col.type === 'avatar' || col.type === 'poster' ? 'gap-3' : ''
</script>

<template>
  <div role="status" aria-busy="true" class="card overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="table-header">
            <th v-for="(col, i) in props.columns" :key="i" class="px-4 py-3" :class="col.hidden ?? ''">
              <div class="flex items-center" :class="alignClass(col)">
                <USkeleton class="h-3 w-14 rounded" />
              </div>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-200 dark:divide-white/5">
          <tr v-for="r in props.rows" :key="r" class="table-row">
            <td v-for="(col, i) in props.columns" :key="i" class="px-4 py-3" :class="col.hidden ?? ''">
              <div class="flex items-center" :class="[alignClass(col), gapClass(col)]">
                <USkeleton v-if="col.type === 'text'" class="h-4 rounded" :class="col.width ?? 'w-24'" />
                <USkeleton v-else-if="col.type === 'badge'" class="h-5 rounded-full" :class="col.width ?? 'w-16'" />
                <USkeleton v-else-if="col.type === 'toggle'" class="h-5 w-9 rounded-full" />
                <USkeleton v-else-if="col.type === 'dot'" class="h-2.5 w-2.5 rounded-full" />
                <template v-else-if="col.type === 'avatar'">
                  <USkeleton class="h-7 w-7 shrink-0 rounded-full" />
                  <USkeleton class="h-4 rounded" :class="col.width ?? 'w-24'" />
                </template>
                <template v-else-if="col.type === 'poster'">
                  <USkeleton class="h-12 w-8 shrink-0 rounded" />
                  <USkeleton class="h-4 rounded" :class="col.width ?? 'w-24'" />
                </template>
                <USkeleton
                  v-for="b in col.actionsCount ?? 2"
                  v-else
                  :key="b"
                  class="h-8 rounded-lg"
                  :class="col.actionsWidth ?? 'w-8'"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
