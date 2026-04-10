<template>
  <view class="appointments-page">
    <!-- Tab bar -->
    <view class="tab-bar">
      <view
        class="tab-item"
        :class="{ 'tab-item--active': currentTab === 'list' }"
        @tap="switchTab('list')"
      >
        <text class="tab-text">我的预约</text>
      </view>
      <view
        class="tab-item"
        :class="{ 'tab-item--active': currentTab === 'book' }"
        @tap="switchTab('book')"
      >
        <text class="tab-text">预约理疗</text>
      </view>
    </view>

    <!-- Tab 1: My Appointments -->
    <view v-if="currentTab === 'list'" class="tab-content">
      <!-- Loading -->
      <view v-if="listLoading" class="loading-section">
        <uni-load-more status="loading" />
      </view>

      <!-- Appointment list -->
      <view v-else-if="appointments.length > 0" class="appointment-list">
        <view
          v-for="item in appointments"
          :key="item.id"
          class="appointment-card"
        >
          <view class="card-header">
            <text class="card-date">{{ formatScheduledAt(item.scheduledAt) }}</text>
            <view class="status-badge" :class="statusBadgeClass(item.status)">
              <text class="status-text">{{ statusLabel(item.status) }}</text>
            </view>
          </view>
          <view class="card-body">
            <view v-if="item.room" class="card-row">
              <text class="card-label">房间</text>
              <text class="card-value">{{ item.room.name }}</text>
            </view>
            <view v-if="item.machine" class="card-row">
              <text class="card-label">仪器</text>
              <text class="card-value">{{ item.machine.name }}</text>
            </view>
          </view>
          <view v-if="item.status === 'booked'" class="card-footer">
            <view class="cancel-btn" @tap="cancelAppointment(item.id)">
              <text class="cancel-btn-text">取消预约</text>
            </view>
          </view>
        </view>
      </view>

      <!-- Empty state -->
      <view v-else class="empty-section">
        <text class="empty-icon">📅</text>
        <text class="empty-text">暂无预约记录</text>
        <text class="empty-desc">您可以切换到"预约理疗"进行预约</text>
      </view>
    </view>

    <!-- Tab 2: Booking Form -->
    <view v-if="currentTab === 'book'" class="tab-content">
      <view class="form-section">
        <!-- Date picker -->
        <view class="form-item">
          <text class="form-label">预约日期</text>
          <picker mode="date" :start="todayStr" @change="onDateChange">
            <view class="picker-value">
              <text :class="{ 'placeholder-text': !selectedDate }">
                {{ selectedDate || '请选择日期' }}
              </text>
              <text class="picker-arrow">▶</text>
            </view>
          </picker>
        </view>

        <!-- Time picker -->
        <view class="form-item">
          <text class="form-label">预约时间</text>
          <picker mode="time" @change="onTimeChange">
            <view class="picker-value">
              <text :class="{ 'placeholder-text': !selectedTime }">
                {{ selectedTime || '请选择时间' }}
              </text>
              <text class="picker-arrow">▶</text>
            </view>
          </picker>
        </view>

        <!-- Room selector -->
        <view class="form-item">
          <text class="form-label">选择房间</text>
          <view v-if="roomsLoading" class="loading-section">
            <uni-load-more status="loading" :contentText="{ contentdown: '', contentrefresh: '加载中...', contentnomore: '' }" />
          </view>
          <view v-else-if="rooms.length === 0" class="empty-hint">
            <text class="empty-hint-text">暂无可用房间</text>
          </view>
          <radio-group v-else @change="onRoomChange">
            <view
              v-for="room in rooms"
              :key="room.id"
              class="radio-item"
            >
              <radio
                :value="room.id"
                :checked="selectedRoomId === room.id"
                color="#07c160"
              />
              <text class="radio-label">{{ room.name }}</text>
            </view>
          </radio-group>
        </view>

        <!-- Machine selector -->
        <view v-if="selectedRoomId" class="form-item">
          <text class="form-label">选择仪器</text>
          <view v-if="machinesLoading" class="loading-section">
            <uni-load-more status="loading" :contentText="{ contentdown: '', contentrefresh: '加载中...', contentnomore: '' }" />
          </view>
          <view v-else-if="machines.length === 0" class="empty-hint">
            <text class="empty-hint-text">该房间暂无可用仪器</text>
          </view>
          <radio-group v-else @change="onMachineChange">
            <view
              v-for="machine in machines"
              :key="machine.id"
              class="radio-item"
            >
              <radio
                :value="machine.id"
                :checked="selectedMachineId === machine.id"
                color="#07c160"
              />
              <text class="radio-label">{{ machine.name }}</text>
              <view v-if="!machine.available" class="machine-booked-tag">
                <text class="machine-booked-text">已预约</text>
              </view>
            </view>
          </radio-group>
        </view>

        <!-- Availability display -->
        <view v-if="availability" class="availability-section">
          <text class="form-label">当日预约情况</text>
          <view
            v-for="room in availability.rooms"
            :key="room.id"
            class="avail-room-card"
          >
            <text class="avail-room-name">{{ room.name }}</text>
            <text class="avail-room-count">已预约 {{ room.appointmentCount }} 个</text>
          </view>
        </view>
      </view>

      <!-- Submit button -->
      <view class="submit-section">
        <button
          class="submit-btn"
          :class="{ 'submit-btn--disabled': submitting }"
          :disabled="submitting"
          @tap="submitBooking"
        >
          <text class="submit-btn-text">{{ submitting ? '提交中...' : '确认预约' }}</text>
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { request } from '@/utils/request'
import { useAuthStore } from '@/stores/auth'

// ── Types ──

interface RoomItem {
  id: string
  name: string
  capacity: number
}

interface MachineItem {
  id: string
  name: string
  status: string
  available: boolean
  bookedSlots: string[]
}

interface AvailabilityRoom {
  id: string
  name: string
  capacity: number
  appointmentCount: number
  machines: MachineItem[]
}

interface AppointmentItem {
  id: string
  scheduledAt: string
  status: string
  room: { id: string; name: string } | null
  machine: { id: string; name: string } | null
}

interface AvailabilityData {
  date: string
  rooms: AvailabilityRoom[]
}

// ── Status maps ──

const STATUS_LABELS: Record<string, string> = {
  booked: '已预约',
  confirmed: '已确认',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
  no_show: '未到诊',
  verified: '已核销',
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  booked: 'status-badge--blue',
  confirmed: 'status-badge--green',
  in_progress: 'status-badge--orange',
  completed: 'status-badge--green',
  cancelled: 'status-badge--gray',
  no_show: 'status-badge--red',
  verified: 'status-badge--green',
}

// ── State ──

const currentTab = ref<'list' | 'book'>('list')
const appointments = ref<AppointmentItem[]>([])
const listLoading = ref(true)

const rooms = ref<RoomItem[]>([])
const machines = ref<MachineItem[]>([])
const availability = ref<AvailabilityData | null>(null)
const roomsLoading = ref(false)
const machinesLoading = ref(false)

const selectedDate = ref('')
const selectedTime = ref('')
const selectedRoomId = ref('')
const selectedMachineId = ref('')
const submitting = ref(false)

const authStore = useAuthStore()

// ── Computed ──

const todayStr = (() => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
})()

// ── Lifecycle ──

onShow(() => {
  // Refresh data every time page is shown (back navigation)
  if (currentTab.value === 'list') {
    loadAppointments()
  }
})

// Load appointments on initial mount
loadAppointments()

// ── Tab switching ──

function switchTab(tab: 'list' | 'book') {
  currentTab.value = tab
  if (tab === 'list') {
    loadAppointments()
  } else if (tab === 'book' && rooms.value.length === 0) {
    loadRooms()
  }
}

// ── Data fetching ──

async function loadAppointments() {
  listLoading.value = true
  try {
    const res = await request<{ records: AppointmentItem[]; total: number }>({
      url: '/appointments/my',
      showLoading: true,
    })
    if (res.success && res.data) {
      appointments.value = res.data.records
      console.log('[appointments] Loaded', appointments.value.length, 'appointments')
    } else {
      console.error('[appointments] Failed to load appointments:', res.error?.message)
      appointments.value = []
    }
  } catch (error) {
    console.error('[appointments] Error loading appointments:', error)
    appointments.value = []
  } finally {
    listLoading.value = false
  }
}

async function loadRooms() {
  roomsLoading.value = true
  try {
    const res = await request<RoomItem[]>({
      url: '/rooms',
    })
    if (res.success && res.data) {
      rooms.value = res.data
      console.log('[appointments] Loaded', rooms.value.length, 'rooms')
    } else {
      console.error('[appointments] Failed to load rooms:', res.error?.message)
      rooms.value = []
    }
  } catch (error) {
    console.error('[appointments] Error loading rooms:', error)
    rooms.value = []
  } finally {
    roomsLoading.value = false
  }
}

async function loadMachines(roomId: string) {
  machinesLoading.value = true
  selectedMachineId.value = ''
  try {
    const res = await request<MachineItem[]>({
      url: `/rooms/${roomId}/machines`,
    })
    if (res.success && res.data) {
      machines.value = res.data
      console.log('[appointments] Loaded', machines.value.length, 'machines for room', roomId)
    } else {
      console.error('[appointments] Failed to load machines:', res.error?.message)
      machines.value = []
    }
  } catch (error) {
    console.error('[appointments] Error loading machines:', error)
    machines.value = []
  } finally {
    machinesLoading.value = false
  }
}

async function loadAvailability() {
  if (!selectedDate.value) return
  try {
    const res = await request<AvailabilityData>({
      url: `/rooms/availability?date=${selectedDate.value}`,
    })
    if (res.success && res.data) {
      availability.value = res.data
      // Update machine availability from availability data
      if (selectedRoomId.value) {
        const room = res.data.rooms.find(r => r.id === selectedRoomId.value)
        if (room) {
          // Merge availability info into machines
          machines.value = machines.value.map(m => {
            const availMachine = room.machines.find(am => am.id === m.id)
            if (availMachine) {
              return { ...m, available: availMachine.available, bookedSlots: availMachine.bookedSlots }
            }
            return m
          })
        }
      }
      console.log('[appointments] Availability loaded for', selectedDate.value)
    }
  } catch (error) {
    console.error('[appointments] Error loading availability:', error)
  }
}

// ── Event handlers ──

function onDateChange(e: any) {
  selectedDate.value = e.detail.value
  loadAvailability()
}

function onTimeChange(e: any) {
  selectedTime.value = e.detail.value
}

function onRoomChange(e: any) {
  selectedRoomId.value = e.detail.value
  selectedMachineId.value = ''
  // Load machines for the selected room
  loadMachines(selectedRoomId.value)
  // Update availability display
  if (availability.value) {
    const room = availability.value.rooms.find(r => r.id === selectedRoomId.value)
    if (room) {
      machines.value = room.machines
    }
  }
}

function onMachineChange(e: any) {
  selectedMachineId.value = e.detail.value
}

async function submitBooking() {
  if (!authStore.resident?.id) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    return
  }
  if (!selectedDate.value) {
    uni.showToast({ title: '请选择日期', icon: 'none' })
    return
  }
  if (!selectedTime.value) {
    uni.showToast({ title: '请选择时间', icon: 'none' })
    return
  }
  if (!selectedRoomId.value) {
    uni.showToast({ title: '请选择房间', icon: 'none' })
    return
  }

  submitting.value = true

  const scheduledAt = `${selectedDate.value}T${selectedTime.value}:00`

  try {
    const res = await request<AppointmentItem>({
      url: '/appointments',
      method: 'POST',
      data: {
        residentId: authStore.resident.id,
        roomId: selectedRoomId.value,
        machineId: selectedMachineId.value || undefined,
        scheduledAt,
      },
      showLoading: true,
    })

    if (res.success) {
      console.log('[appointments] Booking created successfully')
      uni.showToast({ title: '预约成功', icon: 'success' })
      // Reset form
      selectedDate.value = ''
      selectedTime.value = ''
      selectedRoomId.value = ''
      selectedMachineId.value = ''
      machines.value = []
      availability.value = null
      // Switch to list tab
      setTimeout(() => {
        switchTab('list')
      }, 1500)
    } else {
      // Error toast already shown by request() via showErrorToast
      console.error('[appointments] Booking failed:', res.error?.code, res.error?.message)
    }
  } catch (error) {
    console.error('[appointments] Error submitting booking:', error)
    uni.showToast({ title: '预约失败，请重试', icon: 'none' })
  } finally {
    submitting.value = false
  }
}

async function cancelAppointment(id: string) {
  uni.showModal({
    title: '确认取消',
    content: '确定要取消该预约吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          const result = await request<{ id: string; cancelled: boolean }>({
            url: `/appointments/${id}`,
            method: 'DELETE',
            showLoading: true,
          })
          if (result.success) {
            console.log('[appointments] Appointment cancelled:', id)
            uni.showToast({ title: '已取消预约', icon: 'success' })
            loadAppointments()
          } else {
            console.error('[appointments] Cancel failed:', result.error?.message)
          }
        } catch (error) {
          console.error('[appointments] Error cancelling appointment:', error)
          uni.showToast({ title: '取消失败，请重试', icon: 'none' })
        }
      }
    },
  })
}

// ── Helpers ──

function statusLabel(status: string): string {
  return STATUS_LABELS[status] || status
}

function statusBadgeClass(status: string): string {
  return STATUS_BADGE_CLASSES[status] || ''
}

function formatScheduledAt(dateStr: string): string {
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
.appointments-page {
  min-height: 100vh;
  background-color: #f5f5f5;
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

.tab-item--active {
  /* Active indicator */
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
  color: #999;
}

.tab-item--active .tab-text {
  font-size: 30rpx;
  font-weight: 600;
  color: #333;
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

/* Appointment list */
.appointment-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.appointment-card {
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
  color: #333;
}

/* Status badges */
.status-badge {
  padding: 6rpx 20rpx;
  border-radius: 20rpx;
}

.status-badge--blue {
  background-color: rgba(24, 144, 255, 0.1);
}
.status-badge--blue .status-text {
  color: #1890ff;
}

.status-badge--green {
  background-color: rgba(7, 193, 96, 0.1);
}
.status-badge--green .status-text {
  color: #07c160;
}

.status-badge--orange {
  background-color: rgba(255, 152, 0, 0.1);
}
.status-badge--orange .status-text {
  color: #ff9800;
}

.status-badge--gray {
  background-color: rgba(153, 153, 153, 0.1);
}
.status-badge--gray .status-text {
  color: #999;
}

.status-badge--red {
  background-color: rgba(229, 57, 53, 0.1);
}
.status-badge--red .status-text {
  color: #e53935;
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
  color: #999;
  width: 100rpx;
}

.card-value {
  font-size: 26rpx;
  color: #333;
}

/* Card footer */
.card-footer {
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid #f0f0f0;
}

.cancel-btn {
  padding: 10rpx 32rpx;
  border: 2rpx solid #e53935;
  border-radius: 28rpx;
}

.cancel-btn-text {
  font-size: 24rpx;
  color: #e53935;
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

.empty-hint {
  padding: 20rpx 0;
}

.empty-hint-text {
  font-size: 26rpx;
  color: #ccc;
}

/* Form */
.form-section {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.form-item {
  background-color: #ffffff;
  border-radius: 16rpx;
  padding: 24rpx 30rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.form-label {
  font-size: 28rpx;
  font-weight: 600;
  color: #333;
  margin-bottom: 16rpx;
  display: block;
}

/* Picker */
.picker-value {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx 20rpx;
  background-color: #f8f8f8;
  border-radius: 12rpx;
}

.picker-arrow {
  font-size: 24rpx;
  color: #ccc;
}

.placeholder-text {
  color: #ccc;
  font-size: 28rpx;
}

/* Radio items */
.radio-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}

.radio-item:last-child {
  border-bottom: none;
}

.radio-label {
  font-size: 28rpx;
  color: #333;
  margin-left: 12rpx;
}

.machine-booked-tag {
  margin-left: 16rpx;
  padding: 4rpx 16rpx;
  background-color: rgba(229, 57, 53, 0.1);
  border-radius: 8rpx;
}

.machine-booked-text {
  font-size: 22rpx;
  color: #e53935;
}

/* Availability section */
.availability-section {
  background-color: #ffffff;
  border-radius: 16rpx;
  padding: 24rpx 30rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.avail-room-card {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 12rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}

.avail-room-card:last-child {
  border-bottom: none;
}

.avail-room-name {
  font-size: 26rpx;
  color: #333;
}

.avail-room-count {
  font-size: 24rpx;
  color: #999;
}

/* Submit section */
.submit-section {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 24rpx 30rpx;
  padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
  background-color: #ffffff;
  box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.submit-btn {
  width: 100%;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #07c160;
  border: none;
  border-radius: 44rpx;
}

.submit-btn--disabled {
  opacity: 0.6;
}

.submit-btn-text {
  font-size: 32rpx;
  font-weight: 600;
  color: #ffffff;
}
</style>
