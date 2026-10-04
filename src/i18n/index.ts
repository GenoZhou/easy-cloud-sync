/**
 * Locale helper — follows Obsidian UI language via getLanguage().
 * zh / zh-* → Chinese; everything else → English.
 */

import { getLanguage } from 'obsidian';
import { en } from './en';
import { zh } from './zh';
import type { LocaleStrings } from './types';

export type { LocaleStrings };
export type AppLocale = 'en' | 'zh';

export function getAppLocale(): AppLocale {
	const lang = getLanguage().toLowerCase();
	if (lang === 'zh' || lang.startsWith('zh-') || lang.startsWith('zh_')) {
		return 'zh';
	}
	return 'en';
}

/** Active locale strings for the current Obsidian language. */
export function t(): LocaleStrings {
	return getAppLocale() === 'zh' ? zh : en;
}
