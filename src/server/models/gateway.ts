import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText, type ModelMessage } from "ai";
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
  /** 시스템 원칙. messages가 아니라 별도로 넘긴다. */
  system?: string;
  messages: ModelMessage[];
}): Promise<GenerateResult> {
  const { supabase, ownerId, task, system, messages } = params;
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
      system,
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

    // 사용자에게는 감추되 서버 로그에는 남긴다. 원인을 모르면 고칠 수 없다.
    console.error("모델 호출 실패:", error instanceof Error ? error.message : error);

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


export type StreamResult =
  | {
      ok: true;
      /** 토큰이 오는 대로 내보내는 스트림. */
      textStream: AsyncIterable<string>;
      /** 스트림이 끝난 뒤 호출한다. 사용량을 기록하고 최종 상태를 돌려준다. */
      /**
       * 스트림이 끝난 뒤 호출한다.
       * 중간에 끊겼다면 받은 텍스트를 넘긴다. 사용량을 추정해 기록한다.
       */
      finish: (partialText?: string) => Promise<{ text: string; complete: boolean; reason: string }>;
    }
  | { ok: false; errorKind: "budget_exceeded" | "provider_error"; message: string };

/**
 * 스트리밍 호출.
 *
 * generate()와 다른 점은 답변을 기다리지 않고 토큰이 오는 대로 넘긴다는
 * 것뿐이다. 예산 검사와 사용량 기록의 규칙은 같다.
 *
 * 사용량은 스트림이 끝나야 알 수 있으므로 finish()에서 기록한다. 호출자가
 * finish()를 부르지 않으면 기록이 남지 않으니 반드시 부른다.
 */
export async function generateStream(params: {
  supabase: SupabaseClient;
  ownerId: string;
  task: ModelTask;
  system?: string;
  messages: ModelMessage[];
}): Promise<StreamResult> {
  const { supabase, ownerId, task, system, messages } = params;
  const spec = MODELS[task];

  const budget = await checkBudget(supabase, ownerId);
  if (budget.exceeded) {
    return {
      ok: false,
      errorKind: "budget_exceeded",
      message: `이번 달 사용액이 상한에 도달했다. ($${budget.spentUsd.toFixed(2)} / $${budget.budgetUsd})`,
    };
  }

  const openai = createOpenAI({ apiKey: openaiEnv().apiKey });
  const startedAt = Date.now();

  let result;
  try {
    result = streamText({
      model: openai(spec.id),
      system,
      messages,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("스트리밍 시작 실패:", error instanceof Error ? error.message : error);
    return { ok: false, errorKind: "provider_error", message: "모델 호출에 실패했다." };
  }

  return {
    ok: true,
    textStream: result.textStream,
    finish: async (partialText?: string) => {
      const latencyMs = Date.now() - startedAt;
      try {
        const [text, usageRaw, finishReason] = await Promise.all([
          result.text,
          result.usage,
          result.finishReason,
        ]);
        const details = usageRaw.inputTokenDetails;
        const usage: TokenUsage = {
          freshInputTokens: details?.noCacheTokens ?? usageRaw.inputTokens ?? 0,
          cacheReadTokens: details?.cacheReadTokens ?? 0,
          cacheWriteTokens: details?.cacheWriteTokens ?? 0,
          outputTokens: usageRaw.outputTokens ?? 0,
        };

        // stop이 아니면 답변이 온전하지 않다. length는 출력 상한에 걸린 것이고
        // 그 밖의 값은 도중에 끊겼다는 뜻이다.
        const complete = finishReason === "stop";

        await record(supabase, {
          ownerId,
          task,
          model: spec.id,
          status: "completed",
          usage,
          costUsd: estimateCostUsd(task, usage),
          latencyMs,
          errorKind: complete ? undefined : `finish_reason:${finishReason}`,
        });
        return { text, complete, reason: String(finishReason) };
      } catch (error) {
        // 스트림이 도중에 끊겼다. 공급자가 사용량을 주지 않지만 여기까지
        // 나간 토큰에도 과금된다. 0으로 남기면 예산이 실제보다 적게 보이므로
        // 받은 텍스트에서 추정해 기록한다. 추정값임을 error_kind에 남긴다.
        console.error("스트리밍 실패:", error instanceof Error ? error.message : error);
        const estimated = estimateOutputTokens(partialText ?? "");
        const usage: TokenUsage = { ...EMPTY_USAGE, outputTokens: estimated };
        await record(supabase, {
          ownerId,
          task,
          model: spec.id,
          status: "failed",
          usage,
          costUsd: estimateCostUsd(task, usage),
          latencyMs,
          errorKind: "stream_error:output_estimated",
        });
        return { text: partialText ?? "", complete: false, reason: "stream_error" };
      }
    },
  };
}


/**
 * 끊긴 스트림의 출력 토큰 수를 글자 수에서 추정한다.
 *
 * 한국어는 대략 1.5자가 1토큰이다. 정확하지 않지만 0보다는 실제에 가깝다.
 * 예산은 적게 잡히는 쪽이 위험하다.
 */
function estimateOutputTokens(text: string): number {
  return Math.ceil(text.length / 1.5);
}
