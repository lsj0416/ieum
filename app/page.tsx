import { redirect } from "next/navigation";

/**
 * 첫 화면은 로그인이다.
 *
 * 인증을 붙이기 전이라 조건 없이 보낸다. S0-05에서 세션을 확인해
 * 로그인한 사용자는 /chat으로 보내도록 바꾼다.
 */
export default function RootPage() {
  redirect("/login");
}
