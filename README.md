# PWS 포털 — 내부 관리 사이트

선수·스탭·트레이너·관리자용 내부 사이트입니다. 한국어 / English / 日本語 지원.

| 기능 | 관리자 | 트레이너 | 선수·스탭 |
|---|:-:|:-:|:-:|
| 일정 보기·공유(링크, 구글 캘린더, .ics) · 일반 일정 등록 | ✅ | ✅ | ✅ |
| 내 구글·아이폰 캘린더에 PWS 일정 자동 연결(구독) | ✅ | ✅ | ✅ |
| 투표 만들기·투표하기 | ✅ | ✅ | ✅ |
| 공유 구글 드라이브에 파일 올리기 | ✅ | ✅ | ✅ |
| 훈련·경기 당일 출석 체크 (참여 / 지각) | ✅ | ✅ | ✅ |
| 훈련·경기 일정 등록 + 참가 투표 자동 생성 | ✅ | ✅ | – |
| 출석 수정, 근태 집계(CSV) | ✅ | ✅ | – |
| 훈련 기록 작성, 훈련 항목(체력·낙법 등) 만들기 | ✅ | ✅ | – |
| **남이 올린 글 수정·삭제** | ✅ (전부) | 본인 것만 | 본인 것만 |
| 회원 가입 승인·권한 변경·이름 수정 | ✅ | – | – |
| 해외선수 일정·비용(숙소·항공·개런티) | ✅ | – | – |

권한은 화면에서 숨기는 것뿐만 아니라 **데이터베이스 자체에서 막혀 있어서** 주소를 직접 쳐도 볼 수 없습니다.

### 규칙 요약
- **가입 → 이름 등록(본명 또는 링네임) → 관리자 승인** 순서. 승인 전에는 아무것도 볼 수 없습니다.
- 승인된 뒤에는 본인이 이름을 바꿀 수 없고 관리자만 바꿀 수 있습니다 (닉네임 사용 방지).
- 출석은 **한국 시간 기준 당일에만** 본인이 체크할 수 있고, 한 번 체크하면 수정은 트레이너만 가능합니다.
- 체크하지 않은 사람은 **다음 날부터 자동으로 불참**으로 집계됩니다.
- 근태 집계에서 빼고 싶은 사람(예: 트레이너)은 회원 관리 → "근태 집계" 체크를 해제하세요.

---

## 설치 가이드 (약 30분, 모두 무료)

사용하는 서비스 3개:
- **Supabase** — 로그인 + 데이터베이스 (무료 플랜으로 충분)
- **Google Cloud** — 구글 로그인 + 드라이브 업로드 창
- **Vercel** — 사이트 호스팅 (무료)

### 1단계. Supabase 프로젝트 만들기
1. https://supabase.com 가입 → **New project** (Region: Northeast Asia (Seoul)).
2. `supabase/schema.sql` 파일을 열어 **`YOUR_EMAIL@gmail.com`을 본인 구글 이메일로 바꿉니다.**
   이 이메일로 가입하면 자동으로 관리자가 됩니다.
3. 대시보드 왼쪽 **SQL Editor** → 파일 내용 전체 붙여넣기 → **Run**.
   이어서 `supabase/03_events.sql`도 같은 방법으로 실행합니다 (일정 종류·반복 일정·캘린더 구독. 02 내용 포함). 그다음 `04_locations.sql`, `05_types.sql`을 차례로 실행합니다 (기본 장소 목록, 일정 종류·경기 구분 관리). 이어서 `06_weekly_training.sql` (주간 훈련·주간 투표), `07_roles.sql` (직급·권한, 일정 공개 범위, 관리자 드라이브), `08_foreign_costs.sql` (해외선수 권한 분리), `09_roster_auto_training.sql` (해외선수 명단, 주말 훈련 자동 등록). 파일마다 새 탭에서 하나씩 실행하세요.
4. **Project Settings → API** 에서 `Project URL`과 `anon public` 키를 메모해 둡니다.

> 이메일을 안 바꾸고 실행했다면: 먼저 가입한 뒤 SQL Editor에서
> `update public.profiles set role='admin', status='approved' where email='본인@gmail.com';` 실행.

### 2단계. 구글 로그인 연결
1. https://console.cloud.google.com → 새 프로젝트 만들기 (예: `pws-portal`).
2. **API 및 서비스 → OAuth 동의 화면**: 외부(External) 선택, 앱 이름 `PWS Portal`, 지원 이메일 입력.
   - **데이터 액세스(범위)** 에 `.../auth/drive.file` 추가 (드라이브 업로드용).
   - 작성 후 **게시 상태를 "프로덕션"으로 변경** (안 하면 테스트 사용자로 등록한 사람만 로그인됩니다).
     `drive.file`은 "이 사이트로 올린 파일만 접근"하는 비민감 권한이라 별도 심사가 필요 없습니다.
3. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID** → 유형 "웹 애플리케이션"
   - 승인된 JavaScript 원본: `http://localhost:5173` (나중에 Vercel 주소도 추가)
   - 승인된 리디렉션 URI: `https://<Supabase 프로젝트ID>.supabase.co/auth/v1/callback`
   - 만들어진 **클라이언트 ID / 보안 비밀**을 메모.
4. Supabase → **Authentication → Sign In / Providers → Google** 켜고 클라이언트 ID·보안 비밀 입력 → 저장.

### 3단계. 구글 드라이브 업로드 연결
1. Google Cloud → **API 및 서비스 → 라이브러리**에서 **Google Drive API**, **Google Picker API** 둘 다 "사용".
2. **사용자 인증 정보 → API 키 만들기** → 키 제한: 애플리케이션 = HTTP 리퍼러(사이트 주소), API = Picker API, Drive API.
3. Google Cloud 대시보드의 **프로젝트 번호**(숫자)를 메모 → `VITE_GOOGLE_APP_ID`.
4. 구글 드라이브에서 PWS 공유 폴더(또는 공유 드라이브 안의 폴더)를 열고 주소의 마지막 부분을 복사
   `https://drive.google.com/drive/folders/`**`1AbCdEf...`** → `VITE_DRIVE_FOLDER_ID`.
5. **회원들이 그 폴더에 "편집자" 권한을 갖고 있어야** 업로드됩니다 (공유 드라이브 멤버로 추가하거나 폴더 공유).

업로드 버튼을 누르면 구글 공식 업로드 창이 뜨고, 파일이 그 폴더로 바로 올라간 뒤 사이트에 목록이 남습니다.
드라이브에 이미 있는 파일을 골라서 목록에 등록할 수도 있습니다.

### 4단계. Vercel에 올리기
1. 이 폴더를 GitHub 저장소에 올립니다 (`.env`는 올리지 마세요 — `.gitignore`에 이미 들어 있음).
2. https://vercel.com → **Add New → Project** → 저장소 선택 (Framework: Vite 자동 인식).
3. **Environment Variables**에 `.env.example`의 6개 값을 모두 입력 → **Deploy**.
4. 배포된 주소(예: `https://pws-portal.vercel.app`)를
   - Supabase → **Authentication → URL Configuration**: Site URL, Redirect URLs에 추가
   - Google Cloud → OAuth 클라이언트 → 승인된 JavaScript 원본에 추가
5. 사이트 접속 → 본인 구글 계정으로 로그인 → 이름 등록 → 바로 관리자로 사용 시작.

### 5단계. 팀원 초대
사이트 주소를 공유하면 각자 가입 → 이름 등록 → **회원 관리** 탭에서 권한(트레이너/선수/스탭)을 골라 승인하면 끝.

---

## 직급과 권한
- **관리자 설정 → 직급·권한**에서 직급을 만들고 권한을 체크합니다. 관리자 직급은 항상 모든 권한을 가지며 삭제할 수 없습니다.
- 일정 등록 시 **공개 범위**에서 볼 수 있는 직급을 고를 수 있습니다. 등록자와 "남이 올린 글 수정" 권한이 있는 직급은 항상 볼 수 있습니다.
- **관리자 드라이브**: Vercel 환경변수 `VITE_ADMIN_DRIVE_FOLDER_ID`에 폴더 ID를 넣고 다시 배포합니다.
  사이트는 목록과 업로드 버튼만 가립니다. **구글 드라이브에서 그 폴더를 관리자에게만 공유**해야 실제로 관리자만 볼 수 있습니다.

## 운영 팁
- **회원 완전 삭제**: 회원 관리에서 삭제 후, Supabase → Authentication → Users에서도 해당 계정을 지우면 재가입부터 다시 해야 합니다. "정지"만 하면 로그인은 되지만 아무것도 볼 수 없습니다.
- **기본 장소 목록**: 관리자가 일정 등록 화면에서 직접 추가·삭제 (`supabase/04_locations.sql` 실행 필요).
- **일정 종류·경기 구분**: 관리자가 일정 등록 화면에서 직접 추가·수정 (`supabase/05_types.sql` 실행 필요).
- **문구 수정**: `src/lib/messages.js` 한 파일에 3개 언어 문구가 모두 있습니다.
- **기존 데이터 백업**: Supabase → Database → Backups (무료 플랜은 매일 자동 백업 7일 보관).

## 로컬에서 실행 (개발용)
```bash
cp .env.example .env   # 값 채우기
npm install
npm run dev            # http://localhost:5173
```

## 폴더 구조
```
supabase/schema.sql      데이터베이스·권한 규칙 (한 번 실행)
src/lib/messages.js      번역 문구 (ko / en / ja)
src/pages/               화면: 홈, 일정, 일정 상세, 투표, 훈련 기록, 근태, 드라이브, 해외선수, 회원 관리, 내 정보
src/components/          공통 부품: 일정 폼, 투표 카드, 출석 버튼, 훈련 기록, 드라이브 업로드
```
