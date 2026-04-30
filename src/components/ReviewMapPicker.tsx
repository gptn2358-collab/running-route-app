import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Coordinate } from '../types';

export interface ReviewMapPickerHandle {
  addMarker(coord: Coordinate, colorHex: string): void;
  clearMarkers(): void;
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
    // 달린 경로 선
    var line = L.polyline(trail, {color:'#2979FF', weight:5, opacity:0.75}).addTo(map);
    map.fitBounds(line.getBounds(), {padding:[44,44]});

    // GPS 위치 점 — 최대 30개, 위치 선택 시 기준점이 됨
    var dotStep = Math.max(1, Math.floor(trail.length / 30));
    for (var i = dotStep; i < trail.length - 1; i += dotStep) {
      L.circleMarker(trail[i], {
        radius: 4, fillColor: '#2979FF', color: 'white', weight: 1.5, fillOpacity: 0.8
      }).addTo(map);
    }

    // 출발점 (초록)
    L.circleMarker(trail[0], {
      radius: 9, fillColor: '#00C853', color: 'white', weight: 2.5, fillOpacity: 1
    }).addTo(map);
    // 도착점 (노랑 — 현재 위치)
    L.circleMarker(trail[trail.length-1], {
      radius: 9, fillColor: '#FFD60A', color: 'white', weight: 2.5, fillOpacity: 1
    }).addTo(map);
  } else {
    map.setView([${center.latitude},${center.longitude}], 15);
  }

  var issueMarkers = [];

  window.addMarker = function(lat, lon, color) {
    var m = L.circleMarker([lat, lon], {
      radius:11, fillColor:color, color:'white', weight:2.5, fillOpacity:0.92
    }).addTo(map);
    issueMarkers.push(m);
  };

  window.clearMarkers = function() {
    issueMarkers.forEach(function(m){ map.removeLayer(m); });
    issueMarkers = [];
  };

  // Tap = click anywhere on map
  map.on('click', function(e) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
      JSON.stringify({type:'tap', lat:e.latlng.lat, lon:e.latlng.lng})
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
