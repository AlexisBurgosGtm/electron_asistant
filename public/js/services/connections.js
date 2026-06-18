import { api } from '../api.js';
import { showToast } from '../utils.js';
import { speak } from '../tts.js';

export async function runConnectionTest(id, nombre, { onStatus } = {}) {
  onStatus?.('checking');
  try {
    const result = await api.testConexion(id);
    onStatus?.('online', { databaseSizeMb: result.databaseSizeMb });
    const sizeLabel = result.databaseSizeMb != null
      ? ` Tamaño: ${Number(result.databaseSizeMb).toLocaleString('es-ES', { maximumFractionDigits: 2 })} megabytes.`
      : '';
    const msg = nombre
      ? `Conexión ${nombre}: ${result.mensaje}.${sizeLabel}`
      : `${result.mensaje}.${sizeLabel}`;
    showToast(msg.trim(), 'success');
    speak(msg.trim());
    return { ok: true, ...result };
  } catch (err) {
    onStatus?.('offline');
    const msg = nombre
      ? `Conexión ${nombre}: ${err.message}`
      : err.message;
    showToast(msg, 'error');
    speak(msg);
    return { ok: false, mensaje: err.message };
  }
}

export async function runMantenimientoComando(comando) {
  try {
    const result = await api.ejecutarMantenimiento(comando.id);
    const msg = result.mensaje || `Query ejecutada. ${result.rowCount ?? 0} filas afectadas.`;
    showToast(msg, 'success');
    speak(msg);
    return result;
  } catch (err) {
    showToast(err.message, 'error');
    speak(err.message);
    throw err;
  }
}
