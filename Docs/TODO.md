# Fortress 진행상황 체크리스트 (TODO)

이 파일은 전체 프로젝트의 **단일 진행상황 트래커**입니다. 상세 작업 내용은 `Docs/phases/PhaseN-*.md`를 참고하십시오.

## 상태 표기 규칙

- `[ ]` 대기(아직 시작 안 함)
- `[~]` 진행중 (작업을 시작하면 즉시 이 상태로 바꿀 것 — 다른 에이전트와의 충돌 방지)
- `[x]` 완료 (완료 조건까지 확인한 뒤에만 표시)
- `[!]` 블로킹 이슈 있음 (아래 "이슈 로그"에 사유 기록)

각 작업 ID를 시작/완료할 때 **반드시 이 파일을 갱신**하십시오. 이 파일이 최신 상태가 아니면 다른 에이전트가 중복 작업을 하게 됩니다.

---

## Phase 0 — Foundation `[x]`

- [x] P0-01 pnpm+Vite7+React19+TS 스캐폴딩
- [x] P0-02 Tauri 2 통합
- [x] P0-03 Tailwind + shadcn/ui 설정
- [x] P0-04 Lint/Format/스크립트 정비
- [x] P0-05 기본 폴더 구조 생성
- [x] P0-06 .gitignore/README/초기 커밋
- [x] P0-07 Ollama 연결 스모크 테스트 스크립트
- [x] P0-08 에이전트 루프 스파이크 (모델별 tool-calling 검증)

## Phase 1 — Shell & Layout UI `[x]`

- [x] P1-01 타입 정의 + WorkspaceTabsContext + SidePanelContext
- [x] P1-02 ActivityBar
- [x] P1-03 WorkspaceLayout(리사이저블 스플릿)
- [x] P1-04 Workspace 페이지 조립
- [x] P1-05 SidePanel 라우터 + 4개 패널(초기)
- [x] P1-06 FileTree + Rust fs_commands
- [x] P1-07 CenterWorkspace + EditorTab(CodeMirror6) + ImageViewerTab
- [x] P1-08 Chat 탭 Placeholder + 시작 시 기본 탭 자동 오픈
- [x] P1-09 Settings 라우트 골격
- [x] P1-10 ThemeContext + 다크모드

## Phase 2 — Agent Runtime & Chat `[x]`

- [x] P2-01 Ollama 클라이언트 (/api/chat 스트리밍 + usage + 에러 분류)
- [x] P2-02 런타임 타입 + 훅 레지스트리 + 도구 레지스트리
- [x] P2-03 FortressAgent 루프 (턴 반복/큐/재시도/취소)
- [x] P2-04 시스템 프롬프트 섹션 빌더 + diff
- [x] P2-05 읽기 도구: read/ls/grep/find + 출력 절단
- [x] P2-06 변경 도구: write/edit + shell + web_search
- [x] P2-07 useChat 훅
- [x] P2-08 ChatTab 실동작 연결 (도구 카드/컨텍스트 게이지 포함)
- [x] P2-09 에러 처리/재시도 UI

## Phase 3 — Skills & AGENTS.md Loader `[x]`

- [x] P3-01 frontmatter 파서
- [x] P3-02 컨텍스트 파일(AGENTS.md) 계층 수집
- [x] P3-03 스킬 스캐너 (Agent Skills 표준 검증)
- [x] P3-04 프롬프트 노출 (`<available_skills>`)
- [x] P3-05 SkillsContext + 워크스페이스 신뢰 확인
- [x] P3-06 SkillListPanel + SkillViewerTab (진단 표시 포함)
- [x] P3-07 프롬프트 병합 (useChat에 데이터 전달)
- [x] P3-08 `/skill:name` 명시 호출

## Phase 4 — Session Storage & Compaction `[x]`

- [x] P4-01 tauri-plugin-sql 통합 + 엔트리 스키마 마이그레이션
- [x] P4-02 Repository 계층(sessions/entries/agents/settings)
- [x] P4-03 컨텍스트 재구성 (buildContext)
- [x] P4-04 ChatSessionsContext + ChatSessionList 실동작
- [x] P4-05 useChat ↔ DB 연결 + 탭 상태 영속화
- [x] P4-06 토큰 추정 (Ollama usage 기반) + 압축 예산 해석
- [x] P4-07 컷 포인트 + 대화 직렬화
- [x] P4-08 compact() + 훅 등록 + 오버플로우 복구
- [x] P4-09 압축 UI (배너/게이지/`/compact`)

## Phase 5 — Visualization & HITL `[x]`

- [x] P5-01 parseVisualBlocks
- [x] P5-02 MermaidViewer
- [x] P5-03 RechartsViewer + JSON DSL
- [x] P5-04 시각화 지침 프롬프트 섹션
- [x] P5-05 위험도 분류 + 승인 버스
- [x] P5-06 승인 훅 등록 + ApprovalDialog
- [x] P5-07 approvalMode 설정 연동

## Phase 6 — Agent Management UI `[x]`

- [x] P6-01 AgentsContext
- [x] P6-02 AgentListPanel 실동작
- [x] P6-03 AgentEditorForm / AgentEditorTab
- [x] P6-04 Agent 삭제 확인 + 기본 승격
- [x] P6-05 ChatTab에서 Agent 선택/전환
- [x] P6-06 Agent 사용 통계(축소 버전)

## Phase 7 — Polish & QA `[x]`

## Phase 8 — Internationalization (ko/en) `[x]`

- [x] P8-01 i18n 인프라 (Locale 타입, ko/en 사전, LanguageContext, 첫 실행 언어 선택 팝업, 설정 연동)
- [x] P8-02 Shell 그룹 문구 전환 (ActivityBar/TopMenuBar/FileTree/ChatSessionList/CenterWorkspace/Welcome/Settings/ErrorBoundary)
- [x] P8-03 Chat 그룹 문구 전환 (chat/*, ChatTab, useKeyboardShortcuts)
- [x] P8-04 Agents/Skills/Editor 그룹 문구 전환 (agents/skills/monitor/stats/viewer/editor/image)
- [x] P8-05 `pnpm lint`/`typecheck`/`test` 통과 + ko/en 실동작 확인

- [x] P7-01 텍스트/문구 일관성 점검
- [x] P7-02 키보드 단축키
- [x] P7-03 에러 바운더리 및 전역 예외 처리
- [x] P7-04 성능 점검
- [x] P7-05 Windows 패키징 점검
- [x] P7-06 수동 QA 시나리오 실행
- [x] P7-07 README/사용자 가이드

## Phase 9 — Follow-ups (P9) `[x]`

- [x] P9-06 채팅별 실행 설정 표시 ([i] 스냅샷·설정 변경 안내·동작 중 설정 잠금)
- [x] P9-07 생성 파라미터 확장 (top-p/top-k/반복 억제/seed/stop/최대 토큰 + Provider·모델별 비활성화 + [i] 상세 설명)
- [x] P9-08 대화 목록/사이드바/모니터링 개편 (삭제 에이전트명 취소선 표시·대화 전체삭제·스킬 사이드바 제거 후 에이전트 설정 카드+refresh·모니터링 사이드 패널 신설)

## Phase 10 — Automated Evaluation (기획 단계) `[ ]`

> 기획서: `Docs/plan/LLM_Evaluation_Plan.md` (조사: `Docs/plan/LLM_Evaluation_Research.md`). 승인 후 `Docs/phases/Phase10-Evaluation.md`로 확정하고 아래 작업을 착수합니다.

- [x] P10-00 평가 프로세스·데이터셋·채점·정규화 스킴 조사 및 기획서 작성
- [ ] P10-01 ~ P10-08 MVP (기획서 §10) — 승인 대기

---

## 이슈 로그

작업 중 설계 문서와 실제 구현이 충돌하거나, 소유 파일 범위를 벗어난 수정이 필요했거나, 막힌 문제가 있으면 아래에 날짜/작업ID/내용을 기록하십시오.

| 날짜              | 작업 ID | 내용                      | 상태   |
| ----------------- | ------- | ------------------------- | ------ |
| (예시) 2026-09-18 | P0-00   | 예시: 문서 초안 작성 완료 | 해결됨 |
| 2026-09-22        | DESIGN  | Midnight Rampart 테마 적용: 시맨틱 토큰(success/warning/info/tertiary/code/subtle) 추가, 컴포넌트의 원시 팔레트 클래스 → 토큰 치환, 차트/Mermaid/CodeMirror 팔레트 통일. **신규 의존성** `@fontsource-variable/geist`·`@fontsource-variable/jetbrains-mono`·`@fontsource/ibm-plex-sans-kr` — 로컬 퍼스트 원칙상 Google Fonts CDN 대신 폰트를 번들하기 위함. | 해결됨 |
| 2026-09-22        | DESIGN  | 다크 테마 눈부심 개선(tokens v1.1): 채도 높은 남색 → 차콜 중립(`#18191C` 계열), 본문 `#D9DBE1`(11.8:1), 강조색 채도 완화. Mermaid·CodeMirror 다크 팔레트 동기화. 참고: `Docs/screenshot/dark-theme-01.png` | 해결됨 |
| 2026-09-22        | DESIGN  | 브랜드: 목책 요새 로고(`design/brand/`, `FortressMark`), 앱 아이콘(`src-tauri/icons` 재생성), 파비콘, README 배너 적용. `--brand` 토큰 추가. 웰컴 화면 문구를 "로컬 LLM 테스트 & 모니터링 워크벤치"로 변경 | 해결됨 |
| 2026-09-25        | P9-01   | Reasoning/effort 제어 신규: Agent에 `reasoning`(`default`/`off`/`on`)·`reasoningEffort`(`low`/`medium`/`high`) 추가. Ollama `/api/chat` 최상위 `think` 필드로 전달(Ollama thinking capability 공식 지원 확인). 채팅 화면 세션 오버라이드는 메시지/프롬프트를 건드리지 않아 prefill 오버헤드 없음. DB `agents`에 `reasoning`·`reasoning_effort` 컬럼 추가(기존 행은 모델 기본값으로 해석). | 해결됨 |
| 2026-09-25 | P9-02 | 프로젝트 폴더 전환 규칙 강화: ① LLM 동작 중 폴더 변경 금지(`chatQueueManager` busy 가드 + `WorkspaceContext.setWorkspaceRoot` boolean 반환 + TopMenuBar/FileTree UI 비활성화), ② 에이전트는 전역 DB 그대로 공유(기존 `agentsRepo` 전역 분리 유지), 세션/엔트리/실행로그/탭은 프로젝트 `.fortress/fortress.db`에 저장(기존 `getDatabase` 라우팅 유지), ③ 전환 직전 이전 프로젝트 탭을 `saveProjectTabs`로 플러시하여 디바운스 경합 유실 방지(다음 로드 시 복원 보장), ④ `AgentEditorTab` 타이틀 라인에 "대화 시작" 버튼 추가. | 해결됨 |
| 2026-09-25 | P9-03 | 다중 LLM Provider 지원: Agent에 `llmProvider`/`llmBaseUrl`/`llmApiKey` 추가(Ollama 기본, 구 행 호환). 신규 `src/lib/llm/providers.ts`(7종 프리셋: ollama/lmstudio/llamacpp/vllm/jan/openai-compatible/openai) + `openAiCompatibleClient.ts`(SSE, 외부 SDK 없음) + `providerRuntime.ts`(분기점). 턴 루프·압축 요약·연결 상태·모니터링을 Provider 분기 처리. 에이전트 편집 화면 기본 정보 카드 아래에 "LLM Provider" 섹션 추가(ko/en 문구 포함). 추가 웹 리서치 결과는 `Docs/plan/Multiple_LLM_Providers.md` §4~§5에 기록. **신규 의존성 없음**. | 해결됨 |
| 2026-09-25 | P9-04 | 모니터링 토큰 추적: ① "대화"(요청 1건→agent_end) 단위 집계 — 턴별 usage 실측 합산(입력/출력), 사고 토큰은 출력 중 사고문 비율 안분, 상태별 출력은 prefill=입력/thinking=사고분/decoding=본문분 귀속. 신규 `src/lib/monitoring/tokenTracker.ts`(인메모리, 테스트 포함) + 루프 경계 훅(`loop.ts` begin/record/finish) + `conversation_token_summaries` 원장 테이블(영속, `monitoringRepo`+`client.ts` 메모리 폴백+`0001_init.sql` 동기화). ② 스냅샷에 `thinking_tokens`/`conversation_id`/`conversation_seq` + 타임라인 "토큰(입력/출력/사고)" 컬럼·대화 배지(`C#seq`). ③ 카드 재배치: VRAM+RAM → "메모리 분배" 병합, 빈 자리→GPU·VRAM 추이, 추이 자리→신규 "토큰 정보" 카드(전체 누적·상태별 점유·최근 대화 5건·진행 중 표시, ko/en 문구 포함). `pnpm lint`/`typecheck`/`test`(51파일 249건) 통과. **신규 의존성 없음**. | 해결됨 |
| 2026-09-25 | P9-05 | 채팅-에이전트 귀속 강화: ① `ChatInput` 에이전트 전환 셀렉터 삭제(각 채팅은 단일 설정에 귀속, `agentReasoning` prop으로 effort 비활성화만 유지). ② "새 채팅" 경로(TopMenuBar/대화목록/Ctrl+N/빈 탭)는 기본 에이전트로 세션 생성(기존 `createSession` 기본값 유지, `ChatSessionList`는 `session.agentId`를 탭 meta에 전달). ③ 채팅 상단 배지에 Provider 표시(`이름 • Provider • 모델`), `/agent` 출력에 Provider 행 추가. ④ 대화 목록 행에 `Provider • 모델 • Ctx nK` 표시, 시간은 타이틀 우측으로 이동. ⑤ 에이전트 편집 잠금: 해당 에이전트를 쓰는 세션이 LLM 동작/대기 큐 중이면(`useGlobalLlmBusy`+세션 매핑, 미확인 시 보수적 잠금) `AgentEditorForm` 입력·저장 비활성화 + 고지 배너. ⑥ 근본 설정(Provider·Base URL·모델) 변경 시 기존 유지 + 새 에이전트로 분기 저장(이름 동일 시 ` (v2)` 접미, `isDefault: false`), 저장 전 `forkNotice` 배너 + 저장 버튼 `agentForm.saveAsNew` 전환, 새 설정 테스트는 “대화 시작” 새 채팅으로 유도. `pnpm lint`/`typecheck`/`test` 통과(신규 테스트 2건: 잠금·분기). **신규 의존성 없음**. | 해결됨 |
| 2026-09-25 | P9-06 | 채팅별 실행 설정 표시: ① `ChatConfigSnapshot`(모델·Provider·temperature·ctx 크기·reasoning/effort·think 전달값 등) + `captureChatConfigSnapshot`/`chatConfigSignature` 신규(`src/lib/types/agent.ts`). 전송 시점 스냅샷을 사용자 메시지에 첨부(`useChat.sendMessage`, 메시지 JSON 저장이라 DB 마이그레이션 없음, 구 행은 현재 설정 폴백 + 폴백 고지). LLM 매핑·압축 직렬화는 `content`만 사용하므로 영향 없음. ② 사용자 말풍선 푸터에 [i] 버튼 + 설정 상세 패널(`MessageBubble`, ko/en 문구 포함). ③ 설정 변경 시 채팅 중간 중앙 배지로 안내(`ChatTab` 서명 감지 + `useChat.injectConfigNotice`, UI 전용 미저장·LLM 미전송). ④ LLM 동작/대기 큐 점유 중 reasoning/effort 셀렉터 비활성화(`ChatInput` settingsLocked + `settingsLocked` 문구). `pnpm lint`/`typecheck`/`test`(52파일 260건) 통과. **신규 의존성 없음**. 소유 파일 밖 수정(Phase 문서에 P9 소유 목록 없음): `ChatInput.test.tsx`에 잠금 테스트 2건 추가. | 해결됨 |
| 2026-09-25 | P9-07 | 생성 파라미터 확장: Agent에 `topP`·`topK`·`repeatPenalty`·`frequencyPenalty`·`presencePenalty`·`seed`·`stopSequences`·`maxOutputTokens` 추가(미지정=자동, 필드 생략). 신규 `src/lib/llm/generationParams.ts`(Provider 지원 매트릭스·정규화·Ollama options/OpenAI body 매핑·effort 레벨 지원 판정, 테스트 포함). 런타임은 각 클라이언트가 자기 규격 키로만 변환(Ollama `top_p/top_k/repeat_penalty/seed/stop/num_predict`, OpenAI 호환 `top_p/frequency_penalty/presence_penalty/seed/stop/max_tokens`) + OpenAI 클라이언트의 Ollama 전용 키 제거 목록 확대. 편집 폼에 "생성 파라미터" 카드 + 전 파라미터 [i] 상세 설명(ko/en) + 미지원 항목 입력 잠금(값 유지, Ollama 전용/OpenAI 전용 뱃지) + effort 레벨 미지원 모델의 effort 잠금. 스냅샷·서명·말풍선 [i] 패널·`/agent` 출력에 생성 파라미터 반영. DB `agents`에 8컬럼 추가(기존 행은 자동 해석, `client.ts` 메모리 폴백·`0001_init.sql`·`agentsRepo`·테스트 목 동기화). `Architecture.md` §4.2·§5.8 갱신. **신규 의존성 없음**. | 해결됨 |
| 2026-09-25 | P9-08 | 대화 목록/사이드바/모니터링 개편: ① 삭제 에이전트 세션도 기억된 이름 표시 + 취소선(`AgentsContext` id→name 캐시 localStorage 영속 + `getKnownAgentName`, 행/그룹헤더 `line-through`, 미확인분은 기존 `sessions.agentDeleted` + `(삭제됨)` 접미). ② 대화 목록 전체삭제(헤더 휴지통 + `clearSessions` + 관련 채팅탭 일괄 닫기 + 확인 팝업 필수). ③ 스킬 사이드바 제거(`SidePanelView.skills`→`monitoring`, ActivityBar/TopMenuBar/SidePanel 교체, `SkillListPanel` 파일은 유지) + `AgentEditorForm` "활성 스킬" 카드 상시 표시·on/off·refresh 버튼(스킬 0개/로딩/empty 안내 포함). ④ 모니터링 사이드 패널 신설(`MonitoringListPanel`: 최근 스냅샷 200건, 대화 목록과 동일한 전체/에이전트/Provider/모델/상태 필터·그룹화, 행 클릭 시 모니터 탭 오픈, 개별 삭제 + 전체삭제 확인 팝업). 신규 `monitoringRepo.listRecentMonitoringSnapshots`/`deleteMonitoringSnapshot`/`clearAllMonitoringSnapshots`/`clearAllConversationSummaries` + `client.ts` 메모리 폴백(id 단건삭제·LIMIT) + `monitoringGroups.ts`(테스트 포함). `Architecture.md` §3.1·§3.2·트리 갱신, ko/en 문구 추가. `pnpm lint`/`typecheck`/`test`(55파일 290건) 통과. **신규 의존성 없음**. | 해결됨 |

---

## 설계 변경 이력

| 날짜       | 내용                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 영향 문서                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 2026-09-18 | `..\pi` 검토 후 4개 결정 변경: ① LangGraph → 자체 루프 + 훅, ② 코드 스킬/QuickJS 샌드박스 폐기(Agent Skills 표준 마크다운 스킬만), ③ 도구 세트 확장(read/write/edit/ls/grep/find/shell/web_search) + 출력 절단, ④ 세션 저장을 엔트리 기반으로 재설계. 부수: `@langchain/*`·`js-tiktoken`·`rquickjs` 제거, P4-07(Checkpointer) 삭제, P0-08(스파이크)·P2-04(프롬프트 섹션)·P3-08(`/skill:`)·P4-09(압축 UI) 추가. `Phase2-LLM-Engine.md` → `Phase2-Agent-Runtime.md` 교체. | `Architecture.md` §0·§1.3·§2·§4.2~4.4·§5~§9·§12·§13, `ImplementationPlan.md`, Phase 0·2·3·4·5·6·7 |
