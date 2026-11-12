const { User, Specialty, Appointment } = require('../models');
const { ROLES, ROLE_VALUES, APPOINTMENT_STATUSES } = require('../constants/enums');
const ApiError = require('../utils/ApiError');

const DAY_MS = 24 * 60 * 60 * 1000;

const ANALYTICS_QUERY_LIMITS = Object.freeze({
  DEFAULT_DATE_RANGE_DAYS: 30,
  MAX_DATE_RANGE_DAYS: 366,
  MAX_SERIES_BUCKETS: 366,
  DEFAULT_TOP_DOCTORS_LIMIT: 10,
  MAX_TOP_DOCTORS_LIMIT: 50,
  QUERY_MAX_TIME_MS: 5000,
});

const VALID_GRANULARITIES = new Set(['day', 'week', 'month']);
const VALID_DOCTOR_SORT_FIELDS = new Set([
  'completedAppointments',
  'totalAppointments',
  'completionRatePercent',
]);

const METRIC_DEFINITIONS = Object.freeze([
  {
    key: 'newUsersInPeriod',
    category: 'userGrowth',
    label: 'Người dùng đăng ký mới trong kỳ',
    unit: 'users',
    formula: 'COUNT(users WHERE createdAt BETWEEN period.from AND period.to)',
    description:
      'Tổng số tài khoản được tạo mới trong khoảng thời gian đã chọn (phân rã theo vai trò Patient, Doctor, Receptionist, Admin).',
  },
  {
    key: 'newUsersPreviousPeriod',
    category: 'userGrowth',
    label: 'Người dùng mới kỳ liền trước',
    unit: 'users',
    formula: 'COUNT(users WHERE createdAt BETWEEN period.previousFrom AND period.previousTo)',
    description:
      'Số tài khoản tạo mới trong khoảng thời gian có cùng độ dài ngay liền trước kỳ hiện tại để so sánh tốc độ tăng trưởng.',
  },
  {
    key: 'growthRatePercent',
    category: 'userGrowth',
    label: 'Tỷ lệ tăng trưởng người dùng mới',
    unit: 'percent',
    formula:
      'IF newUsersPreviousPeriod > 0 THEN ROUND(((newUsersInPeriod - newUsersPreviousPeriod) / newUsersPreviousPeriod) * 100, 2) ELSE (IF newUsersInPeriod > 0 THEN 100 ELSE 0)',
    description:
      'Phần trăm tăng/giảm số lượng người dùng mới so với kỳ liền trước có cùng số ngày.',
  },
  {
    key: 'cumulativeUsers',
    category: 'userGrowth',
    label: 'Tổng người dùng lũy kế cuối mốc',
    unit: 'users',
    formula: 'totalUsersBeforePeriod + SUM(newUsers UP TO bucket.endDate)',
    description:
      'Tổng số tài khoản tích lũy tính đến thời điểm kết thúc của từng mốc thời gian (ngày/tuần/tháng).',
  },
  {
    key: 'completedAppointments',
    category: 'topDoctors',
    label: 'Số ca khám hoàn tất',
    unit: 'appointments',
    formula:
      "COUNT(appointments WHERE appointmentDate BETWEEN period.from AND period.to AND status = 'COMPLETED')",
    description:
      'Số lịch hẹn đã được bác sĩ khám và kê đơn hoàn tất trong khoảng ngày đã chọn.',
  },
  {
    key: 'totalAppointments',
    category: 'topDoctors',
    label: 'Tổng số lịch hẹn phát sinh',
    unit: 'appointments',
    formula: 'COUNT(appointments WHERE appointmentDate BETWEEN period.from AND period.to)',
    description:
      'Tổng số lịch hẹn được đặt cho bác sĩ (hoặc toàn phòng khám) trong khoảng ngày đã chọn.',
  },
  {
    key: 'completionRatePercent',
    category: 'topDoctors',
    label: 'Tỷ lệ hoàn tất lịch khám',
    unit: 'percent',
    formula:
      'IF totalAppointments > 0 THEN ROUND((completedAppointments / totalAppointments) * 100, 2) ELSE 0',
    description:
      'Tỷ lệ phần trăm lịch hẹn đạt trạng thái COMPLETED trên tổng số lịch hẹn trong kỳ.',
  },
  {
    key: 'uniquePatientsCount',
    category: 'topDoctors',
    label: 'Số tài khoản bệnh nhân duy nhất (ẩn danh)',
    unit: 'patients',
    formula: 'COUNT(DISTINCT appointment.patientId WHERE appointmentDate BETWEEN period.from AND period.to)',
    description:
      'Số lượng tài khoản đặt khám không trùng lặp của từng bác sĩ trong kỳ (chỉ trả con số tổng hợp, tuyệt đối không trả định danh cá nhân bệnh nhân).',
  },
  {
    key: 'totalPatientVisitsCount',
    category: 'topDoctors',
    label: 'Tổng lượt người khám hoàn tất',
    unit: 'visits',
    formula:
      "SUM(MAX(1, SIZE(appointment.patients)) WHERE status = 'COMPLETED' AND appointmentDate BETWEEN period.from AND period.to)",
    description:
      'Tổng số lượt người thực tế được khám hoàn tất (bao gồm đặt hộ người thân trong cùng lịch hẹn), đã ẩn danh hoàn toàn thông tin cá nhân.',
  },
]);

function formatUtcDateYmd(utcDate) {
  const y = utcDate.getUTCFullYear();
  const m = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utcDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseStrictDateString(rawInput, fieldName) {
  if (typeof rawInput !== 'string' || !rawInput.trim()) {
    throw new ApiError(400, `${fieldName} không hợp lệ`);
  }

  const trimmed = rawInput.trim();
  let year;
  let month;
  let day;

  // Support YYYY-MM-DD (primary) and dd/MM/yyyy (project adapter convention)
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const vnMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (vnMatch) {
    day = Number(vnMatch[1]);
    month = Number(vnMatch[2]);
    year = Number(vnMatch[3]);
  } else {
    throw new ApiError(
      400,
      `${fieldName} không đúng định dạng ngày hợp lệ (YYYY-MM-DD hoặc dd/MM/yyyy)`,
    );
  }

  if (year < 1970 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new ApiError(400, `${fieldName} nằm ngoài phạm vi ngày hợp lệ`);
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    throw new ApiError(400, `${fieldName} không tồn tại trên lịch (${trimmed})`);
  }

  return {
    ymd: formatUtcDateYmd(utcDate),
    utcMs: utcDate.getTime(),
    year,
    month,
    day,
  };
}

function validateAndNormalizeTimezone(rawTimezone) {
  if (rawTimezone === undefined || rawTimezone === null || rawTimezone === '') {
    return 'UTC';
  }
  const tz = String(rawTimezone).trim();
  if (tz.toUpperCase() === 'UTC' || tz === 'Z') {
    return 'UTC';
  }
  if (/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(tz)) {
    return tz;
  }
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    throw new ApiError(400, `Múi giờ (timezone) không hợp lệ: ${tz}`);
  }
}

function zonedDateTimeToUtc(year, month, day, hour, minute, second, ms, timeZone) {
  if (timeZone === 'UTC') {
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
  }
  if (/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(timeZone)) {
    const pad2 = (n) => String(n).padStart(2, '0');
    const pad3 = (n) => String(n).padStart(3, '0');
    return new Date(
      `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}.${pad3(ms)}${timeZone}`,
    );
  }

  // Resolve IANA timezone offset using Intl.DateTimeFormat parts
  const approxUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = {};
  for (const part of formatter.formatToParts(new Date(approxUtcMs))) {
    if (part.type !== 'literal') {
      parts[part.type] = Number(part.value);
    }
  }
  const asIfUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    ms,
  );
  const offsetMs = asIfUtcMs - approxUtcMs;
  return new Date(approxUtcMs - offsetMs);
}

function getTodayYmdInTimezone(timeZone) {
  if (timeZone === 'UTC') {
    return formatUtcDateYmd(new Date());
  }
  if (/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(timeZone)) {
    const sign = timeZone.startsWith('-') ? -1 : 1;
    const [hh, mm] = timeZone.slice(1).split(':').map(Number);
    const shifted = new Date(Date.now() + sign * (hh * 60 + mm) * 60 * 1000);
    return formatUtcDateYmd(shifted);
  }
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

function resolveAnalyticsQueryOptions(query = {}) {
  const timezone = validateAndNormalizeTimezone(query.timezone);

  const rawFrom =
    query.from !== undefined
      ? query.from
      : query.startDate !== undefined
        ? query.startDate
        : query.start;
  const rawTo =
    query.to !== undefined
      ? query.to
      : query.endDate !== undefined
        ? query.endDate
        : query.end;

  let fromParsed;
  let toParsed;
  let isDefaultRange = false;

  if (
    (rawFrom === undefined || rawFrom === '') &&
    (rawTo === undefined || rawTo === '')
  ) {
    const todayYmd = getTodayYmdInTimezone(timezone);
    toParsed = parseStrictDateString(todayYmd, 'Ngày kết thúc (to)');
    const defaultStartUtc = new Date(
      toParsed.utcMs - (ANALYTICS_QUERY_LIMITS.DEFAULT_DATE_RANGE_DAYS - 1) * DAY_MS,
    );
    fromParsed = parseStrictDateString(
      formatUtcDateYmd(defaultStartUtc),
      'Ngày bắt đầu (from)',
    );
    isDefaultRange = true;
  } else if (
    rawFrom === undefined ||
    rawFrom === '' ||
    rawTo === undefined ||
    rawTo === ''
  ) {
    throw new ApiError(
      400,
      'Vui lòng cung cấp đầy đủ cả ngày bắt đầu (from) và ngày kết thúc (to)',
    );
  } else {
    fromParsed = parseStrictDateString(String(rawFrom), 'Ngày bắt đầu (from)');
    toParsed = parseStrictDateString(String(rawTo), 'Ngày kết thúc (to)');
  }

  if (fromParsed.utcMs > toParsed.utcMs) {
    throw new ApiError(
      400,
      'Khoảng ngày không hợp lệ: ngày bắt đầu (from) không được lớn hơn ngày kết thúc (to)',
    );
  }

  const days = Math.floor((toParsed.utcMs - fromParsed.utcMs) / DAY_MS) + 1;
  if (days > ANALYTICS_QUERY_LIMITS.MAX_DATE_RANGE_DAYS) {
    throw new ApiError(
      400,
      `Giới hạn truy vấn: khoảng thời gian tối đa cho phép là ${ANALYTICS_QUERY_LIMITS.MAX_DATE_RANGE_DAYS} ngày (yêu cầu: ${days} ngày)`,
    );
  }

  const granularity =
    query.granularity === undefined || query.granularity === ''
      ? 'day'
      : String(query.granularity).trim().toLowerCase();
  if (!VALID_GRANULARITIES.has(granularity)) {
    throw new ApiError(
      400,
      'Độ chi tiết thời gian (granularity) phải là day, week hoặc month',
    );
  }

  const rawTopLimit =
    query.topLimit !== undefined ? query.topLimit : query.limit;
  let topLimit = ANALYTICS_QUERY_LIMITS.DEFAULT_TOP_DOCTORS_LIMIT;
  if (rawTopLimit !== undefined && rawTopLimit !== '') {
    const parsedLimit = Number(rawTopLimit);
    if (
      !Number.isSafeInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > ANALYTICS_QUERY_LIMITS.MAX_TOP_DOCTORS_LIMIT
    ) {
      throw new ApiError(
        400,
        `Giới hạn truy vấn top bác sĩ (topLimit) phải là số nguyên từ 1 đến ${ANALYTICS_QUERY_LIMITS.MAX_TOP_DOCTORS_LIMIT}`,
      );
    }
    topLimit = parsedLimit;
  }

  const sortBy =
    query.sortBy === undefined || query.sortBy === ''
      ? 'completedAppointments'
      : String(query.sortBy).trim();
  if (!VALID_DOCTOR_SORT_FIELDS.has(sortBy)) {
    throw new ApiError(
      400,
      'Tiêu chí sắp xếp (sortBy) phải là completedAppointments, totalAppointments hoặc completionRatePercent',
    );
  }

  let specialtyId = null;
  if (query.specialtyId !== undefined && query.specialtyId !== '') {
    const parsedSpecialty = Number(query.specialtyId);
    if (!Number.isSafeInteger(parsedSpecialty) || parsedSpecialty < 1) {
      throw new ApiError(400, 'specialtyId không hợp lệ');
    }
    specialtyId = parsedSpecialty;
  }

  const onlyWithAppointments =
    query.onlyWithAppointments === 'true' || query.onlyWithAppointments === '1';

  // Previous equal-length window immediately preceding `from`
  const prevToUtc = new Date(fromParsed.utcMs - DAY_MS);
  const prevFromUtc = new Date(fromParsed.utcMs - days * DAY_MS);
  const prevFromParsed = parseStrictDateString(
    formatUtcDateYmd(prevFromUtc),
    'previousFrom',
  );
  const prevToParsed = parseStrictDateString(
    formatUtcDateYmd(prevToUtc),
    'previousTo',
  );

  const startInstant = zonedDateTimeToUtc(
    fromParsed.year,
    fromParsed.month,
    fromParsed.day,
    0,
    0,
    0,
    0,
    timezone,
  );
  const endInstant = zonedDateTimeToUtc(
    toParsed.year,
    toParsed.month,
    toParsed.day,
    23,
    59,
    59,
    999,
    timezone,
  );
  const prevStartInstant = zonedDateTimeToUtc(
    prevFromParsed.year,
    prevFromParsed.month,
    prevFromParsed.day,
    0,
    0,
    0,
    0,
    timezone,
  );
  const prevEndInstant = zonedDateTimeToUtc(
    prevToParsed.year,
    prevToParsed.month,
    prevToParsed.day,
    23,
    59,
    59,
    999,
    timezone,
  );

  return {
    period: {
      from: fromParsed.ymd,
      to: toParsed.ymd,
      days,
      granularity,
      timezone,
      previousFrom: prevFromParsed.ymd,
      previousTo: prevToParsed.ymd,
      isDefaultRange,
    },
    bounds: {
      fromUtcMs: fromParsed.utcMs,
      toUtcMs: toParsed.utcMs,
      startInstant,
      endInstant,
      prevStartInstant,
      prevEndInstant,
    },
    topLimit,
    sortBy,
    specialtyId,
    onlyWithAppointments,
  };
}

function createEmptyRoleCounts() {
  return {
    [ROLES.PATIENT]: 0,
    [ROLES.DOCTOR]: 0,
    [ROLES.RECEPTIONIST]: 0,
    [ROLES.ADMIN]: 0,
  };
}

function roundPercent(numerator, denominator) {
  if (!denominator || denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function computeGrowthRatePercent(currentCount, previousCount) {
  if (previousCount <= 0) {
    return currentCount > 0 ? 100 : 0;
  }
  return Number((((currentCount - previousCount) / previousCount) * 100).toFixed(2));
}

function getMondayOfUtcDate(utcMs) {
  const d = new Date(utcMs);
  const dayOfWeek = d.getUTCDay(); // 0 (Sun) .. 6 (Sat)
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return formatUtcDateYmd(new Date(utcMs + diffToMonday * DAY_MS));
}

function buildUserGrowthSeries({
  fromUtcMs,
  toUtcMs,
  granularity,
  dailyRoleCountsMap,
  baselineTotalUsers,
}) {
  const bucketsMap = new Map();

  for (let cursorMs = fromUtcMs; cursorMs <= toUtcMs; cursorMs += DAY_MS) {
    const dayYmd = formatUtcDateYmd(new Date(cursorMs));
    let bucketKey;
    if (granularity === 'day') {
      bucketKey = dayYmd;
    } else if (granularity === 'week') {
      bucketKey = getMondayOfUtcDate(cursorMs);
    } else {
      bucketKey = dayYmd.slice(0, 7); // YYYY-MM
    }

    if (!bucketsMap.has(bucketKey)) {
      bucketsMap.set(bucketKey, {
        bucket: bucketKey,
        startDate: dayYmd,
        endDate: dayYmd,
        newUsers: 0,
        cumulativeUsers: 0,
        byRole: createEmptyRoleCounts(),
      });
    }

    const bucketEntry = bucketsMap.get(bucketKey);
    bucketEntry.endDate = dayYmd;

    const dayCounts = dailyRoleCountsMap.get(dayYmd);
    if (dayCounts) {
      for (const role of ROLE_VALUES) {
        const countForRole = dayCounts[role] || 0;
        bucketEntry.byRole[role] += countForRole;
        bucketEntry.newUsers += countForRole;
      }
    }
  }

  if (bucketsMap.size > ANALYTICS_QUERY_LIMITS.MAX_SERIES_BUCKETS) {
    throw new ApiError(
      400,
      `Số mốc dữ liệu chuỗi thời gian vượt quá giới hạn ${ANALYTICS_QUERY_LIMITS.MAX_SERIES_BUCKETS}`,
    );
  }

  let runningTotal = baselineTotalUsers;
  const series = [];
  for (const bucketEntry of bucketsMap.values()) {
    runningTotal += bucketEntry.newUsers;
    bucketEntry.cumulativeUsers = runningTotal;
    series.push(bucketEntry);
  }

  return series;
}

async function aggregateUserGrowth({ period, bounds }) {
  const { startInstant, endInstant, prevStartInstant, prevEndInstant, fromUtcMs, toUtcMs } =
    bounds;
  const maxTimeMS = ANALYTICS_QUERY_LIMITS.QUERY_MAX_TIME_MS;

  const [baselineByRoleRows, previousPeriodCount, currentDailyRoleRows, statusBreakdownRows] =
    await Promise.all([
      User.aggregate([
        { $match: { createdAt: { $lt: startInstant } } },
        { $group: { _id: '$userType', count: { $sum: 1 } } },
      ]).option({ maxTimeMS }),

      User.countDocuments({
        createdAt: { $gte: prevStartInstant, $lte: prevEndInstant },
      }).maxTimeMS(maxTimeMS),

      User.aggregate([
        { $match: { createdAt: { $gte: startInstant, $lte: endInstant } } },
        {
          $group: {
            _id: {
              day: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                  timezone: period.timezone,
                },
              },
              userType: '$userType',
            },
            count: { $sum: 1 },
          },
        },
      ]).option({ maxTimeMS }),

      User.aggregate([
        { $match: { createdAt: { $lte: endInstant } } },
        { $group: { _id: '$isEnable', count: { $sum: 1 } } },
      ]).option({ maxTimeMS }),
    ]);

  const baselineByRole = createEmptyRoleCounts();
  let totalUsersBeforePeriod = 0;
  for (const row of baselineByRoleRows) {
    if (ROLE_VALUES.includes(row._id)) {
      baselineByRole[row._id] = row.count;
    }
    totalUsersBeforePeriod += row.count;
  }

  const newByRole = createEmptyRoleCounts();
  const dailyRoleCountsMap = new Map();
  let newUsersInPeriod = 0;

  for (const row of currentDailyRoleRows) {
    const day = row._id?.day;
    const role = row._id?.userType;
    const count = Number(row.count || 0);
    if (!day) continue;

    if (!dailyRoleCountsMap.has(day)) {
      dailyRoleCountsMap.set(day, createEmptyRoleCounts());
    }
    if (ROLE_VALUES.includes(role)) {
      dailyRoleCountsMap.get(day)[role] += count;
      newByRole[role] += count;
    }
    newUsersInPeriod += count;
  }

  const totalByRoleAtPeriodEnd = createEmptyRoleCounts();
  for (const role of ROLE_VALUES) {
    totalByRoleAtPeriodEnd[role] = baselineByRole[role] + newByRole[role];
  }

  let activeUsersAtPeriodEnd = 0;
  let disabledUsersAtPeriodEnd = 0;
  for (const row of statusBreakdownRows) {
    if (row._id === true) activeUsersAtPeriodEnd += row.count;
    else disabledUsersAtPeriodEnd += row.count;
  }

  const totalUsersAtPeriodEnd = totalUsersBeforePeriod + newUsersInPeriod;
  const growthDelta = newUsersInPeriod - previousPeriodCount;
  const growthRatePercent = computeGrowthRatePercent(
    newUsersInPeriod,
    previousPeriodCount,
  );

  const series = buildUserGrowthSeries({
    fromUtcMs,
    toUtcMs,
    granularity: period.granularity,
    dailyRoleCountsMap,
    baselineTotalUsers: totalUsersBeforePeriod,
  });

  return {
    summary: {
      totalUsersBeforePeriod,
      newUsersInPeriod,
      newUsersPreviousPeriod: previousPeriodCount,
      growthDelta,
      growthRatePercent,
      totalUsersAtPeriodEnd,
      activeUsersAtPeriodEnd,
      disabledUsersAtPeriodEnd,
      newByRole,
      totalByRoleAtPeriodEnd,
    },
    series,
  };
}

function compareDoctorRankItems(a, b, sortBy) {
  if (sortBy === 'totalAppointments') {
    if (b.totalAppointments !== a.totalAppointments) {
      return b.totalAppointments - a.totalAppointments;
    }
    if (b.completedAppointments !== a.completedAppointments) {
      return b.completedAppointments - a.completedAppointments;
    }
  } else if (sortBy === 'completionRatePercent') {
    if (b.completionRatePercent !== a.completionRatePercent) {
      return b.completionRatePercent - a.completionRatePercent;
    }
    if (b.completedAppointments !== a.completedAppointments) {
      return b.completedAppointments - a.completedAppointments;
    }
  } else {
    // Default: completedAppointments DESC -> totalAppointments DESC
    if (b.completedAppointments !== a.completedAppointments) {
      return b.completedAppointments - a.completedAppointments;
    }
    if (b.totalAppointments !== a.totalAppointments) {
      return b.totalAppointments - a.totalAppointments;
    }
  }

  if (b.completionRatePercent !== a.completionRatePercent) {
    return b.completionRatePercent - a.completionRatePercent;
  }
  if (Number(b.isVip) !== Number(a.isVip)) {
    return Number(b.isVip) - Number(a.isVip);
  }
  return a.doctorId - b.doctorId;
}

/**
 * Aggregate Top Doctors & overall clinic appointment summary inside MongoDB.
 * Privacy guarantee: `patientId`, `patients[]`, names, emails, phones, and DOBs of patients
 * NEVER leave MongoDB (`uniquePatientIds` is converted to integer `$size` inside the pipeline).
 */
async function aggregateDoctorsAndAppointments({
  period,
  topLimit,
  sortBy,
  specialtyId,
  onlyWithAppointments,
}) {
  const maxTimeMS = ANALYTICS_QUERY_LIMITS.QUERY_MAX_TIME_MS;
  const appointmentMatch = {
    appointmentDate: { $gte: period.from, $lte: period.to },
  };
  if (specialtyId !== null) {
    appointmentMatch.specialtyId = specialtyId;
  }

  const [doctorStatsRows, clinicAppointmentRows] = await Promise.all([
    Appointment.aggregate([
      { $match: appointmentMatch },
      {
        $group: {
          _id: '$doctorId',
          totalAppointments: { $sum: 1 },
          completedAppointments: {
            $sum: {
              $cond: [{ $eq: ['$status', APPOINTMENT_STATUSES.COMPLETED] }, 1, 0],
            },
          },
          cancelledAppointments: {
            $sum: {
              $cond: [
                {
                  $in: [
                    '$status',
                    [
                      APPOINTMENT_STATUSES.CANCELLED,
                      APPOINTMENT_STATUSES.EXPIRED,
                      APPOINTMENT_STATUSES.NO_SHOW,
                    ],
                  ],
                },
                1,
                0,
              ],
            },
          },
          onlineAppointments: {
            $sum: { $cond: [{ $eq: ['$type', 'ONLINE'] }, 1, 0] },
          },
          offlineAppointments: {
            $sum: { $cond: [{ $eq: ['$type', 'OFFLINE'] }, 1, 0] },
          },
          uniquePatientIds: { $addToSet: '$patientId' },
          totalPatientVisitsCount: {
            $sum: {
              $cond: [
                { $eq: ['$status', APPOINTMENT_STATUSES.COMPLETED] },
                {
                  $max: [
                    1,
                    { $size: { $ifNull: ['$patients', []] } },
                  ],
                },
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          doctorId: '$_id',
          totalAppointments: 1,
          completedAppointments: 1,
          cancelledAppointments: 1,
          onlineAppointments: 1,
          offlineAppointments: 1,
          uniquePatientsCount: { $size: '$uniquePatientIds' },
          totalPatientVisitsCount: 1,
        },
      },
    ]).option({ maxTimeMS }),

    Appointment.aggregate([
      { $match: appointmentMatch },
      {
        $group: {
          _id: null,
          totalAppointments: { $sum: 1 },
          completedAppointments: {
            $sum: {
              $cond: [{ $eq: ['$status', APPOINTMENT_STATUSES.COMPLETED] }, 1, 0],
            },
          },
          cancelledAppointments: {
            $sum: {
              $cond: [{ $eq: ['$status', APPOINTMENT_STATUSES.CANCELLED] }, 1, 0],
            },
          },
          expiredAppointments: {
            $sum: {
              $cond: [{ $eq: ['$status', APPOINTMENT_STATUSES.EXPIRED] }, 1, 0],
            },
          },
          noShowAppointments: {
            $sum: {
              $cond: [{ $eq: ['$status', APPOINTMENT_STATUSES.NO_SHOW] }, 1, 0],
            },
          },
          onlineAppointments: {
            $sum: { $cond: [{ $eq: ['$type', 'ONLINE'] }, 1, 0] },
          },
          offlineAppointments: {
            $sum: { $cond: [{ $eq: ['$type', 'OFFLINE'] }, 1, 0] },
          },
        },
      },
    ]).option({ maxTimeMS }),
  ]);

  const activeDoctorIds = doctorStatsRows.map((row) => row.doctorId);

  const doctorFilter = { userType: ROLES.DOCTOR };
  if (specialtyId !== null) {
    doctorFilter.specialtyId = specialtyId;
  }

  // Load doctors with activity + bounded fallback doctors (at most `topLimit`) if needed
  const [matchedDoctors, fallbackDoctors] = await Promise.all([
    activeDoctorIds.length > 0
      ? User.find({ ...doctorFilter, id: { $in: activeDoctorIds } })
          .select('id fullName specialtyId degree isVip isEnable')
          .maxTimeMS(maxTimeMS)
          .lean()
      : [],
    !onlyWithAppointments && activeDoctorIds.length < topLimit
      ? User.find({
          ...doctorFilter,
          isEnable: true,
          ...(activeDoctorIds.length > 0 ? { id: { $nin: activeDoctorIds } } : {}),
        })
          .sort({ isVip: -1, id: 1 })
          .limit(topLimit - activeDoctorIds.length)
          .select('id fullName specialtyId degree isVip isEnable')
          .maxTimeMS(maxTimeMS)
          .lean()
      : [],
  ]);

  const candidateDoctors = [...matchedDoctors, ...fallbackDoctors];
  const specialtyIds = [
    ...new Set(candidateDoctors.map((d) => d.specialtyId).filter(Boolean)),
  ];
  const specialties =
    specialtyIds.length > 0
      ? await Specialty.find({ id: { $in: specialtyIds } })
          .select('id name')
          .maxTimeMS(maxTimeMS)
          .lean()
      : [];
  const specialtyNameById = new Map(specialties.map((s) => [s.id, s.name]));
  const statsByDoctorId = new Map(
    doctorStatsRows.map((row) => [row.doctorId, row]),
  );

  const rankedAll = candidateDoctors.map((doc) => {
    const stat = statsByDoctorId.get(doc.id);
    const totalAppointments = stat?.totalAppointments || 0;
    const completedAppointments = stat?.completedAppointments || 0;
    return {
      doctorId: doc.id,
      fullName: doc.fullName,
      specialtyId: doc.specialtyId ?? null,
      specialtyName: doc.specialtyId
        ? specialtyNameById.get(doc.specialtyId) || ''
        : '',
      degree: doc.degree || null,
      isVip: Boolean(doc.isVip),
      isEnabled: Boolean(doc.isEnable),
      completedAppointments,
      totalAppointments,
      cancelledAppointments: stat?.cancelledAppointments || 0,
      onlineAppointments: stat?.onlineAppointments || 0,
      offlineAppointments: stat?.offlineAppointments || 0,
      uniquePatientsCount: stat?.uniquePatientsCount || 0,
      totalPatientVisitsCount: stat?.totalPatientVisitsCount || 0,
      completionRatePercent: roundPercent(
        completedAppointments,
        totalAppointments,
      ),
    };
  });

  rankedAll.sort((a, b) => compareDoctorRankItems(a, b, sortBy));

  const topItems = rankedAll.slice(0, topLimit).map((item, idx) => ({
    rank: idx + 1,
    ...item,
  }));

  const rawClinic = clinicAppointmentRows[0] || {
    totalAppointments: 0,
    completedAppointments: 0,
    cancelledAppointments: 0,
    expiredAppointments: 0,
    noShowAppointments: 0,
    onlineAppointments: 0,
    offlineAppointments: 0,
  };

  const pendingOrActiveAppointments = Math.max(
    0,
    rawClinic.totalAppointments -
      rawClinic.completedAppointments -
      rawClinic.cancelledAppointments -
      rawClinic.expiredAppointments -
      rawClinic.noShowAppointments,
  );

  return {
    topDoctors: {
      items: topItems,
      topLimit,
      sortBy,
      specialtyId,
      doctorsWithActivityCount: matchedDoctors.length,
    },
    appointmentSummary: {
      totalAppointments: rawClinic.totalAppointments,
      completedAppointments: rawClinic.completedAppointments,
      cancelledAppointments: rawClinic.cancelledAppointments,
      expiredAppointments: rawClinic.expiredAppointments,
      noShowAppointments: rawClinic.noShowAppointments,
      pendingOrActiveAppointments,
      onlineAppointments: rawClinic.onlineAppointments,
      offlineAppointments: rawClinic.offlineAppointments,
      completionRatePercent: roundPercent(
        rawClinic.completedAppointments,
        rawClinic.totalAppointments,
      ),
    },
  };
}

function buildQueryLimitsMeta(appliedTopLimit) {
  return {
    maxDateRangeDays: ANALYTICS_QUERY_LIMITS.MAX_DATE_RANGE_DAYS,
    maxSeriesBuckets: ANALYTICS_QUERY_LIMITS.MAX_SERIES_BUCKETS,
    maxTopDoctorsLimit: ANALYTICS_QUERY_LIMITS.MAX_TOP_DOCTORS_LIMIT,
    appliedTopLimit,
    queryTimeoutMs: ANALYTICS_QUERY_LIMITS.QUERY_MAX_TIME_MS,
  };
}

function buildPrivacyMeta() {
  return {
    containsPatientPii: false,
    policy: 'AGGREGATED_ONLY_NO_PATIENT_IDENTIFIERS',
  };
}

async function getAdminAnalyticsOverview(query = {}) {
  const options = resolveAnalyticsQueryOptions(query);

  const [userGrowth, doctorAndAppt] = await Promise.all([
    aggregateUserGrowth(options),
    aggregateDoctorsAndAppointments(options),
  ]);

  return {
    period: options.period,
    queryLimits: buildQueryLimitsMeta(options.topLimit),
    privacy: buildPrivacyMeta(),
    userGrowth,
    topDoctors: doctorAndAppt.topDoctors,
    appointmentSummary: doctorAndAppt.appointmentSummary,
    metricDefinitions: METRIC_DEFINITIONS,
  };
}

async function getUserGrowthAnalytics(query = {}) {
  const options = resolveAnalyticsQueryOptions(query);
  const userGrowth = await aggregateUserGrowth(options);

  return {
    period: options.period,
    queryLimits: buildQueryLimitsMeta(options.topLimit),
    privacy: buildPrivacyMeta(),
    userGrowth,
    metricDefinitions: METRIC_DEFINITIONS.filter(
      (item) => item.category === 'userGrowth',
    ),
  };
}

async function getTopDoctorsAnalytics(query = {}) {
  const options = resolveAnalyticsQueryOptions(query);
  const { topDoctors, appointmentSummary } =
    await aggregateDoctorsAndAppointments(options);

  return {
    period: options.period,
    queryLimits: buildQueryLimitsMeta(options.topLimit),
    privacy: buildPrivacyMeta(),
    topDoctors,
    appointmentSummary,
    metricDefinitions: METRIC_DEFINITIONS.filter(
      (item) => item.category === 'topDoctors',
    ),
  };
}

function getMetricCatalog() {
  return {
    queryLimits: buildQueryLimitsMeta(
      ANALYTICS_QUERY_LIMITS.DEFAULT_TOP_DOCTORS_LIMIT,
    ),
    privacy: buildPrivacyMeta(),
    metricDefinitions: METRIC_DEFINITIONS,
  };
}

async function getOperationalKpiAnalytics() {
  const { Waitlist, PaymentTransaction } = require('../models');

  const [totalAppointments, noShowAppointments, waitlistEntries, waitlistBooked, revenueBySpecialtyAgg] = await Promise.all([
    Appointment.countDocuments({ status: { $in: [APPOINTMENT_STATUSES.COMPLETED, APPOINTMENT_STATUSES.NO_SHOW] } }),
    Appointment.countDocuments({ status: APPOINTMENT_STATUSES.NO_SHOW }),
    Waitlist.countDocuments({}),
    Waitlist.countDocuments({ status: 'BOOKED' }),
    Appointment.aggregate([
      { $match: { status: APPOINTMENT_STATUSES.COMPLETED, finalAmount: { $gt: 0 } } },
      {
        $group: {
          _id: '$specialtyId',
          totalRevenue: { $sum: '$finalAmount' },
          appointmentCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'specialties',
          localField: '_id',
          foreignField: 'id',
          as: 'specialty',
        },
      },
      { $unwind: { path: '$specialty', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          specialtyId: '$_id',
          specialtyName: { $ifNull: ['$specialty.name', 'Chuyên khoa khác'] },
          totalRevenue: 1,
          appointmentCount: 1,
        },
      },
      { $sort: { totalRevenue: -1 } },
    ]),
  ]);

  const noShowRatePercent = totalAppointments > 0 ? Math.round((noShowAppointments / totalAppointments) * 10000) / 100 : 0;
  const waitlistFillRatePercent = waitlistEntries > 0 ? Math.round((waitlistBooked / waitlistEntries) * 10000) / 100 : 0;

  return {
    noShowRatePercent,
    noShowCount: noShowAppointments,
    totalFinishedAppointments: totalAppointments,
    waitlistFillRatePercent,
    waitlistTotalRequests: waitlistEntries,
    waitlistBookedCount: waitlistBooked,
    revenueBySpecialty: revenueBySpecialtyAgg,
  };
}

module.exports = {
  ANALYTICS_QUERY_LIMITS,
  METRIC_DEFINITIONS,
  getAdminAnalyticsOverview,
  getUserGrowthAnalytics,
  getTopDoctorsAnalytics,
  getOperationalKpiAnalytics,
  getMetricCatalog,
};

