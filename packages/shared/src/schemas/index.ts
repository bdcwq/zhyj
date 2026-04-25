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

// ── Resident list query ──
export const residentListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().optional(),
});

export type ResidentListQueryInput = z.infer<typeof residentListQuerySchema>;

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
  status: z.enum(["completed", "paused", "in_progress"]).optional(),
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

// ── Statistics ──
export const statisticsOverviewQuerySchema = z.object({
  storeId: z.string().min(1, "门店ID不能为空"),
  date: z.string().date("请输入有效的日期").optional(),
});

export type StatisticsOverviewQueryInput = z.infer<typeof statisticsOverviewQuerySchema>;

export const statisticsPeriodQuerySchema = z
  .object({
    storeId: z.string().min(1, "门店ID不能为空"),
    period: z.enum(["daily", "weekly", "monthly"]),
    dateFrom: z.string().date("请输入有效的日期").optional(),
    dateTo: z.string().date("请输入有效的日期").optional(),
  })
  .refine(
    (data) => {
      if (!data.dateFrom || !data.dateTo) return true;
      return data.dateFrom <= data.dateTo;
    },
    { message: "开始日期不能晚于结束日期", path: ["dateFrom"] }
  )
  .refine(
    (data) => {
      if (!data.dateFrom || !data.dateTo) return true;
      const from = new Date(data.dateFrom);
      const to = new Date(data.dateTo);
      const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= 365;
    },
    { message: "日期范围不能超过365天", path: ["dateTo"] }
  );

export type StatisticsPeriodQueryInput = z.infer<typeof statisticsPeriodQuerySchema>;

// ── Notification ──
export const notificationTypeSchema = z.enum([
  "appointment_reminder",
  "no_show_warning",
  "campaign_reward",
  "custom",
]);

export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const sendNotificationSchema = z.object({
  recipientType: z.enum(["staff", "resident"], { message: "接收人类型无效" }),
  recipientId: z.string().min(1, "接收人ID不能为空"),
  type: notificationTypeSchema,
  title: z.string().min(1, "通知标题不能为空").max(100, "标题过长"),
  content: z.string().min(1, "通知内容不能为空").max(1000, "内容过长"),
  channel: z.enum(["console", "wechat"]).optional().default("console"),
});

export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;

export const notificationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  recipientType: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
});

export type NotificationListQueryInput = z.infer<typeof notificationListQuerySchema>;

// ── Campaign schemas ──

export const campaignRulesSchema = z.object({
  bonusAppointments: z.number().int().min(1).default(1),
  rewardCondition: z.enum(["first_appointment_completed"]).default("first_appointment_completed"),
});

export type CampaignRules = z.infer<typeof campaignRulesSchema>;

export const createCampaignSchema = z.object({
  name: z.string().min(1, "活动名称不能为空").max(100, "名称过长"),
  type: z.enum(["referral", "promotion"]).default("referral"),
  rules: campaignRulesSchema,
  startDate: z.string().min(1, "开始日期不能为空"),
  endDate: z.string().min(1, "结束日期不能为空"),
  priority: z.number().int().min(0).default(0),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(["referral", "promotion"]).optional(),
  rules: campaignRulesSchema.optional(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
  priority: z.number().int().min(0).optional(),
  status: z.enum(["active", "paused"]).optional(),
});

export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

export const participateCampaignSchema = z.object({
  refereeId: z.string().min(1, "被推荐人ID不能为空"),
});

export type ParticipateCampaignInput = z.infer<typeof participateCampaignSchema>;

export const campaignListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.string().optional(),
  type: z.string().optional(),
});

export type CampaignListQueryInput = z.infer<typeof campaignListQuerySchema>;

// ── Switch store ──
export const switchStoreSchema = z.object({
  storeId: z.string().min(1, "门店ID不能为空"),
});

export type SwitchStoreInput = z.infer<typeof switchStoreSchema>;

// ── Bind/unbind store (admin management) ──
export const bindStoreSchema = z.object({
  storeId: z.string().min(1, "门店ID不能为空"),
});

export type BindStoreInput = z.infer<typeof bindStoreSchema>;

// ── Room schemas ──
export const createRoomSchema = z.object({
  name: z.string().min(1, "房间名称不能为空").max(50, "房间名称过长"),
  capacity: z.coerce.number().int().min(1, "容量至少为1").default(1),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const updateRoomSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  capacity: z.coerce.number().int().min(1).optional(),
});

export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

export const roomListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().optional(),
});

export type RoomListQueryInput = z.infer<typeof roomListQuerySchema>;

// ── Store schemas ──
export const createStoreSchema = z.object({
  name: z.string().min(1, "店铺名称不能为空").max(100, "店铺名称过长"),
  address: z.string().optional(),
  phone: z.string().optional(),
  businessHours: z.string().optional(),
});

export type CreateStoreInput = z.infer<typeof createStoreSchema>;

export const updateStoreSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  businessHours: z.string().optional(),
});

export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;

export const storeListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().optional(),
});

export type StoreListQueryInput = z.infer<typeof storeListQuerySchema>;

// ── Machine schemas ──
export const createMachineSchema = z.object({
  name: z.string().min(1, "设备名称不能为空").max(50, "设备名称过长"),
  roomId: z.string().min(1, "房间ID不能为空").optional(),
  status: z.enum(["available", "in_use", "maintenance", "out_of_service"]).optional().default("available"),
});

export type CreateMachineInput = z.infer<typeof createMachineSchema>;

export const updateMachineSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  roomId: z.string().min(1).optional().nullable(),
  status: z.enum(["available", "in_use", "maintenance", "out_of_service"]).optional(),
});

export type UpdateMachineInput = z.infer<typeof updateMachineSchema>;

export const machineListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  roomId: z.string().optional(),
  status: z.string().optional(),
});

export type MachineListQueryInput = z.infer<typeof machineListQuerySchema>;

// ── Schedule / Shift Template ──
export const shiftDefinitionSchema = z.object({
  type: z.string().min(1, "班次类型不能为空"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "时间格式应为 HH:mm"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "时间格式应为 HH:mm"),
  requiredStaff: z.number().int().min(1).default(1),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1, "模板名称不能为空").max(100),
  shifts: z.array(shiftDefinitionSchema).min(1, "至少定义一个班次"),
  effectiveDays: z.array(z.number().int().min(1).max(7)).min(1, "至少选择一天"),
});

export const updateTemplateSchema = createTemplateSchema.partial();

export const generateScheduleSchema = z.object({
  templateId: z.string().min(1, "模板ID不能为空"),
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD"),
});

export const scheduleListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  staffId: z.string().optional(),
  status: z.string().optional(),
});

export const updateScheduleSchema = z.object({
  staffId: z.string().min(1, "员工ID不能为空").optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "时间格式应为 HH:mm").optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "时间格式应为 HH:mm").optional(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type GenerateScheduleInput = z.infer<typeof generateScheduleSchema>;
export type ScheduleListQueryInput = z.infer<typeof scheduleListQuerySchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type ShiftDefinition = z.infer<typeof shiftDefinitionSchema>;

// ── Attendance schemas ──
export const clockInSchema = z.object({
  scheduleId: z.string().min(1, "排班ID不能为空"),
});

export type ClockInInput = z.infer<typeof clockInSchema>;

export const clockOutSchema = z.object({
  attendanceId: z.string().min(1, "考勤ID不能为空"),
});

export type ClockOutInput = z.infer<typeof clockOutSchema>;

export const attendanceListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  staffId: z.string().optional(),
  status: z.string().optional(),
});

export type AttendanceListQueryInput = z.infer<typeof attendanceListQuerySchema>;

// ── Leave schemas ──
export const createLeaveSchema = z
  .object({
    type: z.enum(["sick", "personal", "annual", "other"]),
    startDate: z.string().datetime().or(z.string().date()),
    endDate: z.string().datetime().or(z.string().date()),
    reason: z.string().optional(),
  })
  .refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
    message: "结束日期不能早于开始日期",
    path: ["endDate"],
  });

export type CreateLeaveInput = z.infer<typeof createLeaveSchema>;

export const approveLeaveSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reason: z.string().optional(),
});

export type ApproveLeaveInput = z.infer<typeof approveLeaveSchema>;

export const leaveListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  staffId: z.string().optional(),
  status: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type LeaveListQueryInput = z.infer<typeof leaveListQuerySchema>;

// ── Transfer schemas ──
export const transferSchema = z
  .object({
    fromStoreId: z.string().min(1, "原店铺不能为空"),
    toStoreId: z.string().min(1, "目标店铺不能为空"),
  })
  .refine((data) => data.fromStoreId !== data.toStoreId, {
    message: "原店铺和目标店铺不能相同",
    path: ["toStoreId"],
  });

export type TransferInput = z.infer<typeof transferSchema>;

// ── Cross-store report schema ──
export const crossStoreReportSchema = z
  .object({
    period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
    dateFrom: z.string().date("请输入有效的日期").optional(),
    dateTo: z.string().date("请输入有效的日期").optional(),
    metric: z.enum(["overview", "appointments", "monitoring", "residents"]).default("overview"),
  })
  .refine(
    (data) => {
      if (!data.dateFrom || !data.dateTo) return true;
      return data.dateFrom <= data.dateTo;
    },
    { message: "开始日期不能晚于结束日期", path: ["dateFrom"] }
  )
  .refine(
    (data) => {
      if (!data.dateFrom || !data.dateTo) return true;
      const from = new Date(data.dateFrom);
      const to = new Date(data.dateTo);
      const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= 365;
    },
    { message: "日期范围不能超过365天", path: ["dateTo"] }
  );

export type CrossStoreReportInput = z.infer<typeof crossStoreReportSchema>;

// ── Attendance report schema ──
export const attendanceReportQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "月份格式应为 YYYY-MM"),
  storeId: z.string().optional(),
  staffId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AttendanceReportQueryInput = z.infer<typeof attendanceReportQuerySchema>;

// ── Export query schemas (subsets of list schemas for CSV export) ──
export const exportResidentsQuerySchema = z.object({
  search: z.string().optional(),
});

export type ExportResidentsQueryInput = z.infer<typeof exportResidentsQuerySchema>;

export const exportAppointmentsQuerySchema = z.object({
  residentId: z.string().optional(),
  status: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type ExportAppointmentsQueryInput = z.infer<typeof exportAppointmentsQuerySchema>;

export const exportMonitoringQuerySchema = z.object({
  residentId: z.string().optional(),
});

export type ExportMonitoringQueryInput = z.infer<typeof exportMonitoringQuerySchema>;

// ── Activity schemas ──
export const createActivitySchema = z
  .object({
    name: z.string().min(1, "活动名称不能为空").max(100, "活动名称过长"),
    description: z.string().max(500, "描述过长").optional(),
    type: z.enum(["course", "exercise", "experience", "live_stream", "custom"], {
      message: "活动类型无效",
    }),
    customType: z.string().max(50, "自定义类型名称过长").optional(),
    activityDate: z.string().min(1, "活动日期不能为空"),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "开始时间格式应为 HH:mm"),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "结束时间格式应为 HH:mm"),
    maxCapacity: z.coerce.number().int().min(1, "最大人数至少为1").max(500, "最大人数不能超过500"),
    liveStreamUrl: z.string().max(500, "直播链接过长").optional(),
    instructorId: z.string().optional(),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "结束时间必须晚于开始时间",
    path: ["endTime"],
  })
  .refine((data) => data.type !== "custom" || data.customType, {
    message: "自定义类型需要填写类型名称",
    path: ["customType"],
  });

export type CreateActivityInput = z.infer<typeof createActivitySchema>;

export const updateActivitySchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    customType: z.string().max(50).optional(),
    activityDate: z.string().min(1).optional(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    maxCapacity: z.coerce.number().int().min(1).max(500).optional(),
    liveStreamUrl: z.string().max(500).optional().nullable(),
    instructorId: z.string().optional().nullable(),
  })
  .refine((data) => {
    if (data.startTime && data.endTime) return data.endTime > data.startTime;
    return true;
  }, {
    message: "结束时间必须晚于开始时间",
    path: ["endTime"],
  });

export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;

export const activityListQuerySchema = z.object({
  date: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type ActivityListQueryInput = z.infer<typeof activityListQuerySchema>;

// ── Activity registration schema ──
export const registerActivitySchema = z.object({
  residentId: z.string().min(1, "居民ID不能为空"),
});

export type RegisterActivityInput = z.infer<typeof registerActivitySchema>;

export const checkInActivitySchema = z.object({
  residentId: z.string().min(1, "居民ID不能为空"),
});

export type CheckInActivityInput = z.infer<typeof checkInActivitySchema>;

export const myRegistrationsQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type MyRegistrationsQueryInput = z.infer<typeof myRegistrationsQuerySchema>;
