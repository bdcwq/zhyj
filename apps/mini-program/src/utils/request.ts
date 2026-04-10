/**
 * HTTP request wrapper for uni-app.
 *
 * - Auto-attaches Bearer token from local storage
 * - Handles 401 by clearing auth and redirecting to login
 * - Returns typed responses with the project's API envelope shape
 */

const BASE_URL = 'http://localhost:3000/api/v1'

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

interface RequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: Record<string, unknown>
  header?: Record<string, string>
  showLoading?: boolean
  showErrorToast?: boolean
}

export function request<T = unknown>(options: RequestOptions): Promise<ApiResponse<T>> {
  const {
    url,
    method = 'GET',
    data,
    header = {},
    showLoading = false,
    showErrorToast = true,
  } = options

  // Auto-attach auth token
  const token = uni.getStorageSync('auth-token')
  if (token) {
    header['Authorization'] = `Bearer ${token}`
  }
  header['Content-Type'] = header['Content-Type'] || 'application/json'

  if (showLoading) {
    uni.showLoading({ title: '加载中...', mask: true })
  }

  return new Promise((resolve) => {
    uni.request({
      url: `${BASE_URL}${url}`,
      method,
      data,
      header,
      success(res) {
        const statusCode = res.statusCode

        // Handle 401 — token expired or invalid
        if (statusCode === 401) {
          console.warn('[request] 401 Unauthorized, clearing auth')
          clearAuthAndRedirect()
          resolve({ success: false, error: { code: 'AUTH_006', message: '登录已过期，请重新登录' } })
          return
        }

        // Parse API envelope
        const body = res.data as ApiResponse<T>

        if (statusCode >= 200 && statusCode < 300 && body.success) {
          resolve(body)
        } else {
          // Show error toast for non-success responses
          if (showErrorToast) {
            uni.showToast({
              title: body.error?.message || '请求失败',
              icon: 'none',
              duration: 2000,
            })
          }
          resolve(body)
        }
      },
      fail(err) {
        console.error(`[request] Network error: ${err.errMsg}`)

        if (showLoading) {
          uni.hideLoading()
        }

        if (showErrorToast) {
          uni.showToast({
            title: '网络连接失败',
            icon: 'none',
            duration: 2000,
          })
        }

        resolve({
          success: false,
          error: { code: 'NETWORK_ERROR', message: '网络连接失败' },
        })
      },
      complete() {
        if (showLoading) {
          uni.hideLoading()
        }
      },
    })
  })
}

function clearAuthAndRedirect() {
  uni.removeStorageSync('auth-token')
  uni.removeStorageSync('resident-info')
  uni.reLaunch({ url: '/pages/login/login' })
}

export default request
