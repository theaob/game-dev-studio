import type { CapacitorConfig } from '@capacitor/cli';

// Wraps the web build (dist/) as a native Android app. See README "Android".
const config: CapacitorConfig = {
  appId: 'io.github.theaob.gamedevstudio',
  appName: 'Game Dev Studio',
  webDir: 'dist',
  backgroundColor: '#efe4cf',
  android: {
    // The game handles its own touch gestures; no pinch-zoom in the WebView.
    allowMixedContent: false,
  },
};

export default config;
