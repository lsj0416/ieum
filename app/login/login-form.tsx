"use client";

import { useState } from "react";

/**
 * 로그인 입력 폼.
 *
 * 상태와 이벤트 핸들러를 쓰므로 Client Component다.
 * 실제 인증은 S0-05에서 붙인다. 지금은 아직 로그인시키지 않는다.
 */
export function LoginForm() {
  const [email, setEmail] = useState("");

  // 이메일 형식을 여기서 판정하지 않는다. 지금은 빈 값만 막는다.
  const canSubmit = email.trim().length > 0;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        // 인증이 없으므로 제출해도 보낼 곳이 없다.
        // 기본 동작을 막아 페이지가 새로고침되는 것만 방지한다.
        event.preventDefault();
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm">이메일</span>
        <input
          type="email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          // w-full + min-w-0: 좁은 화면에서 input 기본 폭이 부모를 밀어내지 않게 한다.
          className="w-full min-w-0 rounded-md border border-black/15 bg-transparent px-3 py-2 text-base dark:border-white/20"
        />
      </label>

      <button
        type="submit"
        // 인증 연결 전까지는 항상 비활성이다. 눌리는데 아무 일도 없는 상태를 만들지 않는다.
        disabled
        aria-disabled
        title="인증 연결은 S0-05에서 구현한다"
        className="rounded-md bg-foreground px-4 py-2.5 text-base text-background disabled:opacity-40"
      >
        로그인
      </button>

      <p className="text-xs opacity-60">
        {canSubmit
          ? "입력은 받지만 아직 인증을 연결하지 않았다."
          : "인증 연결 전이라 로그인 버튼은 동작하지 않는다."}
      </p>
    </form>
  );
}
