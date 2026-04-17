// ── Staff roles ──
export const STAFF_ROLES = {
  ADMIN: "admin",
  STORE_MANAGER: "store_manager",
  STAFF: "staff",
} as const;

export type StaffRole = (typeof STAFF_ROLES)[keyof typeof STAFF_ROLES];

// ── Permission error codes ──
export const PERMISSION_ERRORS = {
  FORBIDDEN: "PERMISSION_001",
} as const;
export type PermissionErrorCode = (typeof PERMISSION_ERRORS)[keyof typeof PERMISSION_ERRORS];

// ── Role access levels ──
export const ROLE_ACCESS_LEVELS = {
  admin: ["management", "business"],
  store_manager: ["management", "business"],
  staff: ["business"],
} as const;
export type AccessLevel = "management" | "business";

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

// ── Store switch error codes ──
export const STORE_SWITCH_ERRORS = {
  INVALID_STORE: "STORE_SWITCH_001",
  STORE_NOT_ASSIGNED: "STORE_SWITCH_002",
  SWITCH_FAILED: "STORE_SWITCH_003",
} as const;

export type StoreSwitchErrorCode = (typeof STORE_SWITCH_ERRORS)[keyof typeof STORE_SWITCH_ERRORS];

// ── Rate limit error codes ──
export const RATE_LIMIT_ERRORS = {
  TOO_MANY_REQUESTS: "RATE_LIMIT_001",
} as const;

export type RateLimitErrorCode = (typeof RATE_LIMIT_ERRORS)[keyof typeof RATE_LIMIT_ERRORS];

// ── SMS error codes ──
export const SMS_ERRORS = {
  SEND_FAILED: "SMS_001",
  CODE_EXPIRED: "SMS_002",
  CODE_INVALID: "SMS_003",
} as const;

export type SmsErrorCode = (typeof SMS_ERRORS)[keyof typeof SMS_ERRORS];

// ── Staff assignment error codes ──
export const STAFF_ASSIGN_ERRORS = {
  FORBIDDEN: "STAFF_ASSIGN_001",
  STAFF_NOT_FOUND: "STAFF_ASSIGN_002",
  STORE_NOT_FOUND: "STAFF_ASSIGN_003",
  ASSIGN_FAILED: "STAFF_ASSIGN_004",
  REMOVE_FAILED: "STAFF_ASSIGN_005",
  ALREADY_ASSIGNED: "STAFF_ASSIGN_006",
  NOT_ASSIGNED: "STAFF_ASSIGN_007",
  INVALID_PARAMS: "STAFF_ASSIGN_008",
} as const;

export type StaffAssignErrorCode = (typeof STAFF_ASSIGN_ERRORS)[keyof typeof STAFF_ASSIGN_ERRORS];

// ── Employee error codes ──
export const EMPLOYEE_ERRORS = {
  NOT_FOUND: "EMPLOYEE_001",
  CREATE_FAILED: "EMPLOYEE_002",
  UPDATE_FAILED: "EMPLOYEE_003",
  DISABLE_FAILED: "EMPLOYEE_004",
  USERNAME_EXISTS: "EMPLOYEE_005",
  PHONE_EXISTS: "EMPLOYEE_006",
  INVALID_PARAMS: "EMPLOYEE_007",
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

// ── SMS configuration ──
export const SMS_CODE_TTL = Number(process.env.SMS_CODE_TTL) || 300;

export const SMS_PROVIDER = (process.env.SMS_PROVIDER as "aliyun" | "mock") || "mock";
