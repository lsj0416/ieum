/**
 * 마지막으로 연 대화를 기억하는 쿠키 이름.
 *
 * 이 상수를 "use client" 파일에 두면 Server Component가 import했을 때
 * 값이 전달되지 않는다. 클라이언트 모듈은 참조로 바뀌기 때문이다.
 * 양쪽이 함께 쓰는 값은 이렇게 별도 모듈에 둔다.
 */
export const LAST_CONVERSATION_COOKIE = "ieum_last_conversation";
