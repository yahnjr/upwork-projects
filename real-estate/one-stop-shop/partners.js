mapboxgl.accessToken = 'pk.eyJ1IjoiaWZvcm1haGVyIiwiYSI6ImNsaHBjcnAwNDF0OGkzbnBzZmUxM2Q2bXgifQ.fIyIgSwq1WWVk9CKlXRXiQ';
let activeCompany = null;
let partnerData, geographicData;
let partnerSelectMode = null;
let selectedPoint = null;
let hoverPoint = null;
let hoverTimeout = null;
let localChecked, nationalChecked = true;

const partnerMap = new mapboxgl.Map({
    container: 'partners-map',
    style: 'mapbox://styles/mapbox/satellite-streets-v11',
    bounds: [
        [-128.272, 30.165],
        [-64.152, 48.046]
    ]
});

function loadPartnerData() {
    fetch('resources/businessPartners.geojson')
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
            const extentCoords = feature.properties.extent || '';
            const logo = feature.properties.logo || '';
            
            const partnerItem = document.createElement('div');
            partnerItem.className = 'partnerItem';
            partnerItem.setAttribute('data-coverage-loc', coverageLoc);
            
            partnerItem.innerHTML = `
                <img class="list-logo" src="resources/logos/${logo}.png">
                <div class="partnerDetails">
                    <div class="list-name-hq">
                        <div class="partnerName">${busName}</div>
                        <div class="partnerHQ">HQ: ${headquarters}</div>
                    </div>
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
    if (!partnerMap.getLayer('units-layer')) return;

    partnerMap.setLayoutProperty('units-layer', 'visibility', 'visible');

    partnerMap.setFilter('units-layer', ['==', ['get', 'cityState'], coverageLoc]);
    console.log(`Setting filter cityState == ${coverageLoc}`);
}

function resetGeographicUnitHighlight() {
    if (!activeCompany) {
        partnerMap.setLayoutProperty('units-layer', 'visibility', 'none');
    }
}

function selectPartner(feature) {
    if (typeof feature === 'string') {
        const businessName = feature;

        const matchingFeature = partnerData.features.find(f =>
            f.properties && f.properties.busName === businessName
        );

        if (matchingFeature) {
            feature = matchingFeature;
        } else {
            console.error('Could not find parner data for:', businessName);
            return;
        }
    }


    const properties = feature.properties;
    activeCompany = properties;
    const extentCoords = JSON.parse(properties.extentCoords);

    highlightGeographicUnit(properties.CoverageLoc);

    createOrUpdatePopup(properties);

    highlightSelectedPartnerItem(properties.CoverageLoc);

    const bounds = new mapboxgl.LngLatBounds(extentCoords[0], extentCoords[1]);
    console.log(bounds);

    partnerMap.fitBounds(bounds, {
        padding: 50,
        maxZoom: 15,
        duration: 1500
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

    popup.innerHTML = `
        <div class="popup-header">
            <h3>${properties.busName || 'Unnamed Partner'}</h3>
            <button class="close-button" id="close-popup">×</button>
        </div>
        <div class="popup-content">
            <div class="popup-detail"><strong>Headquarters:</strong> ${properties.Headquarters || 'N/A'}</div>
            <div class="popup-detail"><strong>Description:</strong> ${properties.description || 'N/A'}</div>
            <div class="popup-detail"><strong>Coverage Area:</strong> ${properties.CoverageLoc || 'N/A'}</div>
            <div class="popup-detail"><strong>Military Affiliation:</strong> ${properties.milAffil || 'N/A'}</div>
            ${properties.webLink ? `<a href="${properties.webLink}" target="_blank" class="popup-link">Visit Website</a>` : ''}
        </div>
        <img class="popup-logo" src="resources/logos/${properties.logo}.png">
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

    if (!window.isHoverPopup) {
        activeCompany = null;
        partnerMap.setLayoutProperty('units-layer', 'visibility', 'none');

        const selectedItems = document.querySelectorAll('.partnerItem.selected');
        selectedItems.forEach(item => item.classList.remove('selected'));
    }
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
    
    nationalCheckbox.removeEventListener('change', handleFilterChange);
    localCheckbox.removeEventListener('change', handleFilterChange);
    
    nationalCheckbox.addEventListener('change', handleFilterChange);
    localCheckbox.addEventListener('change', handleFilterChange);
    
    partnerMap.on('idle', function() {
        if (!partnerMap.getLayer('business-points')) return;
        applyMapFilter();
    });
}

function handleFilterChange() {
    applyMapFilter();

    if (partnerSelectMode === 'visible') {
        readExtentFeatures();
    } else if (partnerSelectMode === 'point' && selectedPoint) {
        const point = partnerMap.project(selectedPoint.getLngLat());
        const features = partnerMap.queryRenderedFeatures(point, { layers: ['invisible-units'] });
        updateSelectionList(features);
    }
}

function applyMapFilter() {
    const nationalChecked = document.getElementById('nationalCheckbox').checked;
    const localChecked = document.getElementById('localCheckbox').checked;
    
    if (!partnerMap.getLayer('business-points')) return;

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
    
    partnerMap.setFilter('business-points', filterExpression);
}

function loadFeatures() {
    Promise.all([
        fetch('resources/businessPartners.geojson').then(response => response.json()),
        fetch('resources/geographicUnits.geojson').then(response => response.json())
    ])
    .then(([partners, geographicUnits]) => {
        partnerData = partners;
        geographicData = geographicUnits;
        
        partnerMap.addSource('partners', {
            type: 'geojson',
            data: partnerData
        });
        
        partnerMap.addLayer({
            id: 'business-points',
            type: 'circle',
            source: 'partners',
            paint: {
                'circle-radius': 6,
                'circle-color': '#429ef5',
                'circle-opacity': 0.95
            }
        });
        
        partnerMap.addSource('geographicUnits', {
            type: 'geojson',
            data: geographicData
        });
        
        partnerMap.addLayer({
            id: 'invisible-units',
            type: 'fill',
            source: 'geographicUnits',
            paint: {
                'fill-color': '#33ff99',
                'fill-opacity': 0
            }
        });

        partnerMap.addLayer({
            id: 'units-layer',
            type: 'fill',
            source: 'geographicUnits',
            paint: {
                'fill-color': '#f5b042',
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

function setupMapClickHandlers() {
    partnerMap.on('click', 'business-points', (e) => {
        if (partnerSelectMode === 'point') return;

        const clickedFeature = e.features[0];
        if (clickedFeature) {
            window.isHoverPopup = false;
            selectPartner(clickedFeature);
        }
    });
}

document.getElementById('currentVisible').addEventListener('click', function() {
    partnerSelectMode = 'visible';
    document.getElementById('selectionList').style.display = 'block';
    document.getElementById('selectionList').style.height = 'auto';
    document.getElementById('selectionLabel').innerHTML = '<b>Visible Partners</b>';
    document.getElementById('listedFeatures').innerHTML = '';
    document.getElementById('coverageBox').style.display = 'none';

    readExtentFeatures();
});

function readExtentFeatures() {
    document.getElementById('listedFeatures').innerHTML = '';

    const features = partnerMap.queryRenderedFeatures({ layers: ['invisible-units']});
    updateSelectionList(features);
}

document.getElementById('currentPoint').addEventListener('click', function() {
    partnerSelectMode = 'point';
    document.getElementById('selectionList').style.display = 'block';
    document.getElementById('selectionList').style.height = 'auto';
    document.getElementById('selectionLabel').innerHTML = '<b>Partners Covering Selected Area</b>';
    document.getElementById('listedFeatures').innerHTML = '';
    document.getElementById('map').style.cursor = "crosshair";
    document.getElementById('coverageBox').style.display = 'none';

    setupPointHoverListener();
});

document.getElementById('viewList').addEventListener('click', function() {
    document.getElementById('coverageBox').style.display = 'block';
    closeSelectionList();
});

partnerMap.on('click', (e) => {
    if (partnerSelectMode != "point") return;

    const listContainer = document.getElementById('listedFeatures');

    partnerMap.off('mousemove', handlePointHover);

    listContainer.innerHtml = '';

    if (selectedPoint) {
        selectedPoint.remove();
    }

    selectedPoint = new mapboxgl.Marker().setLngLat(e.lngLat).addTo(map);

    const features = partnerMap.queryRenderedFeatures(e.point, { layers: ['invisible-units'] });
    console.log(features);
    updateSelectionList(features);
});

function updateSelectionList(features) {
    const listContainer = document.getElementById('listedFeatures');
    listContainer.innerHTML = '';
    
    if (features.length === 0) {
        listContainer.innerHTML = '<p>No matching features found.</p>'
        return;
    }

    const uniqueBusinesses = new Set();
    const nationalChecked = document.getElementById('nationalCheckbox').checked;
    const localChecked = document.getElementById('localCheckbox').checked;

    features.forEach(feature => {
        const businesses = feature.properties.businesses;
        
        if (businesses && businesses.trim() !== "") {
            const items = businesses.split(',,').map(item => item.trim()).filter(item => item !== "");

            if (items.length > 0) {
                items.forEach(item => uniqueBusinesses.add(item));
            }
        }
    });

    const sortedBusinesses = Array.from(uniqueBusinesses);
    let filteredBusinesses = [];

    sortedBusinesses.forEach(businessName => {
        const matchingFeature = partnerData.features.find(f => 
            f.properties && f.properties.busName === businessName
        );

        if (matchingFeature) {
            const coverage = matchingFeature.properties.Coverage;
            if ((nationalChecked && coverage === 'Nationwide') ||
                (localChecked && coverage === 'Local')) {
                    filteredBusinesses.push(matchingFeature)
                }
            }
    });

    if (document.getElementById('no-partners-notice')) {
        document.getElementById('no-partners-notice').remove();
    }

    if (filteredBusinesses.length === 0) {
        listContainer.innerHTML = '<p id="no-partners-notice">No partners in the selected area</p>'
        return;
    }

    filteredBusinesses.forEach(feature => {
        const properties = feature.properties;
        const logo = properties.logo || '';
        const busName = properties.busName || 'Unnamed';
        const headquarters = properties.Headquarters || 'N/A';
        const coverage = properties.Coverage || 'N/A';
        
        const listItem = document.createElement("div");
        listItem.classList.add('selection-item');
        
        listItem.innerHTML = `
            <img class="list-logo" src="resources/logos/${logo}.png">
            <div class="partnerDetails">
                <div class="list-name-hq">
                    <div class="partnerName">${busName}</div>
                    <div class="partnerHQ">HQ: ${headquarters} (Coverage: ${coverage})</div>
                </div>
            </div>
        `;
        
        listContainer.appendChild(listItem);
        
        listItem.addEventListener('click', function() {
            closeSelectionList();
            selectPartner(feature);
        });
    });
}

function setupHoverEffects() {
    partnerMap.on('mouseenter', 'business-points', (e) => {
        if (e.features.length > 0) {
            const feature = e.features[0];
            const properties = feature.properties;

            createOrUpdatePopup(properties);

            window.isHoverPopup = true;
        }
    });

    partnerMap.on('mouseleave', 'business-points', () => {
        if (window.isHoverPopup) {
            closePopup();
            window.isHoverPopup = false;
        }
    });
}

function setupPointHoverListener() {
    partnerMap.off('mousemove', handlePointHover);

    partnerMap.on('mousemove', handlePointHover);
}

function handlePointHover(e) {
    if (partnerSelectMode !== 'point') return;
    if (hoverTimeout) clearTimeout(hoverTimeout);

    hoverTimeout = setTimeout(() => {
        const features = partnerMap.queryRenderedFeatures(e.point, { layers: ['invisible-units'] });

        updateSelectionList(features);
    }, 100);
}

function closeSelectionList() {
    document.getElementById('selectionList').style.display = 'none';
    document.getElementById('listedFeatures').innerHTML = "";
    partnerSelectMode = null;
}

document.getElementById('close-list').addEventListener('click', function() {
    closeSelectionList();
});

document.addEventListener('DOMContentLoaded', function() {
    loadPartnerData();
});

partnerMap.on('moveend', () => {
    if (partnerSelectMode != 'visible') return;

    readExtentFeatures();
});

partnerMap.on('load', function() {
    loadFeatures();
    setupMapClickHandlers();
    setupHoverEffects();
});