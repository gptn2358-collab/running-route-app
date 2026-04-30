@echo off
echo ====================================
echo  달리기 경로 앱 - 초기 설정
echo ====================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [오류] Node.js가 설치되어 있지 않습니다.
    echo https://nodejs.org 에서 LTS 버전을 설치해주세요.
    pause
    exit /b 1
)

echo [1/2] 패키지 설치 중...
npm install

echo.
echo [2/2] Expo CLI 확인...
where expo >nul 2>&1
if %errorlevel% neq 0 (
    npm install -g expo-cli
)

echo.
echo ====================================
echo  설치 완료! 아래 명령어로 실행:
echo  npm start
echo ====================================
pause
