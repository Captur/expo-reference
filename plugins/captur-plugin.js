const {
  withAppBuildGradle,
  withInfoPlist,
  withAndroidManifest,
  withPodfile,
} = require("@expo/config-plugins");

function withCapturPlugin(config) {
  // Add iOS camera permissions
  config = withInfoPlist(config, (config) => {
    config.modResults.NSCameraUsageDescription =
      config.modResults.NSCameraUsageDescription ||
      "This app needs camera access for Captur functionality";
    return config;
  });

  // Fix Android manifest conflicts
  config = withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;

    // Add tools namespace if not present
    if (!androidManifest.manifest.$) {
      androidManifest.manifest.$ = {};
    }
    if (!androidManifest.manifest.$["xmlns:tools"]) {
      androidManifest.manifest.$["xmlns:tools"] =
        "http://schemas.android.com/tools";
    }

    // Add tools:replace for allowBackup to resolve conflict
    if (
      androidManifest.manifest.application &&
      androidManifest.manifest.application[0]
    ) {
      const application = androidManifest.manifest.application[0];
      if (!application.$) {
        application.$ = {};
      }
      application.$["tools:replace"] = "android:allowBackup";
    }

    return config;
  });

  // Workaround for fmt consteval error on Xcode 26+.
  // Must run AFTER react_native_post_install which sets c++20 on all targets.
  config = withPodfile(config, (config) => {
    let contents = config.modResults.contents;

    const fmtSnippet = [
      "",
      "    # Workaround for fmt consteval error on Xcode 26+",
      "    # Must run after react_native_post_install which sets c++20 on all targets",
      "    installer.pods_project.targets.each do |target|",
      "      if target.name == 'fmt'",
      "        target.build_configurations.each do |config|",
      "          config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'",
      "        end",
      "      end",
      "    end",
    ].join("\n");

    // Find react_native_post_install(...) call and its closing paren,
    // then insert our snippet immediately after it.
    const rnPostInstallEnd = contents.indexOf("react_native_post_install(");
    if (rnPostInstallEnd !== -1) {
      // Find the closing ')' of react_native_post_install(...)
      let parenDepth = 0;
      let insertIndex = -1;
      for (let i = rnPostInstallEnd; i < contents.length; i++) {
        if (contents[i] === "(") parenDepth++;
        if (contents[i] === ")") {
          parenDepth--;
          if (parenDepth === 0) {
            insertIndex = i + 1;
            break;
          }
        }
      }
      if (insertIndex !== -1) {
        contents =
          contents.slice(0, insertIndex) +
          fmtSnippet +
          contents.slice(insertIndex);
      }
    }

    config.modResults.contents = contents;
    return config;
  });

  // Modify Android app build.gradle
  config = withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    // Add Captur dependencies at the beginning of the dependencies block
    if (!contents.includes("capturMicroMobility-release")) {
      const dependenciesStart =
        contents.indexOf("dependencies {") + "dependencies {".length;
      const capturDependencies = `
    // Captur AI dependencies
    implementation(files(new File(rootDir, '../node_modules/@captur-ai/captur-react-native-events/android/libs/capturMicroMobility-release.aar')))
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.5.1")
    implementation("androidx.camera:camera-core:1.4.1")
    implementation("androidx.camera:camera-camera2:1.4.1")
    implementation("androidx.camera:camera-lifecycle:1.4.1")
    implementation("androidx.camera:camera-view:1.4.1")
    implementation("com.google.ai.edge.litert:litert:1.4.2")
    implementation("com.google.ai.edge.litert:litert-support:1.4.2")
    implementation("com.google.ai.edge.litert:litert-metadata:1.4.2")
    implementation("com.squareup.retrofit2:adapter-rxjava3:2.9.0")
    implementation("com.squareup.moshi:moshi-kotlin:1.14.0")
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-moshi:2.9.0")
    implementation("com.squareup.okhttp3:okhttp:4.11.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.11.0")
`;

      contents =
        contents.slice(0, dependenciesStart) +
        capturDependencies +
        contents.slice(dependenciesStart);
    }

    config.modResults.contents = contents;
    return config;
  });

  return config;
}

module.exports = withCapturPlugin;
