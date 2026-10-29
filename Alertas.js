function verificarStockBajo() {
  const cfg = _getConfig();
  if (cfg.alerta_stock_bajo !== 'true') return;
  
  const productos = obtenerProductos(false, null).filter(p => 
    p.stock > 0 && p.stock <= p.stockMin
  );
  const insumos = obtenerInsumos().filter(i => i.alerta);
  
  if (!productos.length && !insumos.length) return;
  
  let msg = '⚠️ <b>Stock bajo</b>\n\n';
  if (productos.length) {
    msg += '<b>Productos:</b>\n';
    productos.forEach(p => msg += `• ${p.nombre}: ${p.stock} (min ${p.stockMin})\n`);
    msg += '\n';
  }
  if (insumos.length) {
    msg += '<b>Insumos:</b>\n';
    insumos.forEach(i => msg += `• ${i.nombre}: ${i.stock} ${i.unidad} (min ${i.stockMin})\n`);
  }
  
  _enviarTelegram(msg);
}

function enviarReporteDiario() {
  const res = obtenerResumenDia(null);
  const top = obtenerTopProductos(1, null);
  
  let msg = `📊 <b>Reporte del día</b>\n`;
  msg += `📅 ${Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy')}\n\n`;
  msg += `<b>Ventas:</b> ${_bs(res.total)}\n`;
  msg += `<b>Tickets:</b> ${res.cantidad}\n`;
  msg += `<b>Promedio:</b> ${_bs(res.ticketPromedio)}\n\n`;
  msg += `<b>Por método:</b>\n`;
  msg += `💵 Efectivo: ${_bs(res.efectivo)}\n`;
  msg += `💳 Tarjeta: ${_bs(res.tarjeta)}\n`;
  msg += `📱 QR: ${_bs(res.qr)}\n`;
  if (res.anulados) msg += `❌ Anulados: ${res.anulados}\n`;
  
  if (top.length) {
    msg += `\n<b>Top productos:</b>\n`;
    top.slice(0, 5).forEach((p, i) => {
      msg += `${i+1}. ${p.nombre}: ${p.cantidad} unid. (${_bs(p.total)})\n`;
    });
  }
  
  _enviarTelegram(msg);
}

function _enviarTelegram(mensaje) {
  const cfg = _getConfig();
  if (!cfg.telegram_token || !cfg.telegram_admin) return;
  
  try {
    const url = `https://api.telegram.org/bot${cfg.telegram_token}/sendMessage`;
    UrlFetchApp.fetch(url, {
      method: 'post',
      payload: {
        chat_id: cfg.telegram_admin,
        text: mensaje,
        parse_mode: 'HTML'
      }
    });
  } catch(e) {
    console.error('Error Telegram:', e);
  }
}

function probarTelegram(token) {
  _enviarTelegram('🧪 <b>Test</b> del sistema Café FLOWY');
  return { ok: true, msg: 'Enviado (revisa tu Telegram)' };
}