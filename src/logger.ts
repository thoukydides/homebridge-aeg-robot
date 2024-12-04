// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Logger, LogLevel } from 'homebridge';

import { assertIsDefined, formatList, MS } from './utils.js';
import { checkers } from './ti/token-types.js';

// Mapping of applianceId values to their names
const applianceIds = new Map<string, string>();
const LENGTH = { pnc: 9, sn: 8, ai: 24 } as const;

// Regular expressions for different types of sensitive data
const filters: [(value: string) => string, RegExp][] = [
    [maskAPIKey,        /\w_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/],
    [maskAccessToken,   /\b[\w-]+\.[\w-]+\.[\w-]+\b/g],
    [maskRefreshToken,  /(?<="refreshToken":\s*")[^"]+(?=")/gi] // (within JSON)
];

// A logger with filtering and support for an additional prefix
export class PrefixLogger {

    // Log level used for debug messages
    debugLevel: LogLevel = LogLevel.DEBUG;

    // Create a new logger
    constructor(
        readonly logger:    Logger,
        readonly prefix?:   string
    ) {}

    // Wrappers around the standard Logger methods
    info   (message: string): void { this.log(LogLevel.INFO,    message); }
    success(message: string): void { this.log(LogLevel.SUCCESS, message); }
    warn   (message: string): void { this.log(LogLevel.WARN,    message); }
    error  (message: string): void { this.log(LogLevel.ERROR,   message); }
    debug  (message: string): void { this.log(LogLevel.DEBUG,   message); }
    log(level: LogLevel, message: string): void {
        // Allow debug messages to be logged as a different level
        if (level === LogLevel.DEBUG) level = this.debugLevel;

        // Mask any sensitive data within the log message
        message = PrefixLogger.filterSensitive(message);

        // Log each line of the message
        const prefix = this.prefix?.length ? `[${this.prefix}] ` : '';
        message.split('\n').forEach(line => { this.logger.log(level, prefix + line); });
    }

    // Log all DEBUG messages as INFO to avoid being dropped by Homebridge
    logDebugAsInfo(): void {
        this.debugLevel = LogLevel.INFO;
    }

    // Attempt to filter sensitive data within the log message
    static filterSensitive(message: string): string {
        return filters.reduce((message, [filter, regex]) =>
            message.replace(regex, filter), message);
    }

    // Add an applianceId to filter
    static addApplianceId(applianceId: string, name?: string): void {
        if (applianceIds.has(applianceId)) return;
        name ??= `SN${applianceIds.size + 1}`;
        const serialNumber = applianceId.slice(LENGTH.pnc, LENGTH.pnc + LENGTH.sn);
        applianceIds.set(applianceId, name);
        filters.push(
            [maskSerialNumber.bind(null, name), new RegExp(`\\b${serialNumber}\\b`, 'g')],
            [maskApplianceId .bind(null, name), new RegExp(`\\b${applianceId}\\b`, 'g')]
        );
    }
}

// Mask an Electrolux Group API Key
function maskAPIKey(apiKey: string): string {
    return maskToken('API_KEY', apiKey);
}

// Mask an Electrolux Group API refresh token
function maskRefreshToken(token: string): string {
    return maskToken('REFRESH_TOKEN', token);
}

// Mask a Home Connect access token
function maskAccessToken(token: string): string {
    try {
        const parts = token.split('.').map(part => decodeBase64URL(part));
        assertIsDefined(parts[0]);
        assertIsDefined(parts[1]);
        const header:  unknown = JSON.parse(parts[0]);
        const payload: unknown = JSON.parse(parts[1]);
        if (checkers.AccessTokenHeader.test(header)
         && checkers.AccessTokenPayload.test(payload)) {
            return maskToken('ACCESS_TOKEN', token, {
                issued:     new Date(payload.iat * MS).toISOString(),
                expires:    new Date(payload.exp * MS).toISOString(),
                scope:      payload.scope
            });
        }
        return maskToken('JSON_WEB_TOKEN', token);
    } catch {
        return token;
    }
}

// Mask a serial number
function maskSerialNumber(name: string, _serialNumber: string): string {
    return `<SERIAL_NUMBER: "${name}">`;
}

// Mask an applianceId
function maskApplianceId(name: string, applianceId: string): string {
    const pnc = applianceId.slice(0, LENGTH.pnc);
    return `<PRODUCT_ID: ${pnc}... "${name}">`;
}

// Mask a token, leaving just the first and final few characters
function maskToken(type: string, token: string, details: Record<string, string> = {}): string {
    let masked = `${token.slice(0, 4)}...${token.slice(-8)}`;
    const parts = Object.entries(details).map(([key, value]) => `${key}=${value}`);
    if (parts.length) masked += ` (${formatList(parts)})`;
    return `<${type}: ${masked}>`;
}

// Decode a Base64URL encoded string
function decodeBase64URL(base64url: string): string {
    const paddedLength = base64url.length + (4 - base64url.length % 4) % 4;
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(paddedLength, '=');
    return Buffer.from(base64, 'base64').toString();
}