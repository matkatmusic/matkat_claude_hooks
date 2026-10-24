import type { ThemeName } from './types';
import { getButton } from './dom';

export function readThemeName(savedTheme: string | null, prefersDark: boolean): ThemeName {
  if (savedTheme === 'dark')
    return 'dark';
  if (savedTheme === 'light')
    return 'light';
  return prefersDark ? 'dark' : 'light';
}

export function computeOtherTheme(currentTheme: string | undefined): ThemeName {
  return currentTheme === 'dark' ? 'light' : 'dark';
}

export function setTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
  getButton('themeBtn').textContent = theme;
  localStorage.setItem('theme', theme);
}

export function toggleTheme(): void {
  setTheme(computeOtherTheme(document.documentElement.dataset.theme));
}
