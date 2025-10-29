export interface AgentDashboardSummary {
  agentCount: number;
  positionsCount: number;
  totalExposure: number;
  totalMargin: number;
  totalEquity: number;
  netUnrealized: number;
  averageConfidence: number | null;
}

export type ProfitRange = "total" | "month" | "week" | "day";

export interface AgentProfitPoint {
  time: number; // Unix timestamp in seconds
  value: number; // Represents total account equity
}

export interface AgentProfitSeries {
  agentId: string;
  modelId: string;
  points: AgentProfitPoint[];
}

export interface AgentProfitSeriesPayload {
  range: ProfitRange;
  rangeStart: number; // Unix timestamp in seconds
  rangeEnd: number; // Unix timestamp in seconds
  series: AgentProfitSeries[];
}
