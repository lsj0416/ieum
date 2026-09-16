import type { Metadata } from "next";
import Link from "next/link";
import { Placeholder, Screen } from "@/app/ui/screen";
import { MessageComposer } from "./message-composer";

export const metadata: Metadata = {
  title: "대화 · ieum",
};

export default function ChatPage() {
  return (
    <Screen title="대화" footer={<MessageComposer />}>
      {/*
        메시지 목록이 들어갈 자리다. 목록만 스크롤되고 입력창은 하단에 남도록
        min-h-0 + overflow-y-auto를 쓴다. 실제 메시지는 S1에서 채운다.
      */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <Placeholder>
          저장된 대화가 없다. 메시지 저장과 모델 호출은 S1에서 구현한다.
        </Placeholder>

        <Link href="/login" className="text-sm underline underline-offset-4 opacity-70">
          로그인 화면 골격 보기
        </Link>
      </div>
    </Screen>
  );
}
