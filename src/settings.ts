// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

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
        statusSeconds:          5,
        serverHealthSeconds:    60,
        feedSeconds:            5 * 60,
        cleanedAreasSeconds:    60
    },
    hideServices:               [],
    debug:                      []
};

// Allow user credentials to be set via environment variables
if (process.env.AEG_USERNAME) DEFAULT_CONFIG.username = process.env.AEG_USERNAME;
if (process.env.AEG_PASSWORD) DEFAULT_CONFIG.password = process.env.AEG_PASSWORD;

// 'AEG' iPhone app user agent
export const AEG_APP            = 'oneApp'; // or 'wellbeing'
export const AEG_API_URL        = 'https://api.ocp.electrolux.one';
export const AEG_API_KEY        = 'PEdfAP7N7sUc95GJPePDU54e2Pybbt6DZtdww7dz';
export const AEG_CLIENT_ID      = 'AEGOneApp';
export const AEG_CLIENT_SECRET  = 'G6PZWyneWAZH6kZePRjZAdBbyyIu3qUgDGUDkat7obfU9ByQSgJPNy8xRo99vzcgWExX9N48gMJo3GWaHbMJsohIYOQ54zH2Hid332UnRZdvWOCWvWNnMNLalHoyH7xU'; // eslint-disable-line max-len