function backupDiario() {
  try {
    const fecha = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd_HHmm');
    const nombre = `backup_cafe_${fecha}`;
    
    const file = DriveApp.getFileById(SS.getId());
    const copia = file.makeCopy(nombre);
    
    let carpetaId = _getConfig().backup_carpeta_id;
    if (!carpetaId) {
      const carpeta = DriveApp.createFolder('Backups Café FLOWY');
      carpetaId = carpeta.getId();
      
      const hoja = _hoja(HOJAS.CONFIG);
      const datos = hoja.getDataRange().getValues();
      for (let i = 1; i < datos.length; i++) {
        if (datos[i][0] === 'backup_carpeta_id') {
          hoja.getRange(i+1, 2).setValue(carpetaId);
          break;
        }
      }
      CACHE.remove('config_v3');
    }
    
    const carpeta = DriveApp.getFolderById(carpetaId);
    carpeta.addFile(copia);
    DriveApp.getRootFolder().removeFile(copia);
    
    const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30);
    carpeta.getFiles().forEach(f => {
      if (f.getDateCreated() < hace30) f.setTrashed(true);
    });
    
    _log('BACKUP_OK', nombre);
    return { ok: true, nombre };
  } catch(e) {
    _log('BACKUP_ERROR', e.toString());
    console.error(e);
    return { ok: false, error: e.toString() };
  }
}

function backupManual(token) {
  if (!_requiereAdmin(token)) return { ok: false, msg: 'Solo admin' };
  return backupDiario();
}