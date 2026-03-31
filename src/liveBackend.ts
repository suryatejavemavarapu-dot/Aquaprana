import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const AQUAGPT_FUNCTION = env.EXPO_PUBLIC_AQUAGPT_FUNCTION ?? 'aquagpt-chat';
const CYCLE_REPORT_FUNCTION = env.EXPO_PUBLIC_CYCLE_REPORT_FUNCTION ?? 'cycle-report';
const SNAPSHOT_KEY = 'aquaprana:snapshot:v2';

let supabaseClient: SupabaseClient | null = null;

function addCountryCode(phone: string) {
  const cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('91') && cleaned.length > 10) {
    return `+${cleaned}`;
  }
  return `+91${cleaned}`;
}

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 9, 0, 0);
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDaysToIso(value: string, days: number) {
  const next = parseDate(value);
  next.setDate(next.getDate() + days);
  return toIsoDate(next);
}

function findSpeciesDefaults(species: string) {
  const map: Record<string, { minDays: number; maxDays: number; feedRatePct: number }> = {
    Vannamei: { minDays: 90, maxDays: 120, feedRatePct: 2.8 },
    'Tiger Prawn': { minDays: 120, maxDays: 180, feedRatePct: 2.4 },
    'Golda Prawn': { minDays: 120, maxDays: 150, feedRatePct: 2.1 },
    Rohu: { minDays: 180, maxDays: 270, feedRatePct: 2.2 },
    Tilapia: { minDays: 150, maxDays: 210, feedRatePct: 2.6 },
    Basa: { minDays: 150, maxDays: 210, feedRatePct: 2.1 },
    Barramundi: { minDays: 150, maxDays: 220, feedRatePct: 2.0 },
    Pompano: { minDays: 120, maxDays: 170, feedRatePct: 2.4 },
    Milkfish: { minDays: 120, maxDays: 180, feedRatePct: 2.3 },
  };
  return map[species] ?? { minDays: 90, maxDays: 120, feedRatePct: 2.5 };
}

function mapProfileRow(row: any, session: Session) {
  if (!row) {
    return {
      fullName: '',
      state: '',
      district: '',
      language: 'English',
      phone: session.user.phone?.replace(/^\+91/, '') ?? '',
    };
  }
  return {
    fullName: row.full_name ?? '',
    state: row.state ?? '',
    district: row.district ?? '',
    language: row.language ?? 'English',
    phone: (row.phone ?? session.user.phone ?? '').replace(/^\+91/, ''),
  };
}

function mapPondRecords(rows: {
  ponds: any[];
  cycles: any[];
  logs: any[];
  schedules: any[];
}) {
  const cyclesByPond = new Map<string, any[]>();
  const logsByPond = new Map<string, any[]>();
  const scheduleByPond = new Map<string, any>();

  rows.cycles.forEach((cycle) => {
    const current = cyclesByPond.get(cycle.pond_id) ?? [];
    current.push({
      id: cycle.id,
      pondId: cycle.pond_id,
      species: cycle.species,
      speciesCategory: cycle.species_category,
      stockingDensity: Number(cycle.stocking_density ?? 0),
      stockingDate: cycle.stocking_date,
      harvestWindowStart: cycle.harvest_window_start,
      harvestWindowEnd: cycle.harvest_window_end,
      status: cycle.status,
      notes: cycle.notes ?? '',
      outcome: cycle.outcome ?? undefined,
      harvestWeightKg: cycle.harvest_weight_kg ?? undefined,
      actualHarvestDate: cycle.actual_harvest_date ?? undefined,
      failureReason: cycle.failure_reason ?? undefined,
      fcr: cycle.fcr ?? undefined,
      survivalRate: cycle.survival_rate ?? undefined,
      closedAt: cycle.closed_at ?? undefined,
      reportGeneratedAt: cycle.report_generated_at ?? undefined,
    });
    cyclesByPond.set(cycle.pond_id, current);
  });

  rows.logs.forEach((log) => {
    const current = logsByPond.get(log.pond_id) ?? [];
    current.push({
      id: log.id,
      pondId: log.pond_id,
      cycleId: log.cycle_id,
      observedAt: log.observed_at,
      paramSource: log.param_source ?? 'manual',
      doMgL: log.do_mgl ?? undefined,
      ph: log.ph ?? undefined,
      tempC: log.temp_c ?? undefined,
      salinityPpt: log.salinity_ppt ?? undefined,
      ammoniaMgL: log.ammonia_mgl ?? undefined,
      turbidityCm: log.turbidity_cm ?? undefined,
      calciumMgL: log.calcium_mgl ?? undefined,
      magnesiumMgL: log.magnesium_mgl ?? undefined,
      potassiumMgL: log.potassium_mgl ?? undefined,
      feedQtyKg: log.feed_qty_kg ?? undefined,
      feedBrand: log.feed_brand ?? undefined,
      mortalityCount: log.mortality_count ?? undefined,
      treatment: log.treatment ?? undefined,
      abwG: log.abw_g ?? undefined,
      biomassKg: log.biomass_kg ?? undefined,
      notes: log.notes ?? undefined,
    });
    logsByPond.set(log.pond_id, current);
  });

  rows.schedules.forEach((schedule) => {
    scheduleByPond.set(schedule.pond_id, {
      id: schedule.id,
      cycleId: schedule.cycle_id,
      pondId: schedule.pond_id,
      feedsPerDay: schedule.feeds_per_day ?? 4,
      feedTimes: schedule.feed_times ?? ['06:00', '10:00', '14:00', '18:00'],
      initialDailyQtyKg: schedule.initial_daily_qty_kg ?? 0,
      intervalRule: schedule.interval_rule ?? 'fixed',
      feedRatePct: schedule.feed_rate_pct ?? 2.5,
      defaultBrand: schedule.default_brand ?? 'Default feed',
    });
  });

  return rows.ponds.map((pond) => ({
    pond: {
      id: pond.id,
      name: pond.name,
      areaAcres: Number(pond.area_acres ?? 0),
      depthFt: Number(pond.depth_ft ?? 0),
      latitude: pond.latitude ?? undefined,
      longitude: pond.longitude ?? undefined,
      isActive: pond.is_active ?? true,
    },
    cycles: (cyclesByPond.get(pond.id) ?? []).sort(
      (left, right) => new Date(right.stockingDate).getTime() - new Date(left.stockingDate).getTime(),
    ),
    logs: (logsByPond.get(pond.id) ?? []).sort(
      (left, right) => new Date(right.observedAt).getTime() - new Date(left.observedAt).getTime(),
    ),
    feedingSchedule:
      scheduleByPond.get(pond.id) ??
      {
        id: `${pond.id}-default-feed`,
        cycleId: '',
        pondId: pond.id,
        feedsPerDay: 4,
        feedTimes: ['06:00', '10:00', '14:00', '18:00'],
        initialDailyQtyKg: 0,
        intervalRule: 'fixed',
        feedRatePct: 2.5,
        defaultBrand: 'Default feed',
      },
  }));
}

function mapPriceConfig(row: any) {
  if (!row) {
    return null;
  }
  return {
    feedPricePerKg: row.feed_price_per_kg ?? 0,
    seedPricePerThousand: row.seed_price_per_thousand ?? 0,
    labourCostPerDay: row.labour_cost_per_day ?? 0,
    treatmentPrices: row.treatment_prices ?? [],
  };
}

function mapInventory(rows: any[]) {
  return rows.map((item) => ({
    id: item.id,
    productName: item.product_name,
    unit: item.unit,
    currentQty: item.current_qty,
    restockThreshold: item.restock_threshold,
    restockQty: item.restock_qty ?? undefined,
    location: item.location ?? undefined,
  }));
}

function mapSessions(rows: { sessions: any[]; messages: any[] }) {
  const messagesBySession = new Map<string, any[]>();
  rows.messages.forEach((message) => {
    const current = messagesBySession.get(message.session_id) ?? [];
    current.push({
      id: message.id,
      role: message.role,
      content: message.content,
    });
    messagesBySession.set(message.session_id, current);
  });

  const byPond: Record<string, { pondId: string; messages: any[] }> = {};
  rows.sessions.forEach((session) => {
    byPond[session.pond_id] = {
      pondId: session.pond_id,
      messages: (messagesBySession.get(session.id) ?? []).sort((left, right) => left.id.localeCompare(right.id)),
    };
  });
  return byPond;
}

export function isLiveBackendConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getBackendModeLabel() {
  return isLiveBackendConfigured() ? 'Live Supabase backend' : 'Demo mode';
}

export function getSupabaseClient() {
  if (!isLiveBackendConfigured()) {
    throw new Error('Supabase environment variables are missing.');
  }
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return supabaseClient;
}

export async function loadCachedSnapshot() {
  const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function saveCachedSnapshot(snapshot: any) {
  await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export async function clearCachedSnapshot() {
  await AsyncStorage.removeItem(SNAPSHOT_KEY);
}

export async function sendOtp(phone: string) {
  const client = getSupabaseClient();
  const { error } = await client.auth.signInWithOtp({
    phone: addCountryCode(phone),
  });
  if (error) {
    throw error;
  }
}

export async function verifyOtp(phone: string, token: string) {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.verifyOtp({
    phone: addCountryCode(phone),
    token,
    type: 'sms',
  });
  if (error) {
    throw error;
  }
  return data;
}

export async function signOut() {
  const client = getSupabaseClient();
  await client.auth.signOut();
}

export async function bootstrapLiveAppState() {
  if (!isLiveBackendConfigured()) {
    return null;
  }

  const client = getSupabaseClient();
  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }
  if (!session) {
    return { session: null };
  }

  const userId = session.user.id;
  const [profileRes, pondsRes, cyclesRes, logsRes, schedulesRes, priceRes, inventoryRes, sessionsRes, messagesRes] = await Promise.all([
    client.from('users').select('*').eq('auth_user_id', userId).maybeSingle(),
    client.from('ponds').select('*').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: false }),
    client.from('crop_cycles').select('*').eq('user_id', userId).order('stocking_date', { ascending: false }),
    client.from('pond_logs').select('*').eq('user_id', userId).order('observed_at', { ascending: false }),
    client.from('feeding_schedules').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    client.from('price_configs').select('*').eq('user_id', userId).maybeSingle(),
    client.from('inventory_items').select('*').eq('user_id', userId).order('product_name'),
    client.from('aquagpt_sessions').select('*').eq('user_id', userId).order('last_active_at', { ascending: false }),
    client.from('aquagpt_messages').select('*').eq('user_id', userId).order('created_at'),
  ]);

  const errors = [profileRes.error, pondsRes.error, cyclesRes.error, logsRes.error, schedulesRes.error, priceRes.error, inventoryRes.error, sessionsRes.error, messagesRes.error].filter(Boolean);
  if (errors.length) {
    throw errors[0];
  }

  const pondRecords = mapPondRecords({
    ponds: pondsRes.data ?? [],
    cycles: cyclesRes.data ?? [],
    logs: logsRes.data ?? [],
    schedules: schedulesRes.data ?? [],
  });

  return {
    session,
    profile: mapProfileRow(profileRes.data, session),
    pondRecords,
    priceConfig: mapPriceConfig(priceRes.data),
    inventoryItems: mapInventory(inventoryRes.data ?? []),
    sessions: mapSessions({ sessions: sessionsRes.data ?? [], messages: messagesRes.data ?? [] }),
    selectedPondId: pondRecords[0]?.pond.id ?? '',
  };
}

export async function upsertProfile(profile: {
  fullName: string;
  state: string;
  district: string;
  language: string;
  phone: string;
}) {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    throw new Error('No authenticated user found.');
  }

  const payload = {
    auth_user_id: user.id,
    phone: addCountryCode(profile.phone),
    full_name: profile.fullName,
    state: profile.state,
    district: profile.district,
    language: profile.language,
  };

  const { error } = await client.from('users').upsert(payload, { onConflict: 'auth_user_id' });
  if (error) {
    throw error;
  }
}

export async function savePriceConfig(priceConfig: any) {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw new Error('No authenticated user found.');
  }

  const { error } = await client.from('price_configs').upsert(
    {
      user_id: user.id,
      feed_price_per_kg: priceConfig.feedPricePerKg,
      seed_price_per_thousand: priceConfig.seedPricePerThousand,
      labour_cost_per_day: priceConfig.labourCostPerDay,
      treatment_prices: priceConfig.treatmentPrices,
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    throw error;
  }
}

export async function saveInventoryItems(items: any[]) {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw new Error('No authenticated user found.');
  }
  const payload = items.map((item) => ({
    id: item.id,
    user_id: user.id,
    product_name: item.productName,
    unit: item.unit,
    current_qty: item.currentQty,
    restock_threshold: item.restockThreshold,
    restock_qty: item.restockQty ?? null,
    location: item.location ?? null,
  }));
  const { error } = await client.from('inventory_items').upsert(payload);
  if (error) {
    throw error;
  }
}

export async function createMergedPondSetup(setup: any, initialPriceConfig: any, initialInventory: any[]) {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw new Error('No authenticated user found.');
  }

  const speciesDefaults = findSpeciesDefaults(setup.species);
  const pondInsert = await client
    .from('ponds')
    .insert({
      user_id: user.id,
      name: setup.pondName,
      area_acres: Number(setup.areaAcres),
      depth_ft: Number(setup.depthFt),
      latitude: setup.latitude ? Number(setup.latitude) : null,
      longitude: setup.longitude ? Number(setup.longitude) : null,
      is_active: true,
    })
    .select('*')
    .single();

  if (pondInsert.error) {
    throw pondInsert.error;
  }

  const cycleInsert = await client
    .from('crop_cycles')
    .insert({
      user_id: user.id,
      pond_id: pondInsert.data.id,
      species: setup.species,
      species_category: setup.speciesCategory,
      stocking_density: Number(setup.stockingDensity),
      stocking_date: setup.stockingDate,
      harvest_window_start: addDaysToIso(setup.stockingDate, speciesDefaults.minDays),
      harvest_window_end: addDaysToIso(setup.stockingDate, speciesDefaults.maxDays),
      status: 'active',
      notes: setup.notes,
    })
    .select('*')
    .single();

  if (cycleInsert.error) {
    throw cycleInsert.error;
  }

  const { error: scheduleError } = await client.from('feeding_schedules').insert({
    user_id: user.id,
    pond_id: pondInsert.data.id,
    cycle_id: cycleInsert.data.id,
    feeds_per_day: 4,
    feed_times: ['06:00', '10:00', '14:00', '18:00'],
    initial_daily_qty_kg: 18,
    interval_rule: 'pct_biomass',
    feed_rate_pct: speciesDefaults.feedRatePct,
    default_brand: 'Default feed',
  });

  if (scheduleError) {
    throw scheduleError;
  }

  await savePriceConfig(initialPriceConfig);

  const existingInventory = await client.from('inventory_items').select('id').eq('user_id', user.id).limit(1);
  if ((existingInventory.data?.length ?? 0) === 0) {
    await saveInventoryItems(initialInventory);
  }
}

export async function createDailyLog(payload: any) {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw new Error('No authenticated user found.');
  }

  const { error } = await client.from('pond_logs').insert({
    user_id: user.id,
    pond_id: payload.pondId,
    cycle_id: payload.cycleId,
    observed_at: payload.observedAt,
    param_source: payload.paramSource,
    do_mgl: payload.doMgL ?? null,
    ph: payload.ph ?? null,
    temp_c: payload.tempC ?? null,
    salinity_ppt: payload.salinityPpt ?? null,
    ammonia_mgl: payload.ammoniaMgL ?? null,
    turbidity_cm: payload.turbidityCm ?? null,
    calcium_mgl: payload.calciumMgL ?? null,
    magnesium_mgl: payload.magnesiumMgL ?? null,
    potassium_mgl: payload.potassiumMgL ?? null,
    feed_qty_kg: payload.feedQtyKg ?? null,
    feed_brand: payload.feedBrand ?? null,
    mortality_count: payload.mortalityCount ?? null,
    treatment: payload.treatment ?? null,
    abw_g: payload.abwG ?? null,
    biomass_kg: payload.biomassKg ?? null,
    notes: payload.notes ?? null,
  });

  if (error) {
    throw error;
  }
}

export async function closeCycle(cycleId: string, payload: any) {
  const client = getSupabaseClient();
  const { error } = await client
    .from('crop_cycles')
    .update({
      status: 'closed',
      outcome: payload.outcome,
      harvest_weight_kg: payload.harvestWeightKg,
      actual_harvest_date: payload.actualHarvestDate,
      failure_reason: payload.failureReason ?? null,
      fcr: payload.fcr,
      survival_rate: payload.survivalRate,
      closed_at: payload.actualHarvestDate,
      report_generated_at: new Date().toISOString(),
    })
    .eq('id', cycleId);
  if (error) {
    throw error;
  }
}

export async function startNextCycle(record: any, latestClosed: any) {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw new Error('No authenticated user found.');
  }
  const defaults = findSpeciesDefaults(latestClosed.species);
  const today = toIsoDate(new Date());
  const cycleInsert = await client
    .from('crop_cycles')
    .insert({
      user_id: user.id,
      pond_id: record.pond.id,
      species: latestClosed.species,
      species_category: latestClosed.speciesCategory,
      stocking_density: latestClosed.stockingDensity,
      stocking_date: today,
      harvest_window_start: addDaysToIso(today, defaults.minDays),
      harvest_window_end: addDaysToIso(today, defaults.maxDays),
      status: 'active',
      notes: 'Started from the close-cycle flow.',
    })
    .select('*')
    .single();
  if (cycleInsert.error) {
    throw cycleInsert.error;
  }

  const { error: scheduleError } = await client.from('feeding_schedules').insert({
    user_id: user.id,
    pond_id: record.pond.id,
    cycle_id: cycleInsert.data.id,
    feeds_per_day: record.feedingSchedule.feedsPerDay,
    feed_times: record.feedingSchedule.feedTimes,
    initial_daily_qty_kg: record.feedingSchedule.initialDailyQtyKg,
    interval_rule: record.feedingSchedule.intervalRule,
    feed_rate_pct: record.feedingSchedule.feedRatePct,
    default_brand: record.feedingSchedule.defaultBrand,
  });
  if (scheduleError) {
    throw scheduleError;
  }
}

export async function requestCycleReport(cycleId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke(CYCLE_REPORT_FUNCTION, {
    body: { cycleId },
  });
  if (error) {
    throw error;
  }
  return data;
}

export async function sendAquaMessage(options: {
  pondId: string;
  sessionId?: string;
  message: string;
  language: string;
}) {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke(AQUAGPT_FUNCTION, {
    body: {
      pond_id: options.pondId,
      session_id: options.sessionId ?? null,
      message: options.message,
      language: options.language,
    },
  });
  if (error) {
    throw error;
  }
  return data as { sessionId?: string; reply?: string };
}
