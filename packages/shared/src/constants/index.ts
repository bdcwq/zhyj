// ── Staff roles ──
export const STAFF_ROLES = {
  ADMIN: "admin",
  STAFF: "staff",
} as const;

export type StaffRole = (typeof STAFF_ROLES)[keyof typeof STAFF_ROLES];

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
