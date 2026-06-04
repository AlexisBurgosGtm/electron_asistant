import { api } from '../api.js';
import { showToast } from '../utils.js';
import { speak } from '../tts.js';

export async function runConnectionTest(id, nombre) {
  try {
    const result = await api.testConexion(id);
    const msg = nombre
      ? `Conexión ${nombre}: ${result.mensaje}`
      : result.mensaje;
    showToast(msg, 'success');
    speak(msg);
    return result;
  } catch (err) {
    const msg = nombre
      ? `Conexión ${nombre}: ${err.message}`
      : err.message;
    showToast(msg, 'error');
    speak(msg);
    throw err;
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
