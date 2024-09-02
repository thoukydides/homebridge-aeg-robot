// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { API } from 'homebridge';

import { PLATFORM_NAME } from './settings.js';
import { AEGPlatform } from './platform.js';

// Register the platform with Homebridge
export default (api: API): void => {
    api.registerPlatform(PLATFORM_NAME, AEGPlatform);
};