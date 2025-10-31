"use client";

import { useEffect, useState, useCallback } from "react";

export interface TrackerSettings {
  priceTolerance: number;
  totalMargin: number;
  profitTarget: number | null;
  autoRefollow: boolean;
  marginType: "CROSSED" | "ISOLATED";
  riskOnly: boolean;
}

export interface FollowParams {
  priceTolerance: number;
  totalMargin: number;
  profitTarget: string;
  autoRefollow: boolean;
  marginType: "CROSSED" | "ISOLATED";
  riskOnly: boolean;
}

const STORAGE_KEY = "nof1-follow-params";

export function useFollowParams(initialSettings: TrackerSettings) {
  const [params, setParams] = useState<FollowParams>({
    priceTolerance: initialSettings.priceTolerance,
    totalMargin: initialSettings.totalMargin,
    profitTarget: initialSettings.profitTarget?.toString() ?? "",
    autoRefollow: initialSettings.autoRefollow,
    marginType: initialSettings.marginType,
    riskOnly: initialSettings.riskOnly,
  });

  // 从localStorage加载参数
  const loadParams = useCallback(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const savedParams = JSON.parse(stored) as Partial<FollowParams>;

        // 验证并合并参数
        const loadedParams: FollowParams = {
          priceTolerance: typeof savedParams.priceTolerance === "number"
            ? Math.max(0.01, savedParams.priceTolerance)
            : initialSettings.priceTolerance,
          totalMargin: typeof savedParams.totalMargin === "number"
            ? Math.max(0, savedParams.totalMargin)
            : initialSettings.totalMargin,
          profitTarget: typeof savedParams.profitTarget === "string"
            ? savedParams.profitTarget
            : initialSettings.profitTarget?.toString() ?? "",
          autoRefollow: typeof savedParams.autoRefollow === "boolean"
            ? savedParams.autoRefollow
            : initialSettings.autoRefollow,
          marginType: savedParams.marginType === "CROSSED" || savedParams.marginType === "ISOLATED"
            ? savedParams.marginType
            : initialSettings.marginType,
          riskOnly: typeof savedParams.riskOnly === "boolean"
            ? savedParams.riskOnly
            : initialSettings.riskOnly,
        };

        setParams(loadedParams);
        return loadedParams;
      }
    } catch (error) {
      console.warn("Failed to load saved parameters, using defaults:", error);
    }

    return {
      priceTolerance: initialSettings.priceTolerance,
      totalMargin: initialSettings.totalMargin,
      profitTarget: initialSettings.profitTarget?.toString() ?? "",
      autoRefollow: initialSettings.autoRefollow,
      marginType: initialSettings.marginType,
      riskOnly: initialSettings.riskOnly,
    };
  }, [initialSettings]);

  // 保存参数到localStorage
  const saveParams = useCallback((newParams: Partial<FollowParams>) => {
    try {
      const currentParams = loadParams();
      const updatedParams = { ...currentParams, ...newParams };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedParams));
      setParams(updatedParams);
    } catch (error) {
      console.warn("Failed to save parameters:", error);
    }
  }, [loadParams]);

  // 重置为系统设置
  const resetToSettings = useCallback(() => {
    const defaultParams = {
      priceTolerance: initialSettings.priceTolerance,
      totalMargin: initialSettings.totalMargin,
      profitTarget: initialSettings.profitTarget?.toString() ?? "",
      autoRefollow: initialSettings.autoRefollow,
      marginType: initialSettings.marginType,
      riskOnly: initialSettings.riskOnly,
    };
    saveParams(defaultParams);
  }, [initialSettings, saveParams]);

  // 保存当前参数为系统默认设置
  const saveAsDefault = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          priceTolerance: params.priceTolerance,
          totalMargin: params.totalMargin,
          profitTarget: params.profitTarget.trim().length > 0
            ? Number.parseFloat(params.profitTarget)
            : null,
          autoRefollow: params.autoRefollow,
          marginType: params.marginType,
          riskOnly: params.riskOnly,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "保存为默认设置失败");
      }

      return true;
    } catch (error) {
      console.error("Failed to save as default:", error);
      return false;
    }
  }, [params]);

  // 页面加载时自动加载保存的参数
  useEffect(() => {
    loadParams();
  }, [loadParams]);

  return {
    params,
    setParams: (newParams: Partial<FollowParams>) => {
      setParams(prev => ({ ...prev, ...newParams }));
      saveParams(newParams);
    },
    saveParams,
    loadParams,
    resetToSettings,
    saveAsDefault,
    hasSavedParams: localStorage.getItem(STORAGE_KEY) !== null,
  };
}