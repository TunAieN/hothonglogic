<script setup>
</script>

<template>
  <div class="layout">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-header">
        📦 Logistics
      </div>
      <nav class="nav">
        <router-link to="/" class="nav-link" active-class="active">
          📊 Tổng quan
        </router-link>
        <router-link to="/orders" class="nav-link" active-class="active">
          🛍️ Đơn hàng
        </router-link>
        <router-link to="/customers" class="nav-link" active-class="active">
          👥 Khách hàng
        </router-link>
        <div class="nav-link">
          🏭 Kho hàng (Sắp tới)
        </div>
      </nav>
    </aside>

    <!-- Main Content -->
    <main class="main-content">
      <header class="top-bar">
        <div>Hệ thống quản lý</div>
        <div class="user-profile">Admin</div>
      </header>

      <div class="content-area">
        <router-view />
      </div>
    </main>
  </div>
</template>
