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

export interface RunStats {
  distance: number;       // meters covered
  duration: number;       // seconds elapsed
  trail: Coordinate[];    // actual GPS path taken
  routePolyline: Coordinate[]; // planned route polyline
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
