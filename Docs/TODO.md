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

## Phase 1 — Shell & Layout UI `[ ]`

- [ ] P1-01 타입 정의 + WorkspaceTabsContext + SidePanelContext
- [ ] P1-02 ActivityBar
- [ ] P1-03 WorkspaceLayout(리사이저블 스플릿)
- [ ] P1-04 Workspace 페이지 조립
- [ ] P1-05 SidePanel 라우터 + 4개 패널(초기)
- [ ] P1-06 FileTree + Rust fs_commands
- [ ] P1-07 CenterWorkspace + EditorTab(CodeMirror6) + ImageViewerTab
- [ ] P1-08 Chat 탭 Placeholder + 시작 시 기본 탭 자동 오픈
- [ ] P1-09 Settings 라우트 골격
- [ ] P1-10 ThemeContext + 다크모드

## Phase 2 — Agent Runtime & Chat `[ ]`

- [ ] P2-01 Ollama 클라이언트 (/api/chat 스트리밍 + usage + 에러 분류)
- [ ] P2-02 런타임 타입 + 훅 레지스트리 + 도구 레지스트리
- [ ] P2-03 FortressAgent 루프 (턴 반복/큐/재시도/취소)
- [ ] P2-04 시스템 프롬프트 섹션 빌더 + diff
- [ ] P2-05 읽기 도구: read/ls/grep/find + 출력 절단
- [ ] P2-06 변경 도구: write/edit + shell + web_search
- [ ] P2-07 useChat 훅
- [ ] P2-08 ChatTab 실동작 연결 (도구 카드/컨텍스트 게이지 포함)
- [ ] P2-09 에러 처리/재시도 UI

## Phase 3 — Skills & AGENTS.md Loader `[ ]`

- [ ] P3-01 frontmatter 파서
- [ ] P3-02 컨텍스트 파일(AGENTS.md) 계층 수집
- [ ] P3-03 스킬 스캐너 (Agent Skills 표준 검증)
- [ ] P3-04 프롬프트 노출 (`<available_skills>`)
- [ ] P3-05 SkillsContext + 워크스페이스 신뢰 확인
- [ ] P3-06 SkillListPanel + SkillViewerTab (진단 표시 포함)
- [ ] P3-07 프롬프트 병합 (useChat에 데이터 전달)
- [ ] P3-08 `/skill:name` 명시 호출

## Phase 4 — Session Storage & Compaction `[ ]`

- [ ] P4-01 tauri-plugin-sql 통합 + 엔트리 스키마 마이그레이션
- [ ] P4-02 Repository 계층(sessions/entries/agents/settings)
- [ ] P4-03 컨텍스트 재구성 (buildContext)
- [ ] P4-04 ChatSessionsContext + ChatSessionList 실동작
- [ ] P4-05 useChat ↔ DB 연결 + 탭 상태 영속화
- [ ] P4-06 토큰 추정 (Ollama usage 기반) + 압축 예산 해석
- [ ] P4-07 컷 포인트 + 대화 직렬화
- [ ] P4-08 compact() + 훅 등록 + 오버플로우 복구
- [ ] P4-09 압축 UI (배너/게이지/`/compact`)

## Phase 5 — Visualization & HITL `[ ]`

- [ ] P5-01 parseVisualBlocks
- [ ] P5-02 MermaidViewer
- [ ] P5-03 RechartsViewer + JSON DSL
- [ ] P5-04 시각화 지침 프롬프트 섹션
- [ ] P5-05 위험도 분류 + 승인 버스
- [ ] P5-06 승인 훅 등록 + ApprovalDialog
- [ ] P5-07 approvalMode 설정 연동

## Phase 6 — Agent Management UI `[ ]`

- [ ] P6-01 AgentsContext
- [ ] P6-02 AgentListPanel 실동작
- [ ] P6-03 AgentEditorForm / AgentEditorTab
- [ ] P6-04 Agent 삭제 확인 + 기본 승격
- [ ] P6-05 ChatTab에서 Agent 선택/전환
- [ ] P6-06 Agent 사용 통계(축소 버전)

## Phase 7 — Polish & QA `[ ]`

- [ ] P7-01 텍스트/문구 일관성 점검
- [ ] P7-02 키보드 단축키
- [ ] P7-03 에러 바운더리 및 전역 예외 처리
- [ ] P7-04 성능 점검
- [ ] P7-05 Windows 패키징 점검
- [ ] P7-06 수동 QA 시나리오 실행
- [ ] P7-07 README/사용자 가이드

---

## 이슈 로그

작업 중 설계 문서와 실제 구현이 충돌하거나, 소유 파일 범위를 벗어난 수정이 필요했거나, 막힌 문제가 있으면 아래에 날짜/작업ID/내용을 기록하십시오.

| 날짜              | 작업 ID | 내용                      | 상태   |
| ----------------- | ------- | ------------------------- | ------ |
| (예시) 2026-09-18 | P0-00   | 예시: 문서 초안 작성 완료 | 해결됨 |

---

## 설계 변경 이력

| 날짜       | 내용                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 영향 문서                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 2026-09-18 | `..\pi` 검토 후 4개 결정 변경: ① LangGraph → 자체 루프 + 훅, ② 코드 스킬/QuickJS 샌드박스 폐기(Agent Skills 표준 마크다운 스킬만), ③ 도구 세트 확장(read/write/edit/ls/grep/find/shell/web_search) + 출력 절단, ④ 세션 저장을 엔트리 기반으로 재설계. 부수: `@langchain/*`·`js-tiktoken`·`rquickjs` 제거, P4-07(Checkpointer) 삭제, P0-08(스파이크)·P2-04(프롬프트 섹션)·P3-08(`/skill:`)·P4-09(압축 UI) 추가. `Phase2-LLM-Engine.md` → `Phase2-Agent-Runtime.md` 교체. | `Architecture.md` §0·§1.3·§2·§4.2~4.4·§5~§9·§12·§13, `ImplementationPlan.md`, Phase 0·2·3·4·5·6·7 |
