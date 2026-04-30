# 달리기 경로 앱 🏃

GPS 기반 실시간 위치를 사용해, 목표 거리를 입력하면 **신호등을 최소화한 순환 경로**를 자동으로 탐색하는 모바일 앱입니다.

## 작동 원리

1. 현재 GPS 위치를 기준으로 원형 경로 후보를 6개 생성합니다
2. OSRM (OpenStreetMap 기반 라우팅)으로 실제 도로에 맞는 경로를 계산합니다
3. Overpass API로 각 경로 주변 25m 이내의 신호등 수를 조회합니다
4. 신호등이 가장 적은 경로를 첫 번째로 추천합니다

## 시작하기

### 1. Node.js 설치

https://nodejs.org/ko/ 에서 **LTS 버전** 설치

### 2. 패키지 설치

```bash
cd running-route-app
npm install
```

### 3. 앱 실행

```bash
npm start
```

QR 코드가 표시되면, 스마트폰에 **Expo Go** 앱을 설치하고 스캔하세요.

- Android: Google Play에서 "Expo Go" 검색
- iOS: App Store에서 "Expo Go" 검색

### Android 지도 API 키 (선택)

개발 중 Expo Go에서는 API 키 없이도 동작합니다.  
프로덕션 빌드 시 `app.json`의 `googleMaps.apiKey`에 키를 넣어주세요.

## 화면 구성

| 화면 | 설명 |
|------|------|
| 홈 | 현재 위치 지도 + 거리 선택 |
| 경로 미리보기 | 생성된 경로 비교 (신호등 위치 표시) |
| 달리기 | 실시간 GPS 트래킹, 진행률 표시 |
| 요약 | 거리·시간·페이스·칼로리 결과 |

## 기술 스택

- **Expo (React Native)** - 크로스플랫폼 모바일
- **expo-location** - GPS 트래킹
- **react-native-maps** - 지도
- **OSRM** - 도보 경로 계산 (API 키 불필요)
- **Overpass API** - OpenStreetMap 신호등 데이터 (API 키 불필요)
