# Phase 4 — Session Storage & Context Auto-Compression

**목표**: 채팅 세션/메시지를 SQLite에 영구 저장하고, 앱 재시작 후에도 대화 기록과 열려 있던 탭이 복원되게 한다. 또한 컨텍스트가 75%(기본값, 설정 가능)를 넘으면 자동으로 요약·압축한다.

**선행 조건**: Phase 2 완료. (Phase 3과 병렬 진행 가능 — 소유 파일이 겹치지 않음)

**공통 참고**: `Docs/Architecture.md` §4.3(ChatSession/ChatMessage), §5.4(Checkpointer), §9(컨텍스트 자동 압축).

---

## P4-01. tauri-plugin-sql 통합 + 마이그레이션

- **소유 파일**: `src-tauri/Cargo.toml`(sql 플러그인 의존성 추가), `src-tauri/src/lib.rs`(플러그인 등록 — 기존 코드에 플러그인 등록 라인만 추가), `src/lib/db/migrations/0001_init.sql`, `package.json`(`@tauri-apps/plugin-sql` 의존성 추가만)
- **작업 내용**:
  1. `pnpm add @tauri-apps/plugin-sql`, Rust 쪽 `tauri-plugin-sql` 크레이트 추가, `sqlite:fortress.db` 커넥션 문자열로 앱 데이터 디렉터리에 DB 파일 생성.
  2. `0001_init.sql`에 다음 테이블 정의:
     ```sql
     CREATE TABLE agents (
       id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
       system_prompt TEXT NOT NULL, model TEXT NOT NULL,
       temperature REAL NOT NULL DEFAULT 0.7, context_size INTEGER,
       compression_threshold REAL NOT NULL DEFAULT 0.75,
       enabled_skills TEXT NOT NULL DEFAULT '[]',        -- JSON array
       enabled_builtin_tools TEXT NOT NULL DEFAULT '[]', -- JSON array
       approval_mode TEXT NOT NULL DEFAULT 'dangerous-only',
       is_default INTEGER NOT NULL DEFAULT 0,
       created_at TEXT NOT NULL, updated_at TEXT NOT NULL
     );
     CREATE TABLE sessions (
       id TEXT PRIMARY KEY, agent_id TEXT NOT NULL REFERENCES agents(id),
       title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
     );
     CREATE TABLE messages (
       id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
       role TEXT NOT NULL, content TEXT NOT NULL, tool_name TEXT,
       created_at TEXT NOT NULL
     );
     CREATE TABLE app_settings (
       id TEXT PRIMARY KEY DEFAULT 'singleton',
       open_tabs TEXT NOT NULL DEFAULT '[]', active_tab_id TEXT,
       theme TEXT NOT NULL DEFAULT 'dark', language TEXT NOT NULL DEFAULT 'ko',
       ollama_base_url TEXT NOT NULL DEFAULT 'http://127.0.0.1:11434',
       default_context_size INTEGER NOT NULL DEFAULT 8192,
       default_compression_threshold REAL NOT NULL DEFAULT 0.75
     );
     CREATE INDEX idx_messages_session ON messages(session_id);
     ```
- **확인 방법**: 앱 최초 실행 시 마이그레이션이 자동 적용되고, DB 파일이 생성되는지 확인.

## P4-02. Repository 계층

- **소유 파일**: `src/lib/db/client.ts`, `src/lib/db/repositories/sessionsRepo.ts`, `src/lib/db/repositories/messagesRepo.ts`, `src/lib/db/repositories/agentsRepo.ts`(§4.2의 `isDefault` 불변식 로직 포함 — VivoAcademy `external-agents.ts` 패턴 참고, Phase 6에서 UI가 이 repo를 사용)
- **작업 내용**: `client.ts`는 `@tauri-apps/plugin-sql`의 `Database.load("sqlite:fortress.db")`를 감싼 싱글턴. 각 repo는 CRUD 함수 제공(`getSessions()`, `createSession()`, `deleteSession()`, `getMessages(sessionId)`, `appendMessage()`, `getAgents()`, `createAgent()`, `updateAgent()`, `deleteAgent()` 등). SQL 인젝션 방지를 위해 반드시 파라미터 바인딩(`?`) 사용.
- **확인 방법**: Vitest로 각 repo 함수의 CRUD가 정상 동작하는지 확인(테스트용 인메모리/임시 DB 파일 사용).

## P4-03. ChatSessionsContext + ChatSessionList 실동작

- **소유 파일**: `src/lib/context/ChatSessionsContext.tsx`, `src/components/chatsessions/ChatSessionList.tsx`(Phase1 placeholder 교체)
- **작업 내용**: 세션 목록 조회/생성/삭제/제목 자동 생성(최초 사용자 메시지 앞 30자). `ChatSessionList`는 세션 카드 목록, 클릭 시 해당 세션의 `chat` 탭을 열거나(이미 열려 있으면 포커스) 새로 연다(`openTab({type:"chat", id:`chat:${sessionId}`, meta:{sessionId}})`).
- **확인 방법**: 새 세션 생성 → 목록에 표시 → 클릭 시 탭 전환 → 삭제 시 목록/탭에서 제거되는지 확인.

## P4-04. useChat을 SQLite와 연결 + 탭 상태 영속화

- **소유 파일**: `src/hooks/useChat.ts`(Phase 2 파일 확장 — 메모리 상태를 `messagesRepo` 기반으로 교체), `src/lib/context/WorkspaceTabsContext.tsx`(Phase 1 파일 확장 — `// TODO(Phase4)` 주석 위치에 영속화 로직 구현)
- **작업 내용**: `useChat`이 세션 진입 시 `messagesRepo.getMessages(sessionId)`로 히스토리를 로드하고, 매 턴마다 사용자/어시스턴트 메시지를 `appendMessage`로 저장. `WorkspaceTabsContext`는 탭 목록/활성 탭 ID를 `app_settings` 테이블에 500ms 디바운스 저장, 앱 시작 시 복원(VivoStudio 패턴 재구현, 단 Fortress는 모든 탭 타입을 복원 대상으로 함 — `Docs/Architecture.md` §3.3).
- **확인 방법**: 대화 후 앱을 완전히 종료했다가 다시 실행하면 열려 있던 탭과 대화 내용이 그대로 복원되는지 확인.

## P4-05. tokenCounter

- **소유 파일**: `src/lib/tokens/tokenCounter.ts`
- **작업 내용**: `pnpm add js-tiktoken`. `countTokens(messages: ChatMessage[]): number`(cl100k_base 근사치), `getUsageRatio(messages, contextSize): number`(0~1). 정확한 로컬 모델 토크나이저가 아님을 인지하고 안전 마진(예: 실제 계산값에 1.1배)을 곱하는 보수적 추정치 사용.
- **확인 방법**: 알려진 문자열 길이에 대해 대략적인 토큰 수가 합리적 범위인지 확인하는 Vitest.

## P4-06. summarizerNode + 그래프 연결

- **소유 파일**: `src/lib/graph/nodes/summarizerNode.ts`, `src/lib/graph/buildGraph.ts`(조건부 엣지 추가 — Phase 2/3이 만든 그래프에 진입점 분기만 추가), `src/lib/graph/state.ts`(`tokenUsageRatio` 필드를 실제로 채우도록 소규모 수정)
- **작업 내용**: `Docs/Architecture.md` §5.2-4, §9의 로직 그대로 구현 — 임계값 초과 시 오래된 메시지를 요약해 `[요약 메시지, 최근 2개]`로 치환, 압축 이벤트를 `system` 역할 메시지로 UI에 노출. 압축 시점에 DB에도 반영(오래된 메시지 row를 지우지 않고 유지하되, 그래프에 전달되는 컨텍스트만 압축 — 사용자가 스크롤해서 원본 히스토리는 볼 수 있어야 함. 이는 VivoAcademy와의 의도적 차이: VivoAcademy는 DB에서도 삭제했지만 Fortress는 "QnA 히스토리 저장" 요구사항이 있으므로 원본을 보존).
- **확인 방법**: `contextSize`를 작은 값(예: 500)으로 설정한 테스트 Agent로 긴 대화를 진행해 자동 압축이 트리거되는지, 압축 후에도 대화가 이어지는지 확인.

## P4-07. SQLite 기반 LangGraph Checkpointer

- **소유 파일**: `src/lib/graph/checkpointer.ts`
- **작업 내용**: LangGraph.js `BaseCheckpointSaver`를 구현해 그래프 실행 상태(특히 `pendingApproval`처럼 Phase 5에서 중단된 상태)를 SQLite에 저장, 앱 재시작 후 이어서 재개 가능하게 한다. 이 Phase에서는 `pendingApproval`이 아직 없으므로(Phase 5 선행 필요) **인터페이스와 기본 저장/복원만 구현**하고, 실제 승인 재개 시나리오 테스트는 Phase 5에서 마무리한다.
- **확인 방법**: 체크포인트 저장 후 그래프를 새로 만들어 동일 `thread_id`로 재개했을 때 이전 상태가 복원되는지 단위 테스트.

---

## Phase 4 완료 조건

- [ ] 대화 내용이 SQLite에 저장되고 앱 재시작 후에도 유지된다.
- [ ] 열려 있던 탭이 재시작 후 복원된다.
- [ ] 컨텍스트가 임계값을 넘으면 자동으로 요약/압축되고 대화가 계속된다.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 통과.
- [ ] `Docs/TODO.md`의 Phase 4 항목이 모두 `[x]`다.
