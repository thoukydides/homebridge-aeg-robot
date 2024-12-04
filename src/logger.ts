// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Logger, LogLevel } from 'homebridge';

import { assertIsDefined, formatList, MS } from './utils.js';
import { checkers } from './ti/token-types.js';

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
        return message
            .replace(/\w_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, maskAPIKey)
            .replace(/\b[\w-]+\.[\w-]+\.[\w-]+\b/g,                                     maskAccessToken)
            .replace(/\b[a-zA-Z0-9]{128}\b/g,                                           maskRefreshToken)
            // Refresh tokens (within JSON encoded strings)
            .replace(/(?<="refreshToken":\s*")[^"]+(?=")/gi,                            maskRefreshToken);
    }
}

// Mask an Electrolux Group API Key
function maskAPIKey(apiKey: string): string {
    return maskToken('API_KEY', apiKey);
}

// Mask an Electrolux Group API refresh token
function maskRefreshToken(apiKey: string): string {
    return maskToken('REFRESH_TOKEN', apiKey);
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