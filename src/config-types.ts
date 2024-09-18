// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2024 Alexander Thoukydides

// Interval between polling for status changes
export interface PollIntervals {
    statusSeconds:          number;
}

// Services that can be hidden
export type HideService = 'Battery' | 'Contact Sensor' | 'Fan'
                        | 'Filter Maintenance' | 'Occupancy Sensor'
                        | 'Switch Clean' | 'Switch Home';

// Debugging features
export type DebugFeatures = 'Run API Tests' | 'Run Unsafe API Tests'
                          | 'Log API Headers' | 'Log API Bodies'
                          | 'Log Debug as Info';

// The user plugin configuration
export interface Config {
    // Fields required by Homebridge
    platform:               string;
    // Fields used by this plugin
    apiKey:                 string;
    accessToken:            string;
    refreshToken:           string;
    pollIntervals:          PollIntervals;
    hideServices:           HideService[];
    debug:                  DebugFeatures[];
}