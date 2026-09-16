import type { Metadata } from "next";
import Link from "next/link";
import { Screen } from "@/app/ui/screen";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "로그인 · ieum",
};

export default function LoginPage() {
  return (
    <Screen title="ieum 로그인">
      <div className="flex flex-1 flex-col justify-center gap-6">
        <p className="text-sm opacity-70">
          본인 한 명만 사용하는 개인 비서다. 공개 가입은 제공하지 않는다.
        </p>

        <LoginForm />

        <Link href="/chat" className="text-sm underline underline-offset-4 opacity-70">
          대화 화면 골격 보기
        </Link>
      </div>
    </Screen>
  );
}
