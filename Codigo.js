/**
 * SISTEMA DE PEDIDOS Y VENTAS - CAFÉ MOLIDO v4.0
 * Venta por presentaciones (250 gr, 500 gr, 1000 gr...), envíos a otras ciudades,
 * entrega a domicilio o en punto de entrega. Sin tienda física.
 * Moneda: Bolivianos (Bs)
 */

const SS = SpreadsheetApp.getActiveSpreadsheet();
const TZ = Session.getScriptTimeZone();
const CACHE = CacheService.getScriptCache();
const PROPS = PropertiesService.getScriptProperties();

const MONEDA = 'Bs';
const SIMBOLO = 'Bs ';
const IVA = 0.13;

const HOJAS = {
  PRODUCTOS: 'Productos',
  INSUMOS: 'Insumos',
  RECETAS: 'Recetas',
  VENTAS: 'Ventas',
  ITEMS_VENTA: 'ItemsVenta',
  MOVIMIENTOS: 'Movimientos',
  ARQUEO: 'Arqueo',
  TURNOS: 'Turnos',
  USUARIOS: 'Usuarios',
  CLIENTES: 'Clientes',
  CONFIG: 'Config',
  LOGS: 'Logs'
};

const TIPOS_ENTREGA = ['Domicilio', 'Punto de entrega', 'Envío a otra ciudad'];
const ESTADOS_PEDIDO = ['Pendiente', 'Preparado', 'Enviado', 'Entregado', 'Cancelado'];
const MOLIENDAS = ['Fina (espresso)', 'Media (filtro/cafetera)', 'Gruesa (prensa francesa)', 'En grano'];

function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate()
    .setTitle('Café FLOWY - Pedidos')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function inicializarSistema() {
  const hojas = {
    [HOJAS.PRODUCTOS]: ['ID','Nombre','Categoría','Precio','Costo','Stock','StockMin','Disponible','Orden','Imagen','Gramos'],
    [HOJAS.INSUMOS]: ['ID','Nombre','Unidad','Stock','StockMin','Costo','Proveedor'],
    [HOJAS.RECETAS]: ['ProductoID','InsumoID','Cantidad'],
    [HOJAS.VENTAS]: ['Ticket','Fecha','Subtotal','Delivery','Extras','Descuento','Total','Método',    'Cliente','TipoEntrega','Estado','Usuario','TurnoID','Notas','Puntos','Telefono','Ciudad','Direccion','EstadoPedido','Guia','FechaEntrega','PesoGr'],
        [HOJAS.ITEMS_VENTA]: ['Ticket','ProductoID','Nombre','Precio','Cantidad','Subtotal','Molienda','Gramos'],
    [HOJAS.MOVIMIENTOS]: ['Fecha','Tipo','Concepto','Monto','Método','Notas','Usuario','TurnoID'],
    [HOJAS.ARQUEO]: ['Fecha','TurnoID','Apertura','Ventas','VentasEfectivo','VentasTarjeta','VentasQR','OtrosIngresos','Egresos','Esperado','Contado','Diferencia','Tickets','Anulados','Usuario','Notas'],
    [HOJAS.TURNOS]: ['TurnoID','Usuario','Apertura','MontoInicial','Cierre','MontoFinal','Estado','Observaciones'],
    [HOJAS.USUARIOS]: ['Email','Nombre','PIN','Rol','Activo','FechaAlta','TelegramChatID'],
    [HOJAS.CLIENTES]: ['Telefono','Nombre','Puntos','TotalGastado','Visitas','UltimaVisita','Cumpleanos'],
    [HOJAS.CONFIG]: ['Clave','Valor'],
    [HOJAS.LOGS]: ['Fecha','Usuario','Accion','Detalle','IP']
  };
  
  Object.entries(hojas).forEach(([nombre, headers]) => {
    let hoja = SS.getSheetByName(nombre);
    if (!hoja) hoja = SS.insertSheet(nombre);
    if (hoja.getLastRow() === 0) {
      hoja.getRange(1, 1, 1, headers.length).setValues([headers])
        .setFontWeight('bold')
        .setBackground('#6f4e37')
        .setFontColor('white');
      hoja.setFrozenRows(1);
    }
  });
  
  const prod = SS.getSheetByName(HOJAS.PRODUCTOS);
  if (prod.getLastRow() === 1) {
    prod.getRange(2, 1, 8, 11).setValues([
      [1,'Café Molido Tradicional 250 gr','Tradicional',30,18,0,20,true,1,'',250],
      [2,'Café Molido Tradicional 500 gr','Tradicional',58,35,0,20,true,2,'',500],
      [3,'Café Molido Tradicional 1000 gr','Tradicional',110,68,0,10,true,3,'',1000],
      [4,'Café Molido Premium 250 gr','Premium',42,25,0,20,true,4,'',250],
      [5,'Café Molido Premium 500 gr','Premium',80,48,0,20,true,5,'',500],
      [6,'Café Molido Premium 1000 gr','Premium',150,92,0,10,true,6,'',1000],
      [7,'Café en Grano 500 gr','Grano',65,40,0,10,true,7,'',500],
      [8,'Café en Grano 1000 gr','Grano',125,78,0,10,true,8,'',1000]
    ]);
  }
  
  const ins = SS.getSheetByName(HOJAS.INSUMOS);
  if (ins.getLastRow() === 1) {
    ins.getRange(2, 1, 5, 7).setValues([
      [1,'Café tostado (a granel)','kg',50,10,60,'Proveedor A'],
      [2,'Bolsas 250 gr','unidad',500,100,0.8,'Proveedor C'],
      [3,'Bolsas 500 gr','unidad',500,100,1.1,'Proveedor C'],
      [4,'Bolsas 1000 gr','unidad',300,80,1.5,'Proveedor C'],
      [5,'Cajas de envío','unidad',100,30,3,'Proveedor C']
    ]);
  }
  
  const cfg = SS.getSheetByName(HOJAS.CONFIG);
  if (cfg.getLastRow() === 1) {
    cfg.getRange(2,1,15,2).setValues([
      ['negocio','Café FLOWY'],
      ['direccion','Atención solo por pedidos (sin tienda)'],
      ['telefono','+591 70000000'],
      ['nit','0000000000'],
      ['moneda','Bs'],
      ['mensaje_ticket','¡Gracias por su pedido!'],
      ['puntos_por_bs',1],
      ['puntos_para_premio',100],
      ['telegram_token',''],
      ['telegram_admin',''],
      ['alerta_stock_bajo','true'],
      ['backup_carpeta_id',''],
      ['imprimir_auto','false'],
      ['ciudad_base','La Paz'],
      ['iva_incluido','true']
    ]);
  }
  
  const users = SS.getSheetByName(HOJAS.USUARIOS);
  if (users.getLastRow() === 1) {
    users.getRange(2,1,1,7).setValues([
      [Session.getActiveUser().getEmail(),'Administrador','1234','admin',true,new Date(),'']
    ]);
  }
  
  return { ok: true, msg: 'Sistema v4.0 inicializado' };
}

// Para hojas creadas con la versión anterior (cafetería): ejecutar una sola vez.
function migrarEstructura() {
  const setHeaders = (nombre, headers) => {
    const h = SS.getSheetByName(nombre);
    if (!h) return;
    h.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#6f4e37').setFontColor('white');
  };
  setHeaders(HOJAS.PRODUCTOS, ['ID','Nombre','Categoría','Precio','Costo','Stock','StockMin','Disponible','Orden','Imagen','Gramos']);
  setHeaders(HOJAS.VENTAS, ['Ticket','Fecha','Subtotal','Delivery','Extras','Descuento','Total','Método','Cliente','TipoEntrega','Estado','Usuario','TurnoID','Notas','Puntos','Telefono','Ciudad','Direccion','EstadoPedido','Guia','FechaEntrega','PesoGr']);
  setHeaders(HOJAS.ITEMS_VENTA, ['Ticket','ProductoID','Nombre','Precio','Cantidad','Subtotal','Molienda','Gramos']);
  const v = SS.getSheetByName(HOJAS.VENTAS);
  if (v && v.getLastRow() > 1) {
    v.getRange(2, 10, v.getLastRow() - 1, 1).clearContent();
    const n = v.getLastRow() - 1;
    v.getRange(2, 19, n, 1).setValue('Entregado');
  }
  _invalidarProductos();
  return { ok: true, msg: 'Estructura migrada. Ya puede eliminar la hoja Mesas.' };
}

function _hoja(nombre) { 
  const h = SS.getSheetByName(nombre);
  if (!h) throw new Error('Hoja no encontrada: ' + nombre);
  return h;
}

function _leerTabla(nombre) {
  const hoja = _hoja(nombre);
  const last = hoja.getLastRow();
  if (last < 2) return [];
  const headers = hoja.getRange(1,1,1,hoja.getLastColumn()).getValues()[0];
  const datos = hoja.getRange(2,1,last-1,hoja.getLastColumn()).getValues();
  return datos.map(fila => {
    const obj = {};
    headers.forEach((h,i) => obj[h] = fila[i]);
    return obj;
  });
}

function _bs(n) { return SIMBOLO + Number(n || 0).toFixed(2); }
function _num(n) { return Number(n) || 0; }

function _getConfig() {
  const cached = CACHE.get('config_v3');
  if (cached) return JSON.parse(cached);
  const cfg = {};
  _leerTabla(HOJAS.CONFIG).forEach(r => cfg[r.Clave] = r.Valor);
  CACHE.put('config_v3', JSON.stringify(cfg), 600);
  return cfg;
}

function _invalidar(...keys) { keys.forEach(k => CACHE.remove(k)); }

function _log(accion, detalle) {
  try {
    const usuario = _usuarioActual();
    _hoja(HOJAS.LOGS).appendRow([new Date(), usuario, accion, detalle || '', '']);
  } catch(e) { console.error('Error log:', e); }
}

function _fecha(f) {
  if (!f) return '';
  return Utilities.formatDate(new Date(f), TZ, 'dd/MM/yyyy HH:mm');
}

function obtenerConfig() { return _getConfig(); }
function obtenerVersion() { return '4.0'; }
function obtenerOpcionesPedido() {
  return { tiposEntrega: TIPOS_ENTREGA, estados: ESTADOS_PEDIDO, moliendas: MOLIENDAS };
}

function crearTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('backupDiario').timeBased().atHour(23).everyDays(1).create();
  ScriptApp.newTrigger('verificarStockBajo').timeBased().everyHours(6).create();
  ScriptApp.newTrigger('enviarReporteDiario').timeBased().atHour(22).everyDays(1).create();
  return { ok: true, msg: 'Triggers creados' };
}