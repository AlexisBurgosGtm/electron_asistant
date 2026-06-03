import { api } from '../api.js';
import { notifyWithVoice } from '../voice.js';

export async function runConnectionTest(id, nombre) {
  try {
    const result = await api.testConexion(id);
    const msg = nombre
      ? `Conexión ${nombre}: ${result.mensaje}`
      : result.mensaje;
    notifyWithVoice(msg, 'success');
    return result;
  } catch (err) {
    const msg = nombre
      ? `Conexión ${nombre}: ${err.message}`
      : err.message;
    notifyWithVoice(msg, 'error');
    throw err;
  }
}

export async function runConnectionTestByName(nombre) {
  const conexiones = await api.getConexiones();
  const { findConexionByName } = await import('../voice.js');
  const conexion = findConexionByName(conexiones, nombre);

  if (!conexion) {
    notifyWithVoice(`No se encontró la conexión ${nombre}`, 'error');
    return null;
  }

  return runConnectionTest(conexion.id, conexion.nombre);
}

export async function runMantenimientoComando(comando) {
  try {
    const result = await api.ejecutarMantenimiento(comando.id);
    const msg = result.mensaje || `Query ejecutada. ${result.rowCount ?? 0} filas afectadas.`;
    notifyWithVoice(msg, 'success');
    return result;
  } catch (err) {
    notifyWithVoice(err.message, 'error');
    throw err;
  }
}
