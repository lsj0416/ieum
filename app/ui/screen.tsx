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
}: {
  title: string;
  /** 화면 본문. 남는 세로 공간을 모두 차지한다. */
  children: React.ReactNode;
  /** 화면 하단에 고정할 영역. 없으면 렌더하지 않는다. */
  footer?: React.ReactNode;
}) {
  return (
    // mx-auto + max-w-md: 큰 화면에서도 모바일 폭을 유지한다.
    // min-w-0: 아래 flex 자식이 내용 때문에 360px 밖으로 밀려나지 않게 한다.
    <div className="mx-auto flex min-h-dvh w-full min-w-0 max-w-md flex-col">
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
