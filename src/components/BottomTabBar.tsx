import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../theme';

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
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

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

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      backgroundColor: c.tabBg,
      borderTopWidth: 1,
      borderTopColor: c.tabBorder,
      paddingBottom: Platform.OS === 'ios' ? 24 : 8,
      paddingTop: 10,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      gap: 3,
    },
    icon:    { fontSize: 22 },
    label:   { color: c.textFaint, fontSize: 10, fontWeight: '600' },
    labelOn: { color: c.accent },
    dot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.accent,
      marginTop: 2,
    },
  });
}
