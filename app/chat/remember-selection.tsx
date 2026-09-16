"use client";

import { useEffect } from "react";
import { LAST_CONVERSATION_COOKIE } from "./last-conversation-cookie";

/**
 * 지금 보고 있는 대화를 쿠키에 적는다.
 *
 * Server Component는 렌더 중에 쿠키를 쓸 수 없다. 화면이 그려진 뒤
 * 클라이언트에서 적는다. 값은 UUID 하나뿐이고 서버는 이 값을 믿지 않는다.
 * /chat이 이 값을 쓸 때 소유권을 다시 확인한다.
 */
export function RememberSelection({ conversationId }: { conversationId: string | null }) {
  useEffect(() => {
    if (!conversationId) return;
    const oneMonth = 60 * 60 * 24 * 30;
    document.cookie = `${LAST_CONVERSATION_COOKIE}=${conversationId}; path=/; max-age=${oneMonth}; SameSite=Lax`;
  }, [conversationId]);

  return null;
}
