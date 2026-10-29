// ==================== TURNOS ====================
function abrirTurno(montoInicial, token) {
  if (!_requiereAuth(token)) return { ok: false, msg: 'Sesión' };
  const sesion = validarSesion(token);
  
  const abierto = _leerTabla(HOJAS.TURNOS).find(t => 
    t.Estado === 'abierto' && t.Usuario === sesion.nombre
  );
  if (abierto) return { ok: false, msg: 'Ya tienes un turno abierto' };
  
  const turnoId = 'T' + new Date().getTime();
  _hoja(HOJAS.TURNOS).appendRow([
    turnoId, sesion.nombre, new Date(), _num(montoInicial),
    '', '', 'abierto', ''
  ]);
  
  PROPS.setProperty('turno_activo_' + sesion.nombre, turnoId);
  _log('TURNO_ABIERTO', `${sesion.nombre} - ${_bs(montoInicial)}`);
  
  return { ok: true, turnoId };
}

function cerrarTurno(montoFinal, contado, observaciones, token) {
  if (!_requiereAuth(token)) return { ok: false, msg: 'Sesión' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sesion = validarSesion(token);
    const turnoId = obtenerTurnoActivo(token);
    if (!turnoId) return { ok: false, msg: 'No hay turno abierto' };
    
    const hoja = _hoja(HOJAS.TURNOS);
    const datos = hoja.getDataRange().getValues();
    
    let filaTurno = -1, montoInicial = 0;
    for (let i = 1; i < datos.length; i++) {
      if (datos[i][0] === turnoId) {
        filaTurno = i + 1;
        montoInicial = _num(datos[i][3]);
        break;
      }
    }
    if (filaTurno < 0) return { ok: false, msg: 'Turno no encontrado' };
    
    const resumen = _calcularResumenTurno(turnoId);
    const esperado = montoInicial + resumen.ventas - resumen.egresos;
    const contadoNum = _num(contado);
    const diferencia = contadoNum - esperado;
    
    hoja.getRange(filaTurno, 5).setValue(new Date());
    hoja.getRange(filaTurno, 6).setValue(contadoNum);
    hoja.getRange(filaTurno, 7).setValue('cerrado');
    hoja.getRange(filaTurno, 8).setValue(observaciones || '');
    
    _hoja(HOJAS.ARQUEO).appendRow([
      new Date(), turnoId, montoInicial,
      resumen.ventas, resumen.efectivo, resumen.tarjeta, resumen.qr,
      resumen.otrosIngresos, resumen.egresos,
      esperado, contadoNum, diferencia,
      resumen.tickets, resumen.anulados,
      sesion.nombre, observaciones || ''
    ]);
    
    PROPS.deleteProperty('turno_activo_' + sesion.nombre);
    _log('TURNO_CERRADO', `${sesion.nombre} - Dif: ${_bs(diferencia)}`);
    
    return {
      ok: true,
      turnoId,
      usuario: sesion.nombre,
      montoInicial,
      ...resumen,
      esperado,
      contado: contadoNum,
      diferencia,
      observaciones: observaciones || ''
    };
  } finally {
    lock.releaseLock();
  }
}

function obtenerTurnoActivo(token) {
  const sesion = validarSesion(token);
  if (!sesion) return null;
  return PROPS.getProperty('turno_activo_' + sesion.nombre) || null;
}

function _calcularResumenTurno(turnoId) {
  const ventas = _leerTabla(HOJAS.VENTAS).filter(v => String(v.TurnoID) === String(turnoId));
  const movs = _leerTabla(HOJAS.MOVIMIENTOS).filter(m => String(m.TurnoID) === String(turnoId));
  
  let total = 0, efectivo = 0, tarjeta = 0, qr = 0, tickets = 0, anulados = 0;
  ventas.forEach(v => {
    if (v.Estado === 'Anulada') { anulados++; return; }
    const t = _num(v.Total);
    total += t; tickets++;
    const m = String(v.Método || 'Efectivo');
    if (m === 'Efectivo') efectivo += t;
    else if (m === 'Tarjeta') tarjeta += t;
    else if (m === 'QR' || m === 'Transferencia') qr += t;
  });
  
  let otrosIngresos = 0, egresos = 0;
  movs.forEach(m => {
    const monto = _num(m.Monto);
    if (m.Tipo === 'Ingreso' && !String(m.Concepto).startsWith('Venta')) otrosIngresos += monto;
    if (m.Tipo === 'Egreso' && !String(m.Concepto).startsWith('Anulación')) egresos += monto;
  });
  
  return {
    ventas: total, efectivo, tarjeta, qr, otrosIngresos, egresos, tickets, anulados
  };
}

// ==================== MOVIMIENTOS ====================
function registrarMovimiento(tipo, concepto, monto, metodo, notas, token) {
  if (!_requiereAuth(token)) return { ok: false, msg: 'Sesión' };
  const m = _num(monto);
  if (!concepto || m <= 0) return { ok: false, msg: 'Datos inválidos' };
  
  const sesion = validarSesion(token);
  const turnoId = obtenerTurnoActivo(token) || '';
  
  _hoja(HOJAS.MOVIMIENTOS).appendRow([
    new Date(), tipo, concepto, m, metodo || 'Efectivo', notas || '', sesion.nombre, turnoId
  ]);
  
  CACHE.remove('movimientos_ult_v3');
  return { ok: true };
}

function obtenerMovimientos(limite, token) {
  const cacheKey = 'movimientos_ult_v3';
  let lista;
  const cached = CACHE.get(cacheKey);
  if (cached) lista = JSON.parse(cached);
  else {
    lista = _leerTabla(HOJAS.MOVIMIENTOS).map(r => ({
      fecha: r.Fecha ? _fecha(r.Fecha) : '',
      tipo: String(r.Tipo),
      concepto: String(r.Concepto || ''),
      monto: _num(r.Monto),
      metodo: String(r.Método || ''),
      notas: String(r.Notas || ''),
      usuario: String(r.Usuario || '')
    })).reverse();
    CACHE.put(cacheKey, JSON.stringify(lista.slice(0,200)), 60);
  }
  return lista.slice(0, limite || 50);
}

// ==================== ARQUEO MANUAL ====================
function realizarArqueo(fechaInicio, fechaFin, montoApertura, montoContado, notas, token) {
  if (!_requiereAuth(token)) return { ok: false, msg: 'Sesión' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const inicio = new Date(fechaInicio); inicio.setHours(0,0,0,0);
    const fin = new Date(fechaFin); fin.setHours(23,59,59,999);
    const sesion = validarSesion(token);
    
    const ventas = _leerTabla(HOJAS.VENTAS);
    let totalVentas = 0, numTickets = 0, efectivo = 0, tarjeta = 0, qr = 0;
    ventas.forEach(v => {
      const f = new Date(v.Fecha);
      if (f >= inicio && f <= fin && v.Estado !== 'Anulada') {
        const t = _num(v.Total);
        totalVentas += t; numTickets++;
        const m = String(v.Método || 'Efectivo');
        if (m === 'Efectivo') efectivo += t;
        else if (m === 'Tarjeta') tarjeta += t;
        else qr += t;
      }
    });
    
    const movs = _leerTabla(HOJAS.MOVIMIENTOS);
    let otrosIngresos = 0, egresos = 0;
    movs.forEach(m => {
      const f = new Date(m.Fecha);
      if (f >= inicio && f <= fin) {
        const monto = _num(m.Monto);
        if (m.Tipo === 'Ingreso' && !String(m.Concepto).startsWith('Venta')) otrosIngresos += monto;
        if (m.Tipo === 'Egreso' && !String(m.Concepto).startsWith('Anulación')) egresos += monto;
      }
    });
    
    const apertura = _num(montoApertura);
    const contado = _num(montoContado);
    const esperado = apertura + totalVentas + otrosIngresos - egresos;
    const diferencia = contado - esperado;
    
    _hoja(HOJAS.ARQUEO).appendRow([
      new Date(), 'MANUAL', apertura, totalVentas, efectivo, tarjeta, qr,
      otrosIngresos, egresos, esperado, contado, diferencia,
      numTickets, 0, sesion.nombre, notas || ''
    ]);
    
    return {
      ok: true, numTickets,
      fechaInicio: Utilities.formatDate(inicio, TZ, 'dd/MM/yyyy'),
      fechaFin: Utilities.formatDate(fin, TZ, 'dd/MM/yyyy'),
      montoApertura: apertura, totalVentas, efectivo, tarjeta, qr,
      otrosIngresos, egresos, saldoEsperado: esperado,
      montoContado: contado, diferencia
    };
  } finally {
    lock.releaseLock();
  }
}