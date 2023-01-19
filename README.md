<p align="center">
  <img src="https://raw.githubusercontent.com/wiki/thoukydides/homebridge-aeg-robot/homebridge-aeg-robot.png" height="200"></a>
</p>
<span align=center>

# homebridge-aeg-robot

[![npm](https://badgen.net/npm/v/homebridge-aeg-robot)](https://www.npmjs.com/package/homebridge-aeg-robot)
[![npm](https://badgen.net/npm/dt/homebridge-aeg-robot)](https://www.npmjs.com/package/homebridge-aeg-robot)
[![npm](https://badgen.net/npm/dw/homebridge-aeg-robot)](https://www.npmjs.com/package/homebridge-aeg-robot)
[![Build and Lint](https://github.com/thoukydides/homebridge-aeg-robot/actions/workflows/build.yml/badge.svg)](https://github.com/thoukydides/homebridge-aeg-robot/actions/workflows/build.yml)

AEG RX 9 / Electrolux Pure i9 robot vacuum plugin for [Homebridge](https://github.com/homebridge/homebridge).

</span>

AEG, Electrolux, and Zanussi are trademarks of [AB Electrolux](https://www.electroluxgroup.com/).

## Installation

1. Use the [AEG](https://apps.apple.com/gb/app/aeg/id1599494494) app to add the RX series robot vacuum to your AEG/Electrolux/Zanussi account.
1. Install this plugin using: `npm install -g homebridge-aeg-robot`
1. Edit `config.json` and add the `Homebridge AEG Robot Vacuum` platform (see example below).
1. Run [Homebridge](https://github.com/homebridge/homebridge).

Alternatively, use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) to install and configure this plugin.

### Example `config.json`
```JSON
{
    "platforms":
    [{
        "platform": "Homebridge AEG Robot Vacuum",
        "username": "rx@gmail.com",
        "password": "Passw0rd!"
    }]
}
```
The `username` and `password` should match those used to login to your account in the [AEG](https://apps.apple.com/gb/app/aeg/id1599494494) iPhone app. All suitable robot vacuums associated with the account will be added to HomeKit (those reporting a model name of `PUREi9`). Unsupported appliances, such as air purifiers or RX8 robot vacuums, will be ignored.

### Advanced Configuration

Additional settings can be included in `config.json` to customise the behaviour or enable special debug features:
```JSON
{
    "platforms":
    [{
        "platform":       "Homebridge AEG Robot Vacuum",
        "username":       "rx@gmail.com",
        "password":       "Passw0rd!",
        "pollIntervals": {
            "statusSeconds":        5,
            "serverHealthSeconds":  60
        },
        "hideServices":   ["Battery", "Contact Sensor", "Fan", "Filter Maintenance", "Occupancy Sensor", "Switch Clean", "Switch Home"],
        "debug":          ["Run API Tests", "Run Unsafe API Tests", "Log API Headers", "Log API Bodies", "Log Debug as Info"]
    }]
}
```

The `pollIntervals` specify the time in seconds between successive polls of the AEG/Electrolux cloud API for appliance status updates (`statusSeconds`, default 5 seconds) or the health of the cloud servers (`serverHealthSeconds`, default 60 seconds).

Any unwanted HomeKit Services (except for the **Accessory Information**) created by this plugin can be disabled by listing them in the `hideServices` array.

Do not set any of the `debug` options unless attempting to investigating a compatibility issue or other problem.

## Compatibility

This plugin has only been tested with a single AEG RX9.2 robot vacuum (model `RX9-2-4ANM`, PNC `900 277 479`, running firmware `43.23`). The protocol was reverse-engineered from the the [AEG](https://apps.apple.com/gb/app/aeg/id1599494494) iPhone app (which replaced the [AEG Wellbeing](https://apps.apple.com/gb/app/aeg-wellbeing/id1494284929) app).

It will probably work with other AEG RX9.2 / Electrolux Pure i9.2 robot vacuums, although some fixes might be required for AEG RX9/RX9.1 / Electrolux Pure i9/i9.1 models. Older AEG RX8 / Electrolux Pure i8 robot vacuums are not supported.

## Functionality

This plugin allows cleaning to be started and paused, selection of cleaning power mode, and requesting return to the charging dock. It also indicates whether the robot vacuum is cleaning, on its dock, the battery charge status, and whether the dust collection bin requires emptying.

Unfortunately, HomeKit does not support robot vacuum cleaners, so the mapping of functionality to HomeKit Services and Characteristics is slightly odd as described below.

### Accessory Information

The **Accessory Information** Service provides information about the appliance and allows its name to be changed.
* **Manufacturer**: Brand name.
* **Model**: Model name (and model number).
* **Serial Number**: Serial number.
* **Hardware Revision**: The hardware platform version.
* **Firmware Revision**: The version of this plugin (set by Homebridge).
* **Software Revision**: The current firmware version.
* **Name**: The currently configured name for the appliance.
* **Configured Name**: The currently configured name for the appliance. Changing this also affects the name used within the AEG iPhone app.

### Battery

The **Battery** Service indicates the battery charge level and charging status.
* **Status Low Battery**: Indicates when the battery level is low:
    * *Battery Level Low* = Battery level is Low, Critically low, Dead, or cannot be determined.
    * *Battery Level Normal* = Battery level is Medium, High, or Fully charged.
* **Battery Level**: Reports the battery charge level as a percentage:
    * *0%* = Dead
    * *20%* = Critically low
    * *40%* = Low
    * *60%* = Medium
    * *80%* = High
    * *100%* = Fully charged
* **Charging State**: Indicates the robot's charging status:
    * *Charging* = Actively charging the battery.
    * *Not Charging* = Not currently charging. The robot may be on its charging dock, but with a fully charged battery.
    * *Not Chargeable* = Unable to determine the current status.

### Contact Sensor

The **Contact Sensor** Service is (ab)used to indicate when the robot is on its charging dock. (The **Occupancy Sensor** provides the same functionality using a different Service type.)
* **Contact Sensor State**: Indicates whether the robot is on its charging dock:
    * **Contact Detected** = On the charging dock (but not necessarily charging if the battery is full).
    * **Contact Not Detected** = Not on the charging dock, or unable to determine the current status.
* **Active**: Indicates that the robot is either performing a cleaning operation or ready to start one. Any of the following will result in it being considered inactive:
    * Any of the issues that are considered a **General Fault** (below).
    * Operation paused (either during cleaning or when returning to the charging dock).
    * Firmware update being applied.
* **Status Fault**: Indicates when there is any kind of problem with the robot:
    * **No Fault** = Communication with the robot has been established and it is not reporting a fault condition.
    * **General Fault** = There is a fault either with the robot or communication with it via the AEG/Electrolux cloud API servers. This includes:
        * Unable to authenticate with the AEG/Electrolux cloud API.
        * No recent successful response from the AEG/Electrolux cloud API.
        * AEG/Electrolux cloud API reported problems with one or more servers.
        * Robot has not been enabled in the AEG/Electrolux account.
        * Robot is not connected to the AEG/Electrolux cloud servers.
        * Robot is reporting an error condition.
        * Battery is dead.
        * Dust collection bin is either missing or full.
* **Status Low Battery**: Indicates when the battery level is low. (Same as on the **Battery** Service.)

### Fan

The **Fan** Service is (ab)used to start/stop cleaning and to adjust the cleaning power mode.
* **Active**: Starts or pauses/resumes a cleaning operation:
    * *Inactive* = Indicates that the robot is either not performing a cleaning operation or the current operation is paused. Setting this state will attempt to pause the current operation.
    * *Active* = Indicates that the robot is actively cleaning (including charging, or returning to the dock for charging, during a cleaning operation). Setting this state will attempt to resume a paused cleaning operation, or start a new cleaning operation.
* **Current Fan State**: Indicates whether the robot is actively cleaning: 
    * **Inactive** = Either not performing a cleaning operation or the current cleaning operation is paused.
    * **Idle** = Either returning to the charging dock or charging during a cleaning operation.
    * **Blowing Air** = Currently cleaning.
* **Rotation Speed**: The current cleaning power mode:
    * **0%** = Not performing a cleaning operation or the current operation is paused.
    * **25%** = Quiet (lower energy consumption and quieter).
    * **50%** = Smart (cleans quietly on hard surfaces, uses full power on carpets).
    * **100%** = Power (optimal cleaning performance, higher energy consumption).

### Filter Maintenance

The **Filter Maintenance** Service is (ab)used to indicate the dust collection bin status.
* **Filter Change Indication**:
    * *Change Filter* = Dust collection bin is either full or not present.
    * *Filter OK* = Dust collection bin is fitted and not full (or its status could not be determined).

### Occupancy Sensor

The **Occupancy Sensor** Service is (ab)used to indicate when the robot is on its charging dock. (The **Contact Sensor** provides the same functionality using a different Service type.)
* **Occupancy Detected**: Indicates whether the robot is on its charging dock:
    * **Occupancy Detected** = On the charging dock (but not necessarily charging if the battery is full).
    * **Occupancy Not Detected** = Not on the charging dock, or unable to determine the current status.
* **Active**: Indicates that the robot is performing a cleaning operation. (Same as on the **Contact Sensor** Service.)
* **Status Fault**: Indicates when there is any kind of problem with the robot. (Same as on the **Contact Sensor** Service.)
* **Status Low Battery**: Indicates when the battery level is low. (Same as on the **Battery** Service.)

### Switch: Clean

One **Switch** Service is used to start or pause/resume cleaning.
* **On**: Indicates that the robot is actively cleaning (including charging, or returning to the dock for charging, during a cleaning operation). Switching this on will attempt to resume a paused cleaning operation, or start a new cleaning operation. Switching it off will attempt to pause the current operation. (Similar to the **Active** characteristic on the **Fan** Service.)

### Switch: Home

Another **Switch** Service is used to (stop cleaning and) initiate a return to the charging dock.
* **On**: Indicates that the robot is returning to the charging dock (or its starting position) and will not resume cleaning after charging. Switching this on will attempt to stop any cleaning operation in progress and initiate a return to the charging dock. Switching it off will attempt to pause the current operation.

## Limitations

This is an early prototype. Functionality, configuration options, and mapping to HomeKit services, may change between releases. It may be necessary to manually delete Homebridge cache files and/or modify the `config.json` file when upgrading.

Only the AEG/Electrolux cloud API is supported. This plugin cannot communicate directly with the robot via a local network connection.

## Changelog

All notable changes to this project are documented in the [CHANGELOG.md](CHANGELOG.md) file.

## License

> ISC License (ISC)<br>Copyright © 2022-2023 Alexander Thoukydides
>
> Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.
>
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.