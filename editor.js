let selectedNode = null;
let imageTransformer = null;
let floatingControls = document.getElementById('floating-media-controls');

document.addEventListener("keydown", function(e) {
    if ((e.key === "Delete" || e.key === "Backspace") && selectedNode) {
        // Stop & clear HTML element (if any)
        if (selectedNode) {
            const mediaType = selectedNode.getAttr && selectedNode.getAttr('mediaType');
            const mediaEl = mediaType === 'video' ? selectedNode.videoElement : selectedNode.audioElement;
            if (mediaEl) {
                try {
                    mediaEl.pause();
                    mediaEl.removeAttribute('src');
                    mediaEl.load();
                } catch (e) { /* silent fail for cleanup */ }
            }
        }

        // Clear both transformers (Konva.Transformer instances)
        // Assuming you have a 'transformer' variable for general use and 'imageTransformer' for media.
        if (typeof transformer !== 'undefined' && transformer) {
            try { transformer.nodes([]); } catch (e) {}
        }
        if (typeof imageTransformer !== 'undefined' && imageTransformer) {
            try { imageTransformer.nodes([]); } catch (e) {}
        }

        // Destroy the Konva node
        if (selectedNode && selectedNode.destroy) {
            selectedNode.destroy();
        }
        selectedNode = null;

        // Hide floating HTML controls (CRITICAL FIX FOR LEFTOVER UI)
        if (floatingControls) {
            floatingControls.style.display = 'none';
        }

        // Redraw layer and save
        if (typeof layer !== 'undefined' && layer) layer.draw();
        saveState && typeof saveState === 'function' && saveState();
    }
});

// --- Jules injected template loader ------------------------------------------------
function loadTemplateFromURL(url) {
    console.log(`Loading template from: ${url}`);
    Konva.Image.fromURL(url, (image) => {
        console.log('Konva.Image.fromURL callback executed.');
        const stage = getStage();
        if (!stage) {
            console.error('Stage is not available.');
            return;
        }
        console.log('Stage found.');

        const container = stage.container();
        const aspectRatio = image.width() / image.height();
        const maxWidth = container.clientWidth;
        const maxHeight = container.clientHeight;

        let newWidth = maxWidth;
        let newHeight = newWidth / aspectRatio;

        if (newHeight > maxHeight) {
            newHeight = maxHeight;
            newWidth = newHeight * aspectRatio;
        }

        image.setAttrs({
            width: newWidth,
            height: newHeight,
            x: (maxWidth - newWidth) / 2,
            y: (maxHeight - newHeight) / 2,
        });

        const layer = getActiveLayer();
        if (!layer) {
            console.error('Active layer is not available.');
            return;
        }
        console.log('Active layer found.');

        layer.add(image);
        image.draggable(true);

        if (imageTransformer) {
            imageTransformer.nodes([image]);
        } else {
            imageTransformer = new Konva.Transformer({
                nodes: [image],
                rotateEnabled: true,
                enabledAnchors: [
                    "top-left", "top-right",
                    "bottom-left", "bottom-right"
                ]
            });
            layer.add(imageTransformer);
        }

        image.on("click", () => {
            selectShape(image);
        });

        layer.batchDraw(); // Explicitly redraw the layer
        console.log('Image added to layer and layer redrawn.');
        hideWelcomeMessage();
        recordState();
        console.log('Template loaded and state recorded.');
    }, (err) => {
        console.error('Failed to load image from URL:', url, err);
        alert(`Failed to load template image: ${url}. Please check the console for more details.`);
    });
}

function getStage() {
    return stage;
}

function getActiveLayer() {
    return layer;
}

function hideWelcomeMessage() {
    // Find and remove the welcome message text node
    const textNode = layer.findOne('Text');
    if (textNode && textNode.text().includes('Welcome')) {
        textNode.destroy();
    }
}

function recordState() {
    saveState();
}
// -----------------------------------------------------------------------------------

// =========================================================
// ⚡️ GLOBAL KONVA VARIABLE DECLARATIONS
// =========================================================
let selectedShape = null;
let stage;
let layer;
let transformer;
let container;
let mockup;
const DEFAULT_WIDTH = 300;
const DEFAULT_HEIGHT = 550;

// --- History/State Management ---
let history = [];
let historyPointer = -1;
const HISTORY_LIMIT = 50;

// =========================================================
// ⚡️ GLOBAL HELPER FUNCTIONS (FIXED SCOPE ERROR)
// =========================================================

/**
 * Saves the current state of the Konva layer to the history stack.
 */
function saveState() {
    if (historyPointer < history.length - 1) {
        history = history.slice(0, historyPointer + 1);
    }
    const state = layer.toJSON();
    history.push(state);

    if (history.length > HISTORY_LIMIT) {
        history.shift();
    }
    historyPointer = history.length - 1;
}

/**
 * Loads a previous or next state from history (Undo/Redo).
 */
function loadState(isUndo) {
    let newPointer = historyPointer;
    if (isUndo) {
        newPointer--;
    } else {
        newPointer++;
    }

    if (newPointer >= 0 && newPointer < history.length) {
        historyPointer = newPointer;
        const state = history[historyPointer];

        // Use Konva.Node.create to reliably parse the JSON state
        const tempLayer = Konva.Node.create(state, 'editor-canvas-container');

        // Destroy all current layer children
        layer.destroyChildren();

        // Re-add the transformer
        transformer = new Konva.Transformer();
        layer.add(transformer);

        // Move children from temp layer to real layer, and re-setup listeners
        tempLayer.children.forEach(node => {
            if (node.hasName('editable-shape')) {
                layer.add(node);

                if (node.getClassName() === 'Text') {
                    setupTextListeners(node);
                } else if (node.getClassName() === 'Image') {
                    setupImageListeners(node);
                }
            }
        });

        tempLayer.destroy();
        deselectShape();
        layer.batchDraw();
    }
}


/**
 * Attaches Konva event listeners specific to Text nodes.
 */
function setupTextListeners(textNode) {
    const floatingToolbar = document.getElementById('floating-toolbar');

    textNode.on('click tap', function () {
        selectShape(textNode);
    });
    textNode.on('dblclick dbltap', () => startTextEdit(textNode));
    textNode.on('dragend', saveState);
    textNode.on('transformend', saveState);
}

/**
 * Attaches Konva event listeners specific to Image nodes.
 */
function setupImageListeners(image) {
    image.on('click tap', function () {
        selectShape(image);
    });
    image.on('dragend', saveState);
    image.on('transformend', function () {
        saveState();
        updateFloatingControls(image); // Ensure position update after scaling/rotating
    });

    image.on('dragmove', function() {
        updateFloatingControls(image); // Ensure position update while dragging
    });
}


/**
 * Selects a shape on the canvas, showing the transformer and sidebar.
 * @param {Konva.Shape} shape The shape to select.
 */
function selectShape(shape) {
    const floatingToolbar = document.getElementById('floating-toolbar');

    selectedNode = shape;
    transformer.nodes([selectedNode]);
    setupSidebar(selectedNode);
    if (floatingToolbar) floatingToolbar.classList.add('active');
    if (shape) {
        // ...
        updateFloatingControls(shape);
    } else {
        // ...
        updateFloatingControls(null);
    }
    layer.batchDraw();
}

function updateFloatingControls(node) {
    if (!floatingControls) return;
    const stage = getStage(); // Assuming getStage() returns the Konva.Stage instance

    // Add this early check:
    if (!stage || !node) {
        floatingControls.style.display = 'none';
        return;
    }

    if (node && node.getAttr('isMedia')) {
        const mediaType = node.getAttr('mediaType');
        const mediaElement = mediaType === 'video' ? node.videoElement : node.audioElement;
        const playPauseBtn = document.getElementById('canvas-play-pause-btn');

        // SAFER POSITIONING: compute node center in stage coordinates and map to screen coords

        // Node client rect returns coordinates relative to stage (in many Konva setups).
        const nodeRect = node.getClientRect();
        const stagePos = stage.container().getBoundingClientRect();

        // Fallback: if nodeRect values are not numbers, hide and return
        if (!nodeRect || isNaN(nodeRect.x) || isNaN(nodeRect.y)) {
            floatingControls.style.display = 'none';
            return;
        }

        // Center of node in stage coordinates
        const center = {
            x: nodeRect.x + nodeRect.width / 2,
            y: nodeRect.y + nodeRect.height / 2
        };

        // Map to screen coordinates (stagePos.left/top are screen offsets)
        const screenX = stagePos.left + center.x;
        const screenY = stagePos.top + center.y;

        // 2. Position the floating container (ensure these match your CSS size)
        const toolbarWidth = 110; // Adjust this if your controls bar width is different
        const toolbarHeight = 50;  // Adjust this if your controls bar height is different

        floatingControls.style.left = (screenX - toolbarWidth / 2) + 'px';
        floatingControls.style.top = (screenY - toolbarHeight / 2) + 'px';
        floatingControls.style.display = 'flex';

        // 3. Update Icon (Play/Pause state)
        if (mediaElement) {
            if (mediaElement.paused) {
                playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            } else {
                playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            }
        }
    } else {
        // Hide if not a media node or no node selected
        floatingControls.style.display = 'none';
    }
}


/**
 * Adds a new text element to the Konva canvas.
 */
function addTextToCanvas(initialText, size, color, x = 50, y = 150, align = 'left') {
    const newText = new Konva.Text({
        x: x,
        y: y,
        text: initialText,
        fontSize: size,
        fill: color,
        align: align,
        draggable: true,
        name: 'editable-shape',
        wrap: 'word',
        width: stage.width() - 100
    });

    setupTextListeners(newText);
    layer.add(newText);
    layer.batchDraw();
    return newText;
}

function addEmojiToCanvas(emoji) {
    const stage = getStage();
    if (!stage) return;
    const defaultFontSize = 100;

    const textNode = new Konva.Text({
        text: emoji,
        x: stage.width() / 2 - (defaultFontSize / 2),
        y: stage.height() / 2 - (defaultFontSize / 2),
        fontSize: defaultFontSize,
        fill: '#ffffff',
        fontFamily: 'Segoe UI Emoji, Apple Color Emoji, sans-serif',
        draggable: true,
        name: 'editable-shape'
    });

    layer.add(textNode);
    layer.batchDraw();
    saveState();
    selectShape(textNode);
}


/**
 * Adds a new rectangle element to the Konva canvas.
 */
function addRectangleToCanvas(x, y, width, height, color) {
    const newRect = new Konva.Rect({
        x: x,
        y: y,
        width: width,
        height: height,
        fill: color,
        draggable: true,
        name: 'editable-shape'
    });

    // For simplicity, we'll use image listeners for rectangles as they share similar behaviors
    setupImageListeners(newRect);
    layer.add(newRect);
    // Move rectangle to the back
    newRect.zIndex(0);
    layer.batchDraw();
    return newRect;
}

/**
Applies current shape properties to the sidebar.
@param {Konva.Shape | Konva.Node} shape */
function setupSidebar(shape) {
    const opacitySlider = document.getElementById('opacity-slider');
    const opacityValueSpan = document.getElementById('opacity-value');
    const shadowToggle = document.getElementById('shadow-toggle');
    const shadowControls = document.getElementById('shadow-controls');

    // Canvas Color Pickers - (NOTE: Canvas controls not handled here, only shape)
    const canvasColorPicker = document.getElementById('canvas-color-picker');
    const canvasColorHex = document.getElementById('canvas-color-hex');

    // TAB REFERENCES
    const styleButton = document.querySelector('[data-right-target="style-props"]');
    const animButton = document.querySelector('[data-right-target="anim-props"]');
    const textButton = document.querySelector('[data-right-target="text-props"]');

    // --- Phase 1: Reset All ---
    // Hide all content panels
    document.querySelectorAll('.right-tab-content').forEach(el => el.style.display = 'none');
    // Hide all right-sidebar buttons (we will re-show only necessary ones)
    document.querySelectorAll('.sidebar-tabs-right button').forEach(btn => btn.style.display = 'none');
    // De-activate all buttons
    document.querySelectorAll('.sidebar-tabs-right button').forEach(btn => btn.classList.remove('active'));

    // --- Phase 2: Canvas Properties (No shape selected) ---
    if (!shape) {
        // Show all buttons for the default canvas view (assuming Canvas is always shown)
        document.querySelectorAll('.sidebar-tabs-right button').forEach(btn => btn.style.display = 'block');

        // Find the canvas tab and activate it (assuming canvas-props is one of the content IDs)
        const canvasButton = document.querySelector('[data-right-target="canvas-props"]');
        if (canvasButton) {
            canvasButton.click(); // Assuming this click handler activates the content
            canvasButton.classList.add('active');
        }

        // Handle canvas color picker update if needed (Logic omitted for brevity, keeping original JS structure)
        if (canvasColorPicker) {
            const stageColor = stage.container().style.backgroundColor || '#333333';
            canvasColorPicker.value = rgbToHex(stageColor);
            if (canvasColorHex) canvasColorHex.value = rgbToHex(stageColor);
        }

        return; // Exit function
    }

    // --- Phase 3: Shape Properties (Shape IS selected) ---

    // 1. Show Base Tabs (Style and Animation)
    if (styleButton) styleButton.style.display = 'block';
    if (animButton) animButton.style.display = 'block';

    let defaultTabId = 'style-props'; // Default to Style tab content
    let defaultButton = styleButton;

    // 2. Element-specific Tabs
    const isImage = shape.getClassName() === 'Image';
    const isText = shape.getClassName() === 'Text';

    if (isText) {
    if (textButton) {
        textButton.style.display = 'block';
    }

    // Font Family
    document.getElementById('font-family-select').value = shape.fontFamily();

    // Font Color
    const textColor = shape.fill() || '#ffffff';
    document.getElementById('color-picker').value = textColor;
    document.getElementById('color-hex-input').value = textColor;

    // Alignment
    document.querySelectorAll('.btn-align').forEach(btn => btn.classList.remove('active'));
    const currentAlign = shape.align();
    const alignBtn = document.getElementById(`align-${currentAlign}`);
    if (alignBtn) alignBtn.classList.add('active');

    // Line Height
    const lh = shape.lineHeight() || 1.2;
    document.getElementById('line-height-slider').value = lh;
    document.getElementById('line-height-value').textContent = lh.toFixed(1);

    // Letter Spacing
    const ls = shape.letterSpacing() || 0;
    document.getElementById('letter-spacing-slider').value = ls;
    document.getElementById('letter-spacing-value').textContent = ls;

    // Stroke
    const sColor = shape.stroke() || '#000000';
    document.getElementById('stroke-color-picker').value = sColor;
    document.getElementById('stroke-color-hex').value = sColor;

    const sWidth = shape.strokeWidth() || 0;
    document.getElementById('stroke-width-slider').value = sWidth;
    document.getElementById('stroke-width-value').textContent = sWidth;
}

    // 3. Set Active Tab and Content (This fixes the overlap)
    if (defaultButton && defaultButton.classList) {
        defaultButton.classList.add('active');
    }
    const defaultContent = document.getElementById(defaultTabId);
    if (defaultContent) {
        defaultContent.style.display = 'block';
    }

    // 4. Update General Style/Shadow Controls (Visible in Style tab)
    // Opacity
    if (opacitySlider && opacityValueSpan) {
        opacitySlider.value = shape.opacity() * 100;
        opacityValueSpan.textContent = `${Math.round(shape.opacity() * 100)}%`;
    }

    // Shadow
    const hasShadow = shape.shadowEnabled();
    if (shadowToggle) {
        shadowToggle.checked = hasShadow;
    }
    if (shadowControls) {
        shadowControls.style.display = hasShadow ? 'block' : 'none';
        if (hasShadow) {
            document.getElementById('shadow-color').value = shape.shadowColor() || '#000000';
            document.getElementById('shadow-offset-x').value = shape.shadowOffsetX() || 5;
            document.getElementById('shadow-offset-y').value = shape.shadowOffsetY() || 5;
        }
    }
}

/**
 * Removes the current selected shape and transformer, and resets controls.
 */
function deselectShape() {
    const floatingToolbar = document.getElementById('floating-toolbar');
    const floatingControls = document.getElementById('floating-media-controls');

    if (floatingControls) floatingControls.style.display = 'none';

    if (floatingToolbar) floatingToolbar.classList.remove('active');
    selectedShape = null;

    if (transformer) transformer.nodes([]);

    // Hide all type-specific groups
    if (document.getElementById('color-group')) document.getElementById('color-group').style.display = 'none';
    if (document.getElementById('font-group')) document.getElementById('font-group').style.display = 'none';

    // Ensure all controls are reset/unchecked to prevent ghost state
    if (document.getElementById('shadow-toggle')) document.getElementById('shadow-toggle').checked = false;
    if (document.getElementById('animation-select')) document.getElementById('animation-select').value = 'none';

    // Switch back to the default Style tab
    const rightTabs = document.querySelectorAll('.right-sidebar .right-tab-button');
    const rightContents = document.querySelectorAll('.right-sidebar .right-tab-content');

    rightTabs.forEach(btn => btn.classList.remove('active'));
    rightContents.forEach(content => content.classList.remove('active'));

    const styleButton = document.querySelector('[data-right-target="style-props"]');
    const styleContent = document.getElementById('style-props');
    if (styleButton) styleButton.classList.add('active');
    if (styleContent) styleContent.classList.add('active');

    if (layer) layer.batchDraw();
}

/**
 * Initiates in-place text editing for the selected Konva Text node.
 * This is crucial for the template text to be editable.
 */
function startTextEdit(textNode) {
    deselectShape();
    textNode.hide();
    layer.draw();

    const textPosition = textNode.absolutePosition();
    const stageBox = stage.container().getBoundingClientRect();

    const areaPosition = {
        x: stageBox.left + textPosition.x,
        y: stageBox.top + textPosition.y,
    };

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    // Apply styles and content
    textarea.value = textNode.text();
    textarea.style.position = 'absolute';
    textarea.style.top = areaPosition.y + 'px';
    textarea.style.left = areaPosition.x + 'px';
    textarea.style.width = textNode.width() - textNode.padding() * 2 + 'px';
    textarea.style.height = textNode.height() - textNode.padding() * 2 + 'px';
    textarea.style.fontSize = textNode.fontSize() + 'px';
    textarea.style.fontFamily = textNode.fontFamily();
    textarea.style.color = textNode.fill();
    textarea.style.lineHeight = textNode.lineHeight();
    textarea.style.padding = '0px';
    textarea.style.margin = '0px';
    textarea.style.overflow = 'hidden';
    textarea.style.background = 'none';
    textarea.style.border = '1px dashed #05eafa';
    textarea.style.outline = 'none';
    textarea.style.resize = 'none';
    textarea.style.zIndex = 999;

    textarea.focus();

    function removeTextarea() {
        textarea.removeEventListener('blur', removeTextarea);
        textarea.removeEventListener('keydown', handleKeydown);

        textNode.text(textarea.value);
        textNode.show();
        layer.draw();

        document.body.removeChild(textarea);
        saveState();
    }

    function handleKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            removeTextarea();
        }
    }

    textarea.addEventListener('blur', removeTextarea);
    textarea.addEventListener('keydown', handleKeydown);
}
/**
 * Applies a simple animation to a Konva node.
 */
function applyAnimation(node, type) {
    if (!Konva.Tween) return;

    // Stop and destroy any previous animation on this node
    const activeTween = node.getAttr('activeTween');
    if (activeTween) {
        activeTween.pause();
        activeTween.destroy();
        node.setAttr('activeTween', null);
    }

    // Reset properties before applying a new animation
    node.opacity(1);
    node.scaleX(1);
    node.scaleY(1);
    // Restore original position if it was saved
    const originalPos = node.getAttr('originalPos');
    if (originalPos) {
        node.position(originalPos);
    }

    node.setAttr('currentAnimation', type);

    if (type === 'none') {
        node.opacity(1); // Ensure opacity is reset
        layer.batchDraw();
        return;
    }

    if (type === 'fade_jiggle') {
        const originalY = node.y();

        node.opacity(0);

        const fadeIn = new Konva.Tween({
            node: node,
            duration: 0.5,
            opacity: 1,
            easing: Konva.Easings.EaseIn,
            onFinish: () => {
                const jiggle = new Konva.Tween({
                    node: node,
                    duration: 0.8,
                    y: originalY - 10,
                    easing: Konva.Easings.ElasticEaseOut,
                    onFinish: () => {
                        node.y(originalY);
                        layer.batchDraw();
                    }
                });
                node.setAttr('activeTween', jiggle);
                jiggle.play();
            }
        });

        node.setAttr('activeTween', fadeIn);
        fadeIn.play();
    } else if (type === 'slide_in_left') {
        const originalX = node.x();
        node.setAttr('originalPos', { x: originalX, y: node.y() });

        node.x(-node.width());
        node.opacity(0);

        const slideIn = new Konva.Tween({
            node: node,
            duration: 0.6,
            x: originalX,
            opacity: 1,
            easing: Konva.Easings.EaseOut
        });

        node.setAttr('activeTween', slideIn);
        slideIn.play();

    } else if (type === 'zoom_in') {
        node.scaleX(0.1);
        node.scaleY(0.1);
        node.opacity(0);

        const zoomIn = new Konva.Tween({
            node: node,
            duration: 0.5,
            scaleX: 1,
            scaleY: 1,
            opacity: 1,
            easing: Konva.Easings.BackEaseOut
        });

        node.setAttr('activeTween', zoomIn);
        zoomIn.play();
    }
    layer.batchDraw();
}

/**
 * Loads and sets up a new image on the canvas.
 */
function loadAndSetupImage(img) {
    let imgWidth = img.width;
    let imgHeight = img.height;
    const maxWidth = stage.width() * 0.8;
    const maxHeight = stage.height() * 0.8;

    if (imgWidth > maxWidth || imgHeight > maxHeight) {
        const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
        imgWidth *= ratio;
        imgHeight *= ratio;
    }

    const konvaImage = new Konva.Image({
        image: img,
        x: stage.width() / 2 - imgWidth / 2,
        y: stage.height() / 2 - imgHeight / 2,
        width: imgWidth,
        height: imgHeight,
        draggable: true,
        name: 'editable-shape'
    });

    setupImageListeners(konvaImage);
    layer.add(konvaImage);
    layer.batchDraw();
}

/**
 * Creates and adds a Konva Group with an audio icon/visualizer
 * and links it to an HTML Audio element for playback.
 */
function applyAudioToCanvas(audioURL, fileName) {
    const stage = getStage();
    if (!stage) return;

    // 1. Create the actual, invisible HTML audio element
    const audio = new Audio(audioURL);
    audio.loop = true; // Audio is typically looped for background tracks

    // 2. Create the visible Konva element (Icon/Placeholder)
    const size = 60;

    const audioNode = new Konva.Group({
        x: 20,
        y: stage.height() - size - 20,
        width: size,
        height: size,
        draggable: true,
        name: 'editable-shape',
        isMedia: true,
        mediaType: 'audio' // CRUCIAL for floating controls logic
    });

    // Background box
    const bgRect = new Konva.Rect({
        width: size,
        height: size,
        fill: '#4A4A4A',
        cornerRadius: 8,
    });
    audioNode.add(bgRect);

    // Speaker Icon
    const iconText = new Konva.Text({
        text: '🎵', // Music note emoji as icon
        fontSize: 30,
        fill: 'white',
        x: 0,
        y: 0,
        width: size,
        height: size,
        align: 'center',
        verticalAlign: 'middle',
    });
    audioNode.add(iconText);

    audioNode.audioElement = audio; // Store HTML element reference

    // Fix .each not being available on Konva collections in all runtimes.
    // Make the Group itself listen and make children not individually listen to mouse events.
    audioNode.listening(true);
    const children = audioNode.getChildren();
    if (children && typeof children.toArray === 'function') {
        children.toArray().forEach(c => c.listening(false));
    } else if (children && typeof children.forEach === 'function') {
        children.forEach(c => c.listening(false));
    }

    // Add other necessary listeners
    setupImageListeners(audioNode);
    layer.add(audioNode);
    layer.batchDraw();
    saveState();

    selectShape(audioNode);

    // Attempt to play immediately (will be handled by floating controls)
    audio.play().catch(e => console.log("Audio autoplay suppressed/failed:", e));
}

/**
 * Creates and adds a Konva.Image node with an HTML video element as its fill pattern.
 * This simulates a video element on the canvas.
 */
function applyVideoToCanvas(videoURL) {
    const video = document.createElement('video');
    video.src = videoURL;
    video.muted = true; // Videos with sound must be muted to play automatically
    video.loop = true;
    video.autoplay = true;

    // Load video meta data to get dimensions
    video.addEventListener('loadedmetadata', function() {
        let vidWidth = video.videoWidth;
        let vidHeight = video.videoHeight;
        const maxWidth = stage.width();
        const maxHeight = stage.height();

        // Scale down video to fit canvas if necessary
        const ratio = Math.min(maxWidth / vidWidth, maxHeight / vidHeight);
        vidWidth *= ratio;
        vidHeight *= ratio;

        const videoImage = new Konva.Image({
            x: stage.width() / 2 - vidWidth / 2,
            y: stage.height() / 2 - vidHeight / 2,
            width: vidWidth,
            height: vidHeight,
            image: video,
            fill: 'black', // fallback color
            draggable: true,
            name: 'editable-shape',
            isMedia: true,
            mediaType: 'video'
        });
        videoImage.videoElement = video;


        // Set video as fill on the image node to play it
        videoImage.fillPatternImage(video);

        setupImageListeners(videoImage);
        layer.add(videoImage);

        const anim = new Konva.Animation(function () {
            // do nothing, animation just needs to update the layer
        }, layer);

        layer.batchDraw();
        saveState();

        // Start playing the video
        video.play().catch(e => console.error("Video autoplay failed:", e));
        anim.start();

        selectShape(videoImage);
    });
}

function handleDrop(e) {
    e.preventDefault();
    const mockup = document.querySelector('.device-mockup');
    if (mockup) mockup.style.boxShadow = '0 0 0 5px #000, 0 10px 30px rgba(0, 0, 0, 0.5)';

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0].type.match('image.*')) {
        const reader = new FileReader();
        reader.onload = function (event) {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = function() {
                const pos = stage.getPointerPosition();
                const shape = layer.getIntersection(pos);

                if (shape && (shape.id() === 'media-placeholder' || shape.id() === 'image-placeholder' || shape.id() === 'circle-placeholder')) {
                    shape.fill({
                        image: img
                    });
                    layer.batchDraw();
                    saveState();
                } else {
                    loadAndSetupImage(img);
                    saveState();
                }
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(e.dataTransfer.files[0]);
    }
}

// --- Function to toggle media playback (Video/Audio) ---
function toggleMediaPlayback() {
    // 1. Validate the selected element
    if (!selectedNode || !selectedNode.getAttr || !selectedNode.getAttr('mediaType')) return;

    const mediaType = selectedNode.getAttr('mediaType');
    // Determine the underlying HTML media element (audioElement for audio, videoElement for video)
    const mediaElement = mediaType === 'video' ? selectedNode.videoElement : selectedNode.audioElement;
    const playPauseBtn = document.getElementById('canvas-play-pause-btn');
    const playIcon = '<i class="fas fa-play"></i>';
    const pauseIcon = '<i class="fas fa-pause"></i>';

    if (mediaElement) {
        if (mediaElement.paused) {
            // Play media and catch potential Autoplay Policy errors
            mediaElement.play().catch(e => console.error("Media play failed (Autoplay Policy?):", e));
            // Update button icon to PAUSE
            if (playPauseBtn) playPauseBtn.innerHTML = pauseIcon;
        } else {
            mediaElement.pause();
            // Update button icon to PLAY
            if (playPauseBtn) playPauseBtn.innerHTML = playIcon;
        }
    }
}

/**
 * Toggles bold style for a selected text node.
 */
function toggleTextBold() {
    if (selectedShape && selectedShape.getClassName() === 'Text') {
        const currentStyle = selectedShape.fontStyle() || 'normal';
        const isBold = currentStyle.includes('bold');
        const isItalic = currentStyle.includes('italic');

        let newStyle;
        if (isBold) {
            newStyle = isItalic ? 'italic' : 'normal';
        } else {
            newStyle = isItalic ? 'bold italic' : 'bold';
        }
        selectedShape.fontStyle(newStyle);
        layer.batchDraw();
    }
}

function toggleTextItalic() {
    if (selectedShape && selectedShape.getClassName() === 'Text') {
        const currentStyle = selectedShape.fontStyle() || 'normal';
        const isBold = currentStyle.includes('bold');
        const isItalic = currentStyle.includes('italic');

        let newStyle;
        if (isItalic) {
            newStyle = isBold ? 'bold' : 'normal';
        } else {
            newStyle = isBold ? 'bold italic' : 'italic';
        }
        selectedShape.fontStyle(newStyle);
        layer.batchDraw();
    }
}

function increaseFontSize() {
    if (selectedShape && selectedShape.getClassName() === 'Text') {
        selectedShape.fontSize(selectedShape.fontSize() + 2);
        layer.batchDraw();
    }
}

function deleteSelectedShape() {
    if (selectedShape) {
        transformer.nodes([]);
        selectedShape.destroy();
        selectedShape = null;
        document.getElementById('floating-toolbar').classList.remove('active');
        layer.batchDraw();
    }
}

function duplicateSelectedShape() {
    if (selectedShape) {
        const clone = selectedShape.clone();
        clone.x(selectedShape.x() + 20);
        clone.y(selectedShape.y() + 20);
        clone.name('editable-shape');

        if (clone.getClassName() === 'Text') {
            setupTextListeners(clone);
        } else {
            setupImageListeners(clone);
        }

        layer.add(clone);
        deselectShape();
        layer.batchDraw();
    }
}

/**
 * Exports the Konva stage as a PNG image and triggers a download.
 */
function exportCanvas() {
    if (!stage) return;

    // Temporarily hide the transformer
    if (transformer) transformer.nodes([]);
    layer.batchDraw();

    const dataURL = stage.toDataURL({
        pixelRatio: 3, // Export at 3x resolution for high quality
        mimeType: 'image/png'
    });

    // Restore transformer
    if (transformer && selectedShape) transformer.nodes([selectedShape]);
    layer.batchDraw();

    // Trigger download
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = 'twin-clouds-design.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Simulates posting the content to a social media API.
 */
function simulatePost() {
    alert("Connecting to Social Media API...");
    // Simulate a delay for the API call
    setTimeout(() => {
        alert("Post Scheduled!");
    }, 1500);
}

function resizeCanvas(newWidth, newHeight) {
    const mockup = document.querySelector('.device-mockup');
    if (mockup) {
        mockup.style.width = `${newWidth}px`;
        mockup.style.height = `${newHeight}px`;
    }

    if (stage) {
        stage.width(newWidth);
        stage.height(newHeight);
    }

    if (layer) layer.batchDraw();
}

function setupSidebarTabs(buttonSelector, contentSelector) {
    const tabs = document.querySelectorAll(`${buttonSelector} button`);
    const contents = document.querySelectorAll(contentSelector);

    tabs.forEach(button => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.target || button.dataset.rightTarget;

            tabs.forEach(btn => btn.classList.remove('active'));
            contents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            const targetElement = document.getElementById(targetId);
            if (targetElement) targetElement.classList.add('active');
        });
    });
}

function handleRightTabClick(event) {
    const targetButton = event.currentTarget;
    const targetId = targetButton.getAttribute('data-right-target');

    // Deactivate all buttons and hide all content
    document.querySelectorAll('.sidebar-tabs-right button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.right-tab-content').forEach(el => el.style.display = 'none');

    // Activate the clicked button and show the corresponding content
    targetButton.classList.add('active');
    const targetContent = document.getElementById(targetId);
    if (targetContent) {
        targetContent.style.display = 'block';
    }
}


// =========================================================
// ⚡️ TEMPLATE DATA & FUNCTIONS
// =========================================================

// =========================================================
// ⚡️ TEMPLATE DATA DEFINITIONS (All 5 Templates)
// =========================================================

const TEMPLATE_DATA = {

  carousel1: {
    className: "Layer",
    children: [
      { className: "Image", attrs: { src: "assets/templates/carousel1.jpg", width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }, isBackground: true, id: "bg" },
      { className: "Text", text: "YOUR HEADLINE", x: 40, y: 80, fontSize: 38, fill: "#FFFFFF", fontFamily: "Bebas Neue", draggable: true, id: "headline" },
      { className: "Text", text: "Your subtitle goes here", x: 40, y: 140, width: DEFAULT_WIDTH - 80, fontSize: 18, fill: "#FFFFFF", fontFamily: "Raleway", draggable: true, id: "subtitle" }
    ]
  },

  carousel2: {
    className: "Layer",
    children: [
      { className: "Image", attrs: { src: "assets/templates/carousel2.jpg", width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }, isBackground: true, id: "bg" },
      { className: "Text", text: "MAIN TITLE", x: 40, y: 70, fontSize: 40, fill: "#FFFFFF", fontFamily: "Oswald", draggable: true, id: "title" },
      { className: "Text", text: "Secondary text here", x: 40, y: 150, width: DEFAULT_WIDTH - 80, fontSize: 18, fill: "#F2F2F2", fontFamily: "Raleway", draggable: true, id: "body" }
    ]
  },

  carousel3: {
    className: "Layer",
    children: [
      { className: "Image", attrs: { src: "assets/templates/carousel3.jpg", width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }, isBackground: true, id: "bg" },
      { className: "Text", text: "QUOTE TITLE", x: 40, y: 60, fontSize: 34, fill: "#FFFFFF", fontFamily: "Anton", draggable: true, id: "quote_title" },
      { className: "Text", text: "Supporting text here", x: 40, y: 140, width: DEFAULT_WIDTH - 80, fontSize: 18, fill: "#FFFFFF", fontFamily: "Raleway", draggable: true, id: "quote_body" }
    ]
  },

  carousel4: {
    className: "Layer",
    children: [
      { className: "Image", attrs: { src: "assets/templates/carousel4.jpg", width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }, isBackground: true, id: "bg" },
      { className: "Text", text: "CALL TO ACTION", x: 40, y: 70, fontSize: 42, fill: "#FFFFFF", fontFamily: "Oswald", draggable: true, id: "cta_title" },
      { className: "Rect", x: 40, y: 150, width: 180, height: 50, cornerRadius: 8, fill: "#FFB531", draggable: true, id: "cta_rect" },
      { className: "Text", text: "LEARN MORE", x: 60, y: 162, fontSize: 20, fill: "#141414", fontFamily: "Anton", draggable: true, id: "cta_text" }
    ]
  }

};

async function loadTemplate(templateKey) {
    const template = TEMPLATE_DATA[templateKey];
    if (!template) {
        console.error(`Template "${templateKey}" not found`);
        return;
    }

    // Clear the layer and reset state
    layer.destroyChildren();
    transformer = new Konva.Transformer(); // Re-add transformer
    layer.add(transformer);
    deselectShape();

    const imageNodesData = template.children.filter(node => node.className === 'Image');
    const otherNodesData = template.children.filter(node => node.className !== 'Image');

    // Create promises for loading all images using Konva's built-in method
    const imageLoadPromises = imageNodesData.map(nodeData => {
        return new Promise((resolve, reject) => {
            Konva.Image.fromURL(
                nodeData.attrs.src,
                (konvaImage) => {
                    konvaImage.setAttrs({
                        ...nodeData.attrs,
                        name: 'editable-shape',
                        id: nodeData.id,
                        isBackground: nodeData.isBackground
                    });
                    layer.add(konvaImage);
                    setupImageListeners(konvaImage);
                    if (nodeData.isBackground) {
                        konvaImage.moveToBottom();
                    }
                    resolve(konvaImage);
                },
                (err) => reject(`Failed to load image at ${nodeData.attrs.src}`)
            );
        });
    });

    // Add non-image nodes synchronously
    otherNodesData.forEach(nodeData => {
        const NodeClass = Konva[nodeData.className];
        if (NodeClass) {
            const config = { ...nodeData, name: 'editable-shape' };
            delete config.className;
            const node = new NodeClass(config);

            if (node instanceof Konva.Text) {
                setupTextListeners(node);
            } else {
                setupImageListeners(node); // For Rect, etc.
            }
            layer.add(node);
        }
    });

    // Wait for all images to load and then finalize the canvas
    try {
        await Promise.all(imageLoadPromises);
        layer.batchDraw();
        saveState();

        const shapes = layer.find('.editable-shape').filter(n => !n.getAttr('isBackground'));
        if (shapes.length > 0) {
            selectShape(shapes[0]);
        }

        // Dispatch a custom event to signal that the template is fully loaded
        stage.container().dispatchEvent(new CustomEvent('images-loaded'));
    } catch (error) {
        console.error("Error loading one or more template images:", error);
    }
}


// =========================================================
// ⚡️ MAIN INITIALIZATION & KONVA SETUP
// =========================================================

function bindVideoUploadHandlers() {
    const videoInput = document.getElementById('video-input');
    const uploadVideoBtn = document.getElementById('upload-video-btn');

    // This block MUST be run now, after the sidebar:loaded event
    if (uploadVideoBtn && videoInput) {
        uploadVideoBtn.addEventListener('click', () => {
            videoInput.click();
        });

        videoInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const videoURL = URL.createObjectURL(file);
                document.dispatchEvent(
                    new CustomEvent('video:apply', {
                        detail: {
                            url: videoURL
                        }
                    })
                );
                e.target.value = null;
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', initEditor);

function initEditor() {

  // Injected listener to apply templates from sidebar
  document.addEventListener('template:apply', function(e) {
    const url = e.detail && e.detail.url;
    if (!url) return;
    console.log('Editor received template request for:', url);
    if (typeof loadTemplateFromURL === 'function') {
      loadTemplateFromURL(url);
    } else {
      console.error('loadTemplateFromURL not defined.');
    }
  });



    // --- Konva Initialization ---
    function initKonva(width, height) {
        container = document.getElementById('editor-canvas-container'); // Must match the ID in editor.html
        if (!container) {
            console.error("Konva canvas container 'editor-canvas-container' not found. Stage failed to initialize.");
            return;
        }

        stage = new Konva.Stage({
            container: 'editor-canvas-container',
            width: width,
            height: height,
            draggable: true
        });

        layer = new Konva.Layer();
        stage.add(layer);

        transformer = new Konva.Transformer();
        layer.add(transformer);

        addTextToCanvas('Welcome to Twin Clouds Editor!', 30, '#FFFFFF', 30, 100);

        saveState();

        stage.on('click tap', function (e) {
            if (e.target === stage || !e.target.hasName('editable-shape')) {
                deselectShape();
            }
        });
    }

    // DOM ELEMENT REFERENCES
    mockup = document.querySelector('.device-mockup');
    const presetSizeSelect = document.getElementById('preset-size');
    const mediaUploadInput = document.getElementById('media-upload');
    const uploadBtn = document.getElementById('upload-btn');
    const opacitySlider = document.getElementById('opacity-slider');
    const colorPicker = document.getElementById('color-picker');
    const colorHexInput = document.getElementById('color-hex-input');
    const fontFamilySelect = document.getElementById('font-family-select');
    const shadowToggle = document.getElementById('shadow-toggle');
    const animationSelect = document.getElementById('animation-select');
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const exportBtn = document.querySelector('.btn-export');
    const postBtn = document.querySelector('.btn-post');


    // --- Core Initialization ---
    initKonva(DEFAULT_WIDTH, DEFAULT_HEIGHT);
    setupEventListeners();

    // =========================================================
    // 2. 🎨 Event Listeners Setup
    // =========================================================

    function setupEventListeners() {

        setupSidebarTabs('.sidebar-tabs', '.left-sidebar .tab-content');

        document.querySelectorAll('.sidebar-tabs-right .right-tab-button').forEach(button => {
            button.addEventListener('click', handleRightTabClick);
        });

        // --- Right Sidebar Controls ---
        if (opacitySlider) {
            opacitySlider.addEventListener('input', function() {
                if (selectedShape) {
                    selectedShape.opacity(parseFloat(this.value) / 100);
                    setupSidebar(selectedShape);
                    layer.batchDraw();
                }
            });
            opacitySlider.addEventListener('change', saveState);
        }

        if (colorPicker) colorPicker.addEventListener('change', function() {
            if (selectedShape && selectedShape.getClassName() === 'Text') {
                selectedShape.fill(this.value);
                const hexInput = document.getElementById('color-hex-input');
                if (hexInput) hexInput.value = this.value.toUpperCase();
                layer.batchDraw();
                saveState();
            }
        });
        if (colorHexInput) colorHexInput.addEventListener('change', function() {
            if (selectedShape && selectedShape.getClassName() === 'Text') {
                selectedShape.fill(this.value);
                const colorP = document.getElementById('color-picker');
                if (colorP) colorP.value = this.value.toUpperCase();
                layer.batchDraw();
                saveState();
            }
        });
        if (fontFamilySelect) {
            fontFamilySelect.addEventListener('change', function() {
                if (selectedShape && selectedShape.getClassName() === 'Text') {
                    selectedShape.fontFamily(this.value);
                    layer.batchDraw();
                    saveState();
                }
            });
        }

//// TEXT ALIGNMENT
['left', 'center', 'right'].forEach(align => {
    const btn = document.getElementById(`align-${align}`);
    if (!btn) return;
    btn.addEventListener('click', () => {
        if (selectedShape && selectedShape.getClassName() === 'Text') {
            selectedShape.align(align);
            document.querySelectorAll('.btn-align').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            layer.batchDraw();
            saveState();
        }
    });
});

//// LINE HEIGHT
const lhSlider = document.getElementById('line-height-slider');
const lhValue = document.getElementById('line-height-value');
if (lhSlider) {
    lhSlider.addEventListener('input', function () {
        if (selectedShape && selectedShape.getClassName() === 'Text') {
            const v = parseFloat(this.value);
            selectedShape.lineHeight(v);
            lhValue.textContent = v.toFixed(1);
            layer.batchDraw();
        }
    });
    lhSlider.addEventListener('change', saveState);
}

//// LETTER SPACING
const lsSlider = document.getElementById('letter-spacing-slider');
const lsValue = document.getElementById('letter-spacing-value');
if (lsSlider) {
    lsSlider.addEventListener('input', function () {
        if (selectedShape && selectedShape.getClassName() === 'Text') {
            const v = parseInt(this.value, 10);
            selectedShape.letterSpacing(v);
            lsValue.textContent = v;
            layer.batchDraw();
        }
    });
    lsSlider.addEventListener('change', saveState);
}

//// STROKE COLOR & WIDTH
const strokePicker = document.getElementById('stroke-color-picker');
const strokeHex = document.getElementById('stroke-color-hex');

function updateStrokeColor(color) {
    if (selectedShape && selectedShape.getClassName() === 'Text') {
        selectedShape.stroke(color);
        layer.batchDraw();
    }
}

if (strokePicker) {
    strokePicker.addEventListener('input', function () {
        updateStrokeColor(this.value);
        strokeHex.value = this.value;
    });
    strokePicker.addEventListener('change', saveState);
}

if (strokeHex) {
    strokeHex.addEventListener('change', function () {
        updateStrokeColor(this.value);
        strokePicker.value = this.value;
        saveState();
    });
}

const sWidthSlider = document.getElementById('stroke-width-slider');
const sWidthValue = document.getElementById('stroke-width-value');
if (sWidthSlider) {
    sWidthSlider.addEventListener('input', function () {
        if (selectedShape && selectedShape.getClassName() === 'Text') {
            const v = parseInt(this.value, 10);
            selectedShape.strokeWidth(v);
            sWidthValue.textContent = v;
            layer.batchDraw();
        }
    });
    sWidthSlider.addEventListener('change', saveState);
}

        // Shadow Toggle Logic - working
        if (shadowToggle) {
            shadowToggle.addEventListener('change', function() {
                if (selectedShape) {
                    if (this.checked) {
                        selectedShape.shadowEnabled(true);
                        selectedShape.shadowColor('black');
                        selectedShape.shadowBlur(10);
                        selectedShape.shadowOffset({ x: 5, y: 5 });
                        selectedShape.shadowOpacity(0.5);
                    } else {
                        selectedShape.shadowEnabled(false);
                        selectedShape.shadowColor(null);
                        selectedShape.shadowBlur(0);
                        selectedShape.shadowOffset({ x: 0, y: 0 });
                        selectedShape.shadowOpacity(0);
                    }
                    // Must call cache() on images for shadow to appear correctly
                    if (selectedShape.getClassName() === 'Image') selectedShape.cache();
                    layer.batchDraw();
                    saveState();
                } else {
                    this.checked = false;
                }
            });
        }

        const shadowColor = document.getElementById('shadow-color');
        if (shadowColor) shadowColor.addEventListener('input', function() {
            if (selectedShape) {
                selectedShape.shadowColor(this.value);
                layer.draw();
                saveState();
            }
        });
        const shadowBlur = document.getElementById('shadow-blur');
        if (shadowBlur) shadowBlur.addEventListener('input', function() {
            if (selectedShape) {
                selectedShape.shadowBlur(parseFloat(this.value));
                layer.draw();
                saveState();
            }
        });
        const shadowOffsetX = document.getElementById('shadow-offset-x');
        if (shadowOffsetX) shadowOffsetX.addEventListener('input', function() {
            if (selectedShape) {
                selectedShape.shadowOffsetX(parseFloat(this.value));
                layer.draw();
                saveState();
            }
        });
        const shadowOffsetY = document.getElementById('shadow-offset-y');
        if (shadowOffsetY) shadowOffsetY.addEventListener('input', function() {
            if (selectedShape) {
                selectedShape.shadowOffsetY(parseFloat(this.value));
                layer.draw();
                saveState();
            }
        });

        // Animation Select Listener - working
        if (animationSelect) {
            animationSelect.addEventListener('change', function() {
                if (selectedShape) {
                    applyAnimation(selectedShape, this.value);
                    saveState();
                }
            });
        }

        // --- Floating Toolbar Logic ---
        const floatDelete = document.getElementById('float-delete');
        if (floatDelete) floatDelete.addEventListener('click', () => { deleteSelectedShape(); saveState(); });
        const floatDuplicate = document.getElementById('float-duplicate');
        if (floatDuplicate) floatDuplicate.addEventListener('click', () => { duplicateSelectedShape(); saveState(); });
        const floatBold = document.getElementById('float-bold');
        if (floatBold) floatBold.addEventListener('click', () => { toggleTextBold(); saveState(); });
        const floatItalic = document.getElementById('float-italic');
        if (floatItalic) floatItalic.addEventListener('click', () => { toggleTextItalic(); saveState(); });
        const floatSize = document.getElementById('float-size');
        if (floatSize) floatSize.addEventListener('click', () => { increaseFontSize(); saveState(); });
        const floatToFront = document.getElementById('float-to-front');
        if (floatToFront) floatToFront.addEventListener('click', () => {
            if (selectedShape) {
                selectedShape.moveToTop();
                layer.draw();
                saveState();
            }
        });
        const floatToBack = document.getElementById('float-to-back');
        if (floatToBack) floatToBack.addEventListener('click', () => {
            if (selectedShape) {
                selectedShape.moveToBottom();
                layer.draw();
                saveState();
            }
        });

        // --- Keyboard Listeners ---
        window.addEventListener('keydown', function(e) {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedShape) {
                    deleteSelectedShape();
                    saveState();
                }
            }
        });

        // --- Content Adding ---
        document.querySelectorAll('#text .asset-card').forEach(card => {
            card.addEventListener('click', function() {
                const type = this.dataset.textType;
                let size = type === 'heading' ? 36 : 18;
                let text = type === 'heading' ? 'Click to Edit Headline' : 'Add supporting text here...';
                addTextToCanvas(text, size, '#FFFFFF');
                saveState();
            });
        });
        document.addEventListener('sidebar:loaded', () => {
            document.querySelectorAll('.emoji-btn').forEach(button => {
                button.addEventListener('click', function() {
                    const emoji = this.getAttribute('data-emoji');
                    if (emoji) {
                        addEmojiToCanvas(emoji);
                    }
                });
            });
        });


        if (uploadBtn) uploadBtn.addEventListener('click', () => { mediaUploadInput.click(); });

        if (mediaUploadInput) mediaUploadInput.addEventListener('change', function(e) {
            if (e.target.files.length > 0 && e.target.files[0].type.match('image.*')) {
                const reader = new FileReader();
                reader.onload = function (event) {
                    const img = new Image();
                    img.crossOrigin = 'Anonymous';
                    img.onload = function() { loadAndSetupImage(img); saveState(); };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        });

        // Templates
        document.querySelectorAll('.template-item').forEach(item => {
            item.addEventListener('click', function() {
                const templateId = this.dataset.templateId;
                if (templateId) {
                    loadTemplate(templateId);
                }
            });
        });


        // --- Canvas Resizing & Controls ---
        if (presetSizeSelect) presetSizeSelect.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            resizeCanvas(parseInt(selectedOption.dataset.w), parseInt(selectedOption.dataset.h));
        });

        if (document.getElementById('zoom-in')) document.getElementById('zoom-in').addEventListener('click', () => {
            if (stage.scaleX() < 2) stage.scale({ x: stage.scaleX() * 1.1, y: stage.scaleY() * 1.1 });
            if (stage) stage.batchDraw();
        });

        if (document.getElementById('zoom-out')) document.getElementById('zoom-out').addEventListener('click', () => {
            if (stage.scaleX() > 0.5) stage.scale({ x: stage.scaleX() * 0.9, y: stage.scaleY() * 0.9 });
            if (stage) stage.batchDraw();
        });

        // Undo/Redo Listeners - working
        if (undoBtn) undoBtn.addEventListener('click', () => loadState(true));
        if (redoBtn) redoBtn.addEventListener('click', () => loadState(false));

        // --- Export Listener ---
        if (exportBtn) exportBtn.addEventListener('click', exportCanvas);

        // --- VIDEO UPLOAD LISTENER ---
        document.addEventListener('sidebar:loaded', bindVideoUploadHandlers);

        // **NEW LISTENER TO DISPLAY VIDEO**
        document.addEventListener('video:apply', function(e) {
            const url = e.detail && e.detail.url;
            if (url && typeof applyVideoToCanvas === 'function') {
                applyVideoToCanvas(url);
            } else {
                console.error('applyVideoToCanvas not defined or video URL missing.');
            }
        });

        // --- ON-CANVAS MEDIA CONTROL LISTENERS (Play/Pause & Delete) ---
        const playPauseBtn = document.getElementById('canvas-play-pause-btn');
        const deleteBtn = document.getElementById('canvas-delete-btn');

        if (playPauseBtn) {
			playPauseBtn.addEventListener('click', toggleMediaPlayback);
		}


        if (deleteBtn) deleteBtn.addEventListener('click', () => {
            // Safety check
            if (!selectedNode || !selectedNode.getAttr('isMedia')) return;

            const mediaType = selectedNode.getAttr('mediaType');
            const mediaElement = mediaType === 'video' ? selectedNode.videoElement : selectedNode.audioElement;

            // 1. Stop & clear HTML element
            if (mediaElement) {
                mediaElement.pause();
                mediaElement.removeAttribute('src');
                mediaElement.load();
            }

            // 2. Clear Konva Transformer handles
            // Assuming the active Transformer is named 'transformer' (not imageTransformer)
            if (transformer) {
                transformer.nodes([]);
                layer.draw();
            }

            // 3. Remove Konva node
            selectedNode.destroy();
            selectedNode = null;

            // 4. Hide HTML Floating Controls
            updateFloatingControls(null);
            layer.draw();
            saveState();
        });
        // --- Post Listener ---
        if (postBtn) postBtn.addEventListener('click', simulatePost);

        // --- Drag and Drop Setup ---
        if (container) {
            container.addEventListener('dragover', function (e) {
                e.preventDefault();
                if (mockup) mockup.style.boxShadow = '0 0 0 5px #05eafa, 0 10px 30px rgba(0, 0, 0, 0.5)';
            });

            container.addEventListener('dragleave', function (e) {
                if (mockup) mockup.style.boxShadow = '0 0 0 5px #000, 0 10px 30px rgba(0, 0, 0, 0.5)';
            });

            container.addEventListener('drop', handleDrop);
        }

    } // End of setupEventListeners

} // End of initEditor