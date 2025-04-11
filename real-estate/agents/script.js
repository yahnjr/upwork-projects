mapboxgl.accessToken = 'pk.eyJ1IjoiaWZvcm1haGVyIiwiYSI6ImNsaHBjcnAwNDF0OGkzbnBzZmUxM2Q2bXgifQ.fIyIgSwq1WWVk9CKlXRXiQ';
let localSocial, nationalSocial, nationalAccountData;
let hoverStateId = null;
let hoverTimer = null;
let isOverPanel = false;
let isOverNationalLayer = false;
let showMode = true;

let map = new mapboxgl.Map({
    container: 'map',
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
        fetch('real_estate_agents.geojson').then(response => {
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return response.json();
        }),
    ])
    .then(([agentsData]) => {
        realEstateAgents = agentsData;
        
        map.addSource('localAgents', {
            type: 'geojson',
            data: realEstateAgents,
            cluster: true, 
            clusterMaxZoom: 14, 
            clusterRadius: 50 
        });
        

        map.addLayer({
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
        

        map.addLayer({
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
        
        map.addLayer({
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
        
        map.on('click', 'clusters', (e) => {
            const features = map.queryRenderedFeatures(e.point, {
                layers: ['clusters']
            });
            
            const clusterId = features[0].properties.cluster_id;
            map.getSource('localAgents').getClusterExpansionZoom(
                clusterId,
                (err, zoom) => {
                    if (err) return;
                    
                    map.easeTo({
                        center: features[0].geometry.coordinates,
                        zoom: zoom
                    });
                }
            );
        });

        map.on('click', 'unclustered-point', (e) => {
            const feature = e.features[0];
            const properties = feature.properties;
            createOrUpdatePopup(properties);
        });
        
        map.on('mouseenter', 'clusters', () => {
            map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'clusters', () => {
            map.getCanvas().style.cursor = '';
        });
        
        map.on('mouseenter', 'unclustered-point', () => {
            map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'unclustered-point', () => {
            map.getCanvas().style.cursor = '';
        });

    })
    .catch(error => {
        console.error('Error loading data:', error);
    });
}

function createOrUpdatePopup(properties) {
    const popupContainer = document.getElementById('popup-container');

    popupContainer.innerHTML = `
        <div class="agent-card">
            <div class="agent-header">
                <div class="agent-avatar">
                    <img src="${properties.avatar || 'avatar.png'}" alt="Agent avatar" />
                </div>
                <div class="agent-badges">
                    <div class="agent-name-title">
                        <h3>${properties.name || 'Baggio Saldivar'}</h3>
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
                <a href="${properties.Facebook || '#'}" class="social-icon facebook"><i class="fab fa-facebook-f"></i></a>
                <a href="${properties.Twitter || '#'}" class="social-icon twitter"><i class="fab fa-twitter"></i></a>
                <a href="${properties.Instagram || '#'}" class="social-icon instagram"><i class="fab fa-instagram"></i></a>
                <a href="${properties.Linkedin || '#'}" class="social-icon linkedin"><i class="fab fa-linkedin-in"></i></a>
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
        </div>
    `;

    const btn = popupContainer.querySelector('.view-details-btn');
    if (btn) {
        btn.addEventListener('click', () => {
            console.log('View full details clicked for:', properties.name);
        });
    }
}

map.on('load', function() {
    loadAgents();
});