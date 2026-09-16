import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * 답변을 Markdown으로 그린다.
 *
 * 모델은 굵게, 목록, 표를 Markdown 문법으로 쓴다. 그대로 두면 별표와
 * 파이프가 글자로 보여 오히려 읽기 어렵다.
 *
 * react-markdown은 기본적으로 raw HTML을 렌더하지 않는다. 모델 출력이나
 * 외부 자료에 섞인 태그가 실행되지 않으므로 별도 sanitizer를 두지 않는다.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: (props) => <p className="whitespace-pre-wrap break-words" {...props} />,
          strong: (props) => <strong className="font-semibold" {...props} />,
          ul: (props) => <ul className="list-disc space-y-1 pl-5" {...props} />,
          ol: (props) => <ol className="list-decimal space-y-1 pl-5" {...props} />,
          h1: (props) => <h2 className="text-base font-semibold" {...props} />,
          h2: (props) => <h2 className="text-base font-semibold" {...props} />,
          h3: (props) => <h3 className="font-semibold" {...props} />,
          code: (props) => (
            <code
              className="rounded bg-black/10 px-1 py-0.5 text-[0.9em] dark:bg-white/15"
              {...props}
            />
          ),
          pre: (props) => (
            // 코드 블록은 줄바꿈하지 않는 편이 읽기 쉬우므로 가로 스크롤을 준다.
            <pre
              className="overflow-x-auto rounded-md bg-black/10 p-2 text-xs dark:bg-white/10"
              {...props}
            />
          ),
          // 표는 좁은 화면에서 반드시 넘친다. 표만 따로 스크롤시킨다.
          table: (props) => (
            <div className="overflow-x-auto">
              {/*
                w-max + min-w-full: 칸이 내용에 맞는 폭을 갖게 하되 표가
                좁으면 컨테이너를 채운다. w-full만 주면 긴 설명 칸이 공간을
                다 가져가 "서울특별시"가 억지로 줄바꿈된다.
              */}
              <table className="w-max min-w-full border-collapse text-left" {...props} />
            </div>
          ),
          th: (props) => (
            <th
              className="whitespace-nowrap border-b border-current/20 px-2 py-1 font-semibold"
              {...props}
            />
          ),
          td: (props) => <td className="border-b border-current/10 px-2 py-1" {...props} />,
          a: (props) => (
            <a
              className="underline underline-offset-2"
              target="_blank"
              // 새 탭으로 열리는 링크에는 반드시 붙인다. 없으면 열린 페이지가
              // window.opener로 이 창을 조작할 수 있다.
              rel="noopener noreferrer"
              {...props}
            />
          ),
          blockquote: (props) => (
            <blockquote className="border-l-2 border-current/25 pl-3 opacity-80" {...props} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
