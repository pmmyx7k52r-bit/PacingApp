// PacingApp Service Worker 6.0.8.5
// Liegt unter /PacingApp/sw.js

self.addEventListener('install', function(e) { self.skipWaiting(); });
self.addEventListener('activate', function(e) { e.waitUntil(clients.claim()); });

// Pause-Zeitstempel in IndexedDB speichern (überlebt SW-Neustart)
function dbSet(key, val) {
    return new Promise(function(res, rej) {
        var req = indexedDB.open('pacing', 1);
        req.onupgradeneeded = function(e) { e.target.result.createObjectStore('kv'); };
        req.onsuccess = function(e) {
            var tx = e.target.result.transaction('kv', 'readwrite');
            tx.objectStore('kv').put(val, key);
            tx.oncomplete = res;
            tx.onerror = rej;
        };
        req.onerror = rej;
    });
}

function dbGet(key) {
    return new Promise(function(res, rej) {
        var req = indexedDB.open('pacing', 1);
        req.onupgradeneeded = function(e) { e.target.result.createObjectStore('kv'); };
        req.onsuccess = function(e) {
            var tx = e.target.result.transaction('kv', 'readonly');
            var r = tx.objectStore('kv').get(key);
            r.onsuccess = function() { res(r.result); };
            r.onerror = rej;
        };
        req.onerror = rej;
    });
}

var TEXTS = {
    de: {
        w1: 'Pause läuft seit {m} Min. — vergessen zu beenden?',
        w2: 'Schon {m} Min.! Bitte Pause beenden.',
        w3: '{m} Min. Pause! Sofort beenden!',
        t1: 'PacingApp \uD83D\uDC9C',
        t2: 'PacingApp \uD83D\uDFE0',
        t3: 'PacingApp \uD83D\uDD34 Pause!'
    },
    en: {
        w1: 'Rest running {m} min — forgotten to end?',
        w2: 'Already {m} min! Please end rest.',
        w3: '{m} min rest! End immediately!',
        t1: 'PacingApp \uD83D\uDC9C',
        t2: 'PacingApp \uD83D\uDFE0',
        t3: 'PacingApp \uD83D\uDD34 Rest!'
    },
    nl: {
        w1: 'Rust loopt al {m} min — vergeten?',
        w2: 'Al {m} min! Beeindig de rust.',
        w3: '{m} min rust! Direct beeindigen!',
        t1: 'PacingApp \uD83D\uDC9C',
        t2: 'PacingApp \uD83D\uDFE0',
        t3: 'PacingApp \uD83D\uDD34 Rust!'
    },
    fr: {
        w1: 'Repos depuis {m} min — oublie?',
        w2: 'Deja {m} min! Terminez le repos.',
        w3: '{m} min de repos! Terminez!',
        t1: 'PacingApp \uD83D\uDC9C',
        t2: 'PacingApp \uD83D\uDFE0',
        t3: 'PacingApp \uD83D\uDD34 Repos!'
    },
    es: {
        w1: 'Descanso {m} min — olvidaste terminar?',
        w2: 'Ya {m} min! Termina el descanso.',
        w3: '{m} min! Termina ahora!',
        t1: 'PacingApp \uD83D\uDC9C',
        t2: 'PacingApp \uD83D\uDFE0',
        t3: 'PacingApp \uD83D\uDD34 Descanso!'
    }
};

function txt(lang, key, m) {
    var l = TEXTS[lang] || TEXTS['de'];
    return (l[key] || '').replace('{m}', m);
}

function showNotif(title, body, tag, req) {
    return self.registration.showNotification(title, {
        body: body,
        tag: tag,
        requireInteraction: req || false,
        vibrate: req ? [300,100,300,100,300] : [200,100,200],
        renotify: true
    });
}

// Kern: periodisch prüfen via fetch+waitUntil Trick
// Jede "Runde" plant die nächste selbst — so bleibt SW aktiv
function scheduleCheck(delayMs) {
    // waitUntil mit einem Promise das erst nach delayMs resolved
    // Damit sagt der SW iOS: "ich bin noch beschäftigt"
    self.registration.active && self.clients.matchAll().then(function() {
        setTimeout(function() { doCheck(); }, delayMs);
    });
}

function doCheck() {
    dbGet('pauseStart').then(function(startTs) {
        if (!startTs) { return; } // Keine aktive Pause
        
        var minuten = Math.round((Date.now() - startTs) / 60000);
        
        dbGet('lang').then(function(lang) {
            lang = lang || 'de';
            
            Promise.all([dbGet('warn1'), dbGet('warn2'), dbGet('warn3')]).then(function(warns) {
                var w1 = warns[0], w2 = warns[1], w3 = warns[2];
                
                if (minuten >= 90 && !w3) {
                    dbSet('warn3', true);
                    showNotif(txt(lang,'t3',minuten), txt(lang,'w3',minuten), 'pause-90', true);
                } else if (minuten >= 60 && !w2) {
                    dbSet('warn2', true);
                    showNotif(txt(lang,'t2',minuten), txt(lang,'w2',minuten), 'pause-60', true);
                } else if (minuten >= 30 && !w1) {
                    dbSet('warn1', true);
                    showNotif(txt(lang,'t1',minuten), txt(lang,'w1',minuten), 'pause-30', false);
                }
                
                // Nächste Prüfung in 5 Min planen — solange Pause läuft
                scheduleCheck(5 * 60 * 1000);
            });
        });
    });
}

self.addEventListener('message', function(e) {
    if (!e.data) { return; }
    
    if (e.data.type === 'PAUSE_START') {
        var ts = e.data.ts || Date.now();
        dbSet('pauseStart', ts);
        dbSet('warn1', false);
        dbSet('warn2', false);
        dbSet('warn3', false);
        dbSet('lang', e.data.lang || 'de');
        // Erste Prüfung in 5 Min
        scheduleCheck(5 * 60 * 1000);
    }
    
    if (e.data.type === 'PAUSE_END') {
        dbSet('pauseStart', null);
        dbSet('warn1', false);
        dbSet('warn2', false);
        dbSet('warn3', false);
    }
    
    if (e.data.type === 'SET_LANG') {
        dbSet('lang', e.data.lang || 'de');
    }
    
    if (e.data.type === 'NOTIFY') {
        showNotif(e.data.title, e.data.body, e.data.tag || 'pacing', e.data.requireInteraction);
    }
});

// Beim SW-Neustart: prüfen ob noch Pause läuft
self.addEventListener('activate', function(e) {
    e.waitUntil(
        clients.claim().then(function() {
            return dbGet('pauseStart');
        }).then(function(startTs) {
            if (startTs) {
                // Pause war aktiv als SW neu gestartet wurde — sofort prüfen
                scheduleCheck(1000);
            }
        })
    );
});

self.addEventListener('notificationclick', function(e) {
    e.notification.close();
    e.waitUntil(
        clients.matchAll({type:'window', includeUncontrolled:true}).then(function(cs) {
            for (var i = 0; i < cs.length; i++) {
                if (cs[i].url.indexOf('PacingApp') >= 0) { return cs[i].focus(); }
            }
            return clients.openWindow('https://pmmyx7k52r-bit.github.io/PacingApp/druck.html');
        })
    );
});
