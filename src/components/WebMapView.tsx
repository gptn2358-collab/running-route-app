import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { Coordinate } from '../types';

export interface CircleConfig {
  latitude: number;
  longitude: number;
  radiusM: number;
  fillColor: string;
  strokeColor: string;
}

export interface WebMapViewHandle {
  flyTo(coord: Coordinate, zoom?: number): void;
  fitBounds(coords: Coordinate[]): void;
  setPolyline(coords: Coordinate[], color: string): void;
  setCircles(circles: CircleConfig[]): void;
  setUserMarker(coord: Coordinate): void;
  setStartDirection(polyline: Coordinate[]): void;
}

interface Props {
  style?: ViewStyle;
  center: Coordinate;
  zoom?: number;
  startMarker?: Coordinate;
}

const WebMapView = forwardRef<WebMapViewHandle, Props>(
  ({ style, center, zoom = 15, startMarker }, ref) => {
    const webRef = useRef<WebView>(null);
    const readyRef = useRef(false);
    const pendingRef = useRef<string[]>([]);

    const inject = (code: string) => {
      if (!readyRef.current) { pendingRef.current.push(code); return; }
      webRef.current?.injectJavaScript(code + ';true;');
    };

    const flushPending = () => {
      if (readyRef.current) return;
      readyRef.current = true;
      pendingRef.current.forEach((c) => webRef.current?.injectJavaScript(c + ';true;'));
      pendingRef.current = [];
    };

    // postMessage('MAP_READY') from inside window.load is primary trigger
    const handleMessage = (e: { nativeEvent: { data: string } }) => {
      if (e.nativeEvent.data === 'MAP_READY') flushPending();
    };

    // Fallback: if MAP_READY never arrives (e.g. offline), unblock after 3s
    const handleLoad = () => {
      setTimeout(() => { if (!readyRef.current) flushPending(); }, 3000);
    };

    useImperativeHandle(ref, () => ({
      flyTo(coord, z = 16) {
        inject(`map.flyTo([${coord.latitude},${coord.longitude}],${z},{animate:true,duration:0.6})`);
      },
      fitBounds(coords) {
        inject(`map.fitBounds(L.latLngBounds(${JSON.stringify(
          coords.map((c) => [c.latitude, c.longitude])
        )}),{padding:[50,50]})`);
      },
      setPolyline(coords, color) {
        inject(`setPolyline(${JSON.stringify(
          coords.map((c) => [c.latitude, c.longitude])
        )},'${color}')`);
      },
      setCircles(circles) {
        inject(`setCircles(${JSON.stringify(circles)})`);
      },
      setUserMarker(coord) {
        inject(`setUserMarker(${coord.latitude},${coord.longitude})`);
      },
      setStartDirection(polyline) {
        inject(`setStartDirection(${JSON.stringify(
          polyline.map((c) => [c.latitude, c.longitude])
        )})`);
      },
    }));

    return (
      <WebView
        ref={webRef}
        style={[styles.map, style]}
        source={{ html: buildHtml(center, zoom, startMarker) }}
        scrollEnabled={false}
        javaScriptEnabled
        originWhitelist={['*']}
        onLoad={handleLoad}
        onMessage={handleMessage}
      />
    );
  }
);

function buildHtml(center: Coordinate, zoom: number, startMarker?: Coordinate): string {
  const startMarkerJs = startMarker
    ? `L.circleMarker([${startMarker.latitude},${startMarker.longitude}],{
        radius:9, fillColor:'#00C853', color:'white', weight:2, fillOpacity:1
      }).addTo(map);`
    : '';

  return `<!DOCTYPE html><html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5,user-scalable=yes">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100%;background:#f8f8f8}
.udot{width:20px;height:20px;border-radius:50%;background:rgba(41,121,255,.28);display:flex;align-items:center;justify-content:center}
.udot-c{width:10px;height:10px;border-radius:50%;background:#2979FF;margin:5px auto 0}
</style>
</head>
<body><div id="map"></div>
<script>
window.addEventListener('load', function() {
  var map = L.map('map', {zoomControl:false, attributionControl:false})
    .setView([${center.latitude},${center.longitude}], ${zoom});

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
    subdomains:'abcd', maxZoom:19, keepBuffer:4
  }).addTo(map);

  ${startMarkerJs}

  var routeLine = null;
  var circleLayers = [];
  var userMarker = null;
  var startDirLine = null;
  var startDirArrow = null;

  var userIcon = L.divIcon({
    className:'',
    html:'<div class="udot"><div class="udot-c"></div></div>',
    iconSize:[20,20], iconAnchor:[10,10]
  });

  window.setUserMarker = function(lat, lon) {
    if (userMarker) userMarker.setLatLng([lat, lon]);
    else userMarker = L.marker([lat, lon], {icon:userIcon, zIndexOffset:1000}).addTo(map);
  };

  window.setPolyline = function(coords, color) {
    if (routeLine) map.removeLayer(routeLine);
    routeLine = L.polyline(coords, {color:color, weight:5, opacity:0.7}).addTo(map);
  };

  window.setCircles = function(circles) {
    circleLayers.forEach(function(l){ map.removeLayer(l); });
    circleLayers = circles.map(function(c) {
      return L.circle([c.latitude, c.longitude], {
        radius: c.radiusM,
        fillColor: c.fillColor,
        color: c.strokeColor,
        fillOpacity: 0.35,
        weight: 2
      }).addTo(map);
    });
  };

  window.setStartDirection = function(polyline) {
    if (startDirLine)  map.removeLayer(startDirLine);
    if (startDirArrow) map.removeLayer(startDirArrow);
    if (!polyline || polyline.length < 2) return;

    // ── 첫 ~400m 구간 강조선 ──────────────────────────────────────
    // 외곽선(흰색 두꺼운 선) + 내부선(파란색)으로 시인성 강화
    var seg = [polyline[0]];
    var cum = 0;
    for (var i = 1; i < polyline.length; i++) {
      var dlat = polyline[i][0] - polyline[i-1][0];
      var dlon = polyline[i][1] - polyline[i-1][1];
      cum += Math.sqrt(dlat*dlat + dlon*dlon) * 111000;
      seg.push(polyline[i]);
      if (cum >= 400) break;
    }
    // 흰 외곽선
    L.polyline(seg, {color:'white', weight:14, opacity:0.9}).addTo(map);
    // 파란 내부선
    startDirLine = L.polyline(seg, {color:'#2979FF', weight:9, opacity:1}).addTo(map);

    // ── bearing 계산 ──────────────────────────────────────────────
    var p1 = polyline[0];
    var p2 = polyline[Math.min(5, polyline.length - 1)];
    var dLonR = (p2[1] - p1[1]) * Math.PI / 180;
    var lat1r = p1[0] * Math.PI / 180, lat2r = p2[0] * Math.PI / 180;
    var yy = Math.sin(dLonR) * Math.cos(lat2r);
    var xx = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLonR);
    var bearing = (Math.atan2(yy, xx) * 180 / Math.PI + 360) % 360;

    // ── 방향 텍스트 변환 ──────────────────────────────────────────
    var dirs = ['북','북동','동','남동','남','남서','서','북서'];
    var dirLabel = dirs[Math.round(bearing / 45) % 8];

    // ── 출발 방향 배지 (출발점 바로 옆) ──────────────────────────
    var badgeHtml =
      '<div style="'
      + 'background:#2979FF;color:white;font-size:13px;font-weight:700;'
      + 'padding:5px 10px;border-radius:20px;white-space:nowrap;'
      + 'border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);'
      + 'line-height:1.2;text-align:center;'
      + '">'
      + '▶ ' + dirLabel + '쪽으로 출발'
      + '</div>';

    var badgeIcon = L.divIcon({
      className: '',
      html: badgeHtml,
      iconSize: [140, 32],
      iconAnchor: [-8, 16]
    });

    // ── 중간 지점에 방향 화살표 마커 ─────────────────────────────
    // 화살표를 놓을 위치(midIdx)에서의 로컬 방위각 계산 — 시작 방위각 대신
    // 로컬 방위각을 사용해야 경로가 꺾일 때도 도로 방향과 일치함
    var midIdx = Math.max(1, Math.floor(seg.length / 2));
    var aFrom = seg[Math.max(0, midIdx - 1)];
    var aTo   = seg[Math.min(seg.length - 1, midIdx + 1)];
    var aDLonR = (aTo[1] - aFrom[1]) * Math.PI / 180;
    var aLat1r = aFrom[0] * Math.PI / 180, aLat2r = aTo[0] * Math.PI / 180;
    var aYY = Math.sin(aDLonR) * Math.cos(aLat2r);
    var aXX = Math.cos(aLat1r) * Math.sin(aLat2r) - Math.sin(aLat1r) * Math.cos(aLat2r) * Math.cos(aDLonR);
    var localBearing = (Math.atan2(aYY, aXX) * 180 / Math.PI + 360) % 360;

    var arrowHtml =
      '<div style="'
      + 'width:0;height:0;'
      + 'border-left:11px solid transparent;'
      + 'border-right:11px solid transparent;'
      + 'border-bottom:24px solid #2979FF;'
      + 'transform:rotate(' + localBearing + 'deg);'
      + 'transform-origin:50% 50%;'
      + 'filter:drop-shadow(0 0 3px white) drop-shadow(0 0 3px white);'
      + '"></div>';

    var arrowIcon = L.divIcon({
      className: '',
      html: arrowHtml,
      iconSize: [22, 24],
      iconAnchor: [11, 12]
    });

    L.marker([polyline[0][0], polyline[0][1]], {icon:badgeIcon, zIndexOffset:900}).addTo(map);
    startDirArrow = L.marker([seg[midIdx][0], seg[midIdx][1]], {icon:arrowIcon, zIndexOffset:850}).addTo(map);
  };

  // 지도 초기화 완료 — React Native에 알림
  window.ReactNativeWebView && window.ReactNativeWebView.postMessage('MAP_READY');
});
</script>
</body></html>`;
}

const styles = StyleSheet.create({ map: { flex: 1 } });

export default WebMapView;
