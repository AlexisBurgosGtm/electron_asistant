# MariAndre

Aplicación Electron con interfaz SPA (vanilla JavaScript) para gestionar conexiones a bases de datos **SQL Server** y **MySQL**.

## Características

- Interfaz SPA con tema azul oscuro y efectos glass
- Iconos Font Awesome Free
- Servidor web en puerto **9003** (accesible desde Electron y navegador)
- Gestión CRUD de conexiones en `conexiones.json`
- Prueba de conexión para MSSQL y MySQL

## Instalación

```bash
npm install
```

## Ejecutar

```bash
npm start
```

La aplicación abrirá una ventana Electron y el servicio estará disponible en:

- **Electron**: ventana integrada
- **Navegador**: [http://localhost:9003](http://localhost:9003)

## Estructura de conexiones (`conexiones.json`)

Cada conexión incluye el campo `tipo` para identificar el motor:

| Campo | Descripción |
|-------|-------------|
| `id` | Identificador único |
| `nombre` | Nombre descriptivo |
| `tipo` | `"mssql"` o `"mysql"` |
| `host` | Servidor |
| `puerto` | Puerto (1433 MSSQL, 3306 MySQL) |
| `usuario` | Usuario |
| `password` | Contraseña |
| `baseDatos` | Base de datos |
| `opciones` | Solo MSSQL: `encrypt`, `trustServerCertificate` |

## API REST

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/status` | Estado del servicio |
| GET | `/api/conexiones` | Listar conexiones |
| POST | `/api/conexiones` | Crear conexión |
| PUT | `/api/conexiones/:id` | Actualizar conexión |
| DELETE | `/api/conexiones/:id` | Eliminar conexión |
| POST | `/api/conexiones/:id/test` | Probar conexión guardada |
| POST | `/api/conexiones/test` | Probar datos sin guardar |

## Tecnologías

- Electron
- Express
- mssql
- mysql2
- Font Awesome 6
