// ==================== INSUMOS ====================
function obtenerInsumos() {
  return _leerTabla(HOJAS.INSUMOS).filter(i => i.ID).map(i => ({
    id: _num(i.ID),
    nombre: String(i.Nombre || ''),
    unidad: String(i.Unidad || ''),
    stock: _num(i.Stock),
    stockMin: _num(i.StockMin),
    costo: _num(i.Costo),
    proveedor: String(i.Proveedor || ''),
    alerta: _num(i.Stock) <= _num(i.StockMin)
  }));
}

function guardarInsumo(data, token) {
  if (!_requiereAuth(token)) return { ok: false, msg: 'Sesión expirada' };
  const hoja = _hoja(HOJAS.INSUMOS);
  const datos = hoja.getDataRange().getValues();
  
  const fila = [
    data.id ? _num(data.id) : null,
    String(data.nombre || '').trim(),
    String(data.unidad || 'unidad'),
    _num(data.stock),
    _num(data.stockMin),
    _num(data.costo),
    String(data.proveedor || '')
  ];
  
  if (!fila[1]) return { ok: false, msg: 'Nombre obligatorio' };
  
  if (data.id) {
    for (let i = 1; i < datos.length; i++) {
      if (datos[i][0] == data.id) {
        hoja.getRange(i+1, 1, 1, fila.length).setValues([fila]);
        return { ok: true, msg: 'Insumo actualizado' };
      }
    }
  }
  const ids = datos.slice(1).map(r => _num(r[0])).filter(x => x > 0);
  fila[0] = ids.length ? Math.max(...ids) + 1 : 1;
  hoja.appendRow(fila);
  return { ok: true, msg: 'Insumo agregado', id: fila[0] };
}

// ==================== RECETAS ====================
function obtenerRecetas(productoId) {
  const recetas = _leerTabla(HOJAS.RECETAS).filter(r => _num(r.ProductoID) === _num(productoId));
  const insumos = obtenerInsumos();
  return recetas.map(r => {
    const ins = insumos.find(i => i.id === _num(r.InsumoID));
    return {
      productoId: _num(r.ProductoID),
      insumoId: _num(r.InsumoID),
      insumoNombre: ins ? ins.nombre : 'Desconocido',
      unidad: ins ? ins.unidad : '',
      cantidad: _num(r.Cantidad)
    };
  });
}

function guardarReceta(productoId, items, token) {
  if (!_requiereAuth(token)) return { ok: false, msg: 'Sesión expirada' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoja = _hoja(HOJAS.RECETAS);
    const datos = hoja.getDataRange().getValues();
    
    for (let i = datos.length - 1; i >= 1; i--) {
      if (_num(datos[i][0]) === _num(productoId)) {
        hoja.deleteRow(i + 1);
      }
    }
    
    items.forEach(it => {
      if (it.insumoId && it.cantidad > 0) {
        hoja.appendRow([_num(productoId), _num(it.insumoId), _num(it.cantidad)]);
      }
    });
    
    return { ok: true, msg: 'Receta guardada' };
  } finally {
    lock.releaseLock();
  }
}

function calcularCostoProducto(productoId) {
  const recetas = obtenerRecetas(productoId);
  const insumos = obtenerInsumos();
  let costo = 0;
  recetas.forEach(r => {
    const ins = insumos.find(i => i.id === r.insumoId);
    if (ins) costo += r.cantidad * ins.costo;
  });
  return costo;
}

function _descontarInsumos(items) {
  const hoja = _hoja(HOJAS.INSUMOS);
  const datos = hoja.getDataRange().getValues();
  
  items.forEach(item => {
    const receta = obtenerRecetas(item.id);
    receta.forEach(r => {
      const cantidadUsar = r.cantidad * item.cantidad;
      for (let i = 1; i < datos.length; i++) {
        if (_num(datos[i][0]) === r.insumoId) {
          const stockActual = _num(datos[i][3]);
          hoja.getRange(i+1, 4).setValue(Math.max(0, stockActual - cantidadUsar));
          break;
        }
      }
    });
  });
}