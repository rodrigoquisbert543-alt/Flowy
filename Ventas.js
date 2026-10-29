// ==================== VENTAS ====================
function registrarVenta(payload, token) {
  if (!_requiereAuth(token)) return { ok: false, msg: 'Sesión expirada' };
  
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const { items, delivery, extras, descuento, notasExtra, metodoPago, cliente, telefonoCliente,
            tipoEntrega, ciudad, direccion } = payload;
    if (!items || !items.length) return { ok: false, msg: 'El pedido está vacío' };
    
    const tipo = TIPOS_ENTREGA.indexOf(tipoEntrega) >= 0 ? tipoEntrega : TIPOS_ENTREGA[0];
    if (!String(cliente || '').trim()) return { ok: false, msg: 'Nombre del cliente obligatorio' };
    if (!String(telefonoCliente || '').trim()) return { ok: false, msg: 'Teléfono del cliente obligatorio' };
    if (!String(direccion || '').trim()) {
      return { ok: false, msg: tipo === 'Punto de entrega' ? 'Indica el punto de entrega' : 'Indica la dirección de entrega' };
    }
    if (tipo === 'Envío a otra ciudad' && !String(ciudad || '').trim()) {
      return { ok: false, msg: 'Indica la ciudad de destino' };
    }
    
    const sesion = validarSesion(token);
    const usuario = sesion ? sesion.nombre : 'cajero';
    const hojaV = _hoja(HOJAS.VENTAS);
    const hojaI = _hoja(HOJAS.ITEMS_VENTA);
    const hojaM = _hoja(HOJAS.MOVIMIENTOS);
    const hojaP = _hoja(HOJAS.PRODUCTOS);
    const productos = obtenerProductos(false, token);
    
    for (const it of items) {
      const p = productos.find(x => x.id === it.id);
      if (!p) return { ok: false, msg: `Producto no existe: ${it.nombre}` };
      if (!p.disponible) return { ok: false, msg: `${p.nombre} no disponible` };
      if (!(_num(it.cantidad) > 0)) return { ok: false, msg: `Cantidad inválida: ${p.nombre}` };
      if (p.stock > 0 && it.cantidad > p.stock) {
        return { ok: false, msg: `Stock insuficiente: ${p.nombre} (${p.stock} disp.)` };
      }
      // El precio y los gramos siempre se toman del catálogo
      it.nombre = p.nombre;
      it.precio = p.precio;
      it.gramos = p.gramos;
      it.molienda = String(it.molienda || '');
    }
    
    let subtotal = 0;
    let pesoGr = 0;
    items.forEach(it => {
      subtotal += it.precio * it.cantidad;
      pesoGr += it.gramos * it.cantidad;
    });
    
    const desc = _num(descuento);
    const del = _num(delivery);
    const ext = _num(extras);
    const total = Math.max(0, subtotal + del + ext - desc);
    const ticket = 'P' + new Date().getTime().toString().slice(-7);
    const fecha = new Date();
    const turnoId = obtenerTurnoActivo(token);
    const ciudadFinal = String(ciudad || '').trim() || (_getConfig().ciudad_base || '');
    
    let puntos = 0;
    const cfg = _getConfig();
    if (telefonoCliente && cfg.puntos_por_bs) {
      puntos = Math.floor(total * _num(cfg.puntos_por_bs));
      _acumularPuntos(telefonoCliente, cliente, total, puntos);
    }
    
    hojaV.appendRow([
      ticket, fecha, subtotal, del, ext, desc, total,
      metodoPago || 'Efectivo', cliente || '', tipo, 'Pagada',
      usuario, turnoId || '', notasExtra || '', puntos,
      String(telefonoCliente || '').trim(), ciudadFinal, String(direccion || '').trim(),
      'Pendiente', '', '', pesoGr
    ]);
    
    items.forEach(it => {
      hojaI.appendRow([ticket, it.id, it.nombre, it.precio, it.cantidad, it.precio * it.cantidad, it.molienda, it.gramos]);
    });
    
    hojaM.appendRow([fecha, 'Ingreso', `Pedido ${ticket}`, total, metodoPago || 'Efectivo', '', usuario, turnoId || '']);
    
    const datosP = hojaP.getDataRange().getValues();
    for (const it of items) {
      for (let i = 1; i < datosP.length; i++) {
        if (datosP[i][0] == it.id) {
          const stockActual = _num(datosP[i][5]);
          if (stockActual > 0) {
            hojaP.getRange(i+1, 6).setValue(Math.max(0, stockActual - it.cantidad));
          }
          break;
        }
      }
    }
    
    _descontarInsumos(items);
    
    _invalidarProductos();
    CACHE.remove('movimientos_ult_v3');
    
    return {
      ok: true, ticket,
      fecha: _fecha(fecha),
      items, subtotal, delivery: del, extras: ext, descuento: desc, total,
      notasExtra: notasExtra || '', metodoPago: metodoPago || 'Efectivo',
      cliente: cliente || '', usuario, puntos,
      tipoEntrega: tipo, ciudad: ciudadFinal, direccion: String(direccion || '').trim(),
      telefono: String(telefonoCliente || '').trim(), pesoGr
    };
  } finally {
    lock.releaseLock();
  }
}

function anularVenta(ticket, motivo, token) {
  if (!_requiereAdmin(token)) return { ok: false, msg: 'Solo admin' };
  
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hojaV = _hoja(HOJAS.VENTAS);
    const hojaI = _hoja(HOJAS.ITEMS_VENTA);
    const hojaP = _hoja(HOJAS.PRODUCTOS);
    const datos = hojaV.getDataRange().getValues();
    
    let ventaEncontrada = null;
    let filaVenta = -1;
    for (let i = 1; i < datos.length; i++) {
      if (String(datos[i][0]) === String(ticket)) {
        if (String(datos[i][10]) === 'Anulada') return { ok: false, msg: 'Ya está anulada' };
        ventaEncontrada = datos[i];
        filaVenta = i + 1;
        break;
      }
    }
    
    if (!ventaEncontrada) return { ok: false, msg: 'Ticket no encontrado' };
    
    hojaV.getRange(filaVenta, 11).setValue('Anulada');
    hojaV.getRange(filaVenta, 19).setValue('Cancelado');
    
    const items = _leerTabla(HOJAS.ITEMS_VENTA).filter(i => String(i.Ticket) === String(ticket));
    const datosP = hojaP.getDataRange().getValues();
    items.forEach(it => {
      for (let i = 1; i < datosP.length; i++) {
        if (_num(datosP[i][0]) === _num(it.ProductoID)) {
          const stockActual = _num(datosP[i][5]);
          if (stockActual > 0) {
            hojaP.getRange(i+1, 6).setValue(stockActual + _num(it.Cantidad));
          }
          break;
        }
      }
    });
    
    const usuario = validarSesion(token).nombre;
    _hoja(HOJAS.MOVIMIENTOS).appendRow([
      new Date(), 'Egreso', `Anulación ${ticket} (${motivo || 'sin motivo'})`,
      _num(ventaEncontrada[6]), 'Anulación', '', usuario, ''
    ]);
    
    _invalidarProductos();
    _invalidarCaja();
    _log('VENTA_ANULADA', `${ticket} - ${motivo}`);
    
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function obtenerVentasHoy(token) {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const manana = new Date(hoy); manana.setDate(manana.getDate()+1);
  
  return _leerTabla(HOJAS.VENTAS)
    .filter(v => {
      const f = new Date(v.Fecha);
      return f >= hoy && f < manana;
    })
    .map(v => ({
      ticket: String(v.Ticket),
      fecha: Utilities.formatDate(new Date(v.Fecha), TZ, 'HH:mm'),
      subtotal: _num(v.Subtotal),
      total: _num(v.Total),
      metodoPago: String(v.Método || ''),
      cliente: String(v.Cliente || ''),
      tipoEntrega: String(v.TipoEntrega || ''),
      ciudad: String(v.Ciudad || ''),
      usuario: String(v.Usuario || ''),
      estado: String(v.Estado || 'Pagada'),
      puntos: _num(v.Puntos)
    }))
    .reverse();
}

// ==================== FIDELIDAD ====================
function _acumularPuntos(telefono, nombre, total, puntos) {
  if (!telefono) return;
  const hoja = _hoja(HOJAS.CLIENTES);
  const datos = hoja.getDataRange().getValues();
  
  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][0]) === String(telefono)) {
      hoja.getRange(i+1, 3).setValue(_num(datos[i][2]) + puntos);
      hoja.getRange(i+1, 4).setValue(_num(datos[i][3]) + total);
      hoja.getRange(i+1, 5).setValue(_num(datos[i][4]) + 1);
      hoja.getRange(i+1, 6).setValue(new Date());
      if (nombre) hoja.getRange(i+1, 2).setValue(nombre);
      return;
    }
  }
  
  hoja.appendRow([telefono, nombre || '', puntos, total, 1, new Date(), '']);
}

function buscarCliente(telefono) {
  const c = _leerTabla(HOJAS.CLIENTES).find(x => String(x.Telefono) === String(telefono));
  if (!c) return null;
  const cfg = _getConfig();
  const objetivo = _num(cfg.puntos_para_premio) || 100;
  return {
    telefono: String(c.Telefono),
    nombre: String(c.Nombre || ''),
    puntos: _num(c.Puntos),
    totalGastado: _num(c.TotalGastado),
    visitas: _num(c.Visitas),
    proximoPremio: objetivo - _num(c.Puntos),
    objetivo
  };
}

// ==================== PEDIDOS / ENTREGAS ====================
function _pedidoDesdeFila(v) {
  return {
    ticket: String(v.Ticket),
    fechaIso: v.Fecha ? new Date(v.Fecha).toISOString() : '',
    fecha: _fecha(v.Fecha),
    total: _num(v.Total),
    metodoPago: String(v.Método || ''),
    cliente: String(v.Cliente || ''),
    telefono: String(v.Telefono || ''),
    tipoEntrega: String(v.TipoEntrega || ''),
    ciudad: String(v.Ciudad || ''),
    direccion: String(v.Direccion || ''),
    estado: String(v.Estado || 'Pagada'),
    estadoPedido: String(v.EstadoPedido || 'Pendiente'),
    guia: String(v.Guia || ''),
    pesoGr: _num(v.PesoGr),
    notas: String(v.Notas || '')
  };
}

// estadoFiltro: 'Activos' (pendiente/preparado/enviado), 'Todos' o un estado puntual
function obtenerPedidos(estadoFiltro, token) {
  if (!_requiereAuth(token)) return [];
  const items = _leerTabla(HOJAS.ITEMS_VENTA);
  const filtro = estadoFiltro || 'Activos';
  const activos = ['Pendiente', 'Preparado', 'Enviado'];
  return _leerTabla(HOJAS.VENTAS)
    .filter(v => v.Ticket)
    .map(_pedidoDesdeFila)
    .filter(p => filtro === 'Todos' ? true
      : filtro === 'Activos' ? activos.indexOf(p.estadoPedido) >= 0 && p.estado !== 'Anulada'
      : p.estadoPedido === filtro)
    .map(p => {
      p.items = items.filter(i => String(i.Ticket) === p.ticket).map(i => ({
        nombre: String(i.Nombre),
        cantidad: _num(i.Cantidad),
        molienda: String(i.Molienda || '')
      }));
      return p;
    })
    .reverse()
    .slice(0, 100);
}

function actualizarEstadoPedido(ticket, estado, guia, token) {
  if (!_requiereAuth(token)) return { ok: false, msg: 'Sesión expirada' };
  if (ESTADOS_PEDIDO.indexOf(estado) < 0) return { ok: false, msg: 'Estado inválido' };
  if (estado === 'Cancelado') return { ok: false, msg: 'Para cancelar use Anular venta' };
  
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoja = _hoja(HOJAS.VENTAS);
    const datos = hoja.getDataRange().getValues();
    for (let i = 1; i < datos.length; i++) {
      if (String(datos[i][0]) !== String(ticket)) continue;
      if (String(datos[i][10]) === 'Anulada') return { ok: false, msg: 'Pedido anulado' };
      hoja.getRange(i + 1, 19).setValue(estado);
      if (guia !== undefined && guia !== null && String(guia).trim()) {
        hoja.getRange(i + 1, 20).setValue(String(guia).trim());
      }
      if (estado === 'Entregado') hoja.getRange(i + 1, 21).setValue(new Date());
      _log('PEDIDO_ESTADO', `${ticket} → ${estado}${guia ? ' (guía ' + guia + ')' : ''}`);
      return { ok: true };
    }
    return { ok: false, msg: 'Pedido no encontrado' };
  } finally {
    lock.releaseLock();
  }
}
