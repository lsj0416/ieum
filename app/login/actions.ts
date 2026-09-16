"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/supabase/owner";

export type LoginState = { error: string | null };

/**
 * 로그인 Server Action.
 *
 * 브라우저에서 호출하지만 실행은 서버에서 된다. Spring의 @PostMapping
 * 컨트롤러 메서드에 해당하고, 폼의 action에 직접 연결된다.
 *
 * 실패 이유를 자세히 알려주지 않는다. "이 이메일은 없다"와 "비밀번호가
 * 틀렸다"를 구분해주면 어떤 계정이 존재하는지 알려주는 셈이 된다.
 */
export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "이메일과 비밀번호를 입력하세요." };
  }

  // allowlist에 없는 계정은 Supabase에 요청조차 보내지 않는다.
  if (!isOwner(email)) {
    return { error: "로그인에 실패했습니다." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "로그인에 실패했습니다." };
  }

  // 레이아웃 캐시에 비로그인 상태가 남아 있을 수 있어 갱신한다.
  revalidatePath("/", "layout");
  redirect("/chat");
}

/** 로그아웃. 세션 쿠키를 지우고 로그인 화면으로 보낸다. */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
