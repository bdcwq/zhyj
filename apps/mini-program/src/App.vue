<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'
import { useAuthStore } from './stores/auth'

onLaunch(() => {
  const authStore = useAuthStore()
  authStore.loadFromStorage()

  if (authStore.isLoggedIn) {
    console.log('[app] User already logged in:', authStore.resident?.name)
  } else {
    console.log('[app] No stored session, redirecting to login')
  }
})
</script>

<style>
page {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 28rpx;
  color: #1d1d1f;
  background-color: #f5f5f7;
}
</style>
