mapboxgl.accessToken = 'pk.eyJ1IjoiaWZvcm1haGVyIiwiYSI6ImNsaHBjcnAwNDF0OGkzbnBzZmUxM2Q2bXgifQ.fIyIgSwq1WWVk9CKlXRXiQ';
const clickMode = document.getElementById('click-mode');
const viewMode = document.getElementById('view-mode');
const polygonMode = document.getElementById('polygon-mode');
const popupContainer = document.getElementById('popup-container');
let selectedState = null;
let statePopup = null;
let highlightedMarker = null;
let activeAgentCard = null;
let agentsSelectMode = 'click';

let agentMap = new mapboxgl.Map({
    container: 'agents-map',
    style: 'mapbox://styles/mapbox/light-v11',
    bounds: [
        [-128.272, 30.165],
        [-64.152, 48.046]
    ],
    zoom: 4 
});

function loadAgents() {
    console.log('Starting to load data...');
    
    Promise.all([
        fetch('resources/real_estate_agents.geojson').then(response => {
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return response.json();
        }),
        fetch('resources/states.geojson').then(response => {
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return response.json();
        })
    ])
    .then(([agentsData, statesData]) => {
        realEstateAgents = agentsData;
        states = statesData;

        agentMap.addSource('statesData', {
            type: 'geojson',
            data: states
        });
        
        agentMap.addLayer({
            id: 'states',
            type: 'fill',
            source: 'statesData',
            paint: {
                'fill-color': '#33ff99',
                'fill-opacity': 0.0,
                'fill-opacity-transition': {
                    duration: 100,
                    delay: 0
                }
            }
        });
        
        agentMap.addSource('localAgents', {
            type: 'geojson',
            data: realEstateAgents,
            cluster: true, 
            clusterMaxZoom: 14, 
            clusterRadius: 50 
        });
        

        agentMap.addLayer({
            id: 'clusters',
            type: 'circle',
            source: 'localAgents',
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
                    '#c7ac67', 
                    10,
                    '#947c3e',
                    50,
                    '#b88e25'
                ],
                'circle-opacity': 0.8
            }
        });
        

        agentMap.addLayer({
            id: 'cluster-count',
            type: 'symbol',
            source: 'localAgents',
            filter: ['has', 'point_count'],
            layout: {
                'text-field': '{point_count_abbreviated}',
                'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
                'text-size': 12
            },
            paint: {
                'text-color': '#fff'
            }
        });
        
        agentMap.addLayer({
            id: 'unclustered-point',
            type: 'circle',
            source: 'localAgents',
            filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-radius': 6,
                'circle-color': '#4287f5',
                'circle-opacity': 0.95
            },
            minZoom: 10
        });
        
        agentMap.on('click', 'clusters', (e) => {
            if (agentsSelectMode == 'click') {
                return;
            }

            const features = agentMap.queryRenderedFeatures(e.point, {
                layers: ['clusters']
            });
            
            const clusterId = features[0].properties.cluster_id;
            agentMap.getSource('localAgents').getClusterExpansionZoom(
                clusterId,
                (err, zoom) => {
                    if (err) return;
                    
                    agentMap.easeTo({
                        center: features[0].geometry.coordinates,
                        zoom: zoom
                    });
                }
            );
        });

        agentMap.on('click', 'unclustered-point', (e) => {
            const feature = e.features[0];
            const properties = feature.properties;
            popupContainer.innerHTML = '';
            createOrUpdatePopup(properties);
        });
        
        agentMap.on('mouseenter', 'clusters', () => {
            agentMap.getCanvas().style.cursor = 'pointer';
        });
        agentMap.on('mouseleave', 'clusters', () => {
            agentMap.getCanvas().style.cursor = '';
        });
        
        agentMap.on('mouseenter', 'unclustered-point', () => {
            agentMap.getCanvas().style.cursor = 'pointer';
        });
        agentMap.on('mouseleave', 'unclustered-point', () => {
            agentMap.getCanvas().style.cursor = '';
        });

    })
    .catch(error => {
        console.error('Error loading data:', error);
    });
}

function createOrUpdatePopup(properties) {
    const popupCard = document.createElement('div');
    popupCard.className = 'agent-card';

    const agendId = properties.FID;
    popupCard.id = `agent-${agendId}`;
    popupCard.dataset.longitude = properties.longitude;
    popupCard.dataset.latitude = properties.latitude;

    const facebookLink = properties.Facebook && properties.Facebook.trim() 
        ? `<a href="${properties.Facebook}" class="social-icon facebook"><i class="fab fa-facebook-f"></i></a>`
        : `<span class="social-icon facebook disabled"><i class="fab fa-facebook-f"></i></span>`;
    
    const twitterLink = properties.Twitter && properties.Twitter.trim() 
        ? `<a href="${properties.Twitter}" class="social-icon twitter"><i class="fab fa-twitter"></i></a>`
        : `<span class="social-icon twitter disabled"><i class="fab fa-twitter"></i></span>`;
    
    const instagramLink = properties.Instagram && properties.Instagram.trim() 
        ? `<a href="${properties.Instagram}" class="social-icon instagram"><i class="fab fa-instagram"></i></a>`
        : `<span class="social-icon instagram disabled"><i class="fab fa-instagram"></i></span>`;
    
    const linkedinLink = properties.Linkedin && properties.Linkedin.trim() 
        ? `<a href="${properties.Linkedin}" class="social-icon linkedin"><i class="fab fa-linkedin-in"></i></a>`
        : `<span class="social-icon linkedin disabled"><i class="fab fa-linkedin-in"></i></span>`;

    popupCard.innerHTML = `
            <div class="agent-header">
                <div class="agent-avatar">
                    <img src="${properties.avatar || 'avatar.png'}" alt="Agent avatar" />
                </div>
                <div class="agent-badges">
                    <div class="agent-name-title">
                        <h3>${properties.Name || ''}</h3>
                        <span class="agent-title">Real Estate Agent</span>
                    </div>
                    <div class="badge-container">
                        <img src="${properties.badge || 'badge.png'}" alt="Certification badge" />
                    </div>
                </div>
            </div>

            <div class="agent-contact">
                <div class="contact-item">
                    <i class="fa fa-envelope"></i>
                    <a href="mailto:${properties.Email || 'N/A'}">${properties.Email || 'N/A'}</a>
                </div>
                <div class="contact-item">
                    <i class="fa fa-phone"></i>
                    <a href="tel:${properties.Phone || 'N/A'}">${properties.Phone || 'N/A'}</a>
                </div>
                <div class="contact-item">
                    <i class="fa fa-location-dot"></i>
                    <span>${properties.City || 'N/A'}, ${properties.State || 'N/A'}</span>
                </div>
            </div>

            <div class="agent-social">
                ${facebookLink}
                ${twitterLink}
                ${instagramLink}
                ${linkedinLink}
            </div>

            <div class="agent-professional">
                <h4><i class="fa fa-id-card"></i> Professional Information</h4>
                <div class="professional-details">
                    <div class="detail-col">
                        <div class="detail-label">License Number</div>
                        <div class="detail-value">${properties.License || 'N/A'}</div>
                    </div>
                    <div class="detail-col">
                        <div class="detail-label">Years of Experience</div>
                        <div class="detail-value">${properties['Years Expe'] || '1-4'}</div>
                    </div>
                </div>
            </div>

            <div class="agent-about">
                <h4>About</h4>
                <p class="about-preview">${properties.about || '"Born and raised in the Grand Canyon State, Baggio didn\'t directly move into real estate. He earned a baseball scholarship to...'}</p>
                <button class="view-details-btn">View Full Details</button>
            </div>
    `;

    popupCard.addEventListener('mouseenter', () => {
        highlightAgentOnMap(properties);
    });

    popupCard.addEventListener('mouseleave', () => {
        unhighlightAgentOnMap(properties);
    });

    popupCard.addEventListener('click', () => {
        zoomToAgent(properties, popupCard);
    });

    const btn = popupContainer.querySelector('.view-details-btn');
    if (btn) {
        btn.addEventListener('click', () => {
            console.log('View full details clicked for:', properties.Name);
        });
    }

    popupContainer.appendChild(popupCard);
}

agentMap.on('moveend', () => {
    if (agentsSelectMode != 'view') {
        return;
    }

    popupContainer.innerHTML = '';
    popupContainer.scrollTop = 0;

    const features = agentMap.queryRenderedFeatures({ layers: ['unclustered-point']});
    features.forEach(feature => {
        createOrUpdatePopup(feature.properties);
    });
});

clickMode.addEventListener('click', () => {
    clickMode.classList.add('selected');
    viewMode.classList.remove('selected');
    polygonMode.classList.remove('selected');

    popupContainer.innerHTML = `
            <i class="fa-solid fa-location-dot" id="big-marker"></i>
            <h3 id="no-point-header">Click a marker on the map to view real estate professional details</h3>
            <p id="no-point-p">124 military-friendly real estate professionals found</p>
    `;
    popupContainer.scrollTop = 0;

    agentsSelectMode = 'click';
});

viewMode.addEventListener('click', () => {
    viewMode.classList.add('selected');
    clickMode.classList.remove('selected');
    polygonMode.classList.remove('selected');

    popupContainer.innerHTML = `
            <i class="fa-solid fa-location-dot" id="big-marker"></i>
            <h3 id="no-point-header">Zoom into the map to view real estate professional details</h3>
            <p id="no-point-p">124 military-friendly real estate professionals found</p>
    `;
    popupContainer.scrollTop = 0;

    agentsSelectMode = 'view';

    setTimeout(() => {
        const source = agentMap.getSource('localAgents');
        if (source && agentMap.getZoom() > 10) {
            queryClusteredFeatures(source);
        }
    }, 100);
});

function queryClusteredFeatures(source) {
    const clusters = agentMap.queryRenderedFeatures({ layers: ['clusters'] });
    
    if (clusters.length === 0) {
        queryUnclusteredFeatures();
        return;
    }
    
    let processedFeatures = [];
    let pendingClusters = clusters.length;
    
    clusters.forEach(cluster => {
        const clusterId = cluster.properties.cluster_id;
        
        source.getClusterLeaves(clusterId, Infinity, 0, (err, features) => {
            if (err) {
                console.error('Error getting cluster leaves:', err);
            } else {
                processedFeatures = processedFeatures.concat(features);
            }
            
            pendingClusters--;
            
            if (pendingClusters === 0) {
                const unclusteredPoints = agentMap.queryRenderedFeatures({ 
                    layers: ['unclustered-point'] 
                });
                
                processedFeatures = processedFeatures.concat(unclusteredPoints);
                
                popupContainer.innerHTML = `
                    <h3 id="state-agents-header">${processedFeatures.length} Agents Visible</h3>
                `;
                
                processedFeatures.forEach(feature => {
                    createOrUpdatePopup(feature.properties);
                });
                
                popupContainer.scrollTop = 0;
            }
        });
    });
    
    if (clusters.length === 0) {
        queryUnclusteredFeatures();
    }
}

function queryUnclusteredFeatures() {
    const features = agentMap.queryRenderedFeatures({ 
        layers: ['unclustered-point'] 
    });
    
    popupContainer.innerHTML = `
        <h3 id="state-agents-header">${features.length} Agents Visible</h3>
    `;
    
    features.forEach(feature => {
        createOrUpdatePopup(feature.properties);
    });
    
    popupContainer.scrollTop = 0;
}

polygonMode.addEventListener('click', () => {
    polygonMode.classList.add('selected');
    viewMode.classList.remove('selected');
    clickMode.classList.remove('selected');
    
    selectedStates = null;
    agentMap.setPaintProperty('states', 'fill-opacity', 0.0);

    popupContainer.innerHTML = `
            <i class="fa-solid fa-location-dot" id="big-marker"></i>
            <h3 id="no-point-header">Select a state to view available agents in the area</h3>
            <p id="no-point-p">124 military-friendly real estate professionals found</p>
    `;
    popupContainer.scrollTop = 0;

    agentsSelectMode = 'polygon';
});

function highlightAgentOnMap(properties) {
    if (highlightedMarker) {
        highlightedMarker.remove();
    }

    const coordinates = [
        parseFloat(properties.longitude),
        parseFloat(properties.latitude)
    ]

    if (coordinates[0] === 0 && coordinates[1] === 0) {
        console.warn('Invalid coordinates for agent:', properties.Name);
        return;
    }

    const el = document.createElement('div');
    el.className = 'highlighted-marker';
    el.style.width = '18px';
    el.style.height = '18px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = '#ffcc00';
    el.style.border = '3px solid #ffffff';
    el.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';

    highlightedMarker = new mapboxgl.Marker(el)
        .setLngLat(coordinates)
        .addTo(map);
}

function unhighlightAgentOnMap() {
    if(highlightedMarker && !activeAgentCard) {
        highlightedMarker.remove();
        highlightedMarker = null;
    }
}

function zoomToAgent(properties, cardElement) {
    const coordinates = [
        parseFloat(properties.longitude || properties._lon || 0),
        parseFloat(properties.latitude || properties._lat || 0)
    ];

    if (coordinates[0] === 0 && coordinates[1] === 0) {
        console.warn('Invalid coordinates for agent:', properties.Name);
        return;
    }

    if (activeAgentCard) {
        activeAgentCard.classList.remove('active-agent-card');
    }

    cardElement.classList.add('active-agent-card');
    activeAgentCard = cardElement;

    agentMap.flyTo({
        center: coordinates,
        zoom: 15,
        duration: 1500
    });

    if (highlightedMarker) {
        highlightedMarker.remove();
    }

    const el = document.createElement('div');
    el.className = 'active-marker';
    el.style.width = '24px';
    el.style.height = '24px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = '#ff3300';
    el.style.border = '4px solid #ffffff';
    el.style.boxShadow = '0 0 15px rgba(0, 0, 0, 0.7)';
    
    highlightedMarker = new mapboxgl.Marker(el)
        .setLngLat(coordinates)
        .addTo(map);
}

agentMap.on('mousemove', 'states', (e) => {
    if (agentsSelectMode !== 'polygon') return;

    agentMap.getCanvas().style.cursor = 'pointer';

    agentMap.setPaintProperty('states', 'fill-opacity', [
        'case',
        ['==', ['get', 'twoLetter'], e.features[0].properties.twoLetter],
        0.3,
        0.0
    ]);
});

agentMap.on('mouseleave', 'states', () => {
    if (agentsSelectMode !== 'polygon') return;

    agentMap.getCanvas().style.cursor = '';

    if (!selectedState) {
        agentMap.setPaintProperty('states', 'fill-opacity', 0.0);
    } else {
        agentMap.setPaintProperty('states', 'fill-opacity', [
            'case',
            ['==', ['get', 'twoLetter'], selectedState],
            0.5,
            0.0
        ]);
    }
});

agentMap.on('click', 'states', (e) => {
    if (agentsSelectMode !== 'polygon') return;

    const stateCode = e.features[0].properties.twoLetter;
    const stateName = e.features[0].properties.cityState;

    popupContainer.innerHTML = '';

    if (selectedState === stateCode) {
        selectedState = null;
        agentMap.setPaintProperty('states', 'fill-opacity', 0.0);

        popupContainer.innerHTML = `
            <i class="fa-solid fa-location-dot" id="big-marker"></i>
            <h3 id="no-point-header">Select a state to view available agents in the area</h3>
            <p id="no-point-p">124 military-friendly real estate professionals found</p>
        `;

        return;
    }

    selectedState = stateCode;

    popupContainer.innerHTML = `
        <h3 id="no-point-header">Loading agents in ${stateName}...</h3>
    `;

    const source = agentMap.getSource('localAgents');

    fetch('resources/real_estate_agents.geojson')
        .then(response => response.json())
        .then(data => {
            const stateAgents = data.features.filter(
                feature => feature.properties.State === stateCode
            );

            if (stateAgents.length === 0) {
                popupContainer.innerHTML = `
                    <i class="fa-solid fa-location-dot" id="big-marker"></i>
                    <h3 id="no-point-header">No agents found in ${stateName}</h3>
                    <p id="no-point-p">Try selecting a different state</p>
                `;
                return;
            }

            popupContainer.innerHTML = `
                <h3 id="state-agents-header">${stateAgents.length} Agents in ${stateName}</h3>
            `;

            
            stateAgents.forEach(agent => {
                createOrUpdatePopup(agent.properties);
            });
            
            setTimeout(() => {
                popupContainer.scrollTop = 0;
                console.log("Setting popupcontainer scroll", popupContainer.scrollTop);
            }, 0)
        })
        .catch(error => {
            console.error('Error filtering agents by state:', error);
        });
});

agentMap.on('load', function() {
    loadAgents();
});