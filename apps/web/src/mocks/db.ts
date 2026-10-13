/**
 * MOCK DATABASE (in-memory) — chỉ dùng khi VITE_USE_MOCK_API=true.
 * Dữ liệu được sinh tương đối theo kỳ hiện tại để demo luôn có "tháng này".
 * Tải lại trang sẽ reset toàn bộ thay đổi.
 */
import type { Building, WsRoom, WsViewing } from '@/features/property/types';
import type { Contract, Tenant, Vehicle } from '@/features/leasing/types';
import type { DepositTx, Invoice, MeterReading, Payment, RateVersion } from '@/features/billing/types';
import type { MaintenanceRequest } from '@/features/maintenance/types';
import type { Member, WorkspaceSettings } from '@/features/members/types';
import type { AppNotification } from '@/features/notifications/types';
import type { AdminListing, AuditLog } from '@/features/admin/types';
import type { LinkRequest } from '@/features/tenant-portal/types';
import type { AmenityCode } from '@/features/rooms/types';
import { addDays, addMonths, currentPeriod, periodEnd, todayVN } from '@/lib/dates';
import { buildInvoiceLines, deriveInvoiceStatus, rateForDate, sumLines } from '@/features/billing/calc';

export const TODAY = todayVN();
export const CURRENT_PERIOD = currentPeriod();
const WS = 'ws-an-nhien';
const WS2 = 'ws-sunhouse';

let seq = 1000;
export const nextId = (prefix: string) => `${prefix}-${++seq}`;

const iso = (date: string, hour = 9) => `${date}T${String(hour - 7).padStart(2, '0')}:00:00.000Z`;

const IMG = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=70`;
const ROOM_PHOTOS = [
  IMG('photo-1522708323590-d24dbb6b0267'),
  IMG('photo-1502672260266-1c1ef2d93688'),
  IMG('photo-1560448204-e02f11c3d0e2'),
  IMG('photo-1505691938895-1758d7feb511'),
];

// ---------------------------------------------------------------- Buildings
const buildings: Building[] = [
  { id: 'bld-a', workspaceId: WS, name: 'Tòa A', address: '120 Lê Văn Việt', ward: 'Hiệp Phú', district: 'Thủ Đức', city: 'TP.HCM', floors: 4, lat: 10.8466, lng: 106.7766, createdAt: '2022-03-01T02:00:00.000Z' },
  { id: 'bld-b', workspaceId: WS, name: 'Tòa B', address: '45 Đỗ Xuân Hợp', ward: 'Phước Long B', district: 'Thủ Đức', city: 'TP.HCM', floors: 3, lat: 10.8178, lng: 106.7731, createdAt: '2022-08-01T02:00:00.000Z' },
  { id: 'bld-c', workspaceId: WS, name: 'Tòa C', address: '88 Tăng Nhơn Phú', ward: 'Phước Long B', district: 'Thủ Đức', city: 'TP.HCM', floors: 4, lat: 10.8307, lng: 106.7779, createdAt: '2023-05-01T02:00:00.000Z' },
  { id: 'bld-s', workspaceId: WS2, name: 'SunHouse P.25', address: '210 Điện Biên Phủ', ward: 'P.25', district: 'Bình Thạnh', city: 'TP.HCM', floors: 5, lat: 10.8016, lng: 106.7146, createdAt: '2024-01-01T02:00:00.000Z' },
];

// ---------------------------------------------------------------- Rooms
const roomCodes: Record<string, string[]> = {
  'bld-a': ['P.101', 'P.102', 'P.103', 'P.201', 'P.202', 'P.203', 'P.204', 'P.205', 'P.301', 'P.302'],
  'bld-b': ['B.101', 'B.102', 'B.103', 'B.104', 'B.201', 'B.202', 'B.301', 'B.304', 'B.305', 'B.306'],
  'bld-c': ['C.101', 'C.102', 'C.201', 'C.202', 'C.301', 'C.302', 'C.401', 'C.402'],
  'bld-s': Array.from({ length: 12 }, (_, i) => `S.${Math.floor(i / 4) + 1}0${(i % 4) + 1}`),
};
const VACANT = new Set(['P.102', 'B.304', 'C.101']);
const AMENITY_SETS: AmenityCode[][] = [
  ['AIR_CON', 'PRIVATE_WC', 'WIFI'],
  ['AIR_CON', 'BALCONY', 'WASHER', 'PRIVATE_WC'],
  ['WINDOW', 'WIFI', 'PARKING'],
  ['AIR_CON', 'FURNISHED', 'KITCHEN', 'PRIVATE_WC', 'ELEVATOR'],
];

const rooms: WsRoom[] = buildings.flatMap((b) =>
  roomCodes[b.id]!.map((code, i) => {
    const floor = Number(code.replace(/\D/g, '').charAt(0)) || 1;
    const price = 3_200_000 + ((i * 7) % 6) * 300_000;
    const vacant = b.workspaceId === WS ? VACANT.has(code) : i % 3 === 0;
    return {
      id: `room-${b.id}-${code.replace('.', '')}`,
      workspaceId: b.workspaceId,
      buildingId: b.id,
      buildingName: b.name,
      code,
      floor,
      area: 18 + ((i * 3) % 14),
      basePrice: price,
      maxOccupants: i % 4 === 3 ? 3 : 2,
      amenities: AMENITY_SETS[i % 4]!,
      images: [ROOM_PHOTOS[i % 4]!, ROOM_PHOTOS[(i + 1) % 4]!],
      description: 'Phòng sạch sẽ, thoáng mát, có cửa sổ, khu vực an ninh. Giờ giấc tự do, có camera 24/7.',
      operationalStatus: vacant ? 'VACANT' : 'OCCUPIED',
      listingStatus: vacant ? 'PUBLISHED' : 'HIDDEN',
      updatedAt: iso(addDays(TODAY, -i)),
    } satisfies WsRoom;
  }),
);

// ---------------------------------------------------------------- Tenants
const FIRST = ['Trần Văn Nam', 'Lê Hoàng Yến', 'Đặng Quốc Trung', 'Ngô Thị Mai', 'Phạm Gia Huy', 'Võ Thanh Tâm', 'Bùi Ngọc Ánh', 'Hồ Minh Khang', 'Đỗ Thu Trang', 'Lý Gia Bảo', 'Huỳnh Kim Ngân', 'Phan Tuấn Kiệt', 'Mai Anh Thư', 'Trịnh Quốc Bảo', 'Dương Mỹ Linh', 'Tạ Đức Anh', 'Châu Ngọc Hân', 'Vũ Hải Đăng', 'Lâm Thảo Vy', 'Nguyễn Huy Anh', 'Lê Quỳnh Như', 'Kiều Minh Tuấn', 'Hà Phương Thảo', 'Tống Gia Hưng', 'La Bích Ngọc'];
const CO = ['Nguyễn Thị Hoa', 'Trần Minh Đức', 'Lê Văn Tài', 'Phạm Thu Hà', 'Võ Minh Quân', 'Đặng Thị Lan', 'Bùi Văn Long', 'Hồ Thị Yến'];

const tenants: Tenant[] = [];
function addTenant(name: string, i: number, linked: Tenant['accountLinkStatus'] = 'UNLINKED'): Tenant {
  const t: Tenant = {
    id: `ten-${tenants.length + 1}`,
    workspaceId: WS,
    fullName: name,
    phone: `09${String(10_000_000 + i * 734_513).slice(0, 8)}`,
    email: i % 3 === 0 ? `tenant${i}@mail.vn` : undefined,
    idNumber: `0792${String(10_000_000 + i * 91_731).slice(0, 8)}`,
    dateOfBirth: `${1995 + (i % 8)}-0${(i % 9) + 1}-1${i % 9}`,
    hometown: ['Đồng Nai', 'Bình Định', 'Cần Thơ', 'Nghệ An', 'Long An'][i % 5],
    accountLinkStatus: linked,
    createdAt: iso(addDays(TODAY, -300 + i)),
  };
  tenants.push(t);
  return t;
}

// ---------------------------------------------------------------- Contracts
const contracts: Contract[] = [];
const occupiedRooms = rooms.filter((r) => r.workspaceId === WS && r.operationalStatus === 'OCCUPIED');
occupiedRooms.forEach((room, i) => {
  const primary = addTenant(FIRST[i % FIRST.length]!, i, i === 0 ? 'LINKED' : i === 4 ? 'PENDING' : 'UNLINKED');
  const occupantIds = [primary.id];
  if (i % 3 === 1) occupantIds.push(addTenant(CO[Math.floor(i / 3) % CO.length]!, 100 + i).id);
  // Hợp đồng đầu tiên (Trần Văn Nam – P.302) giữ nguyên mã HĐ-1024 như ảnh demo.
  const isNam = i === 0;
  const startPeriod = addMonths(CURRENT_PERIOD, -(6 + (i % 10)));
  const startDate = `${startPeriod}-${i % 4 === 2 ? '15' : '01'}`;
  const endDate = addDays(`${addMonths(startPeriod, 12)}-01`, -1);
  contracts.push({
    id: `ctr-${i + 1}`,
    workspaceId: WS,
    code: isNam ? 'HĐ-1024' : `HĐ-${1000 + i * 3}`,
    roomId: room.id,
    roomCode: room.code,
    buildingName: room.buildingName,
    primaryTenantId: primary.id,
    primaryTenantName: primary.fullName,
    occupantIds,
    startDate,
    endDate: endDate < TODAY ? addDays(`${addMonths(CURRENT_PERIOD, 6)}-01`, -1) : endDate,
    monthlyRent: room.basePrice,
    deposit: room.basePrice,
    waterMode: i % 5 === 3 ? 'METER' : 'PER_PERSON',
    status: 'ACTIVE',
    history: [
      { at: iso(startDate), action: 'Tạo hợp đồng (nháp)', by: 'Nguyễn Văn Quân' },
      { at: iso(startDate, 10), action: 'Kích hoạt hợp đồng', by: 'Nguyễn Văn Quân' },
    ],
    createdAt: iso(startDate),
  });
});
// Đặt P.302 cho Nam theo ảnh demo
{
  const nam = contracts[0]!;
  const p302 = rooms.find((r) => r.code === 'P.302')!;
  const old = rooms.find((r) => r.id === nam.roomId)!;
  const swap = contracts.find((c) => c.roomId === p302.id);
  if (swap && swap !== nam) {
    swap.roomId = old.id;
    swap.roomCode = old.code;
  }
  nam.roomId = p302.id;
  nam.roomCode = p302.code;
  nam.buildingName = p302.buildingName;
}
// Một hợp đồng đã kết thúc + một hợp đồng nháp
const endedTenant = addTenant('Cao Văn Phúc', 300);
contracts.push({
  id: 'ctr-ended',
  workspaceId: WS,
  code: 'HĐ-0950',
  roomId: rooms.find((r) => r.code === 'P.102')!.id,
  roomCode: 'P.102',
  buildingName: 'Tòa A',
  primaryTenantId: endedTenant.id,
  primaryTenantName: endedTenant.fullName,
  occupantIds: [endedTenant.id],
  startDate: `${addMonths(CURRENT_PERIOD, -14)}-01`,
  endDate: addDays(`${addMonths(CURRENT_PERIOD, -1)}-01`, -1),
  monthlyRent: 3_500_000,
  deposit: 3_500_000,
  waterMode: 'PER_PERSON',
  status: 'ENDED',
  history: [
    { at: iso(`${addMonths(CURRENT_PERIOD, -14)}-01`), action: 'Kích hoạt hợp đồng', by: 'Nguyễn Văn Quân' },
    { at: iso(addDays(`${addMonths(CURRENT_PERIOD, -1)}-01`, -1)), action: 'Kết thúc hợp đồng', by: 'Nguyễn Văn Quân' },
  ],
  createdAt: iso(`${addMonths(CURRENT_PERIOD, -14)}-01`),
});
const draftTenant = addTenant('Vũ Tuấn Kiệt', 301);
contracts.push({
  id: 'ctr-draft',
  workspaceId: WS,
  code: 'HĐ-1101',
  roomId: rooms.find((r) => r.code === 'C.101')!.id,
  roomCode: 'C.101',
  buildingName: 'Tòa C',
  primaryTenantId: draftTenant.id,
  primaryTenantName: draftTenant.fullName,
  occupantIds: [draftTenant.id],
  startDate: `${addMonths(CURRENT_PERIOD, 1)}-01`,
  endDate: addDays(`${addMonths(CURRENT_PERIOD, 13)}-01`, -1),
  monthlyRent: 3_600_000,
  deposit: 3_600_000,
  waterMode: 'PER_PERSON',
  status: 'DRAFT',
  history: [{ at: iso(addDays(TODAY, -2)), action: 'Tạo hợp đồng (nháp)', by: 'Nguyễn Văn Quân' }],
  createdAt: iso(addDays(TODAY, -2)),
});
addTenant('Hoàng Bảo Ngọc', 302);

// ---------------------------------------------------------------- Vehicles
const vehicles: Vehicle[] = contracts
  .filter((c) => c.status === 'ACTIVE')
  .filter((_, i) => i % 3 !== 2)
  .map((c, i) => ({
    id: `veh-${i + 1}`,
    workspaceId: WS,
    tenantId: c.primaryTenantId,
    tenantName: c.primaryTenantName,
    roomCode: c.roomCode,
    type: i % 7 === 6 ? 'EBIKE' : 'MOTORBIKE',
    plate: `59-${['X1', 'H2', 'T3', 'K1', 'B2'][i % 5]} ${String(10_000 + i * 2_371).slice(0, 3)}.${String(10 + i * 7).slice(-2)}`,
    brand: ['Honda Vision', 'Yamaha Sirius', 'Honda Wave', 'VinFast Klara', 'Honda Air Blade'][i % 5]!,
    monthlyFee: i % 7 === 6 ? 80_000 : 100_000,
  }));

// ---------------------------------------------------------------- Rates
const rates: RateVersion[] = [
  { id: 'rate-1', workspaceId: WS, effectiveFrom: '2024-01-01', electricityPerKwh: 3_300, waterPerPerson: 90_000, waterPerM3: 16_000, internet: 100_000, sanitation: 30_000, createdAt: '2023-12-20T02:00:00.000Z', createdBy: 'Nguyễn Văn Quân' },
  { id: 'rate-2', workspaceId: WS, effectiveFrom: `${addMonths(CURRENT_PERIOD, -8)}-01`, electricityPerKwh: 3_500, waterPerPerson: 100_000, waterPerM3: 18_000, internet: 100_000, sanitation: 30_000, createdAt: iso(`${addMonths(CURRENT_PERIOD, -9)}-20`), createdBy: 'Nguyễn Văn Quân' },
  { id: 'rate-3', workspaceId: WS, effectiveFrom: `${addMonths(CURRENT_PERIOD, 2)}-01`, electricityPerKwh: 3_800, waterPerPerson: 110_000, waterPerM3: 20_000, internet: 100_000, sanitation: 35_000, createdAt: iso(addDays(TODAY, -5)), createdBy: 'Nguyễn Văn Quân' },
];

// ---------------------------------------------------------------- Meter readings (6 kỳ gần nhất)
const meterReadings: MeterReading[] = [];
const PERIODS = Array.from({ length: 6 }, (_, i) => addMonths(CURRENT_PERIOD, i - 5));
/** Phòng chưa ghi chỉ số kỳ hiện tại (để demo cảnh báo khi lập hóa đơn). */
const MISSING_METER_ROOMS = new Set(['C.401', 'C.402']);
occupiedRooms.forEach((room, ri) => {
  let elec = 1200 + ri * 97;
  let water = 300 + ri * 11;
  PERIODS.forEach((period, pi) => {
    const used = 70 + ((ri * 13 + pi * 7) % 60);
    const m3 = 3 + ((ri + pi) % 5);
    if (period === CURRENT_PERIOD && MISSING_METER_ROOMS.has(room.code)) return;
    meterReadings.push({
      id: `mtr-${room.id}-${period}`,
      workspaceId: WS,
      roomId: room.id,
      roomCode: room.code,
      buildingName: room.buildingName,
      period,
      electricOld: elec,
      electricNew: elec + used,
      waterOld: water,
      waterNew: water + m3,
      recordedAt: iso(`${period}-01`, 8),
    });
    elec += used;
    water += m3;
  });
});

// ---------------------------------------------------------------- Invoices + payments
const invoices: Invoice[] = [];
const payments: Payment[] = [];
/** Hợp đồng chưa được lập hóa đơn kỳ hiện tại — để demo "Lập hóa đơn tháng". */
const NOT_YET_BILLED = new Set(['C.401', 'C.402', 'C.302']);

contracts
  .filter((c) => c.status === 'ACTIVE' || c.status === 'ENDED')
  .forEach((c, ci) => {
    PERIODS.forEach((period, pi) => {
      if (c.startDate > periodEnd(period) || c.endDate < `${period}-01`) return;
      if (period === CURRENT_PERIOD && NOT_YET_BILLED.has(c.roomCode)) return;
      const rate = rateForDate(rates, `${period}-01`)!;
      const reading = meterReadings.find((m) => m.roomId === c.roomId && m.period === period);
      const vehicleFees = vehicles
        .filter((v) => v.tenantId === c.primaryTenantId)
        .map((v) => ({ label: v.plate, fee: v.monthlyFee }));
      const lines = buildInvoiceLines({ contract: c, rate, period, reading, vehicleFees });
      const total = sumLines(lines);
      const issueDate = `${period}-01`;
      const dueDate = `${period}-${ci % 4 === 2 ? '15' : ci % 4 === 3 ? '10' : '05'}`;
      const isCurrent = period === CURRENT_PERIOD;
      // Kỳ cũ: gần như đã thu đủ (vài hóa đơn thiếu nhỏ). Kỳ hiện tại: nhiều trạng thái.
      let paid = total;
      if (!isCurrent && ci === 4 && pi === 4) paid = total - 500_000;
      if (isCurrent) {
        if (ci === 0) paid = 0; // Nam – P.302 quá hạn
        else if (ci === 1) paid = 0; // Lê Hoàng Yến – quá hạn
        else if (ci % 8 === 2 || ci % 8 === 3) paid = 0; // chờ chuyển khoản
        else if (ci % 7 === 5) paid = Math.round(total / 2 / 1000) * 1000; // thanh toán một phần
      }
      const invoice: Invoice = {
        id: `inv-${c.id}-${period}`,
        workspaceId: WS,
        code: `HD${period.replace('-', '')}-${String(ci + 1).padStart(3, '0')}`,
        contractId: c.id,
        contractCode: c.code,
        roomId: c.roomId,
        roomCode: c.roomCode,
        buildingName: c.buildingName,
        tenantId: c.primaryTenantId,
        tenantName: c.primaryTenantName,
        period,
        issueDate,
        dueDate,
        status: 'ISSUED',
        lines,
        rateVersionId: rate.id,
        rateEffectiveFrom: rate.effectiveFrom,
        adjustments: [],
        total,
        paidConfirmed: paid,
      };
      invoice.status = deriveInvoiceStatus(invoice, TODAY);
      invoices.push(invoice);
      if (paid > 0) {
        payments.push({
          id: `pay-${invoice.id}`,
          workspaceId: WS,
          invoiceId: invoice.id,
          invoiceCode: invoice.code,
          roomCode: c.roomCode,
          tenantName: c.primaryTenantName,
          amount: paid,
          method: ci % 3 === 0 ? 'CASH' : 'BANK_TRANSFER',
          status: 'CONFIRMED',
          submittedBy: ci % 3 === 0 ? 'STAFF' : 'TENANT',
          submittedAt: iso(addDays(issueDate, 3)),
          confirmedAt: iso(addDays(issueDate, 3), 15),
          confirmedBy: 'Nguyễn Văn Quân',
        });
      }
    });
  });

// Một vài khoản người thuê đã gửi minh chứng nhưng CHƯA được xác nhận (không tính là đã thu).
invoices
  .filter((i) => i.period === CURRENT_PERIOD && i.paidConfirmed === 0)
  .slice(2, 4)
  .forEach((inv, k) =>
    payments.push({
      id: `pay-pending-${k}`,
      workspaceId: WS,
      invoiceId: inv.id,
      invoiceCode: inv.code,
      roomCode: inv.roomCode,
      tenantName: inv.tenantName,
      amount: k === 0 ? inv.total : 2_000_000,
      method: 'BANK_TRANSFER',
      status: 'PENDING',
      proofUrl: ROOM_PHOTOS[0],
      submittedBy: 'TENANT',
      submittedAt: iso(addDays(TODAY, -1), 20),
      note: k === 0 ? 'Đã chuyển khoản qua Vietcombank' : 'Em gửi trước 2 triệu, cuối tuần gửi nốt ạ',
    }),
  );

// ---------------------------------------------------------------- Deposits
const deposits: DepositTx[] = contracts
  .filter((c) => c.status !== 'DRAFT')
  .map((c, i) => ({
    id: `dep-${i + 1}`,
    workspaceId: WS,
    contractId: c.id,
    contractCode: c.code,
    roomCode: c.roomCode,
    tenantName: c.primaryTenantName,
    type: 'COLLECT' as const,
    amount: c.deposit,
    date: c.startDate,
  }));
deposits.push(
  { id: 'dep-ded', workspaceId: WS, contractId: 'ctr-ended', contractCode: 'HĐ-0950', roomCode: 'P.102', tenantName: 'Cao Văn Phúc', type: 'DEDUCT', amount: 500_000, date: addDays(`${addMonths(CURRENT_PERIOD, -1)}-01`, -1), note: 'Sơn lại tường bị bẩn' },
  { id: 'dep-ref', workspaceId: WS, contractId: 'ctr-ended', contractCode: 'HĐ-0950', roomCode: 'P.102', tenantName: 'Cao Văn Phúc', type: 'REFUND', amount: 3_000_000, date: `${addMonths(CURRENT_PERIOD, -1)}-02`, note: 'Hoàn cọc sau khi trừ chi phí' },
);

// ---------------------------------------------------------------- Workspace viewings
const viewingSeed: Array<[string, string, string, number, number, WsViewing['status']]> = [
  ['Vũ Tuấn Kiệt', '0903891223', 'P.102', 0, 14, 'PENDING'],
  ['Hoàng Bảo Ngọc', '0971556718', 'B.304', 0, 17, 'PENDING'],
  ['Phan Minh Thắng', '0988901321', 'C.101', 1, 9, 'CONFIRMED'],
  ['Lê Minh', '0988111222', 'B.304', 2, 10, 'CONFIRMED'],
  ['Trương Mỹ Duyên', '0909555123', 'P.102', -2, 15, 'COMPLETED'],
  ['Ông Văn Thịnh', '0933444555', 'C.101', -3, 19, 'CANCELLED'],
];
const wsViewings: WsViewing[] = viewingSeed.map(([name, phone, code, dayOffset, hour, status], i) => {
  const room = rooms.find((r) => r.workspaceId === WS && r.code === code)!;
  return {
    id: `wv-${i + 1}`,
    workspaceId: WS,
    roomId: room.id,
    roomCode: room.code,
    buildingName: room.buildingName,
    visitorName: name,
    visitorPhone: phone,
    scheduledAt: iso(addDays(TODAY, dayOffset), hour),
    status,
  };
});

// ---------------------------------------------------------------- Maintenance
const maint = (
  id: string,
  code: string,
  title: string,
  description: string,
  priority: MaintenanceRequest['priority'],
  status: MaintenanceRequest['status'],
  daysAgo: number,
  assignee?: string,
): MaintenanceRequest => {
  const room = rooms.find((r) => r.workspaceId === WS && r.code === code)!;
  const contract = contracts.find((c) => c.roomId === room.id && c.status === 'ACTIVE');
  return {
    id,
    workspaceId: WS,
    roomId: room.id,
    roomCode: room.code,
    buildingName: room.buildingName,
    tenantName: contract?.primaryTenantName,
    title,
    description,
    priority,
    status,
    assignee,
    images: [],
    createdAt: iso(addDays(TODAY, -daysAgo), 8),
    updatedAt: iso(addDays(TODAY, -Math.max(0, daysAgo - 1)), 10),
    comments: [
      { id: `${id}-c1`, author: contract?.primaryTenantName ?? 'Người thuê', role: 'TENANT', text: description, at: iso(addDays(TODAY, -daysAgo), 8) },
      ...(status !== 'OPEN'
        ? [{ id: `${id}-c2`, author: 'Nguyễn Văn Quân', role: 'STAFF' as const, text: 'Đã ghi nhận, sẽ cử thợ qua kiểm tra.', at: iso(addDays(TODAY, -daysAgo), 11) }]
        : []),
    ],
  };
};
const maintenance: MaintenanceRequest[] = [
  maint('mnt-1', 'P.202', 'Hỏng vòi sen tăng áp', 'Vòi sen bị rò nước mạnh ở khớp nối, không tắm được.', 'URGENT', 'OPEN', 0),
  maint('mnt-2', 'B.305', 'Điều hòa rò rỉ nước', 'Máy lạnh chảy nước xuống tường khi bật lâu.', 'MEDIUM', 'IN_PROGRESS', 1, 'Thợ điện lạnh Minh'),
  maint('mnt-3', 'P.302', 'Bóng đèn nhà vệ sinh hỏng', 'Bóng đèn WC chập chờn rồi tắt hẳn.', 'LOW', 'OPEN', 2),
  maint('mnt-4', 'C.201', 'Khóa cửa bị kẹt', 'Khóa vân tay đôi khi không nhận, phải dùng chìa cơ.', 'MEDIUM', 'RESOLVED', 9, 'Anh Tài'),
  maint('mnt-5', 'B.102', 'Ống thoát nước bồn rửa chậm', 'Nước thoát rất chậm, có mùi.', 'LOW', 'RESOLVED', 15, 'Anh Tài'),
];

// ---------------------------------------------------------------- Members & settings
const members: Member[] = [
  { id: 'mem-1', workspaceId: WS, userId: 'u-owner', fullName: 'Nguyễn Văn Quân', email: 'quan@demo.vn', role: 'OWNER', status: 'ACTIVE', joinedAt: '2022-03-01T02:00:00.000Z' },
  { id: 'mem-2', workspaceId: WS, userId: 'u-mgr', fullName: 'Trần Thị Thu', email: 'thu.manager@demo.vn', role: 'MANAGER', status: 'ACTIVE', joinedAt: '2023-02-10T02:00:00.000Z' },
  { id: 'mem-3', workspaceId: WS, userId: 'u-staff', fullName: 'Lê Văn Tài', email: 'tai.staff@demo.vn', role: 'STAFF', status: 'ACTIVE', joinedAt: '2024-05-05T02:00:00.000Z' },
  { id: 'mem-4', workspaceId: WS, userId: 'u-staff2', fullName: 'Phạm Minh Châu', email: 'chau.staff@demo.vn', role: 'STAFF', status: 'LOCKED', joinedAt: '2024-07-01T02:00:00.000Z' },
  { id: 'mem-5', workspaceId: WS2, userId: 'u-owner', fullName: 'Nguyễn Văn Quân', email: 'quan@demo.vn', role: 'MANAGER', status: 'ACTIVE', joinedAt: '2024-01-01T02:00:00.000Z' },
];

const settings: Record<string, WorkspaceSettings> = {
  [WS]: {
    id: WS,
    name: 'Nhà Trọ An Nhiên Group',
    status: 'ACTIVE',
    description: 'Quản lý tập trung Tòa A (Lê Văn Việt), Tòa B (Đỗ Xuân Hợp) và Tòa C (Tăng Nhơn Phú).',
    contactName: 'Nguyễn Văn Quân',
    contactPhone: '0903891223',
    address: '120 Lê Văn Việt, Hiệp Phú, TP. Thủ Đức',
    bankAccount: '0071000123456',
    bankName: 'Vietcombank',
    invoiceDueDay: 5,
  },
  [WS2]: {
    id: WS2,
    name: 'SunHouse Bình Thạnh',
    status: 'ACTIVE',
    description: 'Căn hộ dịch vụ khu Điện Biên Phủ.',
    contactName: 'Lê Thị Hồng',
    contactPhone: '0971556718',
    address: '210 Điện Biên Phủ, P.25, Bình Thạnh',
    bankAccount: '',
    bankName: '',
    invoiceDueDay: 10,
  },
};

// ---------------------------------------------------------------- Notifications
const notifications: AppNotification[] = [
  { id: 'n-1', userId: 'u-guest', title: 'Lịch xem phòng đã được xác nhận', body: 'Chủ trọ đã xác nhận lịch xem Studio Nơ Trang Long.', link: '/my-viewings', read: false, createdAt: iso(addDays(TODAY, -1), 9) },
  { id: 'n-2', userId: 'u-guest', title: 'Phòng bạn quan tâm vừa giảm giá', body: 'Nhà trọ Bạch Đằng giảm 200.000đ/tháng.', link: '/rooms/r-3', read: true, createdAt: iso(addDays(TODAY, -4), 9) },
  { id: 'n-3', userId: 'u-tenant', title: `Hóa đơn ${CURRENT_PERIOD.slice(5)}/${CURRENT_PERIOD.slice(0, 4)} đã phát hành`, body: 'Vui lòng thanh toán trước hạn để tránh phát sinh nhắc nợ.', link: '/tenant/invoices', read: false, createdAt: iso(`${CURRENT_PERIOD}-01`, 9) },
  { id: 'n-4', userId: 'u-tenant', title: 'Yêu cầu bảo trì đã được tiếp nhận', body: 'Bóng đèn nhà vệ sinh — chủ trọ đã ghi nhận.', link: '/tenant/maintenance', read: true, createdAt: iso(addDays(TODAY, -2), 9) },
  { id: 'n-5', userId: 'u-owner', title: '2 lịch xem phòng mới chờ xác nhận', body: 'P.102 (Tòa A) và B.304 (Tòa B).', link: `/w/${WS}/viewings`, read: false, createdAt: iso(TODAY, 8) },
  { id: 'n-6', userId: 'u-owner', title: 'Người thuê gửi minh chứng thanh toán', body: 'Có khoản thanh toán đang chờ bạn xác nhận.', link: `/w/${WS}/payments`, read: false, createdAt: iso(addDays(TODAY, -1), 20) },
  { id: 'n-7', userId: 'u-owner', title: 'Yêu cầu sửa chữa khẩn cấp', body: 'Hỏng vòi sen tăng áp — Phòng P.202.', link: `/w/${WS}/maintenance/mnt-1`, read: true, createdAt: iso(TODAY, 8) },
];

// ---------------------------------------------------------------- Tenant link requests (theo userId)
const linkRequests: Record<string, LinkRequest[]> = {
  'u-tenant': [
    { id: 'lr-1', workspaceName: 'Nhà Trọ An Nhiên Group', contractCode: 'HĐ-1024', phone: '0912345889', status: 'APPROVED', createdAt: iso(addDays(TODAY, -120)) },
  ],
  'u-guest': [
    {
      id: 'lr-2',
      workspaceName: 'Nhà Trọ An Nhiên Group',
      contractCode: contracts.find((c) => tenants.find((t) => t.id === c.primaryTenantId)?.accountLinkStatus === 'PENDING')?.code ?? '',
      phone: tenants.find((t) => t.accountLinkStatus === 'PENDING')?.phone ?? '',
      status: 'PENDING',
      createdAt: iso(addDays(TODAY, -1)),
    },
  ],
};
/** Liên kết user ↔ tenant record (đã duyệt). */
const tenantLinks: Record<string, string> = { 'u-tenant': tenants[0]!.id };
/** Yêu cầu liên kết đang chờ chủ trọ duyệt: tenantId -> userId. Seed: hồ sơ PENDING thứ 5. */
const pendingLinks: Record<string, string> = Object.fromEntries(
  tenants.filter((t) => t.accountLinkStatus === 'PENDING').map((t) => [t.id, 'u-guest']),
);

// ---------------------------------------------------------------- Admin
const adminListings: AdminListing[] = [];
const auditLogs: AuditLog[] = [
  { id: 'al-1', at: iso(TODAY, 8), actor: 'quan@demo.vn', action: 'Đăng nhập', target: '—', category: 'AUTH', ip: '113.161.x.x' },
  { id: 'al-2', at: iso(addDays(TODAY, -1), 15), actor: 'quan@demo.vn', action: 'Xác nhận thanh toán', target: 'HD-P.205', category: 'BILLING', ip: '113.161.x.x' },
  { id: 'al-3', at: iso(addDays(TODAY, -1), 11), actor: 'admin@demo.vn', action: 'Gỡ tin đăng vi phạm', target: 'Tin #r-7', category: 'LISTING', ip: '14.241.x.x' },
  { id: 'al-4', at: iso(addDays(TODAY, -2), 10), actor: 'admin@demo.vn', action: 'Khóa tài khoản', target: 'spam.user@mail.vn', category: 'USER', ip: '14.241.x.x' },
  { id: 'al-5', at: iso(addDays(TODAY, -3), 9), actor: 'hong@demo.vn', action: 'Tạo workspace', target: 'SunHouse Bình Thạnh', category: 'WORKSPACE', ip: '27.72.x.x' },
  { id: 'al-6', at: iso(addDays(TODAY, -4), 14), actor: 'nam@demo.vn', action: 'Gửi yêu cầu liên kết hồ sơ thuê', target: 'HĐ-1024', category: 'USER', ip: '171.250.x.x' },
  { id: 'al-7', at: iso(addDays(TODAY, -5), 16), actor: 'quan@demo.vn', action: 'Lập hóa đơn tháng', target: `Kỳ ${CURRENT_PERIOD}`, category: 'BILLING', ip: '113.161.x.x' },
  { id: 'al-8', at: iso(addDays(TODAY, -6), 13), actor: 'unknown', action: 'Đăng nhập thất bại (5 lần)', target: 'minh@demo.vn', category: 'AUTH', ip: '103.21.x.x' },
];

export const db = {
  buildings,
  rooms,
  tenants,
  contracts,
  vehicles,
  rates,
  meterReadings,
  invoices,
  payments,
  deposits,
  wsViewings,
  maintenance,
  members,
  settings,
  notifications,
  linkRequests,
  tenantLinks,
  pendingLinks,
  adminListings,
  auditLogs,
};

/** Ghi audit log cho các thao tác quan trọng trong mock. */
export function audit(actor: string, action: string, target: string, category: AuditLog['category']) {
  db.auditLogs.unshift({ id: nextId('al'), at: new Date().toISOString(), actor, action, target, category, ip: '127.0.0.1' });
}
