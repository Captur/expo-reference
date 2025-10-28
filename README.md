## Captur SDK Expo Reference Implementation

This repository provides a reference implementation for integrating the Captur SDK into an Expo application.

#### Supported Versions

Expo SDK: 53 and 54 only

#### Overview

The Captur SDK integration requires a custom plugin to:

- Add necessary Android Gradle dependencies
- Configure permissions for both Android and iOS
- Resolve allowBackup conflicts on Android

## Installation

1.  Install the Captur SDK package `npm install @captur-ai/captur-react-native-events`
2.  Create the plugin file ( found in `/plugins/captur-plugin.js` )
3.  Add the plugin to your app.json ( see app.json )
4.  Run `npx expo prebuild --clean`
5.  SDK usage found in `app.tsx`

Note: You might have other plugins that modify gradle and manifest files, make sure that it doesn't conflict with captur-plugin.js.

### Note

There will be no separate repo for expo support; Expo SDK is built on top of react-native so our react-native repo is the only thing that's needed. no need to maintain different versions.
