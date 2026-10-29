// ==================== RESUMEN ====================
function obtenerResumenDia(token) {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const manana = new Date(hoy); manana.setDate(manana.getDate()+1);
  
  let total = 0, cantidad = 0, efectivo = 0, tarjeta = 0, qr = 0, anulados = 0;
  _leerTabla(HOJAS.VENTAS).forEach(v => {
    const f = new Date(v.Fecha);
    if (f >= hoy && f < manana) {
      if (v.Estado === 'Anulada') { anulados++; return; }
      const t = _num(v.Total);
      total += t; cantidad++;
      const m = String(v.Método || 'Efectivo');
      if (m === 'Efectivo') efectivo += t;
      else if (m === 'Tarjeta') tarjeta += t;
      else qr += t;
    }
  });
  
  const caja = _resumenMovimientos(hoy, manana);
  const res = {
    total, cantidad, efectivo, tarjeta, qr, anulados,
    ticketPromedio: cantidad ? total/cantidad : 0,
    otrosIngresos: caja.ingresos,
    egresos: caja.egresos,
    ingresosEfectivo: caja.ingresosEfectivo,
    egresosEfectivo: caja.egresosEfectivo,
    saldoCaja: total + caja.ingresos - caja.egresos,
    saldoEfectivo: efectivo + caja.ingresosEfectivo - caja.egresosEfectivo
  };
  return res;
}

// ==================== VENTAS POR HORA ====================
function obtenerVentasPorHora(token) {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const manana = new Date(hoy); manana.setDate(manana.getDate()+1);
  
  const horas = new Array(24).fill(0);
  _leerTabla(HOJAS.VENTAS).forEach(v => {
    const f = new Date(v.Fecha);
    if (f >= hoy && f < manana && v.Estado !== 'Anulada') {
      horas[f.getHours()] += _num(v.Total);
    }
  });
  return horas;
}

// ==================== TOP PRODUCTOS ====================
function obtenerTopProductos(dias, token) {
  const desde = new Date(); desde.setDate(desde.getDate() - (dias || 7));
  desde.setHours(0,0,0,0);
  
  const ventasValidas = {};
  _leerTabla(HOJAS.VENTAS).forEach(v => {
    if (v.Estado !== 'Anulada' && new Date(v.Fecha) >= desde) {
      ventasValidas[v.Ticket] = true;
    }
  });
  
  const contador = {};
  _leerTabla(HOJAS.ITEMS_VENTA).forEach(it => {
    if (!ventasValidas[it.Ticket]) return;
    const nombre = String(it.Nombre);
    if (!contador[nombre]) contador[nombre] = { cantidad: 0, total: 0 };
    contador[nombre].cantidad += _num(it.Cantidad);
    contador[nombre].total += _num(it.Subtotal);
  });
  
  const lista = Object.entries(contador)
    .map(([nombre, d]) => ({ nombre, ...d }))
    .sort((a,b) => b.cantidad - a.cantidad)
    .slice(0, 10);
  
  return lista;
}

// ==================== VENTAS POR DÍA ====================
function obtenerVentasUltimosDias(dias, token) {
  const ventas = _leerTabla(HOJAS.VENTAS);
  const resultado = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0,0,0,0);
    const dFin = new Date(d); dFin.setDate(dFin.getDate() + 1);
    
    let total = 0, tickets = 0;
    ventas.forEach(v => {
      const f = new Date(v.Fecha);
      if (f >= d && f < dFin && v.Estado !== 'Anulada') {
        total += _num(v.Total);
        tickets++;
      }
    });
    
    resultado.push({
      fecha: Utilities.formatDate(d, TZ, 'dd/MM'),
      total, tickets
    });
  }
  return resultado;
}

// ==================== MARGEN / RENTABILIDAD ====================
function obtenerRentabilidad(dias, token) {
  if (!_requiereAdmin(token)) return [];
  
  const desde = new Date(); desde.setDate(desde.getDate() - (dias || 30));
  desde.setHours(0,0,0,0);
  
  const ventasValidas = {};
  _leerTabla(HOJAS.VENTAS).forEach(v => {
    if (v.Estado !== 'Anulada' && new Date(v.Fecha) >= desde) {
      ventasValidas[v.Ticket] = true;
    }
  });
  
  const productos = obtenerProductos(false, token);
  const acum = {};
  _leerTabla(HOJAS.ITEMS_VENTA).forEach(it => {
    if (!ventasValidas[it.Ticket]) return;
    const nombre = String(it.Nombre);
    const p = productos.find(x => x.id === _num(it.ProductoID));
    const costo = p ? p.costo : 0;
    if (!acum[nombre]) acum[nombre] = { vendidos: 0, ingresos: 0, costoTotal: 0 };
    acum[nombre].vendidos += _num(it.Cantidad);
    acum[nombre].ingresos += _num(it.Subtotal);
    acum[nombre].costoTotal += costo * _num(it.Cantidad);
  });
  
  return Object.entries(acum).map(([nombre, d]) => ({
    nombre,
    vendidos: d.vendidos,
    ingresos: d.ingresos,
    costo: d.costoTotal,
    ganancia: d.ingresos - d.costoTotal,
    margen: d.ingresos ? ((d.ingresos - d.costoTotal) / d.ingresos * 100) : 0
  })).sort((a,b) => b.ganancia - a.ganancia);
}

// ==================== EXPORTAR ====================
function exportarVentasCSV(fechaInicio, fechaFin, token) {
  if (!_requiereAdmin(token)) return { ok: false, msg: 'Sin permisos' };
  const inicio = new Date(fechaInicio); inicio.setHours(0,0,0,0);
  const fin = new Date(fechaFin); fin.setHours(23,59,59,999);
  
  const ventas = _leerTabla(HOJAS.VENTAS).filter(v => {
    const f = new Date(v.Fecha);
    return f >= inicio && f <= fin;
  });
  
  let csv = 'Ticket,Fecha,Subtotal,Envío,Extras,Descuento,Total,Método,Cliente,Teléfono,TipoEntrega,Ciudad,Dirección,EstadoPedido,Guía,PesoGr,Estado,Usuario\n';
  ventas.forEach(v => {
    csv += [
      v.Ticket, _fecha(v.Fecha), v.Subtotal, v.Delivery, v.Extras,
      v.Descuento, v.Total, v.Método, v.Cliente, v.Telefono, v.TipoEntrega, v.Ciudad,
      v.Direccion, v.EstadoPedido, v.Guia, v.PesoGr, v.Estado, v.Usuario
    ].map(x => `"${String(x || '').replace(/"/g, '""')}"`).join(',') + '\n';
  });
  
  const nombre = `ventas_${fechaInicio}_${fechaFin}.csv`;
  const blob = Utilities.newBlob(csv, 'text/csv', nombre);
  const file = DriveApp.createFile(blob);
  
  return { ok: true, url: file.getUrl(), nombre };
}