import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { RAIL_W } from '../responsive';
import { T } from './UI';

export type RailItem<K extends string> = {
  key: K;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
};

// 태블릿 좌측 레일(96px) — 하단 탭이 엄지에서 멀어서 옮겼다. 라벨은 14px, 터치 영역 64px 이상.
export function TabletRail<K extends string>({ items, active, onSelect, onHome }: {
  items: Array<RailItem<K>>;
  active: K | string;
  onSelect: (key: K) => void;
  onHome: () => void;
}) {
  return (
    <View style={{ width: RAIL_W, backgroundColor: T.white }}>
      <ScrollView contentContainerStyle={{ paddingVertical: 20, gap: 6, alignItems: 'center' }} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={onHome}
          accessibilityRole="button"
          accessibilityLabel="헬스에이지 홈"
          style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}
        >
          <Ionicons name="pulse" size={24} color="#fff" />
        </Pressable>
        {items.map((item) => {
          const on = active === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => onSelect(item.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{ width: RAIL_W - 12, minHeight: 64, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }}
            >
              <View style={{ width: 56, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 4, backgroundColor: on ? T.primaryLight : 'transparent' }}>
                <Ionicons name={on ? item.activeIcon : item.icon} size={24} color={on ? T.primaryText : T.text2} />
              </View>
              <Text style={{ fontSize: T.fs.caption, color: on ? T.primaryText : T.text2, fontWeight: on ? '700' : '500' }}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
