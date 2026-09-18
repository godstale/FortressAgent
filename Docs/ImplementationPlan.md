# Fortress 구현 계획서 (마스터 로드맵)

이 문서는 Fortress 프로젝트의 전체 구현 로드맵입니다. 실제 상세 작업 내용은 `Docs/phases/Phase*.md`에 있으며, 진행상황 체크는 `Docs/TODO.md`에서 합니다. 아키텍처/설계 결정은 `Docs/Architecture.md`를 따릅니다.

## 어떤 에이전트든 시작하기 전에 반드시 할 일

1. `Docs/Architecture.md` 전체를 읽는다. (공통 설계 원칙, 디렉터리 구조, 데이터 모델)
2. `AGENTS.md`(리포지토리 루트)를 읽는다. (코딩 규칙, 빌드/테스트 명령, 커밋 규칙)
3. `Docs/TODO.md`에서 자신이 맡을 작업 ID의 상태를 확인한다. `[ ] 대기` 또는 `[~] 진행중`만 새로 시작할 수 있다. 이미 `[~]`인 항목을 다른 에이전트가 작업 중이면 건드리지 않는다.
4. 해당 작업이 속한 `Docs/phases/PhaseN-*.md`에서 작업 ID에 해당하는 섹션을 읽고 **"소유 파일(Owned Files)"** 목록을 확인한다. 이 목록에 없는 파일은 수정하지 않는다(다른 작업과 충돌 방지). 부득이하게 목록 밖 파일을 수정해야 하면 `Docs/TODO.md`의 "이슈" 섹션에 사유를 기록하고 진행한다.
5. 작업 시작 시 `Docs/TODO.md`에서 해당 항목을 `[ ]` → `[~]`로 바꾸고, 완료 시 `[~]` → `[x]`로 바꾼다. Phase 전체가 끝나면 Phase 헤더도 갱신한다.

## Phase 개요 (레이어 기준 분할)

각 Phase는 앱의 한 "레이어"를 완성합니다. Phase는 순서대로 의존하므로, 이전 Phase의 작업 ID들이 `[x]` 완료되기 전에 다음 Phase를 시작하지 않는 것이 원칙입니다. 단, 같은 Phase 내의 작업 ID들은 "소유 파일"이 겹치지 않는 한 여러 에이전트가 병렬로 진행할 수 있습니다.

| Phase | 이름 | 목표 | 문서 |
| --- | --- | --- | --- |
| 0 | Foundation | 레포/툴체인/기본 골격 셋업 | [Phase0-Foundation.md](./phases/Phase0-Foundation.md) |
| 1 | Shell & Layout UI | VivoStudio 스타일 좌측 사이드바/패널/우측 탭 UI 골격 (LLM 미연동, placeholder) | [Phase1-Shell-UI.md](./phases/Phase1-Shell-UI.md) |
| 2 | LLM Engine | LangGraph.js + Ollama 연동, 실제 채팅 동작(스트리밍, 기본 도구 호출) | [Phase2-LLM-Engine.md](./phases/Phase2-LLM-Engine.md) |
| 3 | Skills & AGENTS.md Loader | 워크스페이스 `AGENTS.md`/`.agents/skills` 로더, 스킬 샌드박스 | [Phase3-Skills-Agents-Loader.md](./phases/Phase3-Skills-Agents-Loader.md) |
| 4 | Session Storage & Compression | SQLite 세션/메시지 저장, 탭 영속화, 컨텍스트 75% 자동 압축 | [Phase4-Session-Storage.md](./phases/Phase4-Session-Storage.md) |
| 5 | Visualization & HITL | Mermaid/Recharts 렌더링, 승인 모드(Human-in-the-loop) | [Phase5-Visualization-HITL.md](./phases/Phase5-Visualization-HITL.md) |
| 6 | Agent Management UI | 에이전트(페르소나) CRUD UI, 채팅에서 에이전트 선택 | [Phase6-Agent-Management-UI.md](./phases/Phase6-Agent-Management-UI.md) |
| 7 | Polish & QA | 단축키, 에러 처리, 패키징, 수동 QA, 문서화 | [Phase7-Polish-QA.md](./phases/Phase7-Polish-QA.md) |

## 의존성 그래프

```
Phase 0 (Foundation)
   └─▶ Phase 1 (Shell & Layout UI)
           └─▶ Phase 2 (LLM Engine)
                   ├─▶ Phase 3 (Skills & AGENTS.md Loader)
                   ├─▶ Phase 4 (Session Storage & Compression)
                   └─▶ Phase 5 (Visualization & HITL)
                           └─▶ Phase 6 (Agent Management UI)   ※ Phase 3, 4 완료 필요 (enabledSkills, Agent 저장)
                                   └─▶ Phase 7 (Polish & QA)
```

Phase 3, 4, 5는 Phase 2 완료 후 **병렬 진행 가능**합니다(서로 다른 파일을 소유). Phase 6은 Phase 3(스킬 선택)과 Phase 4(에이전트 저장)의 산출물이 필요하므로 그 둘이 끝난 뒤 시작합니다.

## 완료 기준 (Definition of Done) — 모든 작업 공통

- TypeScript 컴파일 에러 없음 (`pnpm typecheck`).
- Lint 통과 (`pnpm lint`).
- 신규/변경된 로직에 대한 최소한의 수동 확인 절차를 거쳤음 (각 작업 문서의 "확인 방법" 참고). 자동화 테스트가 있는 영역은 `pnpm test`도 통과해야 함.
- `Docs/TODO.md`의 해당 항목 체크 갱신.
- 커밋 메시지는 `AGENTS.md`의 커밋 규칙을 따름.

## 참고 리서치 자료

- 최초 요구사항/기술 리서치: `Docs/FortressPlan.txt`
- VivoStudio UI 아키텍처 리서치 결과, VivoAcademy 에이전트/채팅 리서치 결과는 `Docs/Architecture.md` §1에 요약되어 있습니다. 원본 소스 코드가 필요하면 `..\VivoStudio`, `..\VivoAcademy` 프로젝트를 직접 참고하되, **코드를 그대로 복사하지 말고 패턴만 재구현**하십시오 (라이선스/의존성 불일치 방지, `AGENTS.md` 참고).
