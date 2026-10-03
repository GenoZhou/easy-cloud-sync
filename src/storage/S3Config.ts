/**
 * S3 Configuration Module
 *
 * Adapted from obsidian-s3-sync-and-backup (MIT)
 * Copyright (c) 2025 Sathindu
 */

import { S3ClientConfig } from '@aws-sdk/client-s3';
import { EasySyncSettings, S3ProviderType, S3_PROVIDER_NAMES } from '../types';
import { ObsidianHttpHandler } from './ObsidianHttpHandler';

export function getEndpointForProvider(settings: EasySyncSettings): string | undefined {
	switch (settings.provider) {
		case 'aws':
			return undefined;
		case 'r2':
			if (settings.endpoint) {
				return settings.endpoint;
			}
			throw new Error(
				'Cloudflare R2 requires an endpoint URL (https://<ACCOUNT_ID>.r2.cloudflarestorage.com)',
			);
		case 'custom':
			if (settings.endpoint) {
				return settings.endpoint;
			}
			throw new Error('Other S3-compatible provider requires an endpoint URL');
		default:
			return settings.endpoint || undefined;
	}
}

export function shouldForcePathStyle(settings: EasySyncSettings): boolean {
	switch (settings.provider) {
		case 'r2':
			return true;
		case 'aws':
			return settings.forcePathStyle;
		case 'custom':
			return settings.forcePathStyle;
		default:
			return settings.forcePathStyle;
	}
}

export function providerSupportsConditionalWrites(_provider: S3ProviderType): boolean {
	return true;
}

export function buildS3ClientConfig(settings: EasySyncSettings): S3ClientConfig {
	const endpoint = getEndpointForProvider(settings);

	const config: S3ClientConfig = {
		region: settings.region || 'auto',
		credentials: {
			accessKeyId: settings.accessKeyId,
			secretAccessKey: settings.secretAccessKey,
		},
		forcePathStyle: shouldForcePathStyle(settings),
		requestChecksumCalculation: 'WHEN_REQUIRED',
		responseChecksumValidation: 'WHEN_REQUIRED',
		requestHandler: new ObsidianHttpHandler({
			requestTimeout: 30000,
		}),
	};

	if (endpoint) {
		config.endpoint = endpoint;
	}

	return config;
}

export function validateConnectionSettings(settings: EasySyncSettings): string[] {
	const errors: string[] = [];

	if (!Object.prototype.hasOwnProperty.call(S3_PROVIDER_NAMES, settings.provider)) {
		errors.push(
			`Unsupported provider "${settings.provider}". Re-select a provider in Settings.`,
		);
	}

	if (!settings.bucket) {
		errors.push('Bucket name is required');
	}

	if (!settings.accessKeyId) {
		errors.push('Access Key ID is required');
	}

	if (!settings.secretAccessKey) {
		errors.push('Secret Access Key is required');
	}

	if (settings.provider === 'r2' && !settings.endpoint) {
		errors.push('Cloudflare R2 requires an endpoint URL');
	}

	if (settings.provider === 'custom' && !settings.endpoint) {
		errors.push('Other S3-compatible provider requires an endpoint URL');
	}

	if (settings.provider === 'aws' && !settings.region) {
		errors.push('AWS S3 requires a region');
	}

	return errors;
}

export function isConnectionConfigured(settings: EasySyncSettings): boolean {
	return validateConnectionSettings(settings).length === 0;
}

export function getProviderDisplayName(provider: S3ProviderType): string {
	return S3_PROVIDER_NAMES[provider] ?? 'Unknown';
}
