import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

export type TabKey = 'home' | 'records' | 'ranking' | 'mypage';

interface TabItem {
  key: TabKey;
  icon: string;
  label: string;
}

const TABS: TabItem[] = [
  { key: 'home',    icon: '🏃',  label: '홈'        },
  { key: 'records', icon: '📊',  label: '기록'      },
  { key: 'ranking', icon: '🏆',  label: '랭킹'      },
  { key: 'mypage',  icon: '👤',  label: '마이페이지' },
];

interface Props {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

export default function BottomTabBar({ active, onChange }: Props) {
  return (
    <View style={s.container}>
      {TABS.map(tab => {
        const on = tab.key === active;
        return (
          <TouchableOpacity
            key={tab.key}
            style={s.tab}
            onPress={() => onChange(tab.key)}
            activeOpacity={0.7}
          >
            <Text style={s.icon}>{tab.icon}</Text>
            <Text style={[s.label, on && s.labelOn]}>{tab.label}</Text>
            {on && <View style={s.dot} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#222',
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    paddingTop: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  icon: { fontSize: 22 },
  label: { color: '#555', fontSize: 10, fontWeight: '600' },
  labelOn: { color: '#00C853' },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#00C853',
    marginTop: 2,
  },
});
