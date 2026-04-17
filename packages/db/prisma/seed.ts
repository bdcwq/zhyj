import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const RESIDENT_NAMES = [
  "张三", "李四", "王五", "赵六", "孙七",
  "周八", "吴九", "郑十", "陈一", "林二",
];

const REGISTRATION_SOURCES = ["walk-in", "activity", "referral", "marketing"] as const;

function randomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomScore(): number {
  return Math.floor(Math.random() * 36) + 60; // 60–95
}

async function main() {
  console.log("🌱 Seeding database...");

  // ── Clean existing data (idempotent) ──
  console.log("🧹 Cleaning existing data...");
  await prisma.campaignParticipation.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.robotSession.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.monitoringRecord.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.resident.deleteMany();
  await prisma.staffStore.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.machine.deleteMany();
  await prisma.room.deleteMany();
  await prisma.store.deleteMany();

  // ── Stores ──
  const storeA = await prisma.store.create({
    data: {
      name: "测试健康管理中心A",
      address: "测试地址A",
    },
  });
  const storeB = await prisma.store.create({
    data: {
      name: "测试健康管理中心B",
      address: "测试地址B",
    },
  });
  console.log(`✅ Stores created: ${storeA.name}, ${storeB.name}`);

  // ── Rooms ──
  const rooms = await Promise.all(
    ["艾灸室1", "艾灸室2", "艾灸室3"].map((name) =>
      prisma.room.create({
        data: { name, storeId: storeA.id, capacity: 2 },
      })
    )
  );
  console.log(`✅ ${rooms.length} rooms created`);

  // ── Machines ──
  const machines = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      prisma.machine.create({
        data: {
          name: `艾灸机器人${i + 1}`,
          storeId: storeA.id,
          status: "available",
        },
      })
    )
  );
  console.log(`✅ ${machines.length} machines created`);

  // ── Staff ──
  const adminPasswordHash = await bcrypt.hash("admin123", 10);
  const staffPasswordHash = await bcrypt.hash("staff123", 10);

  const staffAdmin = await prisma.staff.create({
    data: {
      username: "admin",
      password: adminPasswordHash,
      phone: "13900000001",
      name: "管理员",
      role: "admin",
    },
  });

  const staffMember = await prisma.staff.create({
    data: {
      username: "staff",
      password: staffPasswordHash,
      phone: "13900000002",
      name: "员工一",
      role: "staff",
    },
  });
  console.log(`✅ 2 staff created (admin, staff)`);

  // ── StaffStore assignments ──
  await prisma.staffStore.createMany({
    data: [
      { staffId: staffAdmin.id, storeId: storeA.id },
      { staffId: staffAdmin.id, storeId: storeB.id },
      { staffId: staffMember.id, storeId: storeA.id },
    ],
  });
  console.log(`✅ StaffStore assignments created (admin→A+B, staff→A)`);

  // ── Residents ──
  const residents = await Promise.all(
    RESIDENT_NAMES.map((name, i) =>
      prisma.resident.create({
        data: {
          name,
          phone: `1380013800${(i + 1).toString().padStart(2, "0")}`,
          registrationSource: randomItem(REGISTRATION_SOURCES),
          storeId: storeA.id,
        },
      })
    )
  );
  console.log(`✅ ${residents.length} residents created`);

  // ── Monitoring Records (1–3 per resident) ──
  const CONSTITUTION_TYPES = ["气虚质", "阳虚质", "阴虚质", "痰湿质", "湿热质", "血瘀质", "气郁质", "特禀质", "平和质"];
  let monitoringCount = 0;

  for (const resident of residents) {
    const recordCount = Math.floor(Math.random() * 3) + 1;
    for (let j = 0; j < recordCount; j++) {
      const daysAgo = Math.floor(Math.random() * 90);
      await prisma.monitoringRecord.create({
        data: {
          residentId: resident.id,
          score: randomScore(),
          monitoringDate: new Date(Date.now() - daysAgo * 86400000),
          constitutionType: randomItem(CONSTITUTION_TYPES),
          storeId: storeA.id,
        },
      });
      monitoringCount++;
    }
  }
  console.log(`✅ ${monitoringCount} monitoring records created`);

  console.log("\n🎉 Seed complete!");
  console.log(`   Stores: ${storeA.name}, ${storeB.name}`);
  console.log(`   Rooms: ${rooms.length} (store A)`);
  console.log(`   Machines: ${machines.length} (store A)`);
  console.log(`   Staff: ${staffAdmin.username} (${staffAdmin.role}) → stores A+B, ${staffMember.username} (${staffMember.role}) → store A`);
  console.log(`   Residents: ${residents.length} (store A)`);
  console.log(`   Monitoring Records: ${monitoringCount} (store A)`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
