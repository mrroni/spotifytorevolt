let lastTrackId = null; // Son çalan parça ID'sini sakla
let lastStatusMessage = ''; // Son durum mesajını sakla
let currentAccessToken = ''; // Mevcut erişim tokenını sakla

// Çerezleri ayarlamak için bir yardımcı fonksiyon
function setCookie(name, value, days) {
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000)); // Gün cinsinden
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/"; // Çerezi ayarla
}

// Çerezleri okumak için bir yardımcı fonksiyon
function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null; // Çerez yoksa null döndür
}

// Form submit işlemi
document.getElementById('credentials-form').addEventListener('submit', function (event) {
    event.preventDefault();

    const clientId = document.getElementById('client-id').value.trim();
    const clientSecret = document.getElementById('client-secret').value.trim();
    const refreshToken = document.getElementById('refresh-token').value.trim();
    const revoltToken = document.getElementById('revolt-token').value.trim();

    if (!revoltToken) {
        alert('Lütfen geçerli bir Revolt tokenı girin.');
        return;
    }

    // Çerezlere kaydet
    setCookie('clientId', clientId, 30); // 30 gün boyunca sakla
    setCookie('clientSecret', clientSecret, 30);
    setCookie('refreshToken', refreshToken, 30);
    setCookie('revoltToken', revoltToken, 30);

    console.log('Revolt Token:', revoltToken);

    // Hemen bir kez çalıştır, beklemeden durumu güncelle
    checkCurrentTrack(revoltToken, clientId, clientSecret, refreshToken);

    // Sürekli kontrol için belirli bir aralık belirleyin (5 saniye)
    setInterval(() => {
        checkCurrentTrack(revoltToken, clientId, clientSecret, refreshToken);
    }, 5000); // Her 5 saniyede bir kontrol et
});

// Sayfa yüklendiğinde çerezlerden bilgileri al
window.onload = function() {
    const savedClientId = getCookie('clientId');
    const savedClientSecret = getCookie('clientSecret');
    const savedRefreshToken = getCookie('refreshToken');
    const savedRevoltToken = getCookie('revoltToken');

    if (savedClientId) document.getElementById('client-id').value = savedClientId;
    if (savedClientSecret) document.getElementById('client-secret').value = savedClientSecret;
    if (savedRefreshToken) document.getElementById('refresh-token').value = savedRefreshToken;
    if (savedRevoltToken) document.getElementById('revolt-token').value = savedRevoltToken;
};

// Token yenileme fonksiyonu
function refreshSpotifyToken(clientId, clientSecret, refreshToken) {
    const tokenUrl = 'https://accounts.spotify.com/api/token';
    const body = `grant_type=refresh_token&refresh_token=${refreshToken}`;

    return fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Authorization': 'Basic ' + btoa(clientId + ':' + clientSecret),
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Spotify Token Yenileme Hatası: ${response.status} - ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        const newAccessToken = data.access_token;
        console.log('Yeni Spotify Erişim Tokenı:', newAccessToken);
        currentAccessToken = newAccessToken; // Mevcut erişim tokenını güncelle
        return newAccessToken;
    })
    .catch(error => {
        console.error('Token Yenileme Başarısız:', error);
        return null;
    });
}

// Şu anda çalan parçayı kontrol et
function checkCurrentTrack(revoltToken, clientId, clientSecret, refreshToken) {
    if (!currentAccessToken) {
        console.error('Erişim tokenı mevcut değil.');
        return refreshSpotifyToken(clientId, clientSecret, refreshToken).then(newToken => {
            if (newToken) {
                currentAccessToken = newToken; // Yeni tokenı güncelle
                return checkCurrentTrack(revoltToken, clientId, clientSecret, refreshToken); // Tekrar dene
            } else {
                throw new Error('Yeni token alınamadı.');
            }
        });
    }

    fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${currentAccessToken}`
        }
    })
    .then(response => {
        if (response.status === 401) { // Token süresi dolmuşsa
            console.log('Access token süresi dolmuş, yenileme işlemi başlatılıyor...');
            return refreshSpotifyToken(clientId, clientSecret, refreshToken).then(newToken => {
                if (newToken) {
                    currentAccessToken = newToken; // Yeni tokenı güncelle
                    return checkCurrentTrack(revoltToken, clientId, clientSecret, refreshToken); // Tekrar dene
                } else {
                    throw new Error('Yeni token alınamadı.');
                }
            });
        } else if (response.status === 400) { // Hatalı istek
            console.error('Spotify API Hatası: 400 - Bad Request');
            clearRevoltStatus(revoltToken);
            document.getElementById('status-message').textContent = 'Geçersiz istek yapıldı, muhtemelen aktif bir çalar yok.';
            return;
        } else if (!response.ok) {
            throw new Error(`Spotify API Hatası: ${response.status} - ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        // Spotify data işleme
        if (data && data.item) {
            const trackId = data.item.id; // Çalan parçanın ID'si
            const trackName = data.item.name;
            const artist = data.item.artists.map(artist => artist.name).join(', ');
            const statusMessage = `Listening to Spotify: ${trackName} - ${artist} 📋`;
            document.getElementById('status-message').textContent = statusMessage;

            // Şarkı değişti mi?
            if (trackId !== lastTrackId || statusMessage !== lastStatusMessage) {
                lastTrackId = trackId; // Yeni parçayı kaydet
                lastStatusMessage = statusMessage; // Durum mesajını kaydet
                updateRevoltStatus(statusMessage, revoltToken);
            } else {
                console.log('Şarkı aynı, durumu güncelleme gereksiz.');
            }
        } else {
            console.warn('Spotify şarkı bilgisi alınamadı. Şu an çalan bir şarkı yok.');
            clearRevoltStatus(revoltToken);
            document.getElementById('status-message').textContent = 'Spotify\'dan çalan şarkı bilgisi alınamadı.';
        }
    })
    .catch(error => {
        console.error('Spotify API Hatası:', error);
        clearRevoltStatus(revoltToken);
        document.getElementById('status-message').textContent = 'Spotify API isteği başarısız oldu: ' + error.message;
    });
}

// Revolt durumunu güncelle
function updateRevoltStatus(statusMessage, revoltToken) {
    fetch('https://api.revolt.chat/users/@me', {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'x-session-token': revoltToken
        },
        body: JSON.stringify({
            status: {
                text: statusMessage
            }
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Revolt API Hatası: ${response.status} - ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('Revolt durumu güncellendi:', data);
        document.getElementById('status-message').textContent = 'Durum güncellendi: ' + statusMessage;
    })
    .catch(error => {
        console.error('Revolt API Hatası:', error);
        clearRevoltStatus(revoltToken);
        document.getElementById('status-message').textContent = 'Revolt API isteği başarısız oldu: ' + error.message;
    });
}

// Revolt durumunu temizle
function clearRevoltStatus(revoltToken) {
    fetch('https://api.revolt.chat/users/@me', {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'x-session-token': revoltToken
        },
        body: JSON.stringify({
            status: {
                text: '' // Durumu temizle (boş bırak)
            }
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Revolt API Hatası: ${response.status} - ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('Revolt durumu silindi:', data);
    })
    .catch(error => {
        console.error('Revolt API durumu silme hatası:', error);
    });
}
