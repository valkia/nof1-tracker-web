"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type {
  SymbolToleranceSetting,
  TrackerSettings,
} from "@/server/nof1/settings";

interface SettingsFormProps {
  settings: TrackerSettings;
  onSaved?: (settings: TrackerSettings) => void;
}

interface SymbolFormRow extends SymbolToleranceSetting {
  id: string;
}

function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function createRow(
  preset?: SymbolToleranceSetting,
  fallbackTolerance?: number,
): SymbolFormRow {
  return {
    id: createId(),
    symbol: preset?.symbol ?? "",
    tolerance: preset?.tolerance ?? (fallbackTolerance ?? 1),
  };
}

export function SettingsForm({ settings, onSaved }: SettingsFormProps) {
  const [priceTolerance, setPriceTolerance] = useState(settings.priceTolerance);
  const [totalMargin, setTotalMargin] = useState(settings.totalMargin);
  const [profitTarget, setProfitTarget] = useState(
    settings.profitTarget?.toString() ?? "",
  );
  const [autoRefollow, setAutoRefollow] = useState(settings.autoRefollow);
  const [marginType, setMarginType] = useState<"CROSSED" | "ISOLATED">(
    settings.marginType,
  );
  const [riskOnly, setRiskOnly] = useState(settings.riskOnly);
  const [binanceApiKey, setBinanceApiKey] = useState(
    settings.binance.apiKey,
  );
  const [binanceApiSecret, setBinanceApiSecret] = useState(
    settings.binance.apiSecret,
  );
  const [binanceTestnet, setBinanceTestnet] = useState(
    settings.binance.testnet,
  );
  const [interval, setInterval] = useState(settings.interval);
  const [telegramEnabled, setTelegramEnabled] = useState(
    settings.telegram.enabled,
  );
  const [telegramToken, setTelegramToken] = useState(settings.telegram.token);
  const [telegramChatId, setTelegramChatId] = useState(
    settings.telegram.chatId,
  );
  const [symbolTolerances, setSymbolTolerances] = useState<SymbolFormRow[]>(
    settings.symbolTolerances.length > 0
      ? settings.symbolTolerances.map((row) =>
          createRow(row, settings.priceTolerance),
        )
      : [createRow(undefined, settings.priceTolerance)],
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPriceTolerance(settings.priceTolerance);
    setTotalMargin(settings.totalMargin);
    setProfitTarget(settings.profitTarget?.toString() ?? "");
    setAutoRefollow(settings.autoRefollow);
    setMarginType(settings.marginType);
    setRiskOnly(settings.riskOnly);
    setBinanceApiKey(settings.binance.apiKey);
    setBinanceApiSecret(settings.binance.apiSecret);
    setBinanceTestnet(settings.binance.testnet);
    setInterval(settings.interval);
    setTelegramEnabled(settings.telegram.enabled);
    setTelegramToken(settings.telegram.token);
    setTelegramChatId(settings.telegram.chatId);
    setSymbolTolerances(
      settings.symbolTolerances.length > 0
        ? settings.symbolTolerances.map((row) =>
            createRow(row, settings.priceTolerance),
          )
        : [createRow(undefined, settings.priceTolerance)],
    );
  }, [settings]);

  function updateSymbolTolerance(
    id: string,
    updates: Partial<SymbolToleranceSetting>,
  ) {
    setSymbolTolerances((previous) =>
      previous.map((row) =>
        row.id === id
          ? {
              ...row,
              symbol:
                updates.symbol !== undefined
                  ? updates.symbol.toUpperCase()
                  : row.symbol,
              tolerance:
                updates.tolerance !== undefined
                  ? updates.tolerance
                  : row.tolerance,
            }
          : row,
      ),
    );
  }

  function removeSymbolTolerance(id: string) {
    setSymbolTolerances((previous) =>
      previous.length > 1
        ? previous.filter((row) => row.id !== id)
        : previous,
    );
  }

  function addSymbolTolerance() {
    setSymbolTolerances((previous) => [
      ...previous,
      createRow(undefined, priceTolerance),
    ]);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    try {
      const payload = {
        priceTolerance,
        totalMargin,
        profitTarget:
          profitTarget.trim().length > 0
            ? Number.parseFloat(profitTarget)
            : null,
        autoRefollow,
        marginType,
        riskOnly,
        interval,
        symbolTolerances: symbolTolerances
          .map((row) => ({
            symbol: row.symbol.trim(),
            tolerance: row.tolerance,
          }))
          .filter((row) => row.symbol.length > 0),
        telegram: {
          enabled: telegramEnabled,
          token: telegramToken.trim(),
          chatId: telegramChatId.trim(),
        },
        binance: {
          apiKey: binanceApiKey.trim(),
          apiSecret: binanceApiSecret.trim(),
          testnet: binanceTestnet,
        },
      };

      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "设置保存失败");
      }

      const saved = data.data as TrackerSettings;
      toast.success("配置已保存");
      onSaved?.(saved);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "无法保存配置";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-3xl border border-surface-200 bg-white/90 p-6 shadow-sm">
      <header className="border-b border-surface-100 pb-4">
        <h2 className="text-base font-semibold text-surface-900">参数设置</h2>
        <p className="text-xs text-surface-500">
          这些设置会作为默认参数应用于所有跟单操作，同时负责存储 Binance API
          凭证，不再依赖 .env。
        </p>
      </header>

      <form className="grid grid-cols-1 gap-6 pt-6" onSubmit={handleSubmit}>
        <section className="space-y-4 rounded-2xl border border-surface-100 bg-surface-50/70 p-4">
          <h3 className="text-sm font-semibold text-surface-800">风控参数</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="默认价格容忍度 (%)">
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={priceTolerance}
                onChange={(event) => {
                  const value = Number.parseFloat(event.target.value);
                  setPriceTolerance(Number.isNaN(value) ? 0 : value);
                }}
                className="w-full rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm text-surface-700 shadow-sm transition hover:border-primary/40 focus:border-primary focus:outline-none"
              />
            </Field>

            <Field label="默认总保证金 (USDT)">
              <input
                type="number"
                min={0}
                step={0.01}
                value={totalMargin}
                onChange={(event) => {
                  const value = Number.parseFloat(event.target.value);
                  setTotalMargin(Number.isNaN(value) ? 0 : value);
                }}
                className="w-full rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm text-surface-700 shadow-sm transition hover:border-primary/40 focus:border-primary focus:outline-none"
              />
            </Field>

            <Field label="盈利目标 (%)" description="留空则关闭统一盈利目标">
              <input
                type="number"
                min={0}
                step={0.1}
                value={profitTarget}
                onChange={(event) => setProfitTarget(event.target.value)}
                className="w-full rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm text-surface-700 shadow-sm transition hover:border-primary/40 focus:border-primary focus:outline-none"
              />
            </Field>

            <Field label="自动重新跟随">
              <label className="inline-flex items-center gap-2 text-sm text-surface-600">
                <input
                  type="checkbox"
                  checked={autoRefollow}
                  onChange={(event) => setAutoRefollow(event.target.checked)}
                />
                盈利目标触发后自动再次参与
              </label>
            </Field>

            <Field label="默认保证金模式">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm text-surface-600 transition hover:border-primary/40">
                  <input
                    type="radio"
                    name="settingsMarginType"
                    value="CROSSED"
                    checked={marginType === "CROSSED"}
                    onChange={() => setMarginType("CROSSED")}
                  />
                  全仓
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm text-surface-600 transition hover:border-primary/40">
                  <input
                    type="radio"
                    name="settingsMarginType"
                    value="ISOLATED"
                    checked={marginType === "ISOLATED"}
                    onChange={() => setMarginType("ISOLATED")}
                  />
                  逐仓
                </label>
              </div>
            </Field>

            <Field label="默认轮询周期 (秒)">
              <input
                type="number"
                min={5}
                step={1}
                value={interval}
                onChange={(event) => {
                  const value = Number.parseInt(event.target.value, 10);
                  setInterval(Number.isNaN(value) ? 5 : value);
                }}
                className="w-full rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm text-surface-700 shadow-sm transition hover:border-primary/40 focus:border-primary focus:outline-none"
              />
            </Field>

            <Field label="默认模式">
              <label className="inline-flex items-center gap-2 text-sm text-surface-600">
                <input
                  type="checkbox"
                  checked={riskOnly}
                  onChange={(event) => setRiskOnly(event.target.checked)}
                />
                启用时仅执行风险评估
              </label>
            </Field>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-surface-100 bg-surface-50/70 p-4">
          <h3 className="text-sm font-semibold text-surface-800">Binance API</h3>
          <p className="text-xs text-surface-500">
            输入后即可替代环境变量配置，Secret 仅保存于本地数据目录，可在币安后台随时重置。
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="API Key">
              <input
                type="text"
                value={binanceApiKey}
                onChange={(event) => setBinanceApiKey(event.target.value)}
                className="w-full rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm text-surface-700 shadow-sm transition hover:border-primary/40 focus:border-primary focus:outline-none"
                placeholder="示例：b123..."
              />
            </Field>
            <Field label="API Secret">
              <input
                type="password"
                value={binanceApiSecret}
                onChange={(event) => setBinanceApiSecret(event.target.value)}
                className="w-full rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm text-surface-700 shadow-sm transition hover:border-primary/40 focus:border-primary focus:outline-none"
                placeholder="仅用于签名请求"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label="使用测试网"
                description="启用后改用 Binance Futures Testnet 接口"
              >
                <label className="inline-flex items-center gap-2 text-sm text-surface-600">
                  <input
                    type="checkbox"
                    checked={binanceTestnet}
                    onChange={(event) =>
                      setBinanceTestnet(event.target.checked)
                    }
                  />
                  连接 Binance 测试网环境
                </label>
              </Field>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-surface-100 bg-surface-50/70 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-surface-800">
              币种价格容忍度
            </h3>
            <button
              type="button"
              onClick={addSymbolTolerance}
              className="inline-flex items-center rounded-xl border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/10"
            >
              新增币种
            </button>
          </div>

          <p className="text-xs text-surface-500">
            自定义具体交易对的价格容忍度，覆盖默认值，用于应对不同品种的波动特性。
          </p>

          <div className="space-y-3">
            {symbolTolerances.map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl border border-surface-100 bg-white p-3 sm:grid-cols-[2fr_1fr_auto]"
              >
                <input
                  type="text"
                  placeholder="例如 BTCUSDT"
                  value={row.symbol}
                  onChange={(event) =>
                    updateSymbolTolerance(row.id, {
                      symbol: event.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-surface-700 shadow-sm transition hover:border-primary/40 focus:border-primary focus:outline-none"
                />
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={row.tolerance}
                  onChange={(event) =>
                    updateSymbolTolerance(row.id, {
                      tolerance: Number.parseFloat(event.target.value),
                    })
                  }
                  className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-surface-700 shadow-sm transition hover:border-primary/40 focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeSymbolTolerance(row.id)}
                  className="rounded-xl border border-surface-200 px-3 py-2 text-xs text-surface-500 transition hover:border-rose-200 hover:text-rose-500"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-surface-100 bg-surface-50/70 p-4">
          <h3 className="text-sm font-semibold text-surface-800">
            Telegram 通知
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="启用通知">
              <label className="inline-flex items-center gap-2 text-sm text-surface-600">
                <input
                  type="checkbox"
                  checked={telegramEnabled}
                  onChange={(event) =>
                    setTelegramEnabled(event.target.checked)
                  }
                />
                发送成交推送到 Telegram
              </label>
            </Field>

            <Field label="Bot Token">
              <input
                type="text"
                value={telegramToken}
                onChange={(event) => setTelegramToken(event.target.value)}
                className="w-full rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm text-surface-700 shadow-sm transition hover:border-primary/40 focus:border-primary focus:outline-none"
                placeholder="1234567890:ABC..."
                disabled={!telegramEnabled}
              />
            </Field>

            <Field label="Chat ID">
              <input
                type="text"
                value={telegramChatId}
                onChange={(event) => setTelegramChatId(event.target.value)}
                className="w-full rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm text-surface-700 shadow-sm transition hover:border-primary/40 focus:border-primary focus:outline-none"
                placeholder="@channel 或 ID"
                disabled={!telegramEnabled}
              />
            </Field>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center rounded-2xl bg-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-surface-300"
          >
            {saving ? "保存中..." : "保存设置"}
          </button>
        </div>
      </form>
    </section>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
  description?: string;
}

function Field({ label, children, description }: FieldProps) {
  return (
    <label className="flex flex-col gap-2 text-xs text-surface-500">
      <span className="font-semibold text-surface-700">{label}</span>
      {children}
      {description ? (
        <span className="text-[11px] text-surface-400">{description}</span>
      ) : null}
    </label>
  );
}
