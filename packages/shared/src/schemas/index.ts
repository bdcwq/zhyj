import { z } from "zod";

// ── Staff password login ──
export const staffPasswordLoginSchema = z.object({
  username: z
    .string()
    .min(1, "用户名不能为空")
    .max(50, "用户名过长"),
  password: z
    .string()
    .min(6, "密码至少6位")
    .max(100, "密码过长"),
});

// ── Staff SMS login ──
export const staffSmsLoginSchema = z.object({
  phone: z
    .string()
    .regex(/^1[3-9]\d{9}$/, "请输入有效的手机号"),
  code: z
    .string()
    .length(6, "验证码为6位数字"),
});

// ── SMS code request ──
export const smsCodeRequestSchema = z.object({
  phone: z
    .string()
    .regex(/^1[3-9]\d{9}$/, "请输入有效的手机号"),
});

// ── WeChat login ──
export const wechatLoginSchema = z.object({
  code: z
    .string()
    .min(1, "微信授权码不能为空"),
});

// ── Create resident ──
export const createResidentSchema = z.object({
  name: z
    .string()
    .min(1, "姓名不能为空")
    .max(50, "姓名过长"),
  phone: z
    .string()
    .regex(/^1[3-9]\d{9}$/, "请输入有效的手机号"),
  wechatOpenid: z.string().optional(),
  registrationSource: z.string().optional(),
  storeId: z.string().min(1, "门店ID不能为空"),
});

// ── Create monitoring record ──
export const createMonitoringRecordSchema = z.object({
  residentId: z.string().min(1, "居民ID不能为空"),
  score: z.number().int().min(0, "分数不能为负").max(100, "分数不能超过100"),
  monitoringDate: z.string().datetime().or(z.string().date()),
  constitutionType: z.string().optional(),
});

// ── Update monitoring record (all fields optional) ──
export const updateMonitoringRecordSchema = createMonitoringRecordSchema.partial();

// ── Monitoring history query ──
export const monitoringHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ── Appointment ──
export const createAppointmentSchema = z.object({
  residentId: z.string().min(1, "居民ID不能为空"),
  machineId: z.string().optional(),
  roomId: z.string().optional(),
  scheduledAt: z.string().datetime().or(z.string().date()),
});

export const updateAppointmentSchema = z.object({
  residentId: z.string().min(1, "居民ID不能为空").optional(),
  machineId: z.string().optional(),
  roomId: z.string().optional(),
  scheduledAt: z.string().datetime().or(z.string().date()).optional(),
  status: z.string().optional(),
});

export const appointmentListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  residentId: z.string().optional(),
  status: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const availabilityQuerySchema = z.object({
  date: z.string().date("请输入有效的日期"),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  roomId: z.string().optional(),
});

// ── Inferred types ──
export type StaffPasswordLoginInput = z.infer<typeof staffPasswordLoginSchema>;
export type StaffSmsLoginInput = z.infer<typeof staffSmsLoginSchema>;
export type SmsCodeRequestInput = z.infer<typeof smsCodeRequestSchema>;
export type WechatLoginInput = z.infer<typeof wechatLoginSchema>;
export type CreateResidentInput = z.infer<typeof createResidentSchema>;
export type CreateMonitoringRecordInput = z.infer<typeof createMonitoringRecordSchema>;
export type UpdateMonitoringRecordInput = z.infer<typeof updateMonitoringRecordSchema>;
export type MonitoringHistoryQueryInput = z.infer<typeof monitoringHistoryQuerySchema>;
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
export type AppointmentListQueryInput = z.infer<typeof appointmentListQuerySchema>;
export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;

// ── Robot session ──
export const createRobotSessionSchema = z.object({
  appointmentId: z.string().min(1, "预约ID不能为空"),
  routine: z.string().optional(),
});

export const updateRobotSessionSchema = z.object({
  status: z.enum(["completed", "paused"]).optional(),
  routine: z.string().optional(),
});

export const robotSessionListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.string().optional(),
  residentId: z.string().optional(),
});

// ── Robot session inferred types ──
export type CreateRobotSessionInput = z.infer<typeof createRobotSessionSchema>;
export type UpdateRobotSessionInput = z.infer<typeof updateRobotSessionSchema>;
export type RobotSessionListQueryInput = z.infer<typeof robotSessionListQuerySchema>;
