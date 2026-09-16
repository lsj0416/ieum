import type { SupabaseClient } from "@supabase/supabase-js";
import { MONTHLY_BUDGET_USD } from "./catalog";

/** 이번 달 1일 00:00 UTC. 예산은 달력 월 기준으로 센다. */
function monthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * 이번 달 누적 사용액(USD).
 *
 * 실패한 호출도 포함한다. 생성 도중 끊긴 호출에도 과금될 수 있으므로
 * 실패를 0원으로 취급하면 예산이 실제보다 적게 보인다.
 */
export async function monthlySpendUsd(supabase: SupabaseClient, ownerId: string): Promise<number> {
  const { data, error } = await supabase
    .from("model_calls")
    .select("estimated_cost_usd")
    .eq("owner_id", ownerId)
    .gte("created_at", monthStart());

  if (error) throw error;

  return (data ?? []).reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
}

export type BudgetStatus = {
  spentUsd: number;
  budgetUsd: number;
  exceeded: boolean;
};

/**
 * 호출 전에 예산을 확인한다.
 *
 * 이 검사는 애플리케이션 차원의 1차 방어선이다. 코드에 버그가 있어
 * 호출이 폭주하면 이것만으로는 막지 못하므로, OpenAI 대시보드의
 * 결제 한도를 함께 걸어둔다. README에 적어둔다.
 */
export async function checkBudget(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<BudgetStatus> {
  const spentUsd = await monthlySpendUsd(supabase, ownerId);
  return {
    spentUsd,
    budgetUsd: MONTHLY_BUDGET_USD,
    exceeded: spentUsd >= MONTHLY_BUDGET_USD,
  };
}
