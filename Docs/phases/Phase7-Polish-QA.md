# Phase 7 — Polish & QA

**목표**: 1차 스코프 기능을 다듬고, 전체 시나리오를 수동 QA하고, Windows 배포 패키지를 만들 수 있는 상태로 마무리한다.

**선행 조건**: Phase 6 완료.

---

## P7-01. 텍스트/문구 일관성 점검

- **소유 파일**: 전 UI 컴포넌트(문구 수정만, 구조 변경 없음)
- **작업 내용**: 1차 스코프는 한국어 단일 언어로 통일(다국어 i18n 프레임워크 도입은 1차 스코프 제외 — 필요해지면 VivoAcademy의 `locales/ko.ts`/`en.ts` 패턴을 참고해 별도 Phase로 확장). 버튼/라벨/에러 메시지 표현 일관성(존댓말/어투 통일) 점검.
- **확인 방법**: 전체 화면을 순회하며 문구 스타일 체크리스트 작성 후 수정.

## P7-02. 키보드 단축키

- **소유 파일**: `src/hooks/useKeyboardShortcuts.ts`(신규), `src/pages/Workspace.tsx`(훅 연결)
- **작업 내용**: 최소 셋: `Ctrl/Cmd+N`(새 채팅), `Ctrl/Cmd+W`(현재 탭 닫기), `Ctrl/Cmd+,`(설정 열기), `Esc`(승인 다이얼로그/컨텍스트 메뉴 닫기).
- **확인 방법**: 각 단축키 수동 확인.

## P7-03. 에러 바운더리 및 전역 예외 처리

- **소유 파일**: `src/components/ErrorBoundary.tsx`(신규), `src/main.tsx`(적용)
- **작업 내용**: 렌더링 예외로 앱 전체가 하얗게 죽는 것을 방지하는 최상위 React ErrorBoundary. Tauri 커맨드 호출 실패에 대한 공통 에러 토스트(shadcn `Sonner`/`Toast`) 유틸.
- **확인 방법**: 의도적으로 예외를 던지는 임시 코드로 ErrorBoundary가 잡는지 확인 후 제거.

## P7-04. 성능 점검

- **소유 파일**: 필요 시 `src/components/chatsessions/ChatSessionList.tsx`, `src/components/chat/MessageList.tsx`(가상 스크롤 적용 검토)
- **작업 내용**: 세션 수/메시지 수가 많을 때(수동으로 더미 데이터 수백 건 삽입해 테스트) 목록 렌더링이 버벅이지 않는지 확인. 필요 시 `@tanstack/react-virtual` 도입 검토(실제 병목이 확인된 경우에만 — 미리 최적화하지 않음, YAGNI).
- **확인 방법**: 더미 데이터 삽입 스크립트로 체감 성능 확인.

## P7-05. Windows 패키징 점검

- **소유 파일**: `src-tauri/tauri.conf.json`(번들 설정 — 아이콘, 제품명, 버전), `src-tauri/icons/`(아이콘 리소스 추가)
- **작업 내용**: `pnpm tauri build`로 `.msi`/`.exe` 인스톨러가 정상 생성되는지 확인. 아이콘 세트 등록.
- **확인 방법**: 빌드된 인스톨러로 실제 설치 후 실행 확인.

## P7-06. 수동 QA 시나리오 실행

- **소유 파일**: `Docs/QA-Checklist.md`(신규 작성)
- **작업 내용**: 아래 골든 패스 + 엣지 케이스를 문서화하고 실제로 실행해 결과를 기록한다.
  - 최초 실행 → 워크스페이스 폴더 선택 → 기본 Agent로 채팅 시작 → 정상 응답
  - 파일 탐색기에서 파일 생성/편집/삭제
  - Agent 생성 → 다른 시스템 프롬프트로 응답 차이 확인
  - 스킬 활성화 → LLM이 스킬을 도구로 인식/호출
  - 컨텍스트 임계값 초과 → 자동 압축 동작
  - 파일 삭제 요청 → 승인 다이얼로그 → 승인/거절 각각 정상 동작
  - Mermaid/Recharts 시각화 렌더링
  - 앱 재시작 후 탭/대화 복원
  - Ollama 서버 다운 상태에서의 에러 처리/재시도
- **확인 방법**: 체크리스트의 모든 항목이 통과해야 Phase 7 완료로 간주.

## P7-07. README / 사용자 가이드

- **소유 파일**: `README.md`(Phase 0에서 만든 파일 확장), `Docs/UserGuide.md`(신규)
- **작업 내용**: 설치/실행 방법, 워크스페이스 폴더 개념, Agent/스킬/승인 모드 사용법을 사용자 관점으로 정리.
- **확인 방법**: 문서만 보고 처음 접하는 사람이 앱을 실행해 채팅까지 도달할 수 있는지 리뷰.

---

## Phase 7 완료 조건 (= 1차 스코프 전체 완료 조건)

- [ ] `Docs/QA-Checklist.md`의 모든 시나리오 통과.
- [ ] Windows 인스톨러 빌드 및 설치 확인 완료.
- [ ] README/사용자 가이드 작성 완료.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 통과.
- [ ] `Docs/TODO.md`의 Phase 7 항목이 모두 `[x]`다 → 전체 `Docs/TODO.md` 완료.
