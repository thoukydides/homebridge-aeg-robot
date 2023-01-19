// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

// Error response formats returned by the AEG RX 9 / Electrolux Pure i9 cloud API
export interface ErrorResponseMessageLC {
    message:            string;
    error?:             string;
}
export interface ErrorResponseMessageUC {
    Message:            string;
}
export interface ErrorDetails {
    [index: string]:    string[];
}
export interface ErrorResponseCode {
    code:               number;
    codeDescription:    string;
    details?:           ErrorDetails;
    message?:           string;
}