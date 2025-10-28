export interface AgentDashboardSummary {
  agentCount: number;
  positionsCount: number;
  totalExposure: number;
  totalMargin: number;
  netUnrealized: number;
  averageConfidence: number | null;
}

export type ProfitRange = "total" | "month" | "week" | "day";
