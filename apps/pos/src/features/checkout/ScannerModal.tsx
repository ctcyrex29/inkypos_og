import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/ui/components';
import { fontSize, spacing } from '@/ui/theme';

/** Full-screen camera that reports the first barcode it reads, then closes. */
export function ScannerModal({ onScanned, onClose }: { onScanned: (code: string) => void; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const done = useRef(false);

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
            onBarcodeScanned={({ data }) => {
              // The camera reports the same code many times a second; take the first.
              if (done.current) return;
              done.current = true;
              onScanned(data);
            }}
          />
        ) : (
          <View style={styles.centre}>
            <Text style={styles.text}>The camera is needed to scan barcodes.</Text>
            {permission?.canAskAgain !== false ? (
              <Button label="Allow camera" onPress={() => void requestPermission()} />
            ) : (
              <Text style={styles.text}>Camera access was refused. Enable it in the phone’s settings.</Text>
            )}
          </View>
        )}
        <View style={styles.footer}>
          <Button label="Cancel" tone="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  text: { color: '#fff', fontSize: fontSize.md, textAlign: 'center' },
  footer: { position: 'absolute', left: spacing.xl, right: spacing.xl, bottom: spacing.xxl },
});
