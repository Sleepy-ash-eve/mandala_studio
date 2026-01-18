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
        centerY: 0
    };

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
        // Tolerance
        return Math.abs(a[0] - b.r) < 5 && Math.abs(a[1] - b.g) < 5 && Math.abs(a[2] - b.b) < 5 && Math.abs(a[3] - b.a) < 5;
    }

    function bucketFill(startX, startY) {
        const dpr = window.devicePixelRatio || 1;
        // Bucket fill needs to work on raw canvas pixels, so logic coords -> pixel coords
        // Actually, our coords are CSS pixels, canvas is scaled. 
        // We should scale inputs.
        const px = Math.floor(startX * dpr);
        const py = Math.floor(startY * dpr);

        const width = canvas.width;
        const height = canvas.height;

        const imgData = ctx.getImageData(0, 0, width, height);
        const pixelData = imgData.data;
        const fillColor = hexToRgba(state.color);

        // Initial color
        const startColorArray = getPixel(imgData, px, py);
        const startColor = { r: startColorArray[0], g: startColorArray[1], b: startColorArray[2], a: startColorArray[3] };

        if (colorsMatch([fillColor.r, fillColor.g, fillColor.b, fillColor.a], startColor)) return; // Same color

        const stack = [[px, py]];

        while (stack.length > 0) {
            const [cx, cy] = stack.pop();
            const currentPixel = getPixel(imgData, cx, cy);

            if (colorsMatch(currentPixel, startColor)) {
                const offset = (cy * width + cx) * 4;
                pixelData[offset] = fillColor.r;
                pixelData[offset + 1] = fillColor.g;
                pixelData[offset + 2] = fillColor.b;
                pixelData[offset + 3] = fillColor.a;

                stack.push([cx + 1, cy]);
                stack.push([cx - 1, cy]);
                stack.push([cx, cy + 1]);
                stack.push([cx, cy - 1]);
            }
        }

        ctx.putImageData(imgData, 0, 0);
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
        state.isDrawing = true;
        const coords = getCoordinates(e);
        state.lastX = coords.x;
        state.lastY = coords.y;

        if (state.currentTool === tools.BUCKET) {
            symmetricBucketFill(state.lastX, state.lastY);
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
        state.isDrawing = false;
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
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Correctly clear scaled canvas
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

    // Handle Window Resize
    window.addEventListener('resize', resizeCanvas);

    // Initial setup
    resizeCanvas();
});
