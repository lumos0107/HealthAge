현재 상태는 이렇게 보면 돼:

frontend-upload 브랜치 → GitHub 업로드 완료
PR #1 생성 완료
팀원들이 리뷰 가능
아직 main에 합쳐진 것은 아님


팀원한테는 이렇게 말하면 돼:

프론트엔드는 PR #1로 올려뒀습니다.
frontend 폴더 안에 React + Vite 프로젝트가 들어있고,
실행은 cd frontend → npm install → npm run dev 순서로 하면 됩니다.
환경변수는 frontend/.env.example 참고하면 됩니다.


그리고 만약 팀원이 “이걸 어떻게 실행해?”라고 물어보면:

git clone https://github.com/hahaha13791/health-service-back.git

cd health-service-back

git checkout frontend-upload

cd frontend

npm install

npm run dev




프론트 PR 올렸습니다.
PR: https://github.com/hahaha13791/health-service-back/pull/1

실행 방법:
cd frontend

npm install

npm run dev


환경변수:
frontend/.env.example 복사해서 frontend/.env 만들고

VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_BACKEND_URL 입력하면 됩니다.

빌드는 npm run build로 확인했고 정상 통과했습니다.
