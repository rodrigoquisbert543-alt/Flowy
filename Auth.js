/**
 * AUTENTICACIÓN POR PIN
 */

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function loginPIN(pin) {
  if (!pin || String(pin).length < 4) return { ok: false, msg: 'PIN inválido' };
  
  const usuarios = _leerTabla(HOJAS.USUARIOS).filter(u => u.Activo === true || u.Activo === 'TRUE');
  const user = usuarios.find(u => String(u.PIN) === String(pin));
  
  if (!user) {
    _log('LOGIN_FALLIDO', 'PIN incorrecto');
    return { ok: false, msg: 'PIN incorrecto' };
  }
  
  const token = Utilities.getUuid();
  const sesion = {
    email: user.Email,
    nombre: user.Nombre,
    rol: user.Rol,
    expira: Date.now() + SESSION_TTL_MS
  };
  
  PROPS.setProperty('sesion_' + token, JSON.stringify(sesion));
  _log('LOGIN', user.Nombre + ' (' + user.Rol + ')');
  
  return { ok: true, token, usuario: sesion };
}

function validarSesion(token) {
  if (!token) return null;
  const raw = PROPS.getProperty('sesion_' + token);
  if (!raw) return null;
  try {
    const sesion = JSON.parse(raw);
    if (sesion.expira < Date.now()) {
      PROPS.deleteProperty('sesion_' + token);
      return null;
    }
    return sesion;
  } catch(e) { return null; }
}

function logout(token) {
  if (token) PROPS.deleteProperty('sesion_' + token);
  return { ok: true };
}

function _usuarioActual(token) {
  if (token) {
    const s = validarSesion(token);
    if (s) return s.nombre;
  }
  try { return Session.getActiveUser().getEmail() || 'sistema'; }
  catch(e) { return 'sistema'; }
}

function _requiereAdmin(token) {
  const s = validarSesion(token);
  if (!s) return false;
  return s.rol === 'admin';
}

function _requiereAuth(token) {
  const s = validarSesion(token);
  return s !== null;
}

function listarUsuarios(token) {
  if (!_requiereAdmin(token)) return { ok: false, msg: 'Sin permisos' };
  return _leerTabla(HOJAS.USUARIOS).map(u => ({
    email: u.Email,
    nombre: u.Nombre,
    rol: u.Rol,
    activo: u.Activo === true || u.Activo === 'TRUE',
    fechaAlta: u.FechaAlta ? _fecha(u.FechaAlta) : ''
  }));
}

function guardarUsuario(token, data) {
  if (!_requiereAdmin(token)) return { ok: false, msg: 'Sin permisos' };
  
  const email = String(data.email || '').trim().toLowerCase();
  const nombre = String(data.nombre || '').trim();
  const pin = String(data.pin || '').trim();
  const rol = data.rol || 'cajero';
  
  if (!email || !nombre) return { ok: false, msg: 'Email y nombre obligatorios' };
  if (!['admin','cajero','barista','mesero'].includes(rol)) return { ok: false, msg: 'Rol inválido' };
  
  const hoja = _hoja(HOJAS.USUARIOS);
  const datos = hoja.getDataRange().getValues();
  
  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][0]).toLowerCase() === email) {
      hoja.getRange(i+1, 2, 1, 3).setValues([[nombre, pin || datos[i][2], rol]]);
      hoja.getRange(i+1, 5).setValue(true);
      _log('USUARIO_EDIT', email);
      return { ok: true, msg: 'Usuario actualizado' };
    }
  }
  
  hoja.appendRow([email, nombre, pin || '0000', rol, true, new Date(), '']);
  _log('USUARIO_NUEVO', email);
  return { ok: true, msg: 'Usuario creado' };
}

function eliminarUsuario(token, email) {
  if (!_requiereAdmin(token)) return { ok: false, msg: 'Sin permisos' };
  const hoja = _hoja(HOJAS.USUARIOS);
  const datos = hoja.getDataRange().getValues();
  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][0]).toLowerCase() === String(email).toLowerCase()) {
      hoja.getRange(i+1, 5).setValue(false);
      _log('USUARIO_DESACTIVADO', email);
      return { ok: true };
    }
  }
  return { ok: false, msg: 'No encontrado' };
}