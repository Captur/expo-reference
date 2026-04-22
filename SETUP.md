# Captur Expo Reference App — Setup & Integration Guide

## Prerequisites

1. **Node.js** 20+ and **npm** 11+
2. **Android SDK** with NDK (for local Android builds)
3. **Xcode** 15+ (for local iOS builds, macOS only)
4. **Create an Expo account** at https://expo.dev/signup
5. Log in via CLI:
   ```bash
   npx eas-cli login
   ```
   Options:
   - `-b` / `--browser` — Log in via browser (useful if you have 2FA or prefer OAuth)
   - `-s` / `--sso` — Log in via SSO (if your organization uses SSO)

## Configuration

Copy the example config and edit with your values:

```bash
cp captur.config.example.js captur.config.js
```

Edit `captur.config.js`:

```js
const CAPTUR_API_KEY = "your-api-key";
const CAPTUR_BASE_URL = "https://your-base-url.com"; // or null for default
const APP_BUNDLE_ID = "com.yourcompany.yourapp";
```

| Variable | Description |
|----------|-------------|
| `CAPTUR_API_KEY` | Your Captur workspace API key |
| `CAPTUR_BASE_URL` | API gateway URL, or `null` for production default |
| `APP_BUNDLE_ID` | Used as both iOS `bundleIdentifier` and Android `package` |

> **Note:** `captur.config.js` is in `.gitignore` to avoid committing credentials. The example file `captur.config.example.js` is tracked.

## Install Dependencies

```bash
npm install
```

## Build

### Android dev client (local build)

```bash
npx eas-cli build --platform android --profile development --local
```

### iOS dev client (local build)

```bash
npx eas-cli build --platform ios --profile development --local
```

### Running the dev client

After installing the built APK/IPA on a device:

```bash
npx expo start --dev-client
```

### First run on Android

On a fresh install, the app should initialize correctly. If you see the error `"Model has compiled but local storage url not found"`, clear the app data:

```bash
adb shell pm clear <your.bundle.id>
```

See [Known Issue: Native SDK deletePreviousModels](#native-sdk-deletepreviousmodels-bug) below.

---

## Project Architecture

### File Overview

```
captur.config.js            # Your credentials (gitignored)
captur.config.example.js    # Template with placeholders (tracked)
app.json                    # Static Expo config (EAS-writable)
app.config.ts               # Dynamic overlay — injects bundle ID from captur.config.js
plugins/captur-plugin.js    # Expo config plugin — Android deps, manifest, iOS permissions
captur-ai-captur-react-native-events-0.7.0.tgz   # Captur RN package (tarball)
.easignore                  # Controls what EAS copies to temp build dir
.npmrc                      # npm config (install-links=true)
```

### How the Captur package is embedded

The Captur React Native Events package is distributed as an **npm tarball** (`.tgz`), referenced in `package.json`:

```json
"@captur-ai/captur-react-native-events": "file:./captur-ai-captur-react-native-events-0.7.0.tgz"
```

On `npm install` / `npm ci`, npm extracts the tarball into `node_modules/@captur-ai/captur-react-native-events/` as a **real directory** (not a symlink). This is critical for EAS builds — see [Known Issue: npm file: protocol](#npm-file-protocol-creates-symlinks).

### How native Android dependencies are injected

The Captur RN package includes a pre-built Android AAR (`capturMicroMobility-release.aar`) but its transitive native dependencies (CameraX, LiteRT, Retrofit, etc.) must be declared at the app level. The Expo config plugin (`plugins/captur-plugin.js`) handles this by injecting dependencies into the generated `app/build.gradle` during prebuild.

### Config file architecture

Expo requires a **static** config file (`app.json`) for EAS to write metadata like `projectId`. Dynamic values (bundle ID) are overlayed via `app.config.ts`, which imports from `captur.config.js`.

`captur.config.js` uses **CommonJS** (`module.exports`) because Expo's config loader cannot resolve `.ts` imports from other `.ts` files.

---

## Known Issues & Solutions

### npm file: protocol creates symlinks

**Problem:** Using `"file:./packages/some-package"` (directory reference) in `package.json` causes npm to create a **symlink** in `node_modules/` pointing to the source directory. In EAS builds, the project is copied to a temp directory, and symlinks pointing outside the copied tree break.

**Solution:** Use a **tarball** reference instead: `"file:./package-name-0.7.0.tgz"`. npm extracts tarballs as real directories.

**Gotcha:** If a `packages/` directory with matching content exists alongside the tarball, npm will prefer the symlink approach. Remove any local `packages/` directory to ensure the tarball is extracted.

> `.npmrc` with `install-links=true` did **not** resolve this with npm 11.

---

### .easignore completely replaces .gitignore

**Problem:** When an `.easignore` file exists, EAS CLI uses it **instead of** `.gitignore` to determine what files to copy to the temp build directory. It does not merge or layer them.

**Consequence:** If `android/` and `ios/` are in `.gitignore` but not in `.easignore`, stale prebuild output gets copied to the EAS temp directory. EAS then treats the project as a "bare" project (skips prebuild), and the stale Gradle files fail against the fresh `node_modules`.

**Solution:** Include `android/` and `ios/` in `.easignore` so EAS triggers Continuous Native Generation (CNG) via `expo prebuild`.

---

### expo-router pulls wrong expo-constants version

**Problem:** `expo-router` declares `"expo-constants": "*"` as a peer dependency. npm resolves this to the **latest** version from the registry (e.g., v55.x), which is incompatible with Expo SDK 53. This version's Gradle scripts reference properties (`projectRoot` on `ExpoGradleExtension`) that don't exist in SDK 53's autolinking plugin.

**Error:**
```
Could not get unknown property 'projectRoot' for extension 'expoGradle'
of type expo.modules.plugin.ExpoGradleExtension
```

**Solution:** Explicitly pin `expo-constants` in `package.json`:
```json
"expo-constants": "~17.1.8"
```

---

### AAR resolution: flatDir fails in EAS

**Problem:** The Captur RN package's `android/build.gradle` originally used:
```gradle
repositories { flatDir { dirs 'libs' } }
dependencies { implementation(name: 'capturMicroMobility-release', ext: 'aar') }
```
This `flatDir` + named-AAR pattern fails to resolve in EAS temp build environments.

**Solution:** The tarball's `build.gradle` has been patched to use a direct file reference:
```gradle
implementation(files('libs/capturMicroMobility-release.aar'))
```
The `files()` function resolves relative to the module's project directory, which works in any build environment.

---

### TFLite / LiteRT dependency mismatch

**Problem:** The Captur native SDK (AAR) is compiled against `com.google.ai.edge.litert` (the rebranded TensorFlow Lite). Using the old `org.tensorflow:tensorflow-lite` packages causes runtime failures:
- `NoClassDefFoundError: Lorg/tensorflow/lite/Interpreter$Options` — wrong TFLite core package
- `Failed to return labels from labels.txt` — missing `MetadataExtractor` class (requires `litert-metadata`)

**Solution:** Use all three LiteRT packages at compatible versions:
```gradle
implementation("com.google.ai.edge.litert:litert:1.4.2")
implementation("com.google.ai.edge.litert:litert-support:1.4.2")
implementation("com.google.ai.edge.litert:litert-metadata:1.4.2")
```

Do **not** use:
- `org.tensorflow:tensorflow-lite` (old package, different artifact)
- `org.tensorflow:tensorflow-lite-task-vision` (pulls wrong transitive deps)
- `org.tensorflow:tensorflow-lite-support` (doesn't include metadata extractor)

---

### 16KB page size alignment

**Problem:** Google Play requires all 64-bit native libraries to use 16KB ELF page alignment (Android 15+). The library `libimage_processing_util_jni.so` ships with 4KB alignment from **`androidx.camera:camera-core`** versions prior to 1.4.0.

**How to verify:**
```bash
./verify-16kb-alignment.sh build-output.apk
```

**Solution:** Use CameraX 1.4.0+ (the fix was in `1.4.0-beta02`):
```gradle
implementation("androidx.camera:camera-core:1.4.1")
implementation("androidx.camera:camera-camera2:1.4.1")
implementation("androidx.camera:camera-lifecycle:1.4.1")
implementation("androidx.camera:camera-view:1.4.1")
```

> **Note:** `litert-support` versions prior to ~1.4.2 also ship a non-aligned copy of this same `.so`. Ensure LiteRT is at 1.4.2+ as well.

---

### Native SDK deletePreviousModels bug

**Problem:** The Captur native SDK's `CapturModelManagement.deletePreviousModels()` iterates the model slug history and deletes **all** model files — including the one that was just downloaded. This happens when the same model slug appears in the history (e.g., the model version hasn't changed but the etag has).

**Sequence:**
1. Model downloads successfully (MD5 verified)
2. `deletePreviousModels()` runs, finds the same slug in history, deletes the just-downloaded `.tflite` file
3. `initializeModel()` fails with: `"Model has compiled but local storage url not found"`

**Root cause:** `deletePreviousModels()` does not exclude the current slug from deletion. The function should add `if (modelSlug.slug == slug) return@forEach` before deleting.

**Workaround:** Clear the app's data before running. With empty history, the first run succeeds:
```bash
adb shell pm clear <your.bundle.id>
```

**Permanent fix:** Requires a code change in the native SDK (`CapturModelManagement.kt`).

---

## Updating the Captur Package

To update the embedded Captur package:

1. Obtain the new tarball (e.g., via `npm pack` in the captur-react-native-events repo)
2. Verify the tarball's `android/build.gradle` uses:
   - `implementation(files('libs/capturMicroMobility-release.aar'))` (not `flatDir`)
   - `com.google.ai.edge.litert:litert*:1.4.2` (not `org.tensorflow:tensorflow-lite*`)
   - `androidx.camera:camera-*:1.4.1+`
3. Replace the `.tgz` file in the project root
4. Update the version in `package.json` if the filename changed
5. Run `rm -rf node_modules package-lock.json && npm install`
6. Rebuild
