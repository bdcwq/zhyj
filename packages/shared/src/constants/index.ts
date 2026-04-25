// ── Staff roles ──
export const STAFF_ROLES = {
  ADMIN: "admin",
  STORE_MANAGER: "store_manager",
  STAFF: "staff",
} as const;

export type StaffRole = (typeof STAFF_ROLES)[keyof typeof STAFF_ROLES];

// ── Role access levels (higher = more permissions) ──
export const ROLE_ACCESS_LEVELS: Record<string, number> = {
  admin: 3,
  store_manager: 2,
  staff: 1,
};

// ── Permission error codes ──
export const PERMISSION_ERRORS = {
  FORBIDDEN: "PERMISSION_001",
} as const;

export type PermissionErrorCode = (typeof PERMISSION_ERRORS)[keyof typeof PERMISSION_ERRORS];

// ── Employee (staff) error codes ──
export const EMPLOYEE_ERRORS = {
  NOT_FOUND: "EMPLOYEE_001",
  INVALID_PARAMS: "EMPLOYEE_002",
  USERNAME_EXISTS: "EMPLOYEE_003",
  PHONE_EXISTS: "EMPLOYEE_004",
  CREATE_FAILED: "EMPLOYEE_005",
  UPDATE_FAILED: "EMPLOYEE_006",
  DISABLE_FAILED: "EMPLOYEE_007",
} as const;

export type EmployeeErrorCode = (typeof EMPLOYEE_ERRORS)[keyof typeof EMPLOYEE_ERRORS];

// ── Room error codes ──
export const ROOM_ERRORS = {
  NOT_FOUND: "ROOM_001",
  VALIDATION_ERROR: "ROOM_002",
  CREATE_FAILED: "ROOM_003",
  UPDATE_FAILED: "ROOM_004",
  DELETE_FAILED: "ROOM_005",
  NAME_EXISTS: "ROOM_006",
} as const;

export type RoomErrorCode = (typeof ROOM_ERRORS)[keyof typeof ROOM_ERRORS];

// ── Machine error codes ──
export const MACHINE_ERRORS = {
  NOT_FOUND: "MACHINE_001",
  VALIDATION_ERROR: "MACHINE_002",
  CREATE_FAILED: "MACHINE_003",
  UPDATE_FAILED: "MACHINE_004",
  DELETE_FAILED: "MACHINE_005",
  ROOM_NOT_FOUND: "MACHINE_006",
} as const;

export type MachineErrorCode = (typeof MACHINE_ERRORS)[keyof typeof MACHINE_ERRORS];

// ── Appointment statuses ──
export const APPOINTMENT_STATUS = {
  BOOKED: "booked",
  CONFIRMED: "confirmed",
  VERIFIED: "verified",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  NO_SHOW: "no_show",
} as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUS)[keyof typeof APPOINTMENT_STATUS];

// ── Machine statuses ──
export const MACHINE_STATUS = {
  AVAILABLE: "available",
  IN_USE: "in_use",
  MAINTENANCE: "maintenance",
  OUT_OF_SERVICE: "out_of_service",
} as const;

export type MachineStatus = (typeof MACHINE_STATUS)[keyof typeof MACHINE_STATUS];

// ── Registration sources ──
export const REGISTRATION_SOURCE = {
  WALK_IN: "walk-in",
  ACTIVITY: "activity",
  REFERRAL: "referral",
  MARKETING: "marketing",
  WECHAT: "wechat",
} as const;

export type RegistrationSource = (typeof REGISTRATION_SOURCE)[keyof typeof REGISTRATION_SOURCE];

// ── Robot session statuses ──
export const ROBOT_SESSION_STATUS = {
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
  ERROR: "error",
} as const;

export type RobotSessionStatus = (typeof ROBOT_SESSION_STATUS)[keyof typeof ROBOT_SESSION_STATUS];

// ── JWT ──
export const JWT_EXPIRY = "7d";

// ── Dev SMS bypass code ──
export const DEV_SMS_CODE = "123456";

// ── Auth error codes ──
export const AUTH_ERRORS = {
  INVALID_CREDENTIALS: "AUTH_001",
  INVALID_SMS_CODE: "AUTH_002",
  SMS_SEND_FAILED: "AUTH_003",
  WECHAT_CODE_EXCHANGE_FAILED: "AUTH_004",
  USER_NOT_FOUND: "AUTH_005",
  TOKEN_EXPIRED: "AUTH_006",
} as const;

export type AuthErrorCode = (typeof AUTH_ERRORS)[keyof typeof AUTH_ERRORS];

// ── Constitution types ──
export const CONSTITUTION_TYPES = [
  "气虚质",
  "阳虚质",
  "阴虚质",
  "痰湿质",
  "湿热质",
  "血瘀质",
  "气郁质",
  "特禀质",
  "平和质",
] as const;

export type ConstitutionType = (typeof CONSTITUTION_TYPES)[number];

// ── Appointment error codes ──
export const APPOINTMENT_ERRORS = {
  INVALID_RESIDENT: "APPOINTMENT_001",
  NOT_MONITORED: "APPOINTMENT_002",
  FIFTEEN_DAY_LIMIT: "APPOINTMENT_003",
  SLOT_TAKEN: "APPOINTMENT_004",
  CREATE_FAILED: "APPOINTMENT_005",
  NOT_FOUND: "APPOINTMENT_006",
  CANCEL_FAILED: "APPOINTMENT_007",
  ROOM_NOT_FOUND: "APPOINTMENT_008",
  MACHINE_NOT_FOUND: "APPOINTMENT_009",
} as const;

export type AppointmentErrorCode = (typeof APPOINTMENT_ERRORS)[keyof typeof APPOINTMENT_ERRORS];

// ── Monitoring error codes ──
export const MONITORING_ERRORS = {
  INVALID_SCORE: "MONITORING_001",
  RESIDENT_NOT_FOUND: "MONITORING_002",
  RECORD_NOT_FOUND: "MONITORING_003",
  INVALID_CONSTITUTION_TYPE: "MONITORING_004",
  CREATE_FAILED: "MONITORING_005",
} as const;

export type MonitoringErrorCode = (typeof MONITORING_ERRORS)[keyof typeof MONITORING_ERRORS];

// ── No-show limit ──
export const NO_SHOW_LIMIT = 2;

// ── Verification error codes ──
export const VERIFICATION_ERRORS = {
  NOT_FOUND: "VERIFICATION_001",
  ALREADY_VERIFIED: "VERIFICATION_002",
  INVALID_STATUS: "VERIFICATION_003",
  NO_SHOW_MARKED: "VERIFICATION_004",
  CREATE_FAILED: "VERIFICATION_005",
} as const;

export type VerificationErrorCode = (typeof VERIFICATION_ERRORS)[keyof typeof VERIFICATION_ERRORS];

// ── Robot session error codes ──
export const ROBOT_SESSION_ERRORS = {
  APPOINTMENT_NOT_FOUND: "ROBOT_001",
  APPOINTMENT_NOT_VERIFIED: "ROBOT_002",
  SESSION_EXISTS: "ROBOT_003",
  SESSION_NOT_FOUND: "ROBOT_004",
  INVALID_STATUS: "ROBOT_005",
  CREATE_FAILED: "ROBOT_006",
} as const;

export type RobotSessionErrorCode = (typeof ROBOT_SESSION_ERRORS)[keyof typeof ROBOT_SESSION_ERRORS];

// ── Statistics ──
export const STATISTICS_PERIODS = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
} as const;

export type StatisticsPeriod = (typeof STATISTICS_PERIODS)[keyof typeof STATISTICS_PERIODS];

export const MAX_DATE_RANGE_DAYS = 365;

export const STAT_ERRORS = {
  INVALID_DATE_RANGE: "STAT_001",
  QUERY_FAILED: "STAT_002",
} as const;

export type StatErrorCode = (typeof STAT_ERRORS)[keyof typeof STAT_ERRORS];

// ── Campaign error codes ──
export const CAMPAIGN_ERRORS = {
  VALIDATION_ERROR: "CAMPAIGN_001",
  NOT_FOUND: "CAMPAIGN_002",
  CREATE_FAILED: "CAMPAIGN_003",
  UPDATE_FAILED: "CAMPAIGN_004",
  DELETE_FAILED: "CAMPAIGN_005",
  ALREADY_PARTICIPATING: "CAMPAIGN_006",
  NOT_ACTIVE: "CAMPAIGN_007",
  PARTICIPATE_FAILED: "CAMPAIGN_008",
} as const;

export type CampaignErrorCode = (typeof CAMPAIGN_ERRORS)[keyof typeof CAMPAIGN_ERRORS];

// ── Campaign statuses ──
export const CAMPAIGN_STATUS = {
  ACTIVE: "active",
  PAUSED: "paused",
  EXPIRED: "expired",
} as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUS)[keyof typeof CAMPAIGN_STATUS];

// ── Campaign participation statuses ──
export const CAMPAIGN_PARTICIPATION_STATUS = {
  PENDING: "pending",
  COMPLETED: "completed",
  EXPIRED: "expired",
} as const;

export type CampaignParticipationStatus = (typeof CAMPAIGN_PARTICIPATION_STATUS)[keyof typeof CAMPAIGN_PARTICIPATION_STATUS];

// ── Notification error codes ──
export const NOTIFICATION_ERRORS = {
  INVALID_RECIPIENT: "NOTIFICATION_001",
  SEND_FAILED: "NOTIFICATION_002",
  NOT_FOUND: "NOTIFICATION_003",
  CHANNEL_ERROR: "NOTIFICATION_004",
} as const;

export type NotificationErrorCode = (typeof NOTIFICATION_ERRORS)[keyof typeof NOTIFICATION_ERRORS];

// ── Resident error codes ──
export const RESIDENT_ERRORS = {
  NOT_FOUND: "RESIDENT_001",
  ALREADY_BOUND: "RESIDENT_002",
  BIND_FAILED: "RESIDENT_003",
  NOT_BOUND: "RESIDENT_004",
  UNBIND_FAILED: "RESIDENT_005",
  LAST_STORE: "RESIDENT_006",
} as const;

export type ResidentErrorCode = (typeof RESIDENT_ERRORS)[keyof typeof RESIDENT_ERRORS];

// ── Store switch error codes ──
export const STORE_SWITCH_ERRORS = {
  INVALID_STORE: "STORE_SWITCH_001",
  STORE_NOT_ASSIGNED: "STORE_SWITCH_002",
  SWITCH_FAILED: "STORE_SWITCH_003",
} as const;

export type StoreSwitchErrorCode = (typeof STORE_SWITCH_ERRORS)[keyof typeof STORE_SWITCH_ERRORS];

// ── Store error codes ──
export const STORE_ERRORS = {
  NOT_FOUND: "STORE_001",
  INVALID_PARAMS: "STORE_002",
  NAME_EXISTS: "STORE_003",
  CREATE_FAILED: "STORE_004",
  UPDATE_FAILED: "STORE_005",
  DISABLE_FAILED: "STORE_006",
} as const;

export type StoreErrorCode = (typeof STORE_ERRORS)[keyof typeof STORE_ERRORS];

// ── Schedule statuses ──
export const SCHEDULE_STATUS = {
  SCHEDULED: "scheduled",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
} as const;

export type ScheduleStatus = (typeof SCHEDULE_STATUS)[keyof typeof SCHEDULE_STATUS];

// ── Schedule error codes ──
export const SCHEDULE_ERRORS = {
  TEMPLATE_NOT_FOUND: "SCHEDULE_001",
  INVALID_PARAMS: "SCHEDULE_002",
  CREATE_FAILED: "SCHEDULE_003",
  UPDATE_FAILED: "SCHEDULE_004",
  DELETE_FAILED: "SCHEDULE_005",
  CONFLICT_DETECTED: "SCHEDULE_006",
  GENERATE_FAILED: "SCHEDULE_007",
  NOT_FOUND: "SCHEDULE_008",
  NO_AVAILABLE_STAFF: "SCHEDULE_009",
} as const;

export type ScheduleErrorCode = (typeof SCHEDULE_ERRORS)[keyof typeof SCHEDULE_ERRORS];

// ── Attendance statuses ──
export const ATTENDANCE_STATUS = {
  PENDING: "pending",
  NORMAL: "normal",
  LATE: "late",
  EARLY_LEAVE: "early_leave",
  LATE_AND_EARLY: "late_and_early",
  ABSENT: "absent",
} as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[keyof typeof ATTENDANCE_STATUS];

// ── Attendance error codes ──
export const ATTENDANCE_ERRORS = {
  NOT_CLOCKED_IN: "ATTENDANCE_001",
  ALREADY_CLOCKED_IN: "ATTENDANCE_002",
  ALREADY_CLOCKED_OUT: "ATTENDANCE_003",
  SCHEDULE_NOT_FOUND: "ATTENDANCE_004",
  NO_SCHEDULE_TODAY: "ATTENDANCE_005",
  QUERY_FAILED: "ATTENDANCE_006",
  INVALID_PARAMS: "ATTENDANCE_007",
  CREATE_FAILED: "ATTENDANCE_008",
} as const;

export type AttendanceErrorCode = (typeof ATTENDANCE_ERRORS)[keyof typeof ATTENDANCE_ERRORS];

// ── Leave statuses ──
export const LEAVE_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export type LeaveStatus = (typeof LEAVE_STATUS)[keyof typeof LEAVE_STATUS];

// ── Leave types ──
export const LEAVE_TYPE = {
  SICK: "sick",
  PERSONAL: "personal",
  ANNUAL: "annual",
  OTHER: "other",
} as const;

export type LeaveType = (typeof LEAVE_TYPE)[keyof typeof LEAVE_TYPE];

// ── Transfer error codes ──
export const TRANSFER_ERRORS = {
  STAFF_NOT_FOUND: "TRANSFER_001",
  STORE_NOT_ASSIGNED: "TRANSFER_002",
  LAST_STORE: "TRANSFER_003",
  TRANSFER_FAILED: "TRANSFER_004",
} as const;

export type TransferErrorCode = (typeof TRANSFER_ERRORS)[keyof typeof TRANSFER_ERRORS];

// ── Leave error codes ──
export const LEAVE_ERRORS = {
  NOT_FOUND: "LEAVE_001",
  INVALID_PARAMS: "LEAVE_002",
  OVERLAP_DETECTED: "LEAVE_003",
  CREATE_FAILED: "LEAVE_004",
  UPDATE_FAILED: "LEAVE_005",
  QUERY_FAILED: "LEAVE_006",
  APPROVE_FAILED: "LEAVE_007",
  REJECT_FAILED: "LEAVE_008",
} as const;

export type LeaveErrorCode = (typeof LEAVE_ERRORS)[keyof typeof LEAVE_ERRORS];

// ── Export error codes ──
export const EXPORT_ERRORS = {
  INVALID_PARAMS: "EXPORT_001",
  GENERATION_FAILED: "EXPORT_002",
} as const;

export type ExportErrorCode = (typeof EXPORT_ERRORS)[keyof typeof EXPORT_ERRORS];

// ── Activity types ──
export const ACTIVITY_TYPE = {
  COURSE: "course",
  EXERCISE: "exercise",
  EXPERIENCE: "experience",
  LIVE_STREAM: "live_stream",
  CUSTOM: "custom",
} as const;

export type ActivityType = (typeof ACTIVITY_TYPE)[keyof typeof ACTIVITY_TYPE];

// ── Activity statuses ──
export const ACTIVITY_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
} as const;

export type ActivityStatus = (typeof ACTIVITY_STATUS)[keyof typeof ACTIVITY_STATUS];

// ── Activity registration statuses ──
export const ACTIVITY_REGISTRATION_STATUS = {
  REGISTERED: "registered",
  CHECKED_IN: "checked_in",
  NO_SHOW: "no_show",
  CANCELLED: "cancelled",
} as const;

export type ActivityRegistrationStatus = (typeof ACTIVITY_REGISTRATION_STATUS)[keyof typeof ACTIVITY_REGISTRATION_STATUS];

// ── Activity error codes ──
export const ACTIVITY_ERRORS = {
  FULL: "ACTIVITY_001",
  CANCELLED: "ACTIVITY_002",
  NOT_PUBLISHED: "ACTIVITY_003",
  REGISTRATION_CLOSED: "ACTIVITY_004",
  ALREADY_REGISTERED: "ACTIVITY_005",
  NO_SHOW_LIMIT: "ACTIVITY_006",
  NOT_REGISTERED: "ACTIVITY_007",
  ALREADY_CHECKED_IN: "ACTIVITY_008",
  NOT_STARTED: "ACTIVITY_009",
  NOT_FOUND: "ACTIVITY_010",
  INSTRUCTOR_CONFLICT: "ACTIVITY_011",
  OPERATION_FAILED: "ACTIVITY_012",
} as const;

export type ActivityErrorCode = (typeof ACTIVITY_ERRORS)[keyof typeof ACTIVITY_ERRORS];

// ── Activity no-show limit ──
export const ACTIVITY_NO_SHOW_LIMIT = 2;

// ── Activity check-in grace minutes ──
export const ACTIVITY_CHECKIN_GRACE_MINUTES = 20;
