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

---

## 설계 변경 이력

| 날짜       | 내용                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 영향 문서                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 2026-09-18 | `..\pi` 검토 후 4개 결정 변경: ① LangGraph → 자체 루프 + 훅, ② 코드 스킬/QuickJS 샌드박스 폐기(Agent Skills 표준 마크다운 스킬만), ③ 도구 세트 확장(read/write/edit/ls/grep/find/shell/web_search) + 출력 절단, ④ 세션 저장을 엔트리 기반으로 재설계. 부수: `@langchain/*`·`js-tiktoken`·`rquickjs` 제거, P4-07(Checkpointer) 삭제, P0-08(스파이크)·P2-04(프롬프트 섹션)·P3-08(`/skill:`)·P4-09(압축 UI) 추가. `Phase2-LLM-Engine.md` → `Phase2-Agent-Runtime.md` 교체. | `Architecture.md` §0·§1.3·§2·§4.2~4.4·§5~§9·§12·§13, `ImplementationPlan.md`, Phase 0·2·3·4·5·6·7 |
