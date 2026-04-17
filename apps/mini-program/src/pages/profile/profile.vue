<template>
  <view class="profile-page">
    <!-- Profile header -->
    <view class="profile-header">
      <view class="avatar">
        <text class="avatar-text">{{ avatarLetter }}</text>
      </view>
      <view class="profile-info">
        <text class="profile-name">{{ displayName }}</text>
        <text class="profile-phone">{{ maskedPhone }}</text>
      </view>
    </view>

    <!-- Quick links -->
    <view class="quick-links-section">
      <view class="quick-link-item" @tap="goToTreatment">
        <text class="quick-link-icon">🤖</text>
        <text class="quick-link-text">理疗记录</text>
        <text class="quick-link-arrow">›</text>
      </view>
      <view class="quick-link-item" @tap="goToHealth">
        <text class="quick-link-icon">📋</text>
        <text class="quick-link-text">健康档案</text>
        <text class="quick-link-arrow">›</text>
      </view>
    </view>

    <!-- Info section -->
    <view class="info-section">
      <view class="info-item">
        <text class="info-label">注册来源</text>
        <text class="info-value">{{ registrationSourceText }}</text>
      </view>
      <view class="info-item">
        <text class="info-label">角色</text>
        <text class="info-value">居民用户</text>
      </view>
    </view>

    <!-- Actions -->
    <view class="action-section">
      <view class="action-item" @tap="handleLogout">
        <text class="action-text action-text--danger">退出登录</text>
      </view>
    </view>

    <!-- Version -->
    <view class="version">
      <text class="version-text">社区健康管理 v1.0.0</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

const displayName = computed(() => authStore.residentName || '未登录')
const avatarLetter = computed(() => displayName.value.charAt(0))

const maskedPhone = computed(() => {
  const phone = authStore.phone
  if (!phone || phone.length < 7) return '未绑定手机'
  return phone.slice(0, 3) + '****' + phone.slice(-4)
})

const registrationSourceText = computed(() => {
  const source = authStore.registrationSource
  if (source === 'WECHAT') return '微信授权登录'
  if (source) return source
  return '未知'
})

function goToTreatment() {
  uni.navigateTo({ url: '/pages/treatment/treatment' })
}

function goToHealth() {
  uni.navigateTo({ url: '/pages/health/health' })
}

function handleLogout() {
  uni.showModal({
    title: '提示',
    content: '确定要退出登录吗？',
    success(res) {
      if (res.confirm) {
        authStore.logout()
      }
    },
  })
}
</script>

<style scoped>
.profile-page {
  min-height: 100vh;
  background-color: #f5f5f5;
}

.profile-header {
  background: linear-gradient(135deg, #07c160, #06ad56);
  padding: 60rpx 40rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
}

.avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 60rpx;
  background-color: rgba(255, 255, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 30rpx;
}

.avatar-text {
  font-size: 48rpx;
  font-weight: 700;
  color: #ffffff;
}

.profile-info {
  display: flex;
  flex-direction: column;
}

.profile-name {
  font-size: 36rpx;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 8rpx;
}

.profile-phone {
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.8);
}

/* Quick links */
.quick-links-section {
  margin: 30rpx;
  background-color: #ffffff;
  border-radius: 20rpx;
  overflow: hidden;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.quick-link-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 30rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.quick-link-item:last-child {
  border-bottom: none;
}

.quick-link-icon {
  font-size: 40rpx;
  margin-right: 20rpx;
}

.quick-link-text {
  flex: 1;
  font-size: 28rpx;
  color: #333;
}

.quick-link-arrow {
  font-size: 32rpx;
  color: #ccc;
}

/* Info section */
.info-section {
  margin: 0 30rpx 30rpx;
  background-color: #ffffff;
  border-radius: 20rpx;
  overflow: hidden;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.info-item {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 30rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.info-item:last-child {
  border-bottom: none;
}

.info-label {
  font-size: 28rpx;
  color: #666;
}

.info-value {
  font-size: 28rpx;
  color: #333;
}

.action-section {
  margin: 0 30rpx 30rpx;
  background-color: #ffffff;
  border-radius: 20rpx;
  overflow: hidden;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.action-item {
  padding: 30rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-text {
  font-size: 30rpx;
}

.action-text--danger {
  color: #e53935;
}

.version {
  margin-top: 60rpx;
  display: flex;
  justify-content: center;
}

.version-text {
  font-size: 24rpx;
  color: #ccc;
}
</style>
