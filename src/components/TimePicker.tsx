import React, { useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

const ITEM_H = 54;
const PAD    = 2;           // 선택 항목 위아래 보이는 개수

const HOURS   = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

interface DrumProps {
  items: string[];
  selected: number;
  onSelect: (i: number) => void;
}

function Drum({ items, selected, onSelect }: DrumProps) {
  const { colors } = useTheme();
  const ref = useRef<ScrollView>(null);

  // 초기 스크롤 위치 설정
  useEffect(() => {
    const timer = setTimeout(() => {
      ref.current?.scrollTo({ y: selected * ITEM_H, animated: false });
    }, 120);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    onSelect(Math.max(0, Math.min(items.length - 1, idx)));
  }, [items.length, onSelect]);

  return (
    <View style={styles.drumWrap}>
      <ScrollView
        ref={ref}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={onEnd}
        onScrollEndDrag={onEnd}
        contentContainerStyle={{ paddingVertical: ITEM_H * PAD }}
        style={styles.drum}
      >
        {items.map((item, i) => {
          const active = i === selected;
          return (
            <View key={i} style={styles.drumItem}>
              <Text style={[
                styles.drumTxt,
                { color: active ? colors.text : colors.textFaint },
                active && styles.drumTxtActive,
              ]}>
                {item}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      {/* 선택 강조선 */}
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <View style={{ flex: PAD, borderBottomWidth: 1.5, borderColor: colors.accent }} />
        <View style={{ height: ITEM_H }} />
        <View style={{ flex: PAD, borderTopWidth: 1.5, borderColor: colors.accent }} />
      </View>
    </View>
  );
}

interface Props {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
}

export default function TimePicker({ hour, minute, onChange }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Drum items={HOURS}   selected={hour}   onSelect={h => onChange(h, minute)} />
      <Text style={[styles.colon, { color: colors.text }]}>:</Text>
      <Drum items={MINUTES} selected={minute} onSelect={m => onChange(hour, m)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  drumWrap: {
    height: ITEM_H * (PAD * 2 + 1),
    width: 72,
    overflow: 'hidden',
  },
  drum: {
    height: ITEM_H * (PAD * 2 + 1),
  },
  drumItem: {
    height: ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drumTxt: {
    fontSize: 20,
    fontWeight: '400',
    fontVariant: ['tabular-nums'],
  },
  drumTxtActive: {
    fontSize: 30,
    fontWeight: '800',
  },
  colon: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
});
