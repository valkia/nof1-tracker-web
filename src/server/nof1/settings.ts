import "server-only";

import path from "path";
import fs from "fs-extra";
import type { TradingConfig } from "@/server/core/services/config-manager";
import type { CommandOptions } from "@/server/core/types/command";

export const DATA_DIR = path.join(process.cwd(), "data");
const SETTINGS_FILE = path.join(DATA_DIR, "tracker-settings.json");

export type MarginMode = NonNullable<CommandOptions["marginType"]>;

export interface SymbolToleranceSetting {
  symbol: string;
  tolerance: number;
}

export interface TrackerSettings {
  priceTolerance: number;
  symbolTolerances: SymbolToleranceSetting[];
  totalMargin: number;
  profitTarget: number | null;
  autoRefollow: boolean;
  marginType: MarginMode;
  riskOnly: boolean;
  interval: number;
  telegram: {
    enabled: boolean;
    token: string;
    chatId: string;
  };
}

const DEFAULT_SETTINGS: TrackerSettings = {
  priceTolerance: 1,
  symbolTolerances: [],
  totalMargin: 50,
  profitTarget: 25,
  autoRefollow: false,
  marginType: "CROSSED",
  riskOnly: true,
  interval: 30,
  telegram: {
    enabled: false,
    token: "",
    chatId: "",
  },
};

function sanitizeNumber(
  value: unknown,
  fallback: number,
  options?: { min?: number; max?: number },
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  if (options?.min !== undefined && parsed < options.min) {
    return options.min;
  }

  if (options?.max !== undefined && parsed > options.max) {
    return options.max;
  }

  return parsed;
}

function normalizeSymbol(symbol: unknown): string | null {
  if (typeof symbol !== "string") {
    return null;
  }

  const trimmed = symbol.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSymbolTolerances(
  values: unknown,
): SymbolToleranceSetting[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const result: SymbolToleranceSetting[] = [];
  const seen = new Set<string>();

  values.forEach((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return;
    }

    const candidate = entry as {
      symbol?: unknown;
      tolerance?: unknown;
    };

    const symbol = normalizeSymbol(candidate.symbol);
    if (!symbol) {
      return;
    }

    const tolerance = sanitizeNumber(candidate.tolerance, DEFAULT_SETTINGS.priceTolerance, {
      min: 0.01,
    });

    if (seen.has(symbol)) {
      return;
    }
    seen.add(symbol);
    result.push({ symbol, tolerance });
  });

  return result;
}

async function ensureSettingsFile(): Promise<void> {
  await fs.ensureDir(DATA_DIR);
  const exists = await fs.pathExists(SETTINGS_FILE);

  if (!exists) {
    await fs.writeJson(SETTINGS_FILE, DEFAULT_SETTINGS, { spaces: 2 });
  }
}

function mergeSettings(
  current: TrackerSettings,
  incoming: Partial<TrackerSettings>,
): TrackerSettings {
  const normalized = { ...incoming };

  const priceTolerance = sanitizeNumber(
    normalized.priceTolerance,
    current.priceTolerance,
    { min: 0.01 },
  );

  const totalMargin = sanitizeNumber(
    normalized.totalMargin,
    current.totalMargin,
    { min: 0 },
  );

  let profitTarget: number | null;
  if (normalized.profitTarget === null) {
    profitTarget = null;
  } else if (normalized.profitTarget === undefined) {
    profitTarget = current.profitTarget;
  } else {
    profitTarget = sanitizeNumber(
      normalized.profitTarget,
      typeof current.profitTarget === "number"
        ? current.profitTarget
        : DEFAULT_SETTINGS.profitTarget ?? 0,
      { min: 0 },
    );
  }

  const interval = sanitizeNumber(
    normalized.interval,
    current.interval,
    { min: 5 },
  );

  const marginType =
    normalized.marginType === "ISOLATED" || normalized.marginType === "CROSSED"
      ? normalized.marginType
      : current.marginType;

  const autoRefollow =
    typeof normalized.autoRefollow === "boolean"
      ? normalized.autoRefollow
      : current.autoRefollow;

  const riskOnly =
    typeof normalized.riskOnly === "boolean"
      ? normalized.riskOnly
      : current.riskOnly;

  const symbolTolerances = Array.isArray(normalized.symbolTolerances)
    ? normalizeSymbolTolerances(normalized.symbolTolerances)
    : current.symbolTolerances;

  const telegram = {
    enabled:
      typeof normalized.telegram?.enabled === "boolean"
        ? normalized.telegram.enabled
        : current.telegram.enabled,
    token:
      typeof normalized.telegram?.token === "string"
        ? normalized.telegram.token.trim()
        : current.telegram.token,
    chatId:
      typeof normalized.telegram?.chatId === "string"
        ? normalized.telegram.chatId.trim()
        : current.telegram.chatId,
  };

  return {
    priceTolerance,
    symbolTolerances,
    totalMargin,
    profitTarget,
    autoRefollow,
    marginType,
    riskOnly,
    interval,
    telegram,
  };
}

export async function getTrackerSettings(): Promise<TrackerSettings> {
  await ensureSettingsFile();

  try {
    const stored = await fs.readJson(SETTINGS_FILE);
    return mergeSettings(DEFAULT_SETTINGS, stored);
  } catch (error) {
    console.error("Failed to load tracker settings, using defaults", error);
    return DEFAULT_SETTINGS;
  }
}

export async function updateTrackerSettings(
  patch: Partial<TrackerSettings>,
): Promise<TrackerSettings> {
  const current = await getTrackerSettings();
  const next = mergeSettings(current, patch);
  await fs.writeJson(SETTINGS_FILE, next, { spaces: 2 });
  return next;
}

export function settingsToTradingConfig(
  settings: TrackerSettings,
): TradingConfig {
  return {
    defaultPriceTolerance: settings.priceTolerance,
    symbolTolerances: Object.fromEntries(
      settings.symbolTolerances.map(({ symbol, tolerance }) => [
        symbol,
        tolerance,
      ]),
    ),
    telegram: {
      enabled: settings.telegram.enabled,
      token: settings.telegram.token,
      chatId: settings.telegram.chatId,
    },
  };
}

export function settingsToCommandOptions(
  settings: TrackerSettings,
  overrides?: Partial<CommandOptions>,
): CommandOptions {
  const base: CommandOptions = {
    priceTolerance: settings.priceTolerance,
    totalMargin: settings.totalMargin,
    profit: settings.profitTarget ?? undefined,
    autoRefollow: settings.autoRefollow,
    marginType: settings.marginType,
    riskOnly: settings.riskOnly,
    interval: settings.interval.toString(),
  };

  return {
    ...base,
    ...overrides,
    marginType:
      overrides?.marginType ?? base.marginType ?? DEFAULT_SETTINGS.marginType,
  };
}
