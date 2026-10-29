function obtenerProductos(soloDisponibles, token) {
  const cacheKey = 'productos_v3';
  let productos;
  const cached = CACHE.get(cacheKey);
  if (cached) {
    productos = JSON.parse(cached);
  } else {
    productos = _leerTabla(HOJAS.PRODUCTOS)
      .filter(p => p.ID)
      .map(p => ({
        id: _num(p.ID),
        nombre: String(p.Nombre || ''),
        categoria: String(p.Categoría || 'General'),
        precio: _num(p.Precio),
        costo: _num(p.Costo),
        stock: _num(p.Stock),
        stockMin: _num(p.StockMin) || 5,
        disponible: p.Disponible === true || p.Disponible === 'TRUE',
        orden: _num(p.Orden) || 999,
        imagen: String(p.Imagen || ''),
        gramos: _num(p.Gramos)
      }))
      .sort((a,b) => a.categoria.localeCompare(b.categoria) || a.orden - b.orden);
    CACHE.put(cacheKey, JSON.stringify(productos), 300);
  }
  return soloDisponibles ? productos.filter(p => p.disponible && p.stock !== 0) : productos;
}

function _invalidarProductos() {
  CACHE.remove('productos_v3');
  CACHE.remove('movimientos_ult_v3');
}

function guardarProducto(data, token) {
  if (!_requiereAuth(token)) return { ok: false, msg: 'Sesión expirada' };
  
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoja = _hoja(HOJAS.PRODUCTOS);
    const datos = hoja.getDataRange().getValues();
    const nombre = String(data.nombre || '').trim();
    const precio = _num(data.precio);
    
    if (!nombre) return { ok: false, msg: 'Nombre obligatorio' };
    if (precio < 0) return { ok: false, msg: 'Precio inválido' };
    
    const fila = [
      data.id ? _num(data.id) : null,
      nombre,
      String(data.categoria || 'General').trim(),
      precio,
      _num(data.costo),
      _num(data.stock),
      _num(data.stockMin) || 5,
      data.disponible !== false,
      _num(data.orden) || 999,
      String(data.imagen || ''),
      _num(data.gramos)
    ];
    
    if (data.id) {
      for (let i = 1; i < datos.length; i++) {
        if (datos[i][0] == data.id) {
          hoja.getRange(i+1, 1, 1, fila.length).setValues([fila]);
          _invalidarProductos();
          _log('PRODUCTO_EDIT', nombre);
          return { ok: true, msg: 'Producto actualizado' };
        }
      }
    }
    
    const ids = datos.slice(1).map(r => _num(r[0])).filter(x => x > 0);
    fila[0] = ids.length ? Math.max(...ids) + 1 : 1;
    hoja.appendRow(fila);
    _invalidarProductos();
    _log('PRODUCTO_NUEVO', nombre);
    return { ok: true, msg: 'Producto agregado', id: fila[0] };
  } finally {
    lock.releaseLock();
  }
}

function eliminarProducto(id, token) {
  if (!_requiereAuth(token)) return { ok: false, msg: 'Sesión expirada' };
  const hoja = _hoja(HOJAS.PRODUCTOS);
  const datos = hoja.getDataRange().getValues();
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0] == id) {
      const nombre = datos[i][1];
      hoja.deleteRow(i+1);
      _invalidarProductos();
      _log('PRODUCTO_ELIMINADO', nombre);
      return { ok: true };
    }
  }
  return { ok: false, msg: 'No encontrado' };
}

function toggleDisponible(id, token) {
  if (!_requiereAuth(token)) return { ok: false, msg: 'Sesión expirada' };
  const hoja = _hoja(HOJAS.PRODUCTOS);
  const datos = hoja.getDataRange().getValues();
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0] == id) {
      const nuevo = !(datos[i][7] === true || datos[i][7] === 'TRUE');
      hoja.getRange(i+1, 8).setValue(nuevo);
      _invalidarProductos();
      return { ok: true, disponible: nuevo };
    }
  }
  return { ok: false };
}

function ajustarStock(id, nuevoStock, motivo, token) {
  if (!_requiereAuth(token)) return { ok: false, msg: 'Sesión expirada' };
  const hoja = _hoja(HOJAS.PRODUCTOS);
  const datos = hoja.getDataRange().getValues();
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0] == id) {
      const anterior = _num(datos[i][5]);
      hoja.getRange(i+1, 6).setValue(_num(nuevoStock));
      _invalidarProductos();
      _log('AJUSTE_STOCK', `${datos[i][1]}: ${anterior} → ${nuevoStock} (${motivo || 'manual'})`);
      return { ok: true };
    }
  }
  return { ok: false };
}