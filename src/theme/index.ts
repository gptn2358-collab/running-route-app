export interface Colors {
  bg: string;
  card: string;
  card2: string;
  card3: string;
  text: string;
  textSub: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentBg: string;
  accentBorder: string;
  border: string;
  divider: string;
  tabBg: string;
  tabBorder: string;
  overlay: string;
  overlayLight: string;
  // 시맨틱 섹션 색상
  offBg: string;
  offBorder: string;
  offBadgeBg: string;
  rankBg: string;
  rowMeBg: string;
}

export const dark: Colors = {
  bg:           '#0f0f0f',
  card:         '#1a1a1a',
  card2:        '#2a2a2a',
  card3:        '#242424',
  text:         '#ffffff',
  textSub:      '#aaaaaa',
  textMuted:    '#666666',
  textFaint:    '#555555',
  accent:       '#00C853',
  accentBg:     '#0d2818',
  accentBorder: '#1a4a2a',
  border:       '#2a2a2a',
  divider:      '#333333',
  tabBg:        '#111111',
  tabBorder:    '#222222',
  overlay:      'rgba(10,10,10,0.92)',
  overlayLight: 'rgba(0,0,0,0.72)',
  offBg:        '#1a1209',
  offBorder:    '#3a2a0a',
  offBadgeBg:   '#2a2209',
  rankBg:       '#1a2a1a',
  rowMeBg:      '#0d2018',
};

export const light: Colors = {
  bg:           '#f2f2f7',
  card:         '#ffffff',
  card2:        '#e8e8ed',
  card3:        '#f5f5fa',
  text:         '#111111',
  textSub:      '#555555',
  textMuted:    '#888888',
  textFaint:    '#aaaaaa',
  accent:       '#C8860A',
  accentBg:     '#fdf3e0',
  accentBorder: '#f0d090',
  border:       '#e0e0e0',
  divider:      '#e5e5ea',
  tabBg:        '#ffffff',
  tabBorder:    '#e0e0e0',
  overlay:      'rgba(255,255,255,0.92)',
  overlayLight: 'rgba(0,0,0,0.5)',
  offBg:        '#fffde7',
  offBorder:    '#f9d060',
  offBadgeBg:   '#fef9c3',
  rankBg:       '#f0fdf4',
  rowMeBg:      '#fdf3e0',
};
