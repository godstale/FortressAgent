# Fortress 아키텍처 설계서

> 이 문서는 [ImplementationPlan.md](./ImplementationPlan.md)의 모든 Phase 작업이 공통으로 참조하는 **단일 진실 공급원(Source of Truth)**입니다.
> 어떤 Phase/작업을 담당하는 에이전트든, 구현을 시작하기 전에 이 문서 전체를 읽어야 합니다.
> 이 문서와 개별 Phase 문서가 충돌하면 **이 문서가 우선**합니다. (충돌을 발견하면 작업을 멈추고 `Docs/TODO.md`의 "이슈" 섹션에 기록하십시오.)

## 0. 한눈에 보는 요약

- **앱 이름**: Fortress
- **형태**: Tauri 2 기반 데스크탑 앱 (Windows 우선, macOS/Linux는 추후 고려)
- **프런트엔드**: React 19 + TypeScript(strict) + Vite 7
- **UI 시스템**: shadcn/ui("new-york") + Radix UI + Tailwind CSS 3 + lucide-react 아이콘
- **레이아웃 참고**: `VivoStudio` (좌측 아이콘 사이드바 + 좌측 리사이저블 패널 + 우측 탭 콘텐츠 영역 + 파일 뷰어)
- **에이전트 관리/채팅 참고**: `VivoAcademy`의 "에이전트 관리" 메뉴 및 강좌 화면 채팅 UI (단, Fortress는 채팅이 **메인 기능**이며 우측 탭 콘텐츠의 기본 탭으로 위치)
- **에이전트 런타임 참고**: `pi`([earendil-works/pi](https://github.com/earendil-works/pi), 로컬 체크아웃 `..\pi`) — 루프/도구/압축/스킬/세션 설계의 기준 (§1.3)
- **LLM 실행**: Ollama(로컬) + **자체 에이전트 루프**(TypeScript, 렌더러 프로세스에서 직접 실행). LangGraph.js 그래프 모델은 채택하지 않음 (§5.0)
- **저장소**: SQLite (`tauri-plugin-sql`) — append-only 엔트리 기반 세션/에이전트/설정 (§4.3)
- **패키지 매니저**: pnpm
- **Git**: `https://github.com/godstale/FortressAgent.git` (origin)

---

## 1. 참고 프로젝트에서 가져오는 것 / 가져오지 않는 것

### 1.1 VivoStudio에서 가져오는 패턴 (UI 레이아웃)

리서치 결과(에이전트 조사 완료, 2026-09-18) 기준으로 아래 패턴을 **동일한 방식으로 재사용**합니다.

| 영역                                        | VivoStudio 참고 파일                                                                                                          | Fortress 대응 위치                                                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 좌측 아이콘 사이드바                        | `src/components/layout/ActivityBar.tsx`                                                                                       | `src/components/layout/ActivityBar.tsx`                                                                                |
| 좌측 리사이저블 패널 + 접기/펼치기          | `src/components/layout/WorkspaceLayout.tsx` (react-resizable-panels, `ImperativePanelHandle`)                                 | `src/components/layout/WorkspaceLayout.tsx`                                                                            |
| 좌측 패널 콘텐츠 라우팅                     | `src/components/explorer/ExplorerPanel.tsx`                                                                                   | `src/components/sidepanel/SidePanel.tsx`                                                                               |
| 우측 탭 바 + 탭 콘텐츠 라우팅               | `src/components/workspace/CenterWorkspace.tsx`                                                                                | `src/components/workspace/CenterWorkspace.tsx`                                                                         |
| 탭 상태 관리(Context, 멱등 openTab, 영속화) | `src/lib/context/WorkspaceTabsContext.tsx`                                                                                    | `src/lib/context/WorkspaceTabsContext.tsx`                                                                             |
| 파일 트리 탐색기                            | `src/components/explorer/FileTree.tsx`                                                                                        | `src/components/explorer/FileTree.tsx`                                                                                 |
| 이미지 뷰어 탭                              | `src/components/workspace/ImageViewerTab.tsx` (`convertFileSrc` + 줌)                                                         | `src/components/workspace/ImageViewerTab.tsx`                                                                          |
| 텍스트 파일 편집 탭                         | `src/components/workspace/EditorTab.tsx` (textarea 기반, autosave)                                                            | `src/components/workspace/EditorTab.tsx` (단, **CodeMirror 6로 실제 문법 강조 추가** — VivoStudio는 없었음, 개선 사항) |
| Context per concern 상태관리                | `src/lib/context/*`                                                                                                           | `src/lib/context/*`                                                                                                    |
| 다크 우선 테마(CSS 변수)                    | `src/index.css`, `ThemeContext.tsx`                                                                                           | 동일                                                                                                                   |
| Tauri IPC 파일 커맨드 네이밍                | `read_text_file`, `write_text_file`, `read_project_folder_tree`, `create_file`, `create_folder`, `rename_path`, `delete_path` | 동일한 커맨드명 재사용 (일관성 유지)                                                                                   |

**가져오지 않는 것**: VivoStudio의 "fake Supabase" DB 클라이언트, 강좌(Course) 관련 기능, TTS, 3D/애니메이션 카드 렌더러, CLI 에이전트(Claude Code/Codex) 터미널 런처, 스플릿 탭 드래그앤드롭(1단계 고정 분할)은 **1차 스코프에서 제외**(Phase 7 이후 "선택적 확장"으로만 고려).

### 1.2 VivoAcademy에서 가져오는 패턴 (에이전트 관리 UI + 채팅)

| 영역                                            | VivoAcademy 참고 파일                                                                         | 가져오는 것                                                                                                                          | 가져오지 않는 것                                                                                                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 에이전트 목록/생성/수정/삭제 UI 구조            | `src/pages/Agents.tsx`, `AddAgentModal.tsx`, `AgentDetail.tsx`, `AgentSettingsTab.tsx`        | 카드 그리드 목록, 생성 다이얼로그의 단계형 폼 UX, 상세 페이지의 탭(통계/대화/설정) 구조, 삭제 확인 다이얼로그, 빈 상태 CTA           | "연결 프로필"(endpoint/apiKey/harness) 데이터 모델 자체는 미사용 — Fortress의 Agent는 **로컬 LLM 페르소나/프리셋**이므로 데이터 모델은 새로 정의 (§4.2)   |
| 채팅 UI 골격                                    | `src/pages/Learn.tsx`의 AI 튜터 탭                                                            | 메시지 리스트+입력창 레이아웃, react-markdown+remark-gfm 렌더링, 복사 버튼, 스트리밍 델타 반영 방식, 컨텍스트 압축 트리거 개념       | 강좌/체크포인트/카드 컨텍스트 주입 로직, 페이지-로컬 구현 방식(대신 공용 `useChat` 훅으로 재구성 — VivoAcademy 자체에도 없던 것을 Fortress에서 새로 만듦) |
| 스트리밍 아키텍처                               | `src/lib/agent/client.ts`의 `sendAgentChat` (요청-스코프 이벤트 리스너 → 최종 메시지 resolve) | **인터페이스 형태**만 참고. Fortress는 Ollama `/api/chat`을 프런트엔드에서 직접 스트리밍하고, UI는 §5.4의 `AgentEvent` 스트림만 구독 | Rust SSE 파서 자체는 불필요(로컬 LLM 호출은 JS에서 직접)                                                                                                  |
| 히든 메시지 시그널링(`<!-- HIDDEN_MESSAGE -->`) | 두 채팅 화면 모두                                                                             | **가져오지 않음.** Fortress는 Ollama의 정식 tool-calling과 §5.4의 구조화된 이벤트를 사용                                             |

**중요한 설계 차이 (사용자 확정 사항)**: VivoAcademy의 "Agent"는 외부 서버 연결 프로필이지만, Fortress의 "Agent"는 **단일 공용 에이전트 런타임에 주입되는 설정값(페르소나/프리셋)**입니다. 즉 Agent마다 별도의 런타임을 만들지 않고, 하나의 `FortressAgent` 인스턴스가 `systemPrompt`, `model`, `enabledSkills`, `enabledBuiltinTools`, `temperature`, `contextSize` 등의 설정을 파라미터로 받아 동작합니다. (§4.2, §5)

### 1.3 pi에서 가져오는 패턴 (에이전트 런타임)

`pi`는 프로덕션에서 쓰이는 TypeScript 에이전트 하네스이며, Fortress가 만들려는 것과 구조가 가장 가깝습니다. **코드를 복사하지 않고 설계만 재구현**합니다(라이선스는 MIT이나 의존성 스택이 다름 — `AGENTS.md` 참고).

| 영역                    | pi 참고 위치                                                                                      | Fortress가 가져오는 것                                                                                                                                                                                                                      | 가져오지 않는 것                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 에이전트 루프 + 확장 훅 | `packages/agent/src/types.ts`(`AgentLoopConfig`), `src/agent.ts`(`Agent`)                         | `beforeToolCall`/`afterToolCall`/`transformContext`/`shouldStopAfterTurn`/`prepareNextTurn` 콜백 구조, steering/follow-up 큐, `abort()`, 이벤트 스트림 이름                                                                                 | `Context`/telemetry 전파, 멀티 프로바이더 추상화(`packages/ai`)                                                             |
| 내구성 런타임           | `packages/agent/docs/harness.md` (operation state machine, 3-store)                               | **개념만** — "턴 경계에서만 영속화한다"는 원칙                                                                                                                                                                                              | 트랜잭션 단위 재시작점, intent/settlement 2-commit, 크래시 복구, 브랜치 트리. Fortress는 단일 사용자 데스크탑 앱이므로 과잉 |
| 컨텍스트 압축           | `packages/agent/src/harness/compaction/compaction.ts`, `packages/coding-agent/docs/compaction.md` | 트리거식(`reserveTokens`), usage 기반 토큰 추정, `keepRecentTokens` 컷 포인트 탐색, toolResult 분리 금지, 구조화 요약 포맷, 증분(previousSummary) 업데이트, 파일 조작 누적 추적, overflow 복구                                              | 브랜치 요약(`/tree`), split-turn 2단 요약(1차 스코프 제외, §13)                                                             |
| 스킬                    | `packages/coding-agent/src/core/skills.ts`, `docs/skills.md`                                      | [Agent Skills 표준](https://agentskills.io/specification) 준수 — SKILL.md 스캔, frontmatter 검증, 이름 충돌 처리, `<available_skills>` XML 프롬프트 노출, **프로그레시브 디스클로저**(도구가 아니라 `read`로 로드), `/skill:name` 명시 호출 | 패키지(`pi.skills`) 소스, 확장(extension) 시스템                                                                            |
| AGENTS.md               | `packages/coding-agent/src/core/resource-loader.ts` (`loadProjectContextFiles`)                   | 후보 파일명 순서, **조상 디렉터리 계층 수집**, 루트→cwd 병합 순서                                                                                                                                                                           | git worktree 그림자 처리(Fortress는 워크스페이스 1개만 염)                                                                  |
| 시스템 프롬프트         | `packages/coding-agent/src/core/system-prompt.ts`                                                 | 순서 있는 **섹션 맵** + `diffSystemPromptSections()` 부분 갱신                                                                                                                                                                              | pi 자체 문서 섹션                                                                                                           |
| 도구 세트               | `packages/coding-agent/src/core/tools/`                                                           | `read`(offset/limit + 줄번호) / `write` / `edit`(부분 치환) / `ls` / `grep` / `find` / 셸, 출력 이중 상한 절단(`truncate.ts`)                                                                                                               | `powershell`/`bash` 이원화(Fortress는 단일 `shell` 도구로 OS별 분기), 파일 변경 큐                                          |
| 세션 저장               | `packages/coding-agent/docs/session-format.md`, `harness.md` Part 1–2                             | append-only **엔트리**(`message`/`compaction`/`custom`) + `parent_id` + JSON payload, `firstKeptEntryId`로 압축 경계 표현                                                                                                                   | JSONL 백엔드, 값/리스트 스토어, usage ledger, 브랜치 인덱스                                                                 |

**pi에서 의도적으로 가져오지 않는 가장 큰 것**: pi의 harness는 "프로세스가 임의 시점에 죽어도 정착된 부수효과를 반복하지 않는" 내구성을 위해 스토리지 트랜잭션 단위의 상태 기계를 갖습니다. Fortress는 단일 사용자 로컬 데스크탑 앱이므로 이 비용을 지불하지 않고, **턴 경계에서만 엔트리를 영속화**합니다. 그 대가로 "스트리밍/도구 실행/승인 대기 중 앱이 강제 종료되면 해당 턴은 폐기되고 마지막 완료 턴까지만 복원된다"는 한계를 받아들입니다 (§4.3, §8.3에 명시).

---

## 2. 전체 디렉터리 구조 (목표 상태)

Phase 0에서 골격을 만들고, 이후 Phase에서 하위 폴더를 채워 나갑니다. **각 Phase 문서는 자신이 새로 만드는 파일/폴더만 명시하며, 아래 트리는 최종 완성 모습입니다.**

```
Fortress/
├── AGENTS.md
├── CLAUDE.md
├── .gitignore
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── components.json                # shadcn/ui 설정
├── index.html
├── Docs/
│   ├── FortressPlan.txt           # 최초 리서치 메모 (수정 금지, 읽기 전용 이력)
│   ├── Architecture.md            # 본 문서
│   ├── ImplementationPlan.md      # 마스터 로드맵
│   ├── TODO.md                    # 진행상황 체크리스트 (전 Phase 공용)
│   └── phases/
│       ├── Phase0-Foundation.md
│       ├── Phase1-Shell-UI.md
│       ├── Phase2-Agent-Runtime.md
│       ├── Phase3-Skills-Agents-Loader.md
│       ├── Phase4-Session-Storage.md
│       ├── Phase5-Visualization-HITL.md
│       ├── Phase6-Agent-Management-UI.md
│       └── Phase7-Polish-QA.md
├── src/
│   ├── main.tsx
│   ├── App.tsx                     # HashRouter, Provider 조합
│   ├── index.css
│   ├── pages/
│   │   └── Settings/                # 전체 화면 라우트 (탭이 아님, VivoStudio Settings 패턴)
│   │       ├── SettingsLayout.tsx
│   │       ├── SettingsGeneral.tsx     # 언어/테마
│   │       ├── SettingsModel.tsx       # Ollama 연결, 기본 모델, contextSize, 압축 임계값
│   │       └── SettingsApproval.tsx    # HITL 승인 모드 기본값
│   ├── components/
│   │   ├── layout/
│   │   │   ├── ActivityBar.tsx          # 좌측 아이콘 사이드바
│   │   │   ├── WorkspaceLayout.tsx      # 좌/우 리사이저블 스플릿
│   │   │   └── TitleBar.tsx             # 커스텀 타이틀바(선택)
│   │   ├── sidepanel/
│   │   │   └── SidePanel.tsx            # activeView에 따라 4개 패널 라우팅
│   │   ├── explorer/
│   │   │   └── FileTree.tsx
│   │   ├── chatsessions/
│   │   │   └── ChatSessionList.tsx      # 대화 목록 패널
│   │   ├── agents/
│   │   │   ├── AgentListPanel.tsx
│   │   │   ├── AgentCard.tsx
│   │   │   └── AgentEditorForm.tsx
│   │   ├── skills/
│   │   │   └── SkillListPanel.tsx
│   │   ├── workspace/
│   │   │   ├── CenterWorkspace.tsx      # 탭 바 + 탭 콘텐츠 라우팅
│   │   │   ├── ChatTab.tsx
│   │   │   ├── EditorTab.tsx
│   │   │   ├── ImageViewerTab.tsx
│   │   │   ├── AgentEditorTab.tsx
│   │   │   └── SkillViewerTab.tsx
│   │   ├── chat/
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── MermaidViewer.tsx
│   │   │   ├── RechartsViewer.tsx
│   │   │   └── ApprovalDialog.tsx        # HITL 승인 팝업
│   │   └── ui/                            # shadcn/ui 프리미티브 (자동 생성)
│   ├── lib/
│   │   ├── context/
│   │   │   ├── WorkspaceTabsContext.tsx
│   │   │   ├── SidePanelContext.tsx
│   │   │   ├── ChatSessionsContext.tsx
│   │   │   ├── AgentsContext.tsx
│   │   │   ├── SkillsContext.tsx
│   │   │   ├── SettingsContext.tsx
│   │   │   └── ThemeContext.tsx
│   │   ├── agent/                          # 에이전트 런타임 (§5)
│   │   │   ├── types.ts                    # AgentTool / AgentToolResult / AgentEvent / AgentMessage
│   │   │   ├── agent.ts                    # FortressAgent 클래스 (공개 표면 + 이벤트)
│   │   │   ├── loop.ts                     # 턴 루프 (스트림 → 도구 실행 → 반복)
│   │   │   ├── hooks.ts                    # AgentHooks 타입 + composeHooks
│   │   │   ├── hookRegistry.ts             # 확장점: Phase 4/5가 훅을 등록 (§5.6)
│   │   │   ├── queue.ts                    # steering / follow-up 큐
│   │   │   └── retry.ts                    # RetryPolicy + 지수 백오프
│   │   ├── llm/
│   │   │   ├── ollamaClient.ts             # /api/chat 스트리밍, /api/tags, /api/show
│   │   │   └── messageMapper.ts            # AgentMessage ↔ Ollama 메시지 변환
│   │   ├── prompt/
│   │   │   ├── buildSystemPrompt.ts        # 순서 있는 섹션 맵 생성 (§5.5)
│   │   │   └── diffSections.ts             # 변경된 섹션만 패치
│   │   ├── tools/
│   │   │   ├── registry.ts                 # 내장 도구 레지스트리 (BuiltinToolId → AgentTool)
│   │   │   ├── truncate.ts                 # 출력 이중 상한(줄/바이트) 절단
│   │   │   ├── risk.ts                     # 도구 → RiskLevel 매핑 (§8.1)
│   │   │   ├── read.ts  write.ts  edit.ts
│   │   │   ├── ls.ts    grep.ts   find.ts
│   │   │   ├── shell.ts                    # OS별 셸 실행 (항상 승인, §8.1)
│   │   │   └── webSearch.ts
│   │   ├── skills/                         # §6
│   │   │   ├── contextFiles.ts             # AGENTS.md 계층 수집
│   │   │   ├── scanner.ts                  # SKILL.md 스캔 + frontmatter 검증
│   │   │   ├── frontmatter.ts
│   │   │   └── formatForPrompt.ts          # <available_skills> XML
│   │   ├── compaction/                     # §9
│   │   │   ├── settings.ts                 # reserveTokens / keepRecentTokens 해석
│   │   │   ├── estimate.ts                 # usage 기반 토큰 추정
│   │   │   ├── cutPoint.ts                 # 유효 컷 포인트 탐색
│   │   │   ├── serialize.ts                # 요약 입력용 대화 직렬화
│   │   │   ├── compact.ts                  # prepare + 요약 호출 + 엔트리 생성
│   │   │   └── register.ts                 # transformContext 훅 등록
│   │   ├── approval/                       # §8
│   │   │   ├── approvalBus.ts              # 승인 요청 ↔ UI 응답 브리지
│   │   │   └── register.ts                 # beforeToolCall 훅 등록
│   │   ├── db/
│   │   │   ├── client.ts                   # tauri-plugin-sql 래퍼
│   │   │   ├── migrations/
│   │   │   │   └── 0001_init.sql
│   │   │   ├── buildContext.ts             # 엔트리 → LLM 컨텍스트 재구성 (§4.3)
│   │   │   └── repositories/
│   │   │       ├── sessionsRepo.ts
│   │   │       ├── entriesRepo.ts
│   │   │       ├── agentsRepo.ts
│   │   │       └── settingsRepo.ts
│   │   ├── markdown/
│   │   │   └── parseVisualBlocks.ts       # mermaid/recharts 코드펜스 파서
│   │   ├── types/
│   │   │   ├── agent.ts
│   │   │   ├── chat.ts
│   │   │   ├── skill.ts
│   │   │   └── workspaceTab.ts
│   │   └── utils/
│   └── hooks/
│       └── useChat.ts                     # 공용 채팅 훅 (VivoAcademy에 없던 것을 신설)
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/
    │   └── default.json
    └── src/
        ├── main.rs
        ├── lib.rs
        └── commands/
            ├── fs_commands.rs             # read_text_file/write_text_file/... (VivoStudio 네이밍 재사용)
            ├── search_commands.rs         # grep_files / find_files (walkdir + regex + ignore)
            ├── shell_commands.rs          # run_shell (OS별 셸, 타임아웃)
            └── web_commands.rs            # web_search
```

> `.agents/skills/`와 `.claude/skills/`는 **Claude Code 자체의 전역 스킬 미러**이며 Fortress 앱이 런타임에 읽는 `.agents/skills/`(워크스페이스 스킬 폴더)와는 별개입니다. 혼동하지 않도록 §6에서 명확히 구분합니다.

---

## 3. 레이아웃 상세 설계

### 3.1 좌측 아이콘 사이드바 (`ActivityBar.tsx`)

VivoStudio의 `ActivityBar.tsx` 패턴을 그대로 재사용합니다: 데이터 기반 배열, 순수 컨트롤드 컴포넌트, 활성 아이콘에 좌측 accent bar 표시.

```ts
type SidePanelView = 'chat-sessions' | 'explorer' | 'agents' | 'skills' | null;

const ITEMS: {
  view: Exclude<SidePanelView, null>;
  icon: LucideIcon;
  title: string;
}[] = [
  { view: 'chat-sessions', icon: MessageSquare, title: '채팅' },
  { view: 'agents', icon: Bot, title: '에이전트 관리' },
  { view: 'explorer', icon: Files, title: '파일 탐색기' },
  { view: 'skills', icon: Puzzle, title: '스킬 관리' },
];
// 하단 고정: Settings (별도 라우트로 이동, 탭/패널 아님 — VivoStudio와 동일 패턴)
```

- 아이콘 클릭 시 좌측 패널이 없으면 펼치고 해당 뷰로 전환, 이미 활성 상태인 아이콘을 다시 클릭하면 패널이 접힘 (VivoStudio의 `handleActivityBarSelect` 로직 그대로 이식).
- Settings는 `react-router-dom` `<Link to="/settings">`로 이동 (사이드패널이 아닌 전체 화면 전환).

### 3.2 좌측 패널 (`WorkspaceLayout.tsx` + `SidePanel.tsx`)

- `react-resizable-panels`의 `PanelGroup`(`direction="horizontal"`, `autoSaveId="fortress-layout-v1"`) 사용.
- 사이드패널: `defaultSize={20} minSize={16} collapsible collapsedSize={0}`, `ImperativePanelHandle` ref로 ActivityBar와 연동.
- 센터 워크스페이스: `minSize={40}`.
- `SidePanel.tsx`는 `activeView`에 따라 4개 컴포넌트 중 하나를 렌더링하는 얇은 라우터(VivoStudio `ExplorerPanel.tsx`와 동일한 패턴):
  - `chat-sessions` → `ChatSessionList.tsx` (세션 목록, 클릭 시 해당 세션의 `chat` 탭을 열거나 포커스)
  - `agents` → `AgentListPanel.tsx` (Agent 카드 목록, "새 대화 시작"/"편집"/"삭제")
  - `explorer` → `FileTree.tsx`
  - `skills` → `SkillListPanel.tsx` (`.agents/skills` 스캔 결과, 활성/비활성 토글)

### 3.3 우측 탭 콘텐츠 영역 (`CenterWorkspace.tsx`)

VivoStudio의 탭 데이터 모델과 `openTab`/`closeTab` 멱등 로직을 그대로 이식하되, 스플릿 페인 드래그앤드롭 기능은 **1차 스코프 제외**(단일 탭 스트립만 구현, Phase 7 이후 확장 여지로 남김 — 구조상 나중에 추가 가능하도록 탭 상태는 Context로 분리).

```ts
type WorkspaceTabType =
  'chat' | 'editor' | 'image-viewer' | 'agent-editor' | 'skill-viewer';

interface WorkspaceTab {
  id: string; // 예: "chat:${sessionId}", "editor:${filePath}", "agent-editor:${agentId}"
  type: WorkspaceTabType;
  title: string;
  meta?: Record<string, any>;
}
```

- **앱 시작 시 기본 동작**: 열린 탭이 하나도 없으면(최초 실행 또는 복원 실패 시) 자동으로 새 `chat` 탭을 하나 열고 기본 Agent로 새 세션을 시작합니다. → **채팅이 메인 기능**이라는 요구사항의 구현 지점.
- 탭 아이콘 매핑: `chat`→`MessageSquare`, `editor`→`FileCode`, `image-viewer`→`Image`, `agent-editor`→`Bot`, `skill-viewer`→`Puzzle`.
- 탭 콘텐츠는 VivoStudio처럼 **모두 마운트 유지 + `hidden` 클래스로 숨김 전환**(비활성 채팅 탭도 스트리밍 상태 유지).
- 탭 목록/활성 탭 ID는 SQLite `app_settings` 테이블에 디바운스(500ms) 저장 후 재시작 시 복원(`chat` 탭은 세션 ID만 복원하면 메시지는 DB에서 다시 로드되므로 완전 복원 가능 — VivoStudio가 `terminal` 탭을 복원 제외했던 것과 달리 Fortress는 모든 탭 타입을 복원 가능).

### 3.4 파일 뷰어

- `EditorTab.tsx`: VivoStudio와 달리 **CodeMirror 6**을 사용해 실제 문법 강조를 제공합니다(VivoStudio는 textarea였음 — 의도적 개선). 확장자별 language extension 매핑은 VivoStudio의 `CodeEditorPane.tsx`(`src/components/learn/CodeEditorPane.tsx`) 패턴을 참고. Markdown 파일은 원본/분할/미리보기 3단 토글(react-markdown+remark-gfm) 유지.
- `ImageViewerTab.tsx`: VivoStudio 구현을 그대로 이식(`convertFileSrc` + 25~400% 줌).
- PDF 뷰어는 VivoStudio에도 없으며 **1차 스코프 제외**.

---

## 4. 데이터 모델

### 4.1 WorkspaceTab / SidePanelView

§3.3, §3.2 참조. `src/lib/types/workspaceTab.ts`에 정의.

### 4.2 Agent (페르소나/프리셋) — `src/lib/types/agent.ts`

```ts
export type ApprovalMode = 'always' | 'dangerous-only' | 'never';

export interface Agent {
  id: string; // uuid
  name: string;
  description?: string;
  systemPrompt: string;
  model: string; // Ollama 모델 태그, 예: "llama3.1:8b"
  temperature: number; // 0.0 ~ 2.0, 기본 0.7
  contextSize: number; // 토큰 수. 0이면 전역값(app_settings) 상속
  reserveTokens: number; // 압축 트리거 여유분. 0이면 contextSize에서 파생 (§9.1)
  keepRecentTokens: number; // 압축 후 보존할 최근 대화량. 0이면 파생 (§9.1)
  enabledSkills: string[]; // SkillManifest.name 목록 (§4.4)
  enabledBuiltinTools: BuiltinToolId[];
  approvalMode: ApprovalMode; // HITL 세분화, 기본 "dangerous-only"
  isDefault: boolean; // 정확히 하나만 true (VivoAcademy의 is_ai_tutor 불변식과 동일 패턴)
  createdAt: string; // ISO 8601
  updatedAt: string;
}

export type BuiltinToolId =
  'read' | 'write' | 'edit' | 'ls' | 'grep' | 'find' | 'shell' | 'web_search';
```

- **기본 Agent 불변식**: Agent가 1개 이상 존재하면 정확히 하나는 `isDefault === true`. 최초 생성된 Agent가 자동으로 기본이 되고, 기본 Agent 삭제 시 다음 Agent가 승격됩니다. (VivoAcademy `external-agents.ts`의 `is_ai_tutor` 로직을 참고해 `agentsRepo.ts`에 동일하게 구현.)
- **새 Agent의 기본 활성 도구**: `["read", "ls", "grep", "find", "write", "edit"]`. `shell`과 `web_search`는 기본 비활성이며 사용자가 명시적으로 켜야 합니다.
- **`enabledSkills`가 도구 목록이 아닌 이유**: 스킬은 도구로 등록되지 않고 시스템 프롬프트에 이름/설명만 노출됩니다(§6.2). 따라서 `enabledSkills`는 "프롬프트에 노출할 스킬 화이트리스트"이며, 스킬을 실제로 사용하려면 `read` 도구(및 스크립트형 스킬은 `shell`)가 활성화되어 있어야 합니다. `AgentEditorForm`은 스킬을 켜면서 `read`가 꺼져 있으면 경고를 표시합니다.
- **`visualizationTool`을 내장 도구 목록에 넣지 않은 이유**: 로컬 LLM의 함수 호출(tool-calling) 신뢰도가 모델마다 크게 다르므로, 시각화는 "도구 호출"이 아니라 **출력 형식 규약**(시스템 프롬프트에 "필요시 \`\`\`mermaid / \`\`\`recharts 코드펜스로 응답하라"는 지침 포함 + 렌더러가 후처리 파싱)으로 구현합니다. Phase 5에서 상세 설계.

### 4.3 ChatSession / Entry — `src/lib/types/chat.ts`

세션 내용은 "메시지 테이블"이 아니라 **append-only 엔트리 목록**으로 저장합니다. 이유: assistant 메시지의 `toolCalls` 배열·thinking 블록·usage·`stopReason`, 그리고 **압축 경계**를 평면적인 `(role, content)` 스키마로는 표현할 수 없기 때문입니다. pi의 엔트리 모델(§1.3)을 단순화해 가져옵니다.

```ts
export interface ChatSession {
  id: string;
  agentId: string;
  workspaceRoot: string | null; // 이 세션의 cwd (도구/스킬 스코프의 기준)
  title: string; // 최초 사용자 메시지 앞부분으로 자동 생성, 추후 수정 가능
  createdAt: string;
  updatedAt: string;
}

export type EntryType = 'message' | 'compaction' | 'custom';

export interface EntryBase {
  id: string; // UUIDv7 (시간 정렬 가능)
  sessionId: string;
  parentId: string | null; // 선형 체인. 브랜치는 1차 스코프 제외(§13)이나 필드는 유지
  seq: number; // 세션 내 단조 증가
  type: EntryType;
  createdAt: string;
}

export type Entry = MessageEntry | CompactionEntry | CustomEntry;

export interface MessageEntry extends EntryBase {
  type: 'message';
  message: AgentMessage; // §5.2. 전체 메시지를 JSON으로 그대로 보존
}

export interface CompactionEntry extends EntryBase {
  type: 'compaction';
  summary: string;
  firstKeptEntryId: string; // 이 엔트리부터가 "요약되지 않고 남은" 구간
  tokensBefore: number;
  usage?: TokenUsage; // 요약 호출 자체의 비용
  details: { readFiles: string[]; modifiedFiles: string[] };
}

export interface CustomEntry extends EntryBase {
  type: 'custom';
  customType: string; // 예: "compaction_notice", "error_notice"
  payload?: unknown; // UI 전용. LLM 컨텍스트에는 포함되지 않음
}
```

**LLM 컨텍스트 재구성 규칙** (`src/lib/db/buildContext.ts`):

1. 세션의 엔트리를 `seq` 오름차순으로 읽는다.
2. 마지막 `compaction` 엔트리를 찾는다. 없으면 모든 `message` 엔트리가 컨텍스트다.
3. 있으면 → `[요약 메시지] + (firstKeptEntryId 이후의 message 엔트리들)`이 컨텍스트다.
4. `custom` 엔트리는 항상 제외한다(UI 표시 전용).

```
저장된 엔트리 (seq 순):
  1:msg(user)  2:msg(asst)  3:msg(tool)  4:msg(user)  5:msg(asst)  6:msg(tool)  7:cmp
                └──── 요약됨 ────┘        └──────── 유지 ─────────┘    ↑ firstKeptEntryId=4

LLM에 보내는 것:
  [system] [summary(7)] [4] [5] [6]
UI에 보여주는 것:
  [1] [2] [3] [압축 안내 배너] [4] [5] [6]     ← 원본 히스토리는 지우지 않음
```

- **원본은 절대 삭제하지 않습니다.** 압축은 "LLM에 보낼 구간을 바꾸는 것"이지 지우는 것이 아닙니다. 사용자는 스크롤해서 전체 QnA 히스토리를 볼 수 있습니다(원 요구사항).
- VivoAcademy와 달리 **세션 히스토리는 영구 저장**됩니다(카드 이동 시 초기화하는 방식 미채택).
- **영속화 시점**: 사용자 메시지는 전송 즉시, assistant/tool 메시지는 **해당 턴이 끝난 뒤** 한 번에 기록합니다. 스트리밍 중간 상태는 저장하지 않습니다(§1.3 말미의 한계).

### 4.4 SkillManifest — `src/lib/types/skill.ts`

[Agent Skills 표준](https://agentskills.io/specification)을 따릅니다. **스킬 종류(prompt/code) 구분은 없습니다** — 모든 스킬은 `SKILL.md` 하나로 정의되며, 스크립트가 필요하면 스킬 폴더에 넣고 본문에서 상대 경로로 안내합니다(모델이 `shell` 도구로 실행).

```ts
export interface SkillManifest {
  name: string; // frontmatter.name, 없으면 부모 폴더명. 세션 내 유일 (충돌 시 먼저 찾은 것 우선)
  description: string; // frontmatter.description (필수). LLM에게 노출되는 유일한 본문 정보
  filePath: string; // SKILL.md 절대 경로
  baseDir: string; // SKILL.md가 있는 폴더 = 스킬의 상대 경로 기준점
  source: SkillSource; // 어디서 왔는지 (UI 표시 + 충돌 진단용)
  disableModelInvocation: boolean; // true면 프롬프트에서 숨김. /skill:name으로만 호출
}

export type SkillSource = 'global' | 'workspace';

export interface SkillDiagnostic {
  level: 'warning' | 'collision';
  message: string;
  path: string;
}
```

**검증 규칙** (pi `core/skills.ts`와 동일 — 위반해도 경고 후 로드하되, `description`이 없으면 로드하지 않음):

| 필드                       | 규칙                                                             |
| -------------------------- | ---------------------------------------------------------------- |
| `name`                     | 1~64자, `[a-z0-9-]`만, 하이픈으로 시작/끝 불가, 연속 하이픈 불가 |
| `description`              | 필수, 최대 1024자                                                |
| `disable-model-invocation` | 선택, boolean                                                    |

§6에서 스캔 절차와 프롬프트 노출 형식을 정의합니다.

---

## 5. 에이전트 런타임 설계

### 5.0 왜 그래프가 아니라 루프인가 (설계 결정, 2026-09-18)

초안은 LangGraph.js `StateGraph` + `interrupt()` + `BaseCheckpointSaver`를 쓰기로 했으나, `pi`의 실제 구현을 검토한 뒤 **자체 루프 + 콜백 훅** 구조로 변경했습니다.

| 초안(LangGraph)                                                                     | 변경 후                                           | 이유                                                                                        |
| ----------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `agentNode` / `toolNode` / `approvalNode` / `summarizerNode` 4개 노드 + 조건부 엣지 | 단일 `loop.ts`의 턴 루프                          | 노드가 4개뿐이고 분기가 선형이라 그래프 추상화가 순이익을 내지 못함                         |
| `approvalNode`에서 `interrupt()` → 체크포인터 저장 → `Command({resume})` 재개       | `beforeToolCall` 훅이 Promise를 await             | 승인은 "같은 프로세스 안에서 사용자 입력을 기다리는 일". 상태를 직렬화해 재개할 이유가 없음 |
| `BaseCheckpointSaver`를 SQLite로 자체 구현 (P4-07)                                  | **삭제**                                          | 체크포인터가 필요했던 유일한 이유가 `interrupt()` 재개였음                                  |
| 그래프 조립 파일(`buildGraph.ts`)을 Phase 2·3·4·5가 모두 수정                       | 훅 레지스트리(§5.6)에 각 Phase가 자기 파일을 등록 | Phase 간 소유 파일 충돌 제거                                                                |

LangChain/LangGraph 의존성은 제거하고, Ollama HTTP API를 직접 호출합니다. 도구 스키마 검증에는 `zod`만 사용합니다.

> 이후 멀티 에이전트 협업(§13)처럼 진짜 그래프가 필요한 요구가 생기면 그때 도입을 재검토합니다. 지금 도입하면 4개 노드를 위해 런타임 하나를 통째로 떠안게 됩니다.

### 5.1 단일 공용 런타임 원칙

Agent(페르소나)마다 별도 런타임을 만들지 않습니다. `FortressAgent` 인스턴스 하나가 세션 하나를 담당하며, `Agent` 설정값(`systemPrompt`/`model`/`temperature`/도구/스킬)을 생성 시 주입받습니다. 세션이 바뀌면 인스턴스를 새로 만듭니다.

### 5.2 메시지 / 도구 타입 (`src/lib/agent/types.ts`)

```ts
export type AgentMessage =
  | { role: 'system'; content: string; sections?: Record<string, string> }
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string;
      thinking?: string;
      toolCalls?: AgentToolCall[];
      usage?: TokenUsage;
      stopReason: 'stop' | 'toolUse' | 'length' | 'aborted' | 'error';
      errorMessage?: string;
    }
  | {
      role: 'toolResult';
      toolCallId: string;
      toolName: string;
      content: string;
      isError: boolean;
    };

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface AgentToolResult {
  content: string; // LLM에게 돌아가는 텍스트 (절단 후)
  details?: unknown; // UI 렌더링/로그용 원본 (컨텍스트에 포함 안 됨)
  isError?: boolean;
  terminate?: boolean; // 이 배치의 모든 결과가 true면 턴 종료
}

export interface AgentTool<S extends ZodTypeAny = ZodTypeAny> {
  name: string; // LLM에게 노출되는 이름
  label: string; // UI 표시용
  description: string;
  parameters: S; // zod 스키마 → JSON Schema 변환해 Ollama에 전달
  risk: RiskLevel; // §8.1
  executionMode?: 'sequential' | 'parallel'; // 기본 parallel, 파일 변경 도구는 sequential
  execute(
    toolCallId: string,
    params: z.infer<S>,
    signal: AbortSignal,
    onUpdate?: (partial: AgentToolResult) => void,
  ): Promise<AgentToolResult>;
}
```

- **도구는 실패 시 throw**합니다. 루프가 잡아서 `isError: true`인 `toolResult` 메시지로 변환해 LLM에게 돌려줍니다 — 도구 실패가 대화를 끊지 않습니다.
- `details`는 **컨텍스트에 포함되지 않습니다**. 예: `grep` 결과 전체는 `details`, LLM에게는 절단된 상위 N건만.

### 5.3 턴 루프 (`src/lib/agent/loop.ts`)

```
prompt(userMessage)
  └─ emit agent_start
     repeat:
       ├─ transformContext(messages)          ← 압축 훅이 여기 (§9)
       ├─ emit turn_start
       ├─ Ollama /api/chat 스트리밍 (retry 정책 적용, §5.7)
       │    └─ 델타마다 emit message_update
       ├─ emit message_end (assistant)
       ├─ toolCalls 없음 → break
       ├─ toolCalls 각각:
       │    ├─ 인자 스키마 검증 (실패 → isError 결과)
       │    ├─ beforeToolCall()  → { block, reason } 이면 실행 없이 에러 결과  ← 승인 훅 (§8)
       │    ├─ execute()  (parallel/sequential, AbortSignal 전달)
       │    ├─ afterToolCall()  → content/isError 덮어쓰기        ← 절단·정규화 훅
       │    └─ emit tool_execution_end + toolResult 메시지 추가
       ├─ emit turn_end
       ├─ 모든 결과가 terminate:true → break
       ├─ shouldStopAfterTurn() → true면 break
       ├─ steering 큐 배출 → 있으면 메시지 주입하고 계속
       └─ 계속
     ├─ follow-up 큐 배출 → 있으면 주입하고 루프 재진입
     └─ emit agent_end
```

- 도구 결과 메시지는 **assistant가 호출한 순서대로** 컨텍스트에 추가합니다(병렬 실행이어도 순서 보존). 순서가 어긋나면 모델이 어떤 결과가 어떤 호출의 것인지 잃습니다.
- `toolCalls`가 있는 assistant 메시지와 그에 대응하는 `toolResult` 메시지는 **항상 붙어 있어야 합니다**. 압축(§9.3)과 컨텍스트 재구성(§4.3)이 이 불변식을 지켜야 합니다.

### 5.4 이벤트 (`AgentEvent`)

```ts
| { type: "agent_start" }
| { type: "turn_start" }
| { type: "message_start";  message: AgentMessage }
| { type: "message_update"; message: AgentMessage; delta: string }
| { type: "message_end";    message: AgentMessage }
| { type: "tool_execution_start";  toolCallId, toolName, args }
| { type: "tool_execution_update"; toolCallId, partial: AgentToolResult }
| { type: "tool_execution_end";    toolCallId, result: AgentToolResult, isError }
| { type: "turn_end";   message: AgentMessage; toolResults: AgentMessage[] }
| { type: "agent_end";  messages: AgentMessage[] }
| { type: "compaction_start" } | { type: "compaction_end"; entry: CompactionEntry }
| { type: "approval_request"; request: ApprovalRequest }
| { type: "error"; error: AgentRunError }
```

`useChat`은 이 이벤트만 구독합니다. UI는 런타임 내부 구조를 알지 못합니다.

### 5.5 시스템 프롬프트 섹션 (`src/lib/prompt/buildSystemPrompt.ts`)

시스템 프롬프트를 한 덩어리 문자열이 아니라 **순서 있는 섹션 맵**으로 만듭니다.

```ts
buildSystemPromptSections({ agent, tools, contextFiles, skills, cwd }): Record<string, string>
// 순서: preamble → tools → rules → addendum → project_context
//       → skills → visualization → cwd
```

- `preamble`을 제외한 각 섹션은 `<section_name>…</section_name>`로 감쌉니다(모델이 나중 갱신을 같은 섹션에 대응시킬 수 있게).
- 세션 도중 스킬 토글·워크스페이스 변경·도구 활성화가 일어나면 프롬프트 전체를 다시 보내지 않고 `diffSections(previous, current)`로 **변경된 섹션만** 새 system 메시지로 주입합니다.
- `visualization` 섹션 내용은 §10.

### 5.6 확장점(훅) 규약 — Phase 간 파일 충돌 방지

```ts
// src/lib/agent/hooks.ts        (Phase 2가 소유, 이후 수정 없음)
export interface AgentHooks {
  beforeToolCall?(
    ctx: BeforeToolCallContext,
    signal: AbortSignal,
  ): Promise<
    { block?: boolean; reason?: string; terminate?: boolean } | undefined
  >;
  afterToolCall?(
    ctx: AfterToolCallContext,
    signal: AbortSignal,
  ): Promise<Partial<AgentToolResult> | undefined>;
  transformContext?(
    messages: AgentMessage[],
    signal: AbortSignal,
  ): Promise<AgentMessage[]>;
  shouldStopAfterTurn?(
    ctx: ShouldStopAfterTurnContext,
  ): boolean | Promise<boolean>;
  /** 컨텍스트 초과로 요청이 거부됐을 때. 축소된 컨텍스트를 반환하면 루프가 1회 재시도한다 (§9.5). */
  onContextOverflow?(
    messages: AgentMessage[],
    signal: AbortSignal,
  ): Promise<AgentMessage[] | undefined>;
}

// src/lib/agent/hookRegistry.ts (Phase 2가 소유, 이후 수정 없음)
export function registerHooks(id: string, hooks: AgentHooks): void;
export function getRegisteredHooks(): AgentHooks; // 등록 순서대로 합성
```

합성 규칙: `beforeToolCall`은 **하나라도 `block`을 반환하면 차단**(단축 평가), `transformContext`는 등록 순서대로 체이닝, `afterToolCall`은 등록 순서대로 결과를 덮어씀.

각 Phase는 **자기 소유 파일에서** 등록만 합니다:

| 훅                                              | 등록 위치                        | Phase |
| ----------------------------------------------- | -------------------------------- | ----- |
| `afterToolCall` (출력 절단)                     | `src/lib/tools/registry.ts`      | 2     |
| `transformContext` + `onContextOverflow` (압축) | `src/lib/compaction/register.ts` | 4     |
| `beforeToolCall` (승인)                         | `src/lib/approval/register.ts`   | 5     |

등록 함수 호출은 `src/lib/agent/bootstrap.ts`에 **Phase당 import 한 줄씩** 추가합니다. 이것이 Phase 3·4·5가 공유하는 유일한 파일이며, 한 줄 추가라 병렬 작업 시 충돌이 나도 병합이 자명합니다.

### 5.7 재시도 / 취소 / 큐잉

**재시도** (`src/lib/agent/retry.ts`): `{ enabled: true, maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 60000 }`. 지수 백오프. 네트워크 오류·5xx·타임아웃만 재시도하고, 모델 없음(404)·잘못된 요청(400)은 즉시 실패시킵니다. 재시도 중 `AbortSignal`이 발화하면 즉시 중단합니다.

**취소**: `agent.abort()`가 현재 실행의 `AbortController`를 발화시킵니다. 스트림은 즉시 끊기고, **실행 중인 도구에도 같은 signal이 전달됩니다**(도구가 이를 존중할 책임). 중단된 턴의 assistant 메시지는 `stopReason: "aborted"`로 남기되 저장하지 않습니다(§4.3).

**큐잉** (`src/lib/agent/queue.ts`):

| 메서드          | 주입 시점                                         | UI                                   |
| --------------- | ------------------------------------------------- | ------------------------------------ |
| `steer(msg)`    | 현재 턴의 도구 실행이 끝난 직후, 다음 LLM 호출 전 | 스트리밍 중 입력창에 타이핑 후 Enter |
| `followUp(msg)` | 에이전트가 종료하려는 시점                        | 스트리밍 중 `Shift+Enter`로 예약     |

두 큐 모두 기본 배출 모드는 `"one-at-a-time"`입니다. 이것으로 "스트리밍 중에는 입력창 비활성화"라는 열등한 UX를 대체합니다.

### 5.8 Ollama 연동 (`src/lib/llm/ollamaClient.ts`)

- `POST /api/chat` (`stream: true`, `tools: [...]`)를 `fetch`로 직접 호출하고 NDJSON 라인을 파싱합니다. LangChain 래퍼를 쓰지 않습니다.
- 응답 마지막 청크의 `prompt_eval_count` / `eval_count`를 `TokenUsage`로 매핑합니다 — **압축 트리거의 토큰 계산은 이 실측값을 씁니다**(§9.2). 별도 토크나이저 라이브러리가 필요 없습니다.
- `GET /api/tags`로 설치된 모델 목록, `POST /api/show`로 모델의 컨텍스트 길이(`model_info`의 `*.context_length`)를 조회합니다. Agent의 `contextSize`가 0이면 이 값을 씁니다.
- 기본 baseUrl: `http://127.0.0.1:11434` (Settings에서 변경 가능, `SettingsContext`).
- Tauri v2 CSP의 `connect-src`에 `http://127.0.0.1:11434`를 허용해야 합니다 (`src-tauri/tauri.conf.json`의 `app.security.csp`, Phase 0).
- **모델 호환성**: tool-calling을 지원하지 않는 모델이 선택되면 도구 없이 동작하고 UI에 경고 배지를 표시합니다. 어떤 모델이 멀티턴 tool-calling을 견디는지는 P0-08 스파이크에서 먼저 확인합니다.

---

## 6. AGENTS.md / 스킬 로더 설계 (Fortress 앱 런타임 기능)

> **주의**: 이것은 Fortress *앱이 연 워크스페이스 폴더*를 스캔하는 기능입니다. Fortress *리포지토리 자체*의 루트 `AGENTS.md`(개발 지침 파일)나 `.agents/skills/`(Claude Code 전역 스킬 미러)와는 무관합니다.

### 6.1 AGENTS.md(컨텍스트 파일) 수집 — `src/lib/skills/contextFiles.ts`

pi의 `loadProjectContextFiles`와 동일한 규칙입니다.

1. 한 디렉터리에서의 후보 파일명 **우선순위**: `AGENTS.override.md` → `AGENTS.md` → `AGENTS.MD` → `CLAUDE.md` → `CLAUDE.MD`. 첫 번째로 존재하는 것 하나만 씁니다.
2. **전역** 설정 디렉터리(`%APPDATA%/Fortress/AGENTS.md`)를 먼저 수집합니다.
3. 워크스페이스 루트에서 **파일시스템 루트까지 모든 조상 디렉터리**를 올라가며 수집하되, 최종 순서는 **루트 → 워크스페이스**(바깥쪽이 먼저, 안쪽이 나중에 와서 덮어씀)입니다.
4. 각 파일은 시스템 프롬프트의 `project_context` 섹션에 경로와 함께 들어갑니다:
   ```
   <project_instructions path="C:/work/proj/AGENTS.md">
   …파일 전문…
   </project_instructions>
   ```
5. 같은 경로를 두 번 넣지 않습니다(중복 제거).

### 6.2 스킬 스캔과 노출 — 프로그레시브 디스클로저

**스킬은 도구로 등록하지 않습니다.** (초안의 `promptSkill` → `DynamicTool` 설계는 폐기. 이유: 스킬 N개를 전부 도구 스키마로 만들면 스킬이 늘수록 컨텍스트를 잠식하고, [Agent Skills 표준](https://agentskills.io/integrate-skills)과도 어긋남.)

**스캔 위치** (`src/lib/skills/scanner.ts`):

| 스코프      | 경로                                                     |
| ----------- | -------------------------------------------------------- |
| `global`    | `%APPDATA%/Fortress/skills/`                             |
| `workspace` | 워크스페이스의 `.agents/skills/` (루트 및 조상 디렉터리) |

**탐색 규칙** (pi `loadSkillsFromDir`와 동일):

1. 어떤 디렉터리에 `SKILL.md`가 있으면 그 디렉터리를 **스킬 루트**로 보고 **더 내려가지 않습니다**.
2. 없으면 하위 디렉터리로 재귀합니다. `node_modules`와 `.`으로 시작하는 폴더는 건너뜁니다.
3. `.gitignore`/`.ignore`를 존중합니다.
4. `description`이 없거나 frontmatter가 깨진 `SKILL.md`는 **로드하지 않고 경고**를 남깁니다(§4.4 검증 규칙).
5. 이름이 충돌하면 **먼저 찾은 것을 유지**하고 충돌 진단을 남깁니다. 심링크로 같은 파일이 두 번 잡히면 조용히 건너뜁니다.

**프롬프트 노출** (`formatForPrompt.ts`) — `skills` 섹션에 들어가는 내용:

```xml
The following skills provide specialized instructions for specific tasks.
Use the read tool to load a skill's file when the task matches its description.
When a skill file references a relative path, resolve it against the skill directory
(the parent of SKILL.md) and use that absolute path in tool commands.

<available_skills>
  <skill>
    <name>pdf-tools</name>
    <description>Extracts text and tables from PDF files…</description>
    <location>C:/work/proj/.agents/skills/pdf-tools/SKILL.md</location>
  </skill>
</available_skills>
```

즉 **항상 컨텍스트에 있는 것은 이름·설명·경로 세 줄뿐**이고, 모델이 필요하다고 판단하면 `read` 도구로 본문을 가져갑니다. 스킬이 스크립트를 제공하면 본문의 안내를 따라 `shell` 도구로 실행합니다.

`disableModelInvocation: true`인 스킬과 `agent.enabledSkills`에 없는 스킬은 이 목록에서 제외됩니다.

### 6.3 SKILL.md 포맷

````markdown
---
name: my-skill
description: 무엇을 하고 언제 쓰는지. 구체적으로 — 이 한 줄이 모델의 로드 여부를 결정합니다.
---

# My Skill

## Setup

```bash
cd <skill dir> && npm install
```

## Usage

```bash
./scripts/process.sh <input>
```

자세한 내용은 [레퍼런스](references/REFERENCE.md) 참고.
````

스킬 폴더 안의 `scripts/`, `references/`, `assets/` 등은 자유 형식이며, 본문에서 **스킬 디렉터리 기준 상대 경로**로 참조합니다.

### 6.4 `/skill:name` 명시 호출

모델이 설명만 보고 스킬을 안 읽는 경우가 흔하므로, 사용자가 채팅 입력창에서 `/skill:<name>`을 입력하면 해당 `SKILL.md` 본문을 즉시 user 메시지로 주입합니다. 뒤에 붙인 인자는 본문 뒤에 `User: <args>`로 덧붙입니다. `disableModelInvocation: true`인 스킬은 이 경로로만 쓸 수 있습니다.

---

## 7. 안전 경계

초안의 "QuickJS 3단계 샌드박스"는 폐기했습니다. 이유: `index.json`/`index.js` 코드 스킬은 Agent Skills 표준에 없는 개념이고, 이를 위해 `rquickjs` 통합과 JSON Schema→zod 변환기를 자체 구현하는 비용이 얻는 것보다 큽니다. 스킬은 마크다운 문서이고, 실행이 필요하면 스킬이 제공하는 스크립트를 `shell` 도구로 돌립니다.

남는 안전 경계는 두 겹입니다.

| 레이어                | 기술                                                                                                                                          | 구현 위치                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Layer 1: OS/FS 스코프 | 모든 파일 도구가 Rust 커맨드에서 **세션의 `workspaceRoot` 밖 경로를 거부**. 심링크는 canonicalize 후 재검사. Tauri 2 Capabilities로 이중 방어 | `src-tauri/src/commands/fs_commands.rs`, `capabilities/default.json` |
| Layer 2: 사람의 승인  | `beforeToolCall` 훅이 위험 도구 실행 전 사용자 확인                                                                                           | §8, `src/lib/approval/`                                              |

**셸 도구는 스코프로 막을 수 없습니다.** `run_shell`은 `cwd`만 워크스페이스로 고정할 뿐 임의 명령을 실행할 수 있으므로, **`approvalMode`와 무관하게 항상 승인을 요구**합니다(§8.1). 승인 다이얼로그에 실행될 명령 전문을 그대로 보여줍니다. Agent의 `enabledBuiltinTools`에서 `shell`은 기본 비활성이며, Settings에 위험 경고를 함께 표시합니다.

**스킬은 신뢰 경계 밖입니다.** 스킬은 모델에게 임의 행동을 지시할 수 있는 텍스트이므로, 워크스페이스를 처음 열 때 "이 폴더의 `AGENTS.md`/스킬을 신뢰하고 로드할까요?"를 한 번 묻고(폴더 경로 단위로 기억), 거부하면 컨텍스트 파일과 워크스페이스 스킬을 로드하지 않습니다.

---

## 8. Human-in-the-Loop (HITL) 승인 모드

### 8.1 위험도 분류 (`src/lib/tools/risk.ts`)

| 도구                            | 위험도       | `dangerous-only`에서 승인 필요?         |
| ------------------------------- | ------------ | --------------------------------------- |
| `read` / `ls` / `grep` / `find` | low          | 아니오                                  |
| `web_search`                    | low          | 아니오                                  |
| `write` / `edit`                | high         | 예                                      |
| `shell`                         | **critical** | **예 — `approvalMode`와 무관하게 항상** |

- `approvalMode: "always"` — 모든 도구 호출에 승인 요구
- `approvalMode: "dangerous-only"` (기본값) — `high` 이상만
- `approvalMode: "never"` — `high`도 자동 승인. 단 `critical`(셸)은 **여전히 승인 필요**. Settings에서 명확한 경고와 함께 제공

### 8.2 흐름

```
루프 → toolCalls 결정
      → beforeToolCall 훅 (src/lib/approval/register.ts)
          ├─ 승인 불필요 → undefined 반환 → 즉시 실행
          └─ 승인 필요 → approvalBus.request({toolCallId, toolName, args, risk})
                          → emit approval_request → ApprovalDialog 렌더
                          → await (사용자 응답 Promise)
                              ├─ [승인] → undefined 반환 → 실행
                              └─ [거절] → { block: true, reason } 반환
                                          → 루프가 isError:true toolResult 생성
                                          → 거절 사유가 LLM에 전달되어 대안 모색 유도
```

`ApprovalDialog`는 도구명, 인자(JSON pretty-print, 셸은 명령 전문), 위험도 배지를 표시하고 "승인" / "거절(+사유 입력)" / "이 세션에서 이 도구는 항상 승인" 버튼을 제공합니다.

`approvalBus`는 실행 취소(`abort()`)와 창 닫힘도 처리해야 합니다 — 대기 중인 Promise를 거절 처리하고 루프를 정리합니다.

### 8.3 한계 (의도적)

승인 대기 중 앱이 강제 종료되면 해당 턴은 복원되지 않습니다. 재시작 시 마지막으로 완료된 턴까지만 복원되고, 사용자는 직전 질문을 다시 보낼 수 있습니다. pi처럼 내구성 있는 재개를 하려면 연산 상태 기계와 스토리지 트랜잭션이 필요한데(§1.3), 단일 사용자 데스크탑 앱에 그 비용은 과합니다.

---

## 9. 컨텍스트 자동 압축

초안의 "전체 토큰 수가 `contextSize`의 75%를 넘으면 `[요약, 최근 2개]`로 치환"은 세 가지 문제가 있어 pi의 알고리즘으로 교체했습니다: ① tiktoken 근사치는 로컬 모델 토크나이저와 맞지 않는데 Ollama가 실측값을 주고 있음, ② "최근 2개"는 assistant의 `toolCalls`와 그 `toolResult`를 분리시켜 요청을 깨뜨림, ③ 요약 형식·반복 압축 전략이 없음.

### 9.1 트리거와 예산 (`src/lib/compaction/settings.ts`)

```
압축 트리거:  contextTokens > contextSize - reserveTokens
```

`reserveTokens`는 "요약 프롬프트와 다음 응답을 위해 비워둘 양"입니다. Agent에 명시값이 없으면(0) `contextSize`에서 파생합니다:

```ts
reserveTokens = clamp(contextSize * 0.25, 1024, 16384);
keepRecentTokens = clamp(contextSize * 0.35, 1024, 20000);
```

> 파생식의 0.25는 의도적입니다 — `contextSize`가 8192면 트리거가 정확히 **75%**(6144)가 되어 원 요구사항의 "75% 자동 압축"을 그대로 만족합니다. 다만 저장·설정 단위는 비율이 아니라 **절대 토큰 수**입니다. 컨텍스트 128K 모델에서 "25% 여유"는 32K로 과하므로 상한(16384)을 두고, 사용자가 Agent별로 직접 지정할 수 있게 합니다.

pi의 기본값(16384/20000)을 그대로 쓰지 않는 이유: pi는 200K급 상용 모델을, Fortress는 8K~128K 로컬 모델을 전제합니다.

### 9.2 토큰 추정 (`src/lib/compaction/estimate.ts`)

`js-tiktoken`을 **쓰지 않습니다**. 대신:

1. 메시지 목록을 뒤에서부터 훑어 **가장 최근 assistant 메시지의 `usage.total`**(Ollama 실측)을 찾습니다.
2. 그 메시지 **이후**의 메시지만 `ceil(chars / 4)` 휴리스틱으로 추정합니다.
3. `contextTokens = usage.total + trailingEstimate`.
4. usage가 하나도 없으면(세션 첫 턴) 전량 휴리스틱 추정.

`stopReason`이 `aborted`/`error`인 assistant 메시지의 usage는 신뢰하지 않고 건너뜁니다.

### 9.3 컷 포인트 (`src/lib/compaction/cutPoint.ts`)

1. 최신 메시지부터 역순으로 토큰을 누적해 `keepRecentTokens`에 도달하는 지점을 찾습니다.
2. 그 지점 **이후의 가장 가까운 유효 컷 포인트**를 고릅니다.
3. **유효 컷 포인트**: `user` 또는 `assistant` 메시지. **`toolResult`에서는 절대 자르지 않습니다** — 자르면 대응하는 `toolCalls`와 분리됩니다.
4. 컷 지점이 `user` 메시지가 아니면 "턴 중간을 자른 것"(split turn)입니다. **1차 스코프에서는 이 경우 컷 지점을 해당 턴의 시작(`user` 메시지)까지 앞당겨** 턴 경계를 유지합니다. pi의 2단 요약(turnPrefixMessages)은 §13으로 미룹니다.
5. 이전 압축이 있으면 요약 대상 구간의 시작은 **이전 압축의 `firstKeptEntryId`**입니다(압축 엔트리 자체가 아님) — 그래야 이전에 살아남은 메시지가 다음 요약에도 반영됩니다.

### 9.4 요약 생성 (`serialize.ts` + `compact.ts`)

**입력 직렬화**: 메시지를 그대로 넘기지 않고 텍스트로 직렬화합니다(모델이 "이어서 대화"하지 않도록):

```
[User]: 질문 내용
[Assistant thinking]: 내부 추론
[Assistant]: 응답 텍스트
[Assistant tool calls]: read(path="foo.ts"); edit(path="bar.ts", …)
[Tool result]: 도구 출력
```

`[Tool result]`는 **2000자로 절단**하고 "N자 생략" 표시를 남깁니다. 도구 결과가 컨텍스트의 최대 소비자이기 때문입니다.

**요약 프롬프트**: 고정 구조를 강제합니다.

```markdown
## Goal

## Constraints & Preferences

## Progress

### Done / ### In Progress / ### Blocked

## Key Decisions

## Next Steps

## Critical Context

<read-files>…</read-files>
<modified-files>…</modified-files>
```

지침에 "대화를 이어가지 말고 요약만 출력하라", "파일 경로·함수명·에러 메시지는 원문 그대로 보존하라"를 포함합니다.

**증분 업데이트**: 이전 압축이 있으면 그 요약을 `<previous-summary>` 태그로 함께 넘기고, "기존 정보를 보존하면서 새 내용을 반영하고, In Progress → Done으로 이동시켜라"는 별도 지침을 씁니다. 매번 처음부터 요약하지 않습니다.

**파일 조작 누적 추적**: 요약 대상 구간의 도구 호출에서 읽은/수정한 파일 경로를 추출하고, **이전 압축의 `details`와 합집합**을 취해 새 `CompactionEntry.details`에 기록합니다. 여러 번 압축해도 파일 목록이 사라지지 않습니다.

요약 호출은 별도 요청이며, 같은 Ollama 모델을 쓰되 도구 바인딩 없이 호출합니다.

### 9.5 오버플로우 복구

트리거 검사를 통과했는데도 Ollama가 컨텍스트 초과로 요청을 거부하는 경우(추정 오차, 긴 도구 결과)가 있습니다. 이때는 에러를 사용자에게 던지지 말고 **`reason: "overflow"`로 즉시 압축한 뒤 그 턴을 1회 재시도**합니다. 재시도도 실패하면 그때 에러 UI를 띄웁니다.

압축 검사 시점은 세 곳입니다: ① 새 사용자 메시지를 보내기 전, ② 턴 중 도구 결과가 추가된 뒤 다음 LLM 호출 전, ③ 오버플로우 에러 발생 시.

### 9.6 UI

- 압축이 일어나면 `custom` 엔트리(`customType: "compaction_notice"`)를 저장하고 메시지 목록에 "대화 기록이 요약되었습니다 (N → M 토큰)" 배너를 표시합니다. 클릭하면 요약 전문을 펼쳐 볼 수 있습니다.
- 채팅 입력창 근처에 **컨텍스트 사용률 게이지**(현재 토큰 / `contextSize`)를 상시 표시합니다.
- 사용자가 `/compact [지시사항]`으로 수동 압축할 수 있습니다. 지시사항은 요약 프롬프트에 덧붙습니다.

---

## 10. 시각화 렌더링

- `src/lib/markdown/parseVisualBlocks.ts`: assistant 메시지 텍스트에서 \`\`\`mermaid, \`\`\`recharts(JSON DSL) 코드펜스를 추출.
- `MessageBubble.tsx`가 react-markdown으로 일반 텍스트를 렌더링하되, 코드펜스 언어가 `mermaid`/`recharts`이면 각각 `MermaidViewer.tsx`(mermaid.js) / `RechartsViewer.tsx`(JSON DSL → Recharts 컴포넌트 매핑)로 치환 렌더링.
- 시스템 프롬프트의 `visualization` 섹션(§5.5, 모든 Agent에 자동 추가)에 "플로우차트/시퀀스 다이어그램이 필요하면 \`\`\`mermaid, 차트/그래프가 필요하면 \`\`\`recharts JSON으로 응답하라"는 지침과 Recharts DSL 스키마 예시를 포함. 로컬 모델이 형식을 잘 안 지키면 few-shot 예시를 이 섹션에 추가합니다.

---

## 11. 상태관리 원칙

VivoStudio와 동일하게 **Redux/Zustand 등 전역 스토어 라이브러리 없이, 관심사별 React Context**를 사용합니다. 새로운 전역 상태가 필요하면 새 Context를 추가하되, 기존 Context에 무분별하게 필드를 추가하지 않습니다. Context 목록은 §2 트리의 `src/lib/context/`를 최종 목록으로 간주하며, 추가가 필요한 경우 `Docs/TODO.md`에 결정 사항을 기록합니다.

---

## 12. IPC 커맨드 목록 (Rust ↔ TypeScript)

모든 경로 인자는 Rust 쪽에서 **세션 `workspaceRoot` 하위인지 canonicalize 후 검증**하고, 벗어나면 에러를 반환합니다 (§7 Layer 1).

| 커맨드                                         | 위치                 | 설명                                                                              | 대응 도구          |
| ---------------------------------------------- | -------------------- | --------------------------------------------------------------------------------- | ------------------ |
| `read_text_file(path)`                         | `fs_commands.rs`     | 텍스트 파일 읽기                                                                  | `read`, EditorTab  |
| `write_text_file(path, content)`               | `fs_commands.rs`     | 텍스트 파일 쓰기                                                                  | `write`, EditorTab |
| `read_project_folder_tree(folderPath)`         | `fs_commands.rs`     | 파일 트리 조회                                                                    | FileTree           |
| `list_dir(path)`                               | `fs_commands.rs`     | 한 단계 목록(이름/종류/크기)                                                      | `ls`, 스킬 스캐너  |
| `create_file(path)` / `create_folder(path)`    | `fs_commands.rs`     | 생성                                                                              | FileTree           |
| `rename_path(from, to)`                        | `fs_commands.rs`     | 이름변경/이동                                                                     | FileTree           |
| `delete_path(path)`                            | `fs_commands.rs`     | 삭제                                                                              | FileTree           |
| `grep_files(pattern, path, glob?, maxResults)` | `search_commands.rs` | 내용 검색 (`regex` + `ignore` 크레이트, gitignore 존중)                           | `grep`             |
| `find_files(pattern, path, maxResults)`        | `search_commands.rs` | 파일명 glob 검색 (`ignore` 크레이트)                                              | `find`             |
| `run_shell(command, cwd, timeoutMs)`           | `shell_commands.rs`  | OS별 셸 실행(Windows=PowerShell). stdout/stderr/exitCode 반환, 타임아웃 강제 종료 | `shell`            |
| `web_search(query)`                            | `web_commands.rs`    | 웹 검색 결과 파싱(reqwest + scraper)                                              | `web_search`       |

- `edit` 도구는 전용 커맨드 없이 `read_text_file` + 문자열 치환 + `write_text_file` 조합으로 프런트엔드에서 구현합니다. 치환 대상이 0건이거나 2건 이상이면 실패시키고 모델에게 더 긴 컨텍스트를 요구합니다.
- **`web_search`는 유지보수 리스크가 있습니다.** HTML 구조 변경·봇 차단으로 깨지기 쉬우므로, 파싱 실패 시 예외 대신 "검색 결과를 가져오지 못했습니다" 결과를 반환해 대화를 끊지 않습니다. 장기적으로는 내장 도구 대신 검색 스킬(§6)로 대체하는 것을 권장합니다.
- 프런트엔드는 이 커맨드들을 `src/lib/tools/*.ts`에서 `AgentTool`(§5.2)로 감싸 `registry.ts`에 등록합니다.

---

## 13. 미결 사항 / 향후 확장 (1차 스코프 제외)

- 멀티 에이전트 협업(supervisor → sub-agent 호출) — Agent를 "설정값 프리셋"으로 정의했으므로 서브 에이전트를 도구로 노출하는 방식으로 확장 가능하나 1차 스코프 아님. **이 요구가 확정되면 §5.0의 "그래프 대신 루프" 결정을 재검토**합니다.
- **대화 브랜치 / 트리 탐색** — 엔트리에 `parentId`를 남겨 두었으므로 나중에 추가 가능. pi의 브랜치 요약(`/tree`)도 이때 함께 검토.
- **split-turn 2단 요약** — 단일 턴이 `keepRecentTokens`를 초과할 때 pi는 턴 앞부분을 별도 요약해 병합하지만, Fortress 1차 스코프는 컷 지점을 턴 시작까지 앞당기는 방식으로 단순화했습니다 (§9.3).
- **크래시 복원력** — 스트리밍/도구 실행/승인 대기 중 강제 종료 시 해당 턴은 폐기됩니다 (§8.3). pi 수준의 내구성이 필요해지면 harness의 연산 상태 기계를 참고.
- **코드 스킬 / 스크립트 샌드박스** — Agent Skills 표준에 없는 개념이라 1차 스코프에서 제외했습니다 (§7). 신뢰할 수 없는 스킬을 격리 실행할 필요가 생기면 QuickJS 또는 컨테이너화를 재검토.
- 탭 스플릿 드래그앤드롭, 터미널 탭, CLI 에이전트 런처 — VivoStudio에는 있으나 Fortress 1차 스코프 제외.
- macOS/Linux 패키징 — Windows 우선, 이후 확장. (`run_shell`의 OS 분기는 처음부터 넣어 둡니다.)
- 멀티모달(이미지 입력) — 요구사항에서 명시적으로 제외됨.

이 섹션에 항목을 추가/제거할 때는 반드시 `Docs/TODO.md`와 본 문서를 함께 갱신하십시오.
