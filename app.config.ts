import type { ExpoConfig, ConfigContext } from "expo/config";

const APP_BUNDLE_ID = "com.capturexposample";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name!,
  slug: config.slug!,
  ios: {
    ...config.ios,
    bundleIdentifier: APP_BUNDLE_ID,
  },
  android: {
    ...config.android,
    package: APP_BUNDLE_ID,
  },
});
