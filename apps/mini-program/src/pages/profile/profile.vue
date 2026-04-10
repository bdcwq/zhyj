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
  // If we had the phone from resident info, mask it
  // For now, show a placeholder since the login response only returns id + name
  return '微信用户'
})

const registrationSourceText = computed(() => {
  return '微信授权登录'
})

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

.info-section {
  margin: 30rpx;
  background-color: #ffffff;
  border-radius: 20rpx;
  overflow: hidden;
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
  margin: 30rpx;
  background-color: #ffffff;
  border-radius: 20rpx;
  overflow: hidden;
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
