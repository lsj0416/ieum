import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type ModelMessage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openaiEnv } from "@/lib/supabase/env";
import {
  MODELS,
  MAX_OUTPUT_TOKENS,
  MODEL_TIMEOUT_MS,
  estimateCostUsd,
  totalInputTokens,
  type ModelTask,
  type TokenUsage,
} from "./catalog";
import { checkBudget } from "./usage";

export type GenerateResult =
  | { ok: true; text: string; usage: TokenUsage; costUsd: number; latencyMs: number }
  | { ok: false; errorKind: "budget_exceeded" | "timeout" | "provider_error"; message: string };

const EMPTY_USAGE: TokenUsage = {
  freshInputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
};

/**
 * 모델을 부르고 사용량을 기록한다.
 *
 * Spring으로 치면 외부 API 호출을 감싸는 Gateway 빈에 해당한다. 호출부는
 * 모델 ID도 단가도 모른다. 작업 이름만 넘긴다.
 *
 * 실패해도 기록을 남긴다. 실패한 호출을 비용 0원으로 취급하지 않는다는
 * 원칙(문서 9절) 때문이다.
 */
export async function generate(params: {
  supabase: SupabaseClient;
  ownerId: string;
  task: ModelTask;
  messages: ModelMessage[];
}): Promise<GenerateResult> {
  const { supabase, ownerId, task, messages } = params;
  const spec = MODELS[task];

  // 예산을 넘었으면 호출하지 않는다. 기록할 사용량도 없다.
  const budget = await checkBudget(supabase, ownerId);
  if (budget.exceeded) {
    return {
      ok: false,
      errorKind: "budget_exceeded",
      message: `이번 달 사용액이 상한에 도달했다. ($${budget.spentUsd.toFixed(2)} / $${budget.budgetUsd})`,
    };
  }

  // 키는 환경 변수에서 매번 읽는다. 모듈 로드 시점에 읽으면 키가 바뀌어도
  // 프로세스를 재시작할 때까지 옛 값을 쓴다.
  const openai = createOpenAI({ apiKey: openaiEnv().apiKey });

  const startedAt = Date.now();
  try {
    const result = await generateText({
      model: openai(spec.id),
      messages,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });

    const details = result.usage.inputTokenDetails;
    const usage: TokenUsage = {
      freshInputTokens: details?.noCacheTokens ?? result.usage.inputTokens ?? 0,
      cacheReadTokens: details?.cacheReadTokens ?? 0,
      cacheWriteTokens: details?.cacheWriteTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
    };
    const costUsd = estimateCostUsd(task, usage);
    const latencyMs = Date.now() - startedAt;

    await record(supabase, {
      ownerId,
      task,
      model: spec.id,
      status: "completed",
      usage,
      costUsd,
      latencyMs,
    });

    return { ok: true, text: result.text, usage, costUsd, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const timedOut = error instanceof Error && error.name === "TimeoutError";

    // 실패한 호출의 토큰 수는 공급자가 알려주지 않는다. 0으로 남기되
    // 기록 자체는 남겨 실패가 보이게 한다. 비용이 0이라는 뜻은 아니다.
    await record(supabase, {
      ownerId,
      task,
      model: spec.id,
      status: timedOut ? "timeout" : "failed",
      usage: EMPTY_USAGE,
      costUsd: 0,
      latencyMs,
      errorKind: timedOut ? "timeout" : "provider_error",
    });

    return {
      ok: false,
      errorKind: timedOut ? "timeout" : "provider_error",
      // 공급자 오류 원문을 사용자에게 그대로 보이지 않는다. 키나 내부
      // 정보가 섞일 수 있다.
      message: timedOut ? "모델 응답이 시간 안에 오지 않았다." : "모델 호출에 실패했다.",
    };
  }
}

async function record(
  supabase: SupabaseClient,
  row: {
    ownerId: string;
    task: string;
    model: string;
    status: "completed" | "failed" | "timeout";
    usage: TokenUsage;
    costUsd: number;
    latencyMs: number;
    errorKind?: string;
  },
) {
  const { error } = await supabase.from("model_calls").insert({
    owner_id: row.ownerId,
    task: row.task,
    model: row.model,
    status: row.status,
    error_kind: row.errorKind ?? null,
    input_tokens: totalInputTokens(row.usage),
    cache_read_tokens: row.usage.cacheReadTokens,
    cache_write_tokens: row.usage.cacheWriteTokens,
    output_tokens: row.usage.outputTokens,
    estimated_cost_usd: row.costUsd,
    latency_ms: row.latencyMs,
  });

  // 기록 실패가 응답을 막지는 않는다. 다만 조용히 넘어가지도 않는다.
  if (error) console.error("model_calls 기록 실패:", error.message);
}
