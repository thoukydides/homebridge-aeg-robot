// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { API } from 'homebridge';

import { PLATFORM_NAME } from './settings';
import { AEGPlatform } from './platform';

// Register the platform with Homebridge
export default (api: API) => { api.registerPlatform(PLATFORM_NAME, AEGPlatform); };