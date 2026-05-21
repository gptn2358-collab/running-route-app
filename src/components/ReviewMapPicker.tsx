import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Coordinate } from '../types';

export interface ReviewMapPickerHandle {
  addMarker(coord: Coordinate, colorHex: string): void;
  clearMarkers(): void;
  clearSnapMarker(): void;
}

interface Props {
  trail: Coordinate[];        // actual GPS path taken during run
  center: Coordinate;
  onTap: (coord: Coordinate) => void;
}

const ReviewMapPicker = forwardRef<ReviewMapPickerHandle, Props>(
  ({ trail, center, onTap }, ref) => {
    const webRef = useRef<WebView>(null);
    const readyRef = useRef(false);
    const pendingRef = useRef<string[]>([]);

    const inject = (code: string) => {
      if (!readyRef.current) { pendingRef.current.push(code); return; }
      webRef.current?.injectJavaScript(code + ';true;');
    };

    const flush = () => {
      if (readyRef.current) return;
      readyRef.current = true;
      pendingRef.current.forEach((c) => webRef.current?.injectJavaScript(c + ';true;'));
      pendingRef.current = [];
    };

    const handleMessage = (e: { nativeEvent: { data: string } }) => {
      try {
        const msg = JSON.parse(e.nativeEvent.data);
        if (msg.type === 'ready') flush();
        else if (msg.type === 'tap') onTap({ latitude: msg.lat, longitude: msg.lon });
      } catch {}
    };

    const handleLoad = () => {
      setTimeout(() => { if (!readyRef.current) flush(); }, 2000);
    };

    useImperativeHandle(ref, () => ({
      addMarker(coord, colorHex) {
        inject(`addMarker(${coord.latitude},${coord.longitude},'${colorHex}')`);
      },
      clearMarkers() {
        inject(`clearMarkers()`);
      },
      clearSnapMarker() {
        inject(`clearSnapMarker()`);
      },
    }));

    return (
      <WebView
        ref={webRef}
        style={styles.map}
        source={{ html: buildHtml(trail, center) }}
        scrollEnabled={false}
        javaScriptEnabled
        originWhitelist={['*']}
        onLoad={handleLoad}
        onMessage={handleMessage}
      />
    );
  }
);

function buildHtml(trail: Coordinate[], center: Coordinate): string {
  const trailJson = JSON.stringify(trail.map((c) => [c.latitude, c.longitude]));

  return `<!DOCTYPE html><html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5,user-scalable=yes">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100%}
@keyframes pulse {
  0%   { transform:scale(1);   opacity:1; }
  70%  { transform:scale(2.2); opacity:0; }
  100% { transform:scale(2.2); opacity:0; }
}
.snap-ring {
  width:22px; height:22px; border-radius:50%;
  border:3px solid #FF9500;
  animation:pulse 1s ease-out infinite;
  box-sizing:border-box;
}
</style>
</head>
<body><div id="map"></div>
<script>
window.addEventListener('load', function() {
  var trail = ${trailJson};
  var map = L.map('map', {zoomControl:false, attributionControl:false});

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
    subdomains:'abcd', maxZoom:19, keepBuffer:4
  }).addTo(map);

  if (trail.length > 1) {
    // 흰 외곽선 + 파란 경로선으로 시인성 강화
    L.polyline(trail, {color:'white', weight:9, opacity:0.9}).addTo(map);
    var line = L.polyline(trail, {color:'#2979FF', weight:5, opacity:1}).addTo(map);
    map.fitBounds(line.getBounds(), {padding:[52,52]});

    // 출발점 (초록)
    L.circleMarker(trail[0], {
      radius:10, fillColor:'#00C853', color:'white', weight:2.5, fillOpacity:1
    }).addTo(map);
    // 도착점 (빨강)
    L.circleMarker(trail[trail.length-1], {
      radius:10, fillColor:'#FF453A', color:'white', weight:2.5, fillOpacity:1
    }).addTo(map);
  } else {
    map.setView([${center.latitude},${center.longitude}], 15);
  }

  // 트레일에서 가장 가까운 점 찾기 (위도·경도 제곱 거리 비교)
  function nearestTrailPoint(lat, lon) {
    var best = trail[0];
    var bestD = Infinity;
    for (var i = 0; i < trail.length; i++) {
      var dlat = lat - trail[i][0];
      var dlon = lon - trail[i][1];
      var d = dlat*dlat + dlon*dlon;
      if (d < bestD) { bestD = d; best = trail[i]; }
    }
    return best;
  }

  var issueMarkers = [];
  var snapMarker = null;  // 탭 미확정 스냅 마커

  window.addMarker = function(lat, lon, color) {
    // 확정된 이슈 마커 (불투명, 외곽선 두꺼움)
    var m = L.circleMarker([lat, lon], {
      radius:11, fillColor:color, color:'white', weight:3, fillOpacity:0.95
    }).addTo(map);
    issueMarkers.push(m);
  };

  window.clearMarkers = function() {
    issueMarkers.forEach(function(m){ map.removeLayer(m); });
    issueMarkers = [];
  };

  window.clearSnapMarker = function() {
    if (snapMarker) { map.removeLayer(snapMarker); snapMarker = null; }
  };

  // 지도 탭 → 트레일 위 최근접 점으로 스냅
  map.on('click', function(e) {
    if (trail.length === 0) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
        JSON.stringify({type:'tap', lat:e.latlng.lat, lon:e.latlng.lng})
      );
      return;
    }

    var pt = nearestTrailPoint(e.latlng.lat, e.latlng.lng);

    // 이전 스냅 마커 제거 후 새 위치에 pulse 링 표시
    if (snapMarker) map.removeLayer(snapMarker);
    var ringIcon = L.divIcon({
      className:'', html:'<div class="snap-ring"></div>',
      iconSize:[22,22], iconAnchor:[11,11]
    });
    snapMarker = L.marker([pt[0], pt[1]], {icon:ringIcon, zIndexOffset:2000}).addTo(map);

    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
      JSON.stringify({type:'tap', lat:pt[0], lon:pt[1]})
    );
  });

  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
    JSON.stringify({type:'ready'})
  );
});
</script>
</body></html>`;
}

const styles = StyleSheet.create({ map: { flex: 1 } });
export default ReviewMapPicker;
