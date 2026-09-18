# Phase 3 — Skills & AGENTS.md Loader

**목표**: 사용자의 워크스페이스 폴더에 있는 `AGENTS.md`와 `.agents/skills/`를 스캔해 LLM이 사용할 수 있는 도구/지침으로 등록한다. 스킬 관리 사이드패널(좌측)이 실동작하게 된다.

**선행 조건**: Phase 2 완료.

**공통 참고**: `Docs/Architecture.md` §6(로더 설계), §7(스킬 샌드박스).

> ⚠️ 이름 혼동 주의: 이 Phase가 다루는 `.agents/skills/`는 **Fortress 앱이 여는 사용자 워크스페이스 폴더** 안의 것입니다. Fortress 리포지토리 자체의 `.agents/skills/`(Claude Code 전역 스킬 미러)와는 무관하며 절대 그 폴더를 코드에서 참조하지 않습니다.

---

## P3-01. agentsMdParser

- **소유 파일**: `src/lib/skills-loader/agentsMdParser.ts`
- **작업 내용**: 워크스페이스 루트 경로를 받아 `AGENTS.md` 파일 존재 여부를 확인(`read_text_file` 커맨드 사용)하고, 있으면 전체 텍스트를 반환하는 `loadWorkspaceInstructions(workspaceRoot: string): Promise<string | null>` 함수. 파일이 없으면 `null` 반환(에러 아님).
- **확인 방법**: 샘플 `AGENTS.md`가 있는/없는 임시 폴더 두 케이스로 Vitest 작성.

## P3-02. skillScanner

- **소유 파일**: `src/lib/skills-loader/skillScanner.ts`, `src/lib/types/skill.ts`
- **작업 내용**:
  1. `skill.ts`에 `Docs/Architecture.md` §4.4의 `SkillManifest`, `SkillKind` 정의.
  2. `scanSkills(workspaceRoot: string): Promise<SkillManifest[]>` — `.agents/skills/` 하위 1-depth 폴더를 나열(`read_project_folder_tree` 재사용 또는 신규 Tauri 커맨드 `list_dir_shallow` 추가 — 후자를 택할 경우 `src-tauri/src/commands/fs_commands.rs`에 함수 추가는 이 작업이 담당, Phase1이 만든 파일에 **추가만** 하고 기존 함수는 건드리지 않음). 각 폴더에서 `SKILL.md`(→ `kind: "prompt"`) 또는 `index.json`(→ `kind: "code"`)을 찾아 frontmatter/JSON을 파싱해 `SkillManifest`로 변환. 둘 다 없는 폴더는 무시하고 콘솔 경고.
  3. frontmatter 파싱은 정규식 기반 최소 구현(라이브러리 의존 최소화: `---\n...\n---` 블록에서 `key: value` 라인만 추출, YAML 전체 문법 지원 불필요).
- **확인 방법**: `.agents/skills/` 하위에 프롬프트 스킬 1개 + 코드 스킬 1개를 둔 임시 폴더로 스캔 결과 검증하는 Vitest 작성.

## P3-03. promptSkill 로더 (DynamicTool 어댑터)

- **소유 파일**: `src/lib/skills-loader/promptSkill.ts`
- **작업 내용**: `Docs/Architecture.md` §6.1-4의 "프롬프트 스킬도 pseudo-tool로 취급" 설계에 따라, `SkillManifest(kind: "prompt")`를 받아 `DynamicTool`(입력 없이 호출하면 `SKILL.md` 본문 텍스트를 그대로 반환)로 변환하는 `toPromptSkillTool(skill: SkillManifest): DynamicTool` 함수 작성.
- **확인 방법**: 샘플 SKILL.md로 변환한 도구를 `.invoke({})` 했을 때 본문이 그대로 나오는지 확인.

## P3-04 / P3-05. codeSkillTool + QuickJS Rust 샌드박스

- **소유 파일**: `src/lib/skills-loader/codeSkillTool.ts`, `src-tauri/src/sandbox/quickjs_runner.rs`, `src-tauri/src/commands/sandbox_commands.rs`, `src-tauri/src/commands/mod.rs`(등록 추가), `src-tauri/Cargo.toml`(`rquickjs` 의존성 추가), `src-tauri/capabilities/default.json`(샌드박스 실행에 필요한 최소 권한만 — 신규 권한 추가하지 않는 것이 원칙, fs 접근은 스킬 코드에 직접 부여하지 않음)
- **작업 내용**:
  1. Rust: `execute_skill_sandboxed(entry_path: String, args_json: String) -> Result<String, String>` 커맨드. `rquickjs`로 격리된 JS 컨텍스트를 만들고, `index.js` 파일 내용을 로드해 `export default async function run(args)`를 호출, 반환값을 JSON 문자열로 직렬화. **Node.js 전역 객체(`process`, `require`, `fs` 등)는 절대 주입하지 않는다** — `Docs/Architecture.md` §7 Layer 1 준수. 실행 시간 제한(예: 10초 타임아웃) 적용.
  2. `codeSkillTool.ts`: `SkillManifest(kind: "code")` + `index.json`의 `inputSchema`(JSON Schema)를 Zod 스키마로 변환(간단한 하위집합만 지원: `type: "object"`, `properties`, `required` — 복잡한 JSON Schema 기능은 1차 스코프 제외)해 `DynamicStructuredTool`로 감싸고, 실행 시 Tauri `execute_skill_sandboxed`를 호출.
  3. **이 도구는 항상 "높은 위험도"로 분류**되어 Phase 5의 `approvalNode`를 거치게 된다(이 Phase에서는 아직 approvalNode가 없으므로 즉시 실행되지만, 도구 정의에 `riskLevel: "high"` 메타데이터를 미리 부여해 Phase 5가 바로 사용할 수 있게 한다).
- **확인 방법**: `console.log`만 하는 간단한 `index.js` 스킬로 실행 결과가 반환되는지, `require("fs")` 같은 코드를 넣었을 때 에러로 막히는지 확인.

## P3-06. SkillsContext + SkillListPanel + SkillViewerTab

- **소유 파일**: `src/lib/context/SkillsContext.tsx`, `src/components/skills/SkillListPanel.tsx`(Phase1 placeholder를 실동작으로 교체), `src/components/workspace/SkillViewerTab.tsx`
- **작업 내용**: `SkillsContext`는 워크스페이스가 바뀔 때마다 `scanSkills` 재실행, 스킬 목록 + "전역 기본 활성화 여부"(`enabledByDefault`는 SKILL.md/`index.json`에서 읽은 값, 사용자가 앱 내에서 토글 가능하도록 로컬 오버라이드 저장 — 저장소는 Phase 4의 SQLite가 준비되기 전까지 `localStorage` 임시 사용). `SkillListPanel`은 스킬 카드 목록 + 활성/비활성 토글 스위치 + 클릭 시 `skill-viewer` 탭 오픈. `SkillViewerTab`은 `SKILL.md` 본문(markdown 렌더링) 또는 `index.json`/`index.js` 소스 코드(읽기 전용 CodeMirror)를 보여준다.
- **확인 방법**: 스킬 토글이 즉시 반영되고, 뷰어 탭에서 스킬 내용이 올바르게 보이는지 확인.

## P3-07. AGENTS.md 지침 + 활성 스킬을 그래프에 병합

- **소유 파일**: `src/lib/graph/nodes/agentNode.ts`(Phase 2 파일에 로직 추가), `src/lib/graph/buildGraph.ts`(도구 목록 조립 시 스킬 도구 포함하도록 소규모 수정)
- **작업 내용**: `agentNode`가 시스템 프롬프트를 구성할 때 `loadWorkspaceInstructions()` 결과를 `[Workspace Instructions]` 블록으로 앞에 병합하고, `agentConfig.enabledSkills`에 해당하는 `SkillManifest`들을 `promptSkill`/`codeSkillTool`로 변환해 내장 도구 목록과 합쳐 `bindTools`한다.
- **확인 방법**: 워크스페이스에 `AGENTS.md`를 두고 "너는 어떤 지침을 따르고 있어?"라고 물었을 때 해당 내용이 반영된 답변이 오는지, 활성화한 코드 스킬을 LLM이 호출하는지 확인.

---

## Phase 3 완료 조건

- [ ] 워크스페이스의 `AGENTS.md`가 시스템 프롬프트에 반영된다.
- [ ] `.agents/skills/`의 프롬프트/코드 스킬이 스캔되어 좌측 패널에 표시된다.
- [ ] 스킬 활성/비활성 토글이 동작한다.
- [ ] 코드 스킬이 QuickJS 샌드박스에서 안전하게 실행되고, Node 전역 API 접근은 차단된다.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 통과.
- [ ] `Docs/TODO.md`의 Phase 3 항목이 모두 `[x]`다.
