# Project History — 세션 핸드오프 문서

이 문서는 이전 Claude 세션에서 이 프로젝트를 만들며 논의/작업한 전체 맥락을 요약한 것입니다.
새 계정/새 세션에서 이어받을 때 이 문서를 먼저 읽어주세요.

## 무엇을 만들었나

Figma Make로 만든 "3D Rotating Globe Design"을 실제로 동작하는 웹 프로토타입으로 구현하고,
A/B 테스트용으로 공유 가능한 링크로 배포한 것.

- **라이브 링크**: https://globe-ab-proto-protopie.surge.sh
- **소스코드**: https://github.com/soh22222/GlobalCommunication
- **원본 Figma**: https://www.figma.com/design/0nTb0ybCq60TQSK1CfNe75/idea (파일키 `0nTb0ybCq60TQSK1CfNe75`)

## 기술 스택 (왜 이렇게 골랐는지)

- **React + TypeScript + d3-geo(orthographic projection) + Canvas 2D**, 번들러는 **esbuild** 단독 사용.
- Vite/webpack 안 쓴 이유: 이 로컬 환경의 보안 게이트(SCFW)가 `npm install` 중 "최근 발행된 패키지"나
  "CVE가 있는 패키지"를 자동으로 차단함. Vite는 browserslist 등 자주 업데이트되는 트랜지티브 의존성이
  많아서 계속 막혔음. 실제 앱이 필요로 하는 패키지(d3, topojson-client, world-atlas, lucide-react,
  react/react-dom)만 최소로 골라서 esbuild로 직접 번들링하면 이 문제를 피할 수 있었음.
- Tailwind는 빌드 없이 **CDN `<script>` 태그**로 로드 (JIT). 프로덕션 앱이 아니라 프로토타입이라 이걸로 충분.
- 배포는 **surge.sh** — 계정 생성이 이메일/비번만으로 즉석에서 되고, `npx surge <폴더> <도메인>` 한 줄로 배포됨.
  Vercel/Netlify보다 훨씬 가볍고 로그인 절차가 간단해서 선택.

## 로컬 개발 환경 관련 주의사항

- `node_modules`가 한 번 `/tmp` 하위 폴더로 심링크되어 있었는데, `/tmp`가 시스템에 의해 주기적으로
  청소되면서 빌드가 깨진 적 있음 → 지금은 프로젝트 폴더 안에 직접 `npm install` 해뒀으니 안전함.
- 빌드: `npm install` → `node build.mjs` (또는 `npm run build`) → `dist/bundle.js` 생성.
  `dist/index.html`은 손으로 쓴 파일이라 git에 포함됨 (`.gitignore`가 `dist/bundle.js`만 제외).
- 로컬 미리보기: `npm run serve` (python http.server, 8934 포트).
- 배포: `cd dist && npx surge . globe-ab-proto-protopie.surge.sh`

## 지금까지의 주요 기능/변경 이력 (시간순)

1. **초기 이식**: Figma Make export(zip)를 esbuild 기반 프로젝트로 재구성, surge.sh에 첫 배포.
2. **마커 호버 카드**: 지구본 위 도시 마커에 호버하면 담당자 카드(이름/부서/시간/근무시간) 표시.
   Figma 디자인(node 799:24150 → 이후 799:93862로 "Send DM" 버튼 있는 버전으로 교체) 그대로 구현.
3. **100개 도시로 확장**: 기존 8개 → 전세계 100개 도시, 도시당 1~21명의 팀원(시드 기반 결정론적 생성,
   `mulberry32` PRNG). Tokyo=8명, Vancouver=21명 등 하드코딩된 예시 포함.
4. **마커 크기/색상 반복 조정**: 여러 차례 "몇 % 줄여줘/키워줘", "이 색 두 개로 바꿔줘" 요청에 따라
   최종적으로 `#FFF4A1`(활성) / `#373E4E`(비활성) 두 색으로 정착.
5. **활성/비활성 로직**: 한국(KST) 09:15 기준, 로컬 시간이 09:00~18:00이면 활성. 15% 확률로 "휴가 중"
   처리되어 근무시간이어도 비활성일 수 있음.
6. **호버 UX 개선**: 마커 호버 시 지구본 회전 정지, "Send DM" 버튼 클릭 가능하도록 카드에
   `pointer-events: auto` 적용, 카드 바깥 클릭 시에만 닫히도록 변경 (이전엔 마우스 떼면 바로 닫혀서
   버튼을 못 눌렀음).
7. **드래그 방향 버그 수정**: 원래 마우스 드래그 방향과 지구본이 반대로 움직이던 버그를 d3 rotate 부호
   수정으로 해결 (`dλ = dx·k`, `dφ = -dy·k`).
8. **낮/밤 그라디언트**: 처음엔 "활성-비활성 국가 연결선"으로 시도했다가 사용자가 원한 건 그게 아니라
   **본초자오선 같은 낮/밤 경계선**이라고 해서 재구현. 태양이 남중하는 경도(subsolar longitude)를
   계산해서 그 반대편을 어둡게 블러 처리.
9. **"야근 중" 컨셉**: 처음엔 비활성 도시 중 12% 확률로 랜덤하게 야근자가 생기는 방식이었다가,
   최종적으로 **"파리의 Marcus 한 명"으로 고정**, 실제 파리 서머타임(UTC+2) 기준 정확한 시차(-7h, 02:15)
   반영. (이후 "야근 중" 한글 뱃지는 삭제 요청받아 제거, Marcus는 "Mika"로 개명)
10. **인터페이스 전체 교체**: Figma의 "홈화면(한국인 뷰)" 프레임(node 813:26274)에 맞춰 헤더(노란 로고,
    컬러 아바타 스택, 벨 아이콘), 사이드바(16명 팀원 로스터) 전면 교체.
11. **Work Chat 화면 신규 구현**: Figma의 다른 프레임(node 806:94270, "소통창 진입")을 찾아서 채널
    사이드바/메시지 스레드/입력창/Decisions&Actions 패널까지 구현. 왼쪽 nav의 "Work Chat" 클릭 시
    지구본 화면과 전환되는 인터랙션 연결 (view state로 GlobeView ↔ WorkChat 스위칭, 다른 화면 가면
    지구본 애니메이션 루프도 정리됨).
12. **헤더 높이 버그 수정**: 헤더가 80px로 돼 있었는데 실제 Figma 스펙은 112px라서 위쪽 시간 라벨이
    잘려 보이던 문제 발견 후 수정, 사이드바들의 top offset도 96→128로 같이 조정.
13. **회전 속도 조정**: 여러 차례 "몇 % 빠르게/되돌려줘" 요청 끝에 최종 **0.0405°/프레임** (최초값
    0.025의 약 1.62배)로 정착.
14. **GitHub 이전**: 원래 `hiri22` 계정 SSH 키만 있던 환경이라 `soh22222` 소유 레포에 push 권한이
    없었음 → `soh22222` 전용 새 SSH 키(`~/.ssh/id_ed25519_soh22222`) 생성해서 그 계정으로 등록 후
    push 완료. 커밋 작성자도 `soh22222`로 정리. `hiri22` 키는 요청에 따라 삭제하지 않고 보존.

## 접근하지 못한 것 (미해결)

- Figma 파일 `yhtMortoxcnoFoSTwxr1pp` (Thinking-Process_WIP)는 **Dev Mode 접근 권한 문제로 계속
  접근 실패**. 사용자가 이 파일에서 팝업 디자인 및 "최종 프로토타입" 화면을 참조하려 했으나 열람 불가.
  이 파일 권한을 확인하고 다시 시도하거나, 스크린샷으로 대체 전달 필요.
- Work Chat 화면 메시지 입력/전송은 정적 UI만 구현, 실제 타이핑→전송 동작은 없음.

## 다음에 이어서 할 수 있는 것

- 위 Figma 파일 접근 문제 해결 후 "최종 홈화면" 디자인 반영
- Work Chat 입력창 실제 동작(로컬 state로 메시지 추가) 구현
- 콘텐츠 관리를 Notion 같은 CMS로 옮기는 것도 이전에 논의했었음 (포트폴리오 사이트 별개 프로젝트 맥락)
