const CACHE_NAME = 'pointage-hr-v34';
const FILES = [
  './index.html',
  './manifest.json',
  './favicon.ico',
  './favicon-32.png',
  './favicon-16.png',
  './favicon-white.ico',
  './favicon-white-32.png',
  './favicon-white-16.png',
  './logo-pointage-transparent.png',
  './logo-pointage-interface.png',
  './icon-192.png',
  './icon-512.png'
];

function corrigerIndex(html) {
  return html
    .replace(
      "envoyerGoogleSheets({ silencieux: true, autoriserVide: true });\n    return;",
      "envoyerGoogleSheets({ silencieux: true, autoriserVide: !!options.autoriserVideServeur });\n    return;"
    )
    .replace(
      "envoyerGoogleSheets({ silencieux: true, autoriserVide: true });\n  }, DELAI_SAUVEGARDE_AUTO);",
      "envoyerGoogleSheets({ silencieux: true, autoriserVide: false });\n  }, DELAI_SAUVEGARDE_AUTO);"
    )
    .replace(
      "return envoyerGoogleSheets({ silencieux: options.silencieux !== false, autoriserVide: true, rerendre: false });",
      "return envoyerGoogleSheets({ silencieux: options.silencieux !== false, autoriserVide: !!options.autoriserVideServeur, rerendre: false });"
    )
    .replace(
      "return envoyerGoogleSheets({ ...options, forcer: true, silencieux: true, autoriserVide: true });",
      "return envoyerGoogleSheets({ ...options, forcer: true, silencieux: true, autoriserVide: !!options.autoriserVideServeur });"
    )
    .replace(
      "if (!options.autoriserVide && lignesNonVides.length === 0) {\n      if (!options.silencieux) afficherToast('Aucune donnée à envoyer');\n      return false;\n    }",
      "if (!options.autoriserVide && lignesNonVides.length === 0) {\n      sauvegardeServeurDemandee = false;\n      afficherStatutEnvoi('Aucune donnée à sauvegarder', 'var(--gris-fonce)');\n      if (!options.silencieux) afficherToast('Aucune donnée à envoyer');\n      return true;\n    }"
    )
    .replace(
      "semaineAu: document.getElementById('date-fin').value,\n          lignes: lignesNonVides.map((l, index) => ({",
      "semaineAu: document.getElementById('date-fin').value,\n          autoriserVide: !!options.autoriserVide,\n          lignes: lignesNonVides.map((l, index) => ({"
    )
    .replace(
      "renderTableau(); sauvegarder(); afficherToast('Feuille réinitialisée');",
      "renderTableau(); sauvegarder({ autoriserVideServeur:true }); afficherToast('Feuille réinitialisée');"
    );
}

async function reponseIndexCorrigee(request) {
  const cached = await caches.match(request);
  let response = cached;

  if (!response) {
    response = await fetch(request);
  }

  const html = await response.clone().text();
  return new Response(corrigerIndex(html), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'Cache-Control': 'no-cache'
    }
  });
}

// Installation — mise en cache des fichiers
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES))
  );
  self.skipWaiting();
});

// Activation — suppression des anciens caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — sert l'index corrigé, sinon depuis le cache puis le réseau
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const estIndex = e.request.method === 'GET' && (
    e.request.mode === 'navigate' ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/Projet-pointage-des-heures-HR/')
  );

  if (estIndex) {
    e.respondWith(reponseIndexCorrigee(e.request));
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
