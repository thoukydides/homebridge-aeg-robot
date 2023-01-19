// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

// POST /one-account-authorization/api/v1/token
export interface PostAuthTokenBase {
    grantType:                  string;     // e.g. 'client_credentials'
    clientId:                   string;     // e.g. 'AEGOneApp'
    scope:                      string;     // e.g. ''
}
export interface PostAuthTokenClient extends PostAuthTokenBase {
    grantType:                  'client_credentials';
    clientSecret:               string;     // e.g. 'G6PZWyneWAZH6kZePRjZAdBbyyI...'
}
export interface PostAuthTokenExchange extends PostAuthTokenBase {
    grantType:                  'urn:ietf:params:oauth:grant-type:token-exchange';
    idToken:                    string;     // AuthUser.idToken
}
export interface PostAuthTokenRefresh extends PostAuthTokenBase {
    grantType:                  'refresh_token';
    refreshToken:               string;     // AuthToken.refreshToken
}
export type PostAuthToken = PostAuthTokenClient | PostAuthTokenExchange | PostAuthTokenRefresh;
export interface AuthToken {
    accessToken:                string;
    refreshToken?:              string;
    expiresIn:                  number;     // e.g. 43200 (seconds)
    tokenType:                  string;     // e.g. 'Bearer'
    scope:                      string;     // e.g. '' or 'email offline_access eluxiot:*:*:*'
}

// POST /one-account-authorization/api/v1/token/revoke
export interface PostAuthTokenRevoke {
    token:                      string;     // AuthToken.refreshToken
    revokeAll:                  boolean;
}

// POST /one-account-authentication/api/v1/authenticate
export interface PostAuthUser {
    username:                   string;     // e.g. 'rx@gmail.com'
    password:                   string;     // e.g. 'Passw0rd!'
}
export interface AuthUser {
    uid:                        string;
    idToken:                    string;
    countryCode:                string;     // e.g. 'GB'
    dataCenter:                 string;     // e.g. 'EU'
}

// Storage format for a token (with an absolute expiry time)
export interface AbsoluteAuthToken {
    authorizationHeader?:   string;
    refreshToken?:          string;
    expiresAt:              number;
}