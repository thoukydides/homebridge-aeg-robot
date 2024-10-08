// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Logger } from 'homebridge';

import nodePersist from 'node-persist';
import { setTimeout } from 'node:timers/promises';
import { once } from 'node:events';

import { AbsoluteTokens, PostTokenRefresh, PostTokenRevoke, Tokens } from './aegapi-auth-types.js';
import { AEGUserAgent, Headers, Method, Request, UAOptions } from './aegapi-ua.js';
import { MS, logError } from './utils.js';
import { AEGAPIAuthorisationError, AEGAPIError, AEGAPIStatusCodeError } from './aegapi-error.js';
import { Config } from './config-types.js';
import { checkers } from './ti/aegapi-auth-types.js';

// Time before token expiry to request a refresh
const REFRESH_WINDOW_MS = 60 * 60 * 1000; // (60 minutes)

// Delay between retrying failed authorisation operations
const REFRESH_RETRY_DELAY_MS = 60 * 1000; // (1 minute)

// Delay before refreshing a new token (expiresIn is usually 12 hours)
const NEW_TOKEN_REFRESH_DELAY_MS = 5 * 60 * 1000; // (5 minutes)

// Authorisation for accessing the Electrolux Group API
export class AEGAuthoriseUserAgent extends AEGUserAgent {

    // Promise that is resolved by successful (re)authorisation
    private authorised: Promise<void>;
    private authorisedFn!: { resolve: () => void; reject: (reason: unknown) => void };

    // Abort signal used to trigger immediate token refresh
    private refreshAbortController?: AbortController;

    // The current access and refresh token
    private token!: AbsoluteTokens;

    // Name of the key used for persistent storage of the access token
    private readonly persistKey: string;

    // Create a new authorisation agent
    constructor(log: Logger, config: Config) {
        super(log, config);

        // Invalidate stored token with any change of configured credentials
        this.persistKey = [config.apiKey, config.accessToken, config.refreshToken].join(':');

        // Authorise the user agent
        this.authorised = this.makeAuthPromise();
        void this.authoriseUserAgent();
    }

    // Construct a Promise indicating when (re)authorisation is complete
    makeAuthPromise(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.authorisedFn = { resolve, reject };
        });
    }

    // Attempt to authorise access to the API
    async authoriseUserAgent(): Promise<void> {
        // Retrieve any saved tokens
        if (!await this.loadTokens()) {
            this.log.info('No saved access token; using credentials from configuration');
            await this.saveTokens(this.config.accessToken, this.config.refreshToken, NEW_TOKEN_REFRESH_DELAY_MS);
            this.authorisedFn.resolve();
        } else if (Date.now() + REFRESH_WINDOW_MS < this.token.expiresAt) {
            this.log.info('Using saved access token');
            this.authorisedFn.resolve();
        } else {
            this.log.info('Saved access token has expired');
        }

        // Repeat authorisation whenever necessary
        await this.periodicallyRefreshTokens();
    }

    // Periodically refresh the tokens
    async periodicallyRefreshTokens(): Promise<void> {
        for (;;) {
            try {
                // Wait until the access token is nearly due to expire
                this.refreshAbortController = new AbortController();
                const { signal } = this.refreshAbortController;
                const refreshIn = this.token.expiresAt - Date.now() - REFRESH_WINDOW_MS;
                try { await setTimeout(refreshIn, undefined, { signal }); } catch { /* empty */ }
                this.refreshAbortController = undefined;

                // Refresh the tokens (updates both access token and refresh token)
                const token = await this.tokenRefresh(this.token.refreshToken);
                await this.saveTokens(token.accessToken, token.refreshToken, token.expiresIn);

                // Save the updated token
                this.log.info('Successfully refreshed access token');
                await nodePersist.setItem(this.persistKey, this.token);
                this.authorisedFn.resolve();

            } catch (cause) {
                if (cause instanceof AEGAPIStatusCodeError && cause.response
                    && [401, 403].includes(cause.response.statusCode)) {
                    // Unable to refresh tokens due to bad credentials
                    const message = 'Authorisation failed due to bad credentials (API Key or Refresh Token)';
                    const err = new AEGAPIAuthorisationError(cause.request, cause.response, message, { cause });
                    // HERE - This crashes if nothing is waiting for the promise...
                    this.authorisedFn.reject(err);
                    logError(this.log, 'API authorisation', err);
                    return;
                }

                // Try to refresh the tokens after a short delay
                logError(this.log, 'API authorisation', cause);
                await setTimeout(REFRESH_RETRY_DELAY_MS);
            }
        }
    }

    // Attempt to retrieve saved tokens
    async loadTokens(): Promise<boolean> {
        try {
            const token: unknown = await nodePersist.getItem(this.persistKey);
            if (token === undefined) return false;
            if (!checkers.AbsoluteTokens.test(token)) throw new Error('Unexpected saved token format');
            this.token = token;
            return true;
        } catch (err) {
            logError(this.log, 'Saved authorisation', err);
            return false;
        }
    }

    // Save new tokens, with an absolute expiry time
    async saveTokens(accessToken: string, refreshToken: string, expiresIn: number): Promise<void> {
        const expiresAt = Date.now() + expiresIn * MS;
        this.token = { accessToken, refreshToken, expiresAt };
        await nodePersist.setItem(this.persistKey, this.token);
    }

    // Authorization header value for the current access token
    get authorizationHeader(): string {
        return `Bearer ${this.token.accessToken}`;
    }

    // Trigger an immediate token refresh
    triggerRefresh(headers: Headers): void {
        if (this.refreshAbortController !== undefined
            && headers.authorization === this.authorizationHeader) {
            this.log.warn('Token refresh required...');
            this.refreshAbortController.abort();
            this.refreshAbortController = undefined;
            this.authorised = this.makeAuthPromise();
        }
    }

    // Add an Authorization header to request options
    async prepareRequest(method: Method, path: string, options?: UAOptions,
                         body?: object, headers?: Headers): Promise<Request> {
        const request = await super.prepareRequest(method, path, options, body, headers);

        // Wait for client to be authorised, unless this is an authorisation request
        if (!options?.isAuthRequest) {
            try {
                const promises = [this.authorised];
                const signal = options?.signal;
                if (signal !== undefined) {
                    if (signal.aborted) throw signal.reason;
                    promises.push((async (): Promise<never> => { throw await once(signal, 'abort'); })());
                }
                await Promise.race(promises);
            } catch (err) {
                if (!(err instanceof AEGAPIError)) throw err;
                const cause = err.errCause;
                throw new AEGAPIAuthorisationError(err.request, err.response, err.message, { cause });
            }
        }

        // Set the Authorization header
        request.headers.authorization = this.authorizationHeader;

        // Return the modified request options
        return request;
    }

    // Refresh tokens if a request returned a 403 Forbidden status
    canRetry(err: unknown, options?: UAOptions): boolean {
        let retry = super.canRetry(err, options);
        if (err instanceof AEGAPIStatusCodeError && err.response) {
            const headers = err.request.headers;
            switch (err.response.statusCode) {
            case 400:
                // Bad Request: Might be due to Access Token not being a JWT
                if (err.text.includes('JWT could not be decoded properly')) {
                    if (retry) this.log.warn('Request will no be retried (Access Code is not a JWT)');
                    retry = false;
                }
                break;
            case 401:
                // Unauthorised: Access Token (or Refresh Token) is probably invalid
                this.triggerRefresh(headers);
                break;
            case 403:
                // Forbidden: The API Key is probably invalid
                if (retry) this.log.warn('Request will not be retried (API Key possibly invalid)');
                retry = false;
            }
        }
        return retry;
    }

    // Refresh access token and refresh token
    async tokenRefresh(refreshToken: string): Promise<Tokens> {
        const body: PostTokenRefresh = { refreshToken };
        return this.postJSON(checkers.Tokens, '/api/v1/token/refresh', body, { isAuthRequest: true });
    }

    // Revoke refresh token
    async tokenRevoke(refreshToken: string): Promise<void> {
        const body: PostTokenRevoke = { refreshToken };
        await this.post('/api/v1/token/revoke', body, { isAuthRequest: true });
    }
}