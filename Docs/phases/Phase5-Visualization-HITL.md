# Phase 5 — Visualization & Human-in-the-Loop (HITL)

**목표**: 어시스턴트 응답에 포함된 Mermaid/Recharts 코드펜스를 인라인 시각화로 렌더링하고, 위험한 도구 호출(파일 쓰기/삭제, 코드 스킬 실행) 전에 사용자 승인을 받는 흐름을 완성한다.

**선행 조건**: Phase 2 완료. (Phase 3, 4와 병렬 진행 가능 — 단, P5-05/06은 Phase 3의 `codeSkillTool`이 `riskLevel` 메타데이터를 이미 부여했다고 가정하므로, 코드 스킬 승인까지 검증하려면 Phase 3 완료가 필요. 파일시스템 도구 승인만 검증한다면 Phase 3 없이도 진행 가능.)

**공통 참고**: `Docs/Architecture.md` §8(HITL), §10(시각화).

---

## P5-01. parseVisualBlocks

- **소유 파일**: `src/lib/markdown/parseVisualBlocks.ts`
- **작업 내용**: 마크다운 텍스트에서 \`\`\`mermaid, \`\`\`recharts 코드펜스 블록을 찾아 위치와 내용을 추출하는 파서. `recharts` 블록은 JSON으로 파싱 시도하고 실패 시 원본 텍스트로 폴백(파싱 에러가 전체 렌더링을 깨뜨리지 않도록).
- **확인 방법**: 여러 코드펜스가 섞인 샘플 마크다운으로 Vitest 작성.

## P5-02. MermaidViewer

- **소유 파일**: `src/components/chat/MermaidViewer.tsx`
- **작업 내용**: `pnpm add mermaid`. 다이어그램 코드를 받아 SVG로 렌더링. 렌더링 실패 시(문법 오류) 에러 메시지 + 원본 코드를 `<pre>`로 표시(크래시 방지). 다크/라이트 테마에 맞춰 mermaid `theme` 설정 동기화(`ThemeContext` 구독).
- **확인 방법**: 플로우차트/시퀀스 다이어그램 샘플 코드로 정상 렌더링 확인, 잘못된 문법으로 에러 폴백 확인.

## P5-03. RechartsViewer + JSON DSL

- **소유 파일**: `src/components/chat/RechartsViewer.tsx`, `src/lib/types/chartDsl.ts`
- **작업 내용**:
  1. `chartDsl.ts`에 최소 DSL 스키마 정의(Zod):
     ```ts
     const ChartDsl = z.object({
       type: z.enum(["bar", "line", "pie", "area"]),
       data: z.array(z.record(z.union([z.string(), z.number()]))),
       xKey: z.string().optional(),
       series: z.array(z.object({ key: z.string(), label: z.string().optional(), color: z.string().optional() })),
       title: z.string().optional(),
     });
     ```
  2. `pnpm add recharts`. `RechartsViewer`는 `type`에 따라 `BarChart`/`LineChart`/`PieChart`/`AreaChart` 중 하나로 매핑 렌더링. 스키마 검증 실패 시 에러 폴백(원본 JSON `<pre>` 표시).
- **확인 방법**: 4가지 차트 타입 각각 샘플 데이터로 렌더링 확인.

## P5-04. 시각화 지침 시스템 프롬프트 통합

- **소유 파일**: `src/lib/graph/nodes/agentNode.ts`(Phase 2/3 파일에 소규모 추가), `src/components/chat/MessageBubble.tsx`(Phase 2 파일에 `parseVisualBlocks` 연동 추가)
- **작업 내용**: 모든 Agent의 시스템 프롬프트에 공통으로 "다이어그램이 필요하면 \`\`\`mermaid, 차트가 필요하면 위 JSON 스키마를 따르는 \`\`\`recharts 코드펜스로 응답하라"는 지침을 자동 추가(`buildSystemPrompt()` 공통 헬퍼 함수를 만들어 `agentNode`가 사용). `MessageBubble`은 react-markdown 커스텀 컴포넌트 매핑(`code` 렌더러)에서 언어가 `mermaid`/`recharts`이면 각각 `MermaidViewer`/`RechartsViewer`로 치환.
- **확인 방법**: "지난 3개월 매출 추이를 막대그래프로 보여줘" 같은 프롬프트에 대해 실제 차트가 인라인 렌더링되는지 확인(모델의 형식 준수 여부는 프롬프트 튜닝이 필요할 수 있음 — 안 되면 few-shot 예시를 시스템 프롬프트에 추가).

## P5-05. approvalNode + 위험도 분류

- **소유 파일**: `src/lib/graph/nodes/approvalNode.ts`, `src/lib/graph/state.ts`(`pendingApproval` 필드 실제 사용 시작), `src/lib/graph/buildGraph.ts`(엣지 재구성: `agentNode → 위험도판정 → approvalNode(위험) / toolNode(안전) `), `src/lib/tools/riskLevel.ts`(신규 — 도구 이름/타입 → `"low" | "high"` 매핑, `Docs/Architecture.md` §8.1 표 구현)
- **작업 내용**: LangGraph.js의 `interrupt()`를 사용해 위험한 도구 호출 직전 그래프를 정지시키고 `pendingApproval = {toolCallId, toolName, args, riskLevel}`을 state에 기록. `agent.approvalMode`에 따라 판정 로직 분기(`Docs/Architecture.md` §8.1). Phase 4의 `checkpointer.ts`가 이 정지 상태를 저장할 수 있어야 하므로, 이 작업에서 Phase 4 완료 여부를 확인하고 안 되어 있으면 `checkpointer.ts`에 필요한 최소 인터페이스를 함께 보강한다.
- **확인 방법**: `approvalMode: "always"`인 테스트 Agent로 안전한 도구(웹검색)도 승인 대기 상태가 되는지, `"dangerous-only"`에서는 파일 쓰기만 대기하는지 단위 테스트.

## P5-06. ApprovalDialog UI + 재개 연결

- **소유 파일**: `src/components/chat/ApprovalDialog.tsx`, `src/hooks/useChat.ts`(Phase 2/4 파일에 승인 대기 상태 구독 및 `Command({resume: ...})` 호출 로직 추가)
- **작업 내용**: `pendingApproval`이 감지되면 다이얼로그를 띄워 도구명/인자(JSON pretty-print)/위험도 배지를 표시. "승인" 클릭 시 그래프를 `resume: {approved: true}`로 재개, "거절" 클릭 시 사유 입력(선택) 후 `resume: {approved: false, reason}`으로 재개(거절 사유는 `ToolMessage`로 LLM에 전달되어 대안을 제시하도록 유도).
- **확인 방법**: 파일 삭제를 요청하는 프롬프트로 실제 승인 다이얼로그가 뜨고, 승인/거절 각각에 대해 그래프가 올바르게 재개되는지 수동 확인.

## P5-07. approvalMode 설정 연동

- **소유 파일**: `src/pages/Settings/SettingsApproval.tsx`(Phase 1 placeholder 실동작 전환), `src/lib/context/SettingsContext.tsx`(신규 — 전역 기본값 관리, Phase 1/4에서 `localStorage`/`app_settings`에 흩어져 있던 설정을 이 Context로 통합 참조하도록 정리)
- **작업 내용**: 전역 기본 `approvalMode`(`SettingsApproval.tsx`에서 라디오 버튼 3종) 설정, Agent별로는 Phase 6의 `AgentEditorForm`에서 override 가능하도록 타입은 이미 §4.2에 존재하므로 UI만 연결. `"never"` 선택 시 명확한 경고 문구 표시.
- **확인 방법**: 전역 설정 변경이 새 세션에 즉시 반영되는지 확인.

---

## Phase 5 완료 조건

- [ ] Mermaid 다이어그램과 Recharts 차트가 채팅 응답에 인라인으로 렌더링된다.
- [ ] 위험한 도구 호출 전에 승인 다이얼로그가 뜨고, 승인/거절에 따라 그래프가 올바르게 동작한다.
- [ ] 승인 모드(always/dangerous-only/never)를 전역 설정에서 변경할 수 있다.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 통과.
- [ ] `Docs/TODO.md`의 Phase 5 항목이 모두 `[x]`다.
