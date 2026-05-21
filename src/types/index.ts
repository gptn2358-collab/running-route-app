export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface RouteCandidate {
  id: string;
  waypoints: Coordinate[];
  polyline: Coordinate[];
  distance: number;   // meters
  duration: number;   // seconds (walking estimate, running will be faster)
  trafficSignals: number;
  trafficSignalLocations: Coordinate[];
}

export interface RunSegment {
  km: number;                  // which km (1 = first km complete)
  cumulativeDistanceM: number;
  cumulativeDurationS: number;
  paceSecPerKm: number;        // seconds per km for this segment
}

export interface RunStats {
  id: string;             // unique run identifier (used for ranking dedup)
  distance: number;       // meters covered
  duration: number;       // seconds elapsed
  trail: Coordinate[];    // actual GPS path taken
  routePolyline: Coordinate[]; // planned route polyline
  segments: RunSegment[]; // per-km pace breakdown
}

export interface UserProfile {
  id: string;
  nickname: string;
  optedInRanking: boolean;
}

export interface RunRecord {
  runId: string;
  userId: string;
  nickname: string;
  month: string;          // 'YYYY-MM'
  distanceM: number;
  durationS: number;      // seconds
  isOffRun: boolean;
  offRunCount: number;    // 이 런닝에서 공식 오프구간을 통과한 횟수
  submittedAt: string;    // ISO
}

export interface RankingEntry {
  rank: number;
  nickname: string;
  valueKm: number;     // 롱러너: 총 km
  valueCount: number;  // 오프러너: 오프구간 통과 런 횟수
  isCurrentUser: boolean;
}

export interface MonthlyRanking {
  month: string;
  longRunner: RankingEntry[];
  offRunner:  RankingEntry[];
  myLongRank: { rank: number; valueKm: number } | null;
  myOffRank:  { rank: number; valueCount: number } | null;
}

export type IssueType = 'road' | 'safety' | 'traffic' | 'lighting' | 'other';

export interface RouteIssue {
  coord: Coordinate;
  type: IssueType;
  note?: string;
}

export interface RouteReview {
  id: string;
  date: string; // ISO string
  routePolyline: Coordinate[];
  trail: Coordinate[];
  rating: number; // 1–5
  hasIssues: boolean;
  issues: RouteIssue[];
}

// ── 오프구간 시스템 ──────────────────────────────────────────────

export interface OffZoneReport {
  id: string;
  userId: string;
  coord: Coordinate;
  categories: IssueType[];
  runId: string;
  timestamp: string; // ISO
}

// 100m 반경 내 2건 이상 신고 시 생성되는 오프구간
export interface OffZone {
  id: string;
  center: Coordinate;
  reportCount: number;
  categories: IssueType[];
}
