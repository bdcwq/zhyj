<template>
  <view class="monitoring-page">
    <!-- Loading state -->
    <view v-if="loading" class="loading-section">
      <uni-load-more status="loading" />
    </view>

    <!-- Content -->
    <view v-else-if="records.length > 0">
      <!-- Stats summary -->
      <view class="stats-section">
        <view class="stat-card">
          <text class="stat-value">{{ stats?.totalCount ?? 0 }}</text>
          <text class="stat-label">总监测次数</text>
        </view>
        <view class="stat-card">
          <text class="stat-value">{{ stats?.averageScore ?? 0 }}</text>
          <text class="stat-label">平均评分</text>
        </view>
        <view class="stat-card">
          <text class="stat-value">{{ stats?.latestScore ?? '-' }}</text>
          <text class="stat-label">最近评分</text>
        </view>
      </view>

      <!-- Score trend chart -->
      <view class="chart-section">
        <text class="section-title">评分趋势</text>
        <canvas
          v-if="records.length >= 2"
          type="2d"
          id="scoreChart"
          class="score-chart"
        />
        <view v-else class="chart-placeholder">
          <text class="placeholder-text">至少需要2条记录才能显示趋势图</text>
        </view>
      </view>

      <!-- Score history list -->
      <view class="records-section">
        <text class="section-title">监测记录</text>
        <view
          v-for="record in records"
          :key="record.id"
          class="record-card"
        >
          <view class="record-header">
            <text class="record-date">{{ formatDate(record.monitoringDate) }}</text>
            <view
              class="score-badge"
              :class="{
                'score-badge--high': record.score >= 80,
                'score-badge--mid': record.score >= 60 && record.score < 80,
                'score-badge--low': record.score < 60,
              }"
            >
              <text class="score-badge-text">{{ record.score }}分</text>
            </view>
          </view>
          <view class="record-body">
            <text class="record-type-tag">{{ record.constitutionType || '综合评估' }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- Empty state -->
    <view v-else class="empty-section">
      <text class="empty-icon">📊</text>
      <text class="empty-text">暂无监测记录</text>
      <text class="empty-desc">您的体质监测数据将在此处展示</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { onMounted } from 'vue'
import { request } from '@/utils/request'
import { useAuthStore } from '@/stores/auth'

// ── Types ──

interface MonitoringRecord {
  id: string
  score: number
  monitoringDate: string
  constitutionType: string | null
}

interface HistoryStats {
  totalCount: number
  averageScore: number
  latestScore: number | null
}

// ── State ──

const records = ref<MonitoringRecord[]>([])
const stats = ref<HistoryStats | null>(null)
const loading = ref(true)
const authStore = useAuthStore()

// ── Data fetching ──

onMounted(async () => {
  const residentId = authStore.resident?.id
  if (!residentId) {
    console.warn('[monitoring] No residentId found, cannot fetch history')
    loading.value = false
    return
  }

  try {
    console.log('[monitoring] Fetching history for resident:', residentId)
    const res = await request<{ records: MonitoringRecord[]; stats: HistoryStats }>({
      url: `/residents/${residentId}/monitoring-history`,
      showLoading: true,
    })

    if (res.success && res.data) {
      records.value = res.data.records
      stats.value = res.data.stats
      console.log('[monitoring] Loaded', records.value.length, 'records')

      // Draw chart after DOM update
      if (records.value.length >= 2) {
        await nextTick()
        setTimeout(() => drawChart(), 300)
      }
    } else {
      console.error('[monitoring] Failed to fetch history:', res.error?.message)
      uni.showToast({ title: res.error?.message || '加载失败', icon: 'none' })
    }
  } catch (error) {
    console.error('[monitoring] Error fetching history:', error)
    uni.showToast({ title: '加载监测记录失败', icon: 'none' })
  } finally {
    loading.value = false
  }
})

// ── Canvas 2D chart ──

function drawChart() {
  const query = uni.createSelectorQuery()
  let canvasNode: any = null
  let canvasWidth = 0
  let canvasHeight = 0

  query
    .select('#scoreChart')
    .fields({ node: true, size: true }, (res: any) => {
      if (res) {
        canvasNode = res.node
        canvasWidth = res.width
        canvasHeight = res.height
      }
    })
    .exec(() => {
      if (!canvasNode) {
        console.warn('[monitoring] Canvas node not found')
        return
      }

      const canvas = canvasNode
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
      const dpr = uni.getSystemInfoSync().pixelRatio

      const displayWidth = canvasWidth
      const displayHeight = canvasHeight
      canvas.width = displayWidth * dpr
      canvas.height = displayHeight * dpr
      ctx.scale(dpr, dpr)

      const w = displayWidth
      const h = displayHeight

      // Chart margins
      const marginTop = 30
      const marginBottom = 40
      const marginLeft = 50
      const marginRight = 20
      const chartW = w - marginLeft - marginRight
      const chartH = h - marginTop - marginBottom

      // Prepare data (oldest first for chart)
      const sorted = [...records.value].reverse()
      const scores = sorted.map((r) => r.score)
      const dates = sorted.map((r) => formatDateShort(r.monitoringDate))
      const minScore = 0
      const maxScore = 100

      // Clear
      ctx.clearRect(0, 0, w, h)

      // Background
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)

      // Grid lines and Y-axis labels
      ctx.strokeStyle = '#f0f0f0'
      ctx.lineWidth = 1
      ctx.fillStyle = '#999'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'right'

      const yTicks = [0, 25, 50, 75, 100]
      for (const tick of yTicks) {
        const y = marginTop + chartH - (tick / maxScore) * chartH
        ctx.beginPath()
        ctx.moveTo(marginLeft, y)
        ctx.lineTo(w - marginRight, y)
        ctx.stroke()
        ctx.fillText(String(tick), marginLeft - 8, y + 3)
      }

      // Compute point positions
      const n = scores.length
      const points: { x: number; y: number }[] = []
      for (let i = 0; i < n; i++) {
        const x = n === 1 ? marginLeft + chartW / 2 : marginLeft + (i / (n - 1)) * chartW
        const y = marginTop + chartH - (scores[i] / maxScore) * chartH
        points.push({ x, y })
      }

      // Draw line
      if (points.length >= 2) {
        ctx.beginPath()
        ctx.strokeStyle = '#07c160'
        ctx.lineWidth = 2
        ctx.lineJoin = 'round'
        ctx.moveTo(points[0].x, points[0].y)
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y)
        }
        ctx.stroke()

        // Draw gradient fill under the line
        ctx.beginPath()
        ctx.moveTo(points[0].x, marginTop + chartH)
        ctx.lineTo(points[0].x, points[0].y)
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y)
        }
        ctx.lineTo(points[points.length - 1].x, marginTop + chartH)
        ctx.closePath()
        const gradient = ctx.createLinearGradient(0, marginTop, 0, marginTop + chartH)
        gradient.addColorStop(0, 'rgba(7, 193, 96, 0.2)')
        gradient.addColorStop(1, 'rgba(7, 193, 96, 0.02)')
        ctx.fillStyle = gradient
        ctx.fill()
      }

      // Draw dots and X-axis labels
      ctx.textAlign = 'center'
      for (let i = 0; i < n; i++) {
        // Dot
        ctx.beginPath()
        ctx.arc(points[i].x, points[i].y, 4, 0, Math.PI * 2)
        ctx.fillStyle = '#07c160'
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.stroke()

        // Score label above dot
        ctx.fillStyle = '#333'
        ctx.font = 'bold 10px sans-serif'
        ctx.fillText(String(scores[i]), points[i].x, points[i].y - 10)

        // X-axis date label
        ctx.fillStyle = '#999'
        ctx.font = '10px sans-serif'
        // Only show labels for up to 6 points to avoid overlap
        const labelInterval = Math.max(1, Math.floor(n / 6))
        if (i % labelInterval === 0 || i === n - 1) {
          ctx.fillText(dates[i], points[i].x, marginTop + chartH + 18)
        }
      }
    })
}

// ── Helpers ──

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${month}/${day}`
}
</script>

<style scoped>
.monitoring-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 40rpx;
}

/* Loading */
.loading-section {
  padding: 120rpx 0;
}

/* Stats section */
.stats-section {
  display: flex;
  flex-direction: row;
  padding: 30rpx;
  gap: 20rpx;
}

.stat-card {
  flex: 1;
  background-color: #ffffff;
  border-radius: 16rpx;
  padding: 24rpx 16rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.stat-value {
  font-size: 40rpx;
  font-weight: 700;
  color: #333;
  margin-bottom: 8rpx;
}

.stat-label {
  font-size: 22rpx;
  color: #999;
}

/* Chart section */
.chart-section {
  margin: 0 30rpx 30rpx;
  background-color: #ffffff;
  border-radius: 16rpx;
  padding: 30rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.section-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #333;
  margin-bottom: 20rpx;
  display: block;
}

.score-chart {
  width: 100%;
  height: 400rpx;
}

.chart-placeholder {
  height: 400rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-text {
  font-size: 26rpx;
  color: #ccc;
}

/* Records section */
.records-section {
  margin: 0 30rpx;
}

.record-card {
  background-color: #ffffff;
  border-radius: 16rpx;
  padding: 28rpx 30rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.record-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}

.record-date {
  font-size: 26rpx;
  color: #666;
}

.score-badge {
  padding: 6rpx 20rpx;
  border-radius: 20rpx;
}

.score-badge--high {
  background-color: rgba(7, 193, 96, 0.1);
}

.score-badge--mid {
  background-color: rgba(255, 193, 7, 0.1);
}

.score-badge--low {
  background-color: rgba(229, 57, 53, 0.1);
}

.score-badge-text {
  font-size: 26rpx;
  font-weight: 600;
}

.score-badge--high .score-badge-text {
  color: #07c160;
}

.score-badge--mid .score-badge-text {
  color: #ffc107;
}

.score-badge--low .score-badge-text {
  color: #e53935;
}

.record-body {
  display: flex;
  flex-direction: row;
}

.record-type-tag {
  font-size: 24rpx;
  color: #07c160;
  background-color: rgba(7, 193, 96, 0.08);
  padding: 6rpx 16rpx;
  border-radius: 8rpx;
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
  color: #666;
  margin-bottom: 16rpx;
}

.empty-desc {
  font-size: 26rpx;
  color: #ccc;
}
</style>
