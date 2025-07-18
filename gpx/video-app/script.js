if (!window.location.search || window.location.search === '?') {
    const defaultParams = '?video=Hillview04-22-2025&Additional-Videos=Hillview04-23-2025';
    window.location.search = defaultParams;
}

let map;
let baseFileName = null;
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
let mapExpandMode = false;
let camera, scene, renderer;
let isUserInteracting = false;
let onPointerDownMouseX = 0, onPointerDownMouseY = 0;
let lon = 0, onPointerDownLon = 0;
let lat = 0, onPointerDownLat = 0;
let phi = 0, theta = 0;
let isVideoMode360 = false;
let video360Container;
let matchingLocations = [];
let videoLink = null;

function getUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const video = urlParams.get('video');
    const additionalVideos = urlParams.get('Additional-Videos');

    let additionalVideosArray = [];
    if (additionalVideos) {
        additionalVideosArray = additionalVideos.split(',');
    }

    return { video, additionalVideosArray };
}

function extractDateFromVideoName(videoName) {
    const dateMatch = videoName.match(/(\d{2}-\d{2}-\d{4})$/);
    return dateMatch ? dateMatch[1] : null;
}

function fetchGPXData() {
    const { video, additionalVideosArray } = getUrlParameters();
    if (!video) {
        console.error('Missing required URL parameter: video');
        return;
    }
    
    console.log("Fetching data for video:", video);
    console.log("Additional videos:", additionalVideosArray);
    
    const allVideos = [video, ...additionalVideosArray].filter(Boolean);
    
    if (allVideos.length > 1) {
        document.getElementById('timestamp-link-container').style.display = 'flex';
        
        allVideos.forEach(videoName => {
            const link = document.createElement('a');
            link.className = 'timestamp-link';
            
            const dateDisplay = extractDateFromVideoName(videoName);
            link.textContent = dateDisplay;
            
            if (videoName === video) {
                link.href = `?video=${encodeURIComponent(videoName)}`;
                if (additionalVideosArray.length > 0) {
                    link.href += `&Additional-Videos=${encodeURIComponent(additionalVideosArray.join(','))}`;
                }
                link.classList.add('selected');
            } else {
                const newAdditional = [...allVideos.filter(v => v !== videoName && v !== video), video];
                link.href = `?video=${encodeURIComponent(videoName)}`;
                if (newAdditional.length > 0) {
                    link.href += `&Additional-Videos=${encodeURIComponent(newAdditional.join(','))}`;
                }
            }
            
            document.getElementById('timestamp-link-container').appendChild(link);
        });
    }
    
    const videoLink = `https://gpx-videos.s3.us-east-2.amazonaws.com/${video}.mp4`;
    loadVideo(videoLink);
    
    const gpxUrl = `https://gpx-videos.s3.us-east-2.amazonaws.com/${video}.gpx`;
    fetchGpxFile(gpxUrl);
}

function fetchGpxFile(gpxUrl) {
    fetch(gpxUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch GPX file: ' + response.statusText);
            }
            return response.text();
        })
        .then(gpxContent => {
            processGpxContent(gpxContent);
        })
        .catch(error => {
            debugLog('Error fetching GPX file:', error);
        });
}

function processGpxContent(gpxContent) {
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
}

function loadVideo(source) {
    videoPlayer = document.getElementById('videoPlayer');
    if (!videoPlayer) {
        videoPlayer = document.createElement('video');
        videoPlayer.id = 'videoPlayer';
        videoPlayer.className = 'video-player';
        
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        videoContainer.appendChild(videoPlayer);
        
        document.getElementById('gpx-video-app-wrap').appendChild(videoContainer);
    }
    
    if (source instanceof File) {
        videoPlayer.src = URL.createObjectURL(source);
    } else if (typeof source === 'string') {
        videoPlayer.crossOrigin = 'anonymous';
        videoPlayer.src = source;
    } else {
        console.error('Invalid video source:', source);
        return;
    }
    
    videoPlayer.muted = true;
    videoPlayer.load();
    
    setupVideoPlayer();
    
        videoPlayer.addEventListener('loadeddata', function() {
            videoPlayer.currentTime = 0;
            
            videoPlayer.addEventListener('seeked', function() {
                setTimeout(function() {
                    init360VideoPlayer();
                }, 100);
            }, { once: true });
        }, { once: true });
    }

function init360VideoPlayer() {
    if (!videoPlayer) return;
    
    video360Container = document.createElement('div');
    video360Container.id = 'video360-container';
    video360Container.className = 'video360-container';
    
    videoPlayer.style.display = 'none';
    
    const videoContainer = videoPlayer.parentElement;
    videoContainer.appendChild(video360Container);
    
    camera = new THREE.PerspectiveCamera(75, videoContainer.offsetWidth / videoContainer.offsetHeight, 1, 1100);
    scene = new THREE.Scene();
    
    const texture = new THREE.VideoTexture(videoPlayer);
    texture.minFilter = THREE.LinearFilter;
    texture.format = THREE.RGBFormat;

    texture.needsUpdate = true;
    
    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1);
    
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    
    renderer = new THREE.WebGLRenderer();
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(videoContainer.offsetWidth, videoContainer.offsetHeight);
    video360Container.appendChild(renderer.domElement);
    
    video360Container.addEventListener('mousedown', onPointerDown);
    video360Container.addEventListener('mousemove', onPointerMove);
    video360Container.addEventListener('mouseup', onPointerUp);
    video360Container.addEventListener('touchstart', onPointerDown);
    video360Container.addEventListener('touchmove', onPointerMove);
    video360Container.addEventListener('touchend', onPointerUp);
    video360Container.addEventListener('wheel', onDocumentMouseWheel);
    
    window.addEventListener('resize', onWindowResize);

    renderer.render(scene, camera);

    videoPlayer.style.display = 'none';
    
    isVideoMode360 = true;
    animate();
    
    debugLog('360 video player initialized');
}

function onWindowResize() {
    if (!isVideoMode360 || !video360Container) return;
    
    const videoContainer = videoPlayer.parentElement;
    camera.aspect = videoContainer.offsetWidth / videoContainer.offsetHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(videoContainer.offsetWidth, videoContainer.offsetHeight);
}

function onPointerDown(event) {
    if (!isVideoMode360) return;
    
    isUserInteracting = true;
    
    const clientX = event.clientX || event.touches[0].clientX;
    const clientY = event.clientY || event.touches[0].clientY;
    
    onPointerDownMouseX = clientX;
    onPointerDownMouseY = clientY;
    onPointerDownLon = lon;
    onPointerDownLat = lat;
    
    event.preventDefault();
}

function onPointerMove(event) {
    if (!isVideoMode360 || !isUserInteracting) return;
    
    const clientX = event.clientX || event.touches[0].clientX;
    const clientY = event.clientY || event.touches[0].clientY;
    
    lon = (onPointerDownMouseX - clientX) * 0.1 + onPointerDownLon;
    lat = (clientY - onPointerDownMouseY) * 0.1 + onPointerDownLat;
    
    event.preventDefault();
}

function onPointerUp() {
    if (!isVideoMode360) return;
    isUserInteracting = false;
}

function onDocumentMouseWheel(event) {
    if (!isVideoMode360) return;
    
    const fov = camera.fov + event.deltaY * 0.05;
    camera.fov = THREE.MathUtils.clamp(fov, 30, 90);
    camera.updateProjectionMatrix();
    
    event.preventDefault();
}

function animate() {
    if (!isVideoMode360) return;
    
    requestAnimationFrame(animate);
    update();
}

function update() {
    if (!isVideoMode360) return;
    
    lat = Math.max(-85, Math.min(85, lat));
    
    phi = THREE.MathUtils.degToRad(90 - lat);
    theta = THREE.MathUtils.degToRad(lon);
    
    camera.position.x = 0;
    camera.position.y = 0;
    camera.position.z = 0;
    
    const x = 500 * Math.sin(phi) * Math.cos(theta);
    const y = 500 * Math.cos(phi);
    const z = 500 * Math.sin(phi) * Math.sin(theta);
    
    camera.lookAt(x, y, z);
    renderer.render(scene, camera);
}

function updateToggleButtonIcon() {
    const toggleButton = document.getElementById('toggle-view-button');
    if (!toggleButton) return;
    
    const icon = toggleButton.querySelector('i');
    if (icon) {
        if (isVideoMode360) {
            icon.className = 'fas fa-square';
            toggleButton.querySelector('.tooltip').textContent = 'Switch to Normal View';
        } else {
            icon.className = 'fas fa-street-view';
            toggleButton.querySelector('.tooltip').textContent = 'Switch to 360° View';
        }
    }
}

function toggleVideoMode() {
    if (isVideoMode360) {
        if (video360Container) {
            video360Container.style.display = 'none';
        }
        videoPlayer.style.display = 'block';
        isVideoMode360 = false;
    } else {
        if (!video360Container) {
            init360VideoPlayer();
        } else {
            if (videoPlayer.readyState >= 2) {
                video360Container.style.display = 'block';
                videoPlayer.style.display = 'none';
                
                if (renderer && scene && camera) {
                    renderer.render(scene, camera);
                }
            } else {
                videoPlayer.addEventListener('loadeddata', function() {
                    video360Container.style.display = 'block';
                    videoPlayer.style.display = 'none';
                    
                    if (renderer && scene && camera) {
                        renderer.render(scene, camera);
                    }
                }, { once: true });
            }
        }
        isVideoMode360 = true;
        animate();
    }
    
    updateToggleButtonIcon();
    debugLog(`Video mode switched to ${isVideoMode360 ? '360' : 'normal'}`);
}

function onPointerUp() {
    if (!isVideoMode360) return;
    isUserInteracting = false;
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
    
    videoPlayer.addEventListener('play', function() {
        const playButton = document.querySelector('.play-pause-button i');
        if (playButton) {
            playButton.className = 'fas fa-pause';
        }
    });
    
    videoPlayer.addEventListener('pause', function() {
        const playButton = document.querySelector('.play-pause-button i');
        if (playButton) {
            playButton.className = 'fas fa-play';
        }
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
    
    const drawButton = createButton('draw-button', 'fa-pencil-alt', 'Draw');
    drawButton.id = 'rectangleButton';
    drawButton.addEventListener('click', function() {
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

    const clearButton = createButton('clear-button', 'fa-trash-alt', 'Clear Annotations');
    clearButton.addEventListener('click', function() {
        if (fabricCanvas) {
            fabricCanvas.clear();
            debugLog('All annotations cleared');
        }
    });

    const toggleViewButton = createButton('toggle-view-button', 'fa-square', 'Switch to Rectangular View');
    toggleViewButton.id = 'toggle-view-button';
    toggleViewButton.addEventListener('click', toggleVideoMode);
    
    
    buttonsContainer.appendChild(playButton);
    buttonsContainer.appendChild(toggleViewButton);
    buttonsContainer.appendChild(drawButton);
    buttonsContainer.appendChild(annotateButton);
    buttonsContainer.appendChild(downloadButton);
    buttonsContainer.appendChild(clearButton);
    
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

    setTimeout(() => {
        createDrawDropdown();
        createTextColorDropdown();
    }, 100);
    
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

function createDrawDropdown() {
    const drawButton = document.getElementById('rectangleButton');
    if (!drawButton) return;
    
    const dropdown = document.createElement('div');
    dropdown.className = 'draw-dropdown';
    dropdown.id = 'drawDropdown';
    dropdown.style.display = 'none';
    
    const options = [
        { name: 'Rectangle', value: 'rectangle', icon: 'fa-square' },
        { name: 'Ellipse', value: 'ellipse', icon: 'fa-circle' },
        { name: 'Polygon', value: 'polygon', icon: 'fa-draw-polygon' }
    ];
    
    options.forEach(option => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        
        const icon = document.createElement('i');
        icon.className = `fas ${option.icon}`;
        item.appendChild(icon);
        
        const text = document.createElement('span');
        text.textContent = option.name;
        item.appendChild(text);
        
        item.addEventListener('click', function() {
            currentAnnotationType = option.value;
            drawButton.querySelector('.tooltip').textContent = `Draw: ${option.name}`;
            dropdown.style.display = 'none';
            
            annotationMode = true;
            document.querySelector('.annotation-canvas-container').style.pointerEvents = 'auto';
            drawButton.classList.add('active');
            
            document.getElementById('textButton').classList.remove('active');
            
            debugLog(`Drawing mode activated and changed to: ${option.value}`);
        });
        
        dropdown.appendChild(item);
    });
    
    document.body.appendChild(dropdown);
    
    drawButton.addEventListener('mouseenter', function() {
        const buttonRect = drawButton.getBoundingClientRect();
        dropdown.style.display = 'block';
        dropdown.style.top = (buttonRect.top - dropdown.offsetHeight - 5) + 'px';
        dropdown.style.left = buttonRect.left + 'px';
    });
    
    dropdown.addEventListener('mouseleave', function() {
        dropdown.style.display = 'none';
    });
    
    return dropdown;
}

function createTextColorDropdown() {
    const textButton = document.getElementById('textButton');
    if (!textButton) return;
    
    const dropdown = document.createElement('div');
    dropdown.className = 'text-color-dropdown';
    dropdown.id = 'textColorDropdown';
    dropdown.style.display = 'none';
    
    const colors = [
        { name: 'Red', value: 'red' },
        { name: 'Black', value: 'black' },
        { name: 'White', value: 'white' }
    ];
    
    colors.forEach(color => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        
        const colorSwatch = document.createElement('div');
        colorSwatch.className = 'color-swatch';
        colorSwatch.style.backgroundColor = color.value;
        item.appendChild(colorSwatch);
        
        const text = document.createElement('span');
        text.textContent = color.name;
        item.appendChild(text);
        
        item.addEventListener('click', function() {
            window.currentTextColor = color.value;
            textButton.querySelector('.tooltip').textContent = `Text: ${color.name}`;
            dropdown.style.display = 'none';
            
            annotationMode = true;
            currentAnnotationType = 'text';
            document.querySelector('.annotation-canvas-container').style.pointerEvents = 'auto';
            textButton.classList.add('active');
            
            document.getElementById('rectangleButton').classList.remove('active');
            
            debugLog(`Text annotation mode activated with color: ${color.value}`);
        });
        
        dropdown.appendChild(item);
    });
    
    document.body.appendChild(dropdown);
    
    textButton.addEventListener('mouseenter', function() {
        const buttonRect = textButton.getBoundingClientRect();
        dropdown.style.display = 'block';
        dropdown.style.top = (buttonRect.top - dropdown.offsetHeight - 5) + 'px';
        dropdown.style.left = buttonRect.left + 'px';
    });
    
    dropdown.addEventListener('mouseleave', function() {
        dropdown.style.display = 'none';
    });
    
    window.currentTextColor = 'red';
    
    return dropdown;
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
        map.setCenter(firstCoordinates);
        map.setZoom(17);
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

    map.easeTo({
        center: position,
        duration: 300
    });
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


function setupFabricEvents() {
    if (!fabricCanvas) return;
    
    fabricCanvas.on('mouse:down', function(options) {
        if (!annotationMode) return;
        
        debugLog('Canvas mouse down', currentAnnotationType);
        const pointer = fabricCanvas.getPointer(options.e);
        startPoint = { x: pointer.x, y: pointer.y };
        isDrawing = true;
        
        if (currentAnnotationType === 'rectangle') {
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
        } else if (currentAnnotationType === 'ellipse') {
            currentShape = new fabric.Ellipse({
                left: startPoint.x,
                top: startPoint.y,
                rx: 0,
                ry: 0,
                fill: 'rgba(255, 0, 0, 0.2)',
                stroke: 'red',
                strokeWidth: 2
            });
            fabricCanvas.add(currentShape);
        } else if (currentAnnotationType === 'polygon') {
            if (!window.polygonPoints) {
                window.polygonPoints = [];
            }
            
            window.polygonPoints.push({
                x: pointer.x,
                y: pointer.y
            });
            
            if (window.polygonPoints.length === 1) {
                currentShape = new fabric.Polygon(window.polygonPoints, {
                    fill: 'rgba(255, 0, 0, 0.2)',
                    stroke: 'red',
                    strokeWidth: 2
                });
                fabricCanvas.add(currentShape);
            } else {
                currentShape.set({
                    points: window.polygonPoints
                });
                
                if (options.e.detail === 2) {
                    isDrawing = false;
                    window.polygonPoints = [];
                    currentShape = null;
                }
            }
            
            fabricCanvas.renderAll();
        }
    });
    
    fabricCanvas.on('mouse:move', function(options) {
        if (!annotationMode || !isDrawing || !startPoint) return;
        
        const pointer = fabricCanvas.getPointer(options.e);
        
        if (currentAnnotationType === 'rectangle' && currentShape) {
            currentShape.set({
                width: Math.abs(pointer.x - startPoint.x),
                height: Math.abs(pointer.y - startPoint.y),
                left: Math.min(startPoint.x, pointer.x),
                top: Math.min(startPoint.y, pointer.y)
            });
        } else if (currentAnnotationType === 'ellipse' && currentShape) {
            const rx = Math.abs(pointer.x - startPoint.x) / 2;
            const ry = Math.abs(pointer.y - startPoint.y) / 2;
            
            currentShape.set({
                rx: rx,
                ry: ry,
                left: Math.min(startPoint.x, pointer.x) + rx,
                top: Math.min(startPoint.y, pointer.y) + ry,
                originX: 'center',
                originY: 'center'
            });
        } else if (currentAnnotationType === 'polygon' && window.polygonPoints && window.polygonPoints.length > 0) {
            const tempPoints = [...window.polygonPoints];
            tempPoints.push({
                x: pointer.x,
                y: pointer.y
            });
            
            currentShape.set({
                points: tempPoints
            });
        }
        
        fabricCanvas.renderAll();
    });
    
    fabricCanvas.on('mouse:up', function(options) {
        if (!annotationMode) return;
        
        if (currentAnnotationType === 'text') {
            const pointer = fabricCanvas.getPointer(options.e);
            const textColor = window.currentTextColor || 'red';
            
            const textBox = new fabric.IText('Edit text', { 
                left: pointer.x,
                top: pointer.y,
                fontSize: 20,
                fill: textColor,
                hasControls: true,
                hasRotatingPoint: true,
                editable: true,
                cursorWidth: 1,
                cursorColor: 'black',
                borderColor: textColor,
                cornerColor: textColor,
                padding: 5
            });
            
            fabricCanvas.add(textBox);
            fabricCanvas.setActiveObject(textBox);
            
            textBox.enterEditing();
            textBox.selectAll();
        } else if (currentAnnotationType !== 'polygon') {
            isDrawing = false;
            currentShape = null;
        }
        
        fabricCanvas.renderAll();
    });
    
    document.addEventListener('keydown', function(e) {
        if (e.shiftKey && isDrawing && (currentAnnotationType === 'rectangle' || currentAnnotationType === 'ellipse') && currentShape) {
            const pointer = fabricCanvas.getPointer(fabricCanvas.upperCanvasEl);
            const width = Math.abs(pointer.x - startPoint.x);
            const height = width;
            
            if (currentAnnotationType === 'rectangle') {
                currentShape.set({
                    width: width,
                    height: height,
                    left: pointer.x > startPoint.x ? startPoint.x : startPoint.x - width,
                    top: pointer.y > startPoint.y ? startPoint.y : startPoint.y - height
                });
            } else if (currentAnnotationType === 'ellipse') {
                currentShape.set({
                    rx: width / 2,
                    ry: width / 2,
                    left: (Math.min(startPoint.x, pointer.x) + Math.max(startPoint.x, pointer.x)) / 2,
                    top: (Math.min(startPoint.y, pointer.y) + Math.max(startPoint.y, pointer.y)) / 2,
                    originX: 'center',
                    originY: 'center'
                });
            }
            
            fabricCanvas.renderAll();
        }
    });
    
    debugLog('Fabric canvas events set up with enhanced options');
}

window.addEventListener('resize', () => {
    if (fabricCanvas) {
        fabricCanvas.setWidth(window.innerWidth);
        fabricCanvas.setHeight(window.innerHeight);
        fabricCanvas.renderAll();
    }
});

function takeScreenshot() {
    debugLog('Taking screenshot in iframe-compatible mode...');
    
    // Create a single canvas for the composite image
    const screenshotCanvas = document.createElement('canvas');
    const context = screenshotCanvas.getContext('2d');
    
    // Set the canvas dimensions to match the video container's visible area
    let videoWidth, videoHeight, videoLeft, videoTop;
    
    if (isVideoMode360 && video360Container) {
        const video360Rect = video360Container.getBoundingClientRect();
        videoWidth = video360Rect.width;
        videoHeight = video360Rect.height;
        videoLeft = video360Rect.left;
        videoTop = video360Rect.top;
    } else if (videoPlayer) {
        const videoRect = videoPlayer.getBoundingClientRect();
        videoWidth = videoRect.width;
        videoHeight = videoRect.height;
        videoLeft = videoRect.left;
        videoTop = videoRect.top;
    } else {
        debugLog('No video element found for screenshot');
        return;
    }
    
    screenshotCanvas.width = videoWidth;
    screenshotCanvas.height = videoHeight;
    
    // For 360 mode, we need to capture the renderer output
    if (isVideoMode360 && renderer) {
        try {
            // Use toDataURL from the renderer instead of trying to draw it
            // This avoids cross-origin issues in iframes
            const rendererImage = new Image();
            rendererImage.onload = function() {
                context.drawImage(rendererImage, 0, 0, videoWidth, videoHeight);
                addAnnotationsAndFinalize();
            };
            
            // Force a render to ensure we get the latest frame
            renderer.render(scene, camera);
            
            // Get the data URL directly from the renderer's canvas
            rendererImage.src = renderer.domElement.toDataURL('image/png');
        } catch (e) {
            debugLog('Error capturing 360 video:', e);
            // Fall back to video capture if renderer capture fails
            captureVideoFrame();
        }
    } else {
        captureVideoFrame();
    }
    
    function captureVideoFrame() {
        try {
            // For regular video mode, draw the video frame directly
            if (videoPlayer && videoPlayer.videoWidth > 0) {
                context.drawImage(videoPlayer, 0, 0, videoWidth, videoHeight);
                addAnnotationsAndFinalize();
            } else {
                debugLog('Video element not ready for capture');
                // Try to add annotations anyway
                addAnnotationsAndFinalize();
            }
        } catch (e) {
            debugLog('Error capturing video frame:', e);
            // Still try to save the annotations at least
            addAnnotationsAndFinalize();
        }
    }
    
    function addAnnotationsAndFinalize() {
        // Add annotations from fabric canvas if available
        if (fabricCanvas) {
            try {
                // Create a temporary canvas with only the annotations
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = videoWidth;
                tempCanvas.height = videoHeight;
                
                // Clone the fabric canvas for screenshot purposes
                const tempFabricCanvas = new fabric.Canvas(tempCanvas);
                
                // Copy all objects from the main canvas
                fabricCanvas.getObjects().forEach(obj => {
                    const clone = fabric.util.object.clone(obj);
                    // Adjust position if needed based on video container position
                    tempFabricCanvas.add(clone);
                });
                
                tempFabricCanvas.renderAll();
                
                // Draw the annotations over the video frame
                context.drawImage(tempCanvas, 0, 0);
                
                // Clean up temporary canvas
                tempFabricCanvas.dispose();
            } catch (e) {
                debugLog('Error adding annotations to screenshot:', e);
            }
        }
        
        // Generate and download the image
        try {
            const dataUrl = screenshotCanvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `${baseFileName || 'gpx-video'}-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.png`;
            link.href = dataUrl;
            link.click();
            
            debugLog('Screenshot downloaded in iframe mode');
        } catch (e) {
            debugLog('Error saving screenshot:', e);
            alert('Could not save screenshot. This may be due to iframe security restrictions.');
        }
    }
}

document.getElementById('expand-map').addEventListener('mouseenter', function() {
    const mapContainer = document.getElementById('map');
    mapContainer.classList.add('expanded');
    map.resize();
    this.style.display = 'none';
    mapExpandMode = true;

    mapContainer.addEventListener('transitionend', function handleTransition(e) {
        if (e.propertyName === 'width' || e.propertyName === 'height') {
            map.resize();
            mapContainer.removeEventListener('transitionend', handleTransition);
            debugLog('Map expanded transition complete');
        }
    });
});

document.getElementById('map').addEventListener('mouseleave', function() {
    if (mapExpandMode) {
        const mapContainer = document.getElementById('map');
        mapContainer.classList.remove('expanded');
        map.resize();
        mapExpandMode = false;
        document.getElementById('expand-map').style.display = 'block';
        mapContainer.addEventListener('transitionend', function handleTransition(e) {
            if (e.propertyName === 'width' || e.propertyName === 'height') {
                map.resize();
                mapContainer.removeEventListener('transitionend', handleTransition);
                debugLog('Map expanded transition complete');
            }
        });
    } 
});


function initializeMap() {
    if (map) {
        map.resize();
        return;
    }

    setTimeout(() => {
        mapboxgl.accessToken = 'pk.eyJ1IjoiaWZvcm1haGVyIiwiYSI6ImNsaHBjcnAwNDF0OGkzbnBzZmUxM2Q2bXgifQ.fIyIgSwq1WWVk9CKlXRXiQ';
        map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/satellite-streets-v11',
            center: [-98.5795, 39.8283],
            zoom: 2,
            preserveDrawingBuffer: true
        });
        
        map.on('load', () => {
            debugLog('Map loaded');
            
            map.resize();
            
            const canvasContainer = document.createElement('div');
            canvasContainer.className = 'annotation-canvas-container';
            
            const canvas = document.createElement('canvas');
            canvas.id = 'annotation-canvas';
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight - 160;
            canvasContainer.appendChild(canvas);
            
            document.getElementById('gpx-video-app-wrap').appendChild(canvasContainer);
            
            fabricCanvas = new fabric.Canvas('annotation-canvas');
            fabricCanvas.selection = false;
            
            const loadControls = document.createElement('div');
            loadControls.id = 'load-controls';
            
            const loadButton = document.createElement('button');
            loadButton.className = 'load-video-button';
            loadButton.innerHTML = 'Load Video';
            
            loadControls.appendChild(loadButton);
            document.getElementById('gpx-video-app-wrap').appendChild(loadControls);
            
            setupFabricEvents();
            fetchGPXData();
        });
    }, 300); 
}

function debugLog(...args) {
    if (debugMode) {
        console.log('[GpxVideo]', ...args);
    }
}

function setupIframeHandling() {
    const isInIframe = window !== window.parent;
    debugLog('Running in iframe:', isInIframe);
    
    if (isInIframe) {
        const resizeHandler = () => {
            if (map) {
                map.resize();
                debugLog('Map resized due to iframe event');
            }
            
            if (fabricCanvas) {
                fabricCanvas.setWidth(window.innerWidth);
                fabricCanvas.setHeight(window.innerHeight - 160);
                fabricCanvas.renderAll();
                debugLog('Fabric canvas resized');
            }
            
            if (renderer) {
                renderer.setSize(
                    videoPlayer.parentElement.offsetWidth,
                    videoPlayer.parentElement.offsetHeight
                );
                camera.aspect = videoPlayer.parentElement.offsetWidth / videoPlayer.parentElement.offsetHeight;
                camera.updateProjectionMatrix();
                debugLog('Renderer resized');
            }
        };
        
        window.addEventListener('resize', resizeHandler);
        
        window.addEventListener('message', (event) => {
            if (event.data === 'resize' || event.data.type === 'resize') {
                resizeHandler();
            }
        });
        
        setInterval(resizeHandler, 2000);
    }
}

function initializeApplication() {
    initializeMap();
    setupIframeHandling();
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(initializeApplication, 100);
} else {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(initializeApplication, 100);
    });
}