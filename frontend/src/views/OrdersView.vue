<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'

const orders = ref([])
const loading = ref(false)

// Determine API URL based on environment
// For now we hardcode to standalone PHP script path or Laravel
const API_URL = 'http://localhost/extention/api'

onMounted(async () => {
    await fetchOrders()
})

async function fetchOrders() {
    loading.value = true
    try {
        // Try getting orders - logic similar to extension
        // Support direct PHP file or Laravel route
        // For development let's try the Laravel route first if served, or fallback
        // Here assuming we use the same endpoint logic as extension
        const response = await axios.get(`${API_URL}/orders.php`)
        if (response.data && response.data.data) {
           // Handle pagination or direct array
           orders.value = Array.isArray(response.data.data) ? response.data.data : response.data.data.data
        }
    } catch (error) {
        console.error('Error fetching orders:', error)
        // Fallback or show error
    } finally {
        loading.value = false
    }
}
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
      <h1 class="title">Quản lý đơn hàng</h1>
      <button class="btn btn-primary" @click="fetchOrders">🔄 Làm mới</button>
    </div>

    <div class="card table-container">
      <div v-if="loading" style="padding: 2rem; text-align: center;">Đang tải...</div>
      
      <table v-else class="table">
        <thead>
          <tr>
            <th>Mã đơn</th>
            <th>Khách hàng</th>
            <th>Tổng tiền</th>
            <th>Trạng thái</th>
            <th>Ngày tạo</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="order in orders" :key="order.id">
            <td style="font-weight: 600;">{{ order.order_code }}</td>
            <td>{{ order.customer_id }}</td> <!-- Should join with customer name ideally -->
            <td style="color: #ef4444; font-weight: 500;">¥{{ order.total_amount }}</td>
            <td>
              <span class="status-badge status-pending" v-if="order.status === 'pending'">Chờ duyệt</span>
              <span class="status-badge status-active" v-else>{{ order.status }}</span>
            </td>
            <td>{{ new Date(order.created_at).toLocaleDateString('vi-VN') }}</td>
            <td>
              <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Chi tiết</button>
            </td>
          </tr>
          <tr v-if="orders.length === 0">
            <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">Chưa có đơn hàng nào</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
