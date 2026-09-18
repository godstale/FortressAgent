# Phase 2 — LLM Engine (LangGraph.js + Ollama 연동)

**목표**: Phase 1에서 만든 Chat 탭 placeholder를 실제로 동작하는 채팅으로 만든다. 이 Phase가 끝나면 사용자가 Ollama 로컬 모델과 스트리밍으로 대화할 수 있고, 기본 내장 도구(파일시스템, 웹검색)를 LLM이 호출할 수 있다. 세션 영속화(재시작 후 유지)는 Phase 4, 시각화/승인 UI는 Phase 5, 에이전트 페르소나 전환 UI는 Phase 6에서 다룬다 — 이 Phase에서는 **하드코딩된 단일 기본 Agent 설정**으로 동작을 검증한다.

**선행 조건**: Phase 1 완료.

**공통 참고**: `Docs/Architecture.md` §4.2(Agent 타입), §5(LangGraph 엔진 설계), §12(IPC 목록).

---

## P2-01. Ollama 클라이언트 + 모델 목록 조회

- **소유 파일**: `src/lib/llm/ollamaClient.ts`
- **작업 내용**:
  1. `pnpm add @langchain/core @langchain/langgraph @langchain/ollama langchain`.
  2. `createChatModel(agent: Agent): ChatOllama` 팩토리 함수 작성 — `baseUrl`(기본 `http://127.0.0.1:11434`, `SettingsContext`에서 override 가능하도록 파라미터로 받음), `model: agent.model`, `temperature: agent.temperature`.
  3. `listOllamaModels(baseUrl): Promise<string[]>` — `GET {baseUrl}/api/tags`를 fetch로 직접 호출해 설치된 모델 태그 목록 반환. 연결 실패 시 명확한 에러(예: `OllamaConnectionError`)를 throw.
- **확인 방법**: 단위 테스트에서 fetch를 모킹해 `listOllamaModels`가 파싱 결과를 올바르게 반환하는지 확인. 수동으로는 `pnpm check:ollama`(P0-07)로 먼저 서버가 떠 있는지 확인 후 앱에서 모델 목록이 뜨는지 확인.

## P2-02. FortressState + buildGraph (최소 루프)

- **소유 파일**: `src/lib/graph/state.ts`, `src/lib/graph/buildGraph.ts`, `src/lib/graph/nodes/agentNode.ts`
- **작업 내용**:
  1. `state.ts`: `Docs/Architecture.md` §5.1의 `FortressState` `Annotation.Root` 정의. 이 Phase에서는 `pendingApproval`, `tokenUsageRatio` 필드는 타입만 존재하고 실제로 사용하지 않는다(Phase 4/5에서 사용 시작, 지금은 항상 기본값).
  2. `agentNode.ts`: `createChatModel(agentConfig)`로 모델을 만들고, `messages`를 그대로 전달해 스트리밍 응답을 받는다. 이 시점에는 도구 바인딩 없이 순수 텍스트 응답만 처리(도구는 P2-05/P2-06에서 추가).
  3. `buildGraph.ts`: `START → agentNode → END`의 최소 그래프를 `StateGraph(FortressState)`로 조립하고 컴파일해 export.
- **확인 방법**: Node 스크립트나 Vitest로 그래프를 직접 invoke해서 간단한 프롬프트에 대한 응답이 오는지 확인(Ollama 서버 필요, CI에서는 스킵 가능하도록 `describe.skipIf(!process.env.OLLAMA_AVAILABLE)` 같은 가드 사용).

## P2-03. useChat 훅

- **소유 파일**: `src/hooks/useChat.ts`
- **작업 내용**: VivoAcademy `sendAgentChat`의 **인터페이스 형태**(요청 단위 스트리밍 콜백, 최종 메시지 resolve)를 참고하되, 실제로는 LangGraph.js `graph.streamEvents(...)` 또는 `ChatOllama`의 스트리밍 콜백을 사용해 델타를 받는다. 시그니처 예시:
  ```ts
  function useChat(sessionId: string, agent: Agent): {
    messages: ChatMessage[];
    isStreaming: boolean;
    sendMessage: (text: string) => Promise<void>;
    stopGeneration: () => void;
  }
  ```
  이 Phase에서는 `messages`를 메모리 상태(`useState`)로만 관리한다(Phase 4에서 SQLite 연동으로 교체). `stopGeneration`은 `AbortController`로 스트림을 중단(VivoAcademy에는 없던 기능이지만 "일반적인 Agent 앱이 제공하는 기본 기능"으로 원 요구사항에 포함되므로 이 Phase에서 반드시 구현).
- **확인 방법**: Testing Library로 `sendMessage` 호출 시 `messages`가 순차적으로(스트리밍 델타 누적 → 최종 확정) 갱신되는지 확인(Ollama 응답은 모킹).

## P2-04. ChatTab 실동작 연결

- **소유 파일**: `src/components/workspace/ChatTab.tsx`(Phase 1의 placeholder를 실동작으로 교체), `src/components/chat/MessageList.tsx`, `src/components/chat/MessageBubble.tsx`, `src/components/chat/ChatInput.tsx`
- **작업 내용**:
  1. `MessageBubble.tsx`: react-markdown+remark-gfm으로 렌더링(VivoAcademy `Learn.tsx`의 `ChatMessageContent` 패턴 참고), 역할별(`user`/`assistant`/`system`) 스타일 분기, 복사 버튼(VivoAcademy 패턴).
  2. `MessageList.tsx`: `ScrollArea`(shadcn) 안에 메시지 목록, 새 메시지 도착 시 자동 스크롤.
  3. `ChatInput.tsx`: `Textarea` + 전송 버튼, Enter 전송/Shift+Enter 줄바꿈, IME 조합 중 전송 방지(`e.nativeEvent.isComposing` 체크 — VivoAcademy 패턴), 스트리밍 중에는 전송 버튼이 "중지" 버튼으로 전환(`stopGeneration` 연결).
  4. `ChatTab.tsx`는 `useChat` 훅을 사용해 위 컴포넌트를 조립. 이 Phase의 기본 Agent 설정은 하드코딩된 상수(`DEFAULT_AGENT`, 예: `{model: "llama3.1:8b", systemPrompt: "You are Fortress, a helpful local AI assistant.", temperature: 0.7, ...}`)를 `src/lib/graph/defaultAgent.ts`에 정의해 사용한다(Phase 6에서 실제 저장된 Agent로 교체).
- **확인 방법**: 앱에서 채팅 탭에 메시지를 입력하면 스트리밍 응답이 실시간으로 표시되는지, 중지 버튼이 동작하는지 수동 확인.

## P2-05. 내장 도구: fileSystemTool, webSearchTool

- **소유 파일**: `src/lib/tools/fileSystemTool.ts`, `src/lib/tools/webSearchTool.ts`, `src/lib/tools/index.ts`, `src-tauri/src/commands/search_commands.rs`, `src-tauri/src/commands/mod.rs`(등록 추가), `src-tauri/Cargo.toml`(reqwest/scraper 의존성 추가)
- **작업 내용**:
  1. Rust `web_search(query: String) -> Vec<SearchResult>`: `reqwest`로 Google 검색 결과 페이지를 가져와 `scraper` 크레이트로 제목/링크/스니펫을 파싱(원본 리서치 메모 §2.2: "외부 API를 사용하기보다 직접 google 등을 검색해서 결과를 파싱"). User-Agent 헤더를 일반 브라우저처럼 설정. 파싱 실패에 대비해 결과 0건이어도 에러를 던지지 않고 빈 배열 반환 + 로그.
  2. `fileSystemTool.ts`: P1-06의 `read_text_file`/`write_text_file`/`read_project_folder_tree` Tauri 커맨드를 감싸는 `DynamicStructuredTool` 3종(`read_file`, `write_file`, `list_directory`) 정의(Zod 스키마로 입력 검증, `pnpm add zod`).
  3. `webSearchTool.ts`: `web_search` 커맨드를 감싸는 `DynamicStructuredTool` 1종.
  4. `index.ts`: `BuiltinToolId`(`"fileSystem" | "webSearch"`) → 실제 도구 배열 매핑 레지스트리, `getBuiltinTools(ids: BuiltinToolId[]): DynamicStructuredTool[]`.
- **확인 방법**: 각 도구를 그래프 없이 직접 `.invoke()` 호출해 예상 결과가 오는지 Vitest로 확인. `web_search`는 실제 네트워크 호출이 필요하므로 통합 테스트는 수동으로 1회 확인 후, 단위 테스트는 HTML 파서 함수만 고정된 샘플 HTML로 검증.

## P2-06. agentNode 도구 바인딩 + toolNode 루프 완성

- **소유 파일**: `src/lib/graph/nodes/agentNode.ts`(P2-02 파일을 이 작업이 확장), `src/lib/graph/nodes/toolNode.ts`, `src/lib/graph/buildGraph.ts`(그래프 엣지 확장)
- **작업 내용**:
  1. `agentNode.ts`에서 `model.bindTools(getBuiltinTools(agentConfig.enabledBuiltinTools))` 적용(스킬 기반 도구는 Phase 3에서 합류 — 이 Phase에서는 내장 도구만).
  2. `toolNode.ts`: LangGraph의 `ToolNode` 사용 또는 동등한 커스텀 구현으로 `tool_calls`를 실행해 `ToolMessage`로 변환.
  3. `buildGraph.ts`를 `START → agentNode → (조건부: tool_calls 있음?) → toolNode → agentNode(반복) / END`로 확장. **이 Phase에서는 승인(HITL) 단계 없이 즉시 실행**(Phase 5에서 `approvalNode`를 `agentNode`와 `toolNode` 사이에 삽입).
- **확인 방법**: "현재 폴더의 파일 목록을 보여줘" 같은 프롬프트로 실제 `list_directory` 도구가 호출되고 결과가 응답에 반영되는지 수동 확인.

## P2-07. 에러 처리 / 재시도 UI

- **소유 파일**: `src/components/chat/MessageBubble.tsx`(에러 상태 렌더링 추가 — P2-04 파일에 소규모 추가), `src/hooks/useChat.ts`(에러 캐치 로직 추가 — P2-03 파일에 소규모 추가), `src/lib/llm/ollamaClient.ts`(에러 타입 추가 — P2-01 파일에 소규모 추가)
- **작업 내용**: Ollama 연결 실패(서버 꺼짐), 존재하지 않는 모델, 스트림 중 예외 등을 구분된 에러 메시지로 사용자에게 표시. VivoAcademy처럼 "에러를 어시스턴트 말풍선에 텍스트로 대체"하는 대신, **에러 전용 배너 컴포넌트 + "재시도" 버튼**을 제공한다(원 요구사항의 "일반적인 Agent 앱 기본 기능" 충족 — 재시도는 VivoAcademy에 없던 개선 사항).
- **확인 방법**: Ollama를 잠시 꺼둔 상태에서 메시지를 보내 에러 배너와 재시도 버튼이 뜨는지, Ollama를 다시 켠 뒤 재시도가 성공하는지 확인.

---

## Phase 2 완료 조건

- [ ] Ollama가 켜져 있을 때, 채팅 탭에서 실시간 스트리밍 응답을 받을 수 있다.
- [ ] 생성 중지 버튼이 동작한다.
- [ ] LLM이 파일 목록 조회, 웹 검색 도구를 호출할 수 있다(즉시 실행, 승인 없음 — Phase 5에서 승인 단계 추가 예정).
- [ ] Ollama 연결 실패 시 명확한 에러 UI와 재시도 버튼이 뜬다.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 통과.
- [ ] `Docs/TODO.md`의 Phase 2 항목이 모두 `[x]`다.
