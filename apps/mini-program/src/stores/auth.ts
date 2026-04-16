import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  wechatLogin as doWechatLogin,
  getToken,
  getResidentInfo,
  clearAuth,
  type ResidentInfo,
} from '@/utils/auth'

export const useAuthStore = defineStore('auth', () => {
  // ── State ──
  const token = ref<string | null>(null)
  const resident = ref<ResidentInfo | null>(null)

  // ── Getters ──
  const isLoggedIn = computed(() => !!token.value)
  const residentName = computed(() => resident.value?.name || '')

  // ── Actions ──

  /** Restore auth state from local storage (called on app launch). */
  function loadFromStorage() {
    token.value = getToken()
    resident.value = getResidentInfo()
  }

  /** Perform WeChat login and update store state. */
  async function login() {
    const result = await doWechatLogin()
    token.value = result.token
    resident.value = result.resident
    return result
  }

  /** Clear auth state, notify server, and redirect to login page. */
  async function logout() {
    try {
      const token = uni.getStorageSync('auth-token')
      if (token) {
        await request({ url: '/auth/logout', method: 'POST', showErrorToast: false })
      }
    } catch {
      // Best-effort server logout — proceed with local cleanup regardless
    }
    token.value = null
    resident.value = null
    clearAuth()
    uni.reLaunch({ url: '/pages/login/login' })
  }

  return {
    token,
    resident,
    isLoggedIn,
    residentName,
    loadFromStorage,
    login,
    logout,
  }
})
