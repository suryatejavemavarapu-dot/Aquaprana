import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  bootstrapLiveAppState,
  clearCachedSnapshot,
  createDailyLog,
  createMergedPondSetup,
  getBackendModeLabel,
  isLiveBackendConfigured,
  loadCachedSnapshot,
  requestCycleReport,
  saveCachedSnapshot,
  saveInventoryItems,
  savePriceConfig,
  sendAquaMessage,
  sendOtp,
  signOut,
  startNextCycle as startNextCycleRemote,
  upsertProfile,
  verifyOtp,
  closeCycle as closeCycleRemote,
} from './src/liveBackend';

type Language = 'English' | 'Telugu' | 'Hindi';
type RootTab = 'ponds' | 'aquagpt' | 'profile';
type Screen = 'splash' | 'auth' | 'pondSetup' | 'home' | 'dashboard' | 'dailyLog' | 'closeCycle' | 'report';
type DashboardTab = 'logs' | 'trends' | 'cycles';
type TrendWindow = 7 | 14 | 30;
type CycleStatus = 'active' | 'closed';
type CycleOutcome = 'Successful' | 'Failed';
type ParameterStatus = 'safe' | 'warning' | 'critical' | 'stale' | 'empty';
type ParameterKey =
  | 'doMgL'
  | 'ph'
  | 'tempC'
  | 'salinityPpt'
  | 'ammoniaMgL'
  | 'turbidityCm'
  | 'calciumMgL'
  | 'magnesiumMgL'
  | 'potassiumMgL';

type NumericDraftKey =
  | 'areaAcres'
  | 'depthFt'
  | 'latitude'
  | 'longitude'
  | 'stockingDensity'
  | 'doMgL'
  | 'ph'
  | 'tempC'
  | 'salinityPpt'
  | 'ammoniaMgL'
  | 'turbidityCm'
  | 'calciumMgL'
  | 'magnesiumMgL'
  | 'potassiumMgL'
  | 'feedQtyKg'
  | 'mortalityCount'
  | 'abwG'
  | 'harvestWeightKg'
  | 'feedPricePerKg'
  | 'seedPricePerThousand'
  | 'labourCostPerDay';

interface UserProfile {
  fullName: string;
  state: string;
  district: string;
  language: Language;
  phone: string;
}

interface SetupDraft {
  pondName: string;
  areaAcres: string;
  depthFt: string;
  latitude: string;
  longitude: string;
  species: string;
  speciesCategory: string;
  stockingDensity: string;
  stockingDate: string;
  notes: string;
}

interface Pond {
  id: string;
  name: string;
  areaAcres: number;
  depthFt: number;
  latitude?: number;
  longitude?: number;
  isActive: boolean;
}

interface Cycle {
  id: string;
  pondId: string;
  species: string;
  speciesCategory: string;
  stockingDensity: number;
  stockingDate: string;
  harvestWindowStart: string;
  harvestWindowEnd: string;
  status: CycleStatus;
  notes: string;
  outcome?: CycleOutcome;
  harvestWeightKg?: number;
  actualHarvestDate?: string;
  failureReason?: string;
  fcr?: number;
  survivalRate?: number;
  closedAt?: string;
  reportGeneratedAt?: string;
}

interface PondLog {
  id: string;
  pondId: string;
  cycleId: string;
  observedAt: string;
  paramSource: 'manual' | 'iot';
  doMgL?: number;
  ph?: number;
  tempC?: number;
  salinityPpt?: number;
  ammoniaMgL?: number;
  turbidityCm?: number;
  calciumMgL?: number;
  magnesiumMgL?: number;
  potassiumMgL?: number;
  feedQtyKg?: number;
  feedBrand?: string;
  mortalityCount?: number;
  treatment?: string;
  abwG?: number;
  biomassKg?: number;
  notes?: string;
}

interface FeedingSchedule {
  id: string;
  cycleId: string;
  pondId: string;
  feedsPerDay: number;
  feedTimes: string[];
  initialDailyQtyKg: number;
  intervalRule: 'fixed' | 'pct_biomass';
  feedRatePct: number;
  defaultBrand: string;
}

interface PriceConfig {
  feedPricePerKg: number;
  seedPricePerThousand: number;
  labourCostPerDay: number;
  treatmentPrices: Array<{ name: string; price: number }>;
}

interface InventoryItem {
  id: string;
  productName: string;
  unit: 'kg' | 'litre' | 'units' | 'bags';
  currentQty: number;
  restockThreshold: number;
  restockQty?: number;
  location?: string;
}

interface PondRecord {
  pond: Pond;
  cycles: Cycle[];
  logs: PondLog[];
  feedingSchedule: FeedingSchedule;
}

interface AquaMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface AquaSession {
  pondId: string;
  messages: AquaMessage[];
}

interface DailyLogDraft {
  observationDate: string;
  observationTime: string;
  doMgL: string;
  ph: string;
  tempC: string;
  salinityPpt: string;
  ammoniaMgL: string;
  turbidityCm: string;
  calciumMgL: string;
  magnesiumMgL: string;
  potassiumMgL: string;
  feedQtyKg: string;
  feedBrand: string;
  mortalityCount: string;
  treatment: string;
  abwG: string;
  notes: string;
  paramSource: 'manual' | 'iot';
}

interface CloseCycleDraft {
  outcome: CycleOutcome;
  harvestWeightKg: string;
  actualHarvestDate: string;
  failureReason: string;
}

const BRAND = {
  // Core palette (matches HTML --ap-* tokens)
  ocean: '#1E7AB8',       // --ap-blue
  oceanDark: '#155a8a',   // --ap-blue-dark
  oceanMid: '#4a9fd4',    // --ap-blue-mid
  blueLight: '#e8f4fd',   // --ap-blue-light
  deep: '#0D3147',        // reserved (splash only)
  // Status colours
  success: '#27ae60',     // --ap-green
  amber: '#f39c12',       // --ap-amber
  critical: '#e74c3c',    // --ap-red
  warning: '#3A86D1',
  // Surfaces
  page: '#f7f8fa',        // --ap-gray  (screen background)
  card: '#ffffff',        // --ap-card
  foam: '#F5FAFF',
  sand: '#F4EBDD',
  shell: '#FFFDF8',
  // Text
  ink: '#1a202c',         // --ap-text
  slate: '#718096',       // --ap-muted
  // Borders
  border: '#e2e8f0',      // --ap-border (0.5px lines)
  borderSoft: 'rgba(15,34,48,0.06)',
  // Legacy aliases kept for unchanged code
  lagoon: '#5AA8D9',
  algae: '#2E8A63',
};

const APP_NOW = new Date(2026, 2, 31, 9, 0, 0); // March 31, 2026
const LOGO = require('./assets/aquaprana-logo.png');

const LANGUAGE_OPTIONS: Language[] = ['English', 'Telugu', 'Hindi'];
const STATE_OPTIONS = ['Andhra Pradesh', 'Telangana', 'Odisha'];
const DISTRICTS_BY_STATE: Record<string, string[]> = {
  'Andhra Pradesh': ['Krishna', 'West Godavari', 'East Godavari'],
  Telangana: ['Khammam', 'Warangal', 'Karimnagar'],
  Odisha: ['Jagatsinghpur', 'Kendrapara', 'Bhadrak'],
};

const SPECIES_GROUPS = [
  {
    category: 'Shrimp',
    entries: [
      { label: 'Vannamei', minDays: 90, maxDays: 120, salinityMin: 10, salinityMax: 25, feedRatePct: 2.8 },
      { label: 'Tiger Prawn', minDays: 120, maxDays: 180, salinityMin: 8, salinityMax: 25, feedRatePct: 2.4 },
      { label: 'Golda Prawn', minDays: 120, maxDays: 150, salinityMin: 0, salinityMax: 8, feedRatePct: 2.1 },
    ],
  },
  {
    category: 'Fish - Freshwater',
    entries: [
      { label: 'Rohu', minDays: 180, maxDays: 270, salinityMin: 0, salinityMax: 5, feedRatePct: 2.2 },
      { label: 'Tilapia', minDays: 150, maxDays: 210, salinityMin: 0, salinityMax: 8, feedRatePct: 2.6 },
      { label: 'Basa', minDays: 150, maxDays: 210, salinityMin: 0, salinityMax: 5, feedRatePct: 2.1 },
    ],
  },
  {
    category: 'Fish - Brackish / Marine',
    entries: [
      { label: 'Barramundi', minDays: 150, maxDays: 220, salinityMin: 8, salinityMax: 20, feedRatePct: 2.0 },
      { label: 'Pompano', minDays: 120, maxDays: 170, salinityMin: 12, salinityMax: 28, feedRatePct: 2.4 },
      { label: 'Milkfish', minDays: 120, maxDays: 180, salinityMin: 5, salinityMax: 25, feedRatePct: 2.3 },
    ],
  },
  {
    category: 'Other',
    entries: [{ label: 'Other', minDays: 90, maxDays: 120, salinityMin: 0, salinityMax: 25, feedRatePct: 2.5 }],
  },
] as const;

const PARAMETER_META: Record<
  ParameterKey,
  {
    label: string;
    unit: string;
    safeLabel: string;
  }
> = {
  doMgL: { label: 'DO', unit: 'mg/L', safeLabel: '4-10' },
  ph: { label: 'pH', unit: '', safeLabel: '7.5-8.5' },
  tempC: { label: 'Temp', unit: 'C', safeLabel: '26-32' },
  salinityPpt: { label: 'Sal', unit: 'ppt', safeLabel: 'Species-based' },
  ammoniaMgL: { label: 'NH3', unit: 'mg/L', safeLabel: '0-0.1' },
  turbidityCm: { label: 'Turbidity', unit: 'cm', safeLabel: '30-50' },
  calciumMgL: { label: 'Ca', unit: 'mg/L', safeLabel: '>= 75' },
  magnesiumMgL: { label: 'Mg', unit: 'mg/L', safeLabel: '>= 100' },
  potassiumMgL: { label: 'K', unit: 'mg/L', safeLabel: '>= 5' },
};

const DEFAULT_PROFILE: UserProfile = {
  fullName: 'Ravi Kumar',
  state: 'Andhra Pradesh',
  district: 'Krishna',
  language: 'English',
  phone: '9876543210',
};

const DEFAULT_SETUP: SetupDraft = {
  pondName: 'Pond 1 - East',
  areaAcres: '2.5',
  depthFt: '4.0',
  latitude: '16.5074',
  longitude: '80.6480',
  species: 'Vannamei',
  speciesCategory: 'Shrimp',
  stockingDensity: '10',
  stockingDate: '2026-03-28',
  notes: 'Seed source: trusted hatchery. Initial pond prep completed.',
};

const DEFAULT_PRICE_CONFIG: PriceConfig = {
  feedPricePerKg: 52,
  seedPricePerThousand: 410,
  labourCostPerDay: 950,
  treatmentPrices: [
    { name: 'Vitazyme 2L', price: 180 },
    { name: 'Mineral mix', price: 320 },
    { name: 'Probiotic dose', price: 210 },
  ],
};

const EMPTY_DAILY_LOG: DailyLogDraft = {
  observationDate: toIsoDate(APP_NOW),
  observationTime: formatTimeInput(APP_NOW),
  doMgL: '',
  ph: '',
  tempC: '',
  salinityPpt: '',
  ammoniaMgL: '',
  turbidityCm: '',
  calciumMgL: '',
  magnesiumMgL: '',
  potassiumMgL: '',
  feedQtyKg: '',
  feedBrand: '',
  mortalityCount: '',
  treatment: '',
  abwG: '',
  notes: '',
  paramSource: 'manual',
};

const EMPTY_CLOSE_CYCLE: CloseCycleDraft = {
  outcome: 'Successful',
  harvestWeightKg: '',
  actualHarvestDate: toIsoDate(APP_NOW),
  failureReason: '',
};

function pad(value: number) {
  return value.toString().padStart(2, '0');
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 9, 0, 0);
}

function addDaysToIso(value: string, days: number) {
  const next = fromIsoDate(value);
  next.setDate(next.getDate() + days);
  return toIsoDate(next);
}

function formatDate(value: string) {
  return fromIsoDate(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatShortDate(value: string) {
  const date = fromIsoDate(value);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  })} ${date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })}`;
}

function formatTimeInput(value: Date) {
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function combineDateAndTime(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0).toISOString();
}

function differenceInDays(start: Date, end: Date) {
  const a = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const b = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return Math.round((b - a) / 86400000);
}

function hoursSince(isoDateTime: string) {
  return Math.max(0, Math.round((APP_NOW.getTime() - new Date(isoDateTime).getTime()) / 3600000));
}

function optionalNumber(value: string) {
  if (!value.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function findSpeciesConfig(species: string) {
  for (const group of SPECIES_GROUPS) {
    const match = group.entries.find((entry) => entry.label === species);
    if (match) {
      return match;
    }
  }
  return SPECIES_GROUPS[0].entries[0];
}

function getActiveCycle(record?: PondRecord) {
  return record?.cycles.find((cycle) => cycle.status === 'active');
}

function getLogsForCycle(record: PondRecord, cycleId?: string) {
  if (!cycleId) {
    return [];
  }
  return record.logs
    .filter((log) => log.cycleId === cycleId)
    .sort((left, right) => new Date(right.observedAt).getTime() - new Date(left.observedAt).getTime());
}

function getLatestLog(record?: PondRecord, cycleId?: string) {
  if (!record || !cycleId) {
    return undefined;
  }
  return getLogsForCycle(record, cycleId)[0];
}

function getStockingCount(record: PondRecord, cycle: Cycle) {
  return Math.round(record.pond.areaAcres * 4047 * cycle.stockingDensity);
}

function getCumulativeFeed(record: PondRecord, cycleId?: string) {
  return round(
    getLogsForCycle(record, cycleId).reduce((total, log) => total + (log.feedQtyKg ?? 0), 0),
    1,
  );
}

function getCumulativeMortality(record: PondRecord, cycleId?: string) {
  return Math.round(getLogsForCycle(record, cycleId).reduce((total, log) => total + (log.mortalityCount ?? 0), 0));
}

function getSurvivalRate(record: PondRecord, cycle: Cycle) {
  const stocked = getStockingCount(record, cycle);
  if (!stocked) {
    return 0;
  }
  const mortality = getCumulativeMortality(record, cycle.id);
  return round(Math.max(0, ((stocked - mortality) / stocked) * 100), 1);
}

function getLastAbw(record: PondRecord, cycleId?: string) {
  return getLogsForCycle(record, cycleId).find((log) => typeof log.abwG === 'number')?.abwG;
}

function getCurrentBiomass(record: PondRecord, cycle: Cycle) {
  const latestBiomass = getLogsForCycle(record, cycle.id).find((log) => typeof log.biomassKg === 'number')?.biomassKg;
  return latestBiomass ? round(latestBiomass, 0) : 0;
}

function getRunningFcr(record: PondRecord, cycle: Cycle) {
  const biomass = getCurrentBiomass(record, cycle);
  if (!biomass) {
    return 0;
  }
  return round(getCumulativeFeed(record, cycle.id) / biomass, 2);
}

function getParameterStatus(
  key: ParameterKey,
  value: number | undefined,
  observedAt?: string,
  species = 'Vannamei',
): ParameterStatus {
  if (typeof value !== 'number') {
    return 'empty';
  }
  if (observedAt && hoursSince(observedAt) > 24) {
    return 'stale';
  }

  const speciesConfig = findSpeciesConfig(species);
  switch (key) {
    case 'doMgL':
      if (value < 3 || value > 12) return 'critical';
      if (value < 4 || value > 10) return 'warning';
      return 'safe';
    case 'ph':
      if (value < 7 || value > 9) return 'critical';
      if (value < 7.5 || value > 8.5) return 'warning';
      return 'safe';
    case 'tempC':
      if (value < 24 || value > 34) return 'critical';
      if (value < 26 || value > 32) return 'warning';
      return 'safe';
    case 'salinityPpt':
      if (value < speciesConfig.salinityMin - 3 || value > speciesConfig.salinityMax + 3) return 'critical';
      if (value < speciesConfig.salinityMin || value > speciesConfig.salinityMax) return 'warning';
      return 'safe';
    case 'ammoniaMgL':
      if (value > 0.3) return 'critical';
      if (value > 0.1) return 'warning';
      return 'safe';
    case 'turbidityCm':
      if (value < 25 || value > 55) return 'critical';
      if (value < 30 || value > 50) return 'warning';
      return 'safe';
    case 'calciumMgL':
      if (value < 50) return 'critical';
      if (value < 75) return 'warning';
      return 'safe';
    case 'magnesiumMgL':
      if (value < 75) return 'critical';
      if (value < 100) return 'warning';
      return 'safe';
    case 'potassiumMgL':
      if (value < 3) return 'critical';
      if (value < 5) return 'warning';
      return 'safe';
    default:
      return 'safe';
  }
}

function getStatusColors(status: ParameterStatus) {
  switch (status) {
    case 'safe':
      return { background: '#EAF8F1', border: '#9ED7B4', text: BRAND.success };
    case 'warning':
      return { background: '#EEF5FD', border: '#9BC1E8', text: BRAND.warning };
    case 'critical':
      return { background: '#FCEEEE', border: '#E8A3A3', text: BRAND.critical };
    case 'stale':
      return { background: '#F9F4EC', border: '#E7D6B7', text: BRAND.amber };
    default:
      return { background: '#F5F7FA', border: '#D9E2EA', text: BRAND.slate };
  }
}

function getHarvestStatus(cycle: Cycle) {
  const start = fromIsoDate(cycle.harvestWindowStart);
  const end = fromIsoDate(cycle.harvestWindowEnd);
  if (APP_NOW > end) {
    return { label: 'Harvest window overdue', tone: 'critical' as const };
  }
  if (APP_NOW >= start) {
    return { label: 'Harvest window open', tone: 'warning' as const };
  }
  const startIn = differenceInDays(APP_NOW, start);
  const endIn = differenceInDays(APP_NOW, end);
  return { label: `Ready in ${startIn}-${endIn} days`, tone: 'safe' as const };
}

function getCycleDay(cycle: Cycle) {
  return differenceInDays(fromIsoDate(cycle.stockingDate), APP_NOW) + 1;
}

function getExpenseSummary(record: PondRecord, cycle: Cycle, priceConfig: PriceConfig) {
  const stocked = getStockingCount(record, cycle);
  const feedCost = getCumulativeFeed(record, cycle.id) * priceConfig.feedPricePerKg;
  const seedCost = (stocked / 1000) * priceConfig.seedPricePerThousand;
  const treatmentCost = getLogsForCycle(record, cycle.id).reduce((total, log) => {
    const treatment = priceConfig.treatmentPrices.find((entry) => entry.name === log.treatment);
    return total + (treatment ? treatment.price : 0);
  }, 0);
  const labourCost = priceConfig.labourCostPerDay * Math.max(1, getCycleDay(cycle));
  const totalCost = feedCost + seedCost + treatmentCost + labourCost;
  const costPerKg = cycle.harvestWeightKg ? totalCost / cycle.harvestWeightKg : totalCost / Math.max(1, getCurrentBiomass(record, cycle));
  return {
    feedCost: round(feedCost, 0),
    seedCost: round(seedCost, 0),
    treatmentCost: round(treatmentCost, 0),
    labourCost: round(labourCost, 0),
    totalCost: round(totalCost, 0),
    costPerKg: round(costPerKg, 1),
  };
}

function getRecommendedFeed(record: PondRecord, cycle: Cycle, schedule: FeedingSchedule) {
  if (schedule.intervalRule === 'fixed') {
    return round(schedule.initialDailyQtyKg, 1);
  }
  const biomass = getCurrentBiomass(record, cycle);
  if (!biomass) {
    return round(schedule.initialDailyQtyKg, 1);
  }
  return round((biomass * schedule.feedRatePct) / 100, 1);
}

function getSuggestedQuestions(record?: PondRecord) {
  const activeCycle = record ? getActiveCycle(record) : undefined;
  const latestLog = record && activeCycle ? getLatestLog(record, activeCycle.id) : undefined;
  if (!record || !activeCycle || !latestLog) {
    return ['Why should I log first?', 'What do you need to advise me?', 'How often should I update pond data?'];
  }
  const suggestions = ['What does my FCR tell me?', 'Should I change feed today?', 'Which parameter needs attention most?'];
  if ((latestLog.ammoniaMgL ?? 0) > 0.1) {
    suggestions[0] = 'Why is my ammonia rising?';
  }
  if (getHarvestStatus(activeCycle).label === 'Harvest window open') {
    suggestions[1] = 'Should I harvest this week?';
  }
  if ((latestLog.calciumMgL ?? 100) < 75) {
    suggestions[2] = 'How do I correct low calcium safely?';
  }
  return suggestions;
}

function buildCsvPreview(record: PondRecord, cycle: Cycle) {
  const header = 'observed_at,do_mgl,ph,temp_c,salinity_ppt,ammonia_mgl,turbidity_cm,calcium_mgl,magnesium_mgl,potassium_mgl,param_source';
  const rows = getLogsForCycle(record, cycle.id)
    .slice(0, 5)
    .reverse()
    .map((log) =>
      [
        log.observedAt,
        log.doMgL ?? '',
        log.ph ?? '',
        log.tempC ?? '',
        log.salinityPpt ?? '',
        log.ammoniaMgL ?? '',
        log.turbidityCm ?? '',
        log.calciumMgL ?? '',
        log.magnesiumMgL ?? '',
        log.potassiumMgL ?? '',
        log.paramSource,
      ].join(','),
    );
  return [header, ...rows].join('\n');
}

function generateAquaAdvice(question: string, record?: PondRecord, language: Language = 'English') {
  const activeCycle = record ? getActiveCycle(record) : undefined;
  const latestLog = record && activeCycle ? getLatestLog(record, activeCycle.id) : undefined;
  if (!record || !activeCycle || !latestLog) {
    return "I can't advise without pond data. Please set up your pond and log at least one entry first.";
  }

  const staleWarning =
    hoursSince(latestLog.observedAt) > 48
      ? `Your last log is ${Math.round(hoursSince(latestLog.observedAt) / 24)} days old. My advice may not reflect current pond conditions. `
      : '';
  const lower = question.toLowerCase();
  const survival = getSurvivalRate(record, activeCycle);
  const fcr = getRunningFcr(record, activeCycle);
  const biomass = getCurrentBiomass(record, activeCycle);
  const recommendationStart = language === 'Hindi' ? 'Aapke pond data ke hisaab se' : language === 'Telugu' ? 'Mee pond data prakaram' : 'Based on your pond data';

  if (lower.includes('ammonia')) {
    return `${staleWarning}${recommendationStart}, ammonia is ${latestLog.ammoniaMgL ?? 0} mg/L, above the safe limit of 0.1 for ${activeCycle.species}. Reduce feed by about 15 to 20 percent for the next feed, keep aeration running, and recheck within 6 hours. DO is ${latestLog.doMgL ?? 0} mg/L, so oxygen support is helping, but this still needs a fresh log today.`;
  }

  if (lower.includes('harvest')) {
    const window = getHarvestStatus(activeCycle);
    return `${staleWarning}${recommendationStart}, the pond is on day ${getCycleDay(activeCycle)} with biomass near ${biomass} kg, survival ${survival} percent, and running FCR ${fcr}. Harvest status is "${window.label}". If market price is strong and growth has slowed, this pond looks close to decision stage.`;
  }

  if (lower.includes('fcr') || lower.includes('feed')) {
    return `${staleWarning}${recommendationStart}, running FCR is ${fcr}. For this stage, that is ${fcr <= 1.4 ? 'healthy' : fcr <= 1.8 ? 'acceptable but needs monitoring' : 'too high and should be corrected'}. Compare actual feed against the recommended schedule and avoid overfeeding while ammonia is ${latestLog.ammoniaMgL ?? 0}.`;
  }

  if (lower.includes('calcium') || lower.includes('magnesium') || lower.includes('potassium')) {
    return `${staleWarning}${recommendationStart}, calcium is ${latestLog.calciumMgL ?? 0} mg/L, magnesium is ${latestLog.magnesiumMgL ?? 0} mg/L, and potassium is ${latestLog.potassiumMgL ?? 0} mg/L. Calcium is the weakest of the three today, so correct minerals in small staged doses and log another reading after the next water check.`;
  }

  return `${staleWarning}${recommendationStart}, your key watchouts are ammonia ${latestLog.ammoniaMgL ?? 0} mg/L, pH ${latestLog.ph ?? 0}, and survival ${survival} percent. I would log again today, follow the recommended feed schedule, and use the trends tab to confirm whether ammonia is rising or was a one-off spike.`;
}

function makeLog(
  pondId: string,
  cycleId: string,
  observedAt: string,
  values: Partial<PondLog>,
): PondLog {
  return {
    id: `${pondId}-${cycleId}-${observedAt}`,
    pondId,
    cycleId,
    observedAt,
    paramSource: values.paramSource ?? 'manual',
    ...values,
  };
}

function buildPortfolioFromSetup(setup: SetupDraft): PondRecord[] {
  const speciesConfig = findSpeciesConfig(setup.species);

  const eastPond: Pond = {
    id: 'pond-east',
    name: setup.pondName,
    areaAcres: Number(setup.areaAcres) || 2.5,
    depthFt: Number(setup.depthFt) || 4,
    latitude: optionalNumber(setup.latitude),
    longitude: optionalNumber(setup.longitude),
    isActive: true,
  };

  const eastCycle: Cycle = {
    id: 'cycle-east-active',
    pondId: eastPond.id,
    species: setup.species,
    speciesCategory: setup.speciesCategory,
    stockingDensity: Number(setup.stockingDensity) || 10,
    stockingDate: setup.stockingDate,
    harvestWindowStart: addDaysToIso(setup.stockingDate, speciesConfig.minDays),
    harvestWindowEnd: addDaysToIso(setup.stockingDate, speciesConfig.maxDays),
    status: 'active',
    notes: setup.notes,
  };

  const eastClosedCycle: Cycle = {
    id: 'cycle-east-closed',
    pondId: eastPond.id,
    species: setup.species,
    speciesCategory: setup.speciesCategory,
    stockingDensity: 9.5,
    stockingDate: '2025-11-20',
    harvestWindowStart: '2026-02-18',
    harvestWindowEnd: '2026-03-20',
    status: 'closed',
    notes: 'Strong previous harvest cycle.',
    outcome: 'Successful',
    harvestWeightKg: 1185,
    actualHarvestDate: '2026-02-22',
    fcr: 1.36,
    survivalRate: 84.2,
    closedAt: '2026-02-22',
    reportGeneratedAt: '2026-02-22T10:10:00.000Z',
  };

  const eastLogs = [
    makeLog(eastPond.id, eastCycle.id, '2026-05-13T07:40:00.000Z', {
      paramSource: 'iot',
      doMgL: 6.2,
      ph: 7.4,
      tempC: 29,
      salinityPpt: 18,
      ammoniaMgL: 0.4,
      turbidityCm: 33,
      calciumMgL: 62,
      magnesiumMgL: 110,
      potassiumMgL: 4.2,
      feedQtyKg: 42,
      feedBrand: 'BlueFeed Grower',
      mortalityCount: 420,
      treatment: 'Vitazyme 2L',
      abwG: 14.2,
      biomassKg: 1249,
      notes: 'Two parameters auto-filled from IoT and confirmed pond-side.',
    }),
    makeLog(eastPond.id, eastCycle.id, '2026-05-12T06:15:00.000Z', {
      paramSource: 'iot',
      doMgL: 6.6,
      ph: 7.7,
      tempC: 28.5,
      salinityPpt: 18.4,
      ammoniaMgL: 0.18,
      turbidityCm: 35,
      calciumMgL: 68,
      magnesiumMgL: 116,
      potassiumMgL: 4.7,
      feedQtyKg: 40,
      feedBrand: 'BlueFeed Grower',
      mortalityCount: 360,
      abwG: 13.9,
      biomassKg: 1216,
    }),
    makeLog(eastPond.id, eastCycle.id, '2026-05-11T06:20:00.000Z', {
      paramSource: 'manual',
      doMgL: 7.1,
      ph: 7.8,
      tempC: 28.1,
      salinityPpt: 18.2,
      ammoniaMgL: 0.11,
      turbidityCm: 37,
      calciumMgL: 72,
      magnesiumMgL: 120,
      potassiumMgL: 4.9,
      feedQtyKg: 39,
      feedBrand: 'BlueFeed Grower',
      mortalityCount: 280,
      abwG: 13.3,
      biomassKg: 1167,
    }),
    makeLog(eastPond.id, eastCycle.id, '2026-05-10T06:20:00.000Z', {
      paramSource: 'manual',
      doMgL: 7.5,
      ph: 7.9,
      tempC: 28,
      salinityPpt: 18.1,
      ammoniaMgL: 0.08,
      turbidityCm: 39,
      calciumMgL: 79,
      magnesiumMgL: 122,
      potassiumMgL: 5.2,
      feedQtyKg: 38,
      feedBrand: 'BlueFeed Grower',
      mortalityCount: 210,
      abwG: 12.9,
      biomassKg: 1120,
    }),
    makeLog(eastPond.id, eastCycle.id, '2026-05-09T06:20:00.000Z', {
      paramSource: 'manual',
      doMgL: 7.8,
      ph: 8.0,
      tempC: 27.9,
      salinityPpt: 18.3,
      ammoniaMgL: 0.07,
      turbidityCm: 38,
      calciumMgL: 82,
      magnesiumMgL: 118,
      potassiumMgL: 5.0,
      feedQtyKg: 36,
      feedBrand: 'BlueFeed Grower',
      mortalityCount: 180,
      abwG: 12.3,
      biomassKg: 1062,
    }),
    makeLog(eastPond.id, eastCycle.id, '2026-05-08T06:20:00.000Z', {
      paramSource: 'manual',
      doMgL: 7.4,
      ph: 7.9,
      tempC: 28.4,
      salinityPpt: 18.5,
      ammoniaMgL: 0.09,
      turbidityCm: 40,
      calciumMgL: 84,
      magnesiumMgL: 119,
      potassiumMgL: 5.1,
      feedQtyKg: 35,
      feedBrand: 'BlueFeed Grower',
      mortalityCount: 150,
      abwG: 11.8,
      biomassKg: 1013,
    }),
    makeLog(eastPond.id, eastCycle.id, '2026-05-07T06:20:00.000Z', {
      paramSource: 'manual',
      doMgL: 7.0,
      ph: 7.7,
      tempC: 28.2,
      salinityPpt: 18.4,
      ammoniaMgL: 0.1,
      turbidityCm: 41,
      calciumMgL: 78,
      magnesiumMgL: 117,
      potassiumMgL: 4.8,
      feedQtyKg: 34,
      feedBrand: 'BlueFeed Grower',
      mortalityCount: 140,
      abwG: 11.2,
      biomassKg: 965,
    }),
  ];

  const westPond: Pond = {
    id: 'pond-west',
    name: 'Pond 2 - West',
    areaAcres: 1.8,
    depthFt: 3.8,
    latitude: 16.505,
    longitude: 80.643,
    isActive: true,
  };

  const westCycle: Cycle = {
    id: 'cycle-west-active',
    pondId: westPond.id,
    species: 'Vannamei',
    speciesCategory: 'Shrimp',
    stockingDensity: 8,
    stockingDate: '2026-04-21',
    harvestWindowStart: '2026-07-20',
    harvestWindowEnd: '2026-08-19',
    status: 'active',
    notes: 'Good survival. No log today yet.',
  };

  const westLogs = [
    makeLog(westPond.id, westCycle.id, '2026-05-12T03:40:00.000Z', {
      paramSource: 'manual',
      doMgL: 6.9,
      ph: 7.8,
      tempC: 28.3,
      salinityPpt: 15,
      ammoniaMgL: 0.08,
      turbidityCm: 36,
      calciumMgL: 88,
      magnesiumMgL: 125,
      potassiumMgL: 5.6,
      feedQtyKg: 22,
      feedBrand: 'BlueFeed Starter',
      mortalityCount: 85,
      abwG: 8.8,
      biomassKg: 520,
    }),
    makeLog(westPond.id, westCycle.id, '2026-05-11T03:45:00.000Z', {
      paramSource: 'manual',
      doMgL: 7.2,
      ph: 7.9,
      tempC: 28.4,
      salinityPpt: 15.1,
      ammoniaMgL: 0.06,
      turbidityCm: 35,
      calciumMgL: 91,
      magnesiumMgL: 128,
      potassiumMgL: 5.8,
      feedQtyKg: 21,
      feedBrand: 'BlueFeed Starter',
      mortalityCount: 75,
      abwG: 8.5,
      biomassKg: 497,
    }),
  ];

  const northPond: Pond = {
    id: 'pond-north',
    name: 'Pond 3 - North',
    areaAcres: 4.5,
    depthFt: 4.2,
    latitude: 16.509,
    longitude: 80.651,
    isActive: true,
  };

  const northCycle: Cycle = {
    id: 'cycle-north-active',
    pondId: northPond.id,
    species: 'Tiger Prawn',
    speciesCategory: 'Shrimp',
    stockingDensity: 10,
    stockingDate: '2026-02-15',
    harvestWindowStart: '2026-05-10',
    harvestWindowEnd: '2026-06-09',
    status: 'active',
    notes: 'Window open. Lower survival needs attention.',
  };

  const northLogs = [
    makeLog(northPond.id, northCycle.id, '2026-05-13T04:10:00.000Z', {
      paramSource: 'iot',
      doMgL: 5.8,
      ph: 7.2,
      tempC: 29.2,
      salinityPpt: 17,
      ammoniaMgL: 0.22,
      turbidityCm: 32,
      calciumMgL: 58,
      magnesiumMgL: 82,
      potassiumMgL: 3.2,
      feedQtyKg: 48,
      feedBrand: 'OceanGrow Max',
      mortalityCount: 720,
      treatment: 'Mineral mix',
      abwG: 16.8,
      biomassKg: 2210,
    }),
    makeLog(northPond.id, northCycle.id, '2026-05-12T04:15:00.000Z', {
      paramSource: 'manual',
      doMgL: 5.9,
      ph: 7.3,
      tempC: 29.1,
      salinityPpt: 17.2,
      ammoniaMgL: 0.18,
      turbidityCm: 31,
      calciumMgL: 60,
      magnesiumMgL: 86,
      potassiumMgL: 3.5,
      feedQtyKg: 47,
      feedBrand: 'OceanGrow Max',
      mortalityCount: 640,
      abwG: 16.2,
      biomassKg: 2140,
    }),
  ];

  return [
    {
      pond: eastPond,
      cycles: [eastCycle, eastClosedCycle],
      logs: eastLogs,
      feedingSchedule: {
        id: 'feed-east',
        cycleId: eastCycle.id,
        pondId: eastPond.id,
        feedsPerDay: 4,
        feedTimes: ['06:00', '10:00', '14:00', '18:00'],
        initialDailyQtyKg: 36,
        intervalRule: 'pct_biomass',
        feedRatePct: 2.8,
        defaultBrand: 'BlueFeed Grower',
      },
    },
    {
      pond: westPond,
      cycles: [westCycle],
      logs: westLogs,
      feedingSchedule: {
        id: 'feed-west',
        cycleId: westCycle.id,
        pondId: westPond.id,
        feedsPerDay: 4,
        feedTimes: ['06:00', '10:00', '14:00', '18:00'],
        initialDailyQtyKg: 18,
        intervalRule: 'pct_biomass',
        feedRatePct: 3.2,
        defaultBrand: 'BlueFeed Starter',
      },
    },
    {
      pond: northPond,
      cycles: [northCycle],
      logs: northLogs,
      feedingSchedule: {
        id: 'feed-north',
        cycleId: northCycle.id,
        pondId: northPond.id,
        feedsPerDay: 5,
        feedTimes: ['05:30', '09:30', '13:30', '17:30', '21:00'],
        initialDailyQtyKg: 44,
        intervalRule: 'pct_biomass',
        feedRatePct: 2.2,
        defaultBrand: 'OceanGrow Max',
      },
    },
  ];
}

function buildDefaultInventory(): InventoryItem[] {
  return [
    {
      id: 'inv-feed-grower',
      productName: 'BlueFeed Grower',
      unit: 'kg',
      currentQty: 420,
      restockThreshold: 400,
      restockQty: 600,
      location: 'Main shed',
    },
    {
      id: 'inv-feed-starter',
      productName: 'BlueFeed Starter',
      unit: 'kg',
      currentQty: 275,
      restockThreshold: 200,
      restockQty: 400,
      location: 'Main shed',
    },
    {
      id: 'inv-vitazyme',
      productName: 'Vitazyme 2L',
      unit: 'litre',
      currentQty: 5,
      restockThreshold: 6,
      restockQty: 12,
      location: 'Medicine cabinet',
    },
    {
      id: 'inv-mineral',
      productName: 'Mineral mix',
      unit: 'bags',
      currentQty: 3,
      restockThreshold: 4,
      restockQty: 10,
      location: 'Store room',
    },
  ];
}

function makeDraftFromLatest(record?: PondRecord): DailyLogDraft {
  const cycle = getActiveCycle(record);
  const latest = record && cycle ? getLatestLog(record, cycle.id) : undefined;
  if (!latest) {
    return {
      ...EMPTY_DAILY_LOG,
      feedBrand: record?.feedingSchedule.defaultBrand ?? '',
    };
  }
  return {
    ...EMPTY_DAILY_LOG,
    observationDate: toIsoDate(APP_NOW),
    observationTime: formatTimeInput(APP_NOW),
    ph: latest.ph?.toString() ?? '',
    salinityPpt: latest.salinityPpt?.toString() ?? '',
    ammoniaMgL: latest.ammoniaMgL?.toString() ?? '',
    calciumMgL: latest.calciumMgL?.toString() ?? '',
    magnesiumMgL: latest.magnesiumMgL?.toString() ?? '',
    potassiumMgL: latest.potassiumMgL?.toString() ?? '',
    feedQtyKg: latest.feedQtyKg?.toString() ?? '',
    feedBrand: latest.feedBrand ?? record?.feedingSchedule.defaultBrand ?? '',
    abwG: latest.abwG?.toString() ?? '',
    paramSource: 'iot',
  };
}

function SelectChip({
  label,
  selected,
  onPress,
  subtle,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  subtle?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.selectChip,
        selected && styles.selectChipSelected,
        subtle && styles.selectChipSubtle,
        selected && subtle && styles.selectChipSubtleSelected,
      ]}
    >
      <Text style={[styles.selectChipText, selected && styles.selectChipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function StatPill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'safe' | 'warning' | 'critical';
}) {
  return (
    <View
      style={[
        styles.pill,
        tone === 'safe' && styles.pillSafe,
        tone === 'warning' && styles.pillWarning,
        tone === 'critical' && styles.pillCritical,
      ]}
    >
      <Text
        style={[
          styles.pillText,
          tone === 'safe' && styles.pillTextSafe,
          tone === 'warning' && styles.pillTextWarning,
          tone === 'critical' && styles.pillTextCritical,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function WaterTile({
  title,
  value,
  unit,
  status,
  onPress,
  staleLabel,
  iot,
}: {
  title: string;
  value: string;
  unit: string;
  status: ParameterStatus;
  onPress: () => void;
  staleLabel?: string;
  iot?: boolean;
}) {
  const colors = getStatusColors(status);
  return (
    <Pressable onPress={onPress} style={[styles.waterTile, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <View style={styles.waterTileHeader}>
        <Text style={styles.waterTileLabel}>{title}</Text>
        {iot ? <Text style={styles.iotBadge}>IoT</Text> : null}
      </View>
      <Text style={[styles.waterTileValue, { color: colors.text }]}>{value}</Text>
      <Text style={styles.waterTileUnit}>{unit || 'Latest'}</Text>
      {staleLabel ? <Text style={styles.waterTileMeta}>{staleLabel}</Text> : <Text style={styles.waterTileMeta}>Tap for trend</Text>}
    </Pressable>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric';
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#92A2B0"
        multiline={multiline}
        keyboardType={keyboardType}
        style={[styles.textInput, multiline && styles.textArea]}
      />
    </View>
  );
}

export default function App() {
  const liveBackendEnabled = isLiveBackendConfigured();
  const [screen, setScreen] = useState<Screen>('splash');
  const [rootTab, setRootTab] = useState<RootTab>('ponds');
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('logs');
  const [trendKey, setTrendKey] = useState<ParameterKey>('ammoniaMgL');
  const [trendWindow, setTrendWindow] = useState<TrendWindow>(7);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileDraft, setProfileDraft] = useState<UserProfile>(DEFAULT_PROFILE);
  const [setupDraft, setSetupDraft] = useState<SetupDraft>(DEFAULT_SETUP);
  const [pondRecords, setPondRecords] = useState<PondRecord[]>([]);
  const [selectedPondId, setSelectedPondId] = useState('pond-east');
  const [dailyLogDraft, setDailyLogDraft] = useState<DailyLogDraft>(EMPTY_DAILY_LOG);
  const [closeCycleDraft, setCloseCycleDraft] = useState<CloseCycleDraft>(EMPTY_CLOSE_CYCLE);
  const [priceConfig, setPriceConfig] = useState<PriceConfig>(DEFAULT_PRICE_CONFIG);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(buildDefaultInventory());
  const [sessions, setSessions] = useState<Record<string, AquaSession>>({});
  const [chatInput, setChatInput] = useState('');
  const [chatPondId, setChatPondId] = useState('pond-east');
  const [liveSessionIds, setLiveSessionIds] = useState<Record<string, string>>({});
  const [csvPreview, setCsvPreview] = useState('');
  const [otpStep, setOtpStep] = useState<'phone' | 'verify' | 'profile'>('phone');
  const [otpCode, setOtpCode] = useState(liveBackendEnabled ? '' : '438921');
  const [reportCycleId, setReportCycleId] = useState<string | null>(null);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(
    `${getBackendModeLabel()}. ${liveBackendEnabled ? 'Phone OTP, pond data, and AquaGPT can sync live when Supabase is deployed.' : 'Add Supabase env keys to enable live auth and sync.'}`,
  );
  const streamingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      let nextScreen: Screen = 'auth';
      setBusyLabel('Booting AquaPrana');

      try {
        const cached = await loadCachedSnapshot();
        if (!cancelled && cached) {
          applySnapshot(cached);
          nextScreen = cached.pondRecords?.length ? 'home' : cached.profile ? 'pondSetup' : 'auth';
        }

        if (liveBackendEnabled) {
          const liveState = await bootstrapLiveAppState();
          if (!cancelled && liveState?.session) {
            applySnapshot({
              profile: liveState.profile ?? null,
              pondRecords: liveState.pondRecords ?? [],
              priceConfig: liveState.priceConfig ?? DEFAULT_PRICE_CONFIG,
              inventoryItems: liveState.inventoryItems ?? buildDefaultInventory(),
              sessions: liveState.sessions ?? {},
              selectedPondId: liveState.selectedPondId ?? liveState.pondRecords?.[0]?.pond?.id ?? 'pond-east',
              chatPondId: liveState.selectedPondId ?? liveState.pondRecords?.[0]?.pond?.id ?? 'pond-east',
            });
            setProfileDraft((current) => ({
              ...current,
              ...liveState.profile,
            }));
            setOtpStep(liveState.profile?.fullName ? 'phone' : 'profile');
            nextScreen = liveState.pondRecords?.length ? 'home' : liveState.profile?.fullName ? 'pondSetup' : 'auth';
            setStatusBanner('Live Supabase session restored.');
          } else if (!cancelled && liveState?.session === null) {
            setStatusBanner('Live backend ready. Sign in with your phone OTP to continue.');
          }
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unknown backend error';
          setStatusBanner(`Live backend unavailable: ${message}. Continuing with local state.`);
        }
      } finally {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        if (!cancelled) {
          setBusyLabel(null);
          setScreen(nextScreen);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (streamingTimer.current) {
        clearInterval(streamingTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!profile && pondRecords.length === 0) {
      return;
    }
    void saveCachedSnapshot({
      profile,
      pondRecords,
      priceConfig,
      inventoryItems,
      sessions,
      selectedPondId,
      chatPondId,
    });
  }, [profile, pondRecords, priceConfig, inventoryItems, sessions, selectedPondId, chatPondId]);

  const selectedRecord = pondRecords.find((record) => record.pond.id === selectedPondId);
  const activeCycle = getActiveCycle(selectedRecord);
  const latestLog = selectedRecord && activeCycle ? getLatestLog(selectedRecord, activeCycle.id) : undefined;
  const lowStockItems = inventoryItems.filter((item) => item.currentQty <= item.restockThreshold);

  function applySnapshot(snapshot: any) {
    setProfile(snapshot.profile ?? null);
    setPondRecords(snapshot.pondRecords ?? []);
    setPriceConfig(snapshot.priceConfig ?? DEFAULT_PRICE_CONFIG);
    setInventoryItems(snapshot.inventoryItems ?? buildDefaultInventory());
    setSessions(snapshot.sessions ?? {});
    setSelectedPondId(snapshot.selectedPondId ?? snapshot.pondRecords?.[0]?.pond?.id ?? 'pond-east');
    setChatPondId(snapshot.chatPondId ?? snapshot.selectedPondId ?? snapshot.pondRecords?.[0]?.pond?.id ?? 'pond-east');
    setDailyLogDraft(makeDraftFromLatest(snapshot.pondRecords?.[0]));
  }

  function setNumericSetup(field: keyof SetupDraft) {
    return (value: string) => setSetupDraft((current) => ({ ...current, [field]: value }));
  }

  function setNumericDaily(field: keyof DailyLogDraft) {
    return (value: string) => setDailyLogDraft((current) => ({ ...current, [field]: value }));
  }

  function setNumericClose(field: keyof CloseCycleDraft) {
    return (value: string) => setCloseCycleDraft((current) => ({ ...current, [field]: value }));
  }

  function updatePriceConfig(field: keyof Omit<PriceConfig, 'treatmentPrices'>, value: string) {
    const parsed = Number(value) || 0;
    setPriceConfig((current) => ({ ...current, [field]: parsed }));
  }

  async function handleSendOtp() {
    if (!liveBackendEnabled) {
      setOtpCode('438921');
      setOtpStep('verify');
      setStatusBanner('Demo OTP is 438921.');
      return;
    }

    try {
      setBusyLabel('Sending OTP');
      await sendOtp(profileDraft.phone);
      setOtpStep('verify');
      setStatusBanner('OTP sent through Supabase Auth. Enter the SMS code to continue.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OTP send failed';
      setStatusBanner(`Unable to send OTP: ${message}`);
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleVerifyOtp() {
    if (!liveBackendEnabled) {
      if (otpCode !== '438921') {
        setStatusBanner('Use 438921 while the app is in demo mode.');
        return;
      }
      setOtpStep('profile');
      return;
    }

    try {
      setBusyLabel('Verifying OTP');
      await verifyOtp(profileDraft.phone, otpCode);
      setOtpStep('profile');
      setStatusBanner('OTP verified. Complete the farmer profile to continue.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OTP verification failed';
      setStatusBanner(`Unable to verify OTP: ${message}`);
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleGetStarted() {
    setProfile(profileDraft);
    if (!liveBackendEnabled) {
      setScreen('pondSetup');
      return;
    }

    try {
      setBusyLabel('Saving profile');
      await upsertProfile(profileDraft);
      setStatusBanner('Profile synced to Supabase.');
      setScreen('pondSetup');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Profile sync failed';
      setStatusBanner(`Unable to save profile: ${message}`);
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleCaptureGps() {
    try {
      setBusyLabel('Capturing GPS');
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status === 'granted') {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setSetupDraft((current) => ({
          ...current,
          latitude: position.coords.latitude.toFixed(4),
          longitude: position.coords.longitude.toFixed(4),
        }));
        setStatusBanner('Live GPS coordinates captured from this device.');
      } else {
        setSetupDraft((current) => ({
          ...current,
          latitude: '16.5074',
          longitude: '80.6480',
        }));
        setStatusBanner('Location permission denied, so the fallback coordinates were used.');
      }
    } catch {
      setSetupDraft((current) => ({
        ...current,
        latitude: '16.5074',
        longitude: '80.6480',
      }));
      setStatusBanner('GPS capture failed, so the fallback coordinates were used.');
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleSavePondSetup() {
    if (liveBackendEnabled) {
      try {
        setBusyLabel('Creating pond and first cycle');
        await createMergedPondSetup(setupDraft, priceConfig, inventoryItems);
        const liveState = await bootstrapLiveAppState();
        if (liveState?.session) {
          applySnapshot({
            profile: liveState.profile ?? profileDraft,
            pondRecords: liveState.pondRecords ?? [],
            priceConfig: liveState.priceConfig ?? DEFAULT_PRICE_CONFIG,
            inventoryItems: liveState.inventoryItems ?? buildDefaultInventory(),
            sessions: liveState.sessions ?? {},
            selectedPondId: liveState.selectedPondId ?? liveState.pondRecords?.[0]?.pond?.id ?? 'pond-east',
            chatPondId: liveState.selectedPondId ?? liveState.pondRecords?.[0]?.pond?.id ?? 'pond-east',
          });
          setStatusBanner('Pond setup saved to Supabase.');
          setRootTab('ponds');
          setScreen('home');
          setBusyLabel(null);
          return;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Pond setup failed';
        setStatusBanner(`Unable to save pond setup live: ${message}. Demo portfolio was loaded locally.`);
      } finally {
        setBusyLabel(null);
      }
    }

    const nextPortfolio = buildPortfolioFromSetup(setupDraft);
    setPondRecords(nextPortfolio);
    setSelectedPondId(nextPortfolio[0].pond.id);
    setChatPondId(nextPortfolio[0].pond.id);
    setDailyLogDraft(makeDraftFromLatest(nextPortfolio[0]));
    setInventoryItems(buildDefaultInventory());
    setRootTab('ponds');
    setScreen('home');
  }

  function openDashboard(pondId: string) {
    setSelectedPondId(pondId);
    setDashboardTab('logs');
    setTrendKey('ammoniaMgL');
    setScreen('dashboard');
  }

  function openDailyLog() {
    setDailyLogDraft(makeDraftFromLatest(selectedRecord));
    setScreen('dailyLog');
  }

  async function handleSaveDailyLog() {
    if (!selectedRecord || !activeCycle) {
      return;
    }

    const mortalityCount = optionalNumber(dailyLogDraft.mortalityCount) ?? 0;
    const stockingCount = getStockingCount(selectedRecord, activeCycle);
    const previousMortality = getCumulativeMortality(selectedRecord, activeCycle.id);
    const survivalRate = stockingCount
      ? Math.max(0, ((stockingCount - previousMortality - mortalityCount) / stockingCount) * 100)
      : 0;
    const abw = optionalNumber(dailyLogDraft.abwG);
    const latestBiomass = getCurrentBiomass(selectedRecord, activeCycle);
    const biomass = abw ? round((stockingCount * abw * survivalRate) / 1000 / 100, 0) * 100 : latestBiomass;

    const log: PondLog = {
      id: `${selectedRecord.pond.id}-${activeCycle.id}-${Date.now()}`,
      pondId: selectedRecord.pond.id,
      cycleId: activeCycle.id,
      observedAt: combineDateAndTime(dailyLogDraft.observationDate, dailyLogDraft.observationTime),
      paramSource: dailyLogDraft.paramSource,
      doMgL: optionalNumber(dailyLogDraft.doMgL),
      ph: optionalNumber(dailyLogDraft.ph),
      tempC: optionalNumber(dailyLogDraft.tempC),
      salinityPpt: optionalNumber(dailyLogDraft.salinityPpt),
      ammoniaMgL: optionalNumber(dailyLogDraft.ammoniaMgL),
      turbidityCm: optionalNumber(dailyLogDraft.turbidityCm),
      calciumMgL: optionalNumber(dailyLogDraft.calciumMgL),
      magnesiumMgL: optionalNumber(dailyLogDraft.magnesiumMgL),
      potassiumMgL: optionalNumber(dailyLogDraft.potassiumMgL),
      feedQtyKg: optionalNumber(dailyLogDraft.feedQtyKg),
      feedBrand: dailyLogDraft.feedBrand || selectedRecord.feedingSchedule.defaultBrand,
      mortalityCount,
      treatment: dailyLogDraft.treatment || undefined,
      abwG: abw,
      biomassKg: biomass || undefined,
      notes: dailyLogDraft.notes || undefined,
    };

    setPondRecords((current) =>
      current.map((record) => {
        if (record.pond.id !== selectedRecord.pond.id) {
          return record;
        }
        return {
          ...record,
          logs: [log, ...record.logs],
        };
      }),
    );

    const nextInventoryItems = inventoryItems.map((item) => {
      let nextQty = item.currentQty;
      if (log.feedQtyKg && item.productName === log.feedBrand) {
        nextQty -= log.feedQtyKg;
      }
      if (log.treatment && item.productName === log.treatment) {
        nextQty -= 1;
      }
      return { ...item, currentQty: round(Math.max(0, nextQty), 1) };
    });

    setInventoryItems(nextInventoryItems);

    if (liveBackendEnabled) {
      try {
        setBusyLabel('Syncing pond log');
        await createDailyLog(log);
        await saveInventoryItems(nextInventoryItems);
        setStatusBanner('Daily log synced to Supabase.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Log sync failed';
        setStatusBanner(`Local log saved, but live sync failed: ${message}`);
      } finally {
        setBusyLabel(null);
      }
    }

    setDailyLogDraft(EMPTY_DAILY_LOG);
    setDashboardTab('logs');
    setScreen('dashboard');
  }

  async function handleCloseCycle() {
    if (!selectedRecord || !activeCycle) {
      return;
    }
    const survivalRate = getSurvivalRate(selectedRecord, activeCycle);
    const fcr = getRunningFcr(selectedRecord, activeCycle);
    const harvestWeight = optionalNumber(closeCycleDraft.harvestWeightKg) ?? getCurrentBiomass(selectedRecord, activeCycle);

    setPondRecords((current) =>
      current.map((record) => {
        if (record.pond.id !== selectedRecord.pond.id) {
          return record;
        }
        return {
          ...record,
          cycles: record.cycles.map((cycle) =>
            cycle.id === activeCycle.id
              ? {
                  ...cycle,
                  status: 'closed',
                  outcome: closeCycleDraft.outcome,
                  harvestWeightKg: harvestWeight,
                  actualHarvestDate: closeCycleDraft.actualHarvestDate,
                  failureReason: closeCycleDraft.outcome === 'Failed' ? closeCycleDraft.failureReason : undefined,
                  fcr,
                  survivalRate,
                  closedAt: closeCycleDraft.actualHarvestDate,
                  reportGeneratedAt: new Date().toISOString(),
                }
              : cycle,
          ),
        };
      }),
    );

    setReportCycleId(activeCycle.id);
    setReportGenerating(true);
    setScreen('report');
    if (liveBackendEnabled) {
      try {
        setBusyLabel('Closing cycle in Supabase');
        await closeCycleRemote(activeCycle.id, {
          outcome: closeCycleDraft.outcome,
          harvestWeightKg: harvestWeight,
          actualHarvestDate: closeCycleDraft.actualHarvestDate,
          failureReason: closeCycleDraft.outcome === 'Failed' ? closeCycleDraft.failureReason : undefined,
          fcr,
          survivalRate,
        });
        try {
          await requestCycleReport(activeCycle.id);
          setStatusBanner('Cycle closed and report endpoint invoked.');
        } catch {
          setStatusBanner('Cycle closed live. Report endpoint is wired but not yet deployed.');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Close cycle sync failed';
        setStatusBanner(`Cycle closed locally, but live sync failed: ${message}`);
      } finally {
        setBusyLabel(null);
      }
    }
    setTimeout(() => {
      setReportGenerating(false);
    }, 1800);
  }

  async function handleStartNewCycle() {
    if (!selectedRecord) {
      return;
    }
    const latestClosed = selectedRecord.cycles.find((cycle) => cycle.id === reportCycleId) ?? selectedRecord.cycles[0];
    const speciesConfig = findSpeciesConfig(latestClosed.species);
    const today = toIsoDate(APP_NOW);
    const newCycle: Cycle = {
      id: `${selectedRecord.pond.id}-cycle-${Date.now()}`,
      pondId: selectedRecord.pond.id,
      species: latestClosed.species,
      speciesCategory: latestClosed.speciesCategory,
      stockingDensity: latestClosed.stockingDensity,
      stockingDate: today,
      harvestWindowStart: addDaysToIso(today, speciesConfig.minDays),
      harvestWindowEnd: addDaysToIso(today, speciesConfig.maxDays),
      status: 'active',
      notes: 'New cycle opened from close-cycle flow.',
    };

    setPondRecords((current) =>
      current.map((record) => {
        if (record.pond.id !== selectedRecord.pond.id) {
          return record;
        }
        return {
          ...record,
          cycles: [newCycle, ...record.cycles],
          feedingSchedule: {
            ...record.feedingSchedule,
            cycleId: newCycle.id,
          },
        };
      }),
    );
    setReportCycleId(null);
    setCloseCycleDraft(EMPTY_CLOSE_CYCLE);
    setSelectedPondId(selectedRecord.pond.id);
    if (liveBackendEnabled) {
      try {
        setBusyLabel('Opening next cycle');
        await startNextCycleRemote(selectedRecord, latestClosed);
        const liveState = await bootstrapLiveAppState();
        if (liveState?.session) {
          applySnapshot({
            profile: liveState.profile ?? profileDraft,
            pondRecords: liveState.pondRecords ?? [],
            priceConfig: liveState.priceConfig ?? DEFAULT_PRICE_CONFIG,
            inventoryItems: liveState.inventoryItems ?? buildDefaultInventory(),
            sessions: liveState.sessions ?? {},
            selectedPondId: selectedRecord.pond.id,
            chatPondId: selectedRecord.pond.id,
          });
        }
        setStatusBanner('Next cycle opened in Supabase.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to start next cycle live';
        setStatusBanner(`Next cycle started locally, but live sync failed: ${message}`);
      } finally {
        setBusyLabel(null);
      }
    }
    setScreen('dashboard');
  }

  async function sendChatMessage(message: string) {
    const pondId = chatPondId || selectedPondId;
    const record = pondRecords.find((item) => item.pond.id === pondId);
    let response = generateAquaAdvice(message, record, profile?.language ?? 'English');
    setIsStreaming(true);

    const userMessage: AquaMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
    };
    const assistantId = `assistant-${Date.now() + 1}`;

    setSessions((current) => {
      const existing = current[pondId] ?? { pondId, messages: [] };
      const trimmedMessages = existing.messages.slice(-38);
      return {
        ...current,
        [pondId]: {
          pondId,
          messages: [...trimmedMessages, userMessage, { id: assistantId, role: 'assistant', content: '' }],
        },
      };
    });

    if (liveBackendEnabled) {
      try {
        const liveResponse = await sendAquaMessage({
          pondId,
          sessionId: liveSessionIds[pondId],
          message,
          language: profile?.language ?? 'English',
        });
        if (liveResponse?.reply) {
          response = liveResponse.reply;
        }
        if (liveResponse?.sessionId) {
          setLiveSessionIds((current) => ({ ...current, [pondId]: liveResponse.sessionId as string }));
        }
        setStatusBanner('AquaGPT response returned from the live edge function.');
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'AquaGPT edge function failed';
        setStatusBanner(`Live AquaGPT failed: ${messageText}. Falling back to the local advisor.`);
      }
    }

    const words = response.split(' ');
    let index = 0;
    if (streamingTimer.current) {
      clearInterval(streamingTimer.current);
    }
    streamingTimer.current = setInterval(() => {
      index += 1;
      const partial = words.slice(0, index).join(' ');
      setSessions((current) => {
        const existing = current[pondId] ?? { pondId, messages: [] };
        return {
          ...current,
          [pondId]: {
            pondId,
            messages: existing.messages.map((item) => (item.id === assistantId ? { ...item, content: partial } : item)),
          },
        };
      });
      if (index >= words.length && streamingTimer.current) {
        clearInterval(streamingTimer.current);
        streamingTimer.current = null;
        setIsStreaming(false);
      }
    }, 45);
  }

  const currentSession = sessions[chatPondId] ?? { pondId: chatPondId, messages: [] };
  const reportRecord = pondRecords.find((record) => record.cycles.some((cycle) => cycle.id === reportCycleId));
  const reportCycle = reportRecord?.cycles.find((cycle) => cycle.id === reportCycleId);

  function renderSplash() {
    return (
      <View style={styles.splashBody}>
        {/* Ripple rings */}
        <View style={styles.splashRippleWrap}>
          <View style={styles.splashRing1} />
          <View style={styles.splashRing2} />
          <View style={styles.splashRing3} />
          <View style={styles.splashLogoCircle}>
            <Image source={LOGO} style={styles.splashLogo} resizeMode="contain" />
          </View>
        </View>
        <Text style={styles.appWordmark}>AquaPrana</Text>
        <Text style={styles.splashTagline}>Life force for your ponds</Text>
        <Text style={styles.splashMeta}>AQUA AI Pvt Ltd</Text>
      </View>
    );
  }

  function renderAuth() {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screenBody}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <Text style={styles.eyebrow}>Onboarding</Text>
            <Text style={styles.heroTitle}>Field-first access in under a minute</Text>
            <Text style={styles.heroText}>
              AquaPassbook is the day-to-day operating console for AquaPrana farmers. Start with phone OTP, then finish the profile
              and first pond setup.
            </Text>
          </View>

          {otpStep === 'phone' ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Enter mobile number</Text>
              <Text style={styles.panelText}>We will send a one-time password to verify this farmer account.</Text>
              <FormField
                label="Phone number"
                value={profileDraft.phone}
                onChangeText={(value) => setProfileDraft((current) => ({ ...current, phone: value.replace(/[^0-9]/g, '') }))}
                keyboardType="numeric"
                placeholder="9876543210"
              />
              <Pressable style={styles.primaryButton} onPress={handleSendOtp}>
                <Text style={styles.primaryButtonText}>Send OTP</Text>
              </Pressable>
              <Text style={styles.footerHint}>By continuing you agree to AquaPrana Terms of Service.</Text>
            </View>
          ) : null}

          {otpStep === 'verify' ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Verify OTP</Text>
              <Text style={styles.panelText}>Sent to +91 {profileDraft.phone}</Text>
              <FormField label="OTP (6-digit)" value={otpCode} onChangeText={setOtpCode} keyboardType="numeric" />
              <View style={styles.inlineNotice}>
                <Text style={styles.inlineNoticeText}>
                  {liveBackendEnabled
                    ? 'This field uses the real SMS code issued by Supabase Auth.'
                    : 'Demo mode uses the fixed OTP 438921 so the flow stays testable without backend auth.'}
                </Text>
              </View>
              <Pressable style={styles.primaryButton} onPress={handleVerifyOtp}>
                <Text style={styles.primaryButtonText}>Verify and continue</Text>
              </Pressable>
            </View>
          ) : null}

          {otpStep === 'profile' ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Complete farmer profile</Text>
              <FormField
                label="Full name"
                value={profileDraft.fullName}
                onChangeText={(value) => setProfileDraft((current) => ({ ...current, fullName: value }))}
              />
              <Text style={styles.fieldLabel}>State</Text>
              <View style={styles.optionRow}>
                {STATE_OPTIONS.map((state) => (
                  <SelectChip
                    key={state}
                    label={state}
                    selected={profileDraft.state === state}
                    onPress={() =>
                      setProfileDraft((current) => ({
                        ...current,
                        state,
                        district: DISTRICTS_BY_STATE[state][0],
                      }))
                    }
                    subtle
                  />
                ))}
              </View>
              <Text style={styles.fieldLabel}>District</Text>
              <View style={styles.optionRow}>
                {(DISTRICTS_BY_STATE[profileDraft.state] ?? []).map((district) => (
                  <SelectChip
                    key={district}
                    label={district}
                    selected={profileDraft.district === district}
                    onPress={() => setProfileDraft((current) => ({ ...current, district }))}
                    subtle
                  />
                ))}
              </View>
              <Text style={styles.fieldLabel}>Language</Text>
              <View style={styles.optionRow}>
                {LANGUAGE_OPTIONS.map((language) => (
                  <SelectChip
                    key={language}
                    label={language}
                    selected={profileDraft.language === language}
                    onPress={() => setProfileDraft((current) => ({ ...current, language }))}
                  />
                ))}
              </View>
              <Pressable style={styles.primaryButton} onPress={handleGetStarted}>
                <Text style={styles.primaryButtonText}>Get Started</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  function renderPondSetup() {
    const speciesEntries = SPECIES_GROUPS.find((group) => group.category === setupDraft.speciesCategory)?.entries ?? SPECIES_GROUPS[0].entries;
    const speciesConfig = findSpeciesConfig(setupDraft.species);
    const harvestStart = addDaysToIso(setupDraft.stockingDate, speciesConfig.minDays);
    const harvestEnd = addDaysToIso(setupDraft.stockingDate, speciesConfig.maxDays);
    return (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topNavRow}>
          <Pressable style={styles.backLink} onPress={() => setScreen(profile ? 'home' : 'auth')}>
            <Text style={styles.backLinkText}>Back</Text>
          </Pressable>
        </View>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Pond Setup</Text>
          <Text style={styles.heroTitle}>One form. One save. Live dashboard.</Text>
          <Text style={styles.heroText}>
            The pond and first crop cycle open together, so there is never an empty pond state. This follows the v0.3 product rule from
            the spec.
          </Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Pond details</Text>
          <FormField label="Pond name" value={setupDraft.pondName} onChangeText={setNumericSetup('pondName')} />
          <View style={styles.doubleGrid}>
            <FormField
              label="Area (acres)"
              value={setupDraft.areaAcres}
              onChangeText={setNumericSetup('areaAcres')}
              keyboardType="numeric"
            />
            <FormField
              label="Depth (ft)"
              value={setupDraft.depthFt}
              onChangeText={setNumericSetup('depthFt')}
              keyboardType="numeric"
            />
          </View>
          <Pressable style={styles.secondaryButton} onPress={handleCaptureGps}>
            <Text style={styles.secondaryButtonText}>Capture GPS</Text>
          </Pressable>
          <Text style={styles.inlineMetric}>Lat {setupDraft.latitude} | Lng {setupDraft.longitude}</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Crop cycle</Text>
          <Text style={styles.fieldLabel}>Species category</Text>
          <View style={styles.optionRow}>
            {SPECIES_GROUPS.map((group) => (
              <SelectChip
                key={group.category}
                label={group.category}
                selected={setupDraft.speciesCategory === group.category}
                onPress={() =>
                  setSetupDraft((current) => ({
                    ...current,
                    speciesCategory: group.category,
                    species: group.entries[0].label,
                  }))
                }
                subtle
              />
            ))}
          </View>
          <Text style={styles.fieldLabel}>Species</Text>
          <View style={styles.optionRow}>
            {speciesEntries.map((entry) => (
              <SelectChip
                key={entry.label}
                label={entry.label}
                selected={setupDraft.species === entry.label}
                onPress={() => setSetupDraft((current) => ({ ...current, species: entry.label }))}
              />
            ))}
          </View>
          <View style={styles.doubleGrid}>
            <FormField
              label="Stocking density"
              value={setupDraft.stockingDensity}
              onChangeText={setNumericSetup('stockingDensity')}
              keyboardType="numeric"
              placeholder="10"
            />
            <FormField label="Stocking date" value={setupDraft.stockingDate} onChangeText={setNumericSetup('stockingDate')} />
          </View>
          <View style={styles.harvestPreview}>
            <Text style={styles.harvestLabel}>Harvest window (auto)</Text>
            <Text style={styles.harvestValue}>
              {formatShortDate(harvestStart)} - {formatShortDate(harvestEnd)}
            </Text>
          </View>
          <FormField label="Notes" value={setupDraft.notes} onChangeText={setNumericSetup('notes')} multiline placeholder="Seed source, pond prep, initial observations" />
        </View>

        <Pressable style={styles.primaryButton} onPress={handleSavePondSetup}>
          <Text style={styles.primaryButtonText}>Save pond and start cycle</Text>
        </Pressable>
      </ScrollView>
    );
  }

  function renderHome() {
    if (rootTab === 'aquagpt') {
      return renderAquaGpt();
    }
    if (rootTab === 'profile') {
      return renderProfile();
    }

    return (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.homeHero}>
          <View>
            <Text style={styles.eyebrow}>AquaPassbook</Text>
            <Text style={styles.heroTitle}>Good morning, {profile?.fullName.split(' ')[0] ?? 'Farmer'}</Text>
            <Text style={styles.heroText}>All active ponds, alerts, biomass and cycle readiness at a glance.</Text>
          </View>
          <Pressable style={styles.secondaryButton} onPress={() => setScreen('pondSetup')}>
            <Text style={styles.secondaryButtonText}>Add Pond</Text>
          </Pressable>
        </View>

        {pondRecords.map((record) => {
          const cycle = getActiveCycle(record);
          if (!cycle) {
            return null;
          }
          const latest = getLatestLog(record, cycle.id);
          const harvest = getHarvestStatus(cycle);
          const biomass = getCurrentBiomass(record, cycle);
          const survival = getSurvivalRate(record, cycle);
          const alertStatuses = (['doMgL', 'ph', 'tempC', 'salinityPpt', 'ammoniaMgL', 'calciumMgL', 'magnesiumMgL', 'potassiumMgL'] as ParameterKey[]).map((key) =>
            getParameterStatus(key, latest?.[key], latest?.observedAt, cycle.species),
          );
          const critical = alertStatuses.includes('critical');
          const warning = !critical && alertStatuses.some((status) => status === 'warning' || status === 'stale');
          return (
            <Pressable key={record.pond.id} style={styles.pondCard} onPress={() => openDashboard(record.pond.id)}>
              <View style={styles.pondCardTop}>
                <View>
                  <Text style={styles.pondCardTitle}>{record.pond.name}</Text>
                  <Text style={styles.pondCardSub}>{cycle.species}</Text>
                </View>
                <StatPill label={critical ? 'Critical' : warning ? 'Watch' : 'Stable'} tone={critical ? 'critical' : warning ? 'warning' : 'safe'} />
              </View>
              <Text style={styles.pondCardStatus}>Day {getCycleDay(cycle)} | {harvest.label}</Text>
              <View style={styles.metricRow}>
                <View>
                  <Text style={styles.metricValue}>{biomass} kg</Text>
                  <Text style={styles.metricLabel}>Biomass</Text>
                </View>
                <View>
                  <Text style={styles.metricValue}>{survival}%</Text>
                  <Text style={styles.metricLabel}>Survival</Text>
                </View>
                <View>
                  <Text style={styles.metricValue}>{latest ? `${hoursSince(latest.observedAt)}h ago` : 'No log'}</Text>
                  <Text style={styles.metricLabel}>Last log</Text>
                </View>
              </View>
            </Pressable>
          );
        })}

        <View style={styles.inlineNotice}>
          <Text style={styles.inlineNoticeText}>
            The home cards are intentionally summary-only. All logging and detailed review happen inside each pond dashboard, matching the
            v0.3 workflow.
          </Text>
        </View>
      </ScrollView>
    );
  }

  function renderDashboard() {
    if (!selectedRecord || !activeCycle) {
      return (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.heroTitle}>No active cycle</Text>
          <Text style={styles.heroText}>This pond has no live cycle. Start a new cycle to unlock daily logs, trends, and AquaGPT context.</Text>
          <Pressable style={styles.primaryButton} onPress={handleStartNewCycle}>
            <Text style={styles.primaryButtonText}>Start new cycle</Text>
          </Pressable>
        </ScrollView>
      );
    }

    const latest = latestLog;
    const harvest = getHarvestStatus(activeCycle);
    const biomass = getCurrentBiomass(selectedRecord, activeCycle);
    const survival = getSurvivalRate(selectedRecord, activeCycle);
    const fcr = getRunningFcr(selectedRecord, activeCycle);
    const recommendedFeed = getRecommendedFeed(selectedRecord, activeCycle, selectedRecord.feedingSchedule);
    const expense = getExpenseSummary(selectedRecord, activeCycle, priceConfig);
    const parameters: ParameterKey[] = ['doMgL', 'ph', 'ammoniaMgL', 'tempC', 'salinityPpt', 'calciumMgL', 'magnesiumMgL', 'potassiumMgL'];

    return (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topNavRow}>
          <Pressable style={styles.backLink} onPress={() => setScreen('home')}>
            <Text style={styles.backLinkText}>Back to ponds</Text>
          </Pressable>
        </View>

        <View style={styles.identityCard}>
          <View style={styles.identityHeader}>
            <View>
              <Text style={styles.identityTitle}>{selectedRecord.pond.name}</Text>
              <Text style={styles.identitySub}>{activeCycle.species} | Day {getCycleDay(activeCycle)}</Text>
            </View>
            <StatPill label={activeCycle.status === 'active' ? 'Active' : 'Closed'} tone={activeCycle.status === 'active' ? 'safe' : 'neutral'} />
          </View>
          <Text style={[styles.identityHarvest, harvest.tone === 'critical' && { color: BRAND.critical }]}>
            {harvest.label}
          </Text>
          <Text style={styles.identityMeta}>
            Stocking date {formatDate(activeCycle.stockingDate)} | Harvest window {formatShortDate(activeCycle.harvestWindowStart)} to{' '}
            {formatShortDate(activeCycle.harvestWindowEnd)}
          </Text>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Water quality vitals</Text>
          <Text style={styles.sectionHint}>Tap a tile to open its trend view</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tileScroller}>
          {parameters.map((key) => {
            const value = latest?.[key];
            const status = getParameterStatus(key, value, latest?.observedAt, activeCycle.species);
            return (
              <WaterTile
                key={key}
                title={PARAMETER_META[key].label}
                value={typeof value === 'number' ? `${value}` : '--'}
                unit={PARAMETER_META[key].unit}
                status={status}
                staleLabel={status === 'stale' ? 'Stale >24h' : undefined}
                iot={latest?.paramSource === 'iot' && ['ph', 'salinityPpt', 'ammoniaMgL', 'calciumMgL', 'magnesiumMgL', 'potassiumMgL'].includes(key)}
                onPress={() => {
                  setTrendKey(key);
                  setDashboardTab('trends');
                }}
              />
            );
          })}
        </ScrollView>

        <View style={styles.metricsCard}>
          <Text style={styles.sectionTitle}>Growth and production</Text>
          <View style={styles.metricGrid}>
            <View style={styles.metricStat}>
              <Text style={styles.metricBig}>{getLastAbw(selectedRecord, activeCycle.id) ?? '--'}g</Text>
              <Text style={styles.metricLabel}>ABW</Text>
            </View>
            <View style={styles.metricStat}>
              <Text style={styles.metricBig}>{biomass}kg</Text>
              <Text style={styles.metricLabel}>Biomass</Text>
            </View>
            <View style={styles.metricStat}>
              <Text style={styles.metricBig}>{survival}%</Text>
              <Text style={styles.metricLabel}>Survival</Text>
            </View>
            <View style={styles.metricStat}>
              <Text style={styles.metricBig}>{fcr}</Text>
              <Text style={styles.metricLabel}>Running FCR</Text>
            </View>
            <View style={styles.metricStat}>
              <Text style={styles.metricBig}>{getCumulativeFeed(selectedRecord, activeCycle.id)}kg</Text>
              <Text style={styles.metricLabel}>Feed total</Text>
            </View>
            <View style={styles.metricStat}>
              <Text style={styles.metricBig}>{getCumulativeMortality(selectedRecord, activeCycle.id)}</Text>
              <Text style={styles.metricLabel}>Mortality</Text>
            </View>
          </View>
        </View>

        <View style={styles.insightGrid}>
          <View style={styles.insightCard}>
            <Text style={styles.sectionTitle}>Feeding schedule</Text>
            <Text style={styles.feedBig}>{recommendedFeed} kg/day</Text>
            <Text style={styles.sectionHint}>
              {selectedRecord.feedingSchedule.intervalRule === 'pct_biomass' ? 'Auto-derived from biomass' : 'Fixed quantity'} |{' '}
              {selectedRecord.feedingSchedule.feedsPerDay} feeds/day
            </Text>
            <Text style={styles.inlineMetric}>{selectedRecord.feedingSchedule.feedTimes.join(' | ')}</Text>
          </View>
          <View style={styles.insightCard}>
            <Text style={styles.sectionTitle}>Running cost</Text>
            <Text style={styles.feedBig}>Rs {expense.totalCost}</Text>
            <Text style={styles.sectionHint}>
              Feed Rs {expense.feedCost} | Labour Rs {expense.labourCost}
            </Text>
            <Text style={styles.inlineMetric}>Cost per kg now Rs {expense.costPerKg}</Text>
          </View>
        </View>

        <View style={styles.insightCard}>
          <Text style={styles.sectionTitle}>Inventory watch</Text>
          {lowStockItems.length ? (
            lowStockItems.map((item) => (
              <View key={item.id} style={styles.inventoryRow}>
                <View>
                  <Text style={styles.inventoryTitle}>{item.productName}</Text>
                  <Text style={styles.inventoryMeta}>
                    {item.currentQty} {item.unit} left | threshold {item.restockThreshold}
                  </Text>
                </View>
                <StatPill label="Restock" tone="critical" />
              </View>
            ))
          ) : (
            <Text style={styles.panelText}>No low-stock alerts right now.</Text>
          )}
        </View>

        <View style={styles.actionBar}>
          <Pressable style={styles.primaryButtonCompact} onPress={openDailyLog}>
            <Text style={styles.primaryButtonText}>Log Today</Text>
          </Pressable>
          <View style={styles.lastLogCard}>
            <Text style={styles.lastLogLabel}>{latest ? `Last log ${hoursSince(latest.observedAt)}h ago` : 'No log today'}</Text>
            <View style={styles.actionLinks}>
              <Pressable onPress={() => {
                setRootTab('aquagpt');
                setScreen('home');
              }}>
                <Text style={styles.actionLinkText}>Ask AquaGPT</Text>
              </Pressable>
              <Pressable onPress={() => setScreen('closeCycle')}>
                <Text style={styles.actionLinkText}>Close cycle</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.tabRow}>
          {(['logs', 'trends', 'cycles'] as DashboardTab[]).map((tab) => (
            <SelectChip key={tab} label={tab === 'logs' ? 'Logs' : tab === 'trends' ? 'Trends' : 'Cycles'} selected={dashboardTab === tab} onPress={() => setDashboardTab(tab)} />
          ))}
        </View>

        {dashboardTab === 'logs' ? renderLogsTab() : null}
        {dashboardTab === 'trends' ? renderTrendsTab() : null}
        {dashboardTab === 'cycles' ? renderCyclesTab() : null}
      </ScrollView>
    );
  }

  function renderLogsTab() {
    if (!selectedRecord || !activeCycle) {
      return null;
    }
    const logs = getLogsForCycle(selectedRecord, activeCycle.id);
    return (
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Recent logs</Text>
        {logs.slice(0, 8).map((log) => (
          <View key={log.id} style={styles.logRow}>
            <View style={styles.logTime}>
              <Text style={styles.logTimeDate}>{formatDateTime(log.observedAt)}</Text>
              <Text style={styles.logTimeMeta}>{log.paramSource === 'iot' ? 'IoT assisted' : 'Manual entry'}</Text>
            </View>
            <View style={styles.logSummary}>
              <Text style={styles.logSummaryText}>
                DO {log.doMgL ?? '--'} | pH {log.ph ?? '--'} | NH3 {log.ammoniaMgL ?? '--'} | Feed {log.feedQtyKg ?? '--'}kg | ABW {log.abwG ?? '--'}g
              </Text>
              {log.notes ? <Text style={styles.logNote}>{log.notes}</Text> : null}
            </View>
          </View>
        ))}
      </View>
    );
  }

  function renderTrendsTab() {
    if (!selectedRecord || !activeCycle) {
      return null;
    }
    const logs = getLogsForCycle(selectedRecord, activeCycle.id)
      .filter((log) => typeof log[trendKey] === 'number')
      .slice(0, trendWindow)
      .reverse();

    const values = logs.map((log) => Number(log[trendKey] ?? 0));
    const peak = Math.max(...values, 1);
    const csv = buildCsvPreview(selectedRecord, activeCycle);
    return (
      <View style={styles.panel}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Parameter trends</Text>
          <Pressable
            onPress={() => setCsvPreview((current) => (current ? '' : csv))}
            style={styles.inlineAction}
          >
            <Text style={styles.inlineActionText}>{csvPreview ? 'Hide CSV' : 'Export CSV'}</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>
          {(Object.keys(PARAMETER_META) as ParameterKey[]).map((key) => (
            <SelectChip key={key} label={PARAMETER_META[key].label} selected={trendKey === key} onPress={() => setTrendKey(key)} subtle />
          ))}
        </ScrollView>
        <View style={styles.optionRow}>
          {[7, 14, 30].map((windowSize) => (
            <SelectChip
              key={windowSize}
              label={`${windowSize}D`}
              selected={trendWindow === windowSize}
              onPress={() => setTrendWindow(windowSize as TrendWindow)}
            />
          ))}
        </View>
        <Text style={styles.sectionHint}>Safe band {PARAMETER_META[trendKey].safeLabel}</Text>
        <View style={styles.chartCard}>
          {logs.length < 2 ? (
            <Text style={styles.panelText}>Log more data to see trends.</Text>
          ) : (
            <View style={styles.chartBars}>
              {logs.map((log, index) => {
                const value = Number(log[trendKey] ?? 0);
                const height = 40 + Math.round((value / peak) * 120);
                const status = getParameterStatus(trendKey, value, log.observedAt, activeCycle.species);
                return (
                  <View key={`${log.id}-${index}`} style={styles.chartBarWrap}>
                    <View style={[styles.chartBar, { height, backgroundColor: getStatusColors(status).text }]} />
                    <Text style={styles.chartValue}>{value}</Text>
                    <Text style={styles.chartLabel}>{formatShortDate(log.observedAt.slice(0, 10))}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
        {csvPreview ? (
          <View style={styles.csvBox}>
            <Text style={styles.csvText}>{csvPreview}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  function renderCyclesTab() {
    if (!selectedRecord) {
      return null;
    }
    const cycles = [...selectedRecord.cycles].sort((left, right) => fromIsoDate(right.stockingDate).getTime() - fromIsoDate(left.stockingDate).getTime());
    return (
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Cycle history</Text>
        {cycles.map((cycle) => (
          <View key={cycle.id} style={styles.cycleRow}>
            <View>
              <Text style={styles.inventoryTitle}>
                {cycle.species} | {formatDate(cycle.stockingDate)}
              </Text>
              <Text style={styles.inventoryMeta}>
                {cycle.status === 'active'
                  ? `Active | Day ${getCycleDay(cycle)}`
                  : `Closed | ${cycle.outcome ?? 'Completed'} | ${cycle.harvestWeightKg ?? '--'} kg`}
              </Text>
            </View>
            {cycle.status === 'closed' ? (
              <Pressable
                style={styles.inlineAction}
                onPress={() => {
                  setReportCycleId(cycle.id);
                  setReportGenerating(false);
                  setScreen('report');
                }}
              >
                <Text style={styles.inlineActionText}>Report</Text>
              </Pressable>
            ) : (
              <StatPill label="Active" tone="safe" />
            )}
          </View>
        ))}
      </View>
    );
  }

  function renderDailyLog() {
    const estimatedBiomass =
      selectedRecord && activeCycle && optionalNumber(dailyLogDraft.abwG)
        ? round(
            (getStockingCount(selectedRecord, activeCycle) *
              Number(dailyLogDraft.abwG) *
              Math.max(
                0,
                ((getStockingCount(selectedRecord, activeCycle) -
                  getCumulativeMortality(selectedRecord, activeCycle.id) -
                  (optionalNumber(dailyLogDraft.mortalityCount) ?? 0)) /
                  getStockingCount(selectedRecord, activeCycle)) *
                  100,
              )) /
              1000 /
              100,
            0,
          ) * 100
        : selectedRecord && activeCycle
          ? getCurrentBiomass(selectedRecord, activeCycle)
          : 0;

    return (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topNavRow}>
          <Pressable style={styles.backLink} onPress={() => setScreen('dashboard')}>
            <Text style={styles.backLinkText}>Back to dashboard</Text>
          </Pressable>
          <Text style={styles.navActionText}>Save rule: partial logs allowed</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Log entry</Text>
          <Text style={styles.sectionHint}>Water quality plus farm management in one save.</Text>
          <View style={styles.doubleGrid}>
            <FormField label="Observation date" value={dailyLogDraft.observationDate} onChangeText={setNumericDaily('observationDate')} />
            <FormField label="Observation time" value={dailyLogDraft.observationTime} onChangeText={setNumericDaily('observationTime')} />
          </View>
          <View style={styles.optionRow}>
            <SelectChip
              label="Manual"
              selected={dailyLogDraft.paramSource === 'manual'}
              onPress={() => setDailyLogDraft((current) => ({ ...current, paramSource: 'manual' }))}
            />
            <SelectChip
              label="IoT synced"
              selected={dailyLogDraft.paramSource === 'iot'}
              onPress={() => setDailyLogDraft((current) => ({ ...current, paramSource: 'iot' }))}
            />
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Water quality</Text>
          <View style={styles.doubleGrid}>
            <FormField label="DO (mg/L)" value={dailyLogDraft.doMgL} onChangeText={setNumericDaily('doMgL')} keyboardType="numeric" />
            <FormField label="pH" value={dailyLogDraft.ph} onChangeText={setNumericDaily('ph')} keyboardType="numeric" />
            <FormField label="Temp (C)" value={dailyLogDraft.tempC} onChangeText={setNumericDaily('tempC')} keyboardType="numeric" />
            <FormField label="Salinity (ppt)" value={dailyLogDraft.salinityPpt} onChangeText={setNumericDaily('salinityPpt')} keyboardType="numeric" />
            <FormField label="Ammonia" value={dailyLogDraft.ammoniaMgL} onChangeText={setNumericDaily('ammoniaMgL')} keyboardType="numeric" />
            <FormField label="Turbidity" value={dailyLogDraft.turbidityCm} onChangeText={setNumericDaily('turbidityCm')} keyboardType="numeric" />
            <FormField label="Calcium" value={dailyLogDraft.calciumMgL} onChangeText={setNumericDaily('calciumMgL')} keyboardType="numeric" />
            <FormField label="Magnesium" value={dailyLogDraft.magnesiumMgL} onChangeText={setNumericDaily('magnesiumMgL')} keyboardType="numeric" />
            <FormField label="Potassium" value={dailyLogDraft.potassiumMgL} onChangeText={setNumericDaily('potassiumMgL')} keyboardType="numeric" />
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Farm management</Text>
          <View style={styles.doubleGrid}>
            <FormField label="Feed qty (kg)" value={dailyLogDraft.feedQtyKg} onChangeText={setNumericDaily('feedQtyKg')} keyboardType="numeric" />
            <FormField label="Feed brand" value={dailyLogDraft.feedBrand} onChangeText={setNumericDaily('feedBrand')} />
            <FormField label="Mortality count" value={dailyLogDraft.mortalityCount} onChangeText={setNumericDaily('mortalityCount')} keyboardType="numeric" />
            <FormField label="ABW sample (g)" value={dailyLogDraft.abwG} onChangeText={setNumericDaily('abwG')} keyboardType="numeric" />
          </View>
          <FormField label="Treatment applied" value={dailyLogDraft.treatment} onChangeText={setNumericDaily('treatment')} />
          <FormField label="Notes" value={dailyLogDraft.notes} onChangeText={setNumericDaily('notes')} multiline />
          <View style={styles.biomasPreviewCard}>
            <Text style={styles.harvestLabel}>Biomass preview</Text>
            <Text style={styles.harvestValue}>{estimatedBiomass} kg</Text>
            <Text style={styles.sectionHint}>Auto-calculated on save from stocking count, ABW and current survival.</Text>
          </View>
        </View>

        <Pressable style={styles.primaryButton} onPress={handleSaveDailyLog}>
          <Text style={styles.primaryButtonText}>Save log entry</Text>
        </Pressable>
      </ScrollView>
    );
  }

  function renderCloseCycle() {
    if (!selectedRecord || !activeCycle) {
      return null;
    }
    const expense = getExpenseSummary(selectedRecord, activeCycle, priceConfig);
    return (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topNavRow}>
          <Pressable style={styles.backLink} onPress={() => setScreen('dashboard')}>
            <Text style={styles.backLinkText}>Back to dashboard</Text>
          </Pressable>
        </View>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Close Cycle</Text>
          <Text style={styles.heroTitle}>Lock the cycle, then generate the report</Text>
          <Text style={styles.heroText}>
            On close, logs become read-only and the cycle report becomes shareable. This matches the product document flow.
          </Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Cycle summary</Text>
          <Text style={styles.inventoryMeta}>
            Duration {getCycleDay(activeCycle)} days | Biomass {getCurrentBiomass(selectedRecord, activeCycle)} kg | Running FCR {getRunningFcr(selectedRecord, activeCycle)}
          </Text>
          <Text style={styles.inventoryMeta}>Current cycle cost Rs {expense.totalCost}</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Harvest details</Text>
          <View style={styles.optionRow}>
            {(['Successful', 'Failed'] as CycleOutcome[]).map((outcome) => (
              <SelectChip
                key={outcome}
                label={outcome}
                selected={closeCycleDraft.outcome === outcome}
                onPress={() => setCloseCycleDraft((current) => ({ ...current, outcome }))}
              />
            ))}
          </View>
          <View style={styles.doubleGrid}>
            <FormField
              label="Harvest weight (kg)"
              value={closeCycleDraft.harvestWeightKg}
              onChangeText={setNumericClose('harvestWeightKg')}
              keyboardType="numeric"
            />
            <FormField label="Harvest date" value={closeCycleDraft.actualHarvestDate} onChangeText={setNumericClose('actualHarvestDate')} />
          </View>
          {closeCycleDraft.outcome === 'Failed' ? (
            <FormField label="Failure reason" value={closeCycleDraft.failureReason} onChangeText={setNumericClose('failureReason')} multiline />
          ) : null}
        </View>

        <Pressable style={styles.primaryButton} onPress={handleCloseCycle}>
          <Text style={styles.primaryButtonText}>Close cycle and generate report</Text>
        </Pressable>
      </ScrollView>
    );
  }

  function renderReport() {
    if (!reportRecord || !reportCycle) {
      return (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.panelText}>No report selected yet.</Text>
        </ScrollView>
      );
    }
    const expense = getExpenseSummary(reportRecord, reportCycle, priceConfig);
    const activeLogs = getLogsForCycle(reportRecord, reportCycle.id);
    return (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topNavRow}>
          <Pressable style={styles.backLink} onPress={() => setScreen('dashboard')}>
            <Text style={styles.backLinkText}>Back</Text>
          </Pressable>
        </View>
        <View style={styles.reportHero}>
          <Image source={LOGO} style={styles.reportLogo} resizeMode="contain" />
          <View>
            <Text style={styles.heroTitle}>Cycle Report</Text>
            <Text style={styles.heroText}>
              {reportRecord.pond.name} | {reportCycle.species} | Generated {formatDate(toIsoDate(APP_NOW))}
            </Text>
          </View>
        </View>

        {reportGenerating ? (
          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Generating cycle report...</Text>
            <Text style={styles.reportStep}>Compiling water quality data</Text>
            <Text style={styles.reportStep}>Calculating production outcomes</Text>
            <Text style={styles.reportStep}>Building expense summary</Text>
            <Text style={styles.reportStep}>Preparing PDF payload</Text>
          </View>
        ) : (
          <>
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>1. Cycle summary</Text>
              <Text style={styles.reportLine}>Pond: {reportRecord.pond.name}</Text>
              <Text style={styles.reportLine}>Species: {reportCycle.species}</Text>
              <Text style={styles.reportLine}>Stocking date: {formatDate(reportCycle.stockingDate)}</Text>
              <Text style={styles.reportLine}>Close date: {reportCycle.actualHarvestDate ? formatDate(reportCycle.actualHarvestDate) : '--'}</Text>
              <Text style={styles.reportLine}>Outcome: {reportCycle.outcome ?? 'Completed'}</Text>
            </View>

            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>2. Production outcomes</Text>
              <Text style={styles.reportLine}>Stocked count: {getStockingCount(reportRecord, reportCycle)}</Text>
              <Text style={styles.reportLine}>Harvest weight: {reportCycle.harvestWeightKg ?? '--'} kg</Text>
              <Text style={styles.reportLine}>Final biomass: {getCurrentBiomass(reportRecord, reportCycle)} kg</Text>
              <Text style={styles.reportLine}>Survival: {reportCycle.survivalRate ?? getSurvivalRate(reportRecord, reportCycle)}%</Text>
              <Text style={styles.reportLine}>Final FCR: {reportCycle.fcr ?? getRunningFcr(reportRecord, reportCycle)}</Text>
            </View>

            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>3. Water quality summary</Text>
              <Text style={styles.reportLine}>Logs captured: {activeLogs.length}</Text>
              <Text style={styles.reportLine}>
                Last parameters: DO {activeLogs[0]?.doMgL ?? '--'} | pH {activeLogs[0]?.ph ?? '--'} | NH3 {activeLogs[0]?.ammoniaMgL ?? '--'}
              </Text>
              <Text style={styles.reportLine}>Stale periods flagged when readings are older than 24h.</Text>
            </View>

            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>4. Feed and expense summary</Text>
              <Text style={styles.reportLine}>Total feed: {getCumulativeFeed(reportRecord, reportCycle.id)} kg</Text>
              <Text style={styles.reportLine}>Feed cost: Rs {expense.feedCost}</Text>
              <Text style={styles.reportLine}>Seed cost: Rs {expense.seedCost}</Text>
              <Text style={styles.reportLine}>Treatment cost: Rs {expense.treatmentCost}</Text>
              <Text style={styles.reportLine}>Labour cost: Rs {expense.labourCost}</Text>
              <Text style={styles.reportLine}>Cost/kg produced: Rs {expense.costPerKg}</Text>
            </View>

            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>5. Full log table</Text>
              {activeLogs.slice(0, 5).map((log) => (
                <Text key={log.id} style={styles.reportLine}>
                  {formatDateTime(log.observedAt)} | DO {log.doMgL ?? '--'} | pH {log.ph ?? '--'} | Feed {log.feedQtyKg ?? '--'} | ABW {log.abwG ?? '--'} | Notes {log.notes ?? 'Not recorded'}
                </Text>
              ))}
            </View>

            <View style={styles.inlineNotice}>
              <Text style={styles.inlineNoticeText}>
                This report screen mirrors the PDF payload structure from the spec. In this prototype, the report is viewable in-app and ready
                for a backend PDF export hook.
              </Text>
            </View>
          </>
        )}

        <Pressable style={styles.primaryButton} onPress={handleStartNewCycle}>
          <Text style={styles.primaryButtonText}>Start new cycle</Text>
        </Pressable>
      </ScrollView>
    );
  }

  function renderAquaGpt() {
    const pondId = chatPondId || selectedPondId || pondRecords[0]?.pond.id || '';
    const selectedChatRecord = pondRecords.find((record) => record.pond.id === pondId);
    const suggestions = getSuggestedQuestions(selectedChatRecord);
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screenBody}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.homeHero}>
            <View>
              <Text style={styles.eyebrow}>AquaGPT</Text>
              <Text style={styles.heroTitle}>Pond-aware advisory</Text>
              <Text style={styles.heroText}>Built from the v0.3 AquaGPT spec: pond context, session memory, and streaming replies.</Text>
            </View>
          </View>

          <Text style={styles.fieldLabel}>Pond context</Text>
          <View style={styles.optionRow}>
            {pondRecords.map((record) => (
              <SelectChip key={record.pond.id} label={record.pond.name} selected={pondId === record.pond.id} onPress={() => setChatPondId(record.pond.id)} subtle />
            ))}
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Suggested questions</Text>
            <View style={styles.optionColumn}>
              {suggestions.map((suggestion) => (
                <Pressable key={suggestion} style={styles.questionChip} onPress={() => void sendChatMessage(suggestion)}>
                  <Text style={styles.questionChipText}>{suggestion}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Session</Text>
            {currentSession.messages.length === 0 ? (
              <Text style={styles.panelText}>New session. Ask about ammonia, harvest timing, FCR, or feed adjustments.</Text>
            ) : null}
            {currentSession.messages.map((message) => (
              <View key={message.id} style={[styles.chatBubble, message.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAssistant]}>
                <Text style={[styles.chatRole, message.role === 'user' && styles.chatRoleUser]}>{message.role === 'user' ? 'Farmer' : 'AquaGPT'}</Text>
                <Text style={[styles.chatText, message.role === 'user' && styles.chatTextUser]}>{message.content}</Text>
              </View>
            ))}
            {isStreaming ? <Text style={styles.sectionHint}>Streaming response...</Text> : null}
          </View>

          <View style={styles.panel}>
            <FormField label="Message" value={chatInput} onChangeText={setChatInput} multiline placeholder="Ask about ammonia, feed, harvest, or survival" />
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                if (chatInput.trim().length < 3 || isStreaming) {
                  return;
                }
                const message = chatInput.trim();
                setChatInput('');
                void sendChatMessage(message);
              }}
            >
              <Text style={styles.primaryButtonText}>Send to AquaGPT</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  function renderProfile() {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.homeHero}>
          <View>
            <Text style={styles.eyebrow}>Profile</Text>
            <Text style={styles.heroTitle}>{profile?.fullName ?? DEFAULT_PROFILE.fullName}</Text>
            <Text style={styles.heroText}>
              Farmer profile, reusable price configuration, and inventory controls for the Phase 1 MVP modules.
            </Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Farmer profile</Text>
          <Text style={styles.reportLine}>State: {profile?.state ?? DEFAULT_PROFILE.state}</Text>
          <Text style={styles.reportLine}>District: {profile?.district ?? DEFAULT_PROFILE.district}</Text>
          <Text style={styles.reportLine}>Language: {profile?.language ?? DEFAULT_PROFILE.language}</Text>
          <Text style={styles.reportLine}>Phone: +91 {profile?.phone ?? DEFAULT_PROFILE.phone}</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Price configuration</Text>
          <View style={styles.doubleGrid}>
            <FormField label="Feed price (Rs/kg)" value={String(priceConfig.feedPricePerKg)} onChangeText={(value) => updatePriceConfig('feedPricePerKg', value)} keyboardType="numeric" />
            <FormField
              label="Seed price (Rs/1000)"
              value={String(priceConfig.seedPricePerThousand)}
              onChangeText={(value) => updatePriceConfig('seedPricePerThousand', value)}
              keyboardType="numeric"
            />
            <FormField
              label="Labour cost/day"
              value={String(priceConfig.labourCostPerDay)}
              onChangeText={(value) => updatePriceConfig('labourCostPerDay', value)}
              keyboardType="numeric"
            />
          </View>
          <Text style={styles.sectionHint}>
            Treatments: {priceConfig.treatmentPrices.map((entry) => `${entry.name} Rs ${entry.price}`).join(' | ')}
          </Text>
          <Pressable
            style={styles.inlineAction}
            onPress={() => {
              if (!liveBackendEnabled) {
                setStatusBanner('Price config is stored locally in demo mode.');
                return;
              }
              void (async () => {
                try {
                  setBusyLabel('Syncing price config');
                  await savePriceConfig(priceConfig);
                  setStatusBanner('Price config synced to Supabase.');
                } catch (error) {
                  const message = error instanceof Error ? error.message : 'Price config sync failed';
                  setStatusBanner(`Unable to sync price config: ${message}`);
                } finally {
                  setBusyLabel(null);
                }
              })();
            }}
          >
            <Text style={styles.inlineActionText}>Sync pricing</Text>
          </Pressable>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Inventory</Text>
          {inventoryItems.map((item) => (
            <View key={item.id} style={styles.inventoryRow}>
              <View>
                <Text style={styles.inventoryTitle}>{item.productName}</Text>
                <Text style={styles.inventoryMeta}>
                  {item.currentQty} {item.unit} on hand | threshold {item.restockThreshold}
                </Text>
              </View>
              <StatPill label={item.currentQty <= item.restockThreshold ? 'Low stock' : 'OK'} tone={item.currentQty <= item.restockThreshold ? 'critical' : 'safe'} />
            </View>
          ))}
          <View style={styles.optionRow}>
            <Pressable
              style={styles.inlineAction}
              onPress={() => {
                if (!liveBackendEnabled) {
                  setStatusBanner('Inventory is stored locally in demo mode.');
                  return;
                }
                void (async () => {
                  try {
                    setBusyLabel('Syncing inventory');
                    await saveInventoryItems(inventoryItems);
                    setStatusBanner('Inventory synced to Supabase.');
                  } catch (error) {
                    const message = error instanceof Error ? error.message : 'Inventory sync failed';
                    setStatusBanner(`Unable to sync inventory: ${message}`);
                  } finally {
                    setBusyLabel(null);
                  }
                })();
              }}
            >
              <Text style={styles.inlineActionText}>Sync inventory</Text>
            </Pressable>
            <Pressable
              style={styles.inlineAction}
              onPress={() => {
                if (!liveBackendEnabled) {
                  setProfile(null);
                  setPondRecords([]);
                  setSessions({});
                  setLiveSessionIds({});
                  void clearCachedSnapshot();
                  setStatusBanner('Demo state cleared.');
                  setScreen('auth');
                  return;
                }
                void (async () => {
                  try {
                    setBusyLabel('Signing out');
                    await signOut();
                    await clearCachedSnapshot();
                    setProfile(null);
                    setPondRecords([]);
                    setSessions({});
                    setLiveSessionIds({});
                    setOtpStep('phone');
                    setOtpCode('');
                    setStatusBanner('Signed out from Supabase.');
                    setScreen('auth');
                  } catch (error) {
                    const message = error instanceof Error ? error.message : 'Sign-out failed';
                    setStatusBanner(`Unable to sign out: ${message}`);
                  } finally {
                    setBusyLabel(null);
                  }
                })();
              }}
            >
              <Text style={styles.inlineActionText}>Sign out</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    );
  }

  const activeRoot = screen === 'home';

  return (
    <SafeAreaView style={[styles.safeArea, screen === 'splash' && styles.safeAreaSplash]}>
      <StatusBar style={screen === 'splash' ? 'light' : 'dark'} />

      {screen !== 'splash' && (busyLabel || statusBanner) ? (
        <View style={styles.globalBanner}>
          <Text style={styles.globalBannerTitle}>{busyLabel ?? getBackendModeLabel()}</Text>
          <Text style={styles.globalBannerText}>{busyLabel ? statusBanner ?? 'Working...' : statusBanner}</Text>
        </View>
      ) : null}

      {screen === 'splash' ? renderSplash() : null}
      {screen === 'auth' ? renderAuth() : null}
      {screen === 'pondSetup' ? renderPondSetup() : null}
      {screen === 'home' ? renderHome() : null}
      {screen === 'dashboard' ? renderDashboard() : null}
      {screen === 'dailyLog' ? renderDailyLog() : null}
      {screen === 'closeCycle' ? renderCloseCycle() : null}
      {screen === 'report' ? renderReport() : null}

      {activeRoot ? (
        <View style={styles.bottomTabs}>
          {(['ponds', 'aquagpt', 'profile'] as RootTab[]).map((tab) => (
            <Pressable key={tab} style={styles.bottomTab} onPress={() => setRootTab(tab)}>
              <View style={[styles.bottomTabIndicator, rootTab === tab && styles.bottomTabIndicatorActive]} />
              <Text style={[styles.bottomTabText, rootTab === tab && styles.bottomTabTextActive]}>
                {tab === 'ponds' ? 'Ponds' : tab === 'aquagpt' ? 'AquaGPT' : 'Profile'}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ─── Root ────────────────────────────────────────────────────────────────
  safeArea: {
    flex: 1,
    backgroundColor: BRAND.page,   // #f7f8fa light canvas
  },
  safeAreaSplash: {
    backgroundColor: BRAND.ocean,  // #1E7AB8 for splash only
  },
  screenBody: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 104,            // room above tab bar
    gap: 14,
  },

  // ─── Splash ──────────────────────────────────────────────────────────────
  splashBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: BRAND.ocean,
  },
  // Ripple rings (concentric circles, HTML spec)
  splashRippleWrap: {
    position: 'relative',
    width: 144,
    height: 144,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  splashRing1: {
    position: 'absolute',
    width: 144,
    height: 144,
    borderRadius: 72,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  splashRing2: {
    position: 'absolute',
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  splashRing3: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  splashLogoCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  splashLogo: {
    width: 62,
    height: 62,
  },
  appWordmark: {
    color: '#ffffff',
    fontSize: 38,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  splashTagline: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.88)',
    fontSize: 16,
    letterSpacing: 0.1,
  },
  splashMeta: {
    marginTop: 16,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // ─── Auth / hero header ──────────────────────────────────────────────────
  heroCard: {
    backgroundColor: BRAND.blueLight,
    borderWidth: 0.5,
    borderColor: BRAND.border,
    borderRadius: 16,
    padding: 18,
    gap: 8,
  },
  homeHero: {
    backgroundColor: BRAND.card,
    borderWidth: 0.5,
    borderColor: BRAND.border,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  eyebrow: {
    color: BRAND.ocean,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: BRAND.ink,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  heroText: {
    color: BRAND.slate,
    fontSize: 13,
    lineHeight: 20,
  },

  // ─── Card / Panel ────────────────────────────────────────────────────────
  panel: {
    backgroundColor: BRAND.card,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 0.5,
    borderColor: BRAND.border,
  },
  panelTitle: {
    color: BRAND.ink,
    fontSize: 20,
    fontWeight: '700',
  },
  panelText: {
    color: BRAND.slate,
    fontSize: 14,
    lineHeight: 22,
  },
  sectionTitle: {
    color: BRAND.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionHint: {
    color: BRAND.slate,
    fontSize: 12,
    lineHeight: 18,
  },

  // ─── Form ────────────────────────────────────────────────────────────────
  fieldBlock: {
    gap: 6,
    flex: 1,
  },
  fieldLabel: {
    color: BRAND.slate,
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  textInput: {
    borderRadius: 10,
    backgroundColor: BRAND.page,
    borderWidth: 0.5,
    borderColor: BRAND.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: BRAND.ink,
  },
  textArea: {
    minHeight: 88,
    textAlignVertical: 'top',
  },

  // ─── Buttons ─────────────────────────────────────────────────────────────
  primaryButton: {
    backgroundColor: BRAND.ocean,
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  primaryButtonCompact: {
    backgroundColor: BRAND.ocean,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: BRAND.blueLight,
    borderWidth: 0.5,
    borderColor: BRAND.ocean,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: BRAND.ocean,
    fontSize: 13,
    fontWeight: '700',
  },
  footerHint: {
    color: BRAND.slate,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  inlineNotice: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 12,
  },
  inlineNoticeText: {
    color: '#4a5568',
    fontSize: 13,
    lineHeight: 20,
  },

  // ─── Chips / Selectors ───────────────────────────────────────────────────
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionColumn: {
    gap: 8,
  },
  selectChip: {
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: BRAND.blueLight,
  },
  selectChipSelected: {
    backgroundColor: BRAND.ocean,
  },
  selectChipSubtle: {
    backgroundColor: BRAND.page,
    borderWidth: 0.5,
    borderColor: BRAND.border,
  },
  selectChipSubtleSelected: {
    borderColor: BRAND.ocean,
    backgroundColor: BRAND.blueLight,
  },
  selectChipText: {
    color: BRAND.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  selectChipTextSelected: {
    color: '#ffffff',
  },
  doubleGrid: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },

  // ─── Harvest preview ─────────────────────────────────────────────────────
  harvestPreview: {
    backgroundColor: '#FFF8F0',
    borderRadius: 12,
    padding: 12,
    borderWidth: 0.5,
    borderColor: '#F0DFC0',
    gap: 4,
  },
  harvestLabel: {
    color: BRAND.slate,
    fontSize: 9,
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  harvestValue: {
    color: BRAND.ink,
    fontSize: 16,
    fontWeight: '700',
  },

  // ─── Navigation ──────────────────────────────────────────────────────────
  topNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
    paddingBottom: 4,
  },
  backLink: {
    paddingVertical: 8,
  },
  backLinkText: {
    color: BRAND.ocean,
    fontSize: 14,
    fontWeight: '600',
  },
  navActionText: {
    color: BRAND.ocean,
    fontSize: 13,
    fontWeight: '500',
  },

  // ─── Pond card (home list) ───────────────────────────────────────────────
  pondCard: {
    backgroundColor: BRAND.card,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 0.5,
    borderColor: BRAND.border,
  },
  pondCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pondCardTitle: {
    color: BRAND.ink,
    fontSize: 17,
    fontWeight: '700',
  },
  pondCardSub: {
    color: BRAND.slate,
    fontSize: 13,
    marginTop: 1,
  },
  pondCardStatus: {
    color: BRAND.ocean,
    fontSize: 13,
    fontWeight: '600',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricValue: {
    color: BRAND.ink,
    fontSize: 17,
    fontWeight: '700',
  },
  metricLabel: {
    color: BRAND.slate,
    fontSize: 11,
    marginTop: 1,
  },

  // ─── Dashboard identity strip ─────────────────────────────────────────────
  identityCard: {
    backgroundColor: BRAND.card,
    borderRadius: 14,
    padding: 16,
    gap: 8,
    borderWidth: 0.5,
    borderColor: BRAND.border,
  },
  identityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  identityTitle: {
    color: BRAND.ink,
    fontSize: 22,
    fontWeight: '700',
  },
  identitySub: {
    color: BRAND.slate,
    fontSize: 13,
  },
  identityHarvest: {
    color: BRAND.ocean,
    fontSize: 15,
    fontWeight: '700',
  },
  identityMeta: {
    color: BRAND.slate,
    fontSize: 12,
    lineHeight: 18,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 12,
  },

  // ─── Water quality tiles ─────────────────────────────────────────────────
  tileScroller: {
    gap: 10,
  },
  waterTile: {
    width: 112,
    borderRadius: 10,
    padding: 10,
    gap: 4,
    borderWidth: 0.5,
  },
  waterTileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  waterTileLabel: {
    color: BRAND.slate,
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  waterTileValue: {
    fontSize: 22,
    fontWeight: '700',
    color: BRAND.ink,
  },
  waterTileUnit: {
    color: BRAND.slate,
    fontSize: 11,
  },
  waterTileMeta: {
    color: BRAND.slate,
    fontSize: 10,
  },
  iotBadge: {
    color: BRAND.ocean,
    fontSize: 9,
    fontWeight: '700',
  },

  // ─── Metrics / biomass card ──────────────────────────────────────────────
  metricsCard: {
    backgroundColor: BRAND.card,
    borderRadius: 14,
    padding: 16,
    gap: 14,
    borderWidth: 0.5,
    borderColor: BRAND.border,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  metricStat: {
    width: '30%',
    minWidth: 88,
    gap: 2,
  },
  metricBig: {
    color: BRAND.ink,
    fontSize: 20,
    fontWeight: '700',
  },
  insightGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  insightCard: {
    flex: 1,
    backgroundColor: BRAND.card,
    borderRadius: 14,
    padding: 14,
    gap: 8,
    borderWidth: 0.5,
    borderColor: BRAND.border,
  },
  feedBig: {
    color: BRAND.ocean,
    fontSize: 22,
    fontWeight: '700',
  },
  inlineMetric: {
    color: BRAND.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  inventoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  inventoryTitle: {
    color: BRAND.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  inventoryMeta: {
    color: BRAND.slate,
    fontSize: 12,
    lineHeight: 18,
  },

  // ─── Action bar (log FAB row) ─────────────────────────────────────────────
  actionBar: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'stretch',
  },
  lastLogCard: {
    flex: 1,
    backgroundColor: BRAND.card,
    borderRadius: 14,
    padding: 14,
    justifyContent: 'space-between',
    borderWidth: 0.5,
    borderColor: BRAND.border,
  },
  lastLogLabel: {
    color: BRAND.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  actionLinks: {
    flexDirection: 'row',
    gap: 14,
  },
  actionLinkText: {
    color: BRAND.ocean,
    fontSize: 13,
    fontWeight: '700',
  },

  // ─── Dashboard tab row ───────────────────────────────────────────────────
  tabRow: {
    flexDirection: 'row',
    gap: 0,
    backgroundColor: BRAND.card,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: BRAND.border,
    padding: 3,
  },

  // ─── Log history list ────────────────────────────────────────────────────
  logRow: {
    borderTopWidth: 0.5,
    borderTopColor: BRAND.border,
    paddingTop: 12,
    gap: 8,
  },
  logTime: {
    gap: 2,
  },
  logTimeDate: {
    color: BRAND.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  logTimeMeta: {
    color: BRAND.slate,
    fontSize: 12,
  },
  logSummary: {
    backgroundColor: BRAND.page,
    borderRadius: 10,
    padding: 10,
    gap: 4,
    borderWidth: 0.5,
    borderColor: BRAND.border,
  },
  logSummaryText: {
    color: BRAND.ink,
    fontSize: 13,
    lineHeight: 18,
  },
  logNote: {
    color: BRAND.slate,
    fontSize: 12,
    lineHeight: 18,
  },

  // ─── Trend charts ────────────────────────────────────────────────────────
  chartCard: {
    backgroundColor: BRAND.card,
    borderRadius: 14,
    padding: 16,
    minHeight: 240,
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: BRAND.border,
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  chartBarWrap: {
    alignItems: 'center',
    flex: 1,
  },
  chartBar: {
    width: 16,
    borderRadius: 8,
  },
  chartValue: {
    marginTop: 6,
    color: BRAND.ink,
    fontSize: 10,
    fontWeight: '700',
  },
  chartLabel: {
    marginTop: 3,
    color: BRAND.slate,
    fontSize: 9,
  },

  // ─── CSV / export box ────────────────────────────────────────────────────
  csvBox: {
    backgroundColor: '#0E2535',      // intentionally dark (terminal)
    borderRadius: 12,
    padding: 14,
  },
  csvText: {
    color: '#D9F0FF',
    fontSize: 11,
    lineHeight: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // ─── Cycle row ───────────────────────────────────────────────────────────
  cycleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 0.5,
    borderTopColor: BRAND.border,
  },
  biomasPreviewCard: {
    backgroundColor: BRAND.page,
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderWidth: 0.5,
    borderColor: BRAND.border,
  },

  // ─── Report ──────────────────────────────────────────────────────────────
  reportHero: {
    backgroundColor: BRAND.card,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 0.5,
    borderColor: BRAND.border,
  },
  reportLogo: {
    width: 64,
    height: 64,
  },
  reportStep: {
    color: BRAND.ink,
    fontSize: 14,
    lineHeight: 24,
  },
  reportLine: {
    color: BRAND.ink,
    fontSize: 14,
    lineHeight: 22,
  },

  // ─── AquaGPT ─────────────────────────────────────────────────────────────
  questionChip: {
    backgroundColor: BRAND.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 0.5,
    borderColor: BRAND.border,
  },
  questionChipText: {
    color: BRAND.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  chatBubble: {
    borderRadius: 16,
    padding: 12,
    gap: 6,
  },
  chatBubbleUser: {
    backgroundColor: BRAND.ocean,
    borderBottomRightRadius: 4,
  },
  chatBubbleAssistant: {
    backgroundColor: BRAND.card,
    borderWidth: 0.5,
    borderColor: BRAND.border,
    borderBottomLeftRadius: 4,
  },
  chatRole: {
    color: BRAND.ocean,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chatRoleUser: {
    color: 'rgba(255,255,255,0.7)',
  },
  chatText: {
    color: BRAND.ink,
    fontSize: 14,
    lineHeight: 22,
  },
  chatTextUser: {
    color: '#ffffff',
  },

  // ─── Bottom tab bar (matches HTML .tabbar) ───────────────────────────────
  bottomTabs: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BRAND.card,
    borderTopWidth: 0.5,
    borderTopColor: BRAND.border,
    flexDirection: 'row',
    paddingTop: 8,
    paddingBottom: 24,            // accounts for home-indicator safe area
  },
  bottomTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    gap: 3,
  },
  bottomTabIndicator: {
    width: 20,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: BRAND.border,
    marginBottom: 2,
  },
  bottomTabIndicatorActive: {
    backgroundColor: BRAND.ocean,
  },
  bottomTabText: {
    color: '#a0aec0',
    fontSize: 10,
    fontWeight: '600',
  },
  bottomTabTextActive: {
    color: BRAND.ocean,
  },

  // ─── Status pills ─────────────────────────────────────────────────────────
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  pillSafe: {
    backgroundColor: '#e8f8ef',    // --ap-green tint
  },
  pillWarning: {
    backgroundColor: '#fef8e7',    // --ap-amber tint
  },
  pillCritical: {
    backgroundColor: '#fef0f0',    // --ap-red tint
  },
  pillText: {
    color: BRAND.slate,
    fontSize: 11,
    fontWeight: '700',
  },
  pillTextSafe: {
    color: BRAND.success,
  },
  pillTextWarning: {
    color: BRAND.amber,
  },
  pillTextCritical: {
    color: BRAND.critical,
  },

  // ─── Inline actions ──────────────────────────────────────────────────────
  inlineAction: {
    backgroundColor: BRAND.blueLight,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  inlineActionText: {
    color: BRAND.ocean,
    fontSize: 12,
    fontWeight: '700',
  },

  // ─── Global status banner ────────────────────────────────────────────────
  globalBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
    backgroundColor: BRAND.blueLight,
    borderWidth: 0.5,
    borderColor: '#bde0f7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 3,
  },
  globalBannerTitle: {
    color: BRAND.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  globalBannerText: {
    color: BRAND.slate,
    fontSize: 12,
    lineHeight: 18,
  },
});
