<template>
  <view class="index-page">
    <!-- Header greeting -->
    <view class="greeting-section">
      <text class="greeting-text">{{ greeting }}</text>
      <text class="resident-name">{{ displayName }}，您好！</text>
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

function goToMonitoring() {
  uni.navigateTo({ url: '/pages/monitoring/monitoring' })
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
0rpx;
}

.feature-desc {
  font-size: 24rpx;
  color: #999;
}
</style>
