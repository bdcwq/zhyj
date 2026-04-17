<template>
  <view class="index-page">
    <!-- Header greeting -->
    <view class="greeting-section">
      <text class="greeting-text">{{ greeting }}</text>
      <text class="resident-name">{{ displayName }}，您好！</text>

      <!-- Store switcher: shown when bound to multiple stores -->
      <view
        v-if="authStore.stores.length > 1"
        class="store-switcher"
        @tap="openStorePicker"
      >
        <text class="store-switcher-label">当前门店</text>
        <text class="store-switcher-name">{{ authStore.currentStoreName }}</text>
        <text class="store-switcher-arrow">▼</text>
      </view>
    </view>

    <!-- Feature cards -->
    <view class="feature-grid">
      <view class="feature-card" @tap="goToMonitoring">
        <text class="feature-icon">📊</text>
        <text class="feature-title">体质监测</text>
        <text class="feature-desc">查看您的体质健康报告</text>
      </view>

      <view class="feature-card" @tap="goToAppointments">
        <text class="feature-icon">📅</text>
        <text class="feature-title">预约管理</text>
        <text class="feature-desc">预约艾灸理疗服务</text>
      </view>

      <view class="feature-card">
        <text class="feature-icon">🤖</text>
        <text class="feature-title">理疗记录</text>
        <text class="feature-desc">查看历史理疗记录</text>
      </view>

      <view class="feature-card">
        <text class="feature-icon">📋</text>
        <text class="feature-title">健康档案</text>
        <text class="feature-desc">管理您的健康信息</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

const displayName = computed(() => authStore.residentName || '用户')

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
})

/** Open native action sheet to pick a store. */
function openStorePicker() {
  const storeList = authStore.stores
  if (storeList.length <= 1) return

  const storeNames = storeList.map((s) => s.name)
  const currentIndex = storeList.findIndex((s) => s.id === authStore.currentStoreId)

  uni.showActionSheet({
    itemList: storeNames,
    currentIndex: currentIndex >= 0 ? currentIndex : 0,
    success: (res) => {
      const selectedStore = storeList[res.tapIndex]
      if (selectedStore && selectedStore.id !== authStore.currentStoreId) {
        authStore.switchStore(selectedStore.id)
      }
    },
  })
}

function goToMonitoring() {
  uni.navigateTo({ url: '/pages/monitoring/monitoring' })
}

function goToAppointments() {
  uni.navigateTo({ url: '/pages/appointments/appointments' })
}
</script>

<style scoped>
.index-page {
  padding: 40rpx;
  min-height: 100vh;
  background-color: #f5f5f5;
}

.greeting-section {
  padding: 40rpx 30rpx;
  margin-bottom: 30rpx;
}

.greeting-text {
  display: block;
  font-size: 28rpx;
  color: #666;
  margin-bottom: 10rpx;
}

.resident-name {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
  color: #333;
  margin-bottom: 20rpx;
}

.store-switcher {
  display: inline-flex;
  align-items: center;
  background-color: #e8f4e8;
  border-radius: 30rpx;
  padding: 10rpx 24rpx;
  gap: 12rpx;
}

.store-switcher-label {
  font-size: 24rpx;
  color: #888;
}

.store-switcher-name {
  font-size: 26rpx;
  color: #2d8c2d;
  font-weight: 600;
  max-width: 300rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.store-switcher-arrow {
  font-size: 20rpx;
  color: #2d8c2d;
}

.feature-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24rpx;
}

.feature-card {
  background-color: #ffffff;
  border-radius: 20rpx;
  padding: 36rpx 30rpx;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.feature-icon {
  font-size: 56rpx;
  margin-bottom: 20rpx;
}

.feature-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #333;
  margin-bottom: 10rpx;
}

.feature-desc {
  font-size: 24rpx;
  color: #999;
}
</style>
