import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'ar' | 'ur';
type Theme = 'light' | 'dark';
type TitleFont = 'aref' | 'scheherazade' | 'noto-naskh';
type BodyFont = 'aref' | 'scheherazade' | 'noto-naskh';
type TextScale = 'compact' | 'comfortable' | 'large';

interface SettingsContextType {
  language: Language;
  theme: Theme;
  apiKey: string;
  titleFont: TitleFont;
  bodyFont: BodyFont;
  textScale: TextScale;
  setLanguage: (lang: Language) => void;
  setTheme: (theme: Theme) => void;
  setApiKey: (key: string) => void;
  setTitleFont: (font: TitleFont) => void;
  setBodyFont: (font: BodyFont) => void;
  setTextScale: (scale: TextScale) => void;
  t: (key: string) => string;
  isRTL: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

import { translations } from '../translations';

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('fawaid_language') as Language) || 'en');
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('fawaid_theme') as Theme) || 'light');
  const [titleFont, setTitleFont] = useState<TitleFont>(() => (localStorage.getItem('fawaid_title_font') as TitleFont) || 'aref');
  const [bodyFont, setBodyFont] = useState<BodyFont>(() => (localStorage.getItem('fawaid_body_font') as BodyFont) || 'scheherazade');
  const [textScale, setTextScale] = useState<TextScale>(() => (localStorage.getItem('fawaid_text_scale') as TextScale) || 'comfortable');
  const [apiKey, setApiKeyState] = useState<string>(() => {
    return localStorage.getItem('fawaid_gemini_api_key') || '';
  });

  const setApiKey = (key: string) => {
    setApiKeyState(key);
    if (key) {
      localStorage.setItem('fawaid_gemini_api_key', key);
    } else {
      localStorage.removeItem('fawaid_gemini_api_key');
    }
  };

  useEffect(() => {
    localStorage.setItem('fawaid_language', language);
    const isRTL = language === 'ar' || language === 'ur';
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    localStorage.setItem('fawaid_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('fawaid_title_font', titleFont);
    localStorage.setItem('fawaid_body_font', bodyFont);
    localStorage.setItem('fawaid_text_scale', textScale);

    document.documentElement.setAttribute('data-title-font', titleFont);
    document.documentElement.setAttribute('data-body-font', bodyFont);
    document.documentElement.setAttribute('data-text-scale', textScale);
    document.documentElement.setAttribute('data-color-theme', 'olive');
  }, [titleFont, bodyFont, textScale]);

  const t = (key: string) => {
    return (translations[language] && translations[language][key]) || (translations['en'] && translations['en'][key]) || key;
  };

  return (
    <SettingsContext.Provider value={{
      language,
      theme,
      apiKey,
      titleFont,
      bodyFont,
      textScale,
      setLanguage,
      setTheme,
      setApiKey,
      setTitleFont,
      setBodyFont,
      setTextScale,
      t,
      isRTL: language === 'ar' || language === 'ur'
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
