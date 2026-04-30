import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Coordinate } from '../types';

export interface SignalInfo {
  latitude: number;
  longitude: number;
  phase: 'green' | 'red' | 'uncertain' | null;
  isNearest: boolean;
  predicted?: boolean; // true = V2X 없이 시간 기반 예측값
}

export interface LeafletMapHandle {
  updateRunner(pos: Coordinate, trail: Coordinate[]): void;
  updateSignals(signals: SignalInfo[]): void;
  setRoute(polyline: Coordinate[]): void;
  resetSignals(signals: SignalInfo[]): void;
  showBathroom(dest: Coordinate, route: Coordinate[]): void;
  clearBathroom(): void;
}

interface Props {
  start: Coordinate;
  routePolyline: Coordinate[];
  initialSignals: SignalInfo[];
}

const LeafletMap = forwardRef<LeafletMapHandle, Props>(
  ({ start, routePolyline, initialSignals }, ref) => {
    const webRef = useRef<WebView>(null);
    const readyRef = useRef(false);
    const pendingSignalsRef = useRef<SignalInfo[] | null>(null);
    const pendingRunnerRef = useRef<{ pos: Coordinate; trail: Coordinate[] } | null>(null);

    const inject = (code: string) => {
      webRef.current?.injectJavaScript(code + ';true;');
    };

    const flushPending = () => {
      if (readyRef.current) return;
      readyRef.current = true;
      if (pendingRunnerRef.current) {
        const { pos, trail } = pendingRunnerRef.current;
        inject(`updateRunner(${pos.latitude},${pos.longitude},${JSON.stringify(
          trail.map((c) => [c.latitude, c.longitude])
        )})`);
        pendingRunnerRef.current = null;
      }
      if (pendingSignalsRef.current) {
        inject(`updateSignals(${JSON.stringify(pendingSignalsRef.current)})`);
        pendingSignalsRef.current = null;
      }
    };

    const handleMessage = (e: { nativeEvent: { data: string } }) => {
      if (e.nativeEvent.data === 'MAP_READY') flushPending();
    };

    const handleLoad = () => {
      setTimeout(() => { if (!readyRef.current) flushPending(); }, 3000);
    };

    useImperativeHandle(ref, () => ({
      updateRunner(pos, trail) {
        const code = `updateRunner(${pos.latitude},${pos.longitude},${JSON.stringify(
          trail.map((c) => [c.latitude, c.longitude])
        )})`;
        if (!readyRef.current) { pendingRunnerRef.current = { pos, trail }; return; }
        inject(code);
      },
      updateSignals(sigs) {
        if (!readyRef.current) { pendingSignalsRef.current = sigs; return; }
        inject(`updateSignals(${JSON.stringify(sigs)})`);
      },
      setRoute(polyline) {
        inject(`setRoute(${JSON.stringify(polyline.map((c) => [c.latitude, c.longitude]))})`);
      },
      resetSignals(sigs) {
        inject(`resetSignals(${JSON.stringify(sigs)})`);
      },
      showBathroom(dest, route) {
        const routeJson = JSON.stringify(route.map((c) => [c.latitude, c.longitude]));
        inject(`showBathroom(${dest.latitude},${dest.longitude},${routeJson})`);
      },
      clearBathroom() {
        inject(`clearBathroom()`);
      },
    }));

    return (
      <WebView
        ref={webRef}
        style={styles.map}
        source={{ html: buildHtml(start, routePolyline, initialSignals) }}
        scrollEnabled={false}
        javaScriptEnabled
        originWhitelist={['*']}
        onLoad={handleLoad}
        onMessage={handleMessage}
      />
    );
  }
);

function phaseColor(phase: string | null): string {
  if (phase === 'green') return '#00C853';
  if (phase === 'red') return '#FF453A';
  if (phase === 'uncertain') return '#FFD60A';
  return '#BDBDBD';
}

function buildHtml(start: Coordinate, route: Coordinate[], signals: SignalInfo[]): string {
  const routeJson = JSON.stringify(route.map((c) => [c.latitude, c.longitude]));
  const sigsJson = JSON.stringify(signals);

  return `<!DOCTYPE html><html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5,user-scalable=yes">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100%;background:#f8f8f8}
.runner{width:26px;height:26px;border-radius:50%;background:rgba(41,121,255,.28);display:flex;align-items:center;justify-content:center}
.runner-c{width:13px;height:13px;border-radius:50%;background:#2979FF;margin:6.5px auto 0}
.wc-pin{width:34px;height:34px;border-radius:50%;background:#FF9500;border:2.5px solid white;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 6px rgba(0,0,0,0.3)}
</style>
</head>
<body><div id="map"></div>
<script>
window.addEventListener('load', function() {
  var map = L.map('map', {zoomControl:false, attributionControl:false})
    .setView([${start.latitude},${start.longitude}], 17);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
    subdomains:'abcd', maxZoom:19, keepBuffer:4
  }).addTo(map);

  // ── 경로 표시: 지나온 구간(매우 옅게) + 남은 구간(선명하게) ─────
  var origRoute = ${routeJson};
  var progressIdx = 0;

  // 지나온 구간 — 거의 보이지 않는 흔적
  var coveredLine = L.polyline([], {
    color: 'rgba(41,121,255,0.12)', weight: 6, lineCap: 'round'
  }).addTo(map);
  // 앞으로 달릴 구간 — 선명한 파란색
  var remainingLine = L.polyline(origRoute, {
    color: 'rgba(41,121,255,0.85)', weight: 7, lineCap: 'round'
  }).addTo(map);
  // GPS 실제 궤적 — 초록색으로 구분
  var trailLine = L.polyline([], {
    color: '#00C853', weight: 4, opacity: 0.8, lineCap: 'round'
  }).addTo(map);

  // ── 신호등 마커 ──────────────────────────────────────────────────
  function sigColor(phase) {
    return phase==='green'?'#00C853':phase==='red'?'#FF453A':phase==='uncertain'?'#FFD60A':null;
  }
  function sigRadius(phase, isNearest) {
    return isNearest ? 11 : (phase ? 8 : 4);
  }
  function sigStyle(phase, isNearest, predicted) {
    var color = sigColor(phase);
    var hasPhase = color !== null;
    return {
      radius: sigRadius(phase, isNearest),
      fillColor: hasPhase ? color : '#cccccc',
      color: predicted ? 'rgba(0,0,0,0.25)' : (hasPhase ? 'white' : '#aaaaaa'),
      weight: predicted ? 1.5 : (hasPhase ? 2 : 1),
      fillOpacity: predicted ? 0.55 : (hasPhase ? 1 : 0.45),
      dashArray: predicted ? '3 3' : null,
    };
  }

  var sigLayers = ${sigsJson}.map(function(s) {
    return L.circleMarker([s.latitude, s.longitude],
      sigStyle(s.phase, s.isNearest, s.predicted)
    ).addTo(map);
  });

  // ── 러너 마커 ────────────────────────────────────────────────────
  var runnerIcon = L.divIcon({
    className: '',
    html: '<div class="runner"><div class="runner-c"></div></div>',
    iconSize: [26,26], iconAnchor: [13,13]
  });
  var runner = L.marker([${start.latitude},${start.longitude}], {
    icon: runnerIcon, zIndexOffset: 1000
  }).addTo(map);

  // 출발 위치 마커
  L.circleMarker([${start.latitude},${start.longitude}], {
    radius:8, fillColor:'#FFD60A', color:'white', weight:2, fillOpacity:1
  }).addTo(map);

  // ── 화장실 안내 ──────────────────────────────────────────────────
  var wcLine = L.polyline([], {color:'#FF9500', weight:5, dashArray:'10 6'}).addTo(map);
  var wcMarker = null;

  window.showBathroom = function(lat, lon, route) {
    wcLine.setLatLngs(route);
    if (wcMarker) map.removeLayer(wcMarker);
    var icon = L.divIcon({
      className:'',
      html:'<div class="wc-pin">🚻</div>',
      iconSize:[34,34], iconAnchor:[17,17]
    });
    wcMarker = L.marker([lat,lon], {icon:icon, zIndexOffset:900}).addTo(map);
    if (route.length > 1) {
      map.fitBounds(L.polyline(route).getBounds(), {padding:[60,60], animate:true});
    }
  };

  window.clearBathroom = function() {
    wcLine.setLatLngs([]);
    if (wcMarker) { map.removeLayer(wcMarker); wcMarker = null; }
  };

  // ── 러너 위치 업데이트 + 경로 진행 분할 ─────────────────────────
  window.updateRunner = function(lat, lon, trail) {
    runner.setLatLng([lat, lon]);
    trailLine.setLatLngs(trail);
    map.panTo([lat, lon], {animate:true, duration:0.5});

    // 현재 위치에서 앞쪽으로만 탐색해 가장 가까운 경로 점 찾기
    var minD = Infinity, best = progressIdx;
    for (var i = progressIdx; i < origRoute.length; i++) {
      var dlat = origRoute[i][0]-lat, dlon = origRoute[i][1]-lon;
      var d = dlat*dlat + dlon*dlon;
      if (d < minD) { minD = d; best = i; }
      // 명확히 멀어지면 탐색 중단
      if (i > best + 8 && d > minD * 9) break;
    }
    progressIdx = best;

    coveredLine.setLatLngs(progressIdx > 0 ? origRoute.slice(0, progressIdx+1) : []);
    remainingLine.setLatLngs(origRoute.slice(progressIdx));
  };

  // ── 경로 재탐색 시 초기화 ────────────────────────────────────────
  window.setRoute = function(coords) {
    origRoute = coords;
    progressIdx = 0;
    coveredLine.setLatLngs([]);
    remainingLine.setLatLngs(coords);
  };

  window.resetSignals = function(sigs) {
    sigLayers.forEach(function(l){ map.removeLayer(l); });
    sigLayers = sigs.map(function(s) {
      return L.circleMarker([s.latitude, s.longitude],
        sigStyle(s.phase, s.isNearest, s.predicted)
      ).addTo(map);
    });
  };

  window.updateSignals = function(sigs) {
    sigs.forEach(function(s, i) {
      if (!sigLayers[i]) return;
      sigLayers[i].setStyle(sigStyle(s.phase, s.isNearest, s.predicted));
      sigLayers[i].setRadius(sigRadius(s.phase, s.isNearest));
    });
  };

  // ── 첫 60초 출발 방향 안내 ───────────────────────────────────────
  (function() {
    if (origRoute.length < 2) return;
    var dirLayers = [];

    // 첫 ~400m 구간 강조 (주황색)
    var seg = [origRoute[0]], cum = 0;
    for (var i = 1; i < origRoute.length; i++) {
      var dlat = origRoute[i][0]-origRoute[i-1][0];
      var dlon = origRoute[i][1]-origRoute[i-1][1];
      cum += Math.sqrt(dlat*dlat+dlon*dlon)*111000;
      seg.push(origRoute[i]);
      if (cum >= 400) break;
    }
    dirLayers.push(L.polyline(seg, {color:'white',  weight:14, opacity:0.9}).addTo(map));
    dirLayers.push(L.polyline(seg, {color:'#FF9500', weight: 9, opacity:1.0}).addTo(map));

    // 방위각 계산
    var p1 = origRoute[0], p2 = origRoute[Math.min(5, origRoute.length-1)];
    var dLonR = (p2[1]-p1[1])*Math.PI/180;
    var lat1r = p1[0]*Math.PI/180, lat2r = p2[0]*Math.PI/180;
    var yy = Math.sin(dLonR)*Math.cos(lat2r);
    var xx = Math.cos(lat1r)*Math.sin(lat2r) - Math.sin(lat1r)*Math.cos(lat2r)*Math.cos(dLonR);
    var bearing = (Math.atan2(yy,xx)*180/Math.PI+360)%360;

    var dirs = ['북','북동','동','남동','남','남서','서','북서'];
    var dirLabel = dirs[Math.round(bearing/45)%8];

    // 출발 방향 배지
    var badgeHtml = '<div style="background:#FF9500;color:white;font-size:13px;font-weight:700;'
      + 'padding:5px 12px;border-radius:20px;white-space:nowrap;border:2.5px solid white;'
      + 'box-shadow:0 2px 8px rgba(0,0,0,0.4);">▶ '+dirLabel+'쪽으로 출발</div>';
    dirLayers.push(L.marker([p1[0],p1[1]], {
      icon: L.divIcon({className:'',html:badgeHtml,iconSize:[160,32],iconAnchor:[-8,16]}),
      zIndexOffset: 900
    }).addTo(map));

    // 방향 화살표 (경로 중간 지점)
    var midIdx = Math.max(1, Math.floor(seg.length/2));
    var arrowHtml = '<div style="width:0;height:0;'
      + 'border-left:12px solid transparent;border-right:12px solid transparent;'
      + 'border-bottom:28px solid #FF9500;'
      + 'transform:rotate('+bearing+'deg);transform-origin:50% 67%;'
      + 'filter:drop-shadow(0 0 3px white) drop-shadow(0 0 3px white);"></div>';
    dirLayers.push(L.marker([seg[midIdx][0],seg[midIdx][1]], {
      icon: L.divIcon({className:'',html:arrowHtml,iconSize:[24,28],iconAnchor:[12,14]}),
      zIndexOffset: 850
    }).addTo(map));

    // 60초 후 자동 제거
    window.setTimeout(function() {
      dirLayers.forEach(function(l){ map.removeLayer(l); });
      dirLayers = [];
    }, 60000);
  })();

  window.ReactNativeWebView && window.ReactNativeWebView.postMessage('MAP_READY');
});
</script>
</body></html>`;
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});

export default LeafletMap;
