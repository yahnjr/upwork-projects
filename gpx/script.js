let map;
let currentVideoTime = 0;
let pointsWithTimestamps = [];
let videoPlayer;
let playerMarker;
let previewMarker;
let isUserSeeking = false;
let debugMode = true;
let firstTimestamp = 0;
let isDrawing = false;
let annotationMode = false;
let startPoint = null;
let currentShape = null;
let currentAnnotationType = null;
let fabricCanvas;

mapboxgl.accessToken = 'pk.eyJ1IjoiaWZvcm1haGVyIiwiYSI6ImNsaHBjcnAwNDF0OGkzbnBzZmUxM2Q2bXgifQ.fIyIgSwq1WWVk9CKlXRXiQ';
map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/satellite-streets-v11',
    center: [-98.5795, 39.8283],
    zoom: 2 
});

function promptForVideoFile() {
    const videoInput = document.createElement('input');
    videoInput.type = 'file';
    videoInput.accept = 'video/*';
    videoInput.style.display = 'none';
    document.body.appendChild(videoInput);
    
    videoInput.addEventListener('change', function(event) {
        const file = event.target.files[0];
        if (file) {
            debugLog(`Video file selected: ${file.name}`);
            loadVideo(file);
            
            const loadControls = document.getElementById('load-controls');
            if (loadControls) {
                loadControls.remove();
            }
            
            const baseFileName = file.name.substring(0, file.name.lastIndexOf('.'));
            showGpxLoadButton(baseFileName);
        }
    });
    
    videoInput.click();
}

function showGpxLoadButton(baseFileName) {
    debugLog(`Showing GPX load button for ${baseFileName}`);
}

function promptForGpxFile() {
    const gpxInput = document.createElement('input');
    gpxInput.type = 'file';
    gpxInput.accept = '.gpx';
    gpxInput.style.display = 'none';
    document.body.appendChild(gpxInput);
    
    gpxInput.addEventListener('change', function(event) {
        const file = event.target.files[0];
        if (file) {
            debugLog(`GPX file selected: ${file.name}`);
            processGpxFile(file);
        }
    });
    
    gpxInput.click();
}

function loadVideo(file) {
    const videoUrl = URL.createObjectURL(file);
    
    videoPlayer = document.getElementById('videoPlayer');
    if (!videoPlayer) {
        videoPlayer = document.createElement('video');
        videoPlayer.id = 'videoPlayer';
        videoPlayer.className = 'video-player';
        
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        videoContainer.appendChild(videoPlayer);
        
        document.getElementById('app-wrap').appendChild(videoContainer);
    }
    
    videoPlayer.src = videoUrl;
    videoPlayer.muted = true;
    videoPlayer.load();
    
    setupVideoPlayer();
}

function setupVideoPlayer() {
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
    controlsContainer.id = 'controls';
    
    const timelineContainer = document.createElement('div');
    timelineContainer.className = 'timeline-container';
    
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    
    const progressHandle = document.createElement('div');
    progressHandle.className = 'progress-handle';
    
    timelineContainer.appendChild(progressBar);
    timelineContainer.appendChild(progressHandle);
    
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'control-buttons';
    
    const playButton = createButton('play-pause-button', 'fa-play', 'Play/Pause');
    playButton.addEventListener('click', function() {
        if (videoPlayer.paused) {
            videoPlayer.play();
            playButton.querySelector('i').className = 'fas fa-pause';
        } else {
            videoPlayer.pause();
            playButton.querySelector('i').className = 'fas fa-play';
        }
    });
    
    const loadVideoButton = createButton('load-video-button', 'fa-file-video', 'Load Video');
    loadVideoButton.addEventListener('click', promptForVideoFile);
    
    const loadGpxButton = createButton('load-gpx-button', 'fa-map-marker-alt', 'Load GPX');
    loadGpxButton.addEventListener('click', promptForGpxFile);
    
    const drawButton = createButton('draw-button', 'fa-pencil-alt', 'Draw');
    drawButton.id = 'rectangleButton';
    drawButton.addEventListener('click', function() {
        // Toggle active state
        const isActive = this.classList.toggle('active');
        
        if (isActive) {
            annotationMode = true;
            currentAnnotationType = 'rectangle';
            document.querySelector('.annotation-canvas-container').style.pointerEvents = 'auto';
            annotateButton.classList.remove('active');
            debugLog('Rectangle drawing mode activated');
        } else {
            annotationMode = false;
            document.querySelector('.annotation-canvas-container').style.pointerEvents = 'none';
            debugLog('Drawing mode deactivated');
        }
    });
    
    const annotateButton = createButton('annotate-button', 'fa-font', 'Annotate');
    annotateButton.id = 'textButton';
    annotateButton.addEventListener('click', function() {
        const isActive = this.classList.toggle('active');
        
        if (isActive) {
            annotationMode = true;
            currentAnnotationType = 'text';
            document.querySelector('.annotation-canvas-container').style.pointerEvents = 'auto';
            drawButton.classList.remove('active');
            debugLog('Text annotation mode activated');
        } else {
            annotationMode = false;
            document.querySelector('.annotation-canvas-container').style.pointerEvents = 'none';
            debugLog('Annotation mode deactivated');
        }
    });
    
    const downloadButton = createButton('download-button', 'fa-download', 'Download Screenshot');
    downloadButton.addEventListener('click', takeScreenshot);
    
    buttonsContainer.appendChild(playButton);
    buttonsContainer.appendChild(loadVideoButton);
    buttonsContainer.appendChild(loadGpxButton);
    buttonsContainer.appendChild(drawButton);
    buttonsContainer.appendChild(annotateButton);
    buttonsContainer.appendChild(downloadButton);
    
    controlsContainer.appendChild(timelineContainer);
    controlsContainer.appendChild(buttonsContainer);
    
    let videoContainer = videoPlayer.parentElement;
    if (!videoContainer) {
        videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        
        videoPlayer.parentNode.insertBefore(videoContainer, videoPlayer);
        videoContainer.appendChild(videoPlayer);
    }
    
    videoContainer.appendChild(controlsContainer);
    
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
            controlsContainer.style.opacity = '0.5';
        }
    });
    
    window.customControls = {
        progressBar: progressBar,
        progressHandle: progressHandle,
        playButton: playButton
    };
    
    debugLog('Custom controls created with new layout');
}

function createButton(className, iconClass, tooltip) {
    const button = document.createElement('button');
    button.className = `control-button ${className}`;
    
    const icon = document.createElement('i');
    icon.className = `fas ${iconClass}`;
    button.appendChild(icon);
    
    const tooltipElement = document.createElement('span');
    tooltipElement.className = 'tooltip';
    tooltipElement.textContent = tooltip;
    button.appendChild(tooltipElement);
    
    return button;
}

function processGpxFile(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const gpxContent = e.target.result;
        
        const parser = new DOMParser();
        const gpxDoc = parser.parseFromString(gpxContent, "text/xml");
        
        const trackPoints = gpxDoc.querySelectorAll('trkpt');
        debugLog(`Found ${trackPoints.length} track points in GPX file`);
        
        if (trackPoints.length === 0) {
            alert('No track points found in the GPX file');
            return;
        }
        
        processGpxPoints(trackPoints);
        addMapSources();
        createPlayerMarker();
        createPreviewMarker();
        makePointsClickable();
    };
    
    reader.readAsText(file);
}

function processGpxPoints(trackPoints) {
    pointsWithTimestamps = [];
    let coordinates = [];
    
    const firstPoint = trackPoints[0];
    const firstTime = firstPoint.querySelector('time');
    
    if (firstTime) {
        firstTimestamp = new Date(firstTime.textContent).getTime() / 1000;
    }
    
    trackPoints.forEach((point, index) => {
        const lat = parseFloat(point.getAttribute('lat'));
        const lon = parseFloat(point.getAttribute('lon'));
        
        const timeElement = point.querySelector('time');
        let timestamp = 0;
        
        if (timeElement) {
            const time = new Date(timeElement.textContent).getTime() / 1000;
            timestamp = time - firstTimestamp;
        } else {
            timestamp = index * 1;
        }
        
        pointsWithTimestamps.push({
            coordinates: [lon, lat],
            timestamp: timestamp
        });
        
        coordinates.push([lon, lat]);
    });
    
    pointsWithTimestamps.sort((a, b) => a.timestamp - b.timestamp);
    
    if (pointsWithTimestamps.length > 0) {
        const firstCoordinates = pointsWithTimestamps[0].coordinates;
        map.flyTo({
            center: firstCoordinates,
            zoom: 17,
            essential: false
        });
        debugLog(`Setting map center to: ${firstCoordinates}`);
    }
    
    createGeoJsonFromPoints(coordinates);
    
    debugLog(`Processed ${pointsWithTimestamps.length} points with timestamps`);
}

function createGeoJsonFromPoints(coordinates) {
    const pointsGeoJson = {
        type: 'FeatureCollection',
        features: pointsWithTimestamps.map((point, index) => {
            return {
                type: 'Feature',
                properties: {
                    id: index,
                    timeSeconds: point.timestamp
                },
                geometry: {
                    type: 'Point',
                    coordinates: point.coordinates
                }
            };
        })
    };
    
    const lineGeoJson = {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'LineString',
                coordinates: coordinates
            }
        }]
    };
    
    window.streetWalkPoints = pointsGeoJson;
    window.streetWalkLine = lineGeoJson;
}

function addMapSources() {
    if (!map.getSource('streetWalkLine')) {
        map.addSource('streetWalkLine', {
            type: 'geojson',
            data: window.streetWalkLine
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
    } else {
        map.getSource('streetWalkLine').setData(window.streetWalkLine);
    }
    
    if (!map.getSource('streetWalkPoints')) {
        map.addSource('streetWalkPoints', {
            type: 'geojson',
            data: window.streetWalkPoints
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
    } else {
        map.getSource('streetWalkPoints').setData(window.streetWalkPoints);
    }
}

function createPlayerMarker() {
    if (playerMarker) {
        playerMarker.remove();
    }
    
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
    if (previewMarker) {
        previewMarker.remove();
    }
    
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
    }
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
    if (pointsWithTimestamps.length === 0) {
        return [-122.8028, 45.4696];
    }
    
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
        console.log('[GpxVideo]', ...args);
    }
}

function setupFabricEvents() {
    if (!fabricCanvas) return;
    
    fabricCanvas.on('mouse:down', function(options) {
        if (!annotationMode) return;
        
        debugLog('Canvas mouse down', currentAnnotationType);
        if (currentAnnotationType === 'rectangle') {
            isDrawing = true;
            const pointer = fabricCanvas.getPointer(options.e);
            startPoint = { x: pointer.x, y: pointer.y };
            currentShape = new fabric.Rect({
                left: startPoint.x,
                top: startPoint.y,
                width: 0,
                height: 0,
                fill: 'rgba(255, 0, 0, 0.2)',
                stroke: 'red',
                strokeWidth: 2
            });
            fabricCanvas.add(currentShape);
        }
    });
    
    fabricCanvas.on('mouse:move', function(options) {
        if (!annotationMode || !isDrawing || currentAnnotationType !== 'rectangle' || !currentShape) return;
        
        const pointer = fabricCanvas.getPointer(options.e);
        if (startPoint && pointer) {
            currentShape.set({
                width: Math.abs(pointer.x - startPoint.x),
                height: Math.abs(pointer.y - startPoint.y),
                left: Math.min(startPoint.x, pointer.x),
                top: Math.min(startPoint.y, pointer.y)
            });
            fabricCanvas.renderAll();
        }
    });
    
    fabricCanvas.on('mouse:up', function(options) {
        if (!annotationMode) return;
        
        if (currentAnnotationType === 'rectangle' && isDrawing) {
            isDrawing = false;
            currentShape = null;
        } else if (currentAnnotationType === 'text') {
            const pointer = fabricCanvas.getPointer(options.e);
            const textBox = new fabric.IText('Edit text', { 
                left: pointer.x,
                top: pointer.y,
                fontSize: 20,
                fill: 'red',
                hasControls: true,
                hasRotatingPoint: true,
                editable: true,
                cursorWidth: 1,
                cursorColor: 'black',
                borderColor: 'red',
                cornerColor: 'red',
                padding: 5
            });
            
            fabricCanvas.add(textBox);
            fabricCanvas.setActiveObject(textBox);
            
            textBox.enterEditing();
            textBox.selectAll();
            
            fabricCanvas.renderAll();
        }
    });
    
    debugLog('Fabric canvas events set up');
}

window.addEventListener('resize', () => {
    if (fabricCanvas) {
        fabricCanvas.setWidth(window.innerWidth);
        fabricCanvas.setHeight(window.innerHeight);
        fabricCanvas.renderAll();
    }
});

function takeScreenshot() {
    debugLog('Taking screenshot...');
    
    const screenshotCanvas = document.createElement('canvas');
    const context = screenshotCanvas.getContext('2d');
    
    screenshotCanvas.width = window.innerWidth;
    screenshotCanvas.height = window.innerHeight;
    
    const mapCanvas = map.getCanvas();
    context.drawImage(mapCanvas, 0, 0, mapCanvas.width, mapCanvas.height);
    
    if (videoPlayer && videoPlayer.videoWidth && videoPlayer.videoHeight) {
        const videoRect = videoPlayer.getBoundingClientRect();
        context.drawImage(
            videoPlayer, 
            videoRect.left, videoRect.top, 
            videoRect.width, videoRect.height
        );
    }
    
    if (fabricCanvas) {
        const fabricImage = fabricCanvas.toDataURL({
            format: 'png',
            quality: 1
        });
        
        const tempImage = new Image();
        tempImage.onload = function() {
            context.drawImage(tempImage, 0, 0);
            
            const dataUrl = screenshotCanvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `gpx-video-screenshot-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.png`;
            link.href = dataUrl;
            link.click();
            
            debugLog('Screenshot downloaded');
        };
        tempImage.src = fabricImage;
    } else {
        const dataUrl = screenshotCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `gpx-video-screenshot-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.png`;
        link.href = dataUrl;
        link.click();
        
        debugLog('Screenshot downloaded (no annotations)');
    }
}

map.on('load', () => {
    debugLog('Map loaded');

    const canvasContainer = document.createElement('div');
    canvasContainer.className = 'annotation-canvas-container';

    const canvas = document.createElement('canvas');
    canvas.id = 'annotation-canvas';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 160;
    canvasContainer.appendChild(canvas);

    document.getElementById('app-wrap').appendChild(canvasContainer);

    fabricCanvas = new fabric.Canvas('annotation-canvas');
    fabricCanvas.selection = false;

    const loadControls = document.createElement('div');
    loadControls.id = 'load-controls';
    
    const loadButton = document.createElement('button');
    loadButton.className = 'load-video-button';
    loadButton.innerHTML = 'Load Video';
    loadButton.addEventListener('click', promptForVideoFile);
    
    loadControls.appendChild(loadButton);
    document.getElementById('app-wrap').appendChild(loadControls);

    setupFabricEvents();
});