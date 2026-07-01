import { useApp } from '../context/SupabaseAppContext';
import { translations } from '../lib/translations';

export function useTranslation() {
  const { state } = useApp();
  const lang = state.settings.language || 'en';

  const t = (key: string, fallback?: string): string => {
    const langDict = translations[lang] || translations['en'];
    if (langDict && key in langDict) {
      return langDict[key];
    }
    // Fallback to English dictionary if not found in selected language
    const enDict = translations['en'];
    if (enDict && key in enDict) {
      return enDict[key];
    }
    return fallback || key;
  };

  const isRtl = lang === 'ur' || lang === 'ar';

  return { t, lang, isRtl };
}
export type UseTranslationResponse = ReturnType<typeof useTranslation>;
