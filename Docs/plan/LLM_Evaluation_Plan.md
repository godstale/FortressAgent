# Fortress 자동 평가(Evaluation) 기능 기획서

> 작성일: 2026-09-25 · 상태: **기획(승인 대기)** · 관련 조사: [`LLM_Evaluation_Research.md`](./LLM_Evaluation_Research.md)
> 이 기획서가 승인되면 `Docs/Architecture.md`(§2 트리, §4 데이터 모델, §3 레이아웃)와 `Docs/phases/Phase10-Evaluation.md`로 옮겨 확정합니다. 그 전까지 이 문서의 내용은 **제안**입니다.

---

## 1. 목표와 범위

### 1.1 문제 정의

Fortress는 "로컬 LLM 테스트 & 모니터링 워크벤치"입니다. 지금은 사용자가 에이전트(모델+설정 프리셋)를 만들고 채팅하면서 모니터링 수치를 **눈으로** 비교합니다. 이 방식에는 세 가지 한계가 있습니다.

1. **재현성 없음**: 매번 다른 질문으로 비교하기 때문에 설정 A와 B의 차이가 모델 차이인지 질문 차이인지 알 수 없습니다.
2. **품질 측정 없음**: 속도·VRAM은 모니터링으로 보이지만, "답이 맞았는가 / 도구를 제대로 썼는가"는 기록되지 않습니다.
3. **"내 PC · 내 작업" 기준 부재**: 공개 리더보드 점수는 데이터센터 GPU와 범용 과제 기준이라, 사용자 PC(VRAM 12GB 등)와 사용자 업무(문서 작성, 코드 편집, 한국어)에서 무엇이 최적인지 알려주지 않습니다.

### 1.2 목표

> **"같은 평가셋을, 같은 조건으로, 여러 후보(모델×설정)에 자동으로 돌려서, 품질·속도·자원·신뢰성을 하나의 정규화된 척도로 비교하고, 사용자의 PC와 작업 성향에 가장 맞는 후보를 추천한다."**

| # | 목표 | 성공 기준 |
| --- | --- | --- |
| G1 | 자동 실행 | 평가 스위트와 후보 N개를 고르면 사람 개입 없이 끝까지 돈다(중단 후 재개 가능) |
| G2 | 다차원 측정 | 품질·에이전트·성능·자원·신뢰성 5개 차원을 모두 기록 |
| G3 | 정규화 비교 | 서로 다른 지표를 0~100 공통 척도로 비교하고, 신뢰구간으로 "구분 불가"를 표시 |
| G4 | 개인화 | 사용자 채팅 이력으로 개인 평가셋을 만들고, 작업 프로파일 가중치로 추천 |
| G5 | 호환성 | 외부 포맷(Inspect/OpenAI Evals/promptfoo 형 JSONL) 가져오기, EEE 형식 내보내기 |

### 1.3 범위 밖 (Non-goals)

- 모델 학습·파인튜닝, 서버 부하(동시 요청 수백 건) 벤치마크, 안전성(독성·편향) 전면 평가
- Python 기반 프레임워크(lm-eval-harness, Inspect) 내장 — 기술 스택 고정 원칙(`AGENTS.md` §2). 개념과 포맷만 호환합니다.
- 공개 리더보드 운영 / 결과 업로드(내보내기 파일만 제공)

### 1.4 설계 원칙

1. **로컬 우선·오프라인 동작**: 번들 팩만으로 인터넷 없이 평가할 수 있어야 합니다. 외부 API Judge는 옵트인이며, 선택 시 데이터 반출을 경고합니다.
2. **결정적 채점 우선**: 결정적 채점(L1~L5)으로 측정할 수 있으면 LLM Judge를 쓰지 않습니다(조사 §5.1).
3. **기존 런타임 재사용**: 새 LLM 호출 경로를 만들지 않습니다. `providerRuntime`·`runAgentLoop`·`monitoringCollector`·`ChatConfigSnapshot`을 그대로 씁니다. 평가 결과는 "실제 채팅과 같은 경로"로 얻은 값이어야 의미가 있습니다.
4. **통계적 정직성**: 점수마다 표본 수와 95% 신뢰구간을 함께 보여주고, 신뢰구간이 겹치면 "차이 없음"으로 표기합니다.
5. **안전 경계 유지**: 에이전트형 평가는 격리된 임시 워크스페이스에서만 실행합니다. `shell`은 평가에서도 기본으로 비활성화하며, 승인 우회 경로를 만들지 않습니다(`AGENTS.md` §7, 아래 §8.4).
6. **신규 의존성 최소화**: 통계(부트스트랩·BT)와 채점기는 직접 구현합니다. JSON Schema 검증은 이미 쓰는 `zod`를 활용합니다.

---

## 2. 핵심 개념 (용어)

| 용어 | 정의 | 조사 대응 |
| --- | --- | --- |
| **Candidate(후보)** | 평가 대상 1건 = Agent 설정 스냅샷(Provider·모델·양자화 태그·ctx·temperature·reasoning·생성 파라미터·활성 도구) | promptfoo provider, EEE `model_info`+`generation_config` |
| **Eval Pack(평가 팩)** | 같은 목적의 샘플 묶음 + 채점 스펙 + 지표 정의. 버전과 콘텐츠 해시를 가짐 | lm-eval task, Inspect Task |
| **Sample(샘플)** | 입력 1건(+정답/루브릭/픽스처/기대 도구 호출) | Inspect `Sample` |
| **Suite(스위트)** | 여러 팩 + 샘플 수 단계(Smoke/Standard/Full) + 카테고리 가중치 | lm-eval group, HELM run spec |
| **Profile(작업 프로파일)** | 평가 차원별 가중치와 하드 제약(예: "코딩 중심", "한국어 문서 작성") | — |
| **Run(평가 실행)** | Suite × Candidates × Epochs의 1회 실행. 하드웨어 지문 포함 | EEE evaluation |
| **Trial(시행)** | Sample × Candidate × epoch 1건의 실행 결과(원시 출력·도구 궤적·토큰·타이밍) | EEE instance log |
| **Score(점수)** | Trial에 대한 채점기 1개의 결과(0~1 값 + 판정 + 이유) | Inspect Score, DeepEval score+reason |
| **Aggregate(집계)** | 팩·카테고리·차원·종합 단위의 정규화 점수 + CI | EEE evaluation_results |

---

## 3. 평가 차원 (무엇을 측정하는가)

조사 §2를 Fortress 용도에 맞게 5개 차원, 16개 카테고리로 정리했습니다.

### 3.1 차원·카테고리 체계

| 차원 | 카테고리 | 핵심 지표 | 채점 계층 | 우선순위 |
| --- | --- | --- | --- | --- |
| **Q. 품질** | Q1 지식(한/영) | 정확도(기준선 보정) | L1 | MVP |
| | Q2 추론·수학 | 정확도, 정답당 토큰 | L1(숫자 동치) | MVP |
| | Q3 지시 따르기 | prompt/inst-level strict 정확도 | L3(IFEval 체커) | MVP |
| | Q4 한국어 작문 | 루브릭 점수 | L7 Judge | 2단계 |
| | Q5 코딩 | pass@1, 편집 형식 준수율 | L4 실행 | 3단계 |
| | Q6 긴 컨텍스트 | 길이별 정확도 → 실효 컨텍스트 길이 | L1 | 2단계 |
| **A. 에이전트** | A1 도구 선택·인자 | AST 정확도(BFCL 방식) | L2 | MVP |
| | A2 도구 불필요 판단 | 관련성 탐지 정확도 | L2 | MVP |
| | A3 파일 작업 과제 | 과제 성공률(최종 상태 비교) | L5 | 2단계 |
| | A4 시각화 형식 | Mermaid/Recharts 블록 유효율 | L2(`parseVisualBlocks`+파서) | MVP |
| | A5 스킬 활용 | SKILL.md를 읽고 지침을 따랐는지 | L5+L1 | 3단계 |
| | A6 압축 후 기억 | 압축 후 핵심 사실 회상률 | L1 | 3단계 |
| **P. 성능** | P1 응답성 | TTFT(p50/p95), Load time | 측정 | MVP |
| | P2 처리 속도 | prefill·decode tok/s, 깊이별 decode 저하율 | 측정 | MVP |
| **R. 자원** | R1 메모리 | VRAM 피크, 여유분, 오프로드 %, RAM | 측정(모니터링) | MVP |
| **S. 신뢰성** | S1 안정성·일관성 | pass^k, 형식 오류율, NOANSWER율, 타임아웃/OOM율, 루프율 | 집계 | MVP |

### 3.2 왜 이 구성인가

- **P·R 차원이 품질과 대등한 이유**: 로컬 환경에서 "정확하지만 3 tok/s"인 모델은 쓸 수 없습니다. 조사 §2.1의 llama-bench와 LocalScore가 속도를 시나리오별로 따로 측정하는 이유와 같습니다.
- **A 차원이 별도인 이유**: Fortress는 채팅 앱이 아니라 도구를 쓰는 에이전트 워크벤치입니다. 로컬 모델은 tool-calling 신뢰도 편차가 커서(`Docs/spikes/ollama-tool-calling.md`) 이 차원이 모델 선택을 좌우합니다.
- **S 차원이 별도인 이유**: 평균 정답률이 같아도 매번 결과가 흔들리는 모델은 실사용에 부적합합니다(τ-bench pass^k).

---

## 4. 평가 데이터셋 (무엇으로 측정하는가)

### 4.1 팩 출처 3계층

| 계층 | 위치 | 내용 | 편집 |
| --- | --- | --- | --- |
| **Built-in** | 앱 번들 리소스(`src/assets/evals/` → 빌드 포함) | Fortress 자체 제작 팩 + 퍼미시브 라이선스 공개셋의 부분집합 | 읽기 전용(복제 후 수정) |
| **User(전역)** | `%APPDATA%/com.fortress.app/evals/packs/` | 가져온 공개셋(HF 다운로드·파일 임포트), 사용자가 만든 팩 | 편집 가능 |
| **Project** | `{workspace}/.fortress/evals/packs/` | 채팅 이력에서 만든 **개인 평가셋**, 프로젝트 전용 픽스처 과제 | 편집 가능 |

- 라이선스 원칙(조사 §4.9): ND·NC 조건이나 재배포 자제 요청이 있는 데이터(KMMLU, GPQA, HAE-RAE 등)는 번들하지 않습니다. 사용자가 직접 받게 하는 **임포터**만 제공합니다.

### 4.2 Built-in 팩 목록 (제안)

**(가) Fortress Agent Bench (FAB) — 자체 제작, 핵심 차별화**

| 팩 ID | 카테고리 | 샘플 수(Std) | 내용 | 채점 |
| --- | --- | --- | --- | --- |
| `fab-tools-select` | A1 | 60 | Fortress 실제 도구 스키마(read/ls/grep/find/write/edit/web_search)로 "어떤 도구를 어떤 인자로 호출할까" 단일·다중·병렬 호출 | AST + 허용값 목록 |
| `fab-tools-relevance` | A2 | 40 | 도구 없이 답해야 하는 질문 / 제공된 도구로 불가능한 요청 | 도구 미호출 여부 |
| `fab-fs-tasks` | A3 | 30 | 픽스처 워크스페이스(md·ts·json 10~30개)에서 "X가 정의된 파일을 찾아 Y로 수정", "README 요약을 SUMMARY.md로 저장" 등 | 최종 파일 상태 + 답변 키워드 |
| `fab-viz` | A4 | 30 | "이 흐름을 Mermaid로", "이 표를 막대 차트로" | `parseVisualBlocks` + Mermaid 파서 + Recharts DSL zod 검증 |
| `fab-longctx` | Q6 | 길이 5단계×12 | 합성 문서에 needle 1~4개 + 멀티홉 추적, 길이 {2k, 8k, 16k, 32k, 64k} 중 후보 ctx 이하 | 정답 대조 |
| `fab-compaction` | A6 | 10 | 긴 대화 → 강제 압축 → 앞부분 사실 질문 | 정답 대조 |
| `fab-skill` | A5 | 10 | 픽스처 `.agents/skills/`에 스킬 → 해당 과제 수행 시 `read(SKILL.md)` 호출 + 스킬 지침 준수 | 궤적 + 상태 |
| `fab-ko-writing` | Q4 | 20 | 한국어 문서 작성(보고서 요약, 이메일, 기술 문서) | Judge 루브릭(§6.5) |
| `fab-perf-probe` | P1·P2 | 8 시나리오 | LocalScore형 입출력 길이 조합(16/64/1k/2k/4k 입력 × 128/512/1k 출력) + 깊이 스윕 | 측정 전용(채점 없음) |

**(나) 공개셋 부분집합 (번들 가능한 라이선스만, 층화 샘플링)**

| 팩 ID | 원본 | Smoke / Std / Full | 비고 |
| --- | --- | --- | --- |
| `gsm8k-sub` | GSM8K(MIT) | 20 / 100 / 300 | + 숫자·이름을 바꾼 변형 셋(`gsm8k-perturb`)으로 오염 점검 |
| `mmlu-pro-sub` | MMLU-Pro(MIT) | 30 / 140(14과목×10) / 700 | 10지선다, 선택지 셔플 |
| `ifeval-sub` | IFEval(Apache-2.0) | 20 / 100 / 541(전체) | 체커 TS 포팅 |
| `humaneval-plus-sub` | HumanEval+(MIT/Apache) | 10 / 50 / 164 | 3단계, 실행 샌드박스 필요 |
| `bfcl-simple-sub` | BFCL(Apache-2.0) | 20 / 100 / 400 | FAB와 교차 검증용 |

**(다) 임포터로 제공 (번들하지 않음)**: KMMLU(-Redux), HAE-RAE, CLIcK, KoBEST, Ko-IFEval, GPQA, LogicKor 질문셋. 임포터는 HF 데이터셋 ID + 필드 매핑 프리셋을 내장하고, 사용자가 "다운로드 & 변환"을 누르면 User 계층에 팩을 만듭니다.

### 4.3 개인 평가셋 (Personal Pack) — "내 작업 내역" 반영

"내 작업에 맞는 모델"을 찾는 핵심 장치입니다.

1. **채팅에서 저장**: 사용자 말풍선의 [⋯] 메뉴 → "평가 케이스로 저장". 그 시점의 대화 문맥(직전 N개 메시지)과 입력을 샘플로 만듭니다.
2. **정답/기준 지정** (다음 중 선택):
   - **참조 답변**: 현재 어시스턴트 응답(또는 사용자가 수정한 답)을 `reference`로 저장 → Judge 참조 기반 채점
   - **검증 규칙**: "반드시 포함할 키워드", "JSON 형식", "Mermaid 블록 포함", "파일 X가 생성됨" 같은 결정적 체크 선택
   - **루브릭**: 자유 서술 기준 → Judge 루브릭 채점
3. **워크스페이스 픽스처 캡처(선택)**: 도구를 쓴 대화라면 관련 파일을 스냅샷해서 픽스처로 저장합니다. 크기 상한 1MB, `.gitignore` 대상과 비밀 파일 패턴(`.env` 등)은 제외합니다.
4. **대량 생성 도우미**: 최근 세션 목록에서 다중 선택 → 일괄 초안 생성 → 사용자가 검토·확정합니다. 자동 저장은 하지 않습니다(프라이버시).
5. 저장 위치는 Project 계층입니다(기본 `.fortress/`는 gitignore). 전역으로 승격할 수 있습니다.

### 4.4 로컬 Arena (블라인드 A/B)

- 채팅 탭의 "비교 모드": 같은 입력을 두 후보에 순차 전송 → 좌우 무작위 배치, 모델명 숨김 → 사용자가 A / B / 무승부 / 둘 다 나쁨 선택
- 투표를 누적해 **Bradley-Terry + 부트스트랩 CI**로 개인 선호 순위를 산출합니다(조사 §5.4). 이 순위는 종합 점수에 "개인 선호" 카테고리로 반영할 수 있습니다(가중치는 프로파일에서 조정).
- 투표한 입력은 원하면 개인 팩 샘플로 승격합니다.

---

## 5. 자동화 테스트 실행 (어떻게 돌리는가)

### 5.1 실행 파이프라인

```
① 스위트/프로파일 선택 → ② 후보 선택(에이전트 다중 선택 또는 매트릭스 생성)
→ ③ 사전 점검(Preflight) → ④ 예상 시간·VRAM 적합성 표시 → 사용자 확인
→ ⑤ 후보별 순차 실행 [언로드 → 로드 측정 → 워밍업 → 성능 프로브 → 품질/에이전트 샘플 × epochs]
→ ⑥ Judge 패스(필요 시, 모든 후보 실행 후) → ⑦ 집계·정규화 → ⑧ 리포트
```

### 5.2 후보 매트릭스 생성기

- 기준 에이전트 1개를 고르고 **스윕 축**을 지정하면 조합을 만듭니다(llama-bench의 콤마 스윕과 같은 개념).
  - 축 예: `model ∈ {qwen3:8b-q4_K_M, qwen3:8b-q8_0, gemma3:12b}`, `contextSize ∈ {8k, 32k}`, `reasoning ∈ {off, on:low}`, `temperature ∈ {0.2, 0.7}`
- 조합 수 × 예상 시간을 즉시 보여주고, 상한(기본 12개)을 넘으면 경고합니다.
- 생성된 후보는 **임시 스냅샷**입니다. 에이전트 DB에 저장하지 않고, 결과 화면에서 "이 설정으로 에이전트 만들기"를 제공합니다(P9-05의 분기 저장 규칙과 충돌하지 않음).

### 5.3 Preflight (사전 점검)

| 점검 | 방법 | 실패 시 |
| --- | --- | --- |
| Provider 연결·모델 존재 | `checkProviderModel` | 후보 제외 + 사유 표시 |
| VRAM 적합성 추정 | 모델 크기(`/api/show`) + KV 캐시 추정(ctx × layer × head 차원) vs GPU 여유 VRAM | "부분 오프로드 예상" 경고(실행은 허용 — 오프로드 자체가 측정 대상) |
| 도구 지원 여부 | 모델 capability(tools) | A 차원 팩은 "N/A"로 처리 |
| 앱 상태 | `chatQueueManager` busy | 채팅이 끝날 때까지 시작 대기 |
| 디스크 | 결과·픽스처 저장 공간 | 경고 |

### 5.4 실행 규칙 (공정성·재현성)

1. **후보 단위로 묶어 순차 실행**: 한 모델의 모든 샘플을 끝낸 뒤 다음 모델로 넘어갑니다. 재로딩과 VRAM 경합이 측정을 오염시키지 않게 하기 위함입니다(조사 §4.3).
2. **언로드 → 콜드 로드 측정**: 후보를 시작할 때 이전 모델을 언로드(Ollama `keep_alive: 0`, 다른 Provider는 가능한 범위에서)하고, 첫 요청의 `load_duration`을 P1 지표로 기록합니다.
3. **워밍업 1회**: 결과에서 제외합니다.
4. **샘플 순서 고정 시드 셔플**: 모든 후보에 같은 순서를 적용합니다.
5. **생성 설정**:
   - 품질·에이전트 팩: 후보의 설정을 그대로 쓰되 `seed` 고정(지원 시). 기본 epochs=1
   - 신뢰성 측정: `reliability` 태그가 붙은 샘플만 epochs=k(기본 3)로 반복 → pass^k
   - "결정성 모드" 옵션: temperature 0 강제(모델 고유 능력 측정용). 이 경우 리포트에 명시합니다.
6. **프롬프트 캐시 분리**: 샘플마다 새 대화로 시작하고, prefill 속도는 캐시 미적중 샘플만 P2 지표에 넣습니다. 캐시 적중 여부는 `prompt_eval_count`가 입력 추정치보다 현저히 작은지로 판정합니다.
7. **타임아웃·최대 턴**: 샘플별 `timeoutSec`(기본 180, 사고 모델 ×3), 에이전트 과제 `maxTurns`(기본 12). 초과 시 `timeout`/`max_turns`로 기록하고 오답 처리합니다.
8. **오류 분류**: `ok` / `timeout` / `oom` / `provider_error` / `parse_error`(도구 호출 JSON 실패) / `no_answer` / `max_turns` / `cancelled`. S1 지표의 입력이 됩니다.
9. **평가 중 채팅 차단**: 실행 동안 `chatQueueManager`에 평가 작업을 등록해 전역 busy로 만들고, 채팅 입력은 "평가 실행 중" 배너와 함께 대기시킵니다(P9-02 폴더 전환 가드도 자동 적용).
10. **체크포인트·재개**: Trial을 끝날 때마다 DB에 커밋합니다. 앱 재시작 후 "미완료 실행 이어하기"로 남은 Trial만 실행합니다(후보 스냅샷과 팩 해시가 같을 때만).

### 5.5 샘플 실행 방식 (유형별 Solver)

| 유형 | 동작 | 사용 모듈 |
| --- | --- | --- |
| `single_turn` | system + (few-shot) + input → 1회 생성, 도구 없음 | `getStreamChatFn` |
| `multi_turn` | 사전 대화 이력 + 마지막 입력 | 동일 |
| `tool_call` | 도구 스키마 제공, **1턴만** 생성하고 도구는 실행하지 않음 → 호출 구조 채점 | `runAgentLoop` + `shouldStopAfterTurn` 훅 |
| `agentic` | 픽스처 워크스페이스에서 도구 실제 실행, 최종 응답까지 | `runAgentLoop` + 샌드박스 도구 세트(§8.4) |
| `perf_probe` | 지정 길이의 합성 입력 + 출력 길이 고정(`maxOutputTokens`), 반복 r회 | `getStreamChatFn` |

### 5.6 소요 시간·중단

- 실행 전 추정: `Σ(입력토큰/prefill + 출력토큰추정/decode) × epochs + 로드시간 × 후보 수`. 속도는 해당 모델의 최근 모니터링 스냅샷 값을 쓰고, 없으면 성능 프로브 후 재추정합니다.
- 스위트 단계: **Smoke**(후보당 약 5~10분) / **Standard**(약 30~60분) / **Full**(수 시간)
- 실행 중 일시정지·취소·"이 후보 건너뛰기"를 지원합니다.

---

## 6. 채점 (어떻게 평가하는가)

### 6.1 채점기(Scorer) 목록

| ID | 계층 | 동작 | 옵션 |
| --- | --- | --- | --- |
| `exact` | L1 | 정규화(trim·대소문자·공백·전각/반각·구두점) 후 완전 일치 | `normalize[]` |
| `includes` | L1 | 부분 문자열 포함(any/all) | `mode`, `caseSensitive` |
| `regex` | L1 | 정규식 매치, 캡처 그룹을 정답과 비교 | `pattern`, `group` |
| `choice` | L1 | 선택지 문자 추출("정답: C", "(C)", 마지막 등장 등 규칙 체인) → 비교 | `extract[]`, `circular` |
| `numeric` | L1 | 마지막 숫자/`\boxed{}` 추출 → 허용오차 비교(쉼표·단위 제거) | `tolerance` |
| `json_schema` | L2 | JSON 추출 → zod 스키마 검증(JSON Schema → zod 변환) | `schema` |
| `tool_call_ast` | L2 | BFCL 방식: 함수명·필수 인자·환각 인자·타입·**허용값 목록** 매칭, 병렬 호출은 순서 무관 매칭 | `allowExtraCalls`, `orderSensitive` |
| `no_tool_call` | L2 | 도구를 호출하지 않았는지 | — |
| `viz_block` | L2 | `parseVisualBlocks` → mermaid `parse()` / Recharts DSL zod 검증 | `kind` |
| `ifeval` | L3 | IFEval 체커 25종 TS 포팅(+한국어 변형: 글자 수, 존댓말 등) | strict/loose |
| `fs_state` | L5 | 픽스처 최종 상태 검사: 파일 존재/부재, 내용 포함·정규식·정확 일치, 변경 금지 파일 불변 | `expect[]` |
| `trajectory` | L5 | 도구 궤적 조건: 특정 도구 호출 여부, 호출 순서, 최대 호출 수 | `mustCall`, `mustNotCall`, `maxCalls` |
| `code_exec` | L4 | 코드 블록 추출 → 샌드박스 실행 → 테스트 통과 | 3단계(§8.5) |
| `llm_judge_rubric` | L7 | 루브릭 단일 채점(1~5 또는 1~10) | judge 설정(§6.5) |
| `llm_judge_pairwise` | L7 | 기준 답변 또는 다른 후보와 쌍대 비교, 순서 교체 2회 | 동일 |
| `human` | L8 | 리포트 화면에서 사람이 채점(합격/불합격/점수) | — |

- 한 샘플에 **여러 채점기**를 붙일 수 있습니다. 샘플 점수는 **가중 평균**(promptfoo `weight`)이고, `gate: true`인 채점기가 실패하면 샘플 점수는 0입니다. 예: 에이전트 과제는 `fs_state`(gate) + `trajectory`(weight 0.3) + `includes`(weight 0.2).
- 모든 Score는 `value(0~1)`, `verdict(correct|incorrect|partial|no_answer|error)`, `reason`(사람이 읽을 사유), `extracted`(추출된 답)를 저장합니다(DeepEval의 score+reason 방식).

### 6.2 정답 추출 규칙

1. 사고 내용(`reasoning` 필드, `<think>` 블록)은 채점 대상에서 제외합니다. 사고 토큰 수는 별도로 기록합니다.
2. 객관식·수학 팩의 system 프롬프트에 **정답 표기 형식**을 지시합니다(`정답: X` / `ANSWER: X`). 추출은 "형식 매치 → 마지막 선택지 문자 → 실패(no_answer)" 순서로 시도합니다.
3. `no_answer`는 오답으로 계산하되 S1 "형식 오류율"에 별도 집계합니다. "몰라서 틀림"과 "형식을 못 지킴"을 구분하기 위함입니다.

### 6.3 객관식 위치 편향 제거

`circular: true`인 팩은 선택지를 N회 회전시켜 **모두 맞혀야 정답**으로 인정합니다(OpenCompass CircularEval). 비용이 N배이므로 Standard 이상에서만 켜고, Smoke에서는 시드 셔플 1회로 대신합니다.

### 6.4 에이전트 과제 채점 상세 (`fab-fs-tasks`)

```
픽스처 복사(임시 폴더) → 에이전트 실행(샌드박스 도구) → 최종 상태 스냅샷(파일 목록+해시+내용)
→ fs_state 기대값 대조 → trajectory 검사 → 최종 답변 검사 → 임시 폴더 삭제
```

- 기대값 예: `{ path: "SUMMARY.md", exists: true, contains: ["Fortress", "Tauri"] }`, `{ path: "src/**", unchanged: true }`
- 부가 지표: 도구 호출 수(효율, DeepEval Step Efficiency), 불필요한 쓰기 발생 여부, 턴 수

### 6.5 LLM Judge 설계

| 항목 | 결정 |
| --- | --- |
| Judge 선택 | ① 로컬 모델(권장: 후보보다 큰 모델 또는 Prometheus 2 계열) ② 외부 OpenAI 호환 API(옵트인, 데이터 반출 경고 + 팩 단위 동의) |
| 자기선호 방지 | Judge와 후보가 같은 모델 계열이면 경고. 같은 모델 태그면 차단 |
| 실행 시점 | 모든 후보 실행 후 **Judge 패스**를 따로 실행(VRAM 경합 방지, 조사 §5.3) |
| 출력 형식 | JSON `{ "reasoning": "...", "score": n }`(zod 검증, 실패 시 1회 재시도 후 `error`) |
| 결정성 | temperature 0, seed 고정 |
| 쌍대 비교 | A/B 순서를 바꿔 2회 판정. 결과가 불일치하면 무승부 |
| 길이 편향 | 루브릭에 "길이 자체로 가점하지 않음" 명시 + 리포트에 점수-길이 상관 표시. 상관이 높으면 경고 |
| 참조 기반 | 개인 팩에 참조 답변이 있으면 참조를 함께 제공(수학·사실 과제의 Judge 약점 보완) |
| Judge 신뢰도 점검 | 사용자가 사람 채점한 샘플(≥20)이 있으면 Judge–사람 일치도(Cohen's κ 또는 일치율)를 표시하고, 낮으면 Judge 점수에 "신뢰 낮음" 표기 |
| 기록 | Judge 모델·프롬프트 버전·원문 응답을 Score에 저장(재현성) |

루브릭 기본 템플릿(`fab-ko-writing`): 정확성 / 요구사항 충족 / 구성·가독성 / 한국어 자연스러움 / 간결성 — 각 1~5점, 항목별 근거 1문장.

### 6.6 사람 채점

리포트의 샘플 상세 화면에서 합격/불합격/점수를 입력할 수 있습니다. 입력된 사람 점수는 해당 Trial의 `human` Score로 저장되어 **Judge 점수보다 우선**합니다.

---

## 7. 정규화 스킴 (어떻게 비교 가능하게 만드는가)

### 7.1 4단 집계 구조

```
Trial Score(0~1) → Sample Score(epochs 집계) → Pack Score(원시 지표) → 정규화 Pack Score(0~100)
→ Category Score(0~100) → Dimension Score(0~100) → Profile Composite(0~100) + 제약 판정
```

### 7.2 품질·에이전트 지표 정규화 (기준선 보정)

Open LLM Leaderboard v2 공식을 채택합니다(조사 §6.1).

```
norm = clamp((raw − baseline) / (ceiling − baseline), 0, 1) × 100
```

| 지표 유형 | baseline | ceiling |
| --- | --- | --- |
| k지선다 | 1/k (CircularEval이면 (1/k)^N) | 1.0 |
| 생성형 정답(수학·IFEval·도구 AST) | 0 | 1.0 |
| 이진 판단(관련성 탐지 등) | 0.5 | 1.0 |
| Judge 1~5 | 1 → (s−1)/4 | 5 |
| 하위 태스크가 있는 팩 | 하위 태스크별로 정규화한 뒤 평균 | |

### 7.3 성능·자원 지표 정규화 (절대 앵커 효용 함수)

속도·메모리는 "최대"가 없고 사용 목적마다 체감 기준이 다릅니다. 그래서 LocalScore처럼 **고정 앵커**를 쓰는 효용 함수로 0~100에 대응시킵니다. 실행 내 min-max 방식은 비교 대상이 바뀌면 점수도 바뀌므로 쓰지 않습니다.

| 지표 | 방향 | 0점 앵커(사용 불가) | 100점 앵커(충분) | 곡선 | 근거 |
| --- | --- | --- | --- | --- | --- |
| Decode tok/s | ↑ | 3 | 60 | 로그 | 사람 읽기 속도(약 5~10 tok/s)를 넘으면 체감 개선 폭이 줄어들므로 로그 |
| Prefill tok/s (캐시 미적중) | ↑ | 50 | 3,000 | 로그 | 4k 컨텍스트를 1~2초 안에 처리 |
| TTFT p50 (1k 입력) | ↓ | 15 s | 0.5 s | 로그 | 대화형 대기 한계 |
| Load time | ↓ | 60 s | 3 s | 로그 | 모델 전환 체감 |
| 깊이 저하율 (32k decode / 1k decode) | ↑ | 0.3 | 0.9 | 선형 | 긴 대화 유지력 |
| VRAM 여유율 (1 − 피크/총량) | ↑ | 0% | ≥15% | 선형(상한 포화) | OOM 여유 |
| GPU 오프로드 | ↑ | 50% | 100% | 선형 | 부분 오프로드는 속도 급락 |

```
로그 효용(↑): u = clamp( ln(x / a0) / ln(a100 / a0), 0, 1 ) × 100
로그 효용(↓): u = clamp( ln(a0 / x) / ln(a0 / a100), 0, 1 ) × 100
```

- 앵커는 **프로파일마다 덮어쓸 수 있습니다**(예: "배치 문서 생성" 프로파일은 TTFT 가중치 ↓, decode 앵커 ↑).
- 앵커 세트에는 버전(`anchorsVersion`)을 붙여 결과와 함께 저장합니다. 앵커를 바꾸면 예전 결과는 원시값으로 **재계산**합니다(원시값을 항상 보존하는 이유).

### 7.4 신뢰성 지표

| 지표 | 정의 | 정규화 |
| --- | --- | --- |
| pass^k | `C(c,k)/C(n,k)`를 샘플 평균 (n=epochs) | 0~100 그대로 |
| pass@k (코딩) | `1 − C(n−c,k)/C(n,k)` | 0~100 |
| 형식 오류율 | (parse_error + no_answer) / 전체 | `(1 − rate) × 100` |
| 실패율 | (timeout + oom + provider_error + max_turns) / 전체 | `(1 − rate) × 100` |
| 점수 분산 | epochs 간 샘플 점수 표준편차 평균 | `(1 − 2σ) × 100` 하한 0 |

### 7.5 효율 복합 지표 (보조)

- **정답당 토큰**(Q2): 맞힌 샘플의 평균 출력 토큰(사고 포함) → 사고 모드의 비용 대비 효과 판단
- **정답당 시간**: 정답률 / 총 소요시간 → "빠르고 적당히 맞는" 모델 식별
- 이 두 지표는 종합 점수에 넣지 않고 리포트 보조 컬럼으로만 보여줍니다(이중 계산 방지).

### 7.6 종합 점수 (Profile Composite)

```
Category  = 소속 팩 정규화 점수의 (샘플 수 가중) 평균
Dimension = Σ(category_w × Category) / Σ category_w
Composite = Σ(dim_w × Dimension) / Σ dim_w       // 가중 산술평균
```

- **가중 산술평균**을 쓰고, 하나가 0이면 전체가 0이 되는 기하평균은 쓰지 않습니다. 대신 치명적 약점은 **하드 제약**으로 걸러냅니다(§7.7). 그래야 "왜 탈락했는지"가 명시적으로 드러납니다.
- 평가되지 않은 카테고리(N/A, 예: 도구 미지원 모델의 A 차원)는 가중치를 제외하고 재정규화하되, 리포트에 "커버리지 %"를 함께 표시합니다(HELM 커버리지 문제의식).

**기본 프로파일 (제안)**

| 프로파일 | Q | A | P | R | S | 하드 제약 |
| --- | --- | --- | --- | --- | --- | --- |
| 균형(기본) | 30 | 25 | 20 | 10 | 15 | VRAM 여유 ≥ 5%, 실패율 ≤ 10% |
| 코딩 에이전트 | 25 | 40 | 15 | 5 | 15 | A1 ≥ 70, 형식 오류율 ≤ 10% |
| 한국어 문서 작성 | 45(Q1·Q3·Q4 중심) | 10 | 20 | 10 | 15 | decode ≥ 10 tok/s |
| 빠른 응답 | 25 | 15 | 40 | 10 | 10 | TTFT p50 ≤ 2s |
| 긴 문서 분석 | 30(Q6 중심) | 15 | 20 | 20 | 15 | 실효 컨텍스트 ≥ 32k |

사용자는 프로파일을 복제해 가중치·앵커·제약을 수정할 수 있습니다. 가중치 합은 자동으로 정규화합니다.

### 7.7 제약 필터 → 파레토 → 추천

1. **하드 제약** 위반 후보는 "부적합"으로 표시합니다(점수는 계산하되 순위에서 제외).
2. 남은 후보로 **품질(Q+A) vs 속도(P) 파레토 프런티어**를 계산해 산점도로 보여줍니다(버블 크기=VRAM).
3. 추천 3종:
   - **최적**: Composite 1위
   - **빠른 대안**: 파레토 위 후보 중 Composite가 1위와 통계적으로 구분되지 않으면서 P 점수가 가장 높은 후보
   - **고품질 대안**: 파레토 위 후보 중 Q+A가 가장 높은 후보
4. 추천 사유는 문장으로 생성합니다(템플릿 기반, LLM 미사용). 예: "qwen3:8b-q4_K_M(ctx 32k)는 도구 정확도 88(±4)로 1위와 차이가 없고 decode가 1.7배 빠릅니다."

### 7.8 불확실성·통계 (조사 §6.3)

| 항목 | 방법 |
| --- | --- |
| 팩 점수 CI | 이진 점수는 Wilson 구간, 연속 점수는 **부트스트랩 95% CI**(1,000회, 샘플 단위 재표집, 시드 고정) |
| 군집 | 같은 픽스처나 지문을 공유하는 샘플은 `clusterId`로 묶어 **군집 부트스트랩** |
| 종합 점수 CI | 샘플 재표집을 전 계층에 전파한 부트스트랩(같은 재표집 인덱스를 모든 후보에 적용 = 쌍대) |
| 후보 간 비교 | 같은 샘플의 **쌍대 차이** 부트스트랩 CI가 0을 포함하면 "구분 불가"(순위 표에서 같은 순위 그룹으로 묶음) |
| 검정력 안내 | 실행 설정 화면에 "이 표본 수로 구분 가능한 최소 차이 ≈ ±x%p" 표시(`1.96·√(p(1−p)/n)`, p=0.5 보수적 가정). 예: n=100 → ±9.8%p, n=400 → ±4.9%p |
| 성능 지표 | 반복 r회의 평균 ± 표준편차(llama-bench 방식), TTFT·ITL은 p50/p95 |
| Arena | Bradley-Terry MLE(뉴턴법 또는 MM 반복) + 부트스트랩 CI, 무승부는 0.5승 |

### 7.9 하드웨어 지문 (비교 가능 범위)

모든 Run은 하드웨어 지문을 저장합니다: `{ gpuName, vramTotalMb, driverVersion?, ramTotalMb, cpuName?, os, providerKind, providerVersion }`.

- 성능·자원 지표는 **지문이 같은 Run끼리만** 직접 비교합니다. 지문이 다르면 리포트에 "다른 환경" 배지를 붙입니다.
- 품질 지표는 환경과 무관하게 비교할 수 있습니다(단, 양자화·Provider가 같을 때).

---

## 8. Fortress 적용 설계

### 8.1 모듈 구조 (제안 — 승인 시 `Architecture.md` §2에 반영)

```
src/lib/eval/
  types.ts            # zod 스키마: EvalPack/Sample/ScorerSpec/MetricSpec/Profile/Run/Trial/Score (§9)
  packLoader.ts       # 3계층 팩 로드·검증·해시, 층화 샘플링(Smoke/Std/Full)
  importers/          # jsonl(Inspect/OpenAI Evals/promptfoo 필드 매핑), hf 프리셋(KMMLU 등)
  candidates.ts       # Agent → Candidate 스냅샷, 매트릭스 스윕 생성
  preflight.ts        # 모델 확인·VRAM 추정·시간 추정
  runner.ts           # 실행 오케스트레이터(순차, 체크포인트, 취소, chatQueueManager 연동)
  solvers.ts          # single_turn / multi_turn / tool_call / agentic / perf_probe
  sandbox.ts          # 픽스처 임시 워크스페이스 생성·상태 스냅샷·정리 (Rust 커맨드 호출)
  scorers/            # exact, includes, regex, choice, numeric, jsonSchema, toolCallAst, noToolCall,
                      # vizBlock, ifeval/, fsState, trajectory, llmJudge, human
  judge.ts            # Judge 패스, 순서 교체, 파싱·재시도
  aggregate.ts        # 4단 집계, N/A 재정규화
  normalize.ts        # 기준선 보정, 앵커 효용 함수
  stats.ts            # Wilson, 부트스트랩(군집·쌍대), pass@k/pass^k, Bradley-Terry
  recommend.ts        # 제약 필터, 파레토, 추천 사유 템플릿
  exportEee.ts        # EEE JSON + samples JSONL 내보내기
src/lib/db/repositories/evalRepo.ts
src/lib/context/EvalContext.tsx           # 실행 상태·진행률(Context per concern 원칙)
src/components/eval/
  EvalListPanel.tsx     # 사이드 패널: 스위트·팩·실행 이력
  EvalRunWizard.tsx     # 실행 설정(스위트/프로파일/후보/단계/epochs)
  EvalRunProgress.tsx   # 실시간 진행(후보×팩 진행 바, 현재 샘플, 모니터링 미니 차트)
  EvalReport.tsx        # 순위표·레이더·파레토·카테고리 히트맵
  EvalSampleDetail.tsx  # 샘플 드릴다운(후보별 출력 diff, 채점 사유, 사람 채점)
  EvalPackEditor.tsx    # 팩/샘플 편집, 개인 팩 관리
  ArenaCompare.tsx      # 블라인드 A/B
src/components/workspace/EvalTab.tsx     # 탭 라우팅(run-config / run / report / pack)
src/assets/evals/                         # Built-in 팩(JSONL + manifest), 픽스처
src-tauri/src/commands/eval_commands.rs   # 픽스처 임시 폴더 생성/복사/스냅샷/삭제
```

- `WorkspaceTabType`에 `'eval'`을 추가하고(`meta.view`로 하위 화면 구분), `SidePanelView`에 `'evaluation'`을, ActivityBar에 평가 아이콘(lucide `FlaskConical`)을 추가합니다.
- 모든 UI 문구는 ko/en 사전 키로 등록합니다(`AGENTS.md` §3).

### 8.2 기존 모듈 재사용 지점

| 필요 | 기존 모듈 | 방식 |
| --- | --- | --- |
| LLM 호출 | `providerRuntime.getStreamChatFn` | 후보 스냅샷 → `ResolvedLlmRuntime` |
| 에이전트 실행 | `runAgentLoop` | `tools`에 샌드박스 도구 주입, `hooks.beforeToolCall`로 샌드박스 승인 정책 적용, `shouldStopAfterTurn`으로 tool_call 1턴 정지 |
| 설정 스냅샷 | `ChatConfigSnapshot` / `captureChatConfigSnapshot` | Candidate 스냅샷의 기반(필드 재사용 + 활성 도구·스킬 추가) |
| 생성 파라미터 매핑 | `generationParams.ts` | Provider 미지원 파라미터를 결과에 "무시됨"으로 기록 |
| 성능·자원 측정 | `monitoringCollector`, `tokenTracker` | Trial 기간의 스냅샷을 `conversation_id = trialId`로 태깅 → VRAM 피크·GPU 사용률 집계 |
| 시각화 검증 | `parseVisualBlocks`, Mermaid, Recharts DSL | `viz_block` 채점기 |
| 압축 | `compaction/compact` | `fab-compaction`에서 강제 압축 |
| 스킬 | 스킬 스캐너 | 픽스처 폴더를 워크스페이스로 스캔(신뢰 확인은 번들 픽스처만 자동 신뢰, §8.4) |
| 동시 실행 방지 | `chatQueueManager` | 평가 작업을 busy로 등록 |
| 차트 | 기존 Recharts | 레이더·산점도·막대 |

### 8.3 저장소 (DB 스키마 제안)

평가 결과는 **하드웨어·모델 단위의 자산**이므로 **전역 DB**에 저장합니다(여러 프로젝트에서 같은 PC의 결과를 공유). 개인 팩 파일만 프로젝트 `.fortress/evals/`에 둡니다(`Architecture.md` §4.5 분리 원칙 확장).

```sql
CREATE TABLE eval_runs (
  id TEXT PRIMARY KEY,
  name TEXT,
  suite_json TEXT NOT NULL,          -- 팩 ID·버전·해시·단계·epochs
  profile_json TEXT NOT NULL,        -- 가중치·앵커(anchorsVersion)·제약
  hardware_json TEXT NOT NULL,       -- §7.9 지문
  status TEXT NOT NULL,              -- pending|running|paused|judging|completed|cancelled|failed
  judge_json TEXT,                   -- Judge 설정(없으면 NULL)
  workspace_root TEXT,               -- 개인 팩 출처 프로젝트(있으면)
  started_at TEXT, finished_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE eval_candidates (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  source_agent_id TEXT,              -- 원본 에이전트(삭제돼도 스냅샷 유지, FK 없음)
  snapshot_json TEXT NOT NULL,       -- Candidate 스냅샷 전체
  model_meta_json TEXT,              -- 파라미터 수·양자화·파일 크기(/api/show)
  load_ms REAL,
  status TEXT NOT NULL, error TEXT, position INTEGER NOT NULL
);
CREATE TABLE eval_trials (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES eval_candidates(id) ON DELETE CASCADE,
  pack_id TEXT NOT NULL, sample_id TEXT NOT NULL, epoch INTEGER NOT NULL,
  outcome TEXT NOT NULL,             -- ok|timeout|oom|provider_error|parse_error|no_answer|max_turns|cancelled
  output_text TEXT, reasoning_text TEXT,
  transcript_json TEXT,              -- 멀티턴/에이전트 메시지·도구 궤적
  final_state_json TEXT,             -- 픽스처 최종 상태 요약
  input_tokens INTEGER, output_tokens INTEGER, thinking_tokens INTEGER,
  ttft_ms REAL, prefill_tps REAL, decode_tps REAL, total_ms REAL,
  cache_hit INTEGER, vram_peak_mb INTEGER, turns INTEGER, tool_calls INTEGER,
  started_at TEXT NOT NULL, finished_at TEXT,
  UNIQUE(candidate_id, pack_id, sample_id, epoch)   -- 재개 시 중복 방지
);
CREATE TABLE eval_scores (
  id TEXT PRIMARY KEY,
  trial_id TEXT NOT NULL REFERENCES eval_trials(id) ON DELETE CASCADE,
  scorer TEXT NOT NULL,              -- 채점기 ID(+인스턴스 키)
  value REAL NOT NULL,               -- 0~1
  verdict TEXT NOT NULL,             -- correct|incorrect|partial|no_answer|error
  reason TEXT, extracted TEXT,
  judge_raw TEXT,                    -- Judge 원문(있으면)
  source TEXT NOT NULL DEFAULT 'auto', -- auto|judge|human
  created_at TEXT NOT NULL
);
CREATE TABLE eval_aggregates (      -- 캐시(원시 데이터로 언제든 재계산 가능)
  run_id TEXT NOT NULL, candidate_id TEXT NOT NULL,
  level TEXT NOT NULL,               -- pack|category|dimension|composite|metric
  key TEXT NOT NULL,                 -- 예: pack:gsm8k-sub, metric:decode_tps
  raw REAL, normalized REAL, ci_low REAL, ci_high REAL, n INTEGER,
  anchors_version TEXT, computed_at TEXT NOT NULL,
  PRIMARY KEY (run_id, candidate_id, level, key)
);
CREATE TABLE arena_votes (
  id TEXT PRIMARY KEY,
  prompt_hash TEXT NOT NULL, workspace_root TEXT,
  a_snapshot_json TEXT NOT NULL, b_snapshot_json TEXT NOT NULL,
  a_label TEXT NOT NULL, b_label TEXT NOT NULL,
  winner TEXT NOT NULL,              -- a|b|tie|both_bad
  created_at TEXT NOT NULL
);
```

- `client.ts` 메모리 폴백과 `0001_init.sql` 동기화 규칙을 기존 P9 작업과 똑같이 따릅니다.
- 원시 출력이 많아질 수 있으므로 설정에 "실행 결과 보존 기간/최대 개수"를 두고, 오래된 Run의 `output_text`/`transcript_json`만 비우는 **압축 정리** 기능을 제공합니다(집계는 유지).

### 8.4 에이전트형 평가의 안전 설계

| 위험 | 대책 |
| --- | --- |
| 에이전트가 실제 프로젝트 파일을 수정 | 샌드박스 도구 세트는 `workspaceRoot`를 **앱 임시 디렉터리의 픽스처 복사본**(`%TEMP%/fortress-eval/{trialId}`)으로 고정합니다. 도구는 이미 `ctx.workspaceRoot` 주입을 지원하고, Rust 측 스코프 검사(canonicalize 포함)가 그대로 적용됩니다 |
| 승인 우회 | 앱 전역 승인 로직은 건드리지 않습니다. 평가 러너가 `beforeToolCall` 훅에서 **경로가 샌드박스 내부이고 도구가 read/ls/grep/find/write/edit일 때만** 자동 승인합니다. 그 밖의 경우는 모두 거부하고 `error`로 기록합니다(사용자 승인 대화상자도 띄우지 않음) |
| `shell` 실행 | 평가 후보의 활성 도구에서 `shell`을 **강제로 제거**합니다. `AGENTS.md` §7의 "shell은 항상 승인" 규칙을 지키려면 무인 자동화와 양립할 수 없기 때문입니다. 코딩 실행형 채점(L4)은 에이전트 도구가 아니라 채점기 내부의 별도 샌드박스로 분리합니다(§8.5) |
| `web_search`/`web_fetch` | 기본으로 제거합니다(결과 비결정성·외부 전송). 팩이 명시적으로 요구할 때만 사용자 동의 후 허용합니다 |
| 픽스처 스킬 신뢰 | 번들 픽스처는 서명된 앱 리소스이므로 자동 신뢰합니다. 사용자 픽스처의 스킬은 기존 워크스페이스 신뢰 확인 절차를 거칩니다 |
| 임시 파일 잔존 | Trial 종료 시 삭제하고, 앱 시작 시 `fortress-eval/` 잔여물을 정리합니다 |
| 개인 팩의 민감 정보 | 저장 전 미리보기와 확인을 거칩니다. `.env`·키 패턴 파일은 제외하고, 내보내기 시 개인 팩 포함 여부를 따로 확인합니다 |

### 8.5 코딩 실행형 채점 (3단계, 선택)

- 1안: **JS/TS 문제 한정**으로 Web Worker에서 실행합니다(네트워크·DOM 없음, 타임아웃 강제). 추가 의존성과 외부 프로세스가 필요 없습니다.
- 2안: 로컬 Python/Node를 감지하면 Rust 커맨드로 **임시 폴더 + 타임아웃 + 네트워크 차단 불가 경고** 조건에서 실행합니다. 실행 전 사용자 동의(팩 단위)를 받습니다.
- MVP에서는 제외합니다. 3단계에서 1안부터 도입하는 것을 제안합니다.

### 8.6 UI 흐름

1. **ActivityBar → 평가 패널**: [새 평가 실행] 버튼, 스위트 목록, 최근 실행 목록(상태 배지·최적 후보 요약), 개인 팩 목록
2. **실행 마법사(EvalTab: run-config)**:
   - Step 1 목적: 프로파일 선택(균형/코딩/한국어 문서/빠른 응답/긴 문서/사용자 정의)
   - Step 2 스위트: 팩 체크리스트 + 단계(Smoke/Std/Full) + epochs + 결정성 모드
   - Step 3 후보: 에이전트 다중 선택 또는 "매트릭스" 탭(기준 에이전트 + 스윕 축)
   - Step 4 확인: Preflight 결과, 예상 시간, VRAM 적합성, 검정력 안내(±x%p), Judge 설정
3. **진행 화면(run)**: 후보×팩 진행 매트릭스, 현재 샘플 입출력 스트리밍 미리보기, 실시간 tok/s·VRAM 미니 차트(모니터링 재사용), 일시정지/취소/후보 건너뛰기
4. **리포트(report)**:
   - 상단: 추천 카드 3종(최적/빠른/고품질) + 사유 문장 + "이 설정으로 에이전트 만들기"
   - 순위표: Composite(±CI), 차원 점수, 커버리지, 제약 위반 배지, "구분 불가" 그룹 음영
   - 차트: 차원 레이더, 품질×속도 파레토 산점도(버블=VRAM), 카테고리 히트맵, 컨텍스트 길이별 정확도·decode 곡선(Q6·P2)
   - 드릴다운: 팩 → 샘플 목록(후보별 ✓/✗) → 샘플 상세(출력 나란히 보기, 채점 사유, 도구 궤적, 사람 채점 입력)
   - 비교: 이전 Run과의 회귀 비교(같은 팩 해시일 때), 내보내기(EEE JSON + samples JSONL, CSV)
5. **채팅 연동**: 말풍선 메뉴 "평가 케이스로 저장", 채팅 탭 "비교 모드(Arena)"

### 8.7 모니터링 기능과의 관계

- 평가 Trial 동안 수집된 모니터링 스냅샷은 기존 테이블에 그대로 쌓이고, `conversation_id`에 trialId를 넣어 연결합니다. 모니터링 패널 필터에 "평가 실행" 그룹을 추가합니다.
- 기존 `Docs/analysis/MonitoringAnalysis_*.md` 같은 수작업 분석 리포트를 평가 리포트가 자동으로 대체·보완합니다.

---

## 9. 정규화 스키마 정의 (데이터 계약)

아래는 `src/lib/eval/types.ts`의 zod 스키마 초안을 TypeScript 형태로 적은 것입니다. 파일 포맷(팩)은 이 스키마를 JSON으로 직렬화한 것입니다.

### 9.1 팩 매니페스트 (`manifest.json`) + 샘플 (`samples.jsonl`)

```ts
interface EvalPackManifest {
  schemaVersion: '1.0';
  id: string;                 // 'fab-tools-select'
  version: string;            // semver. 샘플·채점 변경 시 올림
  title: I18nText;            // { ko, en }
  description: I18nText;
  category: CategoryId;       // 'Q1'...'S1' (§3.1)
  lang: ('ko' | 'en')[];
  license: { id: string; source?: string; attribution?: string };
  kind: 'single_turn' | 'multi_turn' | 'tool_call' | 'agentic' | 'perf_probe';
  systemPrompt?: string;      // 팩 공통(정답 표기 지시 등)
  fewshot?: EvalMessage[];
  tools?: 'fortress-default' | ToolSchema[];   // tool_call/agentic
  scorers: ScorerSpec[];      // 팩 기본 채점기(샘플에서 덮어쓰기 가능)
  metrics: MetricSpec[];      // 이 팩이 산출하는 지표 정의
  tiers: { smoke: number; standard: number; full: number | 'all' };
  stratifyBy?: string;        // 층화 샘플링 키(metadata 필드명, 예: 'subject')
  defaults?: { timeoutSec?: number; maxTurns?: number; epochs?: number; circular?: boolean };
  publishedAt?: string;       // 오염 판단 참고
  contentHash?: string;       // 로더가 계산(manifest + samples 정규화 해시)
}

interface EvalSample {
  id: string;
  input: string | EvalMessage[];      // 문자열이면 user 메시지 1개
  choices?: string[];                 // 객관식
  target?: string | string[] | number;// 정답(복수 허용)
  reference?: string;                 // Judge 참조 답변
  rubric?: string;                    // Judge 루브릭(팩 기본 덮어쓰기)
  expectedToolCalls?: ExpectedToolCall[];   // tool_call_ast
  fixture?: { dir: string; skills?: boolean };   // agentic: 팩 폴더 기준 상대 경로
  expectState?: FsExpectation[];      // fs_state
  trajectory?: { mustCall?: string[]; mustNotCall?: string[]; maxCalls?: number };
  ifeval?: IfEvalInstruction[];       // ifeval 채점기 인자
  perf?: { inputTokens: number; outputTokens: number; depthTokens?: number; repeats?: number };
  scorers?: ScorerSpec[];             // 샘플 전용 채점기(팩 기본 대체)
  clusterId?: string;                 // 군집 부트스트랩
  tags?: string[];                    // 'reliability' → epochs=k 대상
  metadata?: Record<string, string | number | boolean>;  // subject, difficulty 등
}

interface ExpectedToolCall {
  name: string;
  args: Record<string, unknown[]>;    // 파라미터별 허용값 목록(BFCL). [] = 아무 값이나 허용(존재만 요구)
  optionalArgs?: string[];
}

type FsExpectation =
  | { path: string; exists: boolean }
  | { path: string; contains?: string[]; notContains?: string[]; regex?: string; equals?: string }
  | { glob: string; unchanged: true };
```

### 9.2 채점기·지표 스펙

```ts
interface ScorerSpec {
  type: ScorerType;                   // §6.1 ID
  key?: string;                       // 같은 타입을 여러 번 쓸 때 구분
  weight?: number;                    // 기본 1
  gate?: boolean;                     // 실패하면 샘플 점수 0
  threshold?: number;                 // 연속 점수의 합격선(verdict 판정)
  options?: Record<string, unknown>;  // 채점기별 옵션(zod로 타입별 검증)
}

interface MetricSpec {
  id: string;                         // 'accuracy', 'ifeval_prompt_strict', 'decode_tps' ...
  description: I18nText;
  source: 'score' | 'trial_field' | 'derived';   // 채점 결과 / Trial 측정값 / 파생
  field?: string;                     // trial_field일 때 컬럼명
  aggregation: 'mean' | 'median' | 'p95' | 'pass_at_k' | 'pass_hat_k' | 'rate';
  k?: number;
  lowerIsBetter: boolean;             // EEE metric_config 대응
  scoreType: 'binary' | 'continuous' | 'ordinal';
  range: { min: number; max: number };
  normalization:
    | { kind: 'baseline'; baseline: number | 'auto_choices'; ceiling?: number }
    | { kind: 'anchor'; curve: 'log' | 'linear'; zero: number; full: number }
    | { kind: 'identity' };
  countsTowardComposite: boolean;     // 보조 지표(§7.5)는 false
}
```

### 9.3 프로파일

```ts
interface EvalProfile {
  id: string; name: I18nText; builtIn: boolean;
  dimensionWeights: Record<'Q' | 'A' | 'P' | 'R' | 'S', number>;
  categoryWeights?: Partial<Record<CategoryId, number>>;
  anchorsVersion: string;
  anchorOverrides?: Record<string /* metric id */, { zero: number; full: number }>;
  constraints: Array<{ metric: string; op: '>=' | '<='; value: number; label: I18nText }>;
  includeArena?: { enabled: boolean; weight: number };
}
```

### 9.4 결과 레코드 (EEE 대응표)

| Fortress | EEE |
| --- | --- |
| `eval_runs.id` + candidate | `evaluation_id` |
| 앱 이름/버전, `evaluator_relationship='third_party'` | `source_metadata` |
| `snapshot_json.model` + `model_meta_json` | `model_info` |
| `snapshot_json`의 temperature/topP/maxOutputTokens/reasoning | `generation_config` |
| `eval_aggregates(level='pack')` + `MetricSpec` | `evaluation_results[].metric_config`(`lower_is_better`, `score_type`, `min/max_score`) + `score_details` + CI |
| `eval_trials` + `eval_scores` | `{uuid}_samples.jsonl`(`single_turn`/`multi_turn`/`agentic`, `token_usage`, `performance`) |
| `hardware_json` | EEE에 없는 필드 → 확장 필드(`additional_details`류)로 기록(착수 시 스키마 버전 확인) |

### 9.5 가져오기 필드 매핑 프리셋

| 원본 | 매핑 |
| --- | --- |
| Inspect JSONL | `input→input`, `target→target`, `choices→choices`, `id→id`, `metadata→metadata` |
| OpenAI Evals JSONL | `input(messages)→input`, `ideal→target` |
| promptfoo tests(YAML→JSON) | `vars.*→input 템플릿`, `assert[]→scorers[]`(equals→exact, icontains→includes, regex→regex, is-json→json_schema, llm-rubric→llm_judge_rubric, javascript→미지원 경고) |
| HF MCQ(MMLU형) | `question→input`, `choices/options→choices`, `answer(index/letter)→target` |
| CSV | 열 선택 UI(FieldSpec 방식) |

---

## 10. 단계별 로드맵 (Phase 10 제안)

| 작업 ID | 내용 | 소유 파일(요지) | 단계 |
| --- | --- | --- | --- |
| P10-01 | 평가 타입/zod 스키마 + 팩 로더(3계층·해시·층화 샘플링) | `src/lib/eval/types.ts`, `packLoader.ts` | MVP |
| P10-02 | DB 마이그레이션 + `evalRepo` + 메모리 폴백 | `migrations/*`, `evalRepo.ts`, `client.ts`(eval 테이블 부분) | MVP |
| P10-03 | 결정적 채점기(exact/includes/regex/choice/numeric/json_schema/tool_call_ast/no_tool_call/viz_block) + 테스트 | `src/lib/eval/scorers/*` | MVP |
| P10-04 | IFEval 체커 TS 포팅(영문 핵심 + 한국어 변형) | `scorers/ifeval/*` | MVP |
| P10-05 | 러너 + solvers(single/multi/tool_call/perf_probe) + 체크포인트·재개 + chatQueue 연동 + 모니터링 태깅 | `runner.ts`, `solvers.ts`, `candidates.ts`, `preflight.ts` | MVP |
| P10-06 | 집계·정규화·통계(부트스트랩·Wilson·pass^k) + 프로파일 5종 + 추천 | `aggregate.ts`, `normalize.ts`, `stats.ts`, `recommend.ts` | MVP |
| P10-07 | UI: 사이드 패널·실행 마법사·진행 화면·리포트(순위표·레이더·파레토·드릴다운) + ko/en 문구 | `src/components/eval/*`, `EvalTab.tsx`, `EvalContext.tsx`, 탭/패널 타입 | MVP |
| P10-08 | Built-in 팩 v1: `fab-tools-select`, `fab-tools-relevance`, `fab-viz`, `fab-perf-probe`, `gsm8k-sub`, `mmlu-pro-sub`, `ifeval-sub` | `src/assets/evals/*` | MVP |
| P10-09 | 샌드박스 픽스처(Rust 커맨드) + agentic solver + fs_state/trajectory 채점 + `fab-fs-tasks` | `eval_commands.rs`, `sandbox.ts`, 관련 채점기 | 2단계 |
| P10-10 | 긴 컨텍스트 합성 팩(`fab-longctx`) + 실효 컨텍스트 산출 + 깊이별 속도 곡선 | 팩 생성기, 리포트 차트 | 2단계 |
| P10-11 | LLM Judge 패스 + `fab-ko-writing` + Judge 신뢰도 점검 | `judge.ts`, `llmJudge.ts` | 2단계 |
| P10-12 | 개인 평가셋(채팅에서 저장·일괄 초안·픽스처 캡처) + 팩 편집기 | `EvalPackEditor.tsx`, `MessageBubble` 메뉴 연결 | 2단계 |
| P10-13 | 가져오기(JSONL/CSV/HF 프리셋) + EEE 내보내기 | `importers/*`, `exportEee.ts` | 2단계 |
| P10-14 | 로컬 Arena(블라인드 A/B) + Bradley-Terry | `ArenaCompare.tsx`, `stats.ts`(BT) | 3단계 |
| P10-15 | `fab-compaction`, `fab-skill`, 회귀 비교, 결과 보존 정책 | — | 3단계 |
| P10-16 | 코딩 실행형 채점(Web Worker JS 우선) + `humaneval-plus-sub` | `scorers/codeExec*` | 3단계 |
| P10-17 | (선택) logprobs 기반 MCQ·양자화 KLD — Provider 지원 확인 후 | — | 보류 |

**MVP 완료 기준**: 에이전트 3개를 골라 Standard 스위트(FAB 도구 2종 + viz + perf + GSM8K + MMLU-Pro + IFEval)를 실행하면 → 중단·재개가 되고 → 리포트에 Composite(±CI)·레이더·파레토·추천 3종이 나오며 → 샘플 드릴다운에서 채점 사유를 확인할 수 있다. `pnpm lint`/`typecheck`/`test`를 통과하고 `pnpm tauri dev`로 실제 동작을 확인한다.

---

## 11. 위험 요소와 대응

| 위험 | 영향 | 대응 |
| --- | --- | --- |
| 실행 시간이 너무 김 | 사용자 이탈 | Smoke 단계, 시간 추정, 재개, 후보 수 상한, 야간 실행 안내 |
| 소형 로컬 Judge의 낮은 신뢰도 | 주관 점수 왜곡 | 결정적 채점 우선, Judge 점수는 별도 표시, 사람 채점과의 일치도 점검, 참조 기반 채점 |
| 공개셋 오염 | 과대평가 | 변형 문제, 개인 팩, 팩 공개일 표시 |
| Provider별 측정 필드 편차(OpenAI 호환은 prefill/decode 분리 시간이 없음) | 성능 지표 결측 | 클라이언트 측 타임스탬프로 TTFT·decode를 근사하고 "근사값" 표시. 결측 지표는 N/A 재정규화 |
| 프롬프트 캐시·백그라운드 부하로 인한 측정 노이즈 | 성능 비교 왜곡 | 워밍업, 반복 r회, 캐시 적중 분리, 실행 중 GPU 사용률 이상치 표시 |
| 앵커·가중치의 자의성 | 점수 신뢰 저하 | 원시값 항상 병기, 앵커 버전 관리·편집 가능, 프로파일별 근거 문구 |
| 에이전트 평가 중 파일 손상 | 데이터 손실 | 임시 복사본 전용 루트, 샌드박스 밖 경로 자동 거부, shell 제거 |
| 결과 DB 비대화 | 성능 저하 | 보존 정책, 원문 정리(집계 유지) |
| 데이터셋 라이선스 위반 | 법적 위험 | 번들 목록 라이선스 재확인(착수 조건), 제한 데이터는 임포터만 제공 |

---

## 12. 결정이 필요한 사항 (승인 요청)

1. **MVP 범위**: §10의 P10-01~08을 MVP로 할지(에이전트 픽스처 과제 A3는 2단계로 미룸). 대안: A3를 MVP로 당기고 IFEval을 2단계로 미룸.
2. **결과 저장 위치**: 전역 DB(제안) vs 프로젝트 DB.
3. **외부 API Judge 허용 여부**: 옵트인 허용(제안) vs 로컬 Judge만.
4. **Built-in 공개셋 부분집합의 번들**: 번들(제안, 오프라인 동작) vs 전부 다운로드 방식(앱 크기 최소화).
5. **평가 중 채팅**: 차단(제안) vs 허용하되 오염 표시.
6. **기본 프로파일 가중치·앵커 값**(§7.3·§7.6): 제안값 그대로 시작하고 실측 후 조정할지.

승인되면 `Docs/Architecture.md`(§2 트리, §3.1~3.3 패널/탭, §4 데이터 모델, §4.5 저장소)와 `Docs/ImplementationPlan.md`를 갱신하고, `Docs/phases/Phase10-Evaluation.md`를 작성하겠습니다.
