/**
 * Vault-scoped device ID helpers.
 *
 * Adapted from obsidian-s3-sync-and-backup VaultMarker (MIT)
 * Copyright (c) 2025 Sathindu
 */

import { App } from 'obsidian';

const DEVICE_ID_STORAGE_KEY = 'easy-sync-device-id';

export function generateDeviceId(): string {
	const random = new Uint8Array(8);
	crypto.getRandomValues(random);
	const hex = Array.from(random)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return `device-${hex}`;
}

export function getOrCreateDeviceId(app: App): string {
	const existing: unknown = app.loadLocalStorage(DEVICE_ID_STORAGE_KEY);
	if (typeof existing === 'string' && existing.length > 0) {
		return existing;
	}

	const deviceId = generateDeviceId();
	app.saveLocalStorage(DEVICE_ID_STORAGE_KEY, deviceId);
	return deviceId;
}
