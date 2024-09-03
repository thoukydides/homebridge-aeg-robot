// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Logger, LogLevel } from 'homebridge';
import { assertIsDefined } from './utils.js';

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
    info(message: string):    void { this.log(LogLevel.INFO,    message); }
    success(message: string): void { this.log(LogLevel.SUCCESS, message); }
    warn(message: string):    void { this.log(LogLevel.WARN,    message); }
    error(message: string):   void { this.log(LogLevel.ERROR,   message); }
    debug(message: string):   void { this.log(LogLevel.DEBUG,   message); }
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
        const replaceJWT = (match: string): string => isJWT(match) ? '<JSON_WEB_TOKEN>' : match;
        return message
            // User ID and access tokens
            .replace(/\b[\w-]+\.[\w-]+\.[\w-]+\b/g,             replaceJWT)
            // Username, password, and refresh tokens (within JSON encoded strings)
            .replace(/(?<="username":\s*")[^"]+(?=")/gi,        '<USERNAME>')
            .replace(/(?<="password":\s*")[^"]+(?=")/gi,        '<PASSWORD>')
            .replace(/(?<="refreshToken":\s*")[^"]+(?=")/gi,    '<REFRESH_TOKEN>');
    }
}

// Test whether a string is a JSON Web Token (JWT)
function isJWT(jwt: string): boolean {
    try {
        const encodedParts = jwt.split('.');
        if (encodedParts.length !== 3) return false;
        const parts = encodedParts.map(part => decodeBase64URL(part));
        assertIsDefined(parts[0]);
        assertIsDefined(parts[1]);
        JSON.parse(parts[0]);
        JSON.parse(parts[1]);
        return true;
    } catch {
        return false;
    }
}

// Decode a Base64URL encoded string
function decodeBase64URL(base64url: string): string {
    const paddedLength = base64url.length + (4 - base64url.length % 4) % 4;
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(paddedLength, '=');
    return Buffer.from(base64, 'base64').toString();
}