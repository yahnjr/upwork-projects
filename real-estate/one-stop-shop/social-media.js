mapboxgl.accessToken = 'pk.eyJ1IjoiaWZvcm1haGVyIiwiYSI6ImNsaHBjcnAwNDF0OGkzbnBzZmUxM2Q2bXgifQ.fIyIgSwq1WWVk9CKlXRXiQ';
let localSocial, nationalSocial, nationalAccountData;
let hoverStateId = null;
let hoverTimer = null;
let isOverPanel = false;
let isOverNationalLayer = false;
let showMode = true;

let socialMap = new mapboxgl.Map({
    container: 'social-media-map',
    style: 'mapbox://styles/mapbox/dark-v11',
    bounds: [
        [-128.272, 30.165],
        [-64.152, 48.046]
    ],
    zoom: 4 
});

function loadSocialMedia() {
    console.log('Starting to load data...');
    
    Promise.all([
        fetch('resources/LocalSocialMedia.geojson').then(response => {
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return response.json();
        }),
        fetch('resources/NationalAccounts.geojson').then(response => {
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return response.json();
        }),
        fetch('resources/NationalAccountData.json').then(response => {
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return response.json();
        })
    ])
    .then(([localSocialData, nationalSocialData, nationalData]) => {
        console.log('Data loaded successfully');

        localSocial = localSocialData;
        nationalSocial = nationalSocialData;
        nationalAccountData = nationalData;
        
        socialMap.addSource('nationalSocial', {
            type: 'geojson',
            data: nationalSocial
        });
        
        socialMap.addLayer({
            id: 'national-social',
            type: 'fill',
            source: 'nationalSocial',
            paint: {
                'fill-color': '#33ff99',
                'fill-opacity': 0.0,
                'fill-opacity-transition': {
                    duration: 200,
                    delay: 0
                }
            }
        });
        
        socialMap.addSource('localSocial', {
            type: 'geojson',
            data: localSocial,
            cluster: true, 
            clusterMaxZoom: 14, 
            clusterRadius: 50 
        });
        

        socialMap.addLayer({
            id: 'clusters',
            type: 'circle',
            source: 'localSocial',
            filter: ['has', 'point_count'],
            paint: {
                'circle-radius': [
                    'step',
                    ['get', 'point_count'],
                    20, 
                    10, 
                    30, 
                    50,
                    40 
                ],
                'circle-color': [
                    'step',
                    ['get', 'point_count'],
                    '#51bbd6', 
                    10,
                    '#2196F3',
                    50,
                    '#0D47A1'
                ],
                'circle-opacity': 0.8
            }
        });
        

        socialMap.addLayer({
            id: 'cluster-count',
            type: 'symbol',
            source: 'localSocial',
            filter: ['has', 'point_count'],
            layout: {
                'text-field': '{point_count_abbreviated}',
                'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
                'text-size': 12
            },
            paint: {
                'text-color': '#ffffff'
            }
        });
        
        socialMap.addLayer({
            id: 'unclustered-point',
            type: 'symbol',
            source: 'localSocial',
            filter: ['!', ['has', 'point_count']],
            layout: {
                'icon-image': 'fblogo',
                'icon-size': .3
            }
        });
        
        socialMap.on('click', 'clusters', (e) => {
            const features = socialMap.queryRenderedFeatures(e.point, {
                layers: ['clusters']
            });
            
            const clusterId = features[0].properties.cluster_id;
            socialMap.getSource('localSocial').getClusterExpansionZoom(
                clusterId,
                (err, zoom) => {
                    if (err) return;
                    
                    socialMap.easeTo({
                        center: features[0].geometry.coordinates,
                        zoom: zoom
                    });
                }
            );
        });

        socialMap.on('click', 'unclustered-point', (e) => {
            const properties = e.features[0].properties;

            createOrUpdatePopup(properties);
        });
        
        socialMap.on('mouseenter', 'clusters', () => {
            socialMap.getCanvas().style.cursor = 'pointer';
        });
        socialMap.on('mouseleave', 'clusters', () => {
            socialMap.getCanvas().style.cursor = '';
        });
        
        socialMap.on('mouseenter', 'unclustered-point', () => {
            socialMap.getCanvas().style.cursor = 'pointer';
        });
        socialMap.on('mouseleave', 'unclustered-point', () => {
            socialMap.getCanvas().style.cursor = '';
        });

        setupHoverListeners();
    })
    .catch(error => {
        console.error('Error loading data:', error);
    });
}

function populateAccountsList() {
    const accountsList = document.getElementById('accounts-list');

    if (!nationalAccountData || nationalAccountData.length === 0) {
        accountsList.innerHtml = '<p>No national account data available</p>';
        return;
    }

    let listHTML = '<ul>';

    nationalAccountData.forEach(account => {
        console.log(account.Link);
        listHTML += `<li class="national-list-item" data-community-name="${account.Community_Name || ''}">
            <strong>${account.Community_Name}</strong><br>
            </li>
            `
    });

    listHTML += '</ul>';
    accountsList.innerHTML = listHTML;

    const accountMap = {};
    nationalAccountData.forEach(account => {
        accountMap[account.Community_Name] = account;
    });

    nationalListItems = document.querySelectorAll('.national-list-item');
    nationalListItems.forEach((item) => {
        item.addEventListener('click', () => {
            const accountId = item.getAttribute('data-community-name');
            accountData = accountMap[accountId];
            createOrUpdatePopup(accountData);
        });
    });
}

function showPanel() {
    const panel = document.getElementById('national-accounts-panel');

    if (showMode == false) {
        return;
    }

    if(!nationalAccountData) {
        console.warn('Attempted to show panel before data was loaded');
        return;
    }

    if (!panel.classList.contains('visible')) {
        populateAccountsList();
        panel.classList.remove('hidden');
        panel.classList.add('visible');
    }
}

function hidePanel() {
    if (!isOverPanel) {
        const panel = document.getElementById('national-accounts-panel');

        if (panel.classList.contains('minimized')) {
            return;
        }

        panel.classList.remove('visible');
        panel.classList.add('hidden');
    }
}

function setupHoverListeners() {
        console.log("Establishing event listeners with data: ", nationalAccountData);

        socialMap.on('mousemove', (e) => {
            if (hoverTimer) clearTimeout(hoverTimer);

            const localFeatures = socialMap.queryRenderedFeatures(e.point, {
                layers: ['unclustered-point', 'clusters']
            });

            if (localFeatures.length > 0) {
                isOverNationalLayer = false;
                hoverTimer = setTimeout(hidePanel, 200);
            } else {
                const nationalFeatures = socialMap.queryRenderedFeatures(e.point, {
                    layers: ['national-social']
                });

                if (nationalFeatures.length > 0) {
                    isOverNationalLayer = true;
                    if (showMode === true) {
                        socialMap.setPaintProperty('national-social', 'fill-opacity', 0.1);
                    }
                    hoverTimer = setTimeout(showPanel, 100);
                } else {
                    isOverNationalLayer = false;
                    socialMap.setPaintProperty('national-social', 'fill-opacity', 0);
                    hoverTimer = setTimeout(hidePanel, 200);
                }
            }
        });
}

function createOrUpdatePopup(properties) {
    const existingPopup = document.getElementById('docked-popup');
    if (existingPopup) {
        existingPopup.remove();
    }

    const popup = document.createElement('div');
    popup.id = 'docked-popup';
    popup.className = 'docked-popup';
    let featuresArray = [];
    if (typeof properties.Selected_Communities === 'string') {
        featuresArray = properties.Selected_Communities
            .split(',')
            .map(item => item.trim());
    }
    console.log(featuresArray);

    popup.innerHTML = `
        <div class="popup-header">
            <a href="${properties.Link}" target="_blank" style="text-decoration:none"><div class="popup-header-link">
                <img src="resources/facebook-icon.png" style="width: 25px; height: 25px; object-fit: cover; display: inline; margin-right: 5px;">
                <h3 class="popup-head-name">${properties.Community_Name || 'Unnamed Partner'}</h3>
            </div></a>
            <button class="close-button" id="close-popup">×</button>
        </div>
        <div class="popup-content">
            <div class="popup-detail"><strong>Location:</strong> ${properties.State || ""}</div>
            <div class="popup-detail"> ${properties.New_Member_Intro || 'N/A'}</div>
            <div class="popup-detail"><strong>Description:</strong> ${properties.Description || 'N/A'}</div>
            <ul id="features-list"></ul>
        </div>
    `;

    document.body.appendChild(popup);

    const featuresList = document.getElementById('features-list');

    featuresArray.forEach(feature => {
        featureListItem = document.createElement("li");
        featureListItem.innerHTML = `✔️ ${feature}`;

        featuresList.appendChild(featureListItem);
    })

    document.getElementById('close-popup').addEventListener('click', () => {
        closePopup();
    });
}

function closePopup() {
    document.getElementById('docked-popup').style.display = 'none';
}

document.getElementById('national-accounts-panel').addEventListener('mouseenter', () => {
    isOverPanel = true;
});

document.getElementById('national-accounts-panel').addEventListener('mouseleave', () => {
    isOverPanel = false;
    if (!isOverNationalLayer) {
        setTimeout(hidePanel, 200);
    }
});

document.getElementById('hide-national-list').addEventListener('click', function() {
    showMode = false;
    document.getElementById('hide-national-list').style.display = 'none';
    document.getElementById('show-national-list').style.display = 'block';

    const panel = document.getElementById('national-accounts-panel');
    panel.classList.remove('visible');
    panel.classList.add('minimized');

    document.getElementById('accounts-list').innerHTML = '';
});

document.getElementById('show-national-list').addEventListener('click', function() {
    showMode = true;
    document.getElementById('show-national-list').style.display = 'none';
    document.getElementById('hide-national-list').style.display = 'block';

    const panel = document.getElementById('national-accounts-panel');
    panel.classList.remove('minimized');

    if (isOverNationalLayer) {
        populateAccountsList();
        panel.classList.remove('hidden');
        panel.classList.add('visible');
    }
});

socialMap.getCanvas().addEventListener('mouseleave', () => {
    socialMap.setPaintProperty('national-social', 'fill-opacity', 0);
})

socialMap.on('load', function() {
    socialMap.loadImage(
        'resources/facebook-icon.png',
        (error, image) => {
            if (error) throw error;

            socialMap.addImage('fblogo', image);
        });

    loadSocialMedia();
});