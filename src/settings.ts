// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2024 Alexander Thoukydides

import { Config } from './config-types.js';

import PACKAGE from '../package.json' with { type: 'json' };

// Platform identifiers
export const ENGINES: Record<string, string>    = PACKAGE.engines;
export const PLUGIN_NAME    :string             = PACKAGE.name;
export const PLATFORM_NAME  :string             = PACKAGE.displayName;
export const PLUGIN_VERSION :string             = PACKAGE.version;

// Required Homebridge API version
export const REQUIRED_HOMEBRIDGE_API = '^2.7';

// Default configuration options
export const DEFAULT_CONFIG: Partial<Config> = {
    pollIntervals: {
        // API limit of 5000 calls/day
        statusSeconds:          20 // 4320 calls/day
    },
    hideServices:               [],
    debug:                      []
};

// Allow API and authorization credentials to be set via environment variables
if (process.env.AEG_API_KEY)       DEFAULT_CONFIG.apiKey       = process.env.AEG_API_KEY;
if (process.env.AEG_ACCESS_TOKEN)  DEFAULT_CONFIG.accessToken  = process.env.AEG_ACCESS_TOKEN;
if (process.env.AEG_REFRESH_TOKEN) DEFAULT_CONFIG.refreshToken = process.env.AEG_REFRESH_TOKEN;