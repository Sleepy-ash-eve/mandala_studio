document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const canvas = document.getElementById('mandala-canvas');
    const guideCanvas = document.getElementById('guide-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const guideCtx = guideCanvas.getContext('2d');

    // Tools
    const tools = {
        PENCIL: 'pencil',
        BUCKET: 'bucket',
        ERASER: 'eraser'
    };

    // State
    const state = {
        currentTool: tools.PENCIL,
        isDrawing: false,
        color: '#00d2ff',
        brushSize: 5,
        segments: 12,
        isMirror: true,
        showGuides: true,
        lastX: 0,
        lastY: 0,
        centerX: 0,
        centerY: 0,
        undoStack: [],
        redoStack: [],
        gallery: [],
        currentArtworkId: null // Timestamp ID
    };

    // Gallery Functions
    function initGallery() {
        const storedGallery = localStorage.getItem('mandala_gallery');
        if (storedGallery) {
            state.gallery = JSON.parse(storedGallery);
        }

        // If we have a 'current' ID saved, try to use it, otherwise create new
        const lastId = localStorage.getItem('mandala_current_id');
        if (lastId && state.gallery.find(item => item.id == lastId)) {
            state.currentArtworkId = parseInt(lastId);
            // The canvas content is loaded via 'loadHistory' which checks 'mandala_current'
            // We assume 'mandala_current' matches the visual state of 'currentArtworkId' roughly
        } else {
            // No current artwork? Create one.
            createNewArtwork();
        }
    }

    function createNewArtwork() {
        state.currentArtworkId = Date.now();
        state.undoStack = [];
        state.redoStack = [];

        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear visual

        const newArt = {
            id: state.currentArtworkId,
            name: "Untitled Artwork",
            date: new Date().toLocaleDateString(),
            data: canvas.toDataURL()
        };

        state.gallery.unshift(newArt);
        saveGalleryToStorage();
        updateLocalStorage(); // Wipe history stacks

        // Ensure we switch off any active tools or resetting? No, keep tool
    }

    function saveToGallery() {
        if (!state.currentArtworkId) return;

        const idx = state.gallery.findIndex(item => item.id === state.currentArtworkId);
        if (idx !== -1) {
            state.gallery[idx].data = canvas.toDataURL();
            // Move to top? maybe not, just update data
            saveGalleryToStorage();
        }
    }

    // Debounce saveToGallery to avoid lag
    let saveTimeout;
    function autoSave() {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveToGallery, 1000); // Save 1s after last change
    }

    function saveGalleryToStorage() {
        try {
            localStorage.setItem('mandala_gallery', JSON.stringify(state.gallery));
            localStorage.setItem('mandala_current_id', state.currentArtworkId);
        } catch (e) {
            console.error("Gallery storage full", e);
            alert("Storage full! Please delete some artworks.");
        }
    }

    function loadArtwork(id) {
        const art = state.gallery.find(item => item.id === id);
        if (!art) return;

        state.currentArtworkId = id;
        state.undoStack = []; // Reset history for new session on this artwork (simple approach)
        state.redoStack = [];

        restoreCanvas(art.data);

        // Update current state for refresh persistence
        localStorage.setItem('mandala_current', art.data);
        localStorage.setItem('mandala_current_id', id);
        localStorage.setItem('mandala_undo', "[]");
        localStorage.setItem('mandala_redo', "[]");

        toggleGallery(false);
    }

    // UI Rendering
    function renderGallery() {
        const grid = document.getElementById('gallery-grid');
        grid.innerHTML = '';

        state.gallery.forEach(art => {
            const el = document.createElement('div');
            el.className = 'gallery-item';
            el.innerHTML = `
                <img src="${art.data}">
                <div class="gallery-info">
                    <div class="gallery-title">${art.name}</div>
                    <div class="gallery-date">${art.date}</div>
                </div>
            `;
            el.addEventListener('click', () => loadArtwork(art.id));
            grid.appendChild(el);
        });
    }

    function toggleGallery(show) {
        const overlay = document.getElementById('gallery-overlay');
        if (show) {
            renderGallery();
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }

    // History & Persistence
    function saveState() {
        // Save current canvas to undo stack
        state.undoStack.push(canvas.toDataURL());

        // Limit to 5 states
        if (state.undoStack.length > 5) {
            state.undoStack.shift();
        }

        // Clear redo stack on new action
        state.redoStack = [];

        // Persist
        updateLocalStorage();
        autoSave(); // Update gallery thumbnail
    }

    function updateLocalStorage() {
        try {
            localStorage.setItem('mandala_undo', JSON.stringify(state.undoStack));
            localStorage.setItem('mandala_redo', JSON.stringify(state.redoStack));
            // Also save current state so refresh doesn't wipe (this acts as the 'working copy')
            localStorage.setItem('mandala_current', canvas.toDataURL());
        } catch (e) {
            console.error('LocalStorage quota exceeded probably', e);
        }
    }

    function loadHistory() {
        const u = localStorage.getItem('mandala_undo');
        const r = localStorage.getItem('mandala_redo');
        const c = localStorage.getItem('mandala_current');


        if (u) state.undoStack = JSON.parse(u);
        if (r) state.redoStack = JSON.parse(r);

        // We do NOT restore the current canvas automatically on reload anymore
        // as per user feedback that they want a clean slate.
        // The history is preserved in undoStack though.
    }

    function undo() {
        if (state.undoStack.length === 0) return;

        // Current state goes to redo
        state.redoStack.push(canvas.toDataURL());

        const prevData = state.undoStack.pop();
        restoreCanvas(prevData);
        updateLocalStorage();
    }

    function redo() {
        if (state.redoStack.length === 0) return;

        // Current state goes to undo
        state.undoStack.push(canvas.toDataURL());

        const nextData = state.redoStack.pop();
        restoreCanvas(nextData);
        updateLocalStorage();
    }

    function restoreCanvas(dataUrl) {
        const img = new Image();
        img.onload = () => {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform to draw 1:1
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            ctx.restore();
        };
        img.src = dataUrl;
    }

    // Initialization
    function resizeCanvas() {
        // Make standard size 800x800 or fit screen
        const size = Math.min(window.innerWidth - 350, window.innerHeight - 50); // 350 for sidebar

        // precise pixels
        const dpr = window.devicePixelRatio || 1;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        guideCanvas.width = size * dpr;
        guideCanvas.height = size * dpr;

        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;
        guideCanvas.style.width = `${size}px`;
        guideCanvas.style.height = `${size}px`;

        // Fix: Wrapper collapses because children are absolute. Set wrapper size explicitly.
        const wrapper = document.querySelector('.canvas-wrapper');
        wrapper.style.width = `${size}px`;
        wrapper.style.height = `${size}px`;

        ctx.scale(dpr, dpr);
        guideCtx.scale(dpr, dpr);

        state.centerX = size / 2;
        state.centerY = size / 2;

        // Reset context props after resize
        updateContext();
        drawGuides();
    }

    function updateContext() {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }

    // Drawing Logic
    function getCoordinates(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    function drawStroke(startX, startY, endX, endY) {
        ctx.lineWidth = state.brushSize;
        ctx.strokeStyle = state.currentTool === tools.ERASER ? '#ffffff' : state.color;
        // If eraser and transparent background wanted, we'd use globalCompositeOperation.
        // For simpler interaction on white canvas:
        if (state.currentTool === tools.ERASER) {
            ctx.globalCompositeOperation = 'destination-out'; // True erasure
        } else {
            ctx.globalCompositeOperation = 'source-over';
        }

        const cx = state.centerX;
        const cy = state.centerY;
        const angleStep = (2 * Math.PI) / state.segments;

        // Calculate relative logic
        const startRelX = startX - cx;
        const startRelY = startY - cy;
        const endRelX = endX - cx;
        const endRelY = endY - cy;

        for (let i = 0; i < state.segments; i++) {
            const theta = i * angleStep;

            // Rotate
            const rStart = rotate(startRelX, startRelY, theta);
            const rEnd = rotate(endRelX, endRelY, theta);

            drawLine(cx + rStart.x, cy + rStart.y, cx + rEnd.x, cy + rEnd.y);

            if (state.isMirror) {
                // Mirror logic: reflect across X axis then rotate
                // Reflect
                const mStartRelX = startRelX;
                const mStartRelY = -startRelY;
                const mEndRelX = endRelX;
                const mEndRelY = -endRelY;

                // Rotate reflected
                const mrStart = rotate(mStartRelX, mStartRelY, theta);
                const mrEnd = rotate(mEndRelX, mEndRelY, theta);

                drawLine(cx + mrStart.x, cy + mrStart.y, cx + mrEnd.x, cy + mrEnd.y);
            }
        }
    }

    function rotate(x, y, angle) {
        return {
            x: x * Math.cos(angle) - y * Math.sin(angle),
            y: x * Math.sin(angle) + y * Math.cos(angle)
        };
    }

    function drawLine(x1, y1, x2, y2) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    // Guides
    function drawGuides() {
        guideCtx.clearRect(0, 0, guideCanvas.width, guideCanvas.height);
        if (!state.showGuides) return;

        guideCtx.strokeStyle = 'rgba(0, 210, 255, 0.2)';
        guideCtx.lineWidth = 1;

        const cx = state.centerX;
        const cy = state.centerY;
        const radius = Math.sqrt(cx * cx + cy * cy);
        const angleStep = (2 * Math.PI) / state.segments;

        for (let i = 0; i < state.segments; i++) {
            const theta = i * angleStep;
            guideCtx.beginPath();
            guideCtx.moveTo(cx, cy);
            guideCtx.lineTo(cx + Math.cos(theta) * radius, cy + Math.sin(theta) * radius);
            guideCtx.stroke();
        }
    }

    // Flood Fill
    function hexToRgba(hex) {
        let c;
        if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
            c = hex.substring(1).split('');
            if (c.length == 3) {
                c = [c[0], c[0], c[1], c[1], c[2], c[2]];
            }
            c = '0x' + c.join('');
            return {
                r: (c >> 16) & 255,
                g: (c >> 8) & 255,
                b: c & 255,
                a: 255
            };
        }
        return { r: 0, g: 0, b: 0, a: 255 };
    }

    function getPixel(imgData, x, y) {
        if (x < 0 || y < 0 || x >= imgData.width || y >= imgData.height) return [-1, -1, -1, -1];
        const offset = (y * imgData.width + x) * 4;
        return [
            imgData.data[offset],
            imgData.data[offset + 1],
            imgData.data[offset + 2],
            imgData.data[offset + 3]
        ];
    }

    function colorsMatch(a, b) {
        // Tolerance - strict 10, relying on dilation for edges
        return Math.abs(a[0] - b.r) < 10 && Math.abs(a[1] - b.g) < 10 && Math.abs(a[2] - b.b) < 10 && Math.abs(a[3] - b.a) < 10;
    }

    function bucketFill(startX, startY) {
        const dpr = window.devicePixelRatio || 1;

        const px = Math.floor(startX * dpr);
        const py = Math.floor(startY * dpr);

        const width = canvas.width;
        const height = canvas.height;

        const imgData = ctx.getImageData(0, 0, width, height);
        // We do NOT write to imgData (main canvas) directly anymore.
        // We read from it for collision, but write to a separate mask.

        const fillColor = hexToRgba(state.color);

        // Initial color
        const startColorArray = getPixel(imgData, px, py);
        const startColor = { r: startColorArray[0], g: startColorArray[1], b: startColorArray[2], a: startColorArray[3] };

        // Prevent filling if same color
        if (colorsMatch([fillColor.r, fillColor.g, fillColor.b, fillColor.a], startColor)) return;

        // Semantic check: if we are clicking on a line (not background), maybe we shouldn't fill?
        // But let's assume user clicks on empty space.

        // Create a temp canvas for the fill mask
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        const fillImgData = tempCtx.createImageData(width, height);
        const fillData = fillImgData.data;

        // Helper to set pixel in fillData
        // We set it to the fill color immediately
        // Optimization: We could just set Alpha=255 and use fillRect later, but setting color is easy.
        function setFillPixel(x, y) {
            const offset = (y * width + x) * 4;
            fillData[offset] = fillColor.r;
            fillData[offset + 1] = fillColor.g;
            fillData[offset + 2] = fillColor.b;
            fillData[offset + 3] = fillColor.a;
        }

        const stack = [[px, py]];
        // Track visited pixels to allow filling same-color areas without infinite loops
        // Since we are not modifying imgData, we need a separate visited array.
        // Uint8Array is fast. 0=unvisited, 1=visited.
        const visited = new Uint8Array(width * height);

        function markVisited(x, y) {
            visited[y * width + x] = 1;
        }
        function isVisited(x, y) {
            return visited[y * width + x] === 1;
        }

        markVisited(px, py);

        while (stack.length > 0) {
            const [cx, cy] = stack.pop();
            const currentPixel = getPixel(imgData, cx, cy);

            if (colorsMatch(currentPixel, startColor)) {
                setFillPixel(cx, cy);

                const neighbors = [
                    [cx + 1, cy],
                    [cx - 1, cy],
                    [cx, cy + 1],
                    [cx, cy - 1]
                ];

                for (const [nx, ny] of neighbors) {
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        if (!isVisited(nx, ny)) {
                            markVisited(nx, ny);
                            stack.push([nx, ny]);
                        }
                    }
                }
            }
        }

        tempCtx.putImageData(fillImgData, 0, 0);

        // Now composite the fill "Behind" the existing lines
        // Dilation: Draw multiple times to cover edges
        ctx.save();

        // Reset transform to identity so we draw 1:1 with device pixels
        // This prevents double-scaling since tempCanvas is already full device resolution
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        ctx.globalCompositeOperation = 'destination-over';

        // Center
        ctx.drawImage(tempCanvas, 0, 0);

        // Dilate by 1 pixel in 4 directions to fill the anti-aliasing gap
        ctx.drawImage(tempCanvas, 1, 0);
        ctx.drawImage(tempCanvas, -1, 0);
        ctx.drawImage(tempCanvas, 0, 1);
        ctx.drawImage(tempCanvas, 0, -1);

        // Optional: Dilate by 2 pixels for thicker lines or smoother transitions
        // ctx.drawImage(tempCanvas, 1, 1);
        // ctx.drawImage(tempCanvas, -1, -1);

        ctx.restore();
    }

    // Symmetric Bucket Fill Wrapper
    function symmetricBucketFill(x, y) {
        // Simply fill at x,y
        bucketFill(x, y);

        // If we want FULL symmetry fill, we repeat for all segments
        // Note: This is expensive computationally. 
        // Optimization: For now, sticking to single fill to avoid freezing browser. 
        // Or we can calculate the rotated START points and fill them.

        const cx = state.centerX;
        const cy = state.centerY;
        const angleStep = (2 * Math.PI) / state.segments;

        const relX = x - cx;
        const relY = y - cy;

        // Since flood fill is expensive, maybe we limit this or warn?
        // Let's try doing it 12 times. 800x800 is 640k pixels. Iterating 12 times might be slow (~1s delay).
        // Let's do it. It's premium.

        for (let i = 1; i < state.segments; i++) {
            const theta = i * angleStep;
            const rPoint = rotate(relX, relY, theta);
            bucketFill(cx + rPoint.x, cy + rPoint.y);

            if (state.isMirror) {
                const mRelX = relX;
                const mRelY = -relY;
                const mrPoint = rotate(mRelX, mRelY, theta);
                bucketFill(cx + mrPoint.x, cy + mrPoint.y);
            }
        }

        if (state.isMirror) {
            const mRelX = relX;
            const mRelY = -relY;
            // Non-rotated mirror
            const mrPoint = rotate(mRelX, mRelY, 0);
            bucketFill(cx + mrPoint.x, cy + mrPoint.y);
        }
    }


    // Event Listeners
    canvas.addEventListener('mousedown', (e) => {
        saveState(); // Save before drawing
        state.isDrawing = true;
        const coords = getCoordinates(e);
        state.lastX = coords.x;
        state.lastY = coords.y;

        if (state.currentTool === tools.BUCKET) {
            // Undo save already called in mousedown
            symmetricBucketFill(state.lastX, state.lastY);
            updateLocalStorage(); // Save the result of the bucket fill as 'current'
            state.isDrawing = false; // Bucket is one-click
        } else {
            // Draw a dot
            drawStroke(state.lastX, state.lastY, state.lastX, state.lastY);
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!state.isDrawing || state.currentTool === tools.BUCKET) return;
        const coords = getCoordinates(e);
        drawStroke(state.lastX, state.lastY, coords.x, coords.y);
        state.lastX = coords.x;
        state.lastY = coords.y;
    });

    window.addEventListener('mouseup', () => {
        if (state.isDrawing) {
            state.isDrawing = false;
            updateLocalStorage(); // Save state after stroke completion
        }
        ctx.beginPath(); // Reset path
    });

    // Sidebar UI Listeners
    document.getElementById('pencil-tool').addEventListener('click', (e) => setTool(tools.PENCIL, e.currentTarget));
    document.getElementById('bucket-tool').addEventListener('click', (e) => setTool(tools.BUCKET, e.currentTarget));
    document.getElementById('eraser-tool').addEventListener('click', (e) => setTool(tools.ERASER, e.currentTarget));

    function setTool(toolName, btnElement) {
        state.currentTool = toolName;
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');
    }

    document.getElementById('color-picker').addEventListener('input', (e) => {
        state.color = e.target.value;
    });

    document.getElementById('brush-size').addEventListener('input', (e) => {
        state.brushSize = e.target.value;
    });

    document.getElementById('segment-count').addEventListener('input', (e) => {
        state.segments = parseInt(e.target.value);
        document.getElementById('segment-value').innerText = state.segments;
        drawGuides();
    });

    document.getElementById('mirror-mode').addEventListener('change', (e) => {
        state.isMirror = e.target.checked;
    });

    document.getElementById('show-guides').addEventListener('change', (e) => {
        state.showGuides = e.target.checked;
        drawGuides();
    });

    document.getElementById('clear-canvas').addEventListener('click', () => {
        saveState();
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Correctly clear scaled canvas
        updateLocalStorage();
    });

    document.getElementById('export-btn').addEventListener('click', () => {
        // Create a temporary link
        const link = document.createElement('a');
        link.download = 'mandala-art.jpg';

        // To export as JPG with white background (since transparency becomes black in JPG)
        // We create a temp canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tCtx = tempCanvas.getContext('2d');

        // Fill white
        tCtx.fillStyle = '#ffffff';
        tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        // Draw image
        tCtx.drawImage(canvas, 0, 0);

        link.href = tempCanvas.toDataURL('image/jpeg', 0.9);
        link.click();
    });



    // History Buttons
    document.getElementById('undo-btn').addEventListener('click', undo);
    document.getElementById('redo-btn').addEventListener('click', redo);

    // Handle Window Resize
    window.addEventListener('resize', resizeCanvas);

    // Initial setup
    resizeCanvas();
    initGallery();
    loadHistory(); // Load the 'working copy' which might be more recent than the gallery thumb

    // Gallery Events
    document.getElementById('gallery-btn').addEventListener('click', () => toggleGallery(true));
    document.getElementById('close-gallery-btn').addEventListener('click', () => toggleGallery(false));
    document.getElementById('new-artwork-btn').addEventListener('click', () => {
        createNewArtwork();
        toggleGallery(false);
    });

    // Rename Shortcut
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            if (!state.currentArtworkId) return;

            const art = state.gallery.find(item => item.id === state.currentArtworkId);
            if (art) {
                const newName = prompt("Rename Artwork:", art.name);
                if (newName) {
                    art.name = newName;
                    saveGalleryToStorage();
                    // Optional: Toast message
                }
            }
        }
    });

});
