const {
  withAppBuildGradle,
  withInfoPlist,
  withAndroidManifest,
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

  // Modify Android build.gradle
  config = withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    // Add flatDir repository after the android block but before dependencies
    if (!contents.includes("flatDir")) {
      const androidBlockEnd = contents.lastIndexOf(
        "}",
        contents.indexOf("dependencies {")
      );
      const repositoriesSection = `
repositories {
    google()
    mavenCentral()
    flatDir {
        dirs '../../node_modules/@captur-ai/captur-react-native-events/android/libs'
    }
}

`;
      contents =
        contents.slice(0, androidBlockEnd + 1) +
        repositoriesSection +
        contents.slice(androidBlockEnd + 1);
    }

    // Add Captur dependencies at the beginning of the dependencies block
    if (!contents.includes("capturMicroMobility-release")) {
      const dependenciesStart =
        contents.indexOf("dependencies {") + "dependencies {".length;
      const capturDependencies = `
    // Captur AI dependencies
    implementation(name: 'capturMicroMobility-release', ext: 'aar') {
        transitive = true
    }
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.5.1")
    implementation("androidx.camera:camera-core:1.3.4")
    implementation("androidx.camera:camera-camera2:1.3.4")
    implementation("androidx.camera:camera-lifecycle:1.3.4")
    implementation("androidx.camera:camera-view:1.3.4")
    api("org.tensorflow:tensorflow-lite-task-vision:0.4.0")
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
