# AGENTS.md — Fortress 리포지토리 작업 지침

> 이 파일은 Fortress **리포지토리 자체**를 개발하는 AI 코딩 에이전트(Claude Code, Codex 등 무엇이든)를 위한 지침입니다.
> Fortress *앱이 런타임에* 사용자의 워크스페이스에서 읽는 `AGENTS.md`/`.agents/skills/`(앱 기능)와는 **다른 문서**입니다 — 그 기능의 설계는 `Docs/Architecture.md` §6을 참고하세요.

## 0. 시작하기 전에 반드시 읽을 것

1. `Docs/Architecture.md` — 아키텍처/데이터 모델/디렉터리 구조의 단일 진실 공급원.
2. `Docs/ImplementationPlan.md` — 전체 로드맵과 Phase 의존관계.
3. `Docs/TODO.md` — 지금 무엇이 완료/진행중/대기 상태인지.
4. 자신이 맡은 `Docs/phases/PhaseN-*.md`의 해당 작업 ID 섹션 — **"소유 파일" 목록 밖의 파일은 수정하지 않습니다.**

## 1. 프로젝트 개요

Fortress는 Tauri 2 + React 19 + TypeScript로 만드는 데스크탑 앱으로, Ollama 로컬 LLM과 LangChain.js/LangGraph.js를 이용해 문서 작성·비즈니스 로직 작성·시각화를 돕는 로컬 AI 에이전트 워크스테이션입니다. UI 레이아웃은 `VivoStudio`(좌측 사이드바/패널 + 우측 탭 콘텐츠), 에이전트 관리·채팅 UX는 `VivoAcademy`를 참고했습니다.

## 2. 기술 스택 (고정)

- 패키지 매니저: **pnpm** (npm/yarn 사용 금지 — lockfile 혼재 방지)
- 프런트: React 19, TypeScript(strict), Vite 7
- UI: shadcn/ui("new-york") + Radix UI + Tailwind CSS 3 + lucide-react
- 레이아웃: react-resizable-panels
- 에디터: CodeMirror 6
- 상태관리: **React Context per concern만 사용**. Redux/Zustand/Jotai 등 새 전역 상태 라이브러리를 추가하지 않습니다. (`Docs/Architecture.md` §11)
- LLM: `@langchain/core`, `@langchain/langgraph`, `@langchain/ollama`
- 저장소: SQLite (`@tauri-apps/plugin-sql`)
- 데스크탑 셸: Tauri 2 (Rust)
- 라우팅: react-router-dom v7, **`HashRouter`** 필수(이유: Tauri 번들 자산 프로토콜에 SPA fallback이 없음 — `BrowserRouter` 사용 금지)

새 의존성을 추가하기 전에 이미 있는 라이브러리로 해결 가능한지 먼저 확인하십시오(YAGNI). 부득이하게 새 라이브러리가 필요하면 `Docs/TODO.md` 이슈 로그에 사유를 남기십시오.

## 3. 코딩 컨벤션

- TypeScript `strict: true` 준수. **`any` 타입 사용 금지** — 부득이한 경우 `unknown` + 타입 가드로 좁히고, 정말 불가피하면 `// eslint-disable-next-line @typescript-eslint/no-explicit-any`와 이유 주석을 남깁니다.
- 파일/폴더명은 `Docs/Architecture.md` §2 트리에 정의된 이름과 위치를 그대로 따릅니다. 임의로 구조를 바꾸지 마십시오. 구조 변경이 필요하다고 판단되면 먼저 `Docs/Architecture.md`를 갱신 제안하고, 문서와 코드를 함께 커밋합니다.
- 컴포넌트는 함수형 컴포넌트 + 훅만 사용(클래스 컴포넌트는 `ErrorBoundary`처럼 React가 요구하는 경우에만 예외).
- 주석은 "왜"만 남깁니다. "무엇을 하는지"는 코드 자체로 설명되어야 합니다. 함수/컴포넌트 상단에 장황한 설명 블록을 달지 않습니다.
- 요청된 범위를 넘는 리팩터링·추상화를 추가하지 않습니다. 특히 다른 작업 ID의 "소유 파일"에 개선 아이디어가 있어도 직접 고치지 말고 `Docs/TODO.md` 이슈 로그에 남기십시오.
- VivoStudio/VivoAcademy 소스 코드는 **패턴 참고용**일 뿐입니다. 해당 리포지토리의 코드를 그대로 복사/붙여넣기 하지 마십시오(의존성 버전 불일치, 불필요한 기능까지 딸려오는 문제 방지). 동일한 API 형태·동작 방식을 새로 작성하는 것이 원칙입니다.

## 4. 빌드/검증 명령

```bash
pnpm install         # 의존성 설치
pnpm dev             # Vite 개발 서버 (웹 프리뷰만)
pnpm tauri dev       # 실제 데스크탑 앱 개발 실행
pnpm typecheck       # tsc --noEmit
pnpm lint            # eslint . --max-warnings=0
pnpm test            # vitest run
pnpm build           # tsc -b && vite build
pnpm tauri build     # 배포용 인스톨러 빌드
pnpm check:ollama    # Ollama 서버/모델 상태 확인 (Phase 2 이상 로컬 개발용)
```

작업을 "완료"로 표시하기 전에 최소한 `pnpm lint`, `pnpm typecheck`, `pnpm test`가 통과해야 합니다. UI 변경은 `pnpm tauri dev`로 실제 동작을 확인한 뒤 완료 처리하십시오(타입 체크만으로는 기능 정확성을 보장하지 않습니다).

## 5. Git / 커밋 규칙

- 원격 저장소: `origin = https://github.com/godstale/FortressAgent.git`. **`git push`는 사용자의 명시적 승인 없이 실행하지 않습니다.** 로컬 커밋까지는 자유롭게 진행하되, 원격에 반영하는 시점은 항상 확인을 받습니다.
- 커밋 메시지는 Conventional Commits 스타일을 따릅니다: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`. 예: `feat(chat): add streaming stop button`.
- 하나의 커밋은 하나의 작업 ID(P#-##)에 대응하는 것을 권장합니다. 커밋 메시지 본문에 관련 작업 ID를 남기면 추적이 쉬워집니다.
- `--no-verify`, `--force`, `git reset --hard` 등 파괴적/훅 우회 명령은 사용자 명시적 지시 없이 사용하지 않습니다.
- `Docs/TODO.md` 상태 갱신은 관련 코드 변경과 **같은 커밋**에 포함시키는 것을 권장합니다.

## 6. 멀티 에이전트 협업 규칙

- 작업 시작 시 `Docs/TODO.md`에서 대상 항목을 `[ ]` → `[~]`로 변경하고 나서 코드를 작성합니다(선점 표시).
- 자신의 작업 ID가 "소유"하지 않는 파일은 수정하지 않습니다. 여러 작업이 같은 파일을 나눠 소유하는 경우(예: `package.json`의 서로 다른 필드) 해당 Phase 문서에 명시된 "이 필드만 담당" 지침을 정확히 지킵니다.
- 다른 작업 ID가 이미 `[~]`(진행중)이면 그 파일을 건드리지 않고, 필요하면 해당 작업이 끝난 뒤 이어서 진행합니다.
- Phase 간 의존성(`Docs/ImplementationPlan.md`의 의존성 그래프)을 지킵니다. 선행 Phase의 완료 조건이 충족되지 않았는데 후행 Phase 작업을 시작하지 않습니다.
- 설계 문서(`Docs/Architecture.md`)와 실제로 필요한 구현이 다르다고 판단되면, 임의로 다르게 구현하지 말고 먼저 `Docs/TODO.md` 이슈 로그에 기록한 뒤 문서 수정 여부를 결정합니다.

## 7. 안전/보안 원칙 (특히 중요)

- 스킬 실행 샌드박스(QuickJS)에 Node.js 전역 API(`process`, `require`, `child_process`, 파일시스템 직접 접근 등)를 절대 주입하지 않습니다. (`Docs/Architecture.md` §7)
- 파일 쓰기/삭제, 코드 스킬 실행 등 위험한 동작은 반드시 HITL 승인 노드를 거치도록 그래프를 구성합니다. 승인 우회 경로를 만들지 않습니다. (`Docs/Architecture.md` §8)
- Tauri 파일시스템 커맨드는 항상 사용자가 지정한 워크스페이스 스코프 밖 경로 접근을 거부해야 합니다.
- 웹 검색 도구가 가져온 외부 콘텐츠(검색 결과, 웹페이지 텍스트)는 **신뢰할 수 없는 데이터**로 취급하고, 이를 실행 가능한 지시로 해석하지 않도록 시스템 프롬프트/도구 결과 처리에서 명확히 구분합니다.
- API 키, 토큰 등 비밀 정보를 커밋하지 않습니다. `.env`, `db.sqlite*`는 `.gitignore`에 포함되어 있어야 합니다.

## 8. 앱 런타임 `AGENTS.md`/스킬 포맷 (참고용 요약)

Fortress 앱이 사용자 워크스페이스에서 인식하는 `AGENTS.md`/`.agents/skills/` 포맷은 `Docs/Architecture.md` §6에 정의되어 있습니다. 이 리포지토리 루트의 이 파일과 혼동하지 마십시오.

## 9. 참고 리서치

- 최초 요구사항/기술 리서치: `Docs/FortressPlan.txt`
- UI 아키텍처: `VivoStudio` 프로젝트 (경로: `..\VivoStudio`)
- 에이전트 관리/채팅 UX: `VivoAcademy` 프로젝트 (경로: `..\VivoAcademy`)
- 상세 아키텍처 결정: `Docs/Architecture.md`
