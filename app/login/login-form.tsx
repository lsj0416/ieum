"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

/**
 * 로그인 폼.
 *
 * useActionState는 Server Action의 결과와 진행 상태를 함께 준다.
 * fetch를 직접 쓰지 않고 form의 action에 붙이므로, JS가 아직 로드되지
 * 않아도 폼 제출이 동작한다.
 */
export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm">이메일</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="w-full min-w-0 rounded-md border border-black/15 bg-transparent px-3 py-2 text-base dark:border-white/20"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm">비밀번호</span>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="w-full min-w-0 rounded-md border border-black/15 bg-transparent px-3 py-2 text-base dark:border-white/20"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-4 py-2.5 text-base text-background disabled:opacity-40"
      >
        {pending ? "확인 중…" : "로그인"}
      </button>

      {state.error ? (
        // 실패 이유를 세분화하지 않는다. 계정 존재 여부가 드러나면 안 된다.
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
