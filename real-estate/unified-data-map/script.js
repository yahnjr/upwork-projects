mapboxgl.accessToken = 'pk.eyJ1IjoiaWZvcm1haGVyIiwiYSI6ImNsaHBjcnAwNDF0OGkzbnBzZmUxM2Q2bXgifQ.fIyIgSwq1WWVk9CKlXRXiQ';
        let chosenLayer = "Walkability";
        let visibleStates = [];
        let selectedProperties = [];
        let maxSelectedProperties = 5;
        
        let map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/satellite-streets-v11',
            bounds: [
                [-128.272, 30.165],
                [-64.152, 48.046]
            ]
        });
    
        map.on('load', function () {   
            parseUrlParams();

            console.log("Query parameters parsed");

            const geojsonURL = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/14/query?where=STATE%3D%2736%27&outFields=GEOID,NAME&outSR=4326&f=geojson';
    
            console.log("Fetching GeoJSON from:", geojsonURL);

            Promise.all([
                fetch('states.geojson').then(response => response.json()),
                fetch('properties.geojson').then(response => response.json()),
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

                map.addSource('states', {
                    type: 'geojson', 
                    data: states
                });

                map.addLayer({
                    id: 'invisible-states',
                    type: 'fill',
                    source: 'states',
                    paint: {
                        'fill-color': '#ffffff',
                        'fill-opacity': 0
                    }
                });

                console.log("Added reference state layer");
                
                map.addSource('properties', {
                    type: 'geojson', 
                    data: properties
                });

                map.addLayer({
                    id: 'properties-layer',
                    type: 'circle',
                    source: 'properties',
                    paint: {
                        'circle-radius': 6,
                        'circle-color': '#429ef5',
                        'circle-opacity': 0.95
                    },
                    minzoom: 8
                });

                console.log("Added properties layer");
    
                map.addSource('census-data', {
                    type: 'geojson',
                    data: census
                });
                console.log("GeoJSON source added to map.");
    
                map.addLayer({
                    id: 'walkability-layer',
                    type: 'fill',
                    source: 'census-data',
                    paint: {
                        'fill-color': [
                            'interpolate',
                            ['linear'],
                            ['get', 'Walkability'],
                            0, '#ffffcc',
                            5, '#41b6c4',
                            10, '#0c2c84'
                        ],
                        'fill-opacity': 0.4
                    },
                    minZoom: 10
                });

                map.addLayer({
                    id: 'census-labels',
                    type: 'symbol',
                    source: 'census-data',
                    layour: {
                        'text-field': ['get', 'GEOID'],
                        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                        'text-size': 20
                    }, 
                    paint: {
                        'text-color': '#000000',
                        'text-halo-color': '#ffffff',
                        'text-halo-width': 1
                    }
                });

                console.log("Walkability layer added.");

                map.addLayer({
                    id: 'air-quality-layer',
                    type: 'fill',
                    source: 'census-data',
                    paint: {
                        'fill-color': [
                            'interpolate',
                            ['linear'],
                            ['get', 'Air_Quality'],
                            0, '#fef0d9',
                            5, '#fdcc8a',
                            10, '#e34a33'
                        ],
                        'fill-opacity': 0.4
                    },
                    layout: {
                        visibility: 'none'
                    },
                    minZoom: 10
                });
                console.log("Air Quality layer added.");

                map.addLayer({
                    id: 'crime-layer',
                    type: 'fill',
                    source: 'census-data',
                    paint: {
                        'fill-color': [
                            'interpolate',
                            ['linear'],
                            ['get', 'Crime'],
                            0, '#e0f3f8',
                            5, '#abd9e9',
                            10, '#2166ac'
                        ],
                        'fill-opacity': 0.4
                    },
                    layout: {
                        visibility: 'none'
                    },
                    minZoom: 10
                });
                console.log("Crime layer added.");

                map.addLayer({
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
                
                map.on('click', 'properties-layer', function(e) {
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

                                map.getCanvas().click();
                            }
                        };
                        popupContent.appendChild(button);
                    }
                    
                    new mapboxgl.Popup()
                        .setLngLat(coordinates)
                        .setDOMContent(popupContent)
                        .addTo(map);
                });
                
                map.on('mouseenter', 'properties-layer', function() {
                    map.getCanvas().style.cursor = 'pointer';
                });
                map.on('mouseleave', 'properties-layer', function() {
                    map.getCanvas().style.cursor = '';
                });
                
                document.getElementById('layer-form').addEventListener('change', function(e) {
                    if (e.target.classList.contains('radio-option')) {
                        chosenLayer = e.target.value;
                        console.log("Layer selected:", chosenLayer);
                        
                        map.setLayoutProperty('crime-layer', 'visibility', 'none');
                        map.setLayoutProperty('air-quality-layer', 'visibility', 'none');
                        map.setLayoutProperty('walkability-layer', 'visibility', 'none');
                        
                        if (chosenLayer === 'Crime') {
                            map.setLayoutProperty('crime-layer', 'visibility', 'visible');
                        } else if (chosenLayer === 'Air Quality') {
                            map.setLayoutProperty('air-quality-layer', 'visibility', 'visible');
                        } else if (chosenLayer === 'Walkability') {
                            map.setLayoutProperty('walkability-layer', 'visibility', 'visible');
                        }
                    }
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
                visibleStates = map.queryRenderedFeatures({ layers: ['invisible-states']});
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
                        
                        if (map.getSource('census-data')) {
                            map.getSource('census-data').setData(censusData);
                            console.log("Updated census data on map");
                        }
                    })
                    .catch(error => {
                        console.error("Error fetching or processing census data:", error);
                    });
            }

            map.on('moveend', () => {
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
                    map.flyTo({
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
            const selectedIds = selectedProperties.map(p => p.uniqueID);
            map.setFilter('selected-properties', ['in', 'uniqueID', ...selectedIds]);
        }
        
        function getCensusDataForProperty(coordinates) {
            const censusFeatures = map.queryRenderedFeatures(
                map.project(coordinates),
                { layers: ['walkability-layer', 'air-quality-layer', 'crime-layer'] }
            );
            
            const censusData = {
                Walkability: Math.floor(Math.random() * 101),
                Air_Quality: Math.floor(Math.random() * 101),
                Crime: Math.floor(Math.random() * 101)
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

                    map.setFilter('properties-layer', ['in', 'uniqueID', ...selectedIds]);

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
                    map.setFilter('properties-layer', null);

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

            if (selectedParam) {
                const selectedIds = selectedParam.split(',');

                map.once('sourceData', function(e) {
                    if (e.sourceId === 'properties' && map.isSourceLoaded('properties')) {
                        const features = map.querySourceFeatures('properties');

                        selectedIds.forEach(id => {
                            const property = features.find(f => f.properties.uniqueID === id);

                            if (property) {
                                const coordinates = property.geometry.coordinates.slice();
                                const propertyId = property.properties.uniqueID;
                                const propertyAddress = property.properties.address || `Property #${propertyId}`;
                                const city = property.properties.city;

                                const censusData = getCensusDataForProperty(coordinates);

                                selectedProperties.push({
                                    id: propertyId,
                                    address: propertyAddress,
                                    city: city,
                                    coordinates: coordinates,
                                    censusData: censusData
                                });
                            }
                        });

                        updatePropertyList();
                        updateSelectedPropertiesLayer();

                        map.setFilter('properties-layer', ['in', 'uniqueID', ...selectedIds]);

                        showShareContainer();

                        if (selectedProperties.length > 0 ) {
                            const bounds = new mapboxgl.LngLatBounds();
                            selectedPropertiies.forEach(p => {
                                bounds.extend(p.coordinates);
                            });

                            map.fitBounds(bounds, {
                                padding: 100
                            });
                        } 
                    }
                });
            }
        }