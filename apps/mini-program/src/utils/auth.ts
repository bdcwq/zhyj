/**
 * Auth utilities for the Mini Program.
 *
 * Handles WeChat login flow, token storage, and auth state helpers.
 */

import { request } from './request'

const TOKEN_KEY = 'auth-token'
const RESIDENT_KEY = 'resident-info'

export interface ResidentInfo {
  id: string
  name: string
}

export interface WechatLoginResult {
  token: string
  resident: ResidentInfo
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
  const res = await request<{ token: string; resident: ResidentInfo }>({
    url: '/auth/resident/wechat',
    method: 'POST',
    data: { code },
    showErrorToast: true,
  })

  if (!res.success || !res.data) {
    throw new Error(res.error?.message || '微信登录失败')
  }

  const { token, resident } = res.data

  // Step 3: Persist token and resident info
  uni.setStorageSync(TOKEN_KEY, token)
  uni.setStorageSync(RESIDENT_KEY, JSON.stringify(resident))

  console.log(`[auth] WeChat login success: ${resident.name}`)

  return { token, resident }
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

/** Clear all auth-related storage. */
export function clearAuth(): void {
  uni.removeStorageSync(TOKEN_KEY)
  uni.removeStorageSync(RESIDENT_KEY)
  console.log('[auth] Auth storage cleared')
}

/** Check if a valid token exists in storage. */
export function isLoggedIn(): boolean {
  const token = getToken()
  return !!token
}
