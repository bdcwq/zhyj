/**
 * Auth utilities for the Mini Program.
 *
 * Handles WeChat login flow, token storage, store switching, and auth state helpers.
 */

import { request } from './request'

const TOKEN_KEY = 'auth-token'
const RESIDENT_KEY = 'resident-info'
const STORES_KEY = 'resident-stores'
const CURRENT_STORE_KEY = 'current-store-id'

export interface ResidentInfo {
  id: string
  name: string
}

export interface StoreSummary {
  id: string
  name: string
}

export interface WechatLoginResult {
  token: string
  resident: ResidentInfo
  stores: StoreSummary[]
  storeId: string
}

/**
 * WeChat login: calls uni.login() to get a temporary code,
 * then sends it to the backend to exchange for a JWT token.
 */
export async function wechatLogin(): Promise<WechatLoginResult> {
  // Step 1: Get WeChat login code
  const loginRes = await new Promise<UniApp.LoginRes>((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: resolve,
      fail: (err) => reject(new Error(err.errMsg || '微信登录失败')),
    })
  })

  const code = loginRes.code
  if (!code) {
    throw new Error('未获取到微信授权码')
  }

  console.log(`[auth] WeChat login code obtained: ${code.slice(0, 8)}...`)

  // Step 2: Send code to backend
  const res = await request<{
    token: string
    expiresIn: string
    user: { id: string; phone: string; name: string; stores: StoreSummary[] }
    resident: { id: string; name: string }
  }>({
    url: '/auth/resident/wechat',
    method: 'POST',
    data: { code },
    showErrorToast: true,
  })

  if (!res.success || !res.data) {
    throw new Error(res.error?.message || '微信登录失败')
  }

  const { token, user } = res.data
  const resident: ResidentInfo = { id: user.id, name: user.name }
  const stores = user.stores || []

  // Step 3: Persist token, resident info, and stores
  uni.setStorageSync(TOKEN_KEY, token)
  uni.setStorageSync(RESIDENT_KEY, JSON.stringify(resident))
  uni.setStorageSync(STORES_KEY, JSON.stringify(stores))

  // Store the current store ID (first store as default)
  const currentStoreId = stores.length > 0 ? stores[0].id : ''
  uni.setStorageSync(CURRENT_STORE_KEY, currentStoreId)

  console.log(`[auth] WeChat login success: ${resident.name}, stores: ${stores.length}`)

  return { token, resident, stores, storeId: currentStoreId }
}

/** Read the stored JWT token. */
export function getToken(): string | null {
  return uni.getStorageSync(TOKEN_KEY) || null
}

/** Read the stored resident info. */
export function getResidentInfo(): ResidentInfo | null {
  const raw = uni.getStorageSync(RESIDENT_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ResidentInfo
  } catch {
    return null
  }
}

/** Read the stored stores array. */
export function getResidentStores(): StoreSummary[] {
  const raw = uni.getStorageSync(STORES_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as StoreSummary[]
  } catch {
    return []
  }
}

/** Read the current store ID. */
export function getCurrentStoreId(): string {
  return uni.getStorageSync(CURRENT_STORE_KEY) || ''
}

/**
 * Switch resident to a different store.
 * Calls the switch-store API, then persists the new token and store selection.
 */
export async function switchResidentStore(storeId: string): Promise<{
  token: string
  stores: StoreSummary[]
}> {
  const res = await request<{
    token: string
    expiresIn: string
    user: { id: string; phone: string; name: string; stores: StoreSummary[] }
  }>({
    url: '/auth/resident/switch-store',
    method: 'POST',
    data: { storeId },
    showErrorToast: true,
  })

  if (!res.success || !res.data) {
    throw new Error(res.error?.message || '切换门店失败')
  }

  const { token, user } = res.data
  const stores = user.stores || []

  // Persist new token and store selection
  uni.setStorageSync(TOKEN_KEY, token)
  uni.setStorageSync(STORES_KEY, JSON.stringify(stores))
  uni.setStorageSync(CURRENT_STORE_KEY, storeId)

  console.log(`[auth] Store switched to: ${storeId}`)

  return { token, stores }
}

/** Clear all auth-related storage. */
export function clearAuth(): void {
  uni.removeStorageSync(TOKEN_KEY)
  uni.removeStorageSync(RESIDENT_KEY)
  uni.removeStorageSync(STORES_KEY)
  uni.removeStorageSync(CURRENT_STORE_KEY)
  console.log('[auth] Auth storage cleared')
}

/** Check if a valid token exists in storage. */
export function isLoggedIn(): boolean {
  const token = getToken()
  return !!token
}
