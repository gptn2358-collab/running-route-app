import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import * as Location from 'expo-location';
import { Coordinate } from '../types';
import WebMapView, { WebMapViewHandle } from '../components/WebMapView';

const PRESET_KM = [3, 5, 10, 15, 21];
const PRESET_LABELS: Record<number, string> = { 21: '하프 마라톤' };

const SEOUL: Coordinate = { latitude: 37.5665, longitude: 126.978 };

interface Props {
  onSearch: (start: Coordinate, distanceM: number) => Promise<void>;
  onRanking: () => void;
  onProfile: () => void;
}

export default function HomeScreen({ onSearch, onRanking, onProfile }: Props) {
  const [location, setLocation] = useState<Coordinate | null>(null);
  const [selectedKm, setSelectedKm] = useState(5);
  const [customKm, setCustomKm] = useState('');
  const [searching, setSearching] = useState(false);
  const [statusMsg, setStatusMsg] = useState('현재 위치를 가져오는 중...');
  const mapRef = useRef<WebMapViewHandle>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('위치 권한 필요', '달리기 경로 탐색을 위해 위치 권한을 허용해주세요.');
        setStatusMsg('위치 권한이 거부되었습니다');
        return;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const coord: Coordinate = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        setLocation(coord);
        setStatusMsg('현재 위치 확인됨');
        mapRef.current?.flyTo(coord, 15);
        mapRef.current?.setUserMarker(coord);
      } catch {
        setStatusMsg('위치를 가져오지 못했습니다');
      }
    })();
  }, []);

  const effectiveKm = customKm ? parseFloat(customKm) : selectedKm;

  const handleSearch = async () => {
    if (!location) {
      Alert.alert('위치 확인 중', '현재 위치를 가져오는 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    if (!effectiveKm || effectiveKm < 1 || effectiveKm > 50 || isNaN(effectiveKm)) {
      Alert.alert('거리 오류', '1 ~ 50 km 사이로 입력해주세요.');
      return;
    }
    setSearching(true);
    try {
      await onSearch(location, effectiveKm * 1000);
    } catch (e: any) {
      Alert.alert('탐색 실패', e.message ?? '다시 시도해주세요.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <View style={s.container}>
      <WebMapView ref={mapRef} center={SEOUL} zoom={13} style={s.map} />

      <View style={s.panel}>
        <View style={s.titleRow}>
          <View style={s.titleBlock}>
            <Text style={s.title}>달리기 경로 탐색</Text>
            <Text style={s.subtitle}>신호등을 최소화한 순환 경로를 찾아드립니다 🏃</Text>
          </View>
          <View style={s.quickBtns}>
            <TouchableOpacity style={s.quickBtn} onPress={onRanking}>
              <Text style={s.quickBtnTxt}>🏆</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.quickBtn} onPress={onProfile}>
              <Text style={s.quickBtnTxt}>👤</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={s.sectionLabel}>목표 거리</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.presetScroll}>
          {PRESET_KM.map((km) => {
            const active = selectedKm === km && !customKm;
            return (
              <TouchableOpacity
                key={km}
                style={[s.presetBtn, active && s.presetBtnOn]}
                onPress={() => { setSelectedKm(km); setCustomKm(''); }}
              >
                <Text style={[s.presetBtnTxt, active && s.presetBtnTxtOn]}>
                  {PRESET_LABELS[km] ?? `${km}km`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={s.customRow}>
          <TextInput
            style={s.customInput}
            placeholder="직접 입력"
            placeholderTextColor="#666"
            keyboardType="decimal-pad"
            value={customKm}
            onChangeText={setCustomKm}
          />
          <Text style={s.kmSuffix}>km</Text>
        </View>

        <Text style={s.locationStatus}>{statusMsg}</Text>

        <TouchableOpacity
          style={[s.searchBtn, searching && s.searchBtnOff]}
          onPress={handleSearch}
          disabled={searching}
        >
          {searching ? (
            <View style={s.loadingRow}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={s.searchBtnTxt}>  경로 탐색 중...</Text>
            </View>
          ) : (
            <Text style={s.searchBtnTxt}>
              {effectiveKm && !isNaN(effectiveKm) ? `${effectiveKm}km` : '--'} 경로 탐색
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  map: { flex: 1 },
  panel: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    marginTop: -22,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  titleBlock: { flex: 1 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: '#777', fontSize: 13 },
  quickBtns: { flexDirection: 'row', gap: 8, marginLeft: 12 },
  quickBtn: {
    width: 38,
    height: 38,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickBtnTxt: { fontSize: 18 },
  sectionLabel: { color: '#aaa', fontSize: 13, marginBottom: 8 },
  presetScroll: { marginBottom: 10 },
  presetBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#2a2a2a',
    marginRight: 8,
  },
  presetBtnOn: { backgroundColor: '#00C853' },
  presetBtnTxt: { color: '#888', fontWeight: '600', fontSize: 14 },
  presetBtnTxtOn: { color: '#fff' },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    height: 48,
  },
  customInput: { flex: 1, color: '#fff', fontSize: 16 },
  kmSuffix: { color: '#777', fontSize: 14 },
  locationStatus: { color: '#555', fontSize: 12, marginBottom: 14 },
  searchBtn: {
    backgroundColor: '#00C853',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  searchBtnOff: { opacity: 0.55 },
  searchBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  loadingRow: { flexDirection: 'row', alignItems: 'center' },
});
