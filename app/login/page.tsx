import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Screen } from "@/app/ui/screen";
import { getOwner } from "@/lib/supabase/auth";
import { ownerAllowlistIsEmpty } from "@/lib/supabase/owner";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "로그인 · ieum",
};

export default async function LoginPage() {
  // 이미 로그인한 소유자가 로그인 화면에 머무를 이유가 없다.
  if (await getOwner()) {
    redirect("/chat");
  }

  return (
    <Screen title="ieum 로그인">
      <div className="flex flex-1 flex-col justify-center gap-6">
        <p className="text-sm opacity-70">
          본인 한 명만 사용하는 개인 비서다. 공개 가입은 제공하지 않는다.
        </p>

        {ownerAllowlistIsEmpty() ? (
          <p className="rounded-md border border-dashed border-black/20 p-3 text-xs opacity-70 dark:border-white/25">
            OWNER_EMAILS가 비어 있어 아무도 로그인할 수 없다. .env.local을 확인한다.
          </p>
        ) : null}

        <LoginForm />
      </div>
    </Screen>
  );
}
