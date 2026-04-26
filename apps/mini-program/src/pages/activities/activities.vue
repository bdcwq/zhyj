<template>
  <view class="activities-page">
    <!-- Tab bar -->
    <view class="tab-bar">
      <view
        class="tab-item"
        :class="{ 'tab-item--active': currentTab === 'list' }"
        @tap="switchTab('list')"
      >
        <text class="tab-text">活动课表</text>
      </view>
      <view
        class="tab-item"
        :class="{ 'tab-item--active': currentTab === 'registrations' }"
        @tap="switchTab('registrations')"
      >
        <text class="tab-text">我的报名</text>
      </view>
    </view>

    <!-- Tab 1: Activity list (活动课表) -->
    <view v-if="currentTab === 'list'" class="tab-content">
      <!-- Loading -->
      <view v-if="listLoading" class="loading-section">
        <uni-load-more status="loading" />
      </view>

      <!-- Activity list grouped by date -->
      <view v-else-if="groupedActivities.length > 0" class="activity-list">
        <view
          v-for="group in groupedActivities"
          :key="group.date"
          class="date-group"
        >
          <text class="date-header">{{ group.dateLabel }}</text>
          <view
            v-for="item in group.items"
            :key="item.id"
            class="activity-card"
            @tap="showDetail(item)"
          >
            <view class="card-header">
              <text class="card-name">{{ item.name }}</text>
              <view class="card-badges">
                <view
                  v-if="item.currentCapacity >= item.maxCapacity"
                  class="status-badge status-badge--red"
                >
                  <text class="status-text">已满</text>
                </view>
                <view
                  v-if="item.liveStreamUrl"
                  class="live-icon"
                >
                  <text class="live-icon-text">📺</text>
                </view>
                <view
                  class="type-badge"
                  :class="typeBadgeClass(item.type)"
                >
                  <text class="type-text">{{ typeLabel(item) }}</text>
                </view>
              </view>
            </view>
            <view class="card-body">
              <view class="card-row">
                <text class="card-label">时间</text>
                <text class="card-value">{{ item.startTime }} - {{ item.endTime }}</text>
              </view>
              <view v-if="item.instructor" class="card-row">
                <text class="card-label">讲师</text>
                <text class="card-value">{{ item.instructor.name }}</text>
              </view>
              <view class="card-row">
                <text class="card-label">名额</text>
                <text class="card-value">{{ item.currentCapacity }} / {{ item.maxCapacity }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- Empty state -->
      <view v-else class="empty-section">
        <text class="empty-icon">🎯</text>
        <text class="empty-text">暂无活动</text>
        <text class="empty-desc">当前没有可报名的活动</text>
      </view>
    </view>

    <!-- Tab 2: My registrations (我的报名) -->
    <view v-if="currentTab === 'registrations'" class="tab-content">
      <!-- Loading -->
      <view v-if="regLoading" class="loading-section">
        <uni-load-more status="loading" />
      </view>

      <!-- Registration list -->
      <view v-else-if="registrations.length > 0" class="activity-list">
        <view
          v-for="item in registrations"
          :key="item.id"
          class="activity-card"
        >
          <view class="card-header">
            <text class="card-name">{{ item.activity.name }}</text>
            <view
              class="status-badge"
              :class="regStatusBadgeClass(item.status)"
            >
              <text class="status-text">{{ REG_STATUS_LABELS[item.status] || item.status }}</text>
            </view>
          </view>
          <view class="card-body">
            <view class="card-row">
              <text class="card-label">类型</text>
              <text class="card-value">{{ typeLabel(item.activity) }}</text>
            </view>
            <view class="card-row">
              <text class="card-label">日期</text>
              <text class="card-value">{{ item.activity.activityDate }}</text>
            </view>
            <view class="card-row">
              <text class="card-label">时间</text>
              <text class="card-value">{{ item.activity.startTime }} - {{ item.activity.endTime }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- Empty state -->
      <view v-else class="empty-section">
        <text class="empty-icon">📝</text>
        <text class="empty-text">暂无报名记录</text>
        <text class="empty-desc">您可以切换到"活动课表"进行报名</text>
      </view>
    </view>

    <!-- Activity detail modal -->
    <uni-popup ref="detailPopup" type="bottom" :safe-area="true" border-radius="20rpx">
      <view v-if="selectedActivity" class="detail-popup">
        <view class="detail-header">
          <text class="detail-title">{{ selectedActivity.name }}</text>
          <view class="type-badge" :class="typeBadgeClass(selectedActivity.type)">
            <text class="type-text">{{ typeLabel(selectedActivity) }}</text>
          </view>
        </view>

        <view class="detail-body">
          <view v-if="selectedActivity.description" class="detail-row">
            <text class="detail-label">简介</text>
            <text class="detail-value detail-desc">{{ selectedActivity.description }}</text>
          </view>
          <view class="detail-row">
            <text class="detail-label">日期</text>
            <text class="detail-value">{{ selectedActivity.activityDate }}</text>
          </view>
          <view class="detail-row">
            <text class="detail-label">时间</text>
            <text class="detail-value">{{ selectedActivity.startTime }} - {{ selectedActivity.endTime }}</text>
          </view>
          <view v-if="selectedActivity.instructor" class="detail-row">
            <text class="detail-label">讲师</text>
            <text class="detail-value">{{ selectedActivity.instructor.name }}</text>
          </view>
          <view class="detail-row">
            <text class="detail-label">名额</text>
            <text class="detail-value">{{ selectedActivity.currentCapacity }} / {{ selectedActivity.maxCapacity }}</text>
          </view>
        </view>

        <view class="detail-actions">
          <!-- Live stream link -->
          <button
            v-if="selectedActivity.liveStreamUrl"
            class="action-btn action-btn--live"
            @tap="openLiveStream"
          >
            <text class="action-btn-text">📺 观看直播</text>
          </button>

          <!-- Register button -->
          <button
            v-if="!selectedActivity._regStatus && selectedActivity.currentCapacity < selectedActivity.maxCapacity"
            class="action-btn action-btn--primary"
            :disabled="actionLoading"
            @tap="registerActivity"
          >
            <text class="action-btn-text">{{ actionLoading ? '报名中...' : '报名' }}</text>
          </button>

          <!-- Cancel registration button -->
          <button
            v-if="selectedActivity._regStatus === 'registered'"
            class="action-btn action-btn--cancel"
            :disabled="actionLoading"
            @tap="cancelRegistration"
          >
            <text class="action-btn-text">{{ actionLoading ? '取消中...' : '取消报名' }}</text>
          </button>

          <!-- Check-in button -->
          <button
            v-if="selectedActivity._regStatus === 'registered'"
            class="action-btn action-btn--primary"
            :disabled="actionLoading"
            @tap="checkInActivity"
          >
            <text class="action-btn-text">{{ actionLoading ? '签到中...' : '签到' }}</text>
          </button>

          <!-- Already checked in -->
          <button
            v-if="selectedActivity._regStatus === 'checked_in'"
            class="action-btn action-btn--disabled"
            disabled
          >
            <text class="action-btn-text">已签到</text>
          </button>

          <!-- Full -->
          <button
            v-if="!selectedActivity._regStatus && selectedActivity.currentCapacity >= selectedActivity.maxCapacity"
            class="action-btn action-btn--disabled"
            disabled
          >
            <text class="action-btn-text">已满</text>
          </button>
        </view>
      </view>
    </uni-popup>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { request } from '@/utils/request'
import { useAuthStore } from '@/stores/auth'

// ── Types ──

interface InstructorItem {
  id: string
  name: string
}

interface ActivityItem {
  id: string
  name: string
  description: string | null
  type: string
  customType: string | null
  activityDate: string
  startTime: string
  endTime: string
  maxCapacity: number
  currentCapacity: number
  liveStreamUrl: string | null
  status: string
  instructor: InstructorItem | null
  /** Extended field — registration status for the current resident */
  _regStatus?: string
}

interface RegistrationItem {
  id: string
  status: string
  registeredAt: string
  checkedInAt: string | null
  activity: {
    id: string
    name: string
    type: string
    customType: string | null
    activityDate: string
    startTime: string
    endTime: string
    maxCapacity: number
    currentCapacity: number
    status: string
  }
}

interface DateGroup {
  date: string
  dateLabel: string
  items: ActivityItem[]
}

// ── Constants ──

const TYPE_LABELS: Record<string, string> = {
  course: '课程',
  exercise: '运动',
  experience: '体验',
  live_stream: '直播',
  custom: '自定义',
}

const REG_STATUS_LABELS: Record<string, string> = {
  registered: '已报名',
  checked_in: '已签到',
  no_show: '未到场',
  cancelled: '已取消',
}

const TYPE_BADGE_CLASSES: Record<string, string> = {
  course: 'type-badge--blue',
  exercise: 'type-badge--green',
  experience: 'type-badge--orange',
  live_stream: 'type-badge--purple',
  custom: 'type-badge--gray',
}

const REG_STATUS_BADGE_CLASSES: Record<string, string> = {
  registered: 'status-badge--blue',
  checked_in: 'status-badge--green',
  no_show: 'status-badge--red',
  cancelled: 'status-badge--gray',
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

// ── State ──

const currentTab = ref<'list' | 'registrations'>('list')
const activities = ref<ActivityItem[]>([])
const registrations = ref<RegistrationItem[]>([])
const listLoading = ref(true)
const regLoading = ref(true)
const selectedActivity = ref<ActivityItem | null>(null)
const actionLoading = ref(false)
const detailPopup = ref<any>(null)

const authStore = useAuthStore()

// ── Computed ──

/** Group activities by activityDate */
const groupedActivities = computed<DateGroup[]>(() => {
  const groups: DateGroup[] = []
  const sorted = [...activities.value]

  for (const item of sorted) {
    const date = item.activityDate
    let group = groups.find(g => g.date === date)
    if (!group) {
      const d = new Date(date)
      const month = d.getMonth() + 1
      const day = d.getDate()
      const weekday = WEEKDAYS[d.getDay()]
      group = {
        date,
        dateLabel: `${month}月${day}日 ${weekday}`,
        items: [],
      }
      groups.push(group)
    }
    // Merge registration status if available
    const reg = registrations.value.find(r => r.activity.id === item.id)
    group.items.push({
      ...item,
      _regStatus: reg?.status,
    })
  }

  return groups
})

// ── Lifecycle ──

onShow(() => {
  if (currentTab.value === 'list') {
    loadActivities()
  } else {
    loadRegistrations()
  }
})

// Load both datasets on mount
loadActivities()
loadRegistrations()

// ── Tab switching ──

function switchTab(tab: 'list' | 'registrations') {
  currentTab.value = tab
  if (tab === 'list') {
    loadActivities()
  } else {
    loadRegistrations()
  }
}

// ── Data fetching ──

async function loadActivities() {
  listLoading.value = true
  try {
    const res = await request<ActivityItem[]>({
      url: '/activities',
      showLoading: true,
    })
    if (res.success && res.data) {
      activities.value = res.data
      console.log('[activities] Loaded', activities.value.length, 'activities')
    } else {
      console.error('[activities] Failed to load activities:', res.error?.message)
      activities.value = []
    }
  } catch (error) {
    console.error('[activities] Error loading activities:', error)
    activities.value = []
  } finally {
    listLoading.value = false
  }
}

async function loadRegistrations() {
  regLoading.value = true
  try {
    const res = await request<{ records: RegistrationItem[]; total: number }>({
      url: '/my-registrations',
    })
    if (res.success && res.data) {
      registrations.value = res.data.records
      console.log('[activities] Loaded', registrations.value.length, 'registrations')
    } else {
      console.error('[activities] Failed to load registrations:', res.error?.message)
      registrations.value = []
    }
  } catch (error) {
    console.error('[activities] Error loading registrations:', error)
    registrations.value = []
  } finally {
    regLoading.value = false
  }
}

// ── Detail popup ──

function showDetail(item: ActivityItem) {
  // Merge registration status from current registrations
  const reg = registrations.value.find(r => r.activity.id === item.id)
  selectedActivity.value = {
    ...item,
    _regStatus: reg?.status,
  }
  detailPopup.value?.open()
}

function closeDetail() {
  detailPopup.value?.close()
  selectedActivity.value = null
}

// ── Actions ──

async function registerActivity() {
  if (!authStore.resident?.id) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    return
  }
  if (!selectedActivity.value) return

  actionLoading.value = true
  try {
    const res = await request<RegistrationItem>({
      url: `/activities/${selectedActivity.value.id}/register`,
      method: 'POST',
      showLoading: true,
    })
    if (res.success) {
      console.log('[activities] Registered for', selectedActivity.value.id)
      uni.showToast({ title: '报名成功', icon: 'success' })
      // Refresh data
      await Promise.all([loadActivities(), loadRegistrations()])
      closeDetail()
    } else {
      console.error('[activities] Registration failed:', res.error?.message)
    }
  } catch (error) {
    console.error('[activities] Error registering:', error)
    uni.showToast({ title: '报名失败，请重试', icon: 'none' })
  } finally {
    actionLoading.value = false
  }
}

async function cancelRegistration() {
  if (!selectedActivity.value) return

  uni.showModal({
    title: '确认取消',
    content: '确定要取消报名吗？',
    success: async (res) => {
      if (!res.confirm) return
      actionLoading.value = true
      try {
        const result = await request({
          url: `/activities/${selectedActivity.value!.id}/cancel`,
          method: 'POST',
          showLoading: true,
        })
        if (result.success) {
          console.log('[activities] Cancelled registration for', selectedActivity.value!.id)
          uni.showToast({ title: '已取消报名', icon: 'success' })
          await Promise.all([loadActivities(), loadRegistrations()])
          closeDetail()
        } else {
          console.error('[activities] Cancel failed:', result.error?.message)
        }
      } catch (error) {
        console.error('[activities] Error cancelling registration:', error)
        uni.showToast({ title: '取消失败，请重试', icon: 'none' })
      } finally {
        actionLoading.value = false
      }
    },
  })
}

async function checkInActivity() {
  if (!authStore.resident?.id) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    return
  }
  if (!selectedActivity.value) return

  actionLoading.value = true
  try {
    const res = await request<RegistrationItem>({
      url: `/activities/${selectedActivity.value.id}/check-in`,
      method: 'POST',
      showLoading: true,
    })
    if (res.success) {
      console.log('[activities] Checked in for', selectedActivity.value.id)
      uni.showToast({ title: '签到成功', icon: 'success' })
      await Promise.all([loadActivities(), loadRegistrations()])
      closeDetail()
    } else {
      console.error('[activities] Check-in failed:', res.error?.message)
    }
  } catch (error) {
    console.error('[activities] Error checking in:', error)
    uni.showToast({ title: '签到失败，请重试', icon: 'none' })
  } finally {
    actionLoading.value = false
  }
}

function openLiveStream() {
  if (!selectedActivity.value?.liveStreamUrl) return
  // Copy live stream URL to clipboard
  uni.setClipboardData({
    data: selectedActivity.value.liveStreamUrl,
    success: () => {
      uni.showToast({ title: '直播链接已复制', icon: 'success' })
    },
    fail: () => {
      uni.showToast({ title: '复制失败，请重试', icon: 'none' })
    },
  })
}

// ── Helpers ──

function typeLabel(item: { type: string; customType?: string | null }): string {
  if (item.type === 'custom' && item.customType) {
    return item.customType
  }
  return TYPE_LABELS[item.type] || item.type
}

function typeBadgeClass(type: string): string {
  return TYPE_BADGE_CLASSES[type] || ''
}

function regStatusBadgeClass(status: string): string {
  return REG_STATUS_BADGE_CLASSES[status] || ''
}
</script>

<style scoped>
.activities-page {
  min-height: 100vh;
  background-color: #f5f5f7;
}

/* Tab bar */
.tab-bar {
  display: flex;
  flex-direction: row;
  background-color: #ffffff;
  padding: 0 30rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
  position: sticky;
  top: 0;
  z-index: 10;
}

.tab-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28rpx 0;
  position: relative;
}

.tab-item--active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 80rpx;
  height: 6rpx;
  background-color: #07c160;
  border-radius: 3rpx;
}

.tab-text {
  font-size: 30rpx;
  color: #aeaeb2;
}

.tab-item--active .tab-text {
  font-size: 30rpx;
  font-weight: 600;
  color: #1d1d1f;
}

/* Tab content */
.tab-content {
  padding: 30rpx;
  padding-bottom: 120rpx;
}

/* Loading */
.loading-section {
  padding: 80rpx 0;
}

/* Activity list */
.activity-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

/* Date group */
.date-group {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-bottom: 16rpx;
}

.date-header {
  font-size: 28rpx;
  font-weight: 600;
  color: #86868b;
  padding: 8rpx 0;
}

/* Activity card */
.activity-card {
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

.card-name {
  font-size: 30rpx;
  font-weight: 600;
  color: #1d1d1f;
  flex: 1;
  margin-right: 16rpx;
}

.card-badges {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
}

.live-icon {
  display: flex;
  align-items: center;
}

.live-icon-text {
  font-size: 28rpx;
}

/* Type badges */
.type-badge {
  padding: 6rpx 20rpx;
  border-radius: 20rpx;
}

.type-badge--blue {
  background-color: rgba(0, 113, 227, 0.1);
}
.type-badge--blue .type-text {
  color: #0071e3;
}

.type-badge--green {
  background-color: rgba(52, 199, 89, 0.1);
}
.type-badge--green .type-text {
  color: #07c160;
}

.type-badge--orange {
  background-color: rgba(255, 159, 10, 0.1);
}
.type-badge--orange .type-text {
  color: #FF9F0A;
}

.type-badge--purple {
  background-color: rgba(175, 82, 222, 0.1);
}
.type-badge--purple .type-text {
  color: #AF52DE;
}

.type-badge--gray {
  background-color: rgba(174, 174, 178, 0.1);
}
.type-badge--gray .type-text {
  color: #aeaeb2;
}

.type-text {
  font-size: 24rpx;
  font-weight: 500;
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

.status-badge--red {
  background-color: rgba(255, 59, 48, 0.1);
}
.status-badge--red .status-text {
  color: #FF3B30;
}

.status-badge--gray {
  background-color: rgba(174, 174, 178, 0.1);
}
.status-badge--gray .status-text {
  color: #aeaeb2;
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

/* Detail popup */
.detail-popup {
  background-color: #ffffff;
  border-radius: 20rpx 20rpx 0 0;
  padding: 40rpx 30rpx;
  padding-bottom: calc(40rpx + env(safe-area-inset-bottom));
}

.detail-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 30rpx;
}

.detail-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #1d1d1f;
  flex: 1;
}

.detail-body {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  margin-bottom: 30rpx;
}

.detail-row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
}

.detail-label {
  font-size: 26rpx;
  color: #aeaeb2;
  width: 100rpx;
  flex-shrink: 0;
}

.detail-value {
  font-size: 26rpx;
  color: #1d1d1f;
  flex: 1;
}

.detail-desc {
  line-height: 1.6;
}

/* Action buttons */
.detail-actions {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.action-btn {
  width: 100%;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 44rpx;
  border: none;
  font-size: 30rpx;
  font-weight: 600;
}

.action-btn--primary {
  background-color: #07c160;
}
.action-btn--primary .action-btn-text {
  color: #ffffff;
}

.action-btn--cancel {
  background-color: #ffffff;
  border: 2rpx solid #FF3B30;
}
.action-btn--cancel .action-btn-text {
  color: #FF3B30;
}

.action-btn--live {
  background-color: #AF52DE;
}
.action-btn--live .action-btn-text {
  color: #ffffff;
}

.action-btn--disabled {
  background-color: #f5f5f7;
}
.action-btn--disabled .action-btn-text {
  color: #d2d2d7;
}
</style>
