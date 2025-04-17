mapboxgl.accessToken = 'pk.eyJ1IjoiaWZvcm1haGVyIiwiYSI6ImNsaHBjcnAwNDF0OGkzbnBzZmUxM2Q2bXgifQ.fIyIgSwq1WWVk9CKlXRXiQ';
let chosenLayer = "Walkability";
let visibleStates = [];
let selectedProperties = [];
let maxSelectedProperties = 5;
let primaryLayer = "Walkability";
let comparisonLayer = null;

let dataMap = new mapboxgl.Map({
    container: 'data-map',
    style: 'mapbox://styles/mapbox/satellite-streets-v11',
    bounds: [
        [-128.272, 30.165],
        [-64.152, 48.046]
    ]
});

dataMap.on('load', function () {   
    parseUrlParams();

    console.log("Query parameters parsed");

    const geojsonURL = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/14/query?where=STATE%3D%2736%27&outFields=GEOID,NAME&outSR=4326&f=geojson';

    console.log("Fetching GeoJSON from:", geojsonURL);

    Promise.all([
        fetch('resources/states.geojson').then(response => response.json()),
        fetch('resources/properties.geojson').then(response => response.json()),
        fetch(geojsonURL).then(response => response.json())
    ])
    .then(([stateData, propertiesData, censusData]) => {
        states = stateData;
        properties = propertiesData;
        census = censusData;

        console.log("GeoJSON data loaded. Feature count:", census.features.length);
        console.log("First feature before modification:", census.features[0]);

        census.features.forEach(f => {
            const GEOID = f.properties.GEOID;
            const id = (parseInt(GEOID) / 10);

            f.properties.Walkability = (id * 7 + 13) % 10;
            f.properties.Air_Quality = (id * 11 + 5) % 12;
            f.properties.Crime = (id * 19 + 3) % 15;
        });

        console.log("First feature after adding attributes:", census.features[0]);

        dataMap.addSource('states', {
            type: 'geojson', 
            data: states
        });

        dataMap.addLayer({
            id: 'invisible-states',
            type: 'fill',
            source: 'states',
            paint: {
                'fill-color': '#ffffff',
                'fill-opacity': 0
            }
        });

        console.log("Added reference state layer");
        
        dataMap.addSource('properties', {
            type: 'geojson', 
            data: properties
        });

        dataMap.addSource('census-data', {
            type: 'geojson',
            data: census
        });
        console.log("GeoJSON source added to dataMap.");

        dataMap.addLayer({
            id: 'walkability-layer',
            type: 'fill',
            source: 'census-data',
            paint: {
                'fill-color': [
                    'interpolate',
                    ['linear'],
                    ['get', 'Walkability'],
                    0, '#0c2c84',
                    5,  '#41b6c4',
                    10, '#dcf7f7'
                ],
                'fill-opacity': 0.4
            },
            minZoom: 10
        });

        console.log("Walkability layer added.");

        dataMap.addLayer({
            id: 'air-quality-layer',
            type: 'fill',
            source: 'census-data',
            paint: {
                'fill-color': [
                    'interpolate',
                    ['linear'],
                    ['get', 'Air_Quality'],
                    0, '#28ac21',
                    5, '#62de74',
                    10, '#e0f8ec'
                ],
                'fill-opacity': 0.4
            },
            layout: {
                visibility: 'none'
            },
            minZoom: 10
        });
        console.log("Air Quality layer added.");

        dataMap.addLayer({
            id: 'crime-layer',
            type: 'fill',
            source: 'census-data',
            paint: {
                'fill-color': [
                    'interpolate',
                    ['linear'],
                    ['get', 'Crime'],
                    0, '#e34a33',
                    5, '#ffb757',
                    10, '#f7deb5'
                ],
                'fill-opacity': 0.4
            },
            layout: {
                visibility: 'none'
            },
            minZoom: 10
        });
        console.log("Crime layer added.");
        
        dataMap.addLayer({
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

        console.log("Added properties layer");

        dataMap.addLayer({
            id: 'selected-properties',
            type: 'circle',
            source: 'properties',
            filter: ['in', 'id', ''],
            paint: {
                'circle-radius': 8,
                'circle-color': '#ff4d4d',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff'
            },
            minzoom: 8
        });
        
        dataMap.on('click', 'properties-layer', function(e) {
            const coordinates = e.features[0].geometry.coordinates.slice();
            const propertyId = e.features[0].properties.uniqueID;
            const propertyAddress = e.features[0].properties.address || `Property #${propertyId}`;
            const city = e.features[0].properties.city;
            
            const isSelected = selectedProperties.some(p => p.id === propertyId);
            
            const popupContent = document.createElement('div');
            
            if (isSelected) {
                const p = document.createElement('p');
                p.textContent = `#${propertyAddress} is already selected`
                popupContent.appendChild(p);
            } else if (selectedProperties.length >= maxSelectedProperties) {
                const p = document.createElement('p');
                p.textContent = `Maximum of ${maxSelectedProperties} properties already selected`;
                popupContent.appendChild(p);
            } else {
                const p = document.createElement('p');
                p.textContent = propertyAddress;
                popupContent.appendChild(p);
                
                const button = document.createElement('button');
                button.textContent = 'Add to list';
                button.onclick = function() {
                    if (selectedProperties.length < maxSelectedProperties) {
                        const censusData = getCensusDataForProperty(coordinates);
                        
                        selectedProperties.push({
                            id: propertyId,
                            address: propertyAddress,
                            city: city,
                            coordinates: coordinates,
                            censusData: censusData
                        });
                        
                        updatePropertyList();
                        
                        updateSelectedPropertiesLayer();

                        dataMap.getCanvas().click();
                    }
                };
                popupContent.appendChild(button);
            }
            
            new mapboxgl.Popup()
                .setLngLat(coordinates)
                .setDOMContent(popupContent)
                .addTo(map);
        });
        
        dataMap.on('mouseenter', 'properties-layer', function() {
            dataMap.getCanvas().style.cursor = 'pointer';
        });
        dataMap.on('mouseleave', 'properties-layer', function() {
            dataMap.getCanvas().style.cursor = '';
        });

        updateLegend(chosenLayer);
        
        document.getElementById('layer-form').addEventListener('change', function(e) {
            if (e.target.classList.contains('radio-option')) {
                chosenLayer = e.target.value;
                console.log("Layer selected:", chosenLayer);
                
                dataMap.setLayoutProperty('crime-layer', 'visibility', 'none');
                dataMap.setLayoutProperty('air-quality-layer', 'visibility', 'none');
                dataMap.setLayoutProperty('walkability-layer', 'visibility', 'none');
                
                if (chosenLayer === 'Crime') {
                    dataMap.setLayoutProperty('crime-layer', 'visibility', 'visible');
                } else if (chosenLayer === 'Air Quality') {
                    dataMap.setLayoutProperty('air-quality-layer', 'visibility', 'visible');
                } else if (chosenLayer === 'Walkability') {
                    dataMap.setLayoutProperty('walkability-layer', 'visibility', 'visible');
                }
            }

            updateLegend(chosenLayer);
        });
    })
    .catch(error => {
        console.error("Error loading data:", error);
    });
        
    fetch(geojsonURL)
        .then(response => {
            console.log("Fetch response received:", response);
            if (!response.ok) {
                throw new Error("Network response was not ok.");
            }
            return response.json();
        })
        .catch(error => {
            console.error("Error loading or parsing GeoJSON:", error);
        });

    function queryCensus() {
        visibleStates = dataMap.queryRenderedFeatures({ layers: ['invisible-states']});
        console.log("initial state query:", visibleStates);

        const uniquStateIds = new Set();
        visibleStates.forEach(state => {
            if (state.properties && state.properties.FIPS) {
                uniquStateIds.add(state.properties.FIPS);
            }
        });

        const uniqueStates = Array.from(uniquStateIds);
        console.log('States visible: ', uniqueStates);

        if (uniqueStates.length > 3) {
            console.log("Too many states to query census");
            return;
        } else if (uniqueStates.length === 0) {
            console.log("Error querying state layer");
            return;
        }

        stateWhereClause = uniqueStates.map(code => `STATE='${code}'`).join(' OR ');
        const geojsonURL =  `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/14/query?where=${encodeURIComponent(stateWhereClause)}&outFields=GEOID,NAME&outSR=4326&f=geojson`;
        
        console.log('Fetching census data from: ', geojsonURL);

        fetch(geojsonURL)
            .then(response => {
                if(!response.ok) {
                    throw new Error("Network response error");
                }
                return response.json();
            })
            .then(censusData => {
                console.log("Census data received:", censusData);

                censusData.features.forEach(f => {
                    const GEOID = f.properties.GEOID;
                    const id = (parseInt(GEOID) / 10);

                    f.properties.Walkability = (id * 7 + 13) % 10;
                    f.properties.Air_Quality = (id * 11 + 5) % 12;
                    f.properties.Crime = (id * 19 + 3) % 15;
                });
                
                if (dataMap.getSource('census-data')) {
                    dataMap.getSource('census-data').setData(censusData);
                    console.log("Updated census data on map");
                }
            })
            .catch(error => {
                console.error("Error fetching or processing census data:", error);
            });
    }

    dataMap.on('moveend', () => {
        queryCensus();
    });
});

function updatePropertyList() {
    const listContainer = document.getElementById('property-list');
    const countElement = document.getElementById('selected-count');
    
    countElement.textContent = `(${selectedProperties.length}/${maxSelectedProperties})`;

    listContainer.innerHTML = '';
    
    selectedProperties.forEach((property, index) => {
        const item = document.createElement('div');
        item.className = 'property-item';
        item.textContent = `${property.address}, ${property.city}`
        item.uniqueID = property.id;

        const textSpan = document.createElement('span');
        textSpan.textContent = `${property.address}, ${property.city}`;
        textSpan.style.cursor = 'pointer';

        const removeBtn = document.createElement('span');
        removeBtn.textContent = '×';
        removeBtn.className = 'remove-property';
        removeBtn.style.float = 'right';
        removeBtn.style.cursor = 'pointer';
        removeBtn.style.fontWeight = 'bold';
        removeBtn.style.color = '#f44336';
        
        removeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            removeProperty(property.id);
        });

        item.appendChild(textSpan);
        item.appendChild(removeBtn);
        item.uniqueId = property.id;
        
        item.addEventListener('click', function() {
            dataMap.flyTo({
                center: property.coordinates,
                zoom: 15
            });
            
            showPropertyDetails(property);
        });
        
        listContainer.appendChild(item);
    });
}

function removeProperty(propertyId) {
    selectedProperties = selectedProperties.filter(p => p.id !== propertyId);
    updatePropertyList();
    updateSelectedPropertiesLayer();

    const detailsContainer = document.getElementById('property-details');
    if (detailsContainer.style.display === 'block') {
        const currentPropertyId = selectedProperties.find(p => 
            p.address === document.getElementById('property-address').textContent.split(',')[0]
        )?.id;
        
        if (!currentPropertyId || currentPropertyId === propertyId) {
            detailsContainer.style.display = 'none';
        }
    }
}

function updateSelectedPropertiesLayer() {
    const selectedIds = selectedProperties.map(p => p.id);
    dataMap.setFilter('selected-properties', ['in', 'uniqueID', ...selectedIds]);
}

function getCensusDataForProperty(coordinates) {
    const censusFeatures = dataMap.queryRenderedFeatures(
        dataMap.project(coordinates),
        { layers: ['walkability-layer', 'air-quality-layer', 'crime-layer'] }
    );
    
    const censusData = {
        Walkability: Math.floor(Math.random() * 10),
        Air_Quality: Math.floor(Math.random() * 10),
        Crime: Math.floor(Math.random() * 10)
    };
    
    if (censusFeatures.length > 0) {
        const feature = censusFeatures[0];
        if (feature.properties) {
            if (feature.properties.Walkability !== undefined) 
                censusData.Walkability = feature.properties.Walkability;
            if (feature.properties.Air_Quality !== undefined) 
                censusData.Air_Quality = feature.properties.Air_Quality;
            if (feature.properties.Crime !== undefined) 
                censusData.Crime = feature.properties.Crime;
                console.log(`Feature data found: ${censusData.Crime}, ${censusData.Walkability}, ${censusData.Air_Quality}`);
        } else {
            console.log("Error querying underlying census data");
        }
    }
    
    return censusData;
}

function showPropertyDetails(property) {
    const detailsContainer = document.getElementById('property-details');
    const addressElement = document.getElementById('property-address');
    const walkabilityValue = document.getElementById('walkability-value');
    const airQualityValue = document.getElementById('air-quality-value');
    const crimeValue = document.getElementById('crime-value');
    const walkabilityBar = document.getElementById('walkability-bar');
    const airQualityBar = document.getElementById('air-quality-bar');
    const crimeBar = document.getElementById('crime-bar');
    
    addressElement.textContent = `${property.address}, ${property.city}`;
    walkabilityValue.textContent = property.censusData.Walkability;
    airQualityValue.textContent = property.censusData.Air_Quality;
    crimeValue.textContent = property.censusData.Crime;
    
    walkabilityBar.style.width = `${property.censusData.Walkability * 10}%`;
    airQualityBar.style.width = `${property.censusData.Air_Quality * 10}%`;
    crimeBar.style.width = `${property.censusData.Crime * 10}%`;
    
    detailsContainer.style.display = 'block';
}

document.addEventListener('DOMContentLoaded', function() {
    const finishedBtn = document.getElementById('finished-btn');

    finishedBtn.addEventListener('click', function() {
        if (selectedProperties.length > 0) {
            const selectedIds = selectedProperties.map(p => p.id);

            dataMap.setFilter('properties-layer', ['in', 'uniqueID', ...selectedIds]);

            showShareContainer();
        } else {
            alert('Please select at least one property');
        }
    });
});

function showShareContainer() {
    let shareContainer = document.getElementById('share-container');

    if (!shareContainer) {
        shareContainer = document.createElement('div');
        shareContainer.id = 'share-container';
        
        const title = document.createElement('div');
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '8px';
        title.textContent = 'Share Selected Properties';
        
        const shareUrl = document.createElement('input');
        shareUrl.id = 'share-url';
        shareUrl.readOnly = true;
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'action-btn';
        copyBtn.textContent = 'Copy URL';
        copyBtn.style.marginTop = '5px';
        
        const resetBtn = document.createElement('button');
        resetBtn.className = 'action-btn';
        resetBtn.textContent = 'Reset View';
        resetBtn.style.marginTop = '5px';
        resetBtn.style.marginLeft = '5px';
        
        shareContainer.appendChild(title);
        shareContainer.appendChild(shareUrl);
        shareContainer.appendChild(copyBtn);
        shareContainer.appendChild(resetBtn);
        
        document.body.appendChild(shareContainer);

        copyBtn.addEventListener('click', function() {
            shareUrl.select();
            document.execCommand('copy');
            copyBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyBtn.textContent = 'Copy';
            }, 2000);
        });

        resetBtn.addEventListener('click', function() {
            dataMap.setFilter('properties-layer', null);

            shareContainer.style.display = 'none';
        });
    }

    const selectedIds = selectedProperties.map(p => p.id).join(',');
    const baseUrl = window.location.href.split('?')[0];
    const shareUrl = `${baseUrl}?selected=${selectedIds}`;

    document.getElementById('share-url').value = shareUrl;

    shareContainer.style.display = 'block';
}

function parseUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const selectedParam = urlParams.get('selected');

    if (selectedParam && selectedParam.length > 0) {
        const selectedIds = selectedParam.split(',');
        console.log("Found selected IDs in URL:", selectedIds);
        
        const checkPropertiesData = function() {
            if (dataMap.getSource('properties') && dataMap.isSourceLoaded('properties')) {
                setTimeout(() => {
                    console.log("Properties source loaded, processing selected IDs");
                    
                    const propertiesData = dataMap.getSource('properties')._data;
                    
                    if (propertiesData && propertiesData.features) {
                        console.log("Found properties features:", propertiesData.features.length);
                        
                        selectedIds.forEach(id => {
                            const property = propertiesData.features.find(f => 
                                f.properties.uniqueID === id
                            );
                            
                            if (property) {
                                console.log("Found matching property:", id);
                                const coordinates = property.geometry.coordinates.slice();
                                const propertyId = property.properties.uniqueID;
                                const propertyAddress = property.properties.address || `Property #${propertyId}`;
                                const city = property.properties.city || '';
                                
                                const censusData = {
                                    Walkability: Math.floor(Math.random() * 10),
                                    Air_Quality: Math.floor(Math.random() * 12),
                                    Crime: Math.floor(Math.random() * 15)
                                };
                                
                                selectedProperties.push({
                                    id: propertyId,
                                    address: propertyAddress,
                                    city: city,
                                    coordinates: coordinates,
                                    censusData: censusData
                                });
                            } else {
                                console.log("Could not find property with ID:", id);
                            }
                        });
                        
                        if (selectedProperties.length > 0) {
                            console.log("Updating UI with selected properties:", selectedProperties.length);
                            updatePropertyList();
                            updateSelectedPropertiesLayer();
                            
                            const bounds = new mapboxgl.LngLatBounds();
                            selectedProperties.forEach(p => {
                                bounds.extend(p.coordinates);
                            });
                            
                            dataMap.fitBounds(bounds, {
                                padding: 100
                            });

                            dataMap.setFilter('selected-properties', ['in', 'uniqueID', ...selectedIds]);
                            
                            showShareContainer();
                        }
                    } else {
                        console.error("Properties data not available");
                    }
                }, 500);
                
                return true;
            }
            return false;
        };
        
        if (!checkPropertiesData()) {
            const sourceDataListener = function(e) {
                if (e.sourceId === 'properties' && checkPropertiesData()) {
                    dataMap.off('sourcedata', sourceDataListener);
                }
            };
            
            dataMap.on('sourcedata', sourceDataListener);
        }
    }
}

function updateLegend() {
    const existingLegend = document.getElementById('legend');
    if (existingLegend) {
        existingLegend.remove();
    }
    
    const legendContainer = document.createElement('div');
    legendContainer.id = 'legend';
    
    if (comparisonLayer) {
        legendContainer.style.width = '250px';
        
        const primaryGradient = getGradientForLayer(primaryLayer);
        const comparisonGradient = getGradientForLayer(comparisonLayer);
        
        // Create a 2D gradient with four distinct corners
        legendContainer.innerHTML = `
            <div style="text-align: center; font-weight: bold; margin-bottom: 10px;">
                <span>${primaryLayer} × ${comparisonLayer}</span>
                <button id="reset-comparison" style="margin-left: 10px; cursor: pointer; background: #f44336; color: white; border: none; border-radius: 3px; padding: 2px 5px;">Reset</button>
            </div>
            <div style="position: relative; height: 200px; width: 200px; margin: 0 auto; padding: 10px 20px 10px 30px;">
                <div style="height: 200px; width: 200px; background: 
                    radial-gradient(circle at top right, ${primaryGradient.colors[0]}, transparent 70%),
                    radial-gradient(circle at top left, ${comparisonGradient.colors[0]}, transparent 70%),
                    radial-gradient(circle at bottom right, ${primaryGradient.colors[2]}, transparent 70%),
                    radial-gradient(circle at bottom left, ${comparisonGradient.colors[2]}, transparent 70%);">
                </div>
                
                <div class="compare-legend-label" style="top: 5px; right: 5px; font-size: 10px;">High ${primaryLayer}/<br>${comparisonLayer}</div>
                <div class="compare-legend-label" style="top: 5px; left: 5px; font-size: 10px;">High ${comparisonLayer}/<br>Low ${primaryLayer}</div>
                <div class="compare-legend-label" style="bottom: 5px; right: 5px; font-size: 10px;">High ${primaryLayer}/<br>Low${comparisonLayer}</div>
                <div class="compare-legend-label" style="bottom: 5px; left: 5px; font-size: 10px;">Low ${primaryLayer}/<br>${comparisonLayer}</div>
            </div>
        `;
    } else {
        // Your existing single-layer legend code
        legendContainer.style.width = '120px';
        
        const gradient = getGradientForLayer(primaryLayer);
        
        legendContainer.innerHTML = `
            <div style="text-align: center; font-weight: bold; margin-bottom: 5px;">
                <span>${primaryLayer}</span>
            </div>
            <div style="position: relative; height: 200px; margin: 0 auto; text-align: center;">
                <div style="height: 200px; width: 30px; margin: 0 auto; background: linear-gradient(to bottom, ${gradient.colors[0]}, ${gradient.colors[1]}, ${gradient.colors[2]});"></div>
                <div class="legend-label" style="top: 0; right: 0; margin-top: 5px;">
                    More ${primaryLayer}
                </div>
                <div class="legend-label" style="bottom: 0; right: 0; margin-bottom: 5px;">
                    Less ${primaryLayer}
                </div>
            </div>
        `;
    }
    
    document.body.appendChild(legendContainer);
    
    if (comparisonLayer) {
        document.getElementById('reset-comparison').addEventListener('click', () => {
            disableComparisonMode();
        });
    }
}

function getGradientForLayer(layerName) {
    switch(layerName) {
        case 'Walkability':
            return {
                colors: ['#0c2c84', '#41b6c4', '#dcf7f7']
            };
        case 'Air Quality':
            return {
                colors: ['#28ac21', '#62de74', '#e0f8ec']
            };
        case 'Crime':
            return {
                colors: ['#e34a33', '#ffb757', '#f7deb5']
            };
        default:
            return {
                colors: ['#0c2c84', '#41b6c4', '#ffffcc']
            };
    }
}

function enableComparisonMode(secondaryLayer) {
    comparisonLayer = secondaryLayer;
    
    setLayerVisibility(primaryLayer, 'visible', 0.6);
    setLayerVisibility(comparisonLayer, 'visible', 0.6);
    
    updateLegend();
}

function disableComparisonMode() {
    setLayerVisibility(primaryLayer, 'visible', 0.4);
    if (comparisonLayer) {
        setLayerVisibility(comparisonLayer, 'none', 0.4);
    }
    
    comparisonLayer = null;
    updateLegend();
}

function setLayerVisibility(layerName, visibility, opacity) {
    const layerId = layerName.toLowerCase().replace(' ', '-') + '-layer';
    dataMap.setLayoutProperty(layerId, 'visibility', visibility);
    if (opacity !== undefined) {
        dataMap.setPaintProperty(layerId, 'fill-opacity', opacity);
    }
}

document.getElementById('layer-form').addEventListener('change', function(e) {
    if (e.target.classList.contains('radio-option')) {
        primaryLayer = e.target.value;
        console.log("Layer selected:", primaryLayer);
        
        comparisonLayer = null;
        
        setLayerVisibility('Walkability', 'none');
        setLayerVisibility('Air Quality', 'none');
        setLayerVisibility('Crime', 'none');
        
        setLayerVisibility(primaryLayer, 'visible');

        const layerCompareBtnName = primaryLayer.toLowerCase().replace(' ', '-') + '-compare';
        
        document.getElementById('walkability-compare').disabled = false;
        document.getElementById('crime-compare').disabled = false;
        document.getElementById('air-quality-compare').disabled = false;

        document.getElementById(layerCompareBtnName).disabled = true;
        
        updateLegend();
    }
});

document.getElementById('walkability-filter').addEventListener('click', () => {
    document.getElementById('walkability-range').style.display = 'block';
    document.getElementById('walkability-range-value').style.display = 'block';
});

document.getElementById('crime-filter').addEventListener('click', () => {
    document.getElementById('crime-range').style.display = 'block';
    document.getElementById('crime-range-value').style.display = 'block';
});

document.getElementById('air-quality-filter').addEventListener('click', () => {
    document.getElementById('air-quality-range').style.display = 'block';
    document.getElementById('air-quality-range-value').style.display = 'block';
});

document.getElementById('walkability-compare').addEventListener('click', () => {
    enableComparisonMode("Walkability");
});

document.getElementById('crime-compare').addEventListener('click', () => {
    enableComparisonMode("Crime");
});

document.getElementById('air-quality-compare').addEventListener('click', () => {
    enableComparisonMode("Air Quality");
});

document.getElementById('walkability-range').addEventListener('change', () => {
    const value = Number(document.getElementById('walkability-range').value)
    document.getElementById('walkability-range-value').textContent = document.getElementById('walkability-range').value;
    dataMap.setFilter('walkability-layer', ['>=', ['to-number', ['get', 'Walkability']], value]);
});

document.getElementById('crime-range').addEventListener('change', () => {
    const value = Number(document.getElementById('crime-range').value)
    document.getElementById('crime-range-value').textContent = document.getElementById('crime-range').value;
    dataMap.setFilter('crime-layer', ['>=', ['to-number', ['get', 'Crime']], value]);
});

document.getElementById('air-quality-range').addEventListener('change', () => {
    const value = Number(document.getElementById('air-quality-range').value)
    document.getElementById('air-quality-range-value').textContent = document.getElementById('air-quality-range').value;
    dataMap.setFilter('air-quality-layer', ['>=', ['to-number', ['get', 'Air_Quality']], value]);
});