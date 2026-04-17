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

// ── ResidentStore (junction) ──
export interface ResidentStore extends Timestamps {
  id: string;
  residentId: string;
  storeId: string;
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
