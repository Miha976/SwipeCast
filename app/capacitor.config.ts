import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.miha976.swipecast',
  appName: 'SwipeCast',
  webDir: 'dist',
  server: {
    // Origine http://localhost : évite le blocage "mixed content" vers ws://192.168.x.x (hub sur le PC).
    androidScheme: 'http',
    // Autorise le trafic en clair vers le réseau local (le hub n'a pas de certificat TLS).
    cleartext: true,
  },
  plugins: {
    LocalNotifications: {
      iconColor: '#6d5efc',
    },
  },
};

export default config;
