// ============================================================
// POINTAGE HR OCCITANIE - Google Apps Script
// ============================================================

const SHEET_ID = '17ZjP2D0cNcyMlITwioRs6gPACQxXsKSueRa4aDcvE60';
const SS = SpreadsheetApp.openById(SHEET_ID);

// ============================================================
// UTILITAIRES GLOBAUX
// ============================================================

function str(v) {
  return String(v || '').trim();
}

function normaliserDate(d) {
  if (!d) return '';

  if (d instanceof Date) {
    const a = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const j = String(d.getDate()).padStart(2, '0');
    return `${a}-${m}-${j}`;
  }

  const s = str(d);
  if (s.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    const [j, m, a] = s.split('/');
    return `${a}-${m}-${j}`;
  }

  return s;
}

function estSemaineValidee(idEmp, semaine) {
  const validation = getValidation(idEmp, semaine);
  return Boolean(validation && validation.visaResponsable);
}

function getEmployeById(idEmp) {
  const sheet = SS.getSheetByName('EMPLOYÉS');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const [id, nom, prenom, pin, role] = data[i];
    if (str(id) === str(idEmp)) {
      return {
        id: str(id),
        nom: str(nom),
        prenom: str(prenom),
        role: str(role)
      };
    }
  }

  return { id: str(idEmp), nom: '', prenom: '', role: '' };
}

function getAuditSheet() {
  const headers = ['DATE_ACTION', 'ACTION', 'ID_EMPLOYE', 'NOM', 'PRENOM', 'SEMAINE', 'UTILISATEUR', 'DETAIL'];
  let sheet = SS.getSheetByName('AUDIT');

  if (!sheet) {
    sheet = SS.insertSheet('AUDIT');
    sheet.appendRow(headers);
    return sheet;
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }

  return sheet;
}

function journaliserAudit(action, infos) {
  try {
    const sheet = getAuditSheet();
    sheet.appendRow([
      new Date().toLocaleString('fr-FR'),
      str(action),
      str(infos.idEmploye || ''),
      str(infos.nom || ''),
      str(infos.prenom || ''),
      str(infos.semaine || ''),
      str(infos.utilisateur || ''),
      str(infos.detail || '')
    ]);
  } catch (err) {
    // L'audit ne doit jamais bloquer le pointage.
  }
}

// ============================================================
// POINTS D'ENTREE
// ============================================================

function doGet(e) {
  const action = e.parameter.action;

  try {
    if (action === 'login')        return repondre(login(e.parameter.pin));
    if (action === 'getEmployes')  return repondre(getEmployes());
    if (action === 'getPointages') return repondre(getPointages(e.parameter.idEmploye));
    if (action === 'getSemaine')   return repondre(getSemaine(e.parameter.idEmploye, e.parameter.semaine));
  } catch (err) {
    return repondre({ ok: false, erreur: err.message });
  }

  return repondre({ ok: false, erreur: 'Action inconnue' });
}

function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  const action = payload.action;

  try {
    if (action === 'sauvegarder')       return repondre(sauvegarder(payload));
    if (action === 'signerEmploye')     return repondre(signerEmploye(payload));
    if (action === 'signerResponsable') return repondre(signerResponsable(payload));
  } catch (err) {
    return repondre({ ok: false, erreur: err.message });
  }

  return repondre({ ok: false, erreur: 'Action inconnue' });
}

// ============================================================
// LISTE DES EMPLOYES
// ============================================================

function getEmployes() {
  const sheet = SS.getSheetByName('EMPLOYÉS');
  const data = sheet.getDataRange().getValues();
  const employes = [];

  for (let i = 1; i < data.length; i++) {
    const [id, nom, prenom, pin, role] = data[i];
    if (id && str(role) !== 'responsable') {
      employes.push({
        id: str(id),
        nom: str(nom),
        prenom: str(prenom),
        role: str(role)
      });
    }
  }

  return { ok: true, employes };
}

// ============================================================
// AUTH
// ============================================================

function login(pin) {
  if (!pin) return { ok: false, erreur: 'PIN manquant' };

  const sheet = SS.getSheetByName('EMPLOYÉS');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const [id, nom, prenom, pinSheet, role] = data[i];
    if (str(pinSheet) === str(pin)) {
      return {
        ok: true,
        employe: {
          id: str(id),
          nom: str(nom),
          prenom: str(prenom),
          role: str(role)
        }
      };
    }
  }

  return { ok: false, erreur: 'PIN incorrect' };
}

// ============================================================
// SAUVEGARDER
// ============================================================

function sauvegarder(payload) {
  const { idEmploye, nom, prenom, engin, semaineDu, semaineAu, lignes } = payload;
  if (!idEmploye || !semaineDu) {
    return { ok: false, erreur: 'Données incomplètes' };
  }

  const idEmp = str(idEmploye);
  const semaine = normaliserDate(semaineDu);

  if (estSemaineValidee(idEmp, semaine)) {
    journaliserAudit('TENTATIVE_MODIF_FEUILLE_VALIDEE', {
      idEmploye: idEmp,
      nom,
      prenom,
      semaine,
      utilisateur: `${prenom} ${nom}`,
      detail: 'Sauvegarde refusee : feuille deja validee par le responsable'
    });
    return { ok: false, erreur: 'Cette semaine est déjà validée par le responsable' };
  }

  const sheet = SS.getSheetByName('POINTAGES');
  supprimerLignesSemaine(sheet, idEmp, semaine);
  const lignesUtiles = (lignes || []).filter(l => l.jour || l.chantier || l.hdebut);

  lignesUtiles.forEach((l, index) => {
    sheet.appendRow([
      `${idEmp}_${semaine}_${index}`,
      idEmp,
      str(nom),
      str(prenom),
      str(engin || ''),
      semaine,
      normaliserDate(semaineAu),
      l.jour || '',
      l.bl || '',
      l.chantier || '',
      l.fdm || '',
      l.hdebut || '',
      l.hfin || '',
      l.pause || '',
      l.repas || 0,
      l.nuit || '',
      l.total || '',
      'EN_ATTENTE'
    ]);
  });

  initValidation(idEmp, semaine);
  journaliserAudit('SAUVEGARDE_FEUILLE', {
    idEmploye: idEmp,
    nom,
    prenom,
    semaine,
    utilisateur: `${prenom} ${nom}`,
    detail: `${lignesUtiles.length} ligne(s) sauvegardee(s)`
  });
  return { ok: true, message: 'Feuille sauvegardée' };
}

// ============================================================
// VISA EMPLOYE
// ============================================================

function signerEmploye(payload) {
  const idEmp = str(payload.idEmploye);
  const semaine = normaliserDate(payload.semaineDu);
  const idRef = `${idEmp}_${semaine}`;

  if (estSemaineValidee(idEmp, semaine)) {
    const emp = getEmployeById(idEmp);
    journaliserAudit('TENTATIVE_SIGNATURE_FEUILLE_VALIDEE', {
      idEmploye: idEmp,
      nom: emp.nom,
      prenom: emp.prenom,
      semaine,
      utilisateur: `${emp.prenom} ${emp.nom}`,
      detail: 'Signature refusee : feuille deja validee par le responsable'
    });
    return { ok: false, erreur: 'Cette semaine est déjà validée par le responsable' };
  }

  const sheet = SS.getSheetByName('VALIDATIONS');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (str(data[i][0]) === idRef) {
      sheet.getRange(i + 1, 2).setValue('SIGNÉ');
      sheet.getRange(i + 1, 3).setValue(new Date().toLocaleString('fr-FR'));
      majStatutPointages(idEmp, semaine, 'SIGNÉ_EMPLOYÉ');
      const emp = getEmployeById(idEmp);
      journaliserAudit('SIGNATURE_EMPLOYE', {
        idEmploye: idEmp,
        nom: emp.nom,
        prenom: emp.prenom,
        semaine,
        utilisateur: `${emp.prenom} ${emp.nom}`,
        detail: 'Feuille signee par le chauffeur'
      });
      return { ok: true, message: 'Visa employé apposé' };
    }
  }

  return { ok: false, erreur: `Semaine introuvable (ref: ${idRef})` };
}

// ============================================================
// VISA RESPONSABLE
// ============================================================

function signerResponsable(payload) {
  const idEmp = str(payload.idEmploye);
  const semaine = normaliserDate(payload.semaineDu);
  const idRef = `${idEmp}_${semaine}`;
  const sheet = SS.getSheetByName('VALIDATIONS');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (str(data[i][0]) === idRef) {
      if (str(data[i][1]) !== 'SIGNÉ') {
        return { ok: false, erreur: "L'employé n'a pas encore signé" };
      }

      if (str(data[i][3])) {
        return { ok: true, message: 'Feuille déjà validée' };
      }

      sheet.getRange(i + 1, 4).setValue('VALIDÉ par ' + str(payload.nomResponsable));
      sheet.getRange(i + 1, 5).setValue(new Date().toLocaleString('fr-FR'));
      majStatutPointages(idEmp, semaine, 'VALIDÉ');
      const emp = getEmployeById(idEmp);
      journaliserAudit('VALIDATION_RESPONSABLE', {
        idEmploye: idEmp,
        nom: emp.nom,
        prenom: emp.prenom,
        semaine,
        utilisateur: str(payload.nomResponsable),
        detail: 'Feuille validee par le responsable'
      });
      return { ok: true, message: 'Feuille validée' };
    }
  }

  return { ok: false, erreur: `Semaine introuvable (ref: ${idRef})` };
}

// ============================================================
// RECUPERER UNE SEMAINE PRECISE
// ============================================================

function getSemaine(idEmploye, semaine) {
  if (!idEmploye || !semaine) {
    return { ok: false, erreur: 'Paramètres manquants' };
  }

  const idEmp = str(idEmploye);
  const semaineRecherche = normaliserDate(semaine);
  const sheet = SS.getSheetByName('POINTAGES');
  const data = sheet.getDataRange().getValues();
  const entetes = data[0];

  const entetesCles = entetes.map(h =>
    h.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  );

  const idxEmploye = entetesCles.findIndex(h => h.includes('ID_EMPLOY'));
  const idxSemaine = entetesCles.findIndex(h => h === 'SEMAINE_DU');

  if (idxEmploye === -1 || idxSemaine === -1) {
    return { ok: false, erreur: `Colonnes introuvables (idxEmp=${idxEmploye}, idxSem=${idxSemaine})` };
  }

  const lignes = data.slice(1)
    .filter(row =>
      str(row[idxEmploye]) === idEmp &&
      normaliserDate(row[idxSemaine]) === semaineRecherche
    )
    .map(row => {
      const obj = {};
      entetesCles.forEach((cle, i) => obj[cle] = row[i]);
      return obj;
    });

  const validation = getValidation(idEmp, semaineRecherche);
  return { ok: true, lignes, validation };
}

// ============================================================
// RECUPERER TOUS LES POINTAGES D'UN EMPLOYE
// ============================================================

function getPointages(idEmploye) {
  if (!idEmploye) return { ok: false, erreur: 'ID manquant' };

  const idEmp = str(idEmploye);
  const sheet = SS.getSheetByName('POINTAGES');
  const data = sheet.getDataRange().getValues();
  const entetesCles = data[0].map(h =>
    h.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  );

  const lignes = data.slice(1)
    .filter(row => str(row[1]) === idEmp)
    .map(row => {
      const obj = {};
      entetesCles.forEach((cle, i) => obj[cle] = row[i]);
      return obj;
    });

  return { ok: true, lignes };
}

// ============================================================
// UTILITAIRES SHEET
// ============================================================

function initValidation(idEmp, semaine) {
  const idRef = `${idEmp}_${semaine}`;
  const sheet = SS.getSheetByName('VALIDATIONS');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (str(data[i][0]) === idRef) return;
  }

  sheet.appendRow([idRef, '', '', '', '']);
}

function getValidation(idEmp, semaine) {
  const idRef = `${idEmp}_${semaine}`;
  const sheet = SS.getSheetByName('VALIDATIONS');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (str(data[i][0]) === idRef) {
      return {
        visaEmploye: str(data[i][1]),
        dateVisaEmploye: str(data[i][2]),
        visaResponsable: str(data[i][3]),
        dateVisaResponsable: str(data[i][4])
      };
    }
  }

  return null;
}

function supprimerLignesSemaine(sheet, idEmp, semaine) {
  const data = sheet.getDataRange().getValues();

  for (let i = data.length - 1; i >= 1; i--) {
    if (str(data[i][1]) === idEmp && normaliserDate(data[i][5]) === semaine) {
      sheet.deleteRow(i + 1);
    }
  }
}

function majStatutPointages(idEmp, semaine, statut) {
  const sheet = SS.getSheetByName('POINTAGES');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (str(data[i][1]) === idEmp && normaliserDate(data[i][5]) === semaine) {
      sheet.getRange(i + 1, 18).setValue(statut);
    }
  }
}

function repondre(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
