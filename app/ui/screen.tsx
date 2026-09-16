/**
 * 모바일 화면의 공통 뼈대.
 *
 * 세 화면이 같은 폭 제한과 여백을 쓰도록 한 곳에 모았다.
 * Server Component다. 상태도 이벤트도 없으므로 "use client"가 필요 없다.
 */
export function Screen({
  title,
  children,
  footer,
  wide = false,
}: {
  title: string;
  /** 화면 본문. 남는 세로 공간을 모두 차지한다. */
  children: React.ReactNode;
  /** 화면 하단에 고정할 영역. 없으면 렌더하지 않는다. */
  footer?: React.ReactNode;
  /**
   * 넓은 화면에서 폭을 더 넓힌다.
   *
   * 대화처럼 읽을 내용이 많은 화면에 쓴다. 로그인 폼은 넓혀봐야 입력칸만
   * 늘어나 오히려 읽기 나빠지므로 기본값은 좁은 폭이다.
   */
  wide?: boolean;
}) {
  return (
    // mx-auto + max-w-*: 폭을 제한해 한 줄이 지나치게 길어지지 않게 한다.
    // 모바일 폭을 기준으로 잡되 넓은 화면에서는 단계적으로 넓힌다.
    // min-w-0: 아래 flex 자식이 내용 때문에 360px 밖으로 밀려나지 않게 한다.
    // h-dvh + overflow-hidden: 화면 전체가 스크롤되면 하단 입력창이 같이
    // 밀려 올라간다. 높이를 뷰포트에 고정해 안쪽 목록만 스크롤되게 한다.
    <div
      className={[
        "mx-auto flex h-dvh w-full min-w-0 flex-col overflow-hidden",
        wide ? "max-w-md md:max-w-2xl lg:max-w-3xl" : "max-w-md",
      ].join(" ")}
    >
      <header className="shrink-0 border-b border-black/10 px-4 py-3 dark:border-white/15">
        <h1 className="truncate text-base font-semibold">{title}</h1>
      </header>

      <main className="flex min-h-0 flex-1 flex-col px-4 py-4">{children}</main>

      {footer ? (
        <footer className="shrink-0 border-t border-black/10 px-4 py-3 dark:border-white/15">
          {footer}
        </footer>
      ) : null}
    </div>
  );
}

/** 아직 구현하지 않은 영역임을 화면에서 분명히 하는 자리표시자. */
export function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-black/20 p-3 text-xs opacity-60 dark:border-white/25">
      {children}
    </p>
  );
}
