// Barrel — 순수 어댑터만 re-export. `./loader` 는 node:fs/promises 를 쓰는
// 서버 전용 모듈이라 여기서 re-export 하면 client bundle 로 끌려 들어간다
// (store → assemble-incident → adapters 경로). loader 가 필요한 호출자는
// `@/lib/adapters/loader` 를 직접 import 할 것.
export * from "./triage-adapter"
export * from "./hypothesis-adapter"
export * from "./evidence-adapter"
export * from "./action-plan-adapter"
export * from "./executive-summary-adapter"
export * from "./optimization-adapter"
