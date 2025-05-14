mapboxgl.accessToken = 'pk.eyJ1IjoiaWZvcm1haGVyIiwiYSI6ImNsaHBjcnAwNDF0OGkzbnBzZmUxM2Q2bXgifQ.fIyIgSwq1WWVk9CKlXRXiQ';

let selectedProperties = [];
let fetchedAreas = new Set();
let activeDataLayers = []; 
let pointsOfInterest = [];
let maxPOIs = 3;
let activeRoutes = [];
let isAddingPOI = false;
let dataLayerTypes = {
    'Walkability': {
        id: 'walkability-layer',
        color: '#41b6c4',
        gradientColors: ['#0c2c84', '#41b6c4', '#e4f2f4'], 
        property: 'Walkability'
    },
    'Air Quality': {
        id: 'air-quality-layer',
        color: '#62de74',
        gradientColors: ['#28ac21', '#62de74', '#ecf8ed'],
        property: 'Air_Quality'
    },
    'Crime': {
        id: 'crime-layer',
        color: '#ffb757',
        gradientColors: ['#e34a33', '#ffb757', '#f7efdc'], 
        property: 'Crime' 
    }
};

let currentSortLayer = null;
let currentSortDirection = 'asc';
let lockedDataLayerId = null;

let map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/satellite-streets-v11',
    bounds: [
        [-128.272, 30.165],
        [-64.152, 48.046]
    ]
});

const propertiesPanel = document.getElementById('properties-panel');
const addColumnBtn = document.getElementById('add-column-btn');
const dropdown = document.getElementById('data-layer-dropdown');
const tableContainer = document.getElementById('property-table-container');
const table = document.getElementById('property-table');
const thead = document.querySelector('#property-table thead'); 
const headerRow = document.getElementById('property-table-header-row'); 
const tbody = document.getElementById('property-table-body'); 
const addressHeader = document.getElementById('address-header');
const legendContainer = document.getElementById('legend'); 

map.on('load', function () {
    parseUrlParams();

    console.log("Loading initial data");

    Promise.all([
        fetch('properties.geojson').then(response => response.json())
    ])
    .then(([propertiesData]) => {
        const properties = propertiesData;

        map.addSource('properties', {
            type: 'geojson',
            data: properties
        });

        map.addSource('census-data', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });

        map.addLayer({
            id: 'properties-layer',
            type: 'circle',
            source: 'properties',
            paint: {
                'circle-radius': 6,
                'circle-color': '#f5d442',
                'circle-opacity': 0.95
            },
            minzoom: 8
        });

        Object.values(dataLayerTypes).forEach(layerInfo => {
             map.addLayer({
                id: layerInfo.id,
                type: 'fill',
                source: 'census-data',
                paint: {
                    'fill-color': [
                        'interpolate',
                        ['linear'],
                        ['get', layerInfo.property],
                        0, layerInfo.gradientColors[0],
                        5, layerInfo.gradientColors[1],
                        10, layerInfo.gradientColors[2]
                    ],
                    'fill-opacity': 0.6
                },
                layout: {
                    'visibility': 'none' 
                },
                minZoom: 8
            });
        });

        map.addLayer({
            id: 'selected-properties',
            type: 'circle',
            source: 'properties',
            filter: ['in', 'uniqueID', ''],
            paint: {
                'circle-radius': 8,
                'circle-color': '#ff4d4d',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff'
            },
            minzoom: 8
        });

        map.on('mouseenter', 'properties-layer', function() {
            map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', 'properties-layer', function() {
            map.getCanvas().style.cursor = '';
        });

        map.on('click', 'properties-layer', function(e) {
            if (e.features.length > 0) {
                const property = e.features[0];
                const propertyId = property.properties.uniqueID;

                const alreadySelected = selectedProperties.some(p => p.id === propertyId);

                if (!alreadySelected) {
                    const coordinates = property.geometry.coordinates.slice();
                    const propertyAddress = property.properties.address || `Property #${propertyId}`;
                    const city = property.properties.city || '';

                    const newProperty = {
                        id: propertyId,
                        address: propertyAddress,
                        city: city,
                        coordinates: coordinates,
                        censusData: {
                            Walkability: 0,
                            Air_Quality: 0,
                            Crime: 0
                        }
                    };

                    selectedProperties.push(newProperty);

                    fetchCensusDataForArea(coordinates);
                    updatePropertyTable();
                    updateSelectedPropertiesLayer();

                    const selectedIds = selectedProperties.map(p => p.id);
                    const newUrl = new URL(window.location);
                    newUrl.searchParams.set('selected', selectedIds.join(','));
                    window.history.pushState({}, '', newUrl);
                }
            }
        });

        map.on('click', function(e) {
            if (!isAddingPOI) return;
            
            const coords = [e.lngLat.lng, e.lngLat.lat];
            addPointOfInterest(coords);
            
            isAddingPOI = false;
            map.getCanvas().style.cursor = '';
            
            const instructions = document.getElementById('poi-add-instructions');
            if (instructions) {
                instructions.remove();
            }
        });

        setupTableView();
        setupPOIFeatures();
    })
    .catch(error => {
        console.error("Error loading initial data:", error);
    });
});

function setupPOIFeatures() {
    map.addSource('poi-source', {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: []
        }
    });

    map.addLayer({
        id: 'poi-layer',
        type: 'circle',
        source: 'poi-source',
        paint: {
            'circle-radius': 8,
            'circle-color': '#fcba03',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
        }
    });

    map.addLayer({
        id: 'poi-labels',
        type: 'symbol',
        source: 'poi-source',
        layout: {
            'text-field': ['get', 'name'],
            'text-size': 14,
            'text-offset': [0, -1.5],
            'text-anchor': 'bottom'
        },
        paint: {
            'text-color': '#e91e63',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1
        }
    });
    
    map.addSource('routes-source', {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: []
        }
    });
    
    map.addLayer({
        id: 'routes-layer',
        type: 'line',
        source: 'routes-source',
        layout: {
            'line-join': 'round',
            'line-cap': 'round',
            'visibility': 'none'
        },
        paint: {
            'line-color': '#e91e63',
            'line-width': 3,
            'line-opacity': 0.8,
            'line-dasharray': [1, 2]
        }
    });
    
    createPOIUI();
}

function setupTableView() {
    console.log("Setting up table view and interactions");

    const dropdownItems = dropdown.querySelectorAll('.dropdown-item');
    dropdownItems.forEach(item => {
        item.addEventListener('click', function() {
            const layerName = this.getAttribute('data-layer-name');
            addDataLayer(layerName);
            dropdown.style.display = 'none'; 
        });
    });

    addColumnBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });

    document.addEventListener('click', function() {
        dropdown.style.display = 'none';
    });

    table.addEventListener('mouseover', handleTableMouseOver);
    table.addEventListener('mouseout', handleTableMouseOut);
    table.addEventListener('click', handleTableClick);
}

function handleTableMouseOver(e) {
    const target = e.target.closest('th.data-header, td.data-cell');
    if (target) {
        const layerName = target.getAttribute('data-layer');
        if (layerName) {
            if (layerName.startsWith('Travel to ')) {
                const poiId = target.getAttribute('data-poi-id');
                if (poiId) {
                    showAllRoutesForPOI(poiId);
                    
                    updateTravelTimeLegend(layerName);
                    legendContainer.style.display = 'block';
                    return;
                }
            }
            
            const layerInfo = dataLayerTypes[layerName];
            if (layerInfo) {
                setActiveDataLayer(layerInfo.id); 
            }
        }
    }
}

function handleTableMouseOut(e) {
    if (!table.contains(e.relatedTarget)) {
        hideAllDataLayers(); 
        if (!lockedDataLayerId) {
            legendContainer.style.display = 'none';
        } else {
            const lockedLayerName = Object.keys(dataLayerTypes).find(key => dataLayerTypes[key].id === lockedDataLayerId);
            if(lockedLayerName) {
               updateLegend(lockedLayerName);
               legendContainer.style.display = 'block';
            }
        }
    } else {
        const leavingElement = e.target.closest('th.data-header, td.data-cell');
        if (leavingElement) {
            const leavingLayerName = leavingElement.getAttribute('data-layer');
            const leavingLayerId = leavingLayerName ? dataLayerTypes[leavingLayerName]?.id : null;

            if (leavingLayerId && leavingLayerId !== lockedDataLayerId) {
                if (map.getLayer(leavingLayerId)) {
                    map.setLayoutProperty(leavingLayerId, 'visibility', 'none');
                }
                if (lockedDataLayerId && map.getLayer(lockedDataLayerId)) {
                    map.setLayoutProperty(lockedDataLayerId, 'visibility', 'visible');
                }
            }
        }
    }
}

function handleTableClick(e) {
    const target = e.target.closest('th.data-header, td.data-cell');
    if (target) {
        const layerName = target.getAttribute('data-layer');
        if (layerName) {
            if (layerName.startsWith('Travel to ')) {
                const poiId = target.getAttribute('data-poi-id');
                if (poiId) {
                    if (currentSortLayer === layerName) {
                        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
                    } else {
                        currentSortLayer = layerName;
                        currentSortDirection = 'asc';
                    }
                    
                    selectedProperties.sort((a, b) => {
                        const timeA = a.travelTimes && a.travelTimes[poiId] ? a.travelTimes[poiId] : 999;
                        const timeB = b.travelTimes && b.travelTimes[poiId] ? b.travelTimes[poiId] : 999;
                        
                        if (currentSortDirection === 'asc') {
                            return timeA - timeB;
                        } else {
                            return timeB - timeA;
                        }
                    });
                    
                    showAllRoutesForPOI(poiId);
                    updateTravelTimeLegend(layerName);
                    legendContainer.style.display = 'block';
                    
                    updatePropertyTable();
                    return;
                }
            }
            
            const layerInfo = dataLayerTypes[layerName];
            if (layerInfo) {
                if (currentSortLayer === layerName) {
                    currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    currentSortLayer = layerName;
                    currentSortDirection = 'asc';
                }

                const propertyKeyToSort = layerInfo.property;
                selectedProperties.sort((a, b) => {
                    const valA = a.censusData[propertyKeyToSort] || 0;
                    const valB = b.censusData[propertyKeyToSort] || 0;

                    if (currentSortDirection === 'asc') {
                        return valA - valB;
                    } else {
                        return valB - valA;
                    }
                });

                lockedDataLayerId = layerInfo.id; 

                updatePropertyTable(); 
                setActiveDataLayer(lockedDataLayerId); 

                console.log(`Sorted by ${layerName} (${currentSortDirection}). Layer ${lockedDataLayerId} locked.`);
            }
        }
    }
}


function addDataLayer(layerName) {
    if (activeDataLayers.includes(layerName)) {
        console.warn(`Layer "${layerName}" is already added.`);
        return;
    }

    activeDataLayers.push(layerName);

    const newHeader = document.createElement('th');
    newHeader.textContent = layerName;
    newHeader.setAttribute('data-layer', layerName);
    newHeader.classList.add('data-header');
    newHeader.style.position = 'relative';

    const removeBtn = document.createElement('span');
    removeBtn.innerHTML = '×';
    removeBtn.classList.add('remove-btn'); 
    removeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        removeDataLayer(layerName);
    });

    newHeader.appendChild(removeBtn);

    const addColumnHeader = headerRow.querySelector('#add-column-header');
    if (addColumnHeader) {
        headerRow.insertBefore(newHeader, addColumnHeader);
    } else {
        headerRow.appendChild(newHeader);
    }


    updatePropertyTable();
}

function removeDataLayer(layerName) {
    const index = activeDataLayers.indexOf(layerName);
    if (index > -1) {
        activeDataLayers.splice(index, 1);
    }

    const headerToRemove = headerRow.querySelector(`th[data-layer="${layerName}"]`);
    if (headerToRemove) {
        headerToRemove.remove();
    }

    if (currentSortLayer === layerName) {
        currentSortLayer = null;
        currentSortDirection = 'asc';
    }
    if (lockedDataLayerId === dataLayerTypes[layerName]?.id) {
        lockedDataLayerId = null;
        hideAllDataLayers(); 
        legendContainer.style.display = 'none';
    } else {
        hideAllDataLayers();
         if (!lockedDataLayerId) {
             legendContainer.style.display = 'none';
         }
    }

    updatePropertyTable();
}

function hideAllDataLayers() {
    Object.values(dataLayerTypes).forEach(layerInfo => {
        if (map.getLayer(layerInfo.id)) { 
            if (layerInfo.id !== lockedDataLayerId) {
                map.setLayoutProperty(layerInfo.id, 'visibility', 'none');
            }
        }
    });
}

function updatePropertyTable() {
    tbody.innerHTML = '';

    headerRow.querySelectorAll('.data-header').forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
        const existingIndicator = header.querySelector('.sort-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }

        if (header.getAttribute('data-layer') === currentSortLayer) {
            header.classList.add(`sort-${currentSortDirection}`);
            const indicator = document.createElement('span');
            indicator.classList.add('sort-indicator');
            indicator.innerHTML = currentSortDirection === 'asc' ? ' ↑' : ' ↓';
            header.appendChild(indicator);
        }
    });

    selectedProperties.forEach(property => {
        const row = document.createElement('tr');
        row.setAttribute('data-property-id', property.id);

        const addressCell = document.createElement('td');
        addressCell.textContent = `${property.address}, ${property.city}`;
        addressCell.classList.add('address-cell');
        addressCell.title = `Click to remove ${property.address}`; 
        addressCell.style.cursor = 'pointer';

        row.appendChild(addressCell);

        activeDataLayers.forEach(layerName => {
            const dataCell = document.createElement('td');
            dataCell.setAttribute('data-layer', layerName);
            dataCell.classList.add('data-cell');

            if (layerName.startsWith('Travel to ')) {
                const poi = pointsOfInterest.find(p => `Travel to ${p.name}` === layerName);
                if (poi) {
                    dataCell.setAttribute('data-poi-id', poi.id);
                    const travelTime = property.travelTimes && property.travelTimes[poi.id] !== undefined
                        ? property.travelTimes[poi.id]
                        : '—';
                    let bgColor = '#cccccc';
                    if (typeof travelTime === 'number') {
                        if (travelTime < 10) bgColor = 'rgba(0, 255, 0, 0.3)';
                        else if (travelTime < 30) bgColor = 'rgba(255, 255, 0, 0.3)';
                        else if (travelTime < 60) bgColor = 'rgba(255, 165, 0, 0.3)';
                        else bgColor = '#ff0000';
                    }
                    dataCell.style.backgroundColor = bgColor;
                    const valueText = document.createElement('div');
                    valueText.textContent = typeof travelTime === 'number' ? `${travelTime} min` : travelTime;
                    valueText.classList.add('value-text');
                    valueText.style.color = '#000';
                    dataCell.appendChild(valueText);
                    
                    if (typeof travelTime === 'number') {
                        const dataBarContainer = document.createElement('div');
                        dataBarContainer.classList.add('data-bar-container');
                        const dataBar = document.createElement('div');
                        dataBar.classList.add('data-bar');
                        const normalizedValue = Math.min(10, travelTime / 6);
                        dataBar.style.width = `${normalizedValue * 10}%`;
                        dataBar.style.backgroundColor = bgColor;
                        dataBarContainer.appendChild(dataBar);
                        dataCell.appendChild(dataBarContainer);
                    }
                }
            } else {
                const layerInfo = dataLayerTypes[layerName];
                let dataValue = property.censusData[layerInfo.property] || 0;
                dataValue = Math.max(0, Math.min(10, dataValue));

                let {cellColor, barColor } = getGradientColorForValue(layerName, dataValue);

                const dataBarContainer = document.createElement('div');
                dataBarContainer.classList.add('data-bar-container');

                const dataBar = document.createElement('div');
                dataBar.classList.add('data-bar');
                dataBar.style.width = `${dataValue * 10}%`; 
                dataCell.style.backgroundColor = cellColor;
                dataBar.style.backgroundColor = barColor; 

                dataBarContainer.appendChild(dataBar);

                const valueText = document.createElement('div');
                valueText.textContent = `${dataValue}/10`;
                valueText.classList.add('value-text'); 

                dataCell.appendChild(valueText);
                dataCell.appendChild(dataBarContainer);
            }

            row.appendChild(dataCell);
        });

        tbody.appendChild(row);
    });

    updatePanelWidth();
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function interpolateRgb(rgb1, rgb2, factor) {
    factor = Math.max(0, Math.min(1, factor)); 
    return {
        r: Math.round(rgb1.r + (rgb2.r - rgb1.r) * factor),
        g: Math.round(rgb1.g + (rgb2.g - rgb1.g) * factor),
        b: Math.round(rgb1.b + (rgb2.b - rgb1.b) * factor)
    };
}

function getGradientColorForValue(layerName, value) {
    const layerInfo = dataLayerTypes[layerName];
    if (!layerInfo || !layerInfo.gradientColors || layerInfo.gradientColors.length < 3) {
        console.warn(`Gradient colors not properly defined for layer: ${layerName}`);
        return '#ffffff';
    }

    const colors = layerInfo.gradientColors.map(hexToRgb);
    
    const normalizedValue = Math.max(0, Math.min(10, value)) / 10;
    
    let interpolatedRgb;

    if (normalizedValue <= 0.5) {
        const factor = normalizedValue * 2; 
        interpolatedRgb = interpolateRgb(colors[0], colors[1], factor);
    } else {
        const factor = (normalizedValue - 0.5) * 2;
        interpolatedRgb = interpolateRgb(colors[1], colors[2], factor);
    }

    console.log("Interpolated RGB:", interpolatedRgb);

    let cellColor = `rgba(${interpolatedRgb.r}, ${interpolatedRgb.g}, ${interpolatedRgb.b}, 0.3)`;
    let barColor = `rgba(${interpolatedRgb.r}, ${interpolatedRgb.g}, ${interpolatedRgb.b}, 0.9)`;
    
    return { cellColor, barColor };
}


function updatePanelWidth() {
    const addressHeaderWidth = addressHeader.getBoundingClientRect().width;
    const columnWidth = 150; 

    const totalWidth = addressHeaderWidth + (activeDataLayers.length * columnWidth);

    propertiesPanel.style.width = `${totalWidth}px`;
    propertiesPanel.style.maxWidth = `${totalWidth}px`;

    tableContainer.style.overflowX = (totalWidth > propertiesPanel.offsetWidth) ? 'auto' : 'hidden';
}

function parseUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const selectedParam = urlParams.get('selected');

    if (selectedParam && selectedParam.length > 0) {
        const selectedIds = selectedParam.split(',');
        console.log("Found selected IDs in URL:", selectedIds);

        const processSelectedIds = () => {
             console.log("Processing selected IDs from URL...");
             const propertiesSource = map.getSource('properties');

             if (propertiesSource && propertiesSource._data && propertiesSource._data.features) {
                 const propertiesData = propertiesSource._data;

                 let coordinatesForFetch = [];

                 selectedIds.forEach(id => {
                     const property = propertiesData.features.find(f =>
                         f.properties && f.properties.uniqueID === id 
                     );

                     if (property) {
                         console.log("Found matching property from URL ID:", id);
                         const coordinates = property.geometry.coordinates.slice();
                         const propertyId = property.properties.uniqueID;
                         const propertyAddress = property.properties.address || `Property #${propertyId}`;
                         const city = property.properties.city || '';

                         const censusData = {
                             Walkability: 0,
                             Air_Quality: 0,
                             Crime: 0
                         };

                         selectedProperties.push({
                             id: propertyId,
                             address: propertyAddress,
                             city: city,
                             coordinates: coordinates,
                             censusData: censusData
                         });

                         coordinatesForFetch.push(coordinates);
                     } else {
                         console.log("Could not find property with ID from URL:", id);
                     }
                 });

                 if (selectedProperties.length > 0) {
                     console.log(`Added ${selectedProperties.length} properties from URL.`);
                     updatePropertyTable();
                     updateSelectedPropertiesLayer();
                     zoomToSelectedProperties();

                     coordinatesForFetch.forEach(coordinates => {
                         fetchCensusDataForArea(coordinates);
                     });
                 }
                 return true;
             }
             return false;
        };

        if (map.getSource('properties') && map.isSourceLoaded('properties')) {
            setTimeout(processSelectedIds, 100);
        } else {
            map.on('sourcedata', function sourceDataListener(e) {
                if (e.sourceId === 'properties' && e.isSourceLoaded) {
                    setTimeout(() => {
                         if (processSelectedIds()) {
                             map.off('sourcedata', sourceDataListener); 
                         }
                    }, 100);
                }
            });
        }
    }
}

function mockFetchCensusData(bounds) {
    return new Promise((resolve) => {
        const features = [];
        const gridSize = 0.05;

        for (let lon = bounds.west; lon <= bounds.east; lon += gridSize) {
            for (let lat = bounds.south; lat <= bounds.north; lat += gridSize) {
                const walkabilityValue = Math.floor(Math.random() * 11); 
                const airQualityValue = Math.floor(Math.random() * 11);
                const crimeValue = Math.floor(Math.random() * 11);

                const polygon = {
                    type: 'Feature',
                    properties: {
                        GEOID: `${Math.round(lon * 1000)}-${Math.round(lat * 1000)}`,
                        NAME: `Tract ${Math.round(lon * 10)}-${Math.round(lat * 10)}`,
                        Walkability: walkabilityValue,
                        Air_Quality: airQualityValue,
                        Crime: crimeValue
                    },
                    geometry: {
                        type: 'Polygon',
                        coordinates: [[
                            [lon, lat],
                            [lon + gridSize, lat],
                            [lon + gridSize, lat + gridSize],
                            [lon, lat + gridSize],
                            [lon, lat]
                        ]]
                    }
                };

                features.push(polygon);
            }
        }

        setTimeout(() => {
            resolve({
                type: 'FeatureCollection',
                features: features
            });
        }, 500); 
    });
}


function fetchCensusDataForArea(coordinates) {
    const areaKey = `${Math.round(coordinates[0] * 100) / 100}-${Math.round(coordinates[1] * 100) / 100}`;

    if (fetchedAreas.has(areaKey)) {
        console.log(`Census data for area ${areaKey} already fetched`);
        updateSelectedPropertiesCensusData();
        return;
    }

    console.log(`Initiating fetch for census data around coordinates: [${coordinates[0]}, ${coordinates[1]}]`);

    fetchedAreas.add(areaKey);

    const radius = 0.3; 
    const bounds = {
        west: coordinates[0] - radius,
        south: coordinates[1] - radius,
        east: coordinates[0] + radius,
        north: coordinates[1] + radius
    };

    const geometry = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;

    const baseUrl = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/14/query?';
    const url = new URL(baseUrl);

    url.searchParams.append('geometry', geometry);
    url.searchParams.append('geometryType', 'esriGeometryEnvelope');
    url.searchParams.append('spatialRel', 'esriSpatialRelIntersects');
    url.searchParams.append('inSR', '4326');
    url.searchParams.append('outFields', 'GEOID,NAME');
    url.searchParams.append('f', 'geojson');

    console.log("Fetching data from:", url.toString());

    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(censusData => {
            console.log(`Received census data for area ${areaKey}.`, censusData);

            censusData.features.forEach(f => {
                const GEOID = f.properties.GEOID;
                const id = parseInt(GEOID, 10); 

                f.properties.Walkability = (id * 7 + 13) % 10;
                f.properties.Air_Quality = (id * 11 + 5) % 12; 
                f.properties.Crime = (id * 19 + 3) % 15; 

                 f.properties.Walkability = Math.max(0, Math.min(10, f.properties.Walkability));
                 f.properties.Air_Quality = Math.max(0, Math.min(10, f.properties.Air_Quality));
                 f.properties.Crime = Math.max(0, Math.min(10, f.properties.Crime));
            });


            const censusSource = map.getSource('census-data');

            if (censusSource) {
                const currentData = censusSource._data || { type: 'FeatureCollection', features: [] };

                if (currentData.features) {
                    const existingGeoIds = new Set(currentData.features.map(f => f.properties.GEOID));

                    const newFeatures = censusData.features.filter(f => !existingGeoIds.has(f.properties.GEOID));

                    const combinedData = {
                        type: 'FeatureCollection',
                        features: [...currentData.features, ...newFeatures]
                    };

                    censusSource.setData(combinedData);
                    console.log(`Added ${newFeatures.length} new census features to map source.`);

                    updateSelectedPropertiesCensusData();

                } else {
                     console.warn("Census source had data, but features array was missing or null. Setting new data.");
                     censusSource.setData(censusData);
                     updateSelectedPropertiesCensusData();
                }
            } else {
                console.error("Mapbox 'census-data' source not found.");
                 updateSelectedPropertiesCensusData();
            }
        })
        .catch(error => {
            console.error("Error fetching census data:", error);
            fetchedAreas.delete(areaKey);
        });
}


function updateSelectedPropertiesCensusData() {
    console.log("Updating selected properties with available census data...");
    const censusSource = map.getSource('census-data');

    if (!censusSource || !map.getSource('census-data')._data || !map.getSource('census-data')._data.features) {
        console.log("Census source data not available yet for updating properties. Setting defaults.");
        selectedProperties.forEach(property => {
            if (!property.censusData) property.censusData = {};
            property.censusData.Walkability = 0;
            property.censusData.Air_Quality = 0;
            property.censusData.Crime = 0;
        });
        updatePropertyTable();
        return;
    }

    const allCensusFeatures = map.getSource('census-data')._data.features;

    if (allCensusFeatures.length === 0) {
        console.log("Census features array is empty. No data to match. Setting defaults.");
        selectedProperties.forEach(property => {
            if (!property.censusData) property.censusData = {};
            property.censusData.Walkability = 0;
            property.censusData.Air_Quality = 0;
            property.censusData.Crime = 0;
        });
        updatePropertyTable();
        return;
    }

    selectedProperties.forEach(property => {
        if (!property.censusData) { 
            property.censusData = {};
        }

        const pointCoords = property.coordinates; 
        if (!pointCoords || pointCoords.length !== 2) {
            console.warn(`Property ID ${property.id} has invalid or missing coordinates.`);
            property.censusData.Walkability = 0;
            property.censusData.Air_Quality = 0;
            property.censusData.Crime = 0;
            return; 
        }

        const point = turf.point(pointCoords);

        const matchingCensusFeature = allCensusFeatures.find(feature => {
            if (feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
                try {
                    return turf.booleanPointInPolygon(point, feature.geometry);
                } catch (e) {
                    console.error(`Error in turf.booleanPointInPolygon for feature GEOID ${feature.properties.GEOID}:`, e);
                    return false;
                }
            }
            return false;
        });

        if (matchingCensusFeature && matchingCensusFeature.properties) {
            console.log(`Found census data for property ID ${property.id} in GEOID ${matchingCensusFeature.properties.GEOID}`);
            const censusProps = matchingCensusFeature.properties;
            property.censusData.Walkability = censusProps.Walkability !== undefined ? censusProps.Walkability : 0;
            property.censusData.Air_Quality = censusProps.Air_Quality !== undefined ? censusProps.Air_Quality : 0;
            property.censusData.Crime = censusProps.Crime !== undefined ? censusProps.Crime : 0;
        } else {
            console.log(`No specific census tract found for property ID ${property.id} at [${pointCoords.join(', ')}]. Setting defaults.`);
            property.censusData.Walkability = 0;
            property.censusData.Air_Quality = 0;
            property.censusData.Crime = 0;
        }
    });

    updatePropertyTable();
}


function updateSelectedPropertiesLayer() {
    const selectedIds = selectedProperties.map(p => p.id);
    if (map.getLayer('selected-properties')) { 
         if (selectedIds.length > 0) {
             map.setFilter('selected-properties', ['in', 'uniqueID', ...selectedIds]);
         } else {
             map.setFilter('selected-properties', ['in', 'uniqueID', '']);
         }
    }
}

function setActiveDataLayer(layerId) {
    hideAllDataLayers(); 

    if (map.getLayer(layerId)) {
         map.setLayoutProperty(layerId, 'visibility', 'visible');

         const layerName = Object.keys(dataLayerTypes).find(key => dataLayerTypes[key].id === layerId);
         if (layerName) {
             updateLegend(layerName); 
             legendContainer.style.display = 'block';
         } else {
              legendContainer.style.display = 'none';
         }

    } else {
        console.warn(`Attempted to set active layer, but layer ID "${layerId}" not found.`);
         legendContainer.style.display = 'none';
    }
}

function zoomToSelectedProperties() {
    if (selectedProperties.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    selectedProperties.forEach(p => {
        if (p.coordinates && p.coordinates.length === 2 && typeof p.coordinates[0] === 'number' && typeof p.coordinates[1] === 'number') {
             bounds.extend(p.coordinates);
        } else {
            console.warn(`Invalid coordinates for property ID ${p.id}:`, p.coordinates);
        }
    });

    if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
            padding: {top: 100, bottom: 100, left: 100, right: 100},
            duration: 1000
        });
    } else {
        console.log("No valid coordinates to zoom to.");
    }
}

function updateLegend(layerName) {
    const layerInfo = dataLayerTypes[layerName];
    if (!layerInfo) {
        console.error(`Legend requested for unknown layer: ${layerName}`);
        legendContainer.style.display = 'none'; 
        return;
    }

    const gradientColors = [...layerInfo.gradientColors];
    
    legendContainer.innerHTML = `
        <div class="legend-title">
            <span>${layerName}</span>
        </div>
        <div class="legend-gradient">
            <div class="legend-bar" style="background: linear-gradient(to top, ${gradientColors.join(', ')}); height: 150px; width: 30px;"></div>
            <div class="legend-labels">
                <div class="legend-label top">
                    Higher (10)
                </div>
                <div class="legend-label bottom">
                    Lower (0)
                </div>
            </div>
        </div>
    `;
}

function getGradientForLayer(layerName) {
    const layer = dataLayerTypes[layerName];
    if (layer) {
        return {
            colors: layer.gradientColors
        };
    }

    return {
        colors: ['#0c2c84', '#41b6c4', '#ffffcc']
    };
}

function createPOIUI() {
    const poiSection = document.getElementById('poi-section');
    
    const instructions = document.createElement('div');
    instructions.classList.add('poi-instructions');
    instructions.textContent = 'Click the + button and then the map to add a point of interest (max 3)';

    poiSection.insertBefore(instructions, poiList);
    
    updateDropdownWithTravelTimes();
}

function startAddingPOI() {
    if (pointsOfInterest.length >= maxPOIs) {
        alert(`Maximum of ${maxPOIs} points of interest allowed.`);
        return;
    }
    
    if (isAddingPOI) {
        isAddingPOI = false;
        map.getCanvas().style.cursor = '';
        return;
    }
    
    isAddingPOI = true;
    map.getCanvas().style.cursor = 'crosshair';
    
    const instructions = document.createElement('div');
    instructions.id = 'poi-add-instructions';
    instructions.classList.add('poi-add-instructions');
    
    document.body.appendChild(instructions);
}

function addPointOfInterest(coordinates) {
    if (pointsOfInterest.length >= maxPOIs) {
        alert(`Maximum of ${maxPOIs} points of interest allowed.`);
        return;
    }
    
    const poiIndex = pointsOfInterest.length + 1;
    const poi = {
        id: `poi-${poiIndex}`,
        name: `Point ${poiIndex}`,
        coordinates: coordinates
    };
    
    pointsOfInterest.push(poi);
    updatePOILayer();
    updatePOIList();
    updateDropdownWithTravelTimes();
}

function updatePOILayer() {
    const features = pointsOfInterest.map(poi => ({
        type: 'Feature',
        properties: {
            id: poi.id,
            name: poi.name
        },
        geometry: {
            type: 'Point',
            coordinates: poi.coordinates
        }
    }));
    
    const poiSource = map.getSource('poi-source');
    if (poiSource) {
        poiSource.setData({
            type: 'FeatureCollection',
            features: features
        });
    }
}

function updatePOIList() {
    const poiList = document.getElementById('poi-list');
    if (!poiList) return;
    
    poiList.innerHTML = '';
    
    if (pointsOfInterest.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.textContent = 'No points of interest added yet';
        emptyMessage.style.fontStyle = 'italic';
        emptyMessage.style.color = '#999';
        emptyMessage.style.textAlign = 'center';
        emptyMessage.style.padding = '10px';
        poiList.appendChild(emptyMessage);
        return;
    }
    
    pointsOfInterest.forEach((poi, index) => {
        const poiItem = document.createElement('div');
        poiItem.classList.add('poi-item');
        poiItem.style.borderBottom = index < pointsOfInterest.length - 1 ? '1px solid #eee' : 'none';
        
        const poiName = document.createElement('div');
        poiName.classList.add('poi-name');
        poiName.textContent = poi.name;
        poiName.title = 'Click to edit name';
        poiName.addEventListener('click', () => {
            const newName = prompt('Enter a new name for this point of interest:', poi.name);
            if (newName && newName.trim() !== '') {
                poi.name = newName.trim();
                updatePOILayer();
                updatePOIList();
            }
        });
        
        const poiCoords = document.createElement('div');
        poiCoords.classList.add('poi-coords');
        poiCoords.textContent = `${poi.coordinates[0].toFixed(4)}, ${poi.coordinates[1].toFixed(4)}`;
        poiCoords.style.fontSize = '10px';
        poiCoords.style.color = '#666';
        
        const poiActions = document.createElement('div');
        poiActions.classList.add('poi-actions');
        
        const removeBtn = document.createElement('button');
        removeBtn.classList.add('poi-remove-btn');
        removeBtn.innerHTML = '×';
        removeBtn.title = 'Remove this point of interest';

        removeBtn.addEventListener('click', () => removePOI(poi.id));
        
        poiActions.appendChild(removeBtn);
        
        const leftContainer = document.createElement('div');
        leftContainer.appendChild(poiName);
        leftContainer.appendChild(poiCoords);
        
        poiItem.appendChild(leftContainer);
        poiItem.appendChild(poiActions);
        
        poiList.appendChild(poiItem);
    });
}

function removePOI(poiId) {
    const index = pointsOfInterest.findIndex(poi => poi.id === poiId);
    if (index === -1) return;
    
    pointsOfInterest.splice(index, 1);
    
    updatePOILayer();
    updatePOIList();
    updateDropdownWithTravelTimes();
    
    removeTravelTimeColumn(poiId);
}

function updateDropdownWithTravelTimes() {
    const dropdown = document.getElementById('data-layer-dropdown');
    if (!dropdown) return;
    
    const existingTravelTimeOptions = dropdown.querySelectorAll('.travel-time-option');
    existingTravelTimeOptions.forEach(option => option.remove());
    
    pointsOfInterest.forEach(poi => {
        const travelTimeOption = document.createElement('div');
        travelTimeOption.classList.add('dropdown-item', 'travel-time-option');
        travelTimeOption.setAttribute('data-layer-name', `Travel to ${poi.name}`);
        travelTimeOption.setAttribute('data-poi-id', poi.id);
        travelTimeOption.textContent = `Travel to ${poi.name}`;
        
        dropdown.appendChild(travelTimeOption);
    });
    
    setupDropdownListeners();
}

function setupDropdownListeners() {
    const dropdownItems = dropdown.querySelectorAll('.dropdown-item');
    dropdownItems.forEach(item => {
        item.addEventListener('click', function() {
            const layerName = this.getAttribute('data-layer-name');
            const poiId = this.getAttribute('data-poi-id');
            
            if (poiId) {
                addTravelTimeLayer(layerName, poiId);
            } else {
                addDataLayer(layerName);
            }
            
            dropdown.style.display = 'none';
        });
    });
}

function addTravelTimeLayer(layerName, poiId) {
    if (activeDataLayers.includes(layerName)) {
        console.warn(`Layer "${layerName}" is already added.`);
        return;
    }
    
    const poi = pointsOfInterest.find(p => p.id === poiId);
    if (!poi) {
        console.error(`POI with ID ${poiId} not found.`);
        return;
    }
    
    activeDataLayers.push(layerName);
    
    const newHeader = document.createElement('th');
    newHeader.textContent = layerName;
    newHeader.setAttribute('data-layer', layerName);
    newHeader.setAttribute('data-poi-id', poiId);
    newHeader.classList.add('data-header', 'travel-time-header');
    newHeader.style.position = 'relative';
    
    const removeBtn = document.createElement('span');
    removeBtn.innerHTML = '×';
    removeBtn.classList.add('remove-btn');
    removeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        removeTravelTimeColumn(poiId, layerName);
    });
    
    newHeader.appendChild(removeBtn);
    
    const addColumnHeader = headerRow.querySelector('#add-column-header');
    if (addColumnHeader) {
        headerRow.insertBefore(newHeader, addColumnHeader);
    } else {
        headerRow.appendChild(newHeader);
    }
    
    calculateTravelTimes(poi);
}

function calculateTravelTimes(poi) {
    
    selectedProperties.forEach(property => {
        if (!property.travelTimes) {
            property.travelTimes = {};
        }
        
        const distance = calculateDistance(
            property.coordinates[1], property.coordinates[0],
            poi.coordinates[1], poi.coordinates[0]
        );
        
        const baseMinutes = distance * 0.7; 
        const randomFactor = 0.8 + (Math.random() * 0.4); 
        const travelTimeMinutes = Math.round(baseMinutes * randomFactor);
        
        property.travelTimes[poi.id] = travelTimeMinutes;
    });
    
    updatePropertyTable();
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; 
    return distance;
}

function deg2rad(deg) {
    return deg * (Math.PI/180);
}

function removeTravelTimeColumn(poiId, specificLayerName = null) {
    const travelTimeHeaders = headerRow.querySelectorAll(`th[data-poi-id="${poiId}"]`);
    
    travelTimeHeaders.forEach(header => {
        const layerName = header.getAttribute('data-layer');
        
        if (specificLayerName && layerName !== specificLayerName) return;
        
        const index = activeDataLayers.indexOf(layerName);
        if (index > -1) {
            activeDataLayers.splice(index, 1);
        }
        
        header.remove();
        
        if (currentSortLayer === layerName) {
            currentSortLayer = null;
            currentSortDirection = 'asc';
        }
    });
    
    clearRoutes();
    
    updatePropertyTable();
}

function setupRouteDisplay() {
    table.addEventListener('mouseover', handleTravelTimeCellHover);
    table.addEventListener('mouseout', handleTravelTimeCellHoverEnd);
}

function handleTravelTimeCellHover(e) {
    const cell = e.target.closest('td.data-cell');
    if (!cell) return;
    
    const layerName = cell.getAttribute('data-layer');
    const poiId = cell.getAttribute('data-poi-id');
    
    if (layerName && layerName.startsWith('Travel to ') && poiId) {
        const propertyId = cell.closest('tr').getAttribute('data-property-id');
        const property = selectedProperties.find(p => p.id === propertyId);
        const poi = pointsOfInterest.find(p => p.id === poiId);
        
        if (property && poi) {
            showRoute(property, poi);
        }
    }
}

function handleTravelTimeCellHoverEnd(e) {
    const relatedTarget = e.relatedTarget;
    if (!relatedTarget || !relatedTarget.closest || 
        !relatedTarget.closest('td.data-cell[data-poi-id]')) {
        clearRoutes();
    }
}

function showRoute(property, poi) {
    // Create a simple straight line route for demonstration
    // In a real application, you would use actual route geometry from a routing API
    const routeFeature = {
        type: 'Feature',
        properties: {
            propertyId: property.id,
            poiId: poi.id
        },
        geometry: {
            type: 'LineString',
            coordinates: [
                property.coordinates,
                poi.coordinates
            ]
        }
    };
    
    const routesSource = map.getSource('routes-source');
    if (routesSource) {
        routesSource.setData({
            type: 'FeatureCollection',
            features: [routeFeature]
        });
    }
    
    if (map.getLayer('routes-layer')) {
        map.setLayoutProperty('routes-layer', 'visibility', 'visible');
    }
    
    activeRoutes = [routeFeature];
}

function showAllRoutesForPOI(poiId) {
    const poi = pointsOfInterest.find(p => p.id === poiId);
    if (!poi) return;
    
    const routeFeatures = selectedProperties.map(property => ({
        type: 'Feature',
        properties: {
            propertyId: property.id,
            poiId: poi.id
        },
        geometry: {
            type: 'LineString',
            coordinates: [
                property.coordinates,
                poi.coordinates
            ]
        }
    }));
    
    const routesSource = map.getSource('routes-source');
    if (routesSource) {
        routesSource.setData({
            type: 'FeatureCollection',
            features: routeFeatures
        });
    }
    
    if (map.getLayer('routes-layer')) {
        map.setLayoutProperty('routes-layer', 'visibility', 'visible');
    }
    
    activeRoutes = routeFeatures;
}

function clearRoutes() {
    if (map.getLayer('routes-layer')) {
        map.setLayoutProperty('routes-layer', 'visibility', 'none');
    }
    
    activeRoutes = [];
}

function updateTravelTimeLegend(layerName) {
    legendContainer.innerHTML = `
        <div class="legend-title">
            <span>${layerName}</span>
        </div>
        <div class="legend-gradient">
            <div class="legend-bar" style="background: linear-gradient(to top, #ff0000, #ffff00, #00ff00); height: 150px; width: 30px;"></div>
            <div class="legend-labels">
                <div class="legend-label top">
                    Quick (<10 min)
                </div>
                <div class="legend-label bottom">
                    Slow (>60 min)
                </div>
            </div>
        </div>
    `;
}