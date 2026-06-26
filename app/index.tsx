import {
  CapturCameraView,
  setTimeout as cptrSetTimeout,
  endAttempt,
  getConfig,
  prepareModel,
  retake,
  setApiKey,
  setDelay,
  subscribeToEvents,
} from "@captur-ai/captur-react-native-events";
import { useEffect, useRef, useState } from "react";
import { Button, Image, StyleSheet, TextInput, View } from "react-native";
import FlashMessage, { showMessage } from "react-native-flash-message";
const { CAPTUR_API_KEY, CAPTUR_BASE_URL } = require("../captur.config");

const DELAY = 1;
const TIMEOUT = 15;
const LOCATION_NAME = "Toronto";
const ASSET_TYPE = "package";

async function initializeCaptur() {
  console.log("[Captur] Initializing...");
  console.log("[Captur] Base URL:", CAPTUR_BASE_URL ?? "(default)");
  console.log("[Captur] API Key:", CAPTUR_API_KEY.slice(0, 20) + "...");

  console.log("[Captur] Setting timeout:", TIMEOUT);
  await cptrSetTimeout(TIMEOUT);

  console.log("[Captur] Setting delay:", DELAY);
  await setDelay(DELAY);

  console.log("[Captur] Setting API key...");
  await setApiKey(CAPTUR_API_KEY, CAPTUR_BASE_URL);
  console.log("[Captur] API key set successfully");

  console.log("[Captur] Preparing model:", LOCATION_NAME, ASSET_TYPE);
  await prepareModel(LOCATION_NAME, ASSET_TYPE, 0.0, 0.0);
  console.log("[Captur] Model prepared successfully");

  console.log("[Captur] Getting config:", LOCATION_NAME, ASSET_TYPE);
  await getConfig(LOCATION_NAME, ASSET_TYPE, 0.0, 0.0);
  console.log("[Captur] Config loaded successfully");

  console.log("[Captur] Initialization complete");
}

export default function CameraScreen() {
  const [capturInitialized, setCapturInitialized] = useState(false);
  const [startVerification, setStartVerification] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [isZoomedIn, setIsZoomedIn] = useState(false);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [referenceId, setReferenceId] = useState<string>(Date.now().toString());
  const guidanceInputRef = useRef<TextInput>(null);

  useEffect(() => {
    let unsubscriber: (() => void) | undefined;
    (async () => {
      let initSuccessful = true;
      try {
        await initializeCaptur();
      } catch (e) {
        showMessage({
          message: "Captur Init Problem",
          type: "danger",
          floating: true,
          duration: 5000,
        });
        initSuccessful = false;
        console.log("[Captur] Initialization FAILED:", e);
      }
      unsubscriber = subscribeToEvents({
        capturDidGenerateEvent: (state, metadata) => {
          console.log("[Captur] Event:", state);
          if (state === "cameraDecided") {
            resetCameraState();
            setThumbnail("data:image/png;base64," + metadata?.imageDataBase64);
          }
        },
        capturDidGenerateError: (err) => {
          console.error("[Captur] Error:", err);
        },
        capturDidGenerateGuidance: (meta) => {
          guidanceInputRef.current?.setNativeProps({
            text: meta.guidanceTitle,
          });
        },
        capturDidRevokeGuidance: () => {
          console.log("capturDidRevokeGuidance");
        },
      });
      setCapturInitialized(initSuccessful);
    })();
    return () => {
      unsubscriber?.();
    };
  }, []);

  const resetCameraState = () => {
    setStartVerification(false);
    setIsFlashOn(false);
    setIsZoomedIn(false);
  };

  const startCamera = async () => {
    if (!capturInitialized) return;
    if (!referenceId) return;
    if (startVerification) return;

    if (thumbnail) {
      setThumbnail(null);
      guidanceInputRef.current?.setNativeProps({
        text: "",
      });
      retake();
    }

    setStartVerification(true);
  };

  const stopCamera = () => {
    if (!capturInitialized) return;
    if (!startVerification) return;
    return endAttempt();
  };

  const handleFlash = () => {
    setIsFlashOn((prev) => !prev);
  };

  const handleZoom = () => {
    setIsZoomedIn((prev) => !prev);
  };

  const newSession = async () => {
    setThumbnail(null);
    resetCameraState();
    guidanceInputRef.current?.setNativeProps({
      text: "",
    });
    setReferenceId(Date.now().toString());
    setStartVerification(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.cameraContainer}>
        {capturInitialized && (
          <CapturCameraView
            key={`${referenceId}-${startVerification}`}
            style={styles.camera}
            referenceId={referenceId ?? ""}
            startVerification={startVerification}
            isFlashOn={isFlashOn}
            isZoomedIn={isZoomedIn}
          />
        )}
      </View>
      {thumbnail && (
        <View style={styles.thumbnailContainer}>
          <Image style={styles.thumbnail} source={{ uri: thumbnail }} />
        </View>
      )}
      <View style={styles.actionButtons}>
        <Button
          title={startVerification ? "Stop" : "Start"}
          onPress={startVerification ? stopCamera : startCamera}
        />
        <Button
          title={isFlashOn ? "Turn flash off" : "Turn flash on"}
          onPress={handleFlash}
        />
        <Button
          title={isZoomedIn ? "Zoom out" : "Zoom in"}
          onPress={handleZoom}
        />
        <Button title={"New session"} onPress={newSession} />
      </View>
      <View style={styles.guidance}>
        <TextInput
          style={styles.guidanceText}
          ref={guidanceInputRef}
          editable={false}
        />
      </View>
      <FlashMessage position="top" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-end",
  },
  cameraContainer: {
    flex: 1,
    position: "relative",
    justifyContent: "flex-end",
  },
  camera: {
    flex: 1,
  },
  thumbnailContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "black",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  guidance: {
    position: "absolute",
    top: "10%",
    width: "100%",
    zIndex: 14,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingVertical: 12,
  },
  guidanceText: {
    color: "white",
    fontSize: 16,
  },
  actionButtons: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: "100%",
    zIndex: 20,
    gap: 10,
  },
});
