// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2024 Alexander Thoukydides

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { Config } from './config-types.js';

// Read the package.json file
interface PackageJson {
    engines:        Record<string, string>;
    name:           string;
    displayName:    string;
    version:        string;
}
const PACKAGE_JSON = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const PACKAGE = JSON.parse(readFileSync(PACKAGE_JSON, 'utf-8')) as PackageJson;

// Platform identifiers
export const ENGINES        = PACKAGE.engines;
export const PLUGIN_NAME    = PACKAGE.name;
export const PLATFORM_NAME  = PACKAGE.displayName;
export const PLUGIN_VERSION = PACKAGE.version;

// Required Homebridge API version
export const REQUIRED_HOMEBRIDGE_API = '^2.7';

// Daily API rate limit, and lower value to use for polling
export const API_DAILY_LIMIT = 5000;
export const API_DAILY_POLL_LIMIT = API_DAILY_LIMIT * 0.9;

// Default configuration options
export const DEFAULT_CONFIG: Partial<Config> = {
    pollIntervals: {
        // API limit of 5000 calls/day
        statusSeconds:          30 // 2880 calls/day per robot vacuum cleaner
    },
    hideServices:               [],
    debug:                      []
};

// Allow API and authorization credentials to be set via environment variables
if (process.env.ELECTROLUX_API_KEY)       DEFAULT_CONFIG.apiKey       = process.env.ELECTROLUX_API_KEY;
if (process.env.ELECTROLUX_ACCESS_TOKEN)  DEFAULT_CONFIG.accessToken  = process.env.ELECTROLUX_ACCESS_TOKEN;
if (process.env.ELECTROLUX_REFRESH_TOKEN) DEFAULT_CONFIG.refreshToken = process.env.ELECTROLUX_REFRESH_TOKEN;