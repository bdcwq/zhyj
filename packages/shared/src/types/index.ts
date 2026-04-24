// ── Base timestamps ──
export interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}

// ── Store ──
export interface Store extends Timestamps {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  deletedAt?: Date | null;
}

// ── Room ──
export interface Room extends Timestamps {
  id: string;
  name: string;
  storeId: string;
  capacity: number;
  deletedAt?: Date | null;
}

// ── Machine ──
export interface Machine extends Timestamps {
  id: string;
  name: string;
  storeId: string;
  roomId?: string | null;
  status: string;
  deletedAt?: Date | null;
}

// ── Staff ──
export interface Staff extends Timestamps {
  id: string;
  username: string;
  password: string;
  phone: string;
  name: string;
  role: string;
  deletedAt?: Date | null;
}

// ── StaffStore (junction) ──
export interface StaffStore extends Timestamps {
  id: string;
  staffId: string;
  storeId: string;
}

// ── Store summary (used in login response & store switcher) ──
export interface StoreSummary {
  id: string;
  name: string;
}

// ── Resident ──
export interface Resident extends Timestamps {
  id: string;
  name: string;
  phone: string;
  wechatOpenid?: string | null;
  registrationSource: string;
  deletedAt?: Date | null;
}

// ── ResidentStore (junction) ──
export interface ResidentStore extends Timestamps {
  id: string;
  residentId: string;
  storeId: string;
}

// ── MonitoringRecord ──
export interface MonitoringRecord extends Timestamps {
  id: string;
  residentId: string;
  score: number;
  monitoringDate: Date;
  constitutionType?: string | null;
  storeId: string;
  deletedAt?: Date | null;
}

// ── Appointment ──
export interface Appointment extends Timestamps {
  id: string;
  residentId: string;
  staffId?: string | null;
  roomId?: string | null;
  machineId?: string | null;
  scheduledAt: Date;
  status: string;
  noShowCount: number;
  storeId: string;
  deletedAt?: Date | null;
}

// ── Verification ──
export interface Verification extends Timestamps {
  id: string;
  appointmentId: string;
  verifiedBy: string;
  verifiedAt: Date;
  storeId: string;
}

// ── RobotSession ──
export interface RobotSession extends Timestamps {
  id: string;
  appointmentId: string;
  routine?: string | null;
  status: string;
  startedAt: Date;
  endedAt?: Date | null;
  storeId: string;
}

// ── ShiftTemplate ──
export interface ShiftTemplate extends Timestamps {
  id: string;
  name: string;
  storeId: string;
  shifts: string; // JSON string
  effectiveDays: string; // JSON string
  deletedAt?: Date | null;
}

// ── Schedule ──
export interface Schedule extends Timestamps {
  id: string;
  date: Date;
  staffId: string;
  storeId: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  status: string;
  templateId?: string | null;
}

// ── Attendance ──
export interface Attendance extends Timestamps {
  id: string;
  staffId: string;
  storeId: string;
  scheduleId?: string | null;
  date: Date;
  clockIn?: Date | null;
  clockOut?: Date | null;
  status: string;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  workedMinutes?: number | null;
}

// ── Leave ──
export interface Leave extends Timestamps {
  id: string;
  staffId: string;
  storeId: string;
  type: string;
  startDate: Date;
  endDate: Date;
  status: string;
  reason?: string | null;
  approvedBy?: string | null;
  approvedAt?: Date | null;
}

// ── API response envelope ──
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// ── Auth token response ──
export interface AuthTokenResponse {
  token: string;
  expiresIn: string;
  user: {
    id: string;
    username?: string;
    phone: string;
    name: string;
    role?: string;
    stores?: StoreSummary[];
  };
}
