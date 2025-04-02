mapboxgl.accessToken = 'pk.eyJ1IjoiaWZvcm1haGVyIiwiYSI6ImNsaHBjcnAwNDF0OGkzbnBzZmUxM2Q2bXgifQ.fIyIgSwq1WWVk9CKlXRXiQ';
let activeCompany = null;
let partnerData, geographicData;

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/satellite-streets-v11',
    bounds: [
        [-128.272, 30.165],
        [-64.152, 48.046]
    ]
});

function loadPartnerData() {
    fetch('businessPartners.geojson')
        .then(response => response.json())
        .then(data => {
            processPartnerData(data);
            setupControls();
        })
        .catch(error => {
            console.error('Error loading business partner data:', error);
        });
}

function processPartnerData(geojsonData) {
    const nationalDropdown = document.getElementById('nationalDropdown');
    const localDropdown = document.getElementById('localDropdown');
    
    nationalDropdown.innerHTML = '';
    localDropdown.innerHTML = '';
    
    if (!geojsonData.features || !Array.isArray(geojsonData.features)) {
        console.error('Invalid GeoJSON format: features array not found');
        return;
    }
    
    geojsonData.features.forEach(feature => {
        if (feature.properties && feature.properties.Coverage) {
            const coverage = feature.properties.Coverage;
            const busName = feature.properties.busName || 'Unnamed';
            const webLink = feature.properties.webLink || '#';
            const headquarters = feature.properties.Headquarters || 'N/A';
            const coverageLoc = feature.properties.CoverageLoc || '';
            
            const partnerItem = document.createElement('div');
            partnerItem.className = 'partnerItem';
            partnerItem.setAttribute('data-coverage-loc', coverageLoc);
            
            partnerItem.innerHTML = `
                <div class="partnerName">${busName}</div>
                <div class="partnerDetails">
                    <div class="partnerHQ">HQ: ${headquarters}</div>
                    <a href="${webLink}" target="_blank" class="partnerWebsite">Website</a>
                </div>
            `;

            partnerItem.addEventListener('mouseenter', () => highlightGeographicUnit(coverageLoc));
            partnerItem.addEventListener('mouseleave', () => resetGeographicUnitHighlight());
            partnerItem.addEventListener('click', () => selectPartner(feature));

            if (coverage === 'Nationwide') {
                nationalDropdown.appendChild(partnerItem);
            } else if (coverage === 'Local') {
                localDropdown.appendChild(partnerItem);
            }
        }
    });
    
    if (nationalDropdown.children.length === 0) {
        nationalDropdown.innerHTML = '<div class="noPartners">No national partners found</div>';
    }
    
    if (localDropdown.children.length === 0) {
        localDropdown.innerHTML = '<div class="noPartners">No local partners found</div>';
    }
}

function highlightGeographicUnit(coverageLoc) {
    if (!map.getLayer('units-layer')) return;

    map.setLayoutProperty('units-layer', 'visibility', 'visible');

    map.setFilter('units-layer', ['==', ['get', 'cityState'], coverageLoc]);
    console.log(`Setting filter cityState == ${coverageLoc}`);
}

function resetGeographicUnitHighlight() {
    if (!activeCompany) {
        map.setLayoutProperty('units-layer', 'visibility', 'none');
    }
}

function selectPartner(feature) {
    const properties = feature.properties;
    activeCompany = properties;

    highlightGeographicUnit(properties.CoverageLoc);

    createOrUpdatePopup(properties);

    highlightSelectedPartnerItem(properties.CoverageLoc);
}

function createOrUpdatePopup(properties) {
    const existingPopup = document.getElementById('docked-popup');
    if (existingPopup) {
        existingPopup.remove();
    }

    const popup = document.createElement('div');
    popup.id = 'docked-popup';
    popup.className = 'docked-popup';

    popup.innerHTML = `
        <div class="popup-header">
            <h3>${properties.busName || 'Unnamed Partner'}</h3>
            <button id="close-popup">×</button>
        </div>
        <div class="popup-content">
            <div class="popup-detail"><strong>Headquarters:</strong> ${properties.Headquarters || 'N/A'}</div>
            <div class="popup-detail"><strong>Coverage:</strong> ${properties.Coverage || 'N/A'}</div>
            <div class="popup-detail"><strong>Coverage Area:</strong> ${properties.CoverageLoc || 'N/A'}</div>
            ${properties.webLink ? `<a href="${properties.webLink}" target="_blank" class="popup-link">Visit Website</a>` : ''}
        </div>
    `;

    document.body.appendChild(popup);

    document.getElementById('close-popup').addEventListener('click', () => {
        closePopup();
    });
}

function closePopup() {
    const popup = document.getElementById('docked-popup');
    if (popup) {
        popup.remove();
    }

    activeCompany = null;
    map.setLayoutProperty('units-layer', 'visibility', 'none');

    const selectedItems = document.querySelectorAll('.partnerItem.selected');
    selectedItems.forEach(item => item.classList.remove('selected'));
}

function highlightSelectedPartnerItem(coverageLoc) {
    const selectedItems = document.querySelectorAll('.partnerItem.selected');
    selectedItems.forEach(item => item.classList.remove('selected'));

    const partnerItems = document.querySelectorAll(`.partnerItem[data-coverage-loc="${coverageLoc}"]`);
    partnerItems.forEach(item => item.classList.add('selected'));
}

function setupControls() {
    setupDropdownToggles();
    setupMapFilters();
}

function setupDropdownToggles() {
    const nationalToggle = document.getElementById('nationalToggle');
    const localToggle = document.getElementById('localToggle');
    
    const nationalDropdown = document.getElementById('nationalDropdown');
    const localDropdown = document.getElementById('localDropdown');
    
    nationalToggle.addEventListener('click', function() {
        const isExpanded = nationalDropdown.classList.toggle('expanded');
        this.textContent = isExpanded ? '▼' : '▶';
    });
    
    localToggle.addEventListener('click', function() {
        const isExpanded = localDropdown.classList.toggle('expanded');
        this.textContent = isExpanded ? '▼' : '▶';
    });
}

function setupMapFilters() {
    const nationalCheckbox = document.getElementById('nationalCheckbox');
    const localCheckbox = document.getElementById('localCheckbox');
    
    map.on('idle', function() {
        if (!map.getLayer('business-points')) return;

        applyMapFilter();
        
        nationalCheckbox.addEventListener('change', applyMapFilter);
        localCheckbox.addEventListener('change', applyMapFilter);
    });
}

function applyMapFilter() {
    const nationalChecked = document.getElementById('nationalCheckbox').checked;
    const localChecked = document.getElementById('localCheckbox').checked;
    
    if (!map.getLayer('business-points')) return;

    let filterExpression = ['any'];
    
    if (nationalChecked) {
        filterExpression.push(['==', ['get', 'Coverage'], 'Nationwide']);
    }
    
    if (localChecked) {
        filterExpression.push(['==', ['get', 'Coverage'], 'Local']);
    }

    if (!nationalChecked && !localChecked) {
        filterExpression = ['==', ['get', 'Coverage'], 'none_selected'];
    }
    
    map.setFilter('business-points', filterExpression);
}

function loadFeatures() {
    Promise.all([
        fetch('businessPartners.geojson').then(response => response.json()),
        fetch('geographicUnits.geojson').then(response => response.json())
    ])
    .then(([partners, geographicUnits]) => {
        partnerData = partners;
        geographicData = geographicUnits;
        
        map.addSource('partners', {
            type: 'geojson',
            data: partnerData
        });
        
        map.addLayer({
            id: 'business-points',
            type: 'circle',
            source: 'partners',
            paint: {
                'circle-radius': 6,
                'circle-color': '#007cbf',
                'circle-opacity': 0.8
            }
        });
        
        map.addSource('geographicUnits', {
            type: 'geojson',
            data: geographicData
        });
        
        map.addLayer({
            id: 'units-layer',
            type: 'fill',
            source: 'geographicUnits',
            paint: {
                'fill-color': '#33ff99',
                'fill-opacity': 0.3,
                'fill-outline-color': '#d7f531'
            },
            layout: {
                'visibility': 'none'
            }
        });

        setupMapFilters();
    })
    .catch(error => {
        console.error('Error loading data:', error);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    loadPartnerData();
});

map.on('load', function() {
    loadFeatures();

    // map.on('styledata', function() {
    //     if (map.getLayer('units-layer')) {
    //         map.setLayoutProperty('units-layer', 'visibility', 'none');
    //     }
    // });
});