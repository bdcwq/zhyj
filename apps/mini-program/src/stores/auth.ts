import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  wechatLogin as doWechatLogin,
  getToken,
  getResidentInfo,
  getResidentStores,
  getCurrentStoreId,
  switchResidentStore as doSwitchStore,
  clearAuth,
  type ResidentInfo,
  type StoreSummary,
} from '@/utils/auth'
import { request } from '@/utils/request'

export const useAuthStore = defineStore('auth', () => {
  // ── State ──
  const token = ref<string | null>(null)
  const resident = ref<ResidentInfo | null>(null)
  const stores = ref<StoreSummary[]>([])
  const currentStoreId = ref<string>('')

  // ── Getters ──
  const isLoggedIn = computed(() => !!token.value)
  const residentName = computed(() => resident.value?.name || '')
  const residentPhone = computed(() => resident.value?.phone || '')
  const registrationSource = computed(() => resident.value?.registrationSource || '')
  const currentStoreName = computed(() => {
    const store = stores.value.find((s) => s.id === currentStoreId.value)
    return store?.name || '未选择门店'
  })

  // ── Actions ──

  /** Restore auth state from local storage (called on app launch). */
  function loadFromStorage() {
    token.value = getToken()
    resident.value = getResidentInfo()
    stores.value = getResidentStores()
    currentStoreId.value = getCurrentStoreId()
  }

  /** Perform WeChat login and update store state. */
  async function login() {
    const result = await doWechatLogin()
    token.value = result.token
    resident.value = result.resident
    stores.value = result.stores
    currentStoreId.value = result.storeId
    return result
  }

  /** Switch to a different store. Updates token, stores, and currentStoreId. */
  async function switchStore(storeId: string) {
    try {
      const result = await doSwitchStore(storeId)
      token.value = result.token
      stores.value = result.stores
      currentStoreId.value = storeId
      uni.showToast({ title: '门店切换成功', icon: 'success' })
    } catch {
      uni.showToast({ title: '切换门店失败，请重试', icon: 'none' })
    }
  }

  /** Clear auth state, notify server, and redirect to login page. */
  async function logout() {
    try {
      const storedToken = uni.getStorageSync('auth-token')
      if (storedToken) {
        await request({ url: '/auth/logout', method: 'POST', showErrorToast: false })
      }
    } catch {
      // Best-effort server logout — proceed with local cleanup regardless
    }
    token.value = null
    resident.value = null
    stores.value = []
    currentStoreId.value = ''
    clearAuth()
    uni.reLaunch({ url: '/pages/login/login' })
  }

  return {
    token,
    resident,
    stores,
    currentStoreId,
    isLoggedIn,
    residentName,
    residentPhone,
    registrationSource,
    currentStoreName,
    loadFromStorage,
    login,
    switchStore,
    logout,
  }
})
