import type { en } from './en';

/** Shape of locale dictionaries (mirrors English). */
export type LocaleStrings = {
	[K in keyof typeof en]: (typeof en)[K];
};
