<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'

const customers = ref([])
const loading = ref(false)
const API_URL = 'http://localhost/extention/api'

onMounted(async () => {
    await fetchCustomers()
})

async function fetchCustomers() {
    loading.value = true
    try {
        const response = await axios.get(`${API_URL}/customers.php`)
        if (response.data && response.data.data) {
           customers.value = response.data.data
        }
    } catch (error) {
        console.error('Error fetching customers:', error)
    } finally {
        loading.value = false
    }
}
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
      <h1 class="title">Danh sách khách hàng</h1>
      <button class="btn btn-primary">➕ Thêm mới</button>
    </div>

    <div class="card table-container">
      <div v-if="loading" style="padding: 2rem; text-align: center;">Đang tải...</div>
      
      <table v-else class="table">
        <thead>
          <tr>
            <th>Mã KH</th>
            <th>Họ tên</th>
            <th>Điện thoại</th>
            <th>Email</th>
            <th>Địa chỉ</th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="customer in customers" :key="customer.id">
            <td style="font-weight: 600;">{{ customer.code }}</td>
            <td>{{ customer.name }}</td>
            <td>{{ customer.phone }}</td>
            <td>{{ customer.email || '-' }}</td>
            <td>{{ customer.address || '-' }}</td>
            <td>
              <span class="status-badge status-active">{{ customer.status }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
