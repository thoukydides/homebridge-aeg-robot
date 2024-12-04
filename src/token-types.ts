// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2024 Alexander Thoukydides

// Access token header (Base64 URL decoded)
export interface AccessTokenHeader {
    kid:        string;     // Key ID (64 hexadecimal digits)
    alg:        string;     // Signing algorithm, e.g. 'RS256'
    typ:        string;     // Token type, e.g. 'JWT'
}

// Access token payload (Base64 URL decoded)
export interface AccessTokenPayload {
    iat:        number;     // Issued At (seconds since epoch)
    iss:        string;     // Issuer, e.g. 'https://api.ocp.electrolux.one/one-account-authorization'
    aud:        string;     // Audience, e.g. 'https://api.ocp.electrolux.one'
    exp:        number;     // Expiration Time (seconds since epoch)
    sub:        string;     // Subject (32 hexadecimal digits)
    azp:        string;     // Authorised Party, e.g. 'HeiOpenApi'
    scope:      string;     // Authorised scopes, e.g. 'email offline_access'
    occ:        string;     // Country code, e.g. 'GB'
}