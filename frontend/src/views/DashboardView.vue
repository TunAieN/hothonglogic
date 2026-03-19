<script setup>
import { ref, onMounted } from 'vue'

const stats = ref([
  { title: 'Tổng đơn hàng', value: '12', color: 'primary' },
  { title: 'Chờ duyệt', value: '4', color: 'warning' },
  { title: 'Đang vận chuyển', value: '3', color: 'primary' },
  { title: 'Đã hoàn thành', value: '5', color: 'success' }
])
</script>

<template>
  <div>
    <h1 class="title">Tổng quan</h1>

    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; margin-bottom: 2rem;">
      <div v-for="stat in stats" :key="stat.title" class="card">
        <div class="label">{{ stat.title }}</div>
        <div :style="{ fontSize: '2rem', fontWeight: 'bold', color: `var(--${stat.color})` }">
          {{ stat.value }}
        </div>
      </div>
    </div>

    <div class="card">
      <h2 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem;">Hoạt động gần đây</h2>
      <p style="color: var(--text-muted);">Đang cập nhật...</p>
    </div>
  </div>
</template>
