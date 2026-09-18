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
- **LLM 실행**: Ollama(로컬) + LangChain.js / LangGraph.js (TypeScript 단일 스택, 렌더러 프로세스에서 직접 실행)
- **저장소**: SQLite (`tauri-plugin-sql`) — 세션/메시지/체크포인트/에이전트/설정
- **패키지 매니저**: pnpm
- **Git**: `https://github.com/godstale/FortressAgent.git` (origin)

---

## 1. 참고 프로젝트에서 가져오는 것 / 가져오지 않는 것

### 1.1 VivoStudio에서 가져오는 패턴 (UI 레이아웃)

리서치 결과(에이전트 조사 완료, 2026-09-18) 기준으로 아래 패턴을 **동일한 방식으로 재사용**합니다.

| 영역 | VivoStudio 참고 파일 | Fortress 대응 위치 |
| --- | --- | --- |
| 좌측 아이콘 사이드바 | `src/components/layout/ActivityBar.tsx` | `src/components/layout/ActivityBar.tsx` |
| 좌측 리사이저블 패널 + 접기/펼치기 | `src/components/layout/WorkspaceLayout.tsx` (react-resizable-panels, `ImperativePanelHandle`) | `src/components/layout/WorkspaceLayout.tsx` |
| 좌측 패널 콘텐츠 라우팅 | `src/components/explorer/ExplorerPanel.tsx` | `src/components/sidepanel/SidePanel.tsx` |
| 우측 탭 바 + 탭 콘텐츠 라우팅 | `src/components/workspace/CenterWorkspace.tsx` | `src/components/workspace/CenterWorkspace.tsx` |
| 탭 상태 관리(Context, 멱등 openTab, 영속화) | `src/lib/context/WorkspaceTabsContext.tsx` | `src/lib/context/WorkspaceTabsContext.tsx` |
| 파일 트리 탐색기 | `src/components/explorer/FileTree.tsx` | `src/components/explorer/FileTree.tsx` |
| 이미지 뷰어 탭 | `src/components/workspace/ImageViewerTab.tsx` (`convertFileSrc` + 줌) | `src/components/workspace/ImageViewerTab.tsx` |
| 텍스트 파일 편집 탭 | `src/components/workspace/EditorTab.tsx` (textarea 기반, autosave) | `src/components/workspace/EditorTab.tsx` (단, **CodeMirror 6로 실제 문법 강조 추가** — VivoStudio는 없었음, 개선 사항) |
| Context per concern 상태관리 | `src/lib/context/*` | `src/lib/context/*` |
| 다크 우선 테마(CSS 변수) | `src/index.css`, `ThemeContext.tsx` | 동일 |
| Tauri IPC 파일 커맨드 네이밍 | `read_text_file`, `write_text_file`, `read_project_folder_tree`, `create_file`, `create_folder`, `rename_path`, `delete_path` | 동일한 커맨드명 재사용 (일관성 유지) |

**가져오지 않는 것**: VivoStudio의 "fake Supabase" DB 클라이언트, 강좌(Course) 관련 기능, TTS, 3D/애니메이션 카드 렌더러, CLI 에이전트(Claude Code/Codex) 터미널 런처, 스플릿 탭 드래그앤드롭(1단계 고정 분할)은 **1차 스코프에서 제외**(Phase 7 이후 "선택적 확장"으로만 고려).

### 1.2 VivoAcademy에서 가져오는 패턴 (에이전트 관리 UI + 채팅)

| 영역 | VivoAcademy 참고 파일 | 가져오는 것 | 가져오지 않는 것 |
| --- | --- | --- | --- |
| 에이전트 목록/생성/수정/삭제 UI 구조 | `src/pages/Agents.tsx`, `AddAgentModal.tsx`, `AgentDetail.tsx`, `AgentSettingsTab.tsx` | 카드 그리드 목록, 생성 다이얼로그의 단계형 폼 UX, 상세 페이지의 탭(통계/대화/설정) 구조, 삭제 확인 다이얼로그, 빈 상태 CTA | "연결 프로필"(endpoint/apiKey/harness) 데이터 모델 자체는 미사용 — Fortress의 Agent는 **로컬 LLM 페르소나/프리셋**이므로 데이터 모델은 새로 정의 (§4.2) |
| 채팅 UI 골격 | `src/pages/Learn.tsx`의 AI 튜터 탭 | 메시지 리스트+입력창 레이아웃, react-markdown+remark-gfm 렌더링, 복사 버튼, 스트리밍 델타 반영 방식, 컨텍스트 압축 트리거 개념 | 강좌/체크포인트/카드 컨텍스트 주입 로직, 페이지-로컬 구현 방식(대신 공용 `useChat` 훅으로 재구성 — VivoAcademy 자체에도 없던 것을 Fortress에서 새로 만듦) |
| 스트리밍 아키텍처 | `src/lib/agent/client.ts`의 `sendAgentChat` (요청-스코프 이벤트 리스너 → 최종 메시지 resolve) | **인터페이스 형태**만 참고. Fortress는 Ollama를 프런트엔드에서 직접 스트리밍하므로 Tauri 이벤트가 아니라 LangChain.js의 `streamEvents`/콜백을 사용 | Rust SSE 파서 자체는 불필요(로컬 LLM 호출은 JS에서 직접) |
| 히든 메시지 시그널링(`<!-- HIDDEN_MESSAGE -->`) | 두 채팅 화면 모두 | **가져오지 않음.** Fortress는 LangGraph의 정식 tool-calling/구조화된 이벤트(`interrupt`, structured output)를 사용 |

**중요한 설계 차이 (사용자 확정 사항)**: VivoAcademy의 "Agent"는 외부 서버 연결 프로필이지만, Fortress의 "Agent"는 **단일 LangGraph StateGraph 엔진에 주입되는 설정값(페르소나/프리셋)**입니다. 즉 Agent마다 별도의 그래프를 만들지 않고, 하나의 공용 그래프가 `systemPrompt`, `model`, `enabledSkills`, `enabledBuiltinTools`, `temperature`, `contextSize` 등의 설정을 파라미터로 받아 동작합니다. (§4.2, §5)

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
│       ├── Phase2-LLM-Engine.md
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
│   │   ├── graph/
│   │   │   ├── state.ts                   # FortressGraphState 정의
│   │   │   ├── buildGraph.ts              # StateGraph 조립
│   │   │   ├── nodes/
│   │   │   │   ├── agentNode.ts
│   │   │   │   ├── toolNode.ts
│   │   │   │   ├── summarizerNode.ts
│   │   │   │   └── approvalNode.ts
│   │   │   └── checkpointer.ts            # SQLite 기반 LangGraph Checkpointer
│   │   ├── llm/
│   │   │   └── ollamaClient.ts
│   │   ├── tools/
│   │   │   ├── fileSystemTool.ts
│   │   │   ├── webSearchTool.ts
│   │   │   └── index.ts                   # 내장 도구 레지스트리
│   │   ├── skills-loader/
│   │   │   ├── agentsMdParser.ts
│   │   │   ├── skillScanner.ts
│   │   │   ├── promptSkill.ts
│   │   │   └── codeSkillTool.ts           # 코드 스킬 → DynamicTool 어댑터
│   │   ├── db/
│   │   │   ├── client.ts                  # tauri-plugin-sql 래퍼
│   │   │   ├── migrations/
│   │   │   │   └── 0001_init.sql
│   │   │   └── repositories/
│   │   │       ├── sessionsRepo.ts
│   │   │       ├── messagesRepo.ts
│   │   │       └── agentsRepo.ts
│   │   ├── tokens/
│   │   │   └── tokenCounter.ts
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
        ├── commands/
        │   ├── fs_commands.rs             # read_text_file/write_text_file/... (VivoStudio 네이밍 재사용)
        │   ├── search_commands.rs         # web_search
        │   └── sandbox_commands.rs        # execute_skill_sandboxed
        └── sandbox/
            └── quickjs_runner.rs
```

> `.agents/skills/`와 `.claude/skills/`는 **Claude Code 자체의 전역 스킬 미러**이며 Fortress 앱이 런타임에 읽는 `.agents/skills/`(워크스페이스 스킬 폴더)와는 별개입니다. 혼동하지 않도록 §6에서 명확히 구분합니다.

---

## 3. 레이아웃 상세 설계

### 3.1 좌측 아이콘 사이드바 (`ActivityBar.tsx`)

VivoStudio의 `ActivityBar.tsx` 패턴을 그대로 재사용합니다: 데이터 기반 배열, 순수 컨트롤드 컴포넌트, 활성 아이콘에 좌측 accent bar 표시.

```ts
type SidePanelView = "chat-sessions" | "explorer" | "agents" | "skills" | null;

const ITEMS: { view: Exclude<SidePanelView, null>; icon: LucideIcon; title: string }[] = [
  { view: "chat-sessions", icon: MessageSquare, title: "채팅" },
  { view: "agents",        icon: Bot,           title: "에이전트 관리" },
  { view: "explorer",      icon: Files,         title: "파일 탐색기" },
  { view: "skills",        icon: Puzzle,        title: "스킬 관리" },
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
type WorkspaceTabType = "chat" | "editor" | "image-viewer" | "agent-editor" | "skill-viewer";

interface WorkspaceTab {
  id: string;            // 예: "chat:${sessionId}", "editor:${filePath}", "agent-editor:${agentId}"
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
export type ApprovalMode = "always" | "dangerous-only" | "never";

export interface Agent {
  id: string;                    // uuid
  name: string;
  description?: string;
  systemPrompt: string;
  model: string;                 // Ollama 모델 태그, 예: "llama3.1:8b"
  temperature: number;           // 0.0 ~ 2.0, 기본 0.7
  contextSize: number;           // 토큰 수, 기본은 SettingsModel의 전역값 상속(0 또는 null이면 전역값 사용)
  compressionThreshold: number;  // 0.0 ~ 1.0, 기본 0.75
  enabledSkills: string[];       // SkillManifest.id 목록
  enabledBuiltinTools: BuiltinToolId[]; // ("fileSystem" | "webSearch")[]
  approvalMode: ApprovalMode;    // HITL 세분화, 기본 "dangerous-only"
  isDefault: boolean;            // 정확히 하나만 true (VivoAcademy의 is_ai_tutor 불변식과 동일 패턴)
  createdAt: string;             // ISO 8601
  updatedAt: string;
}

export type BuiltinToolId = "fileSystem" | "webSearch";
```

- **기본 Agent 불변식**: Agent가 1개 이상 존재하면 정확히 하나는 `isDefault === true`. 최초 생성된 Agent가 자동으로 기본이 되고, 기본 Agent 삭제 시 다음 Agent가 승격됩니다. (VivoAcademy `external-agents.ts`의 `is_ai_tutor` 로직을 참고해 `agentsRepo.ts`에 동일하게 구현.)
- **`visualizationTool`을 내장 도구 목록에 넣지 않은 이유**: 로컬 LLM의 함수 호출(tool-calling) 신뢰도가 모델마다 크게 다르므로, 시각화는 "도구 호출"이 아니라 **출력 형식 규약**(시스템 프롬프트에 "필요시 \`\`\`mermaid / \`\`\`recharts 코드펜스로 응답하라"는 지침 포함 + 렌더러가 후처리 파싱)으로 구현합니다. Phase 5에서 상세 설계.

### 4.3 ChatSession / ChatMessage — `src/lib/types/chat.ts`

```ts
export interface ChatSession {
  id: string;
  agentId: string;
  title: string;             // 최초 사용자 메시지 앞부분으로 자동 생성, 추후 수정 가능
  createdAt: string;
  updatedAt: string;
}

export type ChatRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  toolName?: string;         // role === "tool"일 때
  createdAt: string;
}
```

- VivoAcademy와 달리 **세션 히스토리는 영구 저장**됩니다(카드 이동 시 초기화하는 방식 미채택 — Fortress는 QnA 히스토리를 명시적으로 요구사항에 명시했으므로).

### 4.4 SkillManifest — `src/lib/types/skill.ts`

```ts
export type SkillKind = "prompt" | "code";

export interface SkillManifest {
  id: string;           // .agents/skills/<id>/ 폴더명
  kind: SkillKind;
  name: string;
  description: string;
  path: string;          // 절대 경로
  entry: string;         // "SKILL.md" | "index.ts" | "index.js" | "index.json"
  enabledByDefault: boolean;
}
```

§6에서 상세 포맷 정의.

---

## 5. LangGraph.js 엔진 설계

### 5.1 단일 공용 그래프 원칙

Fortress는 Agent(페르소나)마다 별도 그래프를 만들지 않고, **하나의 `StateGraph`를 앱 전체에서 공유**합니다. 각 대화 실행(invoke)마다 `Agent` 설정값을 그래프 실행 컨텍스트(config)로 주입합니다.

```ts
// src/lib/graph/state.ts
import { Annotation, messagesStateReducer } from "@langchain/langgraph";

export const FortressState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({ reducer: messagesStateReducer, default: () => [] }),
  agentConfig: Annotation<Agent>(),          // 현재 세션의 Agent 설정
  pendingApproval: Annotation<ToolCallRequest | null>({ default: () => null }),
  tokenUsageRatio: Annotation<number>({ default: () => 0 }),
});
```

### 5.2 노드 구성 (`src/lib/graph/nodes/`)

1. **`agentNode.ts`**: `agentConfig.systemPrompt` + `agentConfig.model`로 `ChatOllama` 인스턴스를 만들고, `enabledSkills`/`enabledBuiltinTools`에서 조립한 도구 목록을 바인딩해 LLM 호출. 스트리밍 콜백으로 델타를 UI에 전달.
2. **`toolNode`**: LangGraph의 표준 `ToolNode` 사용(도구 실행). 위험한 도구(파일 쓰기/삭제, 코드 스킬 실행)는 실행 직전 `approvalNode`를 거치도록 그래프 엣지를 구성.
3. **`approvalNode.ts`**: `interrupt()`를 호출해 그래프를 일시 정지, `pendingApproval` state에 `{toolName, args, riskLevel}` 기록. 프런트엔드가 `ApprovalDialog`를 렌더링하고, 사용자가 승인/거절하면 `Command({ resume: { approved: boolean, reason?: string } })`로 재개.
4. **`summarizerNode.ts`**: `tokenUsageRatio >= agentConfig.compressionThreshold`일 때 조건부 엣지로 진입. 오래된 메시지를 요약(같은 모델에 별도 시스템 프롬프트로 요청) 후 `messages`를 `[요약 메시지, 최근 2개]`로 치환. (원본 리서치 메모의 §2.3 로직을 그대로 구현.)

### 5.3 그래프 흐름 (요약)

```
START → (tokenUsageRatio 체크: 임계값 초과?) → [summarizerNode] → agentNode
                                             └(미초과)→ agentNode
agentNode → (tool_calls 있음?) → [위험도 평가] → approvalNode(HITL) → toolNode → agentNode(반복)
                              └(없음/안전)→ toolNode → agentNode(반복)
agentNode → (tool_calls 없음) → END
```

### 5.4 Checkpointer (`checkpointer.ts`)

LangGraph.js의 `BaseCheckpointSaver` 인터페이스를 구현해 SQLite(`tauri-plugin-sql`)에 그래프 상태를 저장 — 앱 재시작 후에도 진행 중이던 승인 대기 상태 등을 복원 가능하게 함. Phase 4에서 구현.

### 5.5 Ollama 연동

- `src/lib/llm/ollamaClient.ts`: `@langchain/ollama`의 `ChatOllama`를 얇게 감싼 팩토리(`createChatModel(agent: Agent)`).
- 기본 baseUrl: `http://127.0.0.1:11434` (Settings에서 변경 가능, `SettingsContext`에 저장).
- Tauri v2 CSP에서 `connect-src`에 `http://127.0.0.1:11434`를 허용해야 함 (`src-tauri/tauri.conf.json`의 `app.security.csp` 설정, Phase 0에서 처리).
- 모델 목록 조회는 `GET /api/tags`를 직접 fetch (Rust 경유 불필요).

---

## 6. AGENTS.md / `.agents/skills` 로더 설계 (Fortress 앱 런타임 기능)

> **주의**: 이것은 Fortress *앱이 실행 중인 작업 디렉터리*를 스캔하는 기능입니다. Fortress *리포지토리 자체*의 루트 `AGENTS.md`(개발 지침 파일, §8)와는 다른 개념입니다. 앱은 사용자가 지정한 "워크스페이스 폴더" 안의 `AGENTS.md`/`.agents/skills/`를 읽어 도구로 인식합니다.

### 6.1 로드 절차

1. 워크스페이스 루트의 `AGENTS.md` 파일이 있으면 전체 텍스트를 읽어 시스템 프롬프트 앞에 `[Workspace Instructions]` 블록으로 병합.
2. `.agents/skills/` 하위 폴더를 1-depth 스캔. 각 폴더가 하나의 스킬.
3. 폴더 안에 `SKILL.md`가 있으면 **프롬프트 스킬**로 분류(frontmatter: `name`, `description`, 본문은 지침 텍스트 → 시스템 프롬프트에 스킬 설명 추가, 실제 호출은 없음. 단, Fortress에서는 "가능한 도구로 인식"해야 하므로 **프롬프트 스킬도 이름/설명이 LLM에게 노출되는 pseudo-tool**로 취급 — 실제로는 `DynamicTool`로 등록하되 실행 시 SKILL.md 본문 텍스트를 그대로 반환(문서/체크리스트 열람형 스킬)).
4. 폴더 안에 `index.ts`/`index.js`/`index.json`이 있으면 **코드 스킬**로 분류. `index.json`은 `{name, description, command, args}` 형태의 선언적 실행 정의(외부 실행 파일 호출), `.ts`/`.js`는 QuickJS 샌드박스에서 실행되는 함수(§7).
5. 스캔 결과를 `SkillManifest[]`로 `SkillsContext`에 로드하고, `AgentEditorForm`에서 Agent별 `enabledSkills`로 선택 가능하게 노출.

### 6.2 SKILL.md 최소 포맷

```markdown
---
name: my-skill
description: 이 스킬이 하는 일에 대한 한 줄 설명 (LLM에게 노출됨)
---

(스킬 지침 본문 — 프롬프트 스킬은 이 내용이 그대로 노출되는 문서형 지식/체크리스트)
```

### 6.3 코드 스킬 최소 포맷 (`index.json` 선언형 — 1차 스코프)

```json
{
  "name": "my-code-skill",
  "description": "무엇을 하는지",
  "inputSchema": { "type": "object", "properties": { "query": { "type": "string" } }, "required": ["query"] },
  "entry": "index.js"
}
```

`index.js`는 `export default async function run(args) { return "결과 문자열"; }` 형태의 단일 함수만 허용(QuickJS 샌드박스 제약, §7).

---

## 7. 스킬 실행 샌드박스 (3단계 안전망)

원본 리서치 메모(§4)의 설계를 그대로 채택합니다.

| 레이어 | 기술 | 구현 위치 |
| --- | --- | --- |
| Layer 1: Runtime 격리 | QuickJS (Rust `rquickjs` 크레이트) | `src-tauri/src/sandbox/quickjs_runner.rs`, Tauri 커맨드 `execute_skill_sandboxed` |
| Layer 2: OS/FS 격리 | Tauri 2 Capabilities/Scope (워크스페이스 폴더 밖 접근 차단) | `src-tauri/capabilities/default.json` |
| Layer 3: 사람의 승인 | LangGraph `interrupt()` → `ApprovalDialog` | §5.2 `approvalNode`, `src/components/chat/ApprovalDialog.tsx` |

코드 스킬 실행은 항상 `approvalMode !== "never"`인 경우 승인 요청을 거칩니다(`approvalMode === "dangerous-only"`일 때도 코드 실행은 항상 "위험"으로 분류).

---

## 8. Human-in-the-Loop (HITL) 승인 모드

### 8.1 위험도 분류

| 동작 | 위험도 | 기본 승인 필요 여부 |
| --- | --- | --- |
| 파일 읽기 (`fileSystemTool` read) | 낮음 | 불필요 |
| 파일 쓰기/생성/삭제 (`fileSystemTool` write/delete) | 높음 | 필요 |
| 웹 검색 (`webSearchTool`) | 낮음 | 불필요 |
| 코드 스킬 실행 | 높음 | 필요 |
| 프롬프트 스킬(문서 열람) | 없음 | 불필요 |

`approvalMode: "always"`는 위험도 무관 모든 도구 호출에 승인을 요구, `"dangerous-only"`(기본값)는 위 표의 "필요" 항목만, `"never"`는 승인 없이 즉시 실행(위험을 이해하는 고급 사용자용, Settings에서 경고 문구와 함께 제공).

### 8.2 UI 흐름

```
LLM → Tool Call 결정 → [approvalNode: interrupt] → ApprovalDialog 표시
                                                     ├─ [승인] → toolNode 실행 → 결과를 ToolMessage로 LLM에 전달
                                                     └─ [거절] → 거절 사유를 ToolMessage로 LLM에 전달 (도구 미실행)
```

`ApprovalDialog`는 도구명, 인자(JSON pretty-print), 위험도 배지를 표시하고 "승인"/"거절(+사유 입력)" 버튼 제공.

---

## 9. 컨텍스트 자동 압축

- 토큰 계산: `src/lib/tokens/tokenCounter.ts`에서 `js-tiktoken`(cl100k_base 근사치)으로 현재 세션의 전체 메시지 토큰 수 계산.
- 임계값: `agent.contextSize * agent.compressionThreshold` (기본 0.75) 초과 시 `summarizerNode` 경로로 분기.
- 압축 후 UI에 시스템 안내 메시지 표시(예: "대화 기록이 요약되었습니다") — VivoAcademy의 압축 안내 배너 패턴 참고.
- 사용자는 `SettingsModel.tsx`에서 전역 기본 `contextSize`/`compressionThreshold`를 설정할 수 있고, Agent별로 override 가능(§4.2).

---

## 10. 시각화 렌더링

- `src/lib/markdown/parseVisualBlocks.ts`: assistant 메시지 텍스트에서 \`\`\`mermaid, \`\`\`recharts(JSON DSL) 코드펜스를 추출.
- `MessageBubble.tsx`가 react-markdown으로 일반 텍스트를 렌더링하되, 코드펜스 언어가 `mermaid`/`recharts`이면 각각 `MermaidViewer.tsx`(mermaid.js) / `RechartsViewer.tsx`(JSON DSL → Recharts 컴포넌트 매핑)로 치환 렌더링.
- 시스템 프롬프트 공통 지침(모든 Agent에 자동 추가)에 "플로우차트/시퀀스 다이어그램이 필요하면 \`\`\`mermaid, 차트/그래프가 필요하면 \`\`\`recharts JSON으로 응답하라"는 문구 포함.

---

## 11. 상태관리 원칙

VivoStudio와 동일하게 **Redux/Zustand 등 전역 스토어 라이브러리 없이, 관심사별 React Context**를 사용합니다. 새로운 전역 상태가 필요하면 새 Context를 추가하되, 기존 Context에 무분별하게 필드를 추가하지 않습니다. Context 목록은 §2 트리의 `src/lib/context/`를 최종 목록으로 간주하며, 추가가 필요한 경우 `Docs/TODO.md`에 결정 사항을 기록합니다.

---

## 12. IPC 커맨드 목록 (Rust ↔ TypeScript)

| 커맨드 | 위치 | 설명 |
| --- | --- | --- |
| `read_text_file(path)` | `fs_commands.rs` | 텍스트 파일 읽기 (워크스페이스 스코프 제한) |
| `write_text_file(path, content)` | `fs_commands.rs` | 텍스트 파일 쓰기 |
| `read_project_folder_tree(folderPath)` | `fs_commands.rs` | 파일 트리 조회 |
| `create_file(path)` / `create_folder(path)` | `fs_commands.rs` | 생성 |
| `rename_path(from, to)` | `fs_commands.rs` | 이름변경/이동 |
| `delete_path(path)` | `fs_commands.rs` | 삭제 |
| `web_search(query)` | `search_commands.rs` | Google 검색 결과 파싱(reqwest + scraper) |
| `execute_skill_sandboxed(skillId, argsJson)` | `sandbox_commands.rs` | QuickJS 코드 스킬 실행 |

프런트엔드는 이 커맨드들을 `src/lib/tools/fileSystemTool.ts`, `webSearchTool.ts`, `skills-loader/codeSkillTool.ts`에서 LangChain `DynamicTool`로 감싸 그래프에 등록합니다.

---

## 13. 미결 사항 / 향후 확장 (1차 스코프 제외)

- 멀티 에이전트 협업(supervisor → sub-agent 호출) — Agent를 "설정값 프리셋"으로 정의했으므로, 필요 시 별도 그래프/노드 확장으로 추가 가능하나 1차 스코프 아님.
- 탭 스플릿 드래그앤드롭, 터미널 탭, CLI 에이전트 런처 — VivoStudio에는 있으나 Fortress 1차 스코프 제외.
- macOS/Linux 패키징 — Windows 우선, 이후 확장.
- 멀티모달(이미지 입력) — 요구사항에서 명시적으로 제외됨.

이 섹션에 항목을 추가/제거할 때는 반드시 `Docs/TODO.md`와 본 문서를 함께 갱신하십시오.
