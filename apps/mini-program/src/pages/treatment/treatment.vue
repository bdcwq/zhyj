<template>
  <view class="treatment-page">
    <!-- Loading -->
    <view v-if="loading && sessions.length === 0" class="loading-section">
      <uni-load-more status="loading" />
    </view>

    <!-- Session list -->
    <view v-else-if="sessions.length > 0" class="session-list">
      <view
        v-for="item in sessions"
        :key="item.id"
        class="session-card"
      >
        <view class="card-header">
          <text class="card-date">{{ formatStartedAt(item.startedAt) }}</text>
          <view class="status-badge" :class="statusBadgeClass(item.status)">
            <text class="status-text">{{ statusLabel(item.status) }}</text>
          </view>
        </view>
        <view class="card-body">
          <view v-if="item.appointment?.room" class="card-row">
            <text class="card-label">房间</text>
            <text class="card-value">{{ item.appointment.room.name }}</text>
          </view>
          <view v-if="item.appointment?.machine" class="card-row">
            <text class="card-label">仪器</text>
            <text class="card-value">{{ item.appointment.machine.name }}</text>
          </view>
          <view v-if="item.routineName" class="card-row">
            <text class="card-label">方案</text>
            <text class="card-value">{{ item.routineName }}</text>
          </view>
        </view>
      </view>

      <!-- Load more -->
      <view v-if="hasMore" class="load-more-section">
        <view v-if="loadingMore" class="loading-section">
          <uni-load-more status="loading" />
        </view>
        <view v-else class="load-more-btn" @tap="loadMore">
          <text class="load-more-text">加载更多</text>
        </view>
      </view>

      <!-- No more data -->
      <view v-else-if="sessions.length > 0" class="no-more-section">
        <text class="no-more-text">— 共 {{ total }} 条记录 —</text>
      </view>
    </view>

    <!-- Empty state -->
    <view v-else class="empty-section">
      <text class="empty-icon">🤖</text>
      <text class="empty-text">暂无理疗记录</text>
      <text class="empty-desc">预约并完成理疗后，记录将显示在这里</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { request } from '@/utils/request'

// ── Types ──

interface SessionItem {
  id: string
  startedAt: string
  endedAt: string | null
  status: string
  routineName: string | null
  appointment: {
    room: { id: string; name: string } | null
    machine: { id: string; name: string } | null
  } | null
}

interface SessionListResponse {
  records: SessionItem[]
  total: number
  limit: number
  offset: number
}

// ── Status maps ──

const STATUS_LABELS: Record<string, string> = {
  pending: '待执行',
  in_progress: '进行中',
  completed: '已完成',
  failed: '执行失败',
  cancelled: '已取消',
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  pending: 'status-badge--blue',
  in_progress: 'status-badge--orange',
  completed: 'status-badge--green',
  failed: 'status-badge--red',
  cancelled: 'status-badge--gray',
}

// ── State ──

const sessions = ref<SessionItem[]>([])
const total = ref(0)
const loading = ref(true)
const loadingMore = ref(false)
const PAGE_SIZE = 20

// ── Computed ──

const hasMore = ref(false)

// ── Lifecycle ──

onShow(() => {
  // Reset and reload on every page show
  sessions.value = []
  total.value = 0
  hasMore.value = false
  loadSessions()
})

// ── Data fetching ──

async function loadSessions() {
  loading.value = true
  try {
    const res = await request<SessionListResponse>({
      url: `/robot-sessions/my?limit=${PAGE_SIZE}&offset=0`,
      showLoading: true,
    })
    if (res.success && res.data) {
      sessions.value = res.data.records
      total.value = res.data.total
      hasMore.value = sessions.value.length < total.value
      console.log('[treatment] Loaded', sessions.value.length, 'sessions (total:', total.value, ')')
    } else {
      console.error('[treatment] Failed to load sessions:', res.error?.message)
      sessions.value = []
      total.value = 0
      hasMore.value = false
    }
  } catch (error) {
    console.error('[treatment] Error loading sessions:', error)
    sessions.value = []
    total.value = 0
    hasMore.value = false
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try {
    const offset = sessions.value.length
    const res = await request<SessionListResponse>({
      url: `/robot-sessions/my?limit=${PAGE_SIZE}&offset=${offset}`,
    })
    if (res.success && res.data) {
      sessions.value = [...sessions.value, ...res.data.records]
      total.value = res.data.total
      hasMore.value = sessions.value.length < total.value
      console.log('[treatment] Loaded more, now', sessions.value.length, 'sessions')
    } else {
      console.error('[treatment] Failed to load more sessions:', res.error?.message)
    }
  } catch (error) {
    console.error('[treatment] Error loading more sessions:', error)
  } finally {
    loadingMore.value = false
  }
}

// ── Helpers ──

function statusLabel(status: string): string {
  return STATUS_LABELS[status] || status
}

function statusBadgeClass(status: string): string {
  return STATUS_BADGE_CLASSES[status] || ''
}

function formatStartedAt(dateStr: string): string {
  const d = new Date(dateStr)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}`
}
</script>

<style scoped>
.treatment-page {
  min-height: 100vh;
  background-color: #f5f5f7;
  padding: 30rpx;
  padding-bottom: 120rpx;
}

/* Loading */
.loading-section {
  padding: 80rpx 0;
}

/* Session list */
.session-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.session-card {
  background-color: #ffffff;
  border-radius: 16rpx;
  padding: 28rpx 30rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.card-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}

.card-date {
  font-size: 28rpx;
  font-weight: 600;
  color: #1d1d1f;
}

/* Status badges */
.status-badge {
  padding: 6rpx 20rpx;
  border-radius: 20rpx;
}

.status-badge--blue {
  background-color: rgba(0, 113, 227, 0.1);
}
.status-badge--blue .status-text {
  color: #0071e3;
}

.status-badge--green {
  background-color: rgba(52, 199, 89, 0.1);
}
.status-badge--green .status-text {
  color: #07c160;
}

.status-badge--orange {
  background-color: rgba(255, 159, 10, 0.1);
}
.status-badge--orange .status-text {
  color: #FF9F0A;
}

.status-badge--gray {
  background-color: rgba(174, 174, 178, 0.1);
}
.status-badge--gray .status-text {
  color: #aeaeb2;
}

.status-badge--red {
  background-color: rgba(255, 59, 48, 0.1);
}
.status-badge--red .status-text {
  color: #FF3B30;
}

.status-text {
  font-size: 24rpx;
  font-weight: 500;
}

/* Card body */
.card-body {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.card-row {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.card-label {
  font-size: 26rpx;
  color: #aeaeb2;
  width: 100rpx;
}

.card-value {
  font-size: 26rpx;
  color: #1d1d1f;
}

/* Load more */
.load-more-section {
  padding: 30rpx 0;
}

.load-more-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20rpx 0;
}

.load-more-text {
  font-size: 26rpx;
  color: #07c160;
}

.no-more-section {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx 0;
}

.no-more-text {
  font-size: 24rpx;
  color: #d2d2d7;
}

/* Empty state */
.empty-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 160rpx 0;
}

.empty-icon {
  font-size: 120rpx;
  margin-bottom: 30rpx;
}

.empty-text {
  font-size: 32rpx;
  color: #86868b;
  margin-bottom: 16rpx;
}

.empty-desc {
  font-size: 26rpx;
  color: #d2d2d7;
}
</style>
