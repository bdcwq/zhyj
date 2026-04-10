<template>
  <view class="login-page">
    <view class="login-container">
      <!-- Logo area -->
      <view class="logo-area">
        <view class="logo-icon">🏥</view>
        <text class="app-title">社区健康管理</text>
        <text class="app-subtitle">智慧健康 · 贴心服务</text>
      </view>

      <!-- WeChat login button -->
      <view class="login-actions">
        <button
          class="wechat-btn"
          :class="{ 'wechat-btn--loading': isLoading }"
          :disabled="isLoading"
          @tap="handleWechatLogin"
        >
          <text class="wechat-btn__icon">💬</text>
          <text class="wechat-btn__text">
            {{ isLoading ? '登录中...' : '微信一键登录' }}
          </text>
        </button>
      </view>

      <!-- Terms -->
      <view class="terms">
        <text class="terms-text">登录即表示您同意</text>
        <text class="terms-link">《用户服务协议》</text>
        <text class="terms-text">和</text>
        <text class="terms-link">《隐私政策》</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const isLoading = ref(false)

async function handleWechatLogin() {
  if (isLoading.value) return

  isLoading.value = true
  try {
    await authStore.login()

    uni.showToast({ title: '登录成功', icon: 'success' })

    setTimeout(() => {
      uni.switchTab({ url: '/pages/index/index' })
    }, 500)
  } catch (error) {
    const message = error instanceof Error ? error.message : '登录失败'
    console.error('[login] WeChat login failed:', message)
    uni.showToast({ title: message, icon: 'none', duration: 3000 })
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #e8f5e9 0%, #f5f5f5 100%);
  padding: 0 60rpx;
}

.login-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.logo-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 120rpx;
}

.logo-icon {
  font-size: 120rpx;
  margin-bottom: 30rpx;
}

.app-title {
  font-size: 48rpx;
  font-weight: 700;
  color: #2e7d32;
  margin-bottom: 16rpx;
}

.app-subtitle {
  font-size: 28rpx;
  color: #666;
}

.login-actions {
  width: 100%;
  margin-bottom: 60rpx;
}

.wechat-btn {
  width: 100%;
  height: 96rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  background-color: #07c160;
  border-radius: 48rpx;
  border: none;
  box-shadow: 0 8rpx 24rpx rgba(7, 193, 96, 0.3);
}

.wechat-btn--loading {
  opacity: 0.7;
}

.wechat-btn__icon {
  font-size: 40rpx;
  margin-right: 16rpx;
}

.wechat-btn__text {
  font-size: 32rpx;
  font-weight: 600;
  color: #ffffff;
}

.terms {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
}

.terms-text {
  font-size: 24rpx;
  color: #999;
}

.terms-link {
  font-size: 24rpx;
  color: #07c160;
}
</style>
