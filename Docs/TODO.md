# Fortress 진행상황 체크리스트 (TODO)

이 파일은 전체 프로젝트의 **단일 진행상황 트래커**입니다. 상세 작업 내용은 `Docs/phases/PhaseN-*.md`를 참고하십시오.

## 상태 표기 규칙

- `[ ]` 대기(아직 시작 안 함)
- `[~]` 진행중 (작업을 시작하면 즉시 이 상태로 바꿀 것 — 다른 에이전트와의 충돌 방지)
- `[x]` 완료 (완료 조건까지 확인한 뒤에만 표시)
- `[!]` 블로킹 이슈 있음 (아래 "이슈 로그"에 사유 기록)

각 작업 ID를 시작/완료할 때 **반드시 이 파일을 갱신**하십시오. 이 파일이 최신 상태가 아니면 다른 에이전트가 중복 작업을 하게 됩니다.

---

## Phase 0 — Foundation `[ ]`

- [ ] P0-01 pnpm+Vite7+React19+TS 스캐폴딩
- [ ] P0-02 Tauri 2 통합
- [ ] P0-03 Tailwind + shadcn/ui 설정
- [ ] P0-04 Lint/Format/스크립트 정비
- [ ] P0-05 기본 폴더 구조 생성
- [ ] P0-06 .gitignore/README/초기 커밋
- [ ] P0-07 Ollama 연결 스모크 테스트 스크립트

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

## Phase 2 — LLM Engine `[ ]`

- [ ] P2-01 Ollama 클라이언트 + 모델 목록 조회
- [ ] P2-02 FortressState + buildGraph(최소 루프)
- [ ] P2-03 useChat 훅
- [ ] P2-04 ChatTab 실동작 연결
- [ ] P2-05 내장 도구: fileSystemTool, webSearchTool
- [ ] P2-06 agentNode 도구 바인딩 + toolNode 루프 완성
- [ ] P2-07 에러 처리/재시도 UI

## Phase 3 — Skills & AGENTS.md Loader `[ ]`

- [ ] P3-01 agentsMdParser
- [ ] P3-02 skillScanner
- [ ] P3-03 promptSkill 로더
- [ ] P3-04 codeSkillTool
- [ ] P3-05 QuickJS Rust 샌드박스
- [ ] P3-06 SkillsContext + SkillListPanel + SkillViewerTab
- [ ] P3-07 AGENTS.md 지침 + 활성 스킬 그래프 병합

## Phase 4 — Session Storage & Compression `[ ]`

- [ ] P4-01 tauri-plugin-sql 통합 + 마이그레이션
- [ ] P4-02 Repository 계층(sessions/messages/agents)
- [ ] P4-03 ChatSessionsContext + ChatSessionList 실동작
- [ ] P4-04 useChat SQLite 연결 + 탭 상태 영속화
- [ ] P4-05 tokenCounter
- [ ] P4-06 summarizerNode + 그래프 연결
- [ ] P4-07 SQLite 기반 LangGraph Checkpointer

## Phase 5 — Visualization & HITL `[ ]`

- [ ] P5-01 parseVisualBlocks
- [ ] P5-02 MermaidViewer
- [ ] P5-03 RechartsViewer + JSON DSL
- [ ] P5-04 시각화 지침 시스템 프롬프트 통합
- [ ] P5-05 approvalNode + 위험도 분류
- [ ] P5-06 ApprovalDialog UI + 재개 연결
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

| 날짜 | 작업 ID | 내용 | 상태 |
| --- | --- | --- | --- |
| (예시) 2026-09-18 | P0-00 | 예시: 문서 초안 작성 완료 | 해결됨 |
