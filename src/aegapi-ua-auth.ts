// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Logger } from 'homebridge';
import { getItem, setItem } from 'node-persist';
import { CheckerT, createCheckers } from 'ts-interface-checker';

import { AuthToken, AuthUser, PostAuthTokenClient, PostAuthTokenExchange,
         PostAuthTokenRefresh, PostAuthTokenRevoke, PostAuthToken, PostAuthUser,
         AbsoluteAuthToken } from './aegapi-auth-types';
import { AEGUserAgent, Headers, Method, Request, UAOptions } from './aegapi-ua';
import { logError, sleep } from './utils';
import { AEG_CLIENT_ID, AEG_CLIENT_SECRET } from './settings';
import { AEGAPIAuthorisationError, AEGAPIError,
         AEGAPIStatusCodeError } from './aegapi-error';
import { Config } from './config-types';
import aegapiTI from './ti/aegapi-auth-types-ti';

// Checkers for API responses
const checkers = createCheckers(aegapiTI) as {
    AbsoluteAuthToken:  CheckerT<AbsoluteAuthToken>;
    AuthToken:          CheckerT<AuthToken>;
    AuthUser:           CheckerT<AuthUser>;
};

// Authorisation for accessing the AEG RX 9 / Electrolux Pure i9 cloud API
export class AEGAuthoriseUserAgent extends AEGUserAgent {

    // Time before token expiry to request a refresh
    private readonly refreshWindow  = 60 * 60 * 1000; // (milliseconds)

    // Delay between retrying failed authorisation operations
    private readonly authRetryDelay =      60 * 1000; // (milliseconds)

    // Promise that is resolved by successful (re)authorisation
    private authorised: Promise<void>;
    private authorisedFn!: { resolve: () => void; reject: (reason: unknown) => void};

    // Abort signal used to abandon token refreshing
    private reauthorise?: () => void;

    // The current access and refresh token
    private token?: AbsoluteAuthToken;

    // Name of the key used for persistent storage of the token
    private readonly persistKey = `${this.config.username}:${this.config.password}`;

    // Create a new authorisation agent
    constructor(log: Logger, config: Config) {
        super(log, config);
        this.authorised = this.makeAuthPromise();
        this.authoriseUserAgent();
    }

    // Construct a Promise indicating when (re)authorisation is complete
    makeAuthPromise(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.authorisedFn = { resolve, reject };
        });
    }

    // Construct a Promise used to abort token refreshing
    makeAbortRefreshPromise(reason: unknown): Promise<never> {
        return new Promise((_, reject) => {
            this.reauthorise = () => {
                this.log.warn('Reauthorisation required...');
                this.reauthorise = undefined;
                this.authorised = this.makeAuthPromise();
                reject(reason);
            };
        });
    }

    // Attempt to authorise access to the API
    async authoriseUserAgent(): Promise<void> {
        // Retrieve any saved authorisation
        try {
            const token = await getItem(this.persistKey);
            if (checkers.AbsoluteAuthToken.test(token)) {
                this.token = token;
                if (Date.now() + this.refreshWindow < this.token.expiresAt) {
                    this.log.info('Using saved access token');
                    this.authorisedFn.resolve();
                } else {
                    this.log.info('Saved access token has expired');
                }
            }
        } catch (err) {
            logError(this.log, 'Saved authorisation', err);
        }

        // Repeat authorisation whenever necessary
        for (;;) {
            try {
                // If there is no current token then (re)authorise
                while (!this.token || !this.token.refreshToken) {
                    this.log.info('Starting new authorisation');
                    await this.performAuthorisation();
                }

                // Periodically refresh the token
                const abort = this.makeAbortRefreshPromise('reauthorise');
                const expiresIn = this.token.expiresAt - Date.now();
                await sleep(expiresIn - this.refreshWindow, abort);

                // Refresh the token
                await this.tokenRefresh(this.token.refreshToken);

                // Save the updated token
                this.log.info('Successfully refreshed access token');
                await setItem(this.persistKey, this.token);
                this.authorisedFn.resolve();

            } catch (cause) {
                if (cause !== 'reauthorise') {
                    logError(this.log, 'API authorisation', cause);
                    if (cause instanceof AEGAPIAuthorisationError) {
                        return; // Give-up (wrong credentials)
                    }
                }

                // Try to reauthorise after a short delay
                this.token = undefined;
                await sleep(this.authRetryDelay);
            }
        }
    }

    // Attempt to authorise access to the API
    async performAuthorisation(): Promise<void> {
        let usedCredentials!: string;
        try {
            // Authorise the client
            usedCredentials = 'client identifier/secret or API key';
            await this.authenticateClient();

            // Authorise the user
            usedCredentials = 'username or password';
            const user = await this.authenticateUser(this.config.username,
                                                     this.config.password);

            // Swap the user authorisation for access and refresh tokens
            usedCredentials = 'credentials';
            await this.tokenExchange(user);

            // Save the new token
            this.log.info('Successfully obtained access token');
            await setItem(this.persistKey, this.token);
            this.authorisedFn.resolve();

        } catch (cause) {
            if (cause instanceof AEGAPIStatusCodeError && cause.response
                && [401, 403].includes(cause.response.statusCode)) {
                const message = `Authorisation failed due to wrong ${usedCredentials}`;
                const err = new AEGAPIAuthorisationError(cause.request, cause.response, message, { cause });
                this.authorisedFn.reject(err);
                throw err;
            } else {
                throw cause;
            }
        }
    }

    // Authorise the client
    authenticateClient(): Promise<void> {
        const body: PostAuthTokenClient = {
            grantType:      'client_credentials',
            clientId:       AEG_CLIENT_ID,
            clientSecret:   AEG_CLIENT_SECRET,
            scope:          ''
        };
        return this.tokenUpgrade(body);
    }

    // Exchange a user token for an access token
    tokenExchange(user: AuthUser): Promise<void> {
        const body: PostAuthTokenExchange = {
            grantType:  'urn:ietf:params:oauth:grant-type:token-exchange',
            clientId:   AEG_CLIENT_ID,
            idToken:    user.idToken,
            scope:      ''
        };
        const options = {
            headers: { 'Origin-Country-Code': user.countryCode }
        };
        return this.tokenUpgrade(body, options);
    }

    // Refresh an access token
    tokenRefresh(refreshToken: string): Promise<void> {
        const body: PostAuthTokenRefresh = {
            grantType:      'refresh_token',
            clientId:       AEG_CLIENT_ID,
            refreshToken:   refreshToken,
            scope:          ''
        };
        return this.tokenUpgrade(body);
    }

    // Obtain a new token and use it to update the Authorization header
    async tokenUpgrade(body: PostAuthToken, options?: UAOptions): Promise<void> {
        // Obtain the token
        const path = '/one-account-authorization/api/v1/token';
        options = {...{ isAuthRequest: true }, ...options};
        const token = await this.postJSON<AuthToken>(checkers.AuthToken, path, body, options);

        // Convert to an absolute expiry time
        this.token = {
            authorizationHeader:    `${token.tokenType} ${token.accessToken}`,
            refreshToken:           token.refreshToken,
            expiresAt:              Date.now() + token.expiresIn * 1000
        };
    }

    // Revoke an access token
    tokenRevoke(refreshToken: string): Promise<void> {
        const body: PostAuthTokenRevoke = {
            token:      refreshToken,
            revokeAll:  false
        };
        const path = '/one-account-authorization/api/v1/token/revoke';
        return this.post(path, body, { isAuthRequest: true });
    }

    // Authenticate the user to obtain a user token
    authenticateUser(username: string, password: string): Promise<AuthUser> {
        const body: PostAuthUser = { username, password };
        const path = '/one-account-authentication/api/v1/authenticate';
        return this.postJSON(checkers.AuthUser, path, body, { isAuthRequest: true });
    }

    // Add an Authorization header to request options
    async prepareRequest(method: Method, path: string, options?: UAOptions,
                         body?: object, headers?: Headers): Promise<Request> {
        const request = await super.prepareRequest(method, path, options, body, headers);

        // Wait for client to be authorised, unless this is an authorisation request
        if (!options?.isAuthRequest) {
            try {
                await this.authorised;
            } catch (err) {
                if (!(err instanceof AEGAPIError)) throw err;
                const cause = err.errCause;
                throw new AEGAPIAuthorisationError(err.request, err.response, err.message, { cause });
            }
        }

        // Set the Authorization header
        if (this.token?.authorizationHeader) {
            const headers = request.headers;
            headers.authorization = this.token.authorizationHeader;
        }

        // Return the modified request options
        return request;
    }

    // Restart authorisation if a request returned a 403 Forbidden status
    canRetry(err: unknown, options?: UAOptions): boolean {
        let retry = super.canRetry(err, options);
        if (err instanceof AEGAPIStatusCodeError && err.response) {
            const headers = err.request.headers;
            switch (err.response.statusCode) {
            case 401:
                // Client ID/secret, username/password, or API key are incorrect
                if (retry) this.log.warn('Request will not be retried (incorrect credentials)');
                retry = false;
                break;
            case 403:
                // The access token is probably invalid
                if (headers.authorization === this.token?.authorizationHeader) {
                    this.reauthorise?.();
                }
                break;
            }
        }
        return retry;
    }
}