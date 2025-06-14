let map;
let currentVideoTime = 0;
let pointsWithTimestamps = [];
let videoPlayer;
let playerMarker;
let previewMarker;
let isUserSeeking = false;
let debugMode = true;
let mode = null;
let drawing = false;
let currentPolygon = null;
let isDrawing = false;
let currentShape = null;
let startPoint = {};

mapboxgl.accessToken = 'pk.eyJ1IjoiaWZvcm1haGVyIiwiYSI6ImNsaHBjcnAwNDF0OGkzbnBzZmUxM2Q2bXgifQ.fIyIgSwq1WWVk9CKlXRXiQ';
map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/satellite-streets-v11',
    bounds: [
        [-122.8035, 45.4692],
        [-122.802, 45.4701]
    ],
    zoom: 4
});

function setupVideoPlayer() {
    videoPlayer = document.getElementById('videoPlayer');
    
    if (!videoPlayer) {
        console.error('Video player element not found!');
        return;
    }
    
    debugLog('Video player found, setting up custom controls');
    
    videoPlayer.removeAttribute('controls');
    
    createCustomControls();
    
    videoPlayer.addEventListener('timeupdate', function() {
        if (!isUserSeeking) {
            currentVideoTime = videoPlayer.currentTime;
            updateMarkerPosition(currentVideoTime);
            updateProgressBar();
        }
    });

    videoPlayer.addEventListener('seeking', function() {
        currentVideoTime = videoPlayer.currentTime;
        updateMarkerPosition(currentVideoTime);
        updateProgressBar();
    });
    
}

function createCustomControls() {
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'custom-video-controls';
    
    const playButton = document.createElement('button');
    playButton.className = 'play-pause-button';
    playButton.innerHTML = '▶'; 
    
    playButton.addEventListener('click', function() {
        if (videoPlayer.paused) {
            videoPlayer.play();
            playButton.innerHTML = '❚❚';
        } else {
            videoPlayer.pause();
            playButton.innerHTML = '▶';
        }
    });
    
    const timelineContainer = document.createElement('div');
    timelineContainer.className = 'timeline-container';
    
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    
    const progressHandle = document.createElement('div');
    progressHandle.className = 'progress-handle';
    
    timelineContainer.appendChild(progressBar);
    timelineContainer.appendChild(progressHandle);
    controlsContainer.appendChild(playButton);
    controlsContainer.appendChild(timelineContainer);
    
    let videoContainer = videoPlayer.parentElement;
    if (!videoContainer) {
        videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        
        videoPlayer.parentNode.insertBefore(videoContainer, videoPlayer);
        videoContainer.appendChild(videoPlayer);
    }
    
    videoContainer.appendChild(controlsContainer);
    
    videoPlayer.addEventListener('play', function() {
        playButton.innerHTML = '❚❚';
    });
    
    videoPlayer.addEventListener('pause', function() {
        playButton.innerHTML = '▶'; 
    });
    
    timelineContainer.addEventListener('click', function(event) {
        const rect = timelineContainer.getBoundingClientRect();
        const clickPosition = (event.clientX - rect.left) / rect.width;
        
        isUserSeeking = true;
        videoPlayer.currentTime = clickPosition * videoPlayer.duration;
        
        updateProgressBar();
        
        setTimeout(() => { isUserSeeking = false; }, 100);
    });
    
    timelineContainer.addEventListener('mousemove', function(event) {
        const rect = timelineContainer.getBoundingClientRect();
        const percentage = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        
        const previewTime = percentage * videoPlayer.duration;
        updatePreviewMarkerPosition(previewTime);
    });
    
    timelineContainer.addEventListener('mouseout', function() {
        if (previewMarker) {
            previewMarker.getElement().style.display = 'none';
        }
    });
    
    videoContainer.addEventListener('mouseenter', function() {
        controlsContainer.style.opacity = '1';
    });
    
    videoContainer.addEventListener('mouseleave', function() {
        if (!videoPlayer.paused) {
            controlsContainer.style.opacity = '0.3';
        }
    });
    
    window.customControls = {
        progressBar: progressBar,
        progressHandle: progressHandle,
        playButton: playButton
    };
    
    debugLog('Custom controls created');
}

function updateProgressBar() {
    if (!window.customControls || !videoPlayer) return;
    
    if (isNaN(videoPlayer.duration) || videoPlayer.duration === 0) {
        debugLog('Video duration not available yet, cannot update progress bar');
        return;
    }
    
    const percentage = (videoPlayer.currentTime / videoPlayer.duration) * 100;
    
    if (!isNaN(percentage)) {
        window.customControls.progressBar.style.width = percentage + '%';
        window.customControls.progressHandle.style.left = percentage + '%';
        debugLog('Progress updated to', percentage.toFixed(2) + '%');
    }
}

function loadGSXData() {
    debugLog('Starting to load data...');
   
    Promise.all([
        fetch('streetWalkLine.geojson').then(response => {
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return response.json();
        }),
        fetch('streetWalkPoints.geojson').then(response => {
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return response.json();
        }),
        fetch('streetWalkLots.geojson').then(response => {
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return response.json();
        })
    ])
    .then(([lineData, pointsData, lotsData]) => {
        streetWalkLine = lineData;
        streetWalkPoints = pointsData;
        streetWalkLots = lotsData;
        
        debugLog('Data loaded successfully');
        
        processPointsWithTimestamps(pointsData);
        
        addMapSources();
        
        createPlayerMarker();
        createPreviewMarker();
        
        makePointsClickable();
    })
    .catch(error => {
        console.error('Error loading data:', error);
    });
}

function processPointsWithTimestamps(pointsData) {
    pointsWithTimestamps = [];
    
    if (pointsData.features.length > 0 && debugMode) {
        debugLog('First point properties:', JSON.stringify(pointsData.features[0].properties));
    }
    
    pointsData.features.forEach(feature => {
        const coords = feature.geometry.coordinates;
        const timestamp = feature.properties.timeSeconds || 0;
        
        pointsWithTimestamps.push({
            coordinates: coords,
            timestamp: timestamp
        });
    });
    
    pointsWithTimestamps.sort((a, b) => a.timestamp - b.timestamp);
    
    debugLog('Processed points with timestamps:', pointsWithTimestamps.length);
}

function addMapSources() {
    map.addSource('streetWalkLine', {
        type: 'geojson',
        data: streetWalkLine
    });
   
    map.addLayer({
        id: 'line-layer',
        type: 'line',
        source: 'streetWalkLine',
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-color': '#42f5f5',
            'line-width': 3
        }
    });
   
    map.addSource('streetWalkPoints', {
        type: 'geojson',
        data: streetWalkPoints
    });
           
    map.addLayer({
        id: 'streetWalkPoints',
        type: 'circle',
        source: 'streetWalkPoints',
        paint: {
            'circle-radius': 6,
            'circle-color': '#ebe77a',
        }
    });
    
    map.addSource('streetWalkLots', {
        type: 'geojson',
        data: streetWalkLots
    });
   
    map.addLayer({
        id: 'lots-layer',
        type: 'fill',
        source: 'streetWalkLots',
        paint: {
            'fill-color': ['match', ['get', 'PassFail'],
                          'Passing', 'green',
                          'Failing', 'red',
                          'gray'],
            'fill-opacity': 0.4,
        }
    });
    
    debugLog('Map sources and layers added');
}

function createPlayerMarker() {
    const markerElement = document.createElement('div');
    markerElement.className = 'player-marker';
    
    const initialCoords = pointsWithTimestamps.length > 0 
        ? pointsWithTimestamps[0].coordinates 
        : [-122.8028, 45.4696];
        
    playerMarker = new mapboxgl.Marker(markerElement)
        .setLngLat(initialCoords)
        .addTo(map);
        
    debugLog('Player marker created at', initialCoords);
}

function createPreviewMarker() {
    const markerElement = document.createElement('div');
    markerElement.className = 'preview-marker';
    markerElement.style.display = 'none';
    
    const initialCoords = pointsWithTimestamps.length > 0 
        ? pointsWithTimestamps[0].coordinates 
        : [-122.8028, 45.4696];
        
    previewMarker = new mapboxgl.Marker(markerElement)
        .setLngLat(initialCoords)
        .addTo(map);
        
    debugLog('Preview marker created');
}

function makePointsClickable() {
    map.on('click', 'streetWalkPoints', (e) => {
        if (!videoPlayer) return;
        
        const feature = e.features[0];
        const timestamp = feature.properties.timeSeconds;
        
        if (timestamp !== undefined) {
            isUserSeeking = true;
            videoPlayer.currentTime = timestamp;
            debugLog("Setting timestamp to", timestamp);
            
            updateProgressBar();
            
            setTimeout(() => { isUserSeeking = false; }, 100);
        }
    });
    
    map.on('mouseenter', 'streetWalkPoints', () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    
    map.on('mouseleave', 'streetWalkPoints', () => {
        map.getCanvas().style.cursor = '';
    });
    
    debugLog('Points made clickable');
}

function updateMarkerPosition(currentTime) {
    if (!playerMarker || pointsWithTimestamps.length === 0) return;
    
    const position = getPositionAtTime(currentTime);
    playerMarker.setLngLat(position);
}

function updatePreviewMarkerPosition(previewTime) {
    if (!previewMarker || pointsWithTimestamps.length === 0) return;
    
    previewMarker.getElement().style.display = 'block';
    
    const position = getPositionAtTime(previewTime);
    previewMarker.setLngLat(position);
}

function getPositionAtTime(time) {
    if (time <= pointsWithTimestamps[0].timestamp) {
        return pointsWithTimestamps[0].coordinates;
    }
    
    if (time >= pointsWithTimestamps[pointsWithTimestamps.length - 1].timestamp) {
        return pointsWithTimestamps[pointsWithTimestamps.length - 1].coordinates;
    }
    
    let p1, p2;
    for (let i = 0; i < pointsWithTimestamps.length - 1; i++) {
        if (time >= pointsWithTimestamps[i].timestamp && 
            time <= pointsWithTimestamps[i + 1].timestamp) {
            p1 = pointsWithTimestamps[i];
            p2 = pointsWithTimestamps[i + 1];
            break;
        }
    }
    
    if (!p1 || !p2) {
        return pointsWithTimestamps[0].coordinates;
    }
    
    const timeDiff = p2.timestamp - p1.timestamp;
    const factor = timeDiff === 0 ? 0 : (time - p1.timestamp) / timeDiff;
    
    const lng = p1.coordinates[0] + factor * (p2.coordinates[0] - p1.coordinates[0]);
    const lat = p1.coordinates[1] + factor * (p2.coordinates[1] - p1.coordinates[1]);
    
    return [lng, lat];
}

function debugLog(...args) {
    if (debugMode) {
        console.log('[MapVideo]', ...args);
    }
}

function setupAnnotationLayer() {
    const mapContainer = document.getElementById('map');
    const annotationLayer = document.getElementById('annotation-layer');
    const svgLayer = document.getElementById('svg-layer');
    
    const mapRect = mapContainer.getBoundingClientRect();
    
    annotationLayer.style.width = mapRect.width + 'px';
    annotationLayer.style.height = mapRect.height + 'px';
    annotationLayer.style.left = mapRect.left + 'px';
    annotationLayer.style.top = mapRect.top + 'px';
    
    svgLayer.style.width = mapRect.width + 'px';
    svgLayer.style.height = mapRect.height + 'px';
    svgLayer.style.left = mapRect.left + 'px';
    svgLayer.style.top = mapRect.top + 'px';

    updateAnnotationInteractivity();
}

function setMode(m) {
    debugLog(`Setting mode from '${mode}' to '${m}'`);
    mode = m;
    if (mode !== 'draw') {

        drawing = false;
        currentPolygon = null;
    } else {
         debugLog('Entering draw mode.');
    }

    updateAnnotationInteractivity();
}

function updateAnnotationInteractivity() {
    const annotationLayer = document.getElementById('annotation-layer');
    const svgLayer = document.getElementById('svg-layer');

    if (mode === 'draw' || mode === 'write') {
        annotationLayer.style.pointerEvents = 'auto';
        svgLayer.style.pointerEvents = 'auto';
    } else {
        annotationLayer.style.pointerEvents = 'none';
        svgLayer.style.pointerEvents = 'none';
    }
}

document.getElementById('annotation-layer').addEventListener('click', function(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (mode === 'draw') {
        handleDraw(x, y);
    } else if (mode === 'write') {
        createTextBox(x, y);
    }
});

document.getElementById('drawButton').addEventListener('click', function() {
    setMode('draw');
    highlightActiveButton(this);
});

document.getElementById('writeButton').addEventListener('click', function() {
    setMode('write');
    highlightActiveButton(this);
});

document.getElementById('clearButton').addEventListener('click', function() {
    setMode(null);
    highlightActiveButton(this);
});

function highlightActiveButton(activeButton) {
    const buttons = document.querySelectorAll('.toolbar button');
    buttons.forEach(button => {
        button.classList.remove('active');
    });
    activeButton.classList.add('active');
}

function handleDraw(x, y) {
    debugLog(`handleDraw called with x=${x}, y=${y}. Current drawing state: ${drawing}`);
    const svg = document.getElementById('svg-layer');
     if (!svg) {
         debugLog('Error in handleDraw: svg-layer not found.');
         return;
     }

    if (!drawing) {
        debugLog('Starting a new polygon.');
        currentPolygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        currentPolygon.setAttribute("points", `${x},${y}`);
        currentPolygon.setAttribute("fill", "rgba(255,0,0,0.3)");
        currentPolygon.setAttribute("stroke", "red");
        currentPolygon.setAttribute("stroke-width", "2");
        svg.appendChild(currentPolygon);
        drawing = true;
        debugLog('New polygon created and added to SVG.');
    } else {
        if (!currentPolygon) {
            debugLog('Error in handleDraw: drawing is true, but currentPolygon is null.');
            drawing = false;
            return;
        }
        let points = currentPolygon.getAttribute("points");
        const newPoints = points + ` ${x},${y}`;
        currentPolygon.setAttribute("points", newPoints);
        debugLog(`Added point to polygon. New points: ${newPoints}`);
    }
}


document.getElementById('annotation-layer').addEventListener('dblclick', function() {
    drawing = false;
    currentPolygon = null;
});

function createTextBox(x, y) {
    const textBox = document.createElement('div');
    textBox.className = 'text-annotation';
    textBox.contentEditable = true;
    textBox.style.left = `${x}px`;
    textBox.style.top = `${y}px`;
    
    let firstClick = true;
    textBox.innerText = 'Click to edit text...';
    
    textBox.addEventListener('click', function(e) {
        if (firstClick) {
            textBox.innerText = '';
            firstClick = false;
        }
        e.stopPropagation(); 
    });
    
    document.getElementById('annotation-layer').appendChild(textBox);
    
    setTimeout(() => {
        textBox.focus();
    }, 10);
    
    textBox.addEventListener('mousedown', function(e) {
        if (e.target === textBox) {
            e.preventDefault();
            
            const isEditing = document.activeElement === textBox;
            if (isEditing) return;
            
            textBox.style.cursor = 'move';
            
            let offsetX = e.clientX - textBox.offsetLeft;
            let offsetY = e.clientY - textBox.offsetTop;
            
            function mouseMoveHandler(e) {
                textBox.style.left = `${e.clientX - offsetX}px`;
                textBox.style.top = `${e.clientY - offsetY}px`;
            }
            
            function mouseUpHandler() {
                document.removeEventListener('mousemove', mouseMoveHandler);
                document.removeEventListener('mouseup', mouseUpHandler);
                textBox.style.cursor = 'text';
            }
            
            document.addEventListener('mousemove', mouseMoveHandler);
            document.addEventListener('mouseup', mouseUpHandler);
        }
    });
}

function download() {
    document.querySelector('.toolbar').style.display = 'none';

    const container = document.getElementById('app-wrap');

    html2canvas(container, {
        backgroundColor: null,
        useCORS: true
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = 'annotated_map.png';
        link.href = canvas.toDataURL('image/png');
        link.click();

        document.querySelector('.toolbar').style.display = 'flex';
    }).catch(error => {
        console.error("Error during download:", error);
        document.querySelector('.toolbar').style.display = 'flex';
    });
}


map.on('load', () => {
    debugLog('Map loaded');
    loadGSXData();
    setupVideoPlayer();
    setupAnnotationLayer();

    map.on('resize', setupAnnotationLayer);
});